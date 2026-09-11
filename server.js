// ===== 网页版联机服务器 =====
// 作用：把「双人游戏合集」搬到网页上玩 —— 自己托管网页 + 转发房间消息
// 零依赖：只用 Node 自带模块，WebSocket 的握手与编解码都在这个文件里自己实现
//
// 启动：node server.js       （默认端口 8080，可用环境变量 PORT 改）
// 同一个 Wi-Fi 下，手机浏览器打开 http://电脑的IP:8080 就能和朋友一起玩
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ids = require('./utils/id.js');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 8080;
const AUTO_START_DELAY = 1200;   // 全员准备后再等一小会儿开局（和云开发版一致）
const MAX_SEATS = 4;

// ---------- 静态文件：只对外开放这几个目录，别把 .git 之类的东西露出去 ----------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.mp3': 'audio/mpeg', '.ico': 'image/x-icon'
};
const OPEN_DIRS = ['minigame/', 'games/', 'services/', 'utils/', 'web/'];
const OPEN_FILES = ['game.js', 'config.js'];

function readable(rel) {
  if (OPEN_FILES.indexOf(rel) >= 0) return true;
  for (let i = 0; i < OPEN_DIRS.length; i++) {
    if (rel.indexOf(OPEN_DIRS[i]) === 0) return true;
  }
  return false;
}

function sendFile(req, res) {
  let rel = decodeURIComponent(String(req.url || '/').split('?')[0]);
  if (rel === '/' || rel === '') rel = '/web/index.html';
  rel = rel.replace(/^\/+/, '');
  const file = path.resolve(ROOT, rel);
  if (file.indexOf(ROOT) !== 0 || !readable(path.relative(ROOT, file).replace(/\\/g, '/'))) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 没有这个文件');
    return;
  }
  fs.readFile(file, function (err, buf) {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 没有这个文件');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(buf);
  });
}

// ---------- WebSocket：握手 + 帧编解码（只实现游戏用得到的部分） ----------
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const OP_TEXT = 1, OP_CLOSE = 8, OP_PING = 9, OP_PONG = 10;

function encodeFrame(payload, opcode) {
  const len = payload.length;
  let head;
  if (len < 126) {
    head = Buffer.allocUnsafe(2);
    head[1] = len;
  } else if (len < 65536) {
    head = Buffer.allocUnsafe(4);
    head[1] = 126;
    head.writeUInt16BE(len, 2);
  } else {
    head = Buffer.allocUnsafe(10);
    head[1] = 127;
    head.writeBigUInt64BE(BigInt(len), 2);
  }
  head[0] = 0x80 | opcode;
  return Buffer.concat([head, payload]);
}

// 从一个缓冲区里切出一帧；数据还不够就返回 null，等下一个包
function readFrame(buf) {
  if (buf.length < 2) return null;
  const fin = (buf[0] & 0x80) !== 0;
  const opcode = buf[0] & 0x0f;
  const masked = (buf[1] & 0x80) !== 0;
  let len = buf[1] & 0x7f;
  let off = 2;
  if (len === 126) {
    if (buf.length < 4) return null;
    len = buf.readUInt16BE(2);
    off = 4;
  } else if (len === 127) {
    if (buf.length < 10) return null;
    len = Number(buf.readBigUInt64BE(2));
    off = 10;
  }
  let mask = null;
  if (masked) {
    if (buf.length < off + 4) return null;
    mask = buf.subarray(off, off + 4);
    off += 4;
  }
  if (buf.length < off + len) return null;
  let payload = buf.subarray(off, off + len);
  if (masked) {
    const out = Buffer.allocUnsafe(len);
    for (let i = 0; i < len; i++) out[i] = payload[i] ^ mask[i & 3];
    payload = out;
  }
  return { fin: fin, opcode: opcode, payload: payload, size: off + len };
}

function Conn(socket) {
  this.socket = socket;
  this.buf = Buffer.alloc(0);
  this.frag = [];
  this.closed = false;
  this.room = null;
  this.id = '';
  this.onMessage = null;
  this.onClose = null;
  const self = this;
  socket.on('data', function (chunk) { self._data(chunk); });
  socket.on('close', function () { self._gone(); });
  socket.on('error', function () { self._gone(); });
}

Conn.prototype.send = function (text) {
  if (this.closed) return;
  try { this.socket.write(encodeFrame(Buffer.from(text, 'utf8'), OP_TEXT)); } catch (e) {}
};

Conn.prototype.close = function () {
  if (this.closed) return;
  this.closed = true;
  try { this.socket.end(encodeFrame(Buffer.alloc(0), OP_CLOSE)); } catch (e) {}
  this._gone();
};

Conn.prototype._gone = function () {
  if (this.dead) return;
  this.dead = true;
  this.closed = true;
  if (this.onClose) this.onClose();
};

Conn.prototype._data = function (chunk) {
  this.buf = Buffer.concat([this.buf, chunk]);
  for (;;) {
    const f = readFrame(this.buf);
    if (!f) return;
    this.buf = this.buf.subarray(f.size);
    if (f.opcode === OP_CLOSE) { this.close(); return; }
    if (f.opcode === OP_PING) { this.socket.write(encodeFrame(f.payload, OP_PONG)); continue; }
    if (f.opcode === OP_PONG) continue;
    if (f.opcode === OP_TEXT || f.opcode === 2) {
      if (f.fin) this._msg(f.payload);
      else this.frag = [f.payload];
      continue;
    }
    if (f.opcode === 0) {           // 续帧：拼起来再交给业务
      this.frag.push(f.payload);
      if (f.fin) { this._msg(Buffer.concat(this.frag)); this.frag = []; }
    }
  }
};

Conn.prototype._msg = function (buf) {
  if (this.onMessage) this.onMessage(buf.toString('utf8'));
};

// ---------- 房间 ----------
const rooms = new Map();     // 房间码 -> 房间

function clampSeats(n, max) {
  const k = Math.round(Number(n));
  if (!isFinite(k) || k <= 0) return max;
  return Math.max(2, Math.min(max, k));
}

function send(conn, obj) {
  if (conn) conn.send(JSON.stringify(obj));
}

function seatOf(room, id) {
  for (let i = 0; i < room.players.length; i++) {
    if (room.players[i].id === id) return room.players[i];
  }
  return null;
}

function allReady(room) {
  if (!room.players.length) return false;
  for (let i = 0; i < room.players.length; i++) {
    if (!room.players[i].ready) return false;
  }
  return true;
}

// 交给界面的房间状态（字段和云开发版完全一致，界面层不用改）
function publicState(room, forId) {
  let at = -1;
  const players = [];
  for (let i = 0; i < room.players.length; i++) {
    const p = room.players[i];
    if (p.id === forId) at = i;
    players.push({ id: p.id, name: p.name, avatar: p.avatar, ready: !!p.ready, self: p.id === forId });
  }
  return {
    roomCode: room.code,
    gameId: room.gameId,
    isHost: room.hostId === forId,
    status: room.status,
    myIndex: at < 0 ? 0 : at,
    minPlayers: room.minPlayers,
    maxPlayers: room.maxPlayers,
    players: players,
    count: room.players.length,
    full: room.players.length >= room.maxPlayers,
    allReady: allReady(room),
    starting: !!room.timer
  };
}

function broadcastState(room) {
  for (let i = 0; i < room.players.length; i++) {
    send(room.players[i].conn, { t: 'state', state: publicState(room, room.players[i].id) });
  }
}

function broadcast(room, obj, exceptId) {
  for (let i = 0; i < room.players.length; i++) {
    if (exceptId && room.players[i].id === exceptId) continue;
    send(room.players[i].conn, obj);
  }
}

function startRoom(room) {
  if (room.timer) { clearTimeout(room.timer); room.timer = null; }
  room.status = 'playing';
  broadcastState(room);
  for (let i = 0; i < room.players.length; i++) send(room.players[i].conn, { t: 'start' });
}

function maybeAutoStart(room) {
  if (room.status !== 'waiting' || room.timer) return;
  if (room.players.length < room.minPlayers) return;
  if (!allReady(room)) return;
  room.timer = setTimeout(function () {
    room.timer = null;
    if (room.status === 'waiting') startRoom(room);
  }, AUTO_START_DELAY);
  broadcastState(room);
}

function removePlayer(room, id) {
  let at = -1;
  for (let i = 0; i < room.players.length; i++) {
    if (room.players[i].id === id) { at = i; break; }
  }
  if (at < 0) return null;
  const who = room.players[at];
  room.players.splice(at, 1);
  if (!room.players.length) {
    if (room.timer) clearTimeout(room.timer);
    rooms.delete(room.code);
    return who;
  }
  if (room.hostId === id) {
    if (room.timer) { clearTimeout(room.timer); room.timer = null; }
    room.status = 'ended';
    broadcast(room, { t: 'peerLeft', id: id, name: who.name });
    broadcast(room, { t: 'err', text: '房主已离开房间' });
    broadcastState(room);
  } else {
    broadcast(room, { t: 'peerLeft', id: id, name: who.name });
    broadcastState(room);
    maybeAutoStart(room);
  }
  return who;
}

// ---------- 协议 ----------
function doCreate(conn, msg) {
  const self = msg.self || {};
  const id = String(self.id || '');
  if (!id) { send(conn, { t: 'err', text: '身份信息缺失，刷新页面重试' }); return; }
  let code = ids.roomCode();
  while (rooms.has(code)) code = ids.roomCode();
  const maxPlayers = clampSeats(msg.maxPlayers, MAX_SEATS);
  const minPlayers = Math.min(maxPlayers, clampSeats(msg.minPlayers === undefined ? 2 : msg.minPlayers, MAX_SEATS));
  const room = {
    code: code,
    gameId: msg.gameId,
    hostId: id,
    minPlayers: minPlayers,
    maxPlayers: maxPlayers,
    status: 'waiting',
    timer: null,
    players: [{
      id: id, name: self.name || '房主', avatar: self.avatar || '🦊', ready: false, conn: conn
    }]
  };
  rooms.set(code, room);
  conn.room = room;
  conn.id = id;
  send(conn, { t: 'ok', kind: 'create', roomCode: code, isHost: true });
  broadcastState(room);
}

function doJoin(conn, msg) {
  const self = msg.self || {};
  const id = String(self.id || '');
  if (!id) { send(conn, { t: 'err', text: '身份信息缺失，刷新页面重试' }); return; }
  const room = rooms.get(String(msg.roomCode || '').toUpperCase());
  if (!room) { send(conn, { t: 'err', text: '没有找到这个房间，请确认房间号是否正确' }); return; }
  if (msg.gameId && room.gameId !== msg.gameId) { send(conn, { t: 'err', text: '房间内的游戏与你选择的不一致' }); return; }
  const mine = seatOf(room, id);
  if (room.status !== 'waiting') { send(conn, { t: 'err', text: '房间已开始或已结束，无法加入' }); return; }
  if (!mine && room.players.length >= room.maxPlayers) {
    send(conn, { t: 'err', text: '房间满了（最多 ' + room.maxPlayers + ' 人）' });
    return;
  }
  if (mine) {
    mine.conn = conn;                       // 同一个人的旧连接掉了，接着坐原来的位置
    if (self.name) mine.name = self.name;
  } else {
    room.players.push({
      id: id, name: self.name || '好友', avatar: self.avatar || '😀', ready: false, conn: conn
    });
  }
  conn.room = room;
  conn.id = id;
  send(conn, { t: 'ok', kind: 'join', roomCode: room.code, isHost: room.hostId === id });
  broadcastState(room);
  maybeAutoStart(room);
}

function handle(conn, msg) {
  if (!msg || typeof msg !== 'object') return;
  if (msg.t === 'create') { doCreate(conn, msg); return; }
  if (msg.t === 'join') { doJoin(conn, msg); return; }

  const room = conn.room;
  if (!room) return;
  if (msg.t === 'ready') {
    const mine = seatOf(room, conn.id);
    if (!mine) return;
    mine.ready = !!msg.ready;
    if (!mine.ready && room.timer) { clearTimeout(room.timer); room.timer = null; }
    broadcastState(room);
    maybeAutoStart(room);
    return;
  }
  if (msg.t === 'start') {
    if (conn.id === room.hostId && room.status === 'waiting') startRoom(room);
    return;
  }
  if (msg.t === 'msg') {
    broadcast(room, { t: 'game', msg: Object.assign({ from: conn.id }, msg.msg) }, conn.id);
    return;
  }
  if (msg.t === 'bye') {
    conn.room = null;
    removePlayer(room, conn.id);
    conn.close();
  }
}

// ---------- 组装服务器 ----------
function createServer() {
  const server = http.createServer(sendFile);
  server.on('upgrade', function (req, socket) {
    const key = req.headers['sec-websocket-key'];
    if (!key) { socket.destroy(); return; }
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      'Sec-WebSocket-Accept: ' +
      crypto.createHash('sha1').update(key + GUID).digest('base64') + '\r\n\r\n'
    );
    socket.setNoDelay(true);
    const conn = new Conn(socket);
    conn.onMessage = function (text) {
      let msg = null;
      try { msg = JSON.parse(text); } catch (e) { return; }
      try { handle(conn, msg); } catch (e) { send(conn, { t: 'err', text: '服务器出错了：' + ((e && e.message) || e) }); }
    };
    conn.onClose = function () {
      const room = conn.room;
      conn.room = null;
      if (room) removePlayer(room, conn.id);
    };
  });
  return server;
}

if (require.main === module) {
  const server = createServer();
  server.listen(PORT, function () {
    const nets = require('os').networkInterfaces();
    const lines = [];
    for (const name in nets) {
      for (const ni of nets[name]) {
        if (ni.family === 'IPv4' && !ni.internal) lines.push('  http://' + ni.address + ':' + PORT);
      }
    }
    console.log('双人游戏合集 · 网页版已启动');
    console.log('  自己玩：http://localhost:' + PORT);
    if (lines.length) console.log('  同一 Wi-Fi 下的朋友可以打开：\n' + lines.join('\n'));
    console.log('  按 Ctrl+C 结束');
  });
}

module.exports = { createServer: createServer, rooms: rooms };
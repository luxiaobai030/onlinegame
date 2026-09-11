// ===== 网页版联机层 =====
// 和 services/net.js（微信云开发版）对外接口完全一致，所以房间/对局界面一行都不用改。
// 区别只在底层：这里连的是自己服务器上的 WebSocket，由服务器维护房间并转发对局消息。
//
// 双方各自重放对方的操作（sendGameMsg / receiveMsg），和小游戏里联机的模型一样。
function defaultUrl() {
  if (typeof location === 'undefined') return '';
  return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
}

class NetLink {
  constructor(opts) {
    this.gameId = opts.gameId;
    this.roomCode = opts.roomCode || '';
    this.self = opts.self;
    this.isHost = !!opts.isHost;
    this.cb = opts.cb || {};
    this.maxPlayers = opts.maxPlayers || 2;
    this.minPlayers = opts.minPlayers || 2;
    this.url = opts.url || defaultUrl();

    this._sock = null;
    this._closed = false;
    this._started = false;
    this._state = null;
  }

  // ---------- 静态：建房 / 加入 ----------
  static createRoom(opts) {
    return NetLink._open(opts, {
      t: 'create',
      gameId: opts.gameId,
      self: opts.self,
      minPlayers: opts.minPlayers,
      maxPlayers: opts.maxPlayers
    });
  }

  static joinRoom(opts) {
    return NetLink._open(opts, {
      t: 'join',
      gameId: opts.gameId,
      roomCode: String(opts.roomCode || '').toUpperCase(),
      self: opts.self
    });
  }

  static supportError() {
    if (typeof WebSocket === 'undefined') return '这个浏览器太旧了，换个新一点的浏览器就能联机';
    return '';
  }

  // 连上服务器 -> 发建房/加入请求 -> 收到 ok 就算成功
  static _open(opts, payload) {
    return new Promise(function (resolve, reject) {
      let sock = null;
      try {
        sock = new WebSocket(opts.url || defaultUrl());
      } catch (e) {
        reject(new Error('连不上联机服务器，请确认服务器已经启动'));
        return;
      }
      const link = new NetLink(opts);
      link._raw = sock;
      let done = false;

      sock.onopen = function () {
        try { sock.send(JSON.stringify(payload)); } catch (e) {}
      };
      sock.onerror = function () {
        if (!done) { done = true; reject(new Error('连不上联机服务器，请确认服务器已经启动')); }
      };
      sock.onclose = function () {
        if (!done) { done = true; reject(new Error('连接被服务器断开了')); return; }
        link._handle({ t: 'closed' });
      };
      sock.onmessage = function (ev) {
        let msg = null;
        try { msg = JSON.parse(ev.data); } catch (e) { return; }
        if (!done) {
          if (msg.t === 'err') { done = true; reject(new Error(msg.text || '联机失败，请稍后重试')); return; }
          if (msg.t === 'ok') {
            done = true;
            link.roomCode = msg.roomCode;
            link.isHost = !!msg.isHost;
            resolve(link);
            return;
          }
        }
        link._handle(msg);
      };
    });
  }

  // ---------- 服务器来的消息 ----------
  _handle(msg) {
    if (!msg) return;
    if (msg.t === 'state') {
      this._state = msg.state;
      if (this.cb.onState) this.cb.onState(msg.state);
      if (msg.state && msg.state.status === 'playing') this._beginGame();
      return;
    }
    if (msg.t === 'start') { this._beginGame(); return; }
    if (msg.t === 'game') {
      if (this.cb.onGameMsg) this.cb.onGameMsg(msg.msg);
      return;
    }
    if (msg.t === 'peerLeft') {
      if (this.cb.onPeerLeave) this.cb.onPeerLeave({ id: msg.id, name: msg.name });
      return;
    }
    if (msg.t === 'err') {
      this._closed = true;                 // 服务器已经判这个房间结束了，别再报一次"断线"
      if (this.cb.onError) this.cb.onError(msg.text);
      return;
    }
    if (msg.t === 'closed') {
      if (this._closed) return;
      this._closed = true;
      if (this.cb.onError) this.cb.onError('和服务器断开了，返回大厅可以重新开一局');
    }
  }

  _beginGame() {
    if (this._started) return;
    this._started = true;
    if (this.cb.onGameStart) this.cb.onGameStart();
  }

  _send(obj) {
    const sock = this._raw;
    if (!sock || this._closed || sock.readyState !== 1) return;
    try { sock.send(JSON.stringify(obj)); } catch (e) {}
  }

  // ---------- 房间动作 ----------
  toggleReady(want) {
    const mine = this._mine();
    if (mine) mine.ready = !!want;         // 先本地更新，界面点下去立刻有反应
    if (this._state) {
      let ready = this._state.count > 0;
      for (let i = 0; i < this._state.players.length; i++) {
        if (!this._state.players[i].ready) ready = false;
      }
      this._state.allReady = ready;
      if (this.cb.onState) this.cb.onState(this._state);
    }
    this._send({ t: 'ready', ready: !!want });
  }

  startGame() {
    if (!this.isHost) return Promise.reject(new Error('只有房主可以开始游戏'));
    this._send({ t: 'start' });
    return Promise.resolve();
  }

  sendGameMsg(msg) {
    this._send({ t: 'msg', msg: msg });
  }

  notifyLeave() {
    this._send({ t: 'bye' });
  }

  leaveAndClose() {
    if (this._closed) return;
    this.notifyLeave();
    this.close();
  }

  close() {
    if (this._closed) return;
    this._closed = true;
    try { if (this._raw) this._raw.close(); } catch (e) {}
  }

  // ---------- 给界面看的信息 ----------
  _mine() {
    if (!this._state) return null;
    for (let i = 0; i < this._state.players.length; i++) {
      if (this._state.players[i].self) return this._state.players[i];
    }
    return null;
  }

  myIndex() {
    return this._state ? this._state.myIndex : 0;
  }

  playerCount() {
    return this._state ? this._state.count : this.maxPlayers;
  }

  playerNames() {
    if (!this._state) return [];
    return this._state.players.map(function (p) { return p.name; });
  }

  players() {
    return this._state ? this._state.players : [];
  }
}

module.exports = NetLink;
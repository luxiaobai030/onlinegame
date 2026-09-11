// ===== 极简 MQTT 客户端 =====
// 用途：拿公共 MQTT 代理当"免费中转站"，这样联机不需要自己架服务器、也不用注册账号。
// 只实现用得到的那几个包：CONNECT(带遗嘱) / SUBSCRIBE / PUBLISH(QoS0) / PINGREQ / DISCONNECT。
//
// 为什么不用完整的 mqtt.js：这个项目一直是零依赖，而且这里只需要一个"按房间号收发文本"的能力。
// ponytail: 只做 QoS0（WebSocket 本身跑在 TCP 上，不主动断线就不会丢包）；
//           要"断线后补发"再上 QoS1+PUBACK。
const PROTOCOL = 4;           // MQTT 3.1.1
const KEEPALIVE = 60;         // 秒

function utf8(s) { return Array.from(new TextEncoder().encode(s)); }

function encLen(n) {
  const out = [];
  do {
    let b = n % 128;
    n = Math.floor(n / 128);
    if (n > 0) b |= 0x80;
    out.push(b);
  } while (n > 0);
  return out;
}

function u16(n) { return [(n >> 8) & 255, n & 255]; }

// MQTT 字符串 = 2 字节长度 + UTF-8
function field(s) { const b = utf8(s); return u16(b.length).concat(b); }

function packet(type, flags, body) {
  return new Uint8Array([(type << 4) | flags].concat(encLen(body.length), body));
}

function connectPacket(clientId, will) {
  let flags = 0x02;                                     // cleanSession
  if (will) flags |= 0x04 | 0x20;                       // willFlag + willRetain
  let body = field('MQTT').concat([PROTOCOL, flags], u16(KEEPALIVE), field(clientId));
  if (will) body = body.concat(field(will.topic), field(will.text));
  return packet(1, 0, body);
}

// 从一个缓冲区里切出一个包；数据不够就返回 null
function readPacket(buf) {
  if (buf.length < 2) return null;
  let i = 1, mult = 1, len = 0, b;
  do {
    if (i >= buf.length) return null;
    b = buf[i++];
    len += (b & 127) * mult;
    mult *= 128;
  } while (b & 128);
  if (buf.length < i + len) return null;
  return { type: buf[0] >> 4, body: buf.subarray(i, i + len), size: i + len };
}

function readField(body, at) {
  const len = (body[at] << 8) | body[at + 1];
  const text = new TextDecoder().decode(body.subarray(at + 2, at + 2 + len));
  return { text: text, next: at + 2 + len };
}

function Mqtt(opts) {
  this.url = opts.url;
  this.clientId = opts.clientId;
  this.will = opts.will || null;
  this.onMessage = opts.onMessage || null;      // (topic, text)
  this.onReady = opts.onReady || null;          // 连上代理了
  this.onClose = opts.onClose || null;
  this._sock = null;
  this._buf = new Uint8Array(0);
  this._subs = [];
  this._queued = [];
  this._ready = false;
  this._closed = false;
  this._timer = null;
}

Mqtt.prototype.connect = function () {
  const self = this;
  let sock;
  try {
    sock = new WebSocket(this.url, 'mqtt');
  } catch (e) {
    if (this.onClose) this.onClose('连不上中转服务器');
    return;
  }
  this._sock = sock;
  sock.binaryType = 'arraybuffer';
  sock.onopen = function () {
    sock.send(connectPacket(self.clientId, self.will));
  };
  sock.onmessage = function (ev) { self._data(new Uint8Array(ev.data)); };
  sock.onclose = function () {
    self._stop();
    if (self.onClose) self.onClose('和中转服务器断开了');
  };
  sock.onerror = function () {
    if (!self._ready) {
      self._stop();
      if (self.onClose) self.onClose('连不上中转服务器');
    }
  };
};

Mqtt.prototype.subscribe = function (topic) {
  this._subs.push(topic);
  if (this._ready) this._sendSubscribe(topic);
};

Mqtt.prototype._sendSubscribe = function (topic) {
  this._send(packet(8, 2, u16(1).concat(field(topic), [0])));
};

Mqtt.prototype.publish = function (topic, text, retain) {
  const body = field(topic).concat(utf8(text));
  const bytes = packet(3, retain ? 1 : 0, body);
  if (this._ready) this._send(bytes);
  else this._queued.push(bytes);
};

Mqtt.prototype._send = function (bytes) {
  if (!this._sock || this._closed) return;
  try { this._sock.send(bytes); } catch (e) {}
};

Mqtt.prototype._data = function (chunk) {
  const merged = new Uint8Array(this._buf.length + chunk.length);
  merged.set(this._buf, 0);
  merged.set(chunk, this._buf.length);
  this._buf = merged;
  for (;;) {
    const p = readPacket(this._buf);
    if (!p) return;
    this._buf = this._buf.subarray(p.size);
    if (p.type === 2) {                       // CONNACK
      this._ready = true;
      for (let i = 0; i < this._subs.length; i++) this._sendSubscribe(this._subs[i]);
      const q = this._queued;
      this._queued = [];
      for (let i = 0; i < q.length; i++) this._send(q[i]);
      this._timer = setInterval(() => this._send(packet(12, 0, [])), (KEEPALIVE / 2) * 1000);
      if (this.onReady) this.onReady();
    } else if (p.type === 3) {                // PUBLISH
      // 订阅时按 QoS0 收，代理不会加包号，所以主题后面剩下的就是正文
      const f = readField(p.body, 0);
      const text = new TextDecoder().decode(p.body.subarray(f.next));
      if (this.onMessage) this.onMessage(f.text, text);
    }
  }
};

Mqtt.prototype._stop = function () {
  this._ready = false;
  if (this._timer) { clearInterval(this._timer); this._timer = null; }
};

Mqtt.prototype.close = function () {
  if (this._closed) return;
  this._closed = true;
  this._send(packet(14, 0, []));              // 正常断开：代理不会再发遗嘱
  this._stop();
  try { if (this._sock) this._sock.close(); } catch (e) {}
};

Mqtt.connect = function (opts) { const m = new Mqtt(opts); m.connect(); return m; };

module.exports = Mqtt;
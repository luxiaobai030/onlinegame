// ===== 网页版联机层（公共 MQTT 中转版）=====
// 对外的接口和 services/net.js（微信云开发版）一字不差，所以房间页、对局页一行都不用改。
// 和 web/net-web.js 的区别：不用自己架服务器，借公共 MQTT 代理当免费中转，
// 网页丢到 GitHub Pages 上就能和朋友一起玩。代价：同一个房间的人必须同时在线。
//
// 分工：房间里第一个进来的人（房主）兼任"服务器"——维护座位表、广播房间状态、判定开局，
//       其他人只发自己的动作、听广播。（等于把 server.js 的那套逻辑搬进房主的浏览器）
const Mqtt = require('./mqtt-lite.js');
const ids = require('../utils/id.js');

// 公共中转站，按顺序试，谁能连上就用谁（都免注册、免信用卡）
const BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://test.mosquitto.org:8081'
];
const AUTO_START_DELAY = 1200;   // 全员准备后再等一小会儿开局（和自己架服务器时一致）
const MAX_SEATS = 4;
const JOIN_TIMEOUT = 6000;

function clampSeats(n, max) {
  n = Number(n) || 2;
  return Math.max(2, Math.min(max, n));
}

// 挨个试公共中转站，连上任意一个就返回这个连接
function connectBroker(clientId, will, onMessage) {
  return new Promise(function (resolve, reject) {
    let at = 0, done = false, timer = null;
    function next() {
      if (done) return;
      if (at >= BROKERS.length) {
        done = true;
        reject(new Error('连不上中转服务器，可能是网络问题，过一会儿再试'));
        return;
      }
      const mq = Mqtt.connect({ url: BROKERS[at++], clientId: clientId, will: will, onMessage: onMessage });
      timer = setTimeout(function () { mq.close(); next(); }, 7000);
      mq.onReady = function () {
        if (done) { mq.close(); return; }
        done = true;
        clearTimeout(timer);
        resolve(mq);
      };
      mq.onClose = function () {
        if (done) return;
        clearTimeout(timer);
        next();
      };
    }
    next();
  });
}

class NetLink {
  constructor(opts) {
    this.gameId = opts.gameId;
    this.roomCode = opts.roomCode || '';
    this.self = opts.self || {};
    this.isHost = !!opts.isHost;
    this.cb = opts.cb || {};
    this.maxPlayers = opts.maxPlayers || 2;
    this.minPlayers = opts.minPlayers || 2;

    this._mq = null;
    this._closed = false;
    this._started = false;
    this._state = null;
    this._myId = String(this.self.id || '');
    this._hostId = '';
    this._ready = false;          // 还没拿到房主的 ok，就先不听广播
    this._seats = null;           // 只有房主用得到：座位表
    this._status = 'waiting';
    this._timer = null;
  }

  // ---------- 静态：建房 / 加入 ----------
  static createRoom(opts) {
    return NetLink._open(opts, ids.roomCode(), true);
  }

  static joinRoom(opts) {
    return NetLink._open(opts, String(opts.roomCode || '').toUpperCase(), false);
  }

  static supportError() {
    if (typeof WebSocket === 'undefined') return '这个浏览器太旧了，换个新一点的浏览器就能联机';
    return '';
  }

  static _open(opts, code, isHost) {
    const link = new NetLink(opts);
    link.isHost = isHost;
    link.roomCode = code;
    link._topic = 'dg/' + code;
    link._willTopic = link._topic + '/w/' + link._myId;
    const self = link.self;

    // 客户端 ID 每次都得不一样，否则后连上的人会把前一个人顶下线
    return connectBroker(
      'dg' + ids.clientId(),
      { topic: link._willTopic, text: JSON.stringify({ t: 'leave', id: link._myId }) },
      function (topic, text) { link._onMessage(topic, text); }
    ).then(function (mq) {
      link._mq = mq;
      mq.onClose = function () { link._handle({ t: 'closed' }); };
      mq.subscribe(link._topic);            // 房间总线
      mq.subscribe(link._topic + '/s');     // 房主广播的房间状态
      mq.subscribe(link._topic + '/w/+');   // 谁掉线了（代理替他发的遗嘱）

      if (!isHost) {
        return new Promise(function (resolve, reject) {
          link._onJoinOk = function () { link._ready = true; resolve(link); };
          link._onJoinErr = reject;
          link._joinTimer = setTimeout(function () {
            link._onJoinOk = link._onJoinErr = null;
            link.close();
            reject(new Error('没找到这个房间。房间码要一字不差，而且好友得开着这个页面等你'));
          }, JOIN_TIMEOUT);
          link._publish({ t: 'join', self: self, gameId: link.gameId });
        });
      }

      link._ready = true;
      link._hostId = link._myId;
      link._seats = [{ id: link._myId, name: self.name || '房主', avatar: self.avatar || '🦊', ready: false }];
      link._publishState();
      return link;
    });
  }

  // ---------- 收消息 ----------
  _onMessage(topic, text) {
    if (!text) return;                                  // 空正文 = 有人清掉了保留消息，无视
    let msg = null;
    try { msg = JSON.parse(text); } catch (e) { return; }

    if (topic === this._topic + '/s') {                 // 房主广播的房间状态
      if (!this._ready || !msg.state) return;
      this._handle({ t: 'state', state: this._view(msg.state) });
      return;
    }
    if (topic.indexOf(this._topic + '/w/') === 0) {     // 有人掉线了
      this._offline(String(msg.id || ''));
      return;
    }
    if (topic !== this._topic) return;

    if (this.isHost) this._asHost(msg);
    this._asMember(msg);
  }

  _asMember(msg) {
    // 还在等房主回话的，先处理"进得去 / 进不去"
    if (this._onJoinOk && msg.t === 'ok' && msg.to === this._myId) {
      const ok = this._onJoinOk;
      this._onJoinOk = this._onJoinErr = null;
      clearTimeout(this._joinTimer);
      ok();
      return;
    }
    if (this._onJoinErr && msg.t === 'err' && (!msg.to || msg.to === this._myId)) {
      const bad = this._onJoinErr;
      this._onJoinOk = this._onJoinErr = null;
      clearTimeout(this._joinTimer);
      bad(new Error(msg.text || '进不去这个房间'));
      this.close();                          // 进不去就别占着中转站的连接
      return;
    }
    if (!this._ready) return;
    if (msg.t === 'err') {
      if (msg.to && msg.to !== this._myId) return;
      this._handle(msg);
      return;
    }
    if (msg.t === 'start') { this._handle({ t: 'start' }); return; }
    if (msg.t === 'game') {
      if (msg.from && msg.from === this._myId) return;   // 自己发的不用重放一遍
      this._handle({ t: 'game', msg: msg.msg });
      return;
    }
    if (msg.t === 'peerLeft') this._handle({ t: 'peerLeft', id: msg.id, name: msg.name });
  }

  // 只有房主才管这些：谁进来了、谁准备了、谁走了
  _asHost(msg) {
    const self = msg.self || {};
    if (msg.t === 'join') {
      const id = String(self.id || '');
      if (!id || id === this._myId) return;
      const seat = this._seatOf(id);
      if (this._status !== 'waiting') {
        this._publish({ t: 'err', to: id, text: '这一局已经开始了，等下一局吧' });
        return;
      }
      if (msg.gameId && msg.gameId !== this.gameId) {
        this._publish({ t: 'err', to: id, text: '房间里的游戏和你选的不一样' });
        return;
      }
      if (!seat) {
        if (this._seats.length >= this.maxPlayers) {
          this._publish({ t: 'err', to: id, text: '房间满了（最多 ' + this.maxPlayers + ' 人）' });
          return;
        }
        this._seats.push({ id: id, name: self.name || '好友', avatar: self.avatar || '😀', ready: false });
      } else if (self.name) {
        seat.name = self.name;
      }
      this._publish({ t: 'ok', to: id, roomCode: this.roomCode, isHost: false });
      this._publishState();
      this._maybeAutoStart();
      return;
    }
    if (msg.t === 'ready') {
      const seat = this._seatOf(String(msg.id || ''));
      if (!seat) return;
      seat.ready = !!msg.ready;
      if (!seat.ready && this._timer) { clearTimeout(this._timer); this._timer = null; }
      this._publishState();
      this._maybeAutoStart();
      return;
    }
    if (msg.t === 'bye') {
      const id = String(msg.id || '');
      if (id === this._myId) return;
      this._drop(id);
    }
  }

  // 代理替掉线的人发的遗嘱 / 主动说的再见，都走这里
  _drop(id) {
    let at = -1;
    for (let i = 0; i < this._seats.length; i++) {
      if (this._seats[i].id === id) { at = i; break; }
    }
    if (at < 0) return;                          // 不在座位上（可能是残留的旧遗嘱），不管
    const who = this._seats[at];
    this._seats.splice(at, 1);
    if (this._timer && this._status === 'waiting') { clearTimeout(this._timer); this._timer = null; }
    if (!this._seats.length) return;
    this._publish({ t: 'peerLeft', id: id, name: who.name });
    this._publishState();
    this._maybeAutoStart();
  }

  _offline(id) {
    if (this.isHost) { this._drop(id); return; }
    if (id && id === this._hostId) this._handle({ t: 'err', text: '房主已离开房间' });
  }

  _seatOf(id) {
    if (!this._seats) return null;
    for (let i = 0; i < this._seats.length; i++) {
      if (this._seats[i].id === id) return this._seats[i];
    }
    return null;
  }

  // ---------- 房主视角的房间状态 ----------
  _publicState() {
    const seats = this._seats || [];
    let ready = seats.length > 0;
    const players = [];
    for (let i = 0; i < seats.length; i++) {
      if (!seats[i].ready) ready = false;
      players.push({ id: seats[i].id, name: seats[i].name, avatar: seats[i].avatar, ready: !!seats[i].ready });
    }
    return {
      roomCode: this.roomCode,
      gameId: this.gameId,
      hostId: this._myId,
      status: this._status,
      minPlayers: this.minPlayers,
      maxPlayers: this.maxPlayers,
      players: players,
      count: seats.length,
      full: seats.length >= this.maxPlayers,
      allReady: ready,
      starting: !!this._timer
    };
  }

  // 我该看到的版本：谁是"我"、我坐几号位，各人自己算
  _view(state) {
    const players = [];
    let at = -1;
    for (let i = 0; i < state.players.length; i++) {
      const p = state.players[i];
      if (p.id === this._myId) at = i;
      players.push({ id: p.id, name: p.name, avatar: p.avatar, ready: !!p.ready, self: p.id === this._myId });
    }
    this._hostId = state.hostId;
    return {
      roomCode: state.roomCode, gameId: state.gameId, status: state.status,
      minPlayers: state.minPlayers, maxPlayers: state.maxPlayers,
      players: players, count: state.count, full: state.full,
      allReady: state.allReady, starting: state.starting,
      myIndex: at < 0 ? 0 : at,
      isHost: state.hostId === this._myId
    };
  }

  _publishState() {
    const state = this._publicState();
    this._mq.publish(this._topic + '/s', JSON.stringify({ t: 'state', state: state }), true);
    this._handle({ t: 'state', state: this._view(state) });
  }

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
      this._closed = true;                  // 房间已经结束了，别再报一次"断线"
      if (this.cb.onError) this.cb.onError(msg.text);
      return;
    }
    if (msg.t === 'closed') {
      if (this._closed) return;
      this._closed = true;
      if (this.cb.onError) this.cb.onError('和中转服务器断开了，返回大厅可以重新开一局');
    }
  }

  _beginGame() {
    if (this._started) return;
    this._started = true;
    if (this.cb.onGameStart) this.cb.onGameStart();
  }

  _maybeAutoStart() {
    if (this._status !== 'waiting' || this._timer) return;
    if (this._seats.length < this.minPlayers) return;
    for (let i = 0; i < this._seats.length; i++) {
      if (!this._seats[i].ready) return;
    }
    const me = this;
    this._timer = setTimeout(function () {
      me._timer = null;
      if (me._status === 'waiting') me._startRoom();
    }, AUTO_START_DELAY);
    this._publishState();
  }

  _startRoom() {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    this._status = 'playing';
    this._publishState();
    this._publish({ t: 'start' });
  }

  _publish(obj) {
    if (!this._mq || this._closed) return;
    this._mq.publish(this._topic, JSON.stringify(obj), false);
  }

  // ---------- 房间动作 ----------
  toggleReady(want) {
    const mine = this._mine();
    if (mine) mine.ready = !!want;           // 先本地更新，点下去立刻有反应
    if (this._state) {
      let ready = this._state.count > 0;
      for (let i = 0; i < this._state.players.length; i++) {
        if (!this._state.players[i].ready) ready = false;
      }
      this._state.allReady = ready;
      if (this.cb.onState) this.cb.onState(this._state);
    }
    this._publish({ t: 'ready', id: this._myId, ready: !!want });
  }

  startGame() {
    if (!this.isHost) return Promise.reject(new Error('只有房主可以开始游戏'));
    this._startRoom();
    return Promise.resolve();
  }

  sendGameMsg(msg) {
    this._publish({ t: 'game', from: this._myId, msg: msg });
  }

  notifyLeave() {
    this._publish({ t: 'bye', id: this._myId });
  }

  leaveAndClose() {
    if (this._closed) return;
    this.notifyLeave();
    if (this._mq) {
      if (this.isHost) {                     // 房主走了，这一局就散了：清掉保留的房间状态
        this._publish({ t: 'err', text: '房主已离开房间' });
        this._mq.publish(this._topic + '/s', '', true);
      }
      this._mq.publish(this._willTopic, '', true); // 正常离开，把遗嘱也擦掉
    }
    this.close();
  }

  close() {
    if (this._closed) return;
    this._closed = true;
    if (this._mq) this._mq.close();
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
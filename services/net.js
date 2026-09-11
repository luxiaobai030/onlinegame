// =========================================================
// 联机服务：基于「微信云开发」实时数据库实现双人房间
//
// 设计要点：
//  - rooms 集合：房主创建房间并写入；只有房主能写（创建者写权限）
//  - joins 集合：加入者写入"加入申请/准备状态"，房主监听后转发到房间文档
//  - events 集合：每人一个专属事件文档（roomCode_clientId），
//    双方只写自己的文档、只读对方的文档，天然避免写入冲突；
//    接收方按数组长度增量处理，消息不丢、不乱序
// =========================================================
const cloud = require('./cloud.js');
const ids = require('../utils/id.js');

class NetLink {
  constructor(opts) {
    this.gameId = opts.gameId;
    this.roomCode = opts.roomCode;
    this.self = opts.self;
    this.isHost = !!opts.isHost;
    this.cb = opts.cb || {};
    this.db = wx.cloud.database();
    this._ = this.db.command;

    this._watchers = [];
    this._closed = false;

    this._eventsDocId = this.roomCode + '_' + this.self.id;

    // 对手信息（加入者视角一开始不知道房主是谁，由房间文档获得）
    this._opponent = null;
    this._opponentEventsLen = 0;
    this._guestAccepted = false;   // 房主：是否已接受第一位加入者
    this._iAmAccepted = false;     // 加入者：房主是否已把我写入房间

    this._readyHost = false;
    this._readyGuest = false;

    this._seenJoinIds = {};
    this._joinDocId = null;        // 加入者自己的 join 文档
    this._status = 'waiting';

    this._helloReceived = false;
    this._helloSent = false;
    this._outbox = [];             // 等待"对方就绪"后再发送的游戏消息
  }

  // ---------- 静态：创建房间 ----------
  static createRoom(opts) {
    const db = wx.cloud.database();
    const doc = {
      gameId: opts.gameId,
      hostId: opts.self.id,
      hostName: opts.self.name,
      hostAvatar: opts.self.avatar,
      guestId: '',
      guestName: '',
      guestAvatar: '',
      hostReady: false,
      guestReady: false,
      status: 'waiting',
      createdAt: db.serverDate()
    };
    const tryAdd = () => {
      const code = ids.roomCode();
      return db.collection('rooms').add({ data: Object.assign({ _id: code }, doc) })
        .then(() => code)
        .catch((err) => {
          // 房号恰好被占用则换一个重试
          if (err && /duplicate|already exist|_id/i.test(err.errMsg || '')) {
            return tryAdd();
          }
          throw err;
        });
    };
    return tryAdd().then((code) => {
      const link = new NetLink({
        gameId: opts.gameId,
        roomCode: code,
        self: opts.self,
        isHost: true,
        cb: opts.cb
      });
      return link._bootstrapHost().then(() => link);
    });
  }

  // ---------- 静态：加入房间 ----------
  static joinRoom(opts) {
    const db = wx.cloud.database();
    return db.collection('rooms').doc(opts.roomCode).get()
      .then((res) => {
        const room = res.data;
        if (!room) {
          const e = new Error('没有找到这个房间，请确认房间号是否正确');
          e.userMessage = true;
          throw e;
        }
        if (room.gameId && room.gameId !== opts.gameId) {
          const e2 = new Error('房间内的游戏与你选择的不一致');
          e2.userMessage = true;
          throw e2;
        }
        if (room.status !== 'waiting') {
          const e3 = new Error('房间已开始或已结束，无法加入');
          e3.userMessage = true;
          throw e3;
        }
        if (room.guestId) {
          const e4 = new Error('房间已满，请换个房间试试');
          e4.userMessage = true;
          throw e4;
        }
        const link = new NetLink({
          gameId: opts.gameId,
          roomCode: opts.roomCode,
          self: opts.self,
          isHost: false,
          cb: opts.cb
        });
        return link._bootstrapGuest(room).then(() => link);
      });
  }

  static supportError() {
    if (!cloud.isReady()) return cloud.reason() || '云开发尚未初始化';
    return '';
  }

  // ================= 房主初始化 =================
  _bootstrapHost() {
    return this._ensureEventsDoc().then(() => {
      // 监听"加入申请"
      const watcher = this.db.collection('joins')
        .where({ roomCode: this.roomCode })
        .watch({
          onChange: (snapshot) => this._onJoinsSnapshot(snapshot),
          onError: (err) => this._emitError('监听加入请求失败：' + (err && err.errMsg || '网络异常'))
        });
      this._watchers.push(watcher);
      this._emitState();
    });
  }

  // 加入申请集合的变化（房主视角）
  _onJoinsSnapshot(snapshot) {
    if (this._closed) return;
    const docs = snapshot.docs || [];
    // 检测加入者删除申请（在大厅离开）
    const currentIds = {};
    for (let k = 0; k < docs.length; k++) { if (docs[k] && docs[k]._id) currentIds[docs[k]._id] = true; }
    if (this._lastJoinIds) {
      for (const oldId in this._lastJoinIds) {
        if (!currentIds[oldId] && this._opponent && oldId === this.roomCode + '_' + this._opponent.id) {
          this.resetGuest();
        }
      }
    }
    this._lastJoinIds = currentIds;
    for (let i = 0; i < docs.length; i++) {
      const join = docs[i];
      if (!join || !join.guestId) continue;
      this._seenJoinIds[join._id] = true;

      // 1) 接受第一位加入者
      if (!this._guestAccepted && !this._opponent) {
        this._guestAccepted = true;
        this._opponent = {
          id: join.guestId,
          name: join.guestName || '好友',
          avatar: join.guestAvatar || '😀'
        };
        this._opponentEventsLen = 0;
        this._watchOpponentEvents(this._opponent.id);
        this._updateRoom({
          guestId: this._opponent.id,
          guestName: this._opponent.name,
          guestAvatar: this._opponent.avatar,
          guestReady: false
        }).catch(() => {});
        this._emitState();
      }

      // 2) 转发加入者的"准备"状态
      if (this._opponent && join.guestId === this._opponent.id) {
        const want = !!join.ready;
        if (want !== this._readyGuest) {
          this._readyGuest = want;
          this._updateRoom({ guestReady: want }).catch(() => {});
          this._emitState();
        }
      }
    }
  }

  // ================= 加入者初始化 =================
  _bootstrapGuest(room) {
    this._room = room;
    return this._ensureEventsDoc().then(() => {
      // 写加入申请（文档 ID 固定，重复加入会覆盖而非报错）
      this._joinDocId = this.roomCode + '_' + this.self.id;
      const joinDoc = {
        _id: this._joinDocId,
        roomCode: this.roomCode,
        gameId: this.gameId,
        guestId: this.self.id,
        guestName: this.self.name,
        guestAvatar: this.self.avatar,
        ready: false,
        createdAt: this.db.serverDate()
      };
      return this.db.collection('joins').doc(this._joinDocId).set({ data: joinDoc });
    }).then(() => {
      // 监听房间文档：等房主把我写入，并同步双方准备状态与开局
      const watcher = this.db.collection('rooms').doc(this.roomCode)
        .watch({
          onChange: (snapshot) => this._onRoomSnapshot(snapshot),
          onError: (err) => this._emitError('监听房间状态失败：' + (err && err.errMsg || '网络异常'))
        });
      this._watchers.push(watcher);
      this._emitState();
    });
  }

  _onRoomSnapshot(snapshot) {
    if (this._closed) return;
    const room = (snapshot.docs && snapshot.docs[0]) || null;
    if (!room) {
      this._emitError('房间不存在或已被删除');
      this._cleanupJoin();
      return;
    }
    this._room = room;

    // 已被接受
    if (!this._iAmAccepted && room.guestId === this.self.id) {
      this._iAmAccepted = true;
      this._opponent = {
        id: room.hostId,
        name: room.hostName || '好友',
        avatar: room.hostAvatar || '😀'
      };
      this._opponentEventsLen = 0;
      this._watchOpponentEvents(this._opponent.id);
      this._emitState();
    }

    // 房间被别人占了
    if (!this._iAmAccepted && room.guestId && room.guestId !== this.self.id) {
      this._emitError('房间已被其他好友抢先加入');
      this._safeClose();
      return;
    }

    // 房主离开
    if (this._iAmAccepted && room.status === 'ended') {
      this._emitError('房主已离开房间');
      this._safeClose();
      return;
    }

    // 房主在大厅关闭房间（加入者尚未被接受）
    if (!this._iAmAccepted && room.status === 'ended') {
      this._emitError('房主已关闭房间，请返回后重新发起对战');
      this._cleanupJoin();
      this._safeClose();
      return;
    }

    // 加入者视角：同步双方准备状态
    if (!this.isHost && this._iAmAccepted) {
      const hr = !!room.hostReady;
      const gr = !!room.guestReady;
      if (hr !== this._readyHost || gr !== this._readyGuest) {
        this._readyHost = hr;
        this._readyGuest = gr;
        this._emitState();
      }
    }

    // 游戏开始
    if (this._iAmAccepted && room.status === 'playing' && this._status !== 'playing') {
      this._status = 'playing';
      this._startGameLocal();
    }
  }

  // ================= 房间动作 =================
  // 点击/取消"准备"
  toggleReady(want) {
    if (this.isHost) {
      this._readyHost = want;
      return this._updateRoom({ hostReady: want }).then(() => {
        this._emitState();
      });
    }
    this._readyGuest = want;
    return this.db.collection('joins').doc(this._joinDocId)
      .update({ data: { ready: want } })
      .then(() => {
        this._emitState();
      })
      .catch((err) => {
        this._emitError('更新准备状态失败：' + (err && err.errMsg || '网络异常'));
      });
  }

  // 房主点击"开始游戏"
  startGame() {
    if (!this.isHost) return Promise.reject(new Error('只有房主可以开始游戏'));
    if (!this._readyHost || !this._readyGuest) return Promise.reject(new Error('双方都准备好后才能开始'));
    return this._updateRoom({ status: 'playing' }).then(() => {
      this._status = 'playing';
      this._startGameLocal();
    });
  }

  // 双方各自进入"游戏中"
  _startGameLocal() {
    if (this._closed) return;
    this._sendHello();
    if (this.cb.onGameStart) this.cb.onGameStart();
  }

  _sendHello() {
    if (this._helloSent) return;
    this._helloSent = true;
    this._pushEvent({ kind: 'g-hello', from: this.self.id, t: Date.now() });
  }

  // ================= 事件文档（游戏消息通道） =================
  _ensureEventsDoc() {
    const doc = {
      ownerId: this.self.id,
      roomCode: this.roomCode,
      events: [],
      createdAt: this.db.serverDate()
    };
    return this.db.collection('events').doc(this._eventsDocId).set({ data: doc })
      .catch(() => this.db.collection('events').add({ data: Object.assign({ _id: this._eventsDocId }, doc) }))
      .catch(() => {});
  }

  _pushEvent(msg) {
    if (this._closed) return Promise.resolve();
    return this.db.collection('events').doc(this._eventsDocId)
      .update({ data: { events: this._.push([msg]), updatedAt: this.db.serverDate() } })
      .catch((err) => {
        // 文档不存在时先补建再推一次
        return this._ensureEventsDoc().then(() =>
          this.db.collection('events').doc(this._eventsDocId)
            .update({ data: { events: this._.push([msg]) } })
        ).catch(() => this._emitError('消息发送失败：' + (err && err.errMsg || '网络异常')));
      });
  }

  // 监听对手的事件文档，按长度增量消费
  _watchOpponentEvents(opponentId) {
    const docId = this.roomCode + '_' + opponentId;
    let watcher = null;
    const onSnapshot = (snapshot) => {
      if (this._closed || !snapshot || !snapshot.docs || !snapshot.docs[0]) return;
      const list = snapshot.docs[0].events || [];
      if (list.length <= this._opponentEventsLen) return;
      const fresh = list.slice(this._opponentEventsLen);
      this._opponentEventsLen = list.length;
      for (let i = 0; i < fresh.length; i++) {
        this._dispatchOpponentMsg(fresh[i]);
      }
    };
    watcher = this.db.collection('events').doc(docId).watch({
      onChange: onSnapshot,
      onError: (err) => this._emitError('实时连接中断：' + (err && err.errMsg || '网络异常'))
    });
    this._watchers.push(watcher);
    this._eventsWatcher = watcher;
  }

  _dispatchOpponentMsg(msg) {
    if (!msg || !msg.kind || msg.from === this.self.id) return;
    if (msg.kind === 'bye') {
      if (this.cb.onPeerLeave) this.cb.onPeerLeave();
      return;
    }
    if (msg.kind === 'g-hello') {
      this._helloReceived = true;
      const pending = this._outbox.slice();
      this._outbox = [];
      for (let i = 0; i < pending.length; i++) {
        this._pushEvent(pending[i]);
      }
      return;
    }
    if (this.cb.onGameMsg) this.cb.onGameMsg(msg);
  }

  // 发送一条游戏消息（收到对方 g-hello 前先排队）
  sendGameMsg(msg) {
    const payload = Object.assign({ from: this.self.id, t: Date.now() }, msg);
    if (!this._helloReceived) {
      this._outbox.push(payload);
      return;
    }
    this._pushEvent(payload);
  }

  // 通知对方自己离开（尽力而为）
  notifyLeave() {
    if (this._closed) return;
    this._pushEvent({ kind: 'bye', from: this.self.id, t: Date.now() });
  }

  // ================= 工具 =================
  _updateRoom(fields) {
    if (this._closed) return Promise.reject(new Error('closed'));
    const data = Object.assign({ updatedAt: this.db.serverDate() }, fields);
    return this.db.collection('rooms').doc(this.roomCode).update({ data });
  }

  _emitState() {
    if (!this.cb.onState) return;
    const hostSelf = this.isHost;
    const host = hostSelf ? this.self : (this._room ? { name: this._room.hostName, avatar: this._room.hostAvatar, id: this._room.hostId } : null);
    const guest = hostSelf
      ? (this._opponent ? { name: this._opponent.name, avatar: this._opponent.avatar, id: this._opponent.id } : null)
      : this.self;
    this.cb.onState({
      roomCode: this.roomCode,
      gameId: this.gameId,
      isHost: this.isHost,
      status: this._status,
      host: Object.assign({ ready: this._readyHost, self: hostSelf }, host || {}),
      guest: guest ? Object.assign({ ready: this._readyGuest, self: !hostSelf }, guest) : null,
      guestJoined: !!guest
    });
  }

  _emitError(text) {
    if (!this._closed && this.cb.onError) this.cb.onError(text);
  }

 _safeClose() {
   try { this.close(); } catch (e) {}
 }

  _cleanupJoin() {
    if (this._joinDocId) {
      const id = this._joinDocId;
      this._joinDocId = null;
      this.db.collection('joins').doc(id).remove().catch(() => {});
    }
  }

  // 房主：好友在大厅离开后复位房间
  resetGuest() {
    if (!this.isHost || this._closed || this._status !== 'waiting') return;
    if (this._eventsWatcher) {
      try { this._eventsWatcher.close(); } catch (e) {}
      this._eventsWatcher = null;
    }
    this._opponent = null;
    this._guestAccepted = false;
    this._readyGuest = false;
    this._opponentEventsLen = 0;
    this._updateRoom({ guestId: '', guestName: '', guestAvatar: '', guestReady: false }).catch(() => {});
    this._emitState();
  }

  // 页面离开时调用：清理房间/申请并通知对方
  leaveAndClose() {
    if (this._closed) return;
    const playing = this._status === 'playing';
    if (this.isHost) {
      this._updateRoom({ status: 'ended' }).catch(() => {});
    }
    if (!this.isHost && !playing) this._cleanupJoin();
    if (playing) this.notifyLeave();
    this.close();
  }

  close() {
    if (this._closed) return;
    this._closed = true;
    for (let i = 0; i < this._watchers.length; i++) {
      const w = this._watchers[i];
      if (w && w.close) {
        try { w.close(); } catch (e) {}
      }
    }
    this._watchers = [];
  }
}

module.exports = NetLink;

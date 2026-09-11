// ===== 联机房间：建房 / 加入 / 邀请 =====
const { C, F } = require('./../theme.js');
const d = require('./../draw.js');
const w = require('./../widgets.js');
const games = require('./../games/index.js');
const net = require('../../services/net.js');
const names = require('../../utils/names.js');
const ids = require('../../utils/id.js');

function layout(a) {
  const pad = 14;
  const top = a.topInset;
  const bottom = a.height - a.bottomInset;
  return {
    pad: pad, top: top, bottom: bottom,
    back: { x: pad, y: top, w: 76, h: 34 },
    card: { x: pad, y: top + 58, w: a.width - pad * 2, h: 216 },
    btnArea: { x: pad, y: bottom - 178, w: a.width - pad * 2, h: 44 },
    btnGap: 58
  };
}

function buttons(scene) {
  const pub = scene.pub;
  if (scene.blocked) {
    return [{ key: 'back', label: '返回', tone: 'ghost' }];
  }
  if (!scene.isGuest) {
    const canStart = !!(pub && pub.guestJoined && pub.guest && pub.guest.ready && pub.host && pub.host.ready);
    return [
      { key: 'invite', label: '邀请好友', tone: 'primary' },
      { key: 'start', label: '开始游戏', tone: 'ok', disabled: !canStart },
      { key: 'back', label: '返回', tone: 'ghost' }
    ];
  }
  return [
    { key: 'copy', label: '复制房间码', tone: 'primary' },
    { key: 'back', label: '返回', tone: 'ghost' }
  ];
}

function statusText(scene) {
  if (scene.error) return scene.error;
  const pub = scene.pub;
  if (!pub) return scene.status || '正在连接…';
  if (!scene.isGuest) {
    if (!pub.guestJoined) return '等待好友加入…把「邀请好友」的卡片发给 TA';
    if (!pub.guest.ready) return '好友「' + (pub.guest.name || '好友') + '」已进房，正在准备';
    return '双方都准备好了，点下面「开始游戏」';
  }
  return '已进房，等房主点开始';
}

function drawCode(ctx, box, code) {
  const text = code || '……';
  const size = 36;
  const tw = d.width(ctx, text, size, true);
  d.text(ctx, text, box.x + box.w / 2, box.y + 96, {
    size: size, bold: true, align: 'center', color: C.text
  });
  return tw;
}

function create(gameId, roomCode) {
  const game = games.getById(gameId);
  const self = { id: ids.clientId(), name: names.defaultName(), avatar: names.pickAvatar() };
  const scene = {
    name: 'room',
    game: game,
    self: self,
    link: null,
    pub: null,
    code: roomCode,
    isGuest: !!roomCode,
    status: '',
    error: '',
    blocked: false,
    sink: null
  };

  scene.enter = function (a) {
    const problem = net.supportError();
    if (problem) {
      scene.blocked = true;
      scene.error = problem;
      a.render();
      return;
    }
    scene.status = scene.isGuest ? '正在加入房间…' : '正在创建房间…';
    const cb = {
      onState: function (pub) {
        scene.pub = pub;
        scene.code = pub.roomCode || scene.code;
        a.render();
      },
      onGameStart: function () {
        const link = scene.link;
        scene.link = null;              // 交给对局场景，别在离开时关掉
        const play = require('./play.js').create(game.id, { mode: 'net', link: link });
        link.cb.onGameMsg = play.receiveMsg;
        link.cb.onPeerLeave = function () { a.toast('对方离开了对局'); };
        link.cb.onError = function (text) { a.toast(text); };
        a.replace(play);
      },
      onGameMsg: function (msg) {
        if (scene.sink) scene.sink(msg);
      },
      onPeerLeave: function () { scene.status = '对方离开了房间'; a.render(); },
      onError: function (text) { scene.error = text; a.render(); }
    };
    let req = null;
    try {
      req = scene.isGuest
        ? net.joinRoom({ gameId: game.id, roomCode: scene.code, self: self, cb: cb })
        : net.createRoom({ gameId: game.id, self: self, cb: cb });
    } catch (e) {
      scene.error = (e && e.message) || '云开发初始化失败，请先在开发者工具里开通云开发（详见 README）';
      a.render();
      return;
    }
    req.then(function (link) {
      scene.link = link;
      scene.status = '';
      a.render();
      return link.toggleReady(true);
    }).catch(function (err) {
      scene.error = (err && err.message) || '联机失败，请稍后重试';
      a.render();
    });
  };

  scene.leave = function () {
    if (scene.link) {
      scene.link.leaveAndClose();
      scene.link = null;
    }
  };

  scene.touch = function (type, x, y, a) {
    if (type !== 'end') return;
    const lay = layout(a);
    if (d.inRect(x, y, lay.back)) {
      a.pop();
      return;
    }
    const btns = buttons(scene);
    for (let i = 0; i < btns.length; i++) {
      const r = { x: lay.btnArea.x, y: lay.btnArea.y + i * lay.btnGap, w: lay.btnArea.w, h: lay.btnArea.h };
      if (btns[i].disabled || !d.inRect(x, y, r)) continue;
      const key = btns[i].key;
      if (key === 'back') a.pop();
      else if (key === 'invite') {
        a.share({
          title: '来玩「' + game.name + '」，我们联机对战！',
          query: 'game=' + game.id + '&room=' + scene.code
        });
      } else if (key === 'copy') {
        try {
          wx.setClipboardData({ data: scene.code });
          a.toast('房间码已复制：' + scene.code);
        } catch (e) {}
      } else if (key === 'start') {
        if (!scene.link) return;
        scene.link.startGame().catch(function () {
          a.toast('开始失败，请让好友重新进一次');
        });
      }
      return;
    }
  };

  scene.render = function (a, ctx) {
    const lay = layout(a);
    w.button(ctx, lay.back, '‹ 返回', { tone: 'ghost', size: F.sm });
    d.text(ctx, game.name + ' · 联机对战', lay.back.x + lay.back.w + 12, lay.top + 17, {
      size: F.lg, bold: true
    });
    const box = lay.card;
    w.panel(ctx, box, { color: C.card, radius: 18, line: C.line });
    d.text(ctx, '房间码（好友点开你发的卡片就能进）', box.x + 18, box.y + 34, { size: F.sm, color: C.muted });
    drawCode(ctx, box, scene.code);
    const st = statusText(scene);
    const lines = Math.min(3, Math.ceil(d.width(ctx, st, F.sm) / (box.w - 40))) || 1;
    d.wrap(ctx, st, box.x + 20, box.y + 142, box.w - 40, {
      size: F.sm, color: scene.error ? C.bad : C.muted, maxLines: lines, lineHeight: 20
    });
    d.text(ctx, scene.isGuest ? '我：' + self.name : '我：' + self.name + '（房主）', box.x + box.w / 2, box.y + 188, {
      size: F.sm, color: C.muted, align: 'center'
    });
    const btns = buttons(scene);
    for (let i = 0; i < btns.length; i++) {
      const r = { x: lay.btnArea.x, y: lay.btnArea.y + i * lay.btnGap, w: lay.btnArea.w, h: lay.btnArea.h };
      w.button(ctx, r, btns[i].label, { tone: btns[i].tone, disabled: btns[i].disabled });
    }
  };
  return scene;
}

module.exports = { create: create };

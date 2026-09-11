// ===== 对局场景：信息条 + 棋盘 + 按钮 + 结算 =====
const { C, F, sideColor } = require('./../theme.js');
const d = require('./../draw.js');
const w = require('./../widgets.js');
const games = require('./../games/index.js');

function layout(a) {
  const pad = 12;
  const top = a.topInset;
  const bottom = a.height - a.bottomInset;
  const btnArea = { x: pad, y: bottom - 60, w: a.width - pad * 2, h: 50 };
  const hintY = top + 100;
  const boardTop = hintY + 36;
  return {
    pad: pad, top: top, bottom: bottom,
    back: { x: pad, y: top, w: 76, h: 34 },
    bar: { x: pad, y: top + 42, w: a.width - pad * 2, h: 44 },
    hintY: hintY,
    board: { x: pad, y: boardTop, w: a.width - pad * 2, h: btnArea.y - boardTop - 14 },
    btnArea: btnArea
  };
}

function create(gameId, opts) {
  const game = games.getById(gameId);
  const mode = opts.mode || 'local';
  const link = opts.link || null;
  const role = (mode === 'net' && link && !link.isHost) ? 1 : 0;
  const seedBase = mode === 'net' ? ((link && link.roomCode) || 'net') : ('local' + Date.now());
  const names = mode === 'local'
    ? ['玩家 1', '玩家 2']
    : (role === 0 ? ['我', '好友'] : ['房主', '我']);

  const scene = {
    name: 'play',
    game: game,
    mode: mode,
    role: role,
    link: link,
    names: names,
    seed: seedBase,
    state: game.create(seedBase, mode),
    pending: {},
    cover: null,
    coverSeen: null,
    undoAsked: false,
    exited: false,
    app: null
  };

  const api = {
    mode: mode,
    role: role,
    seed: seedBase,
    names: names,
    blocked: function () { return !!scene.cover; },
    mySide: function () {
      return mode === 'local' ? game.turn(scene.state) : role;
    },
    getState: function () { return scene.state; },
    toast: function (msg) { if (scene.app) scene.app.toast(msg); },
    vibrate: function () { if (scene.app) scene.app.vibrate(); },
    dirty: function () { if (scene.app) scene.app.render(); },
    set: function (next) {
      if (!next) return;
      scene.state = next;
      if (scene.app) scene.app.render();
    },
    setPending: function (p) {
      scene.pending = p || {};
      if (scene.app) scene.app.render();
    },
    act: function (action) { return act(action); }
  };
  Object.defineProperty(api, 'pending', { get: function () { return scene.pending; } });
  Object.defineProperty(api, 'moved', {
    get: function () { return !!(scene.app && scene.app.touchMoved); }
  });

  // 本地执行一个动作；联机模式下把动作发给对方（对方按同样规则重放）
  function act(action) {
    const by = mode === 'local' ? game.turn(scene.state) : role;
    const res = game.core.act(scene.state, Object.assign({}, action, { by: by }));
    if (!res || res.state === scene.state) return false;
    scene.state = res.state;
    if (mode === 'net' && link) {
      for (let i = 0; i < res.outbox.length; i++) link.sendGameMsg(res.outbox[i]);
    }
    afterChange(true);
    return true;
  }

  function receiveMsg(msg) {
    const res = game.core.recv(scene.state, msg);
    if (res && res.state !== scene.state) scene.state = res.state;
    afterChange(false);
  }

  // 每次状态变化后：刷新遮屏、结算、悔棋请求
  function afterChange(local) {
    const a = scene.app;
    if (!a) return;
    syncCover(a);
    if (game.coverKey) a.render();
    const s = scene.state;
    if (mode === 'net' && s.undoReq !== undefined && s.undoReq !== -1 && s.undoReq !== role) {
      if (!scene.undoAsked) {
        scene.undoAsked = true;
        a.dialog({
          title: '对方请求悔棋',
          body: '同意的话，你们一起退回上一手',
          buttons: [{ label: '同意', tone: 'ok' }, { label: '拒绝', tone: 'bad' }],
          onPick: function (i) {
            scene.undoAsked = false;
            act({ kind: 'undo-res', accept: i === 0 });
          }
        });
      }
    } else {
      scene.undoAsked = false;
    }
    if (scene.cover) a.render();
    else a.render();
  }

  function syncCover(a) {
    if (!game.coverKey) return;
    const key = game.coverKey(scene.state, api);
    if (key === scene.coverSeen) {
      scene.cover = null;
      return;
    }
    if (key === null) {
      scene.cover = null;
      return;
    }
    if (!scene.cover) scene.cover = game.coverText(scene.state, api);
  }

  function coverKeyNow() {
    return game.coverKey ? game.coverKey(scene.state, api) : null;
  }

  function exit(a, ask) {
    const go = function () {
      if (scene.exited) return;
      scene.exited = true;
      if (link) {
        link.leaveAndClose();
        scene.link = null;
      }
      a.pop();
    };
    if (!ask) {
      go();
      return;
    }
    a.dialog({
      title: '退出对局',
      body: '退出后本局就结束了',
      buttons: [{ label: '继续玩', tone: 'quiet' }, { label: '退出', tone: 'bad' }],
      onPick: function (i) { if (i === 1) go(); }
    });
  }

  scene.enter = function (a) {
    scene.app = a;
    if (mode === 'net' && link) {
      link.cb.onGameMsg = receiveMsg;
      link.cb.onPeerLeave = function () { a.toast('对方离开了对局'); };
      link.cb.onError = function (text) { a.toast(text); };
    }
    scene.coverSeen = coverKeyNow();
    if (opts.pending && opts.pending.length) {
      for (let i = 0; i < opts.pending.length; i++) receiveMsg(opts.pending[i]);
    }
    a.render();
  };
  scene.leave = function () {
    scene.app = null;
  };
  scene.receiveMsg = receiveMsg;
  scene.touch = function (type, x, y, a) {
    const lay = layout(a);
    if (scene.cover) {
      if (type === 'end') {
        scene.coverSeen = coverKeyNow();
        scene.cover = null;
        a.render();
      }
      return;
    }
    const s = scene.state;
    if (type === 'end' && !a.touchMoved) {
      if (d.inRect(x, y, lay.back)) {
        exit(a, !game.over(s));
        return;
      }
      if (game.over(s)) {
        const rows = overRects(a, lay);
        if (d.inRect(x, y, rows[0])) {
          if (!act({ kind: 'again' })) a.toast('再试一次');
          return;
        }
        if (d.inRect(x, y, rows[1])) {
          exit(a, false);
          return;
        }
      }
      const btns = game.buttons(s, api);
      if (btns.length) {
        const rects = w.rowRects(lay.btnArea, btns.length, 8);
        for (let i = 0; i < btns.length; i++) {
          if (!btns[i].disabled && d.inRect(x, y, rects[i])) {
            if (game.press) game.press(btns[i].key, s, api);
            return;
          }
        }
      }
      if (game.onExtraTap && game.onExtraTap({ x: x, y: y }, lay.board, s, api)) return;
    }
    if (mode === 'net' && !game.over(s) && game.turn(s) !== role) {
      if (type === 'end') api.toast('还没轮到你');
      return;
    }
    if (game.touch) game.touch(type, { x: x, y: y }, lay.board, s, api);
  };
  scene.api = api;
  return scene;
}

function overBox(a) {
  const bw = Math.min(a.width - 40, 340);
  return { x: (a.width - bw) / 2, y: (a.height - 320) / 2, w: bw, h: 300 };
}

function overRects(a) {
  const box = overBox(a);
  return [
    { x: box.x + 18, y: box.y + 176, w: box.w - 36, h: 54 },
    { x: box.x + 18, y: box.y + 240, w: box.w - 36, h: 44 }
  ];
}

function drawOver(ctx, a, scene) {
  const s = scene.state;
  const res = scene.game.result(s, scene.api);
  ctx.fillStyle = 'rgba(6,8,14,0.72)';
  ctx.fillRect(0, 0, a.width, a.height);
  const box = overBox(a);
  w.panel(ctx, box, { color: C.card2, radius: 20, line: C.line });
  const draw = res.winner === -2;
  d.text(ctx, draw ? '🤝' : '🏆', a.width / 2, box.y + 46, { size: 34, align: 'center' });
  d.text(ctx, res.title, a.width / 2, box.y + 96, {
    size: F.xl, bold: true, align: 'center',
    color: res.winner >= 0 ? sideColor(res.winner) : C.text
  });
  if (res.sub) {
    d.text(ctx, d.ellipsis(ctx, res.sub, box.w - 40, F.sm), a.width / 2, box.y + 124, {
      size: F.sm, color: C.muted, align: 'center'
    });
  }
  if (s.scores) {
    d.text(ctx, '总比分　' + s.scores[0] + ' : ' + s.scores[1], a.width / 2, box.y + 152, {
      size: F.md, color: C.text, align: 'center'
    });
  }
  const rows = overRects(a);
  w.button(ctx, rows[0], '再来一局', { tone: 'primary' });
  w.button(ctx, rows[1], scene.mode === 'net' ? '退出房间' : '返回大厅', { tone: 'ghost' });
}

function drawCover(ctx, a, scene) {
  const c = scene.cover;
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, a.width, a.height);
  const accent = sideColor(c.side);
  d.circle(ctx, a.width / 2, a.height * 0.36, 34, 'rgba(255,255,255,0.06)');
  d.ringCircle(ctx, a.width / 2, a.height * 0.36, 34, accent, 2);
  d.circle(ctx, a.width / 2, a.height * 0.36, 10, accent);
  d.text(ctx, c.title, a.width / 2, a.height * 0.36 + 74, { size: F.xl, bold: true, align: 'center' });
  if (c.sub) {
    d.text(ctx, d.ellipsis(ctx, c.sub, a.width - 60, F.md), a.width / 2, a.height * 0.36 + 108, {
      size: F.md, color: C.muted, align: 'center'
    });
  }
  d.text(ctx, '准备好了点屏幕继续', a.width / 2, a.height * 0.36 + 168, {
    size: F.md, color: C.primary, align: 'center'
  });
}

function render(a, ctx) {
  const scene = this;
  const game = scene.game;
  const api = scene.api;
  const s = scene.state;
  const lay = layout(a);
  w.button(ctx, lay.back, '‹ 返回', { tone: 'ghost', size: F.sm });
  d.text(ctx, game.name, lay.back.x + lay.back.w + 12, lay.top + 17, { size: F.lg, bold: true });
  d.text(ctx, scene.mode === 'net' ? '联机对战' : '同屏双人', a.width - lay.pad, lay.top + 18, {
    size: F.sm, color: C.muted, align: 'right'
  });
  const half = (lay.bar.w - 10) / 2;
  const active = game.over(s) ? -1 : game.turn(s);
  for (let side = 0; side < 2; side++) {
    w.playerBar(ctx, { x: lay.bar.x + side * (half + 10), y: lay.bar.y, w: half, h: lay.bar.h }, {
      side: side,
      name: scene.names[side] || ('玩家' + (side + 1)),
      score: game.score ? game.score(s, side) : (s.scores ? s.scores[side] : 0),
      active: active === side
    });
  }
  const hint = game.hint(s, api);
  // 提示太长（比如斋普尔选完牌要报一串理由）就折成两行，别截断
  d.wrap(ctx, hint, lay.pad, lay.hintY + 6, lay.board.w, {
    size: F.sm, color: C.muted, maxLines: 2, lineHeight: 14
  });
  game.draw(ctx, lay.board, s, api);
  const btns = game.over(s) ? [] : game.buttons(s, api);
  if (btns.length) {
    const rects = w.rowRects(lay.btnArea, btns.length, 8);
    for (let i = 0; i < btns.length; i++) {
      w.button(ctx, rects[i], btns[i].label, {
        tone: btns[i].tone || 'ghost', disabled: btns[i].disabled
      });
    }
  }
  if (game.over(s)) drawOver(ctx, a, scene);
  if (scene.cover) drawCover(ctx, a, scene);
}

function createWithRender(gameId, opts) {
  const scene = create(gameId, opts);
  scene.render = render;
  return scene;
}

module.exports = { create: createWithRender, layout: layout };

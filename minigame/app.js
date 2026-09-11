// ===== 小游戏引擎：画布、场景、触摸、弹层、分享 =====
const { C, F } = require('./theme.js');
const d = require('./draw.js');
const w = require('./widgets.js');
const session = require('./session.js');

const app = {
  ctx: null,
  width: 0,
  height: 0,
  dpr: 1,
  topInset: 56,      // 顶部胶囊下方，内容从这里开始
  bottomInset: 0,    // 全面屏底部安全区
  now: 0,
  touchStart: null,
  touchMoved: false,
  _stack: [],
  _dirty: true,
  _toast: null,
  _dialog: null,
  _pending: null,
  _share: { title: '双人游戏合集', query: '' },
  _queryHandler: null
};

// ---------- 尺寸与画布 ----------
function setup() {
  const info = wx.getSystemInfoSync();
  const canvas = wx.createCanvas();
  const dpr = info.pixelRatio || 1;
  app.width = info.windowWidth;
  app.height = info.windowHeight;
  app.dpr = dpr;
  canvas.width = Math.round(app.width * dpr);
  canvas.height = Math.round(app.height * dpr);
  app.ctx = canvas.getContext('2d');
  app.ctx.scale(dpr, dpr);
  let top = 56;
  try {
    const menu = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null;
    if (menu && menu.bottom) top = menu.bottom + 10;
  } catch (e) { top = 56; }
  app.topInset = top;
  const safe = info.safeArea;
  app.bottomInset = safe ? Math.max(0, (info.screenHeight || app.height) - safe.bottom) : 0;
}

// ---------- 场景 ----------
function top() {
  return app._stack.length ? app._stack[app._stack.length - 1] : null;
}

function push(scene) {
  const prev = top();
  if (prev && prev.hide) prev.hide(app);
  app._stack.push(scene);
  if (scene.enter) scene.enter(app);
  app.render();
}

function replace(scene) {
  const old = app._stack.pop();
  if (old && old.leave) old.leave(app);
  push(scene);
}

function pop() {
  const old = app._stack.pop();
  // 自己退出对局的，就别再存档了，免得下次开机又跳回这一局
  if (old && old.name === 'play') session.clear();
  if (old && old.leave) old.leave(app);
  const cur = top();
  if (cur && cur.show) cur.show(app);
  app.render();
}

// ---------- 提示与弹窗 ----------
function toast(msg, ms) {
  app._toast = { msg: String(msg), until: Date.now() + (ms || 1800) };
  app.render();
}

function dialog(spec) {
  app._dialog = spec;
  app._pending = null;
  app.render();
}

function closeDialog() {
  app._dialog = null;
  app._pending = null;
  app.render();
}

function dialogButtonAt(x, y) {
  const dg = app._dialog;
  if (!dg) return -1;
  const box = dialogBox();
  const n = dg.buttons.length;
  const bar = { x: box.x + 16, y: box.y + box.h - 60, w: box.w - 32, h: 44 };
  const rects = w.rowRects(bar, n, 10);
  for (let i = 0; i < n; i++) {
    if (d.inRect(x, y, rects[i])) return i;
  }
  return -1;
}

function dialogBox() {
  const dg = app._dialog;
  const bw = Math.min(app.width - 48, 340);
  const bh = 120 + (dg.body ? Math.min(80, dg.body.length * 11) : 0);
  return { x: (app.width - bw) / 2, y: app.height * 0.32, w: bw, h: bh };
}

function drawDialog(ctx) {
  const dg = app._dialog;
  if (!dg) return;
  const box = dialogBox();
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, app.width, app.height);
  w.panel(ctx, box, { color: C.card2, radius: 18, line: C.line });
  d.text(ctx, dg.title, box.x + 18, box.y + 34, { size: F.lg, bold: true });
  if (dg.body) {
    d.wrap(ctx, dg.body, box.x + 18, box.y + 66, box.w - 36, { size: F.sm, color: C.muted, maxLines: 4 });
  }
  const bar = { x: box.x + 16, y: box.y + box.h - 60, w: box.w - 32, h: 44 };
  const rects = w.rowRects(bar, dg.buttons.length, 10);
  for (let i = 0; i < dg.buttons.length; i++) {
    const b = dg.buttons[i];
    w.button(ctx, rects[i], b.label, { tone: b.tone || 'ghost', size: F.md });
  }
}

function drawToast(ctx) {
  const t = app._toast;
  if (!t) return;
  const tw = Math.min(app.width - 80, d.width(ctx, t.msg, F.sm) + 32);
  const x = (app.width - tw) / 2;
  const y = app.height - app.bottomInset - 120;
  d.fillRound(ctx, x, y, tw, 36, 18, 'rgba(20,24,38,0.92)');
  d.strokeRound(ctx, x, y, tw, 36, 18, C.line, 1);
  d.text(ctx, d.ellipsis(ctx, t.msg, tw - 20, F.sm), x + tw / 2, y + 18, {
    size: F.sm, color: C.text, align: 'center'
  });
}

// ---------- 重绘 ----------
// 出错时把原因画在屏幕上，避免"打不开也不知道为什么"
function drawFatal(text) {
  try {
    const ctx = app.ctx;
    if (!ctx) return;
    ctx.save();
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, app.width, app.height);
    d.text(ctx, '小游戏出错了', 20, app.topInset + 10, { size: 20, bold: true, color: C.bad });
    d.wrap(ctx, String(text), 20, app.topInset + 50, app.width - 40, {
      size: 13, color: C.text, maxLines: 14, lineHeight: 20
    });
    d.text(ctx, '把上面这段文字发给开发者即可定位', 20, app.height - 40, {
      size: 12, color: C.muted
    });
    ctx.restore();
  } catch (e) {}
}

function render() {
  app._dirty = true;
}

function frame() {
  try {
  const ts = Date.now();
  const dt = app._last ? Math.min(60, ts - app._last) / 1000 : 0;
  app._last = ts;
  app.now = ts;
  const cur = top();
  if (cur && cur.update && cur.update(app, dt)) app._dirty = true;
  if (app._toast && Date.now() > app._toast.until) {
    app._toast = null;
    app._dirty = true;
  }
  if (app._dirty) {
    app._dirty = false;
    const ctx = app.ctx;
    ctx.save();
    ctx.clearRect(0, 0, app.width, app.height);
    const g = ctx.createLinearGradient(0, 0, 0, app.height);
    g.addColorStop(0, C.bgTop);
    g.addColorStop(1, C.bg);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, app.width, app.height);
    if (cur && cur.render) cur.render(app, ctx);
    drawToast(ctx);
    drawDialog(ctx);
    ctx.restore();
  }
  } catch (e) {
    drawFatal((e && e.message) || e);
    return;                 // 出错就不再往下画了，但保留屏幕上这段提示
  }
  requestAnimationFrame(frame);
}

// ---------- 触摸 ----------
function pick(e) {
  const list = (e.changedTouches && e.changedTouches.length) ? e.changedTouches : e.touches;
  if (!list || !list.length) return null;
  const t = list[0];
  return { x: t.clientX !== undefined ? t.clientX : t.x, y: t.clientY !== undefined ? t.clientY : t.y };
}

function onTouch(type, e) {
  try {
    handleTouch(type, e);
  } catch (err) {
    drawFatal((err && err.message) || err);
    return;
  }
  if (type === 'end') snapshot();
}

function handleTouch(type, e) {
  const p = pick(e);
  if (!p) return;
  if (type === 'start') {
    app.touchStart = p;
    app.touchMoved = false;
  } else if (type === 'move') {
    if (app.touchStart) {
      const dx = p.x - app.touchStart.x;
      const dy = p.y - app.touchStart.y;
      if (dx * dx + dy * dy > 144) app.touchMoved = true;
    }
  }
  if (app._dialog) {
    if (type === 'start') app._pending = dialogButtonAt(p.x, p.y);
    else if (type === 'end') {
      const hit = dialogButtonAt(p.x, p.y);
      if (hit >= 0 && hit === app._pending) {
        const dg = app._dialog;
        app._dialog = null;
        app._pending = null;
        if (dg.onPick) dg.onPick(hit, dg.buttons[hit]);
      } else {
        app._pending = null;
      }
    }
    app.render();
    return;
  }
  const cur = top();
  if (cur && cur.touch) cur.touch(type, p.x, p.y, app);
  app.render();
}

// ---------- 分享 / 启动参数 ----------
function share(opts) {
  opts = opts || {};
  app._share.title = opts.title || app._share.title;
  app._share.query = opts.query || '';
  if (typeof wx.shareAppMessage === 'function') {
    wx.shareAppMessage({ title: app._share.title, query: app._share.query });
  } else if (typeof wx.showShareMenu === 'function') {
    wx.showShareMenu({ withShareTicket: false });
    toast('请点右上角「···」转发给好友');
  }
}

function onQuery(q) {
  if (!q || !q.room) return;
  // 玩到一半时，别被 onShow 带回来的启动参数顶回大厅
  const inGame = app._stack.some(function (s) { return s && s.name === 'play'; });
  if (inGame) {
    toast('正在对局中，先退出当前对局才能加入好友的房间');
    return;
  }
  if (app._queryHandler) app._queryHandler(q);
}

// ---------- 对局存档 ----------
// 只在「同屏双人」存档：联机对局的房间是云端建的，重开后接不回来。
let _lastSave = 0;

function currentPlay() {
  const cur = top();
  return (cur && cur.name === 'play' && cur.mode === 'local') ? cur : null;
}

// 立刻存一次（切后台、被回收之前用）
function saveNow() {
  const cur = currentPlay();
  if (!cur) return false;
  return session.save({
    gameId: cur.game.id,
    players: cur.players || 2,
    state: cur.state
  });
}

// 每次点完屏幕顺手存一下，太频繁就跳过（状态一直在变）
function snapshot() {
  const now = Date.now();
  if (now - _lastSave < 400) return;
  if (saveNow()) _lastSave = now;
}

// 重新打开时，把上一局接回来
function tryRestore() {
  const data = session.load();
  if (!data || !data.gameId || !data.state) { session.clear(); return false; }
  const game = require('./games/index.js').getById(data.gameId);
  if (!game || data.state.phase === 'over') { session.clear(); return false; }
  let play = null;
  try {
    play = require('./scenes/play.js').create(data.gameId, {
      mode: 'local', players: data.players || 2
    });
    play.state = data.state;      // 把存档里的局面塞回去
  } catch (e) {
    session.clear();
    return false;
  }
  push(play);
  dialog({
    title: '接着上一局？',
    body: '刚才的「' + game.name + '」还没下完，可以直接接着玩',
    buttons: [{ label: '接着玩', tone: 'ok' }, { label: '换一个', tone: 'ghost' }],
    onPick: function (i) {
      app._dialog = null;
      if (i === 1) {
        session.clear();
        pop();
      }
      app.render();
    }
  });
  return true;
}

// ---------- 启动 ----------
function start() {
  setup();
  require('../services/cloud.js').init();
  if (typeof wx.onShareAppMessage === 'function') {
    wx.onShareAppMessage(function () {
      return { title: app._share.title, query: app._share.query };
    });
  }
  if (typeof wx.showShareMenu === 'function') {
    wx.showShareMenu({ withShareTicket: false });
  }
  wx.onTouchStart(function (e) { onTouch('start', e); });
  wx.onTouchMove(function (e) { onTouch('move', e); });
  wx.onTouchEnd(function (e) { onTouch('end', e); });
  if (wx.onTouchCancel) wx.onTouchCancel(function (e) { onTouch('end', e); });
  if (wx.onShow) {
    wx.onShow(function (res) {
      onQuery((res && res.query) || {});
    });
  }
  // 切到后台/锁屏之前先存一下，被微信回收也还能接回来
  if (wx.onHide) {
    wx.onHide(function () { saveNow(); });
  }
  push(require('./scenes/menu.js').create());
  requestAnimationFrame(frame);
  let q = {};
  try {
    const opt = wx.getLaunchOptionsSync ? wx.getLaunchOptionsSync() : null;
    q = (opt && opt.query) || {};
  } catch (e) { q = {}; }
  onQuery(q);
  // 冷启动时（被回收 / 重新编译）把上一局接回来
  if (app._stack.length <= 1) tryRestore();
}

app.push = push;
app.replace = replace;
app.pop = pop;
app.top = top;
app.render = render;
app.toast = toast;
app.dialog = dialog;
app.closeDialog = closeDialog;
app.share = share;
app.setQueryHandler = function (fn) { app._queryHandler = fn; };
app.vibrate = function () {
  try { if (wx.vibrateShort) wx.vibrateShort({ type: 'light' }); } catch (e) {}
};
app.saveNow = saveNow;
app.snapshot = snapshot;
app.tryRestore = tryRestore;
app.start = start;

module.exports = app;

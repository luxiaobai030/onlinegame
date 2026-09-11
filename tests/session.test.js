// ===== 对局存档测试：被微信回收 / 重新编译后，能自动接回上一局 =====
const bd = require('../minigame/games/board.js');

const log = { texts: [] };
const fakeCtx = {
  fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: 'left',
  textBaseline: 'middle', globalAlpha: 1,
  save: function () {}, restore: function () {},
  scale: function () {}, translate: function () {}, rotate: function () {}, setTransform: function () {},
  clearRect: function () {}, fillRect: function () {},
  beginPath: function () {}, moveTo: function () {}, lineTo: function () {},
  arcTo: function () {}, arc: function () {}, closePath: function () {},
  fill: function () {}, stroke: function () {}, clip: function () {}, rect: function () {},
  fillText: function (s) { log.texts.push(String(s)); },
  measureText: function (s) { return { width: String(s).length * 7 }; },
  createLinearGradient: function () { return { addColorStop: function () {} }; },
  setLineDash: function () {}
};

let rafQueue = [];
const handlers = {};
global.requestAnimationFrame = function (fn) { rafQueue.push(fn); return rafQueue.length; };
function tick() {
  const q = rafQueue;
  rafQueue = [];
  for (let i = 0; i < q.length; i++) q[i]();
}

const store = {};
const sysInfo = {
  windowWidth: 375, windowHeight: 667, screenWidth: 375, screenHeight: 667, pixelRatio: 2,
  safeArea: { left: 0, right: 375, top: 0, bottom: 667, width: 375, height: 667 }
};
global.wx = {
  getSystemInfoSync: function () { return sysInfo; },
  getMenuButtonBoundingClientRect: function () {
    return { top: 24, bottom: 56, left: 278, right: 365, width: 87, height: 32 };
  },
  createCanvas: function () { return { width: 750, height: 1334, getContext: function () { return fakeCtx; } }; },
  onTouchStart: function (f) { handlers.start = f; },
  onTouchMove: function (f) { handlers.move = f; },
  onTouchEnd: function (f) { handlers.end = f; },
  onTouchCancel: function (f) { handlers.cancel = f; },
  onShow: function (f) { handlers.show = f; },
  onHide: function (f) { handlers.hide = f; },
  onShareAppMessage: function (f) { handlers.share = f; },
  shareAppMessage: function () {},
  showShareMenu: function () {},
  getLaunchOptionsSync: function () { return { query: {} }; },
  getStorageSync: function (k) { return store[k] === undefined ? '' : store[k]; },
  setStorageSync: function (k, v) { store[k] = v; },
  removeStorageSync: function (k) { delete store[k]; },
  setClipboardData: function () {},
  vibrateShort: function () {}
};

let passCount = 0;
let failCount = 0;
function check(name, cond, extra) {
  if (cond) {
    passCount++;
  } else {
    failCount++;
    console.log('  FAIL:', name, extra === undefined ? '' : extra);
  }
}
function touch(type, x, y) {
  handlers[type]({ changedTouches: [{ clientX: x, clientY: y }], touches: [{ clientX: x, clientY: y }] });
  tick();
}
function tap(x, y) { touch('start', x, y); touch('end', x, y); }

const playMod = require('../minigame/scenes/play.js');
const menuMod = require('../minigame/scenes/menu.js');
const app = require('../minigame/app.js');
const session = require('../minigame/session.js');

app.start();
tick();
check('启动后进主菜单', !!app.top() && app.top().name === 'menu');

console.log('== 对局存档 ==');
{
  const scene = playMod.create('gomoku', { mode: 'local' });
  app.push(scene);
  tick();
  const geo = scene.game.geo(playMod.layout(app).board);
  const p = bd.cellCenter(geo, 7, 7);
  tap(p.x, p.y);
  tap(p.x, p.y);
  check('落子后棋盘上有一颗子', scene.state.board[7 * 15 + 7] >= 0);

  app.saveNow();
  const saved = session.load();
  check('对局会存到本地', !!saved && saved.gameId === 'gomoku', JSON.stringify(saved && saved.gameId));
  check('存档里带着当前局面', !!saved.state
    && saved.state.board.filter(function (v) { return v >= 0; }).length === 1);

  // 切后台之前会强制存一次
  delete store[session.KEY];
  check('切后台前先清掉存档，方便验证', session.load() === null);
  handlers.hide();
  check('切到后台会自动存档', session.load() !== null);

  // 模拟被微信回收后重新打开：栈清空 → 重新进主菜单 → 自动接回上一局
  app._stack.length = 0;
  app.push(menuMod.create());
  check('重新打开先回主菜单', app.top().name === 'menu');
  const ok = app.tryRestore();
  check('能自动接回上一局', ok === true && app.top().name === 'play' && app.top().game.id === 'gomoku');
  check('接回来的局面和刚才一样', app.top().state.board.join(',') === saved.state.board.join(','));
  tick();
  check('接回来时会问要不要接着玩', !!app._dialog && log.texts.indexOf('接着上一局？') >= 0);
  app._dialog.onPick(1);
  check('选「换一个」回到主菜单', app.top().name === 'menu');
  check('选「换一个」会清掉存档', session.load() === null);
}

console.log('== 退出与结束 ==');
{
  const s2 = playMod.create('reversi', { mode: 'local' });
  app.push(s2);
  tick();
  app.saveNow();
  check('新开一局会存档', session.load() !== null);
  app.pop();
  check('自己退出对局后不再存档', session.load() === null);

  const s3 = playMod.create('tictactoe', { mode: 'local' });
  app.push(s3);
  tick();
  s3.state.phase = 'over';
  s3.state.winner = 0;
  app.saveNow();
  app._stack.length = 0;
  app.push(menuMod.create());
  check('打完了的对局不用接回来', app.tryRestore() === false && app.top().name === 'menu');

  const netLink = {
    isHost: true, roomCode: 'ZZZ', cb: {},
    sendGameMsg: function () {}, leaveAndClose: function () {}
  };
  const s4 = playMod.create('gomoku', { mode: 'net', link: netLink });
  app.push(s4);
  tick();
  app.saveNow();
  check('联机对局不写本地存档', session.load() === null);
  app.pop();
}

console.log('== 玩到一半不会被顶回大厅 ==');
{
  const s5 = playMod.create('battleline', { mode: 'local' });
  app.push(s5);
  tick();
  app.saveNow();
  const before = JSON.stringify(s5.state);
  // 模拟回到前台时又收到一次带房间号的启动参数
  handlers.show({ query: { game: 'gomoku', room: 'ABC123' } });
  tick();
  check('对局中收到邀请不会被打断', app.top().name === 'play'
    && app.top().game.id === 'battleline' && JSON.stringify(app.top().state) === before);
  app.pop();
  check('退回主菜单后再点邀请卡才进房间', app.top().name === 'menu');

  // 不在牌桌上时，邀请卡要照常生效，不能被误挡
  let got = null;
  app.setQueryHandler(function (q) { got = q; });
  handlers.show({ query: { game: 'gomoku', room: 'XYZ789' } });
  check('没在玩的时候，邀请卡照常生效', !!got && got.room === 'XYZ789');
}

console.log('\n结果: ' + passCount + ' 通过, ' + failCount + ' 失败');
if (failCount > 0) process.exit(1);

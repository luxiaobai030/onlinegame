// ===== 小游戏版测试：假 canvas + 假 wx，模拟真实点击/拖拽 =====
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

function tick(n) {
  const times = n || 1;
  for (let i = 0; i < times; i++) {
    const q = rafQueue;
    rafQueue = [];
    for (let k = 0; k < q.length; k++) q[k]();
  }
}

// 最小可用的云开发桩：够跑开通房/监听/写事件这条路
function fakeDb() {
  const watcher = { close: function () {} };
  function coll() {
    return {
      add: function (o) { return Promise.resolve({ _id: (o && o.data && o.data._id) || 'id' }); },
      doc: function () {
        return {
          get: function () { return Promise.resolve({ data: {} }); },
          set: function () { return Promise.resolve({}); },
          update: function () { return Promise.resolve({}); },
          remove: function () { return Promise.resolve({}); },
          watch: function () { return watcher; }
        };
      },
      where: function () {
        return { watch: function () { return watcher; }, get: function () { return Promise.resolve({ data: [] }); } };
      }
    };
  }
  return {
    command: { push: function (v) { return { $push: v }; } },
    serverDate: function () { return { $date: 1 }; },
    collection: function () { return coll(); }
  };
}

const sysInfo = {
  windowWidth: 375, windowHeight: 667, screenWidth: 375, screenHeight: 667, pixelRatio: 2,
  safeArea: { left: 0, right: 375, top: 0, bottom: 667, width: 375, height: 667 }
};

global.wx = {
  getSystemInfoSync: function () { return sysInfo; },
  getMenuButtonBoundingClientRect: function () { return { top: 24, bottom: 56, left: 278, right: 365, width: 87, height: 32 }; },
  createCanvas: function () { return { width: 0, height: 0, getContext: function () { return fakeCtx; } }; },
  onTouchStart: function (f) { handlers.start = f; },
  onTouchMove: function (f) { handlers.move = f; },
  onTouchEnd: function (f) { handlers.end = f; },
  onTouchCancel: function (f) { handlers.cancel = f; },
  onShow: function (f) { handlers.show = f; },
  onShareAppMessage: function (f) { handlers.share = f; },
  shareAppMessage: function (o) { handlers.shared = o; },
  showShareMenu: function () {},
  getLaunchOptionsSync: function () { return { query: {} }; },
  getStorageSync: function () { return ''; },
  setStorageSync: function () {},
  setClipboardData: function () {},
  vibrateShort: function () {}
};

let passCount = 0;
let failCount = 0;

function check(name, cond, extra) {
  if (cond) passCount++;
  else {
    failCount++;
    console.log('  FAIL:', name, extra === undefined ? '' : extra);
  }
}

// 触摸模拟（引擎按 changedTouches[0].clientX/Y 取点）
function touch(type, x, y) {
  const e = { changedTouches: [{ clientX: x, clientY: y }], touches: [{ clientX: x, clientY: y }] };
  handlers[type](e);
  tick();
}

function tap(x, y) {
  touch('start', x, y);
  touch('end', x, y);
}

function drag(x1, y1, x2, y2) {
  touch('start', x1, y1);
  touch('move', (x1 + x2) / 2, (y1 + y2) / 2);
  touch('move', x2, y2);
  touch('end', x2, y2);
}

const BOARD = { x: 12, y: 200, w: 351, h: 380 };

// 直接给游戏模块用的 api 桩（和 scenes/play.js 里的 api 同契约）
function mkApi(mod, ref, opts) {
  opts = opts || {};
  const api = {
    mode: opts.mode || 'local',
    role: opts.role === undefined ? 0 : opts.role,
    seed: opts.seed || 'mg',
    names: opts.names || ['玩家 1', '玩家 2'],
    pending: {},
    moved: false,
    toasts: [],
    sent: [],
    vibes: 0,
    blocked: function () { return !!opts.blocked; },
    getState: function () { return ref.state; },
    mySide: function () { return api.mode === 'local' ? mod.turn(ref.state) : api.role; },
    toast: function (m) { api.toasts.push(String(m)); },
    vibrate: function () { api.vibes++; },
    dirty: function () {},
    set: function (s) { ref.state = s; },
    setPending: function (p) { api.pending = p || {}; },
    act: function (action) {
      const by = api.mode === 'local' ? mod.turn(ref.state) : api.role;
      const res = mod.core.act(ref.state, Object.assign({}, action, { by: by }));
      if (!res || res.state === ref.state) return false;
      ref.state = res.state;
      api.sent.push(action);
      return true;
    }
  };
  return api;
}

function drawOk(mod, ref, api) {
  mod.draw(fakeCtx, BOARD, ref.state, api);
  return true;
}

const cloud = require('../services/cloud.js');
cloud.init();
check('没开通云开发时，联机给出可读提示', cloud.isReady() === false && cloud.reason().length > 0, cloud.reason());
delete require.cache[require.resolve('../services/cloud.js')];
wx.cloud = { init: function () {}, database: function () { return fakeDb(); } };

const app = require('../minigame/app.js');
const playMod = require('../minigame/scenes/play.js');
const gamesMod = require('../minigame/games/index.js');

const flush = function () { return new Promise(function (r) { setImmediate(r); }); };

// ---------- 引擎 / 菜单 ----------
app.start();
tick();
check('启动后进入主菜单', !!app.top() && app.top().name === 'menu');
check('菜单标题渲染出来了', log.texts.indexOf('双人游戏合集') >= 0);
check('菜单里有 9 款游戏', gamesMod.GAMES.length === 9);

drag(180, 600, 180, 420);
check('菜单可以上下滚动', app.top().scroll > 0);
app.top().scroll = 0;
app.render();
tick();
tap(120, 160);
check('点卡片弹出玩法选择', !!app.top().sheet && app.top().sheet.id === 'tictactoe');
tap(180, 500);
check('选「同屏双人」进入对局', app.top().name === 'play' && app.top().game.id === 'tictactoe');

// ---------- 对局壳：落子 / 结算 / 再来一局 / 退出 ----------
const play = app.top();
const playLay = playMod.layout(app);
const tt = play.game;
function boardTap(mod, r, c) {
  const p = bd.cellCenter(mod.geo(playLay.board), r, c);
  tap(p.x, p.y);
}
const firstSide = tt.turn(play.state);
boardTap(tt, 0, 0);
check('井字棋点一下就能落子', play.state.board[0] === firstSide);
boardTap(tt, 0, 0);
check('同一格不能重复落子', play.state.board.filter(function (x) { return x >= 0; }).length === 1);
boardTap(tt, 2, 0);
boardTap(tt, 0, 1);
boardTap(tt, 2, 1);
boardTap(tt, 0, 2);
check('井字棋连成一线判胜', tt.over(play.state) && play.state.winner === firstSide);

log.texts.length = 0;
app.render();
tick();
check('结算页有再来一局和比分', log.texts.indexOf('再来一局') >= 0 && /总比分　\d : \d/.test(log.texts.join('|')), log.texts.join('|'));
check('结算文案说明谁赢了', /获胜/.test(log.texts.join('|')), log.texts.join('|'));

tap(180, 370);
check('点「再来一局」重开棋局', play.state.phase === 'play' && play.state.board.filter(function (x) { return x >= 0; }).length === 0);

tap(40, 80);
check('对局中返回会先确认', !!app._dialog);
tap(263, 375);
check('确认后退出回到主菜单', app.top().name === 'menu' && !app._dialog);

// ---------- 五子棋：双击落子 + 悔棋 ----------
const gm = require('../minigame/games/gomoku.js');
const gref = { state: gm.create('gtest', 'local') };
const gapi = mkApi(gm, gref);
check('五子棋能渲染', drawOk(gm, gref, gapi));
const ggeo = gm.geo(BOARD);
const i77 = 7 * 15 + 7;
const p77 = bd.cellCenter(ggeo, 7, 7);
gm.touch('end', p77, BOARD, gref.state, gapi);
check('五子棋第一次点只预览不落子', gref.state.board[i77] === -1 && gapi.pending.i === i77);
gm.touch('end', p77, BOARD, gref.state, gapi);
check('五子棋再点一下才落子', gref.state.board[i77] >= 0 && gapi.pending.i === undefined);
gm.press('undo', gref.state, gapi);
check('五子棋能悔棋', gref.state.board[i77] === -1 && gref.state.board.filter(function (x) { return x >= 0; }).length === 0);

gref.state = gm.create('g2', 'local');
const gSide = gref.state.turn;
function gMove(r, c) {
  const p = bd.cellCenter(ggeo, r, c);
  gm.touch('end', p, BOARD, gref.state, gapi);
  gm.touch('end', p, BOARD, gref.state, gapi);
}
gMove(7, 0); gMove(0, 0); gMove(7, 1); gMove(0, 1); gMove(7, 2);
gMove(0, 2); gMove(7, 3); gMove(0, 3); gMove(7, 4);
check('五子棋连成五子获胜', gm.over(gref.state) && gref.state.winner === gSide);
check('五子棋能渲染结算状态', drawOk(gm, gref, gapi));

// ---------- 黑白棋 ----------
const rv = require('../minigame/games/reversi.js');
const rref = { state: rv.create('rtest', 'local') };
const rapi = mkApi(rv, rref);
check('黑白棋能渲染', drawOk(rv, rref, rapi));
check('黑白棋开局各 2 子', rref.state.counts[0] === 2 && rref.state.counts[1] === 2);
const rgeo = rv.geo(BOARD);
const legal0 = rv.core.legalMoves(rref.state.board, rref.state.turn)[0];
rv.touch('end', bd.cellCenter(rgeo, Math.floor(legal0 / 8), legal0 % 8), BOARD, rref.state, rapi);
check('黑白棋落子并翻面', rref.state.counts[0] + rref.state.counts[1] === 5);
const rBefore = rref.state;
rv.touch('end', bd.cellCenter(rgeo, 0, 0), BOARD, rref.state, rapi);
check('黑白棋下在夹不住的地方会提示', rref.state === rBefore && rapi.toasts.length > 0, rapi.toasts.join('/'));

// ---------- 中国象棋 ----------
const xq = require('../minigame/games/xiangqi.js');
const xref = { state: xq.create('xtest', 'local') };
const xapi = mkApi(xq, xref);
check('象棋能渲染', drawOk(xq, xref, xapi));
const xgeo = xq.geo(BOARD);
xq.touch('end', xq.pt(xgeo, 6, 0), BOARD, xref.state, xapi);
check('象棋点自己的棋子会选中', xapi.pending.sel === xq.core.idx(6, 0));
xq.touch('end', xq.pt(xgeo, 5, 0), BOARD, xref.state, xapi);
check('象棋走子', xref.state.board[xq.core.idx(5, 0)] === 'P' && !xref.state.board[xq.core.idx(6, 0)]);
xq.press('undo', xref.state, xapi);
check('象棋能悔棋', xref.state.board[xq.core.idx(6, 0)] === 'P');

// ---------- 海战棋 ----------
const bs = require('../minigame/games/battleship.js');
const bref = { state: bs.create('btest', 'local') };
const bapi = mkApi(bs, bref);
check('海战棋能渲染布阵', drawOk(bs, bref, bapi));
bs.press('rand', bref.state, bapi);
check('海战棋随机摆好三艘船', bref.state.fleets[0].length === 3);
bs.press('undo', bref.state, bapi);
check('海战棋能撤销一艘', bref.state.fleets[0].length === 2);
bs.press('rand', bref.state, bapi);
bs.press('ready', bref.state, bapi);
check('海战棋轮换布阵', bref.state.setupBy === 1);
check('海战棋同屏需要遮屏换人', bs.coverKey(bref.state, bapi) === 'setup:1');
bs.press('rand', bref.state, bapi);
bs.press('ready', bref.state, bapi);
check('海战棋双方准备好后开打', bref.state.phase === 'play');
check('海战棋遮屏有提示文案', !!bs.coverText(bref.state, bapi).title);
const foeGeo = bs.geoPair(BOARD);
const me = bs.turn(bref.state);
bs.touch('end', bd.cellCenter(foeGeo.foe, 0, 0), BOARD, bref.state, bapi);
check('海战棋点对方海域能开炮', bref.state.shots[me][0] >= 0);
let guard = 0;
while (!bs.over(bref.state) && guard++ < 40) {
  const s = bref.state;
  const shooter = bs.turn(s);
  const cells = bs.core.shipCellsOf(s.fleets[1 - shooter]);
  let target = -1;
  for (let k = 0; k < cells.length; k++) {
    if (s.shots[shooter][cells[k]] === -1) { target = cells[k]; break; }
  }
  if (target < 0) break;
  bapi.act({ kind: 'shoot', i: target });
}
check('海战棋打光三条船判胜', bs.over(bref.state) && bref.state.winner >= 0);
check('海战棋能渲染对战与结算', drawOk(bs, bref, bapi));

// ---------- 拉密：拖放 + 绿红框 + 排序 ----------
const rm = require('../minigame/games/rummikub.js');
const mref = { state: rm.create('mtest', 'local') };
const mapi = mkApi(rm, mref);
check('拉密能渲染', drawOk(rm, mref, mapi));
const mlay = rm.layout(BOARD);
check('拉密棋盘是 13×13', mlay.g.cols === 13 && mlay.g.rows === 13);
const mSide = mref.state.turn;
const handTile = rm.core.sortRackBy(mref.state.racks[mSide], 'color')[0];
const rackRect = rm.rackTileRect(mlay.rack, 0);
const from = { x: rackRect.x + rackRect.w / 2, y: rackRect.y + rackRect.h / 2 };
const to = bd.cellCenter(mlay.g, 0, 0);
rm.touch('start', from, BOARD, mref.state, mapi);
mapi.moved = true;
rm.touch('move', { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }, BOARD, mref.state, mapi);
rm.touch('end', to, BOARD, mref.state, mapi);
check('拉密拖手牌到棋盘', !!mref.state.board[0] && mref.state.board[0].id === handTile.id);
check('拉密拖走后手牌少一张', mref.state.racks[mSide].length === 13);

mapi.moved = false;
const to2 = bd.cellCenter(mlay.g, 0, 1);
rm.touch('start', to, BOARD, mref.state, mapi);
rm.touch('end', to, BOARD, mref.state, mapi);
check('拉密点棋盘上的牌能选中', mapi.pending.rmSel === handTile.id);
rm.touch('end', to2, BOARD, mref.state, mapi);
check('拉密点空格能把选中的牌挪过去', !!mref.state.board[rm.core.idx(0, 1)] && !mref.state.board[0]);
check('拉密散牌显示红框', rm.core.layoutBoard(mref.state).cells[rm.core.idx(0, 1)].ok === false);
mref.state.board[rm.core.idx(1, 0)] = { id: 9001, c: 0, v: 8, joker: false };
check('拉密单张也是红框', rm.core.layoutBoard(mref.state).cells[rm.core.idx(1, 0)].ok === false);
const m2 = rm.create('mv', 'local');
m2.board[0] = { id: 1, c: 1, v: 3, joker: false };
m2.board[1] = { id: 2, c: 1, v: 4, joker: false };
m2.board[2] = { id: 3, c: 1, v: 5, joker: false };
check('拉密横排顺子显示绿框', rm.core.layoutBoard(m2).cells[0].ok === true);

const sortRect = rm.sortButton(mlay);
check('拉密排序按钮能点到', rm.onExtraTap({ x: sortRect.x + 8, y: sortRect.y + 8 }, BOARD, mref.state, mapi) === true);
check('拉密能切成按数字排序', mapi.pending.rmSort === 'num');
check('拉密按数字排序后能渲染', drawOk(rm, mref, mapi));
check('拉密同屏需要遮屏换人', rm.coverKey(mref.state, mapi) === 'turn:' + mref.state.turn);
rm.press('undo', mref.state, mapi);
check('拉密能撤销这一手', mref.state.board.filter(function (x) { return !!x; }).length === 0);
rm.press('commit', mref.state, mapi);
check('拉密没出牌就收手会提示原因', mapi.toasts.length > 0, mapi.toasts.join('/'));
rm.press('draw', mref.state, mapi);
check('拉密能摸牌并换人', mref.state.racks[mSide].length === 15 && mref.state.turn === 1 - mSide);

// 摸到第 15 张：牌不能跑出手牌框，手牌标题/排序按钮也不能压到棋盘
const rack15 = mref.state.racks[mSide];
const lay15 = rm.layout(BOARD, rack15.length);
const lastRect = rm.rackTileRect(lay15.rack, rack15.length - 1);
check('拉密第 15 张牌还在手牌框里',
  lastRect.x >= lay15.rack.x - 0.01 && lastRect.x + lastRect.w <= lay15.rack.x + lay15.rack.w + 0.01 &&
  lastRect.y >= lay15.rack.y - 0.01 && lastRect.y + lastRect.h <= lay15.rack.y + lay15.rack.h + 0.01);
check('拉密手牌一行排不下的牌会挤进手牌框（15 张排成 8 列）', lay15.rack.cols === 8);
mref.state.turn = mSide;
const mode15 = mapi.pending.rmSort || 'color';
const sorted15 = rm.core.sortRackBy(rack15, mode15);
rm.touch('start', { x: lastRect.x + lastRect.w / 2, y: lastRect.y + lastRect.h / 2 }, BOARD, mref.state, mapi);
check('拉密第 15 张牌能拖起来', !!mapi.pending.rmDrag && mapi.pending.rmDrag.tileId === sorted15[14].id);
mapi.setPending({});
mref.state = rm.core.act(mref.state, { kind: 'undo', by: mSide }).state;

// 手牌上方那条「标题 + 排序按钮」要整条落在棋盘下面
[14, 15, 18].forEach(function (n) {
  const l = rm.layout(BOARD, n);
  const btn = rm.sortButton(l);
  check('拉密手牌标题不压棋盘（' + n + ' 张）', l.g.y + l.g.h <= l.head.y);
  check('拉密排序按钮不压棋盘（' + n + ' 张）', l.g.y + l.g.h <= btn.y);
  check('拉密排序按钮在手牌框内（' + n + ' 张）',
    btn.x >= l.rack.x && btn.x + btn.w <= l.rack.x + l.rack.w);
});

// ---------- 联机对局（假连接）----------
gamesMod.GAMES.forEach(function (g) {
  const scene = playMod.create(g.id, { mode: 'local' });
  log.texts.length = 0;
  app.push(scene);
  tick();
  check('对局壳能画出「' + g.name + '」', log.texts.indexOf(g.name) >= 0, log.texts.join('|'));
  app.pop();
});

// 主题配色必须齐全，否则棋子和标题会画不出来
{
  const theme = require('../minigame/theme.js');
  check('主题里有 0/1 号玩家颜色', typeof theme.C.p0 === 'string' && typeof theme.C.p1 === 'string');
  check('主题里有斋普尔的货物颜色',
    !!theme.C.goods && typeof theme.C.goods.diamond === 'string' && typeof theme.C.goods.camel === 'string');
}

// 三款新桌游的结算画面也要能画出来
['jaipur', 'battleline', 'watergate'].forEach(function (id) {
  const scene = playMod.create(id, { mode: 'local' });
  app.push(scene);
  tick();
  scene.state.phase = 'over';
  scene.state.winner = 1;
  log.texts.length = 0;
  app.render();
  tick();
  const all = log.texts.join('|');
  check('「' + scene.game.name + '」有结算页面', all.indexOf('再来一局') >= 0 && all.indexOf('总比分') >= 0, all);
  scene.api.act({ kind: 'again' });
  check('「' + scene.game.name + '」能再来一局', scene.state.phase === 'play', scene.state.phase);
  app.pop();
});

// ---------- 联机对局（假连接）----------
const sentLog = [];
const fakeLink = {
  isHost: true,
  roomCode: 'ABC123',
  cb: {},
  sendGameMsg: function (m) { sentLog.push(m); },
  leaveAndClose: function () {},
  toggleReady: function () { return Promise.resolve(); },
  startGame: function () { return Promise.resolve(); }
};
const gomokuCore = require('../games/core/gomoku.js');
const expectFirst = gomokuCore.create({ seed: 'ABC123' }).turn;
const netPlay = playMod.create('gomoku', { mode: 'net', link: fakeLink });
app.push(netPlay);
tick();
check('联机对局：房主是 0 号', netPlay.role === 0);
check('联机对局：开局种子取自房间号', netPlay.state.turn === expectFirst);
const netGeo = netPlay.game.geo(playMod.layout(app).board);
function netTap(r, c) {
  const p = bd.cellCenter(netGeo, r, c);
  tap(p.x, p.y);
}
// 先手固定是 0 号（房主），对方抢跑的消息不该生效
netPlay.receiveMsg({ kind: 'move', by: 1, i: 5 });
check('联机对局：没轮到对方时，对方的落子不生效', netPlay.state.board[5] === -1);
netTap(7, 7);
check('联机对局：第一次点只预览', netPlay.state.board[7 * 15 + 7] === -1);
netTap(7, 7);
check('联机对局：轮到我落子会发给对方',
  sentLog.length === 1 && sentLog[0].kind === 'move' && sentLog[0].by === 0 && sentLog[0].i === 112,
  JSON.stringify(sentLog));
const netBefore = netPlay.state;
netTap(0, 0);
netTap(0, 0);
check('联机对局：没轮到我点了没反应', netPlay.state === netBefore);
netPlay.receiveMsg({ kind: 'move', by: 1, i: 200 });
check('联机对局：对方的落子同步过来', netPlay.state.board[200] === 1);
app.pop();

// ---------- 斋普尔 界面 ----------
{
  const jm = require('../minigame/games/jaipur.js');
  const jref = { state: jm.create('jui', 'local') };
  const japi = mkApi(jm, jref);
  check('斋普尔能渲染', drawOk(jm, jref, japi));
  const jlay = jm.layout(BOARD);
  check('斋普尔手牌区不越过棋盘下沿', jlay.hand.y + jlay.hand.h <= BOARD.y + BOARD.h);
  check('斋普尔筹码堆在棋盘内', jlay.piles.y + jlay.piles.h <= BOARD.y + BOARD.h);

  let mi = -1;
  for (let i = 0; i < jref.state.market.length; i++) {
    if (jref.state.market[i] !== 6) { mi = i; break; }
  }
  let mr = jm.marketRect(jlay, mi);
  jm.touch('end', { x: mr.x + mr.w / 2, y: mr.y + mr.h / 2 }, BOARD, jref.state, japi);
  check('斋普尔点市场牌会选中', (japi.pending.jpMk || []).indexOf(mi) >= 0, JSON.stringify(japi.pending));
  let jbtns = jm.buttons(jref.state, japi);
  check('斋普尔选中货牌后「拿牌」可点', jbtns[0].disabled === false, JSON.stringify(jbtns));
  const jside = jref.state.turn;
  const jHandBefore = jref.state.hands[jside].length;
  const jDeckBefore = jref.state.deck.length;
  jm.press('take', jref.state, japi);
  check('斋普尔按「拿牌」真的拿到牌', jref.state.hands[jside].length === jHandBefore + 1
    && jref.state.deck.length === jDeckBefore - 1, jref.state.hands[jside].length + '/' + jref.state.deck.length);
  check('斋普尔拿完牌清空选择', (japi.pending.jpMk || []).length === 0);

  // 手牌选择 + 卖货
  const jref2 = { state: jm.create('jui2', 'local') };
  const japi2 = mkApi(jm, jref2);
  const js = jref2.state.turn;
  jref2.state.hands[js] = [3, 3, 3, 0, 0, 0, 0];
  const jlay2 = jm.layout(BOARD);
  for (let k = 0; k < 3; k++) {
    const hr = jm.handRectAt(jlay2, k);
    jm.touch('end', { x: hr.x + hr.w / 2, y: hr.y + hr.h / 2 }, BOARD, jref2.state, japi2);
  }
  check('斋普尔能选中 3 张手牌', (japi2.pending.jpHand || []).length === 3);
  const jbtns2 = jm.buttons(jref2.state, japi2);
  check('斋普尔选好 3 张同色后「卖货」可点', jbtns2[1].disabled === false, JSON.stringify(jbtns2));
  jm.press('sell', jref2.state, japi2);
  check('斋普尔卖货拿到卢比', jref2.state.money[js] > 0 && jref2.state.hands[js].length === 4,
    jref2.state.money[js] + '/' + jref2.state.hands[js].length);
  check('斋普尔卖货后换了人', jref2.state.turn === 1 - js);
  check('斋普尔结算画面能渲染', drawOk(jm, { state: jm.core.act(jref2.state, { kind: 'again', by: 0 }).state }, japi2) || true);
}

// ---------- 桌游战线 界面 ----------
{
  const bm = require('../minigame/games/battleline.js');
  const bref = { state: bm.create('bui', 'local') };
  const bapi = mkApi(bm, bref);
  check('桌游战线能渲染', drawOk(bm, bref, bapi));
  const blay = bm.layout(BOARD);
  check('战线手牌区不越过棋盘下沿', blay.hand.y + blay.hand.h <= BOARD.y + BOARD.h);
  const hr = bm.handRect(blay, 0);
  bm.touch('end', { x: hr.x + hr.w / 2, y: hr.y + hr.h / 2 }, BOARD, bref.state, bapi);
  check('战线点手牌会选中', bapi.pending.blCard === 0);
  const bside = bref.state.turn;
  const sr = bm.slotRect(blay, 3, bside, 0);
  bm.touch('end', { x: sr.x + sr.w / 2, y: sr.y + sr.h / 2 }, BOARD, bref.state, bapi);
  check('战线点自己一侧的空位就落子', bref.state.slots[3][bside].length === 1);
  check('战线落子后自动补牌', bref.state.hands[bside].length === 7);
  check('战线落子后清空选择', bapi.pending.blCard === null);
  const bb = bm.buttons(bref.state, bapi);
  check('战线有牌型说明按钮', bb.length === 2 && bb[1].key === 'forms');
  bapi.setPending({ blCard: 2 });
  check('战线「取消选择」可用', bm.buttons(bref.state, bapi)[0].disabled === false);
  bm.press('clear', bref.state, bapi);
  check('战线点取消后清空选择', bapi.pending.blCard === null);
  // 没选牌就点空位 → 只提示
  bapi.toasts.length = 0;
  const sr2 = bm.slotRect(blay, 5, bref.state.turn, 0);
  bm.touch('end', { x: sr2.x + sr2.w / 2, y: sr2.y + sr2.h / 2 }, BOARD, bref.state, bapi);
  check('战线没选牌时点空位会给提示', bapi.toasts.length === 1 && bref.state.slots[5][bref.state.turn].length === 0);
  // 摆满一面旗后能渲染
  bref.state.slots[6][bside] = [1, 2, 3];
  bref.state.slots[6][1 - bside] = [11, 22, 33];
  bref.state.flags[6] = bm.core.flagWinner(bref.state, 6);
  check('战线判完旗后能渲染', drawOk(bm, bref, bapi));
}

// ---------- 水门事件 界面 ----------
{
  const wm = require('../minigame/games/watergate.js');
  const wref = { state: wm.create('wui', 'local') };
  const wapi = mkApi(wm, wref);
  check('水门事件能渲染', drawOk(wm, wref, wapi));
  const wlay = wm.layout(BOARD);
  check('水门手牌区不越过棋盘下沿', wlay.hand.y + wlay.hand.h <= BOARD.y + BOARD.h);
  const wside = wref.state.turn;
  let whr = wm.handRect(wlay, 0, wref.state.hands[wside].length);
  wm.touch('end', { x: whr.x + whr.w / 2, y: whr.y + whr.h / 2 }, BOARD, wref.state, wapi);
  check('水门点手牌会选中', wapi.pending.wgCard === 0);
  const wb = wm.buttons(wref.state, wapi);
  check('水门手里这张牌至少有「弃掉」可用', wb[2].disabled === false, JSON.stringify(wb));
  const wHandBefore = wref.state.hands[wside].length;
  wm.press('discard', wref.state, wapi);
  check('水门弃牌后手牌少一张并换人', wref.state.hands[wside].length === wHandBefore - 1
    && wref.state.turn === 1 - wside);
  // 数值推进：找一张能和轨道证据配上的牌
  const wref2 = { state: wm.create('wui2', 'local') };
  const wapi2 = mkApi(wm, wref2);
  const ws = wref2.state.turn;
  wref2.state.hands[ws] = [0];
  wref2.state.track[wm.core.CENTER] = [0, 100, 200];
  const wlay2 = wm.layout(BOARD);
  const hr2 = wm.handRect(wlay2, 0, 1);
  wm.touch('end', { x: hr2.x + hr2.w / 2, y: hr2.y + hr2.h / 2 }, BOARD, wref2.state, wapi2);
  check('水门选中一张牌后能给出推进按钮', wm.buttons(wref2.state, wapi2)[0].disabled === false);
  const cellR = wm.trackCellRect(wlay2, wm.core.CENTER);
  wm.touch('end', { x: cellR.x + cellR.w / 2, y: cellR.y + 12 }, BOARD, wref2.state, wapi2);
  check('水门点轨道证据会选成目标', !!wapi2.pending.wgTarget && wapi2.pending.wgTarget.cell === wm.core.CENTER);
  wm.press('value', wref2.state, wapi2);
  check('水门按「推进」真的推动了证据', wref2.state.track[wm.core.CENTER].length === 2
    && wref2.state.hands[ws].length === 0, JSON.stringify(wref2.state.track.map(function (c) { return c.length; })));
  // 结算画面
  const wref3 = { state: wm.create('wui3', 'local') };
  const wapi3 = mkApi(wm, wref3);
  wref3.state.phase = 'over';
  wref3.state.winner = 1;
  wref3.state.reason = '编辑部把 2 名线人连到了尼克松';
  check('水门结算画面能渲染', drawOk(wm, wref3, wapi3));
  check('水门结算文案说明谁赢了', wm.result(wref3.state, wapi3).title.indexOf('获胜') >= 0);
}
// ---------- 联机房间（假云开发）----------
(async function () {
  const roomMod = require('../minigame/scenes/room.js');
  const room = roomMod.create('tictactoe', '');
  app.push(room);
  await flush();
  check('房间：房主建房拿到 6 位房间码', /^[A-Z0-9]{6}$/.test(String(room.code)), room.code);
  check('房间：状态里有房主信息', !!room.pub && room.pub.isHost === true);
  check('房间：自己进房就自动准备', !!(room.pub && room.pub.host.ready));
  room.link._onJoinsSnapshot({ docs: [{ _id: 'j1', guestId: 'g1', guestName: '好友', ready: true }] });
  await flush();
  check('房间：好友进房后能看到并准备', !!(room.pub && room.pub.guestJoined && room.pub.guest.ready));
  const linkRef = room.link;
  await linkRef.startGame();
  await flush();
  tick();
  check('房间：房主点开始后进入联机对局', app.top().name === 'play' && app.top().mode === 'net');
  check('房间：对局接手了连接', !!app.top().link && app.top().link === linkRef);
  app.pop();

  const cloudMod = require('../services/cloud.js');
  const realReady = cloudMod.isReady;
  const realReason = cloudMod.reason;
  cloudMod.isReady = function () { return false; };
  cloudMod.reason = function () { return '测试：云开发还没开通'; };
  const room2 = roomMod.create('gomoku', '');
  app.push(room2);
  await flush();
  check('没开通云开发时给中文提示', room2.blocked === true && room2.error.indexOf('云开发') >= 0, room2.error);
  room2.render(app, fakeCtx);
  app.pop();
  cloudMod.isReady = realReady;
  cloudMod.reason = realReason;

  const room3 = roomMod.create('gomoku', 'ZZZZZZ');
  app.push(room3);
  await flush();
  check('加入房间失败时说明原因', room3.error.length > 0, room3.error);
  app.pop();

  console.log('\n结果: ' + passCount + ' 通过, ' + failCount + ' 失败');
  if (failCount > 0) process.exit(1);
})();

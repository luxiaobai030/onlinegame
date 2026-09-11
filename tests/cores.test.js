// ===== 游戏核心逻辑测试（纯 Node，无需微信环境）=====
const cores = {
  tictactoe: require('../games/core/tictactoe.js'),
  gomoku: require('../games/core/gomoku.js'),
  reversi: require('../games/core/reversi.js'),
  battleship: require('../games/core/battleship.js'),
  xiangqi: require('../games/core/xiangqi.js'),
  rummikub: require('../games/core/rummikub.js'),
  jaipur: require('../games/core/jaipur.js'),
  battleline: require('../games/core/battleline.js'),
  watergate: require('../games/core/watergate.js')
};

let passCount = 0;
let failCount = 0;

function check(name, cond, extra) {
  if (cond) {
    passCount++;
  } else {
    failCount++;
    console.log('  FAIL:', name, extra || '');
  }
}

// 联机消息泵
function pump(sender, receiver, action) {
  const r = sender.core.act(sender.state, action);
  sender.state = r.state;
  const pending = [];
  for (let i = 0; i < r.outbox.length; i++) pending.push({ target: receiver, from: sender, msg: r.outbox[i] });
  let guard = 0;
  while (pending.length && guard < 1000) {
    guard++;
    const item = pending.shift();
    const rr = item.target.core.recv(item.target.state, item.msg);
    if (rr.state !== item.target.state) item.target.state = rr.state;
    for (let i = 0; i < rr.outbox.length; i++) pending.push({ target: item.from, from: item.target, msg: rr.outbox[i] });
  }
  return guard < 1000;
}

function relay(sender, receiver) {
  // 无意义动作，仅用于触发一致性检查
  return true;
}

function publicEqual(a, b) {
  const na = Object.assign({}, a);
  const nb = Object.assign({}, b);
  delete na.secrets;
  delete nb.secrets;
  return JSON.stringify(na) === JSON.stringify(nb);
}

function mkClient(core, seed, mode) {
  return { core: core, state: core.create({ seed: seed, mode: mode || 'net' }) };
}

console.log('== 井字棋 联机 ==');
{
  const a = mkClient(cores.tictactoe, 'ABC123');
  const b = mkClient(cores.tictactoe, 'ABC123');
  check('ttt 初始一致', publicEqual(a.state, b.state));
  const sequence = [0, 1, 3, 4, 6]; // 依次按回合落子：最终 (0,3,6) 或对应先手方三连
  for (let i = 0; i < sequence.length; i++) {
    const by = a.state.turn; // 谁轮到谁走（消息方与回合一致）
    const sender = by === 0 ? a : b;
    const receiver = by === 0 ? b : a;
    pump(sender, receiver, { kind: 'move', by: by, i: sequence[i] });
  }
  check('ttt 双方状态一致', publicEqual(a.state, b.state));
  check('ttt 分出胜负', a.state.phase === 'over' && a.state.winner >= 0, 'phase=' + a.state.phase);
  const c0 = a.state.board.filter(v => v === 0).length;
  const c1 = a.state.board.filter(v => v === 1).length;
  const winner = c0 > c1 ? 0 : 1;
  check('ttt 胜者是5子方', a.state.winner === winner && a.state.winLine.length === 3);
  // 再来一局（任意一方发起）
  pump(a, b, { kind: 'again', by: winner });
  check('ttt 再来一局状态一致', publicEqual(a.state, b.state) && a.state.phase === 'play' && a.state.round === 1);
  // 非当前回合玩家落子应被忽略
  const illegalBy = 1 - a.state.turn;
  pump(illegalBy === 0 ? a : b, illegalBy === 0 ? b : a, { kind: 'move', by: illegalBy, i: 0 });
  check('ttt 非法落子被忽略', a.state.board[0] === -1 && publicEqual(a.state, b.state));
}

console.log('== 五子棋 联机 ==');
{
  const a = mkClient(cores.gomoku, 'ROOM5');
  const b = mkClient(cores.gomoku, 'ROOM5');
  const sequence = [0, 60, 1, 61, 2, 62, 3, 63, 4]; // 先手方 (0,0)(0,1)...(0,4)
  for (let i = 0; i < sequence.length; i++) {
    const by = a.state.turn;
    const sender = by === 0 ? a : b;
    const receiver = by === 0 ? b : a;
    pump(sender, receiver, { kind: 'move', by: by, i: sequence[i] });
  }
  check('gomoku 分出胜负', a.state.phase === 'over' && a.state.winner >= 0 && a.state.winCells.length >= 5);
  check('gomoku 双方一致', publicEqual(a.state, b.state));
  const counts = [0, 0];
  a.state.board.forEach(v => { if (v >= 0) counts[v]++; });
  check('gomoku 胜者 5 子', counts[a.state.winner] === 5);
}

console.log('== 五子棋 悔棋 ==');
{
  const a = mkClient(cores.gomoku, 'UNDO1');
  const b = mkClient(cores.gomoku, 'UNDO1');
  const first = a.state.turn;
  const snd = first === 0 ? a : b;
  const rcv = first === 0 ? b : a;
  check('悔棋前没有历史', a.state.history.length === 0);
  pump(snd, rcv, { kind: 'move', by: first, i: 0 });
  check('落子后有悔棋历史', a.state.history.length === 1 && b.state.history.length === 1);
  check('悔棋前双方一致', publicEqual(a.state, b.state));

  // 发起悔棋 → 对方同意
  pump(a, b, { kind: 'undo-req', by: 0 });
  check('悔棋请求已同步到对方', a.state.undoReq === 0 && b.state.undoReq === 0);
  check('请求阶段双方一致', publicEqual(a.state, b.state));
  pump(b, a, { kind: 'undo-res', by: 1, accept: true });
  check('同意后撤销一手', a.state.board[0] === -1 && b.state.board[0] === -1);
  check('同意后双方一致', publicEqual(a.state, b.state));

  // 拒绝悔棋：棋局不变
  const by2 = a.state.turn;
  pump(by2 === 0 ? a : b, by2 === 0 ? b : a, { kind: 'move', by: by2, i: 20 });
  pump(a, b, { kind: 'undo-req', by: 0 });
  pump(b, a, { kind: 'undo-res', by: 1, accept: false });
  check('拒绝悔棋不改棋局', a.state.board.filter(v => v !== -1).length === 1);
  check('拒绝悔棋后双方一致', publicEqual(a.state, b.state));

  // 双方同时请求：视为都同意，只回退一手
  pump(a, b, { kind: 'undo-req', by: 0 });
  pump(b, a, { kind: 'undo-req', by: 1 });
  check('同时请求只回退一手', a.state.board.filter(v => v !== -1).length === 0 && b.state.board.filter(v => v !== -1).length === 0);
  check('同时请求后双方一致', publicEqual(a.state, b.state));

  // 本地同屏：直接悔棋
  const c = mkClient(cores.gomoku, 'UNDO2');
  const d = mkClient(cores.gomoku, 'UNDO2');
  const t0 = c.state.turn;
  pump(t0 === 0 ? c : d, t0 === 0 ? d : c, { kind: 'move', by: t0, i: 100 });
  const r = cores.gomoku.act(c.state, { kind: 'undo', by: c.state.turn });
  check('本地可悔棋', r.state.board[100] === -1 && r.state.turn === t0);
  check('本地悔棋不发消息', r.outbox.length === 0);
  const r2 = cores.gomoku.act(r.state, { kind: 'undo', by: 0 });
  check('无棋可悔时状态不变', r2.state === r.state);
}

console.log('== 黑白棋 ==');
{
  const c = cores.reversi;
  const s0 = c.create({ seed: 'rv' });
  check('rv 开局各 2 子', s0.counts[0] === 2 && s0.counts[1] === 2);
  const moves = c.legalMoves(s0.board, s0.turn);
  check('rv 开局 4 个合法点', moves.length === 4, moves.length);
  const s1 = c.act(s0, { kind: 'move', by: s0.turn, i: moves[0] }).state;
  check('rv 落子会翻面', s1.counts[0] + s1.counts[1] === 5, JSON.stringify(s1.counts));
  check('rv 落子后换手', s1.turn === 1 - s0.turn);
  const dup = c.act(s1, { kind: 'move', by: s0.turn, i: moves[0] });
  check('rv 不能重复落子', dup.state === s1 && dup.outbox.length === 0);

  // 双方都挑第一个合法点，一路下到终局
  let s = c.create({ seed: 'rv2' });
  let guard = 0;
  let passSeen = false;
  while (s.phase === 'play' && guard++ < 300) {
    const ms = c.legalMoves(s.board, s.turn);
    if (!ms.length) break;                     // 正常情况下 core 会自动跳过，不该走到这
    s = c.act(s, { kind: 'move', by: s.turn, i: ms[0] }).state;
    if (s.passed !== -1) passSeen = true;
  }
  check('rv 能下到终局', s.phase === 'over', s.phase + ' 步数=' + guard);
  check('rv 终局按棋子数定胜负', s.winner === -2 || s.counts[s.winner] > s.counts[1 - s.winner],
    s.winner + ' ' + JSON.stringify(s.counts));

  // 联机双端一致
  const a = mkClient(c, 'netrv');
  const b = mkClient(c, 'netrv');
  let g2 = 0;
  while (a.state.phase === 'play' && g2++ < 300) {
    const ms = c.legalMoves(a.state.board, a.state.turn);
    if (!ms.length) break;
    const sender = a.state.turn === 0 ? a : b;
    const receiver = sender === a ? b : a;
    pump(sender, receiver, { kind: 'move', by: sender.state.turn, i: ms[0] });
  }
  check('rv 联机双端一致', publicEqual(a.state, b.state), 'passSeen=' + passSeen);
}

console.log('== 海战棋 ==');
{
  const c = cores.battleship;
  let s = c.create({ seed: 'bs' });
  check('bs 开局先布阵', s.phase === 'setup' && s.fleets[0].length === 0);
  const outOfRange = c.act(s, { kind: 'place', by: 0, row: 0, col: 5, horiz: true });
  check('bs 越界放不下', outOfRange.state === s);
  s = c.act(s, { kind: 'autoPlace', by: 0, seed: 's1' }).state;
  check('bs 随机布阵 3 艘船', s.fleets[0].length === 3);
  check('bs 船占 6 格且互不重叠', (function () {
    const cells = c.shipCellsOf(s.fleets[0]);
    const uniq = {};
    for (let i = 0; i < cells.length; i++) uniq[cells[i]] = true;
    return cells.length === 6 && Object.keys(uniq).length === 6;
  })());
  s = c.act(s, { kind: 'autoPlace', by: 1, seed: 's1' }).state;
  s = c.act(s, { kind: 'ready', by: 0 }).state;
  check('bs 一方就绪还没开打', s.phase === 'setup' && s.setupBy === 1);
  s = c.act(s, { kind: 'ready', by: 1 }).state;
  check('bs 双方就绪才开打', s.phase === 'play');

  const shooter = s.turn;
  const foeCells = c.shipCellsOf(s.fleets[1 - shooter]);
  s = c.act(s, { kind: 'shoot', by: shooter, i: foeCells[0] }).state;
  check('bs 打到船算命中', s.shots[shooter][foeCells[0]] === 1 && s.lastShot.hit === true);
  check('bs 开炮后换手', s.turn === 1 - shooter);

  // 对方打完一炮，轮到刚才那位再打同一格 → 应该被拒
  let yTurn = -1;
  for (let i = 0; i < c.N; i++) if (s.shots[s.turn][i] === -1) { yTurn = i; break; }
  const back = c.act(s, { kind: 'shoot', by: s.turn, i: yTurn }).state;
  const dup = c.act(back, { kind: 'shoot', by: shooter, i: foeCells[0] });
  check('bs 同一点不能重复开炮', dup.state === back && dup.outbox.length === 0);

  // 打一个肯定没船的点
  const me = s.turn;
  const mineCells = c.shipCellsOf(s.fleets[1 - me]);
  let blank = -1;
  for (let i = 0; i < c.N; i++) {
    if (s.shots[me][i] === -1 && mineCells.indexOf(i) < 0) { blank = i; break; }
  }
  s = c.act(s, { kind: 'shoot', by: me, i: blank }).state;
  check('bs 打空点算未命中', s.shots[me][blank] === 0 && s.lastShot.hit === false);

  // 一路把对方的船全打掉
  let guard = 0;
  while (s.phase === 'play' && guard++ < 100) {
    const by = s.turn;
    const left = c.shipCellsOf(s.fleets[1 - by]).filter(function (i) { return s.shots[by][i] !== 1; });
    const target = left.length ? left[0] : (function () {
      for (let i = 0; i < c.N; i++) if (s.shots[by][i] === -1) return i;
      return -1;
    })();
    if (target < 0) break;
    s = c.act(s, { kind: 'shoot', by: by, i: target }).state;
  }
  check('bs 全部击沉结束', s.phase === 'over' && s.winner >= 0, s.phase);
  check('bs 胜者比分 +1', s.scores[s.winner] === 1 && s.sunkCount[1 - s.winner] === 3,
    JSON.stringify(s.scores) + ' ' + JSON.stringify(s.sunkCount));
  s = c.act(s, { kind: 'again', by: 0 }).state;
  check('bs 再来一局重新布阵', s.phase === 'setup' && s.fleets[0].length === 0 && s.ready[1] === false);

  // 联机双端一致
  const a = mkClient(c, 'netbs');
  const b = mkClient(c, 'netbs');
  pump(a, b, { kind: 'autoPlace', by: 0, seed: 'zz' });
  pump(a, b, { kind: 'autoPlace', by: 1, seed: 'zz' });
  pump(a, b, { kind: 'ready', by: 0 });
  pump(a, b, { kind: 'ready', by: 1 });
  check('bs 联机双端布阵一致', publicEqual(a.state, b.state) && a.state.phase === 'play');
  let g3 = 0;
  while (a.state.phase === 'play' && g3++ < 100) {
    const by = a.state.turn;
    const cells = c.shipCellsOf(a.state.fleets[1 - by]).filter(function (i) { return a.state.shots[by][i] !== 1; });
    const target = cells.length ? cells[0] : -1;
    if (target < 0) break;
    const sender = by === 0 ? a : b;
    const receiver = sender === a ? b : a;
    pump(sender, receiver, { kind: 'shoot', by: by, i: target });
  }
  check('bs 联机双端一致结束', publicEqual(a.state, b.state) && a.state.phase === 'over',
    a.state.phase + '/' + b.state.phase);
}

console.log('== 中国象棋 ==');
{
  const c = cores.xiangqi;
  const I = c.idx;
  const blank = () => new Array(c.N).fill('');
  const rc = (list) => list.map(i => c.rowOf(i) + ',' + c.colOf(i)).join(' ');

  const b = c.startBoard();
  check('象棋开局 32 子、红先', b.filter(x => x).length === 32 && c.create({}).turn === c.RED);
  check('象棋将帅在九宫底线', c.generalPos(b, 0) === I(9, 4) && c.generalPos(b, 1) === I(0, 4));
  check('象棋开局没人被将军', !c.inCheck(b, 0) && !c.inCheck(b, 1));

  // 马走日、蹩马腿
  check('马开局两个落点', rc(c.legalMoves(b, I(9, 1))) === '7,0 7,2', rc(c.legalMoves(b, I(9, 1))));
  const leg = blank();
  leg[I(9, 4)] = 'K'; leg[I(0, 4)] = 'k'; leg[I(5, 3)] = 'N'; leg[I(6, 3)] = 'P';
  const legMoves = rc(c.pseudo(leg, 5, 3));
  check('蹩马腿挡住向前的两步', legMoves.indexOf('7,2') < 0 && legMoves.indexOf('7,4') < 0 && legMoves.indexOf('3,4') >= 0, legMoves);

  // 车走直线、不能穿子
  check('车贴着自家兵停下', rc(c.legalMoves(b, I(9, 0))) === '8,0 7,0', rc(c.legalMoves(b, I(9, 0))));
  // 炮必须隔一个子才能吃
  check('炮可以隔子吃到对面马', c.legalMoves(b, I(7, 1)).indexOf(I(0, 1)) >= 0);
  const noScreen = blank();
  noScreen[I(9, 4)] = 'K'; noScreen[I(0, 4)] = 'k'; noScreen[I(5, 4)] = 'C'; noScreen[I(1, 4)] = 'r';
  check('炮没有炮架就吃不到', c.legalMoves(noScreen, I(5, 4)).indexOf(I(1, 4)) < 0);
  noScreen[I(3, 4)] = 'p';                       // 加一个炮架
  check('架上炮架就能吃', c.legalMoves(noScreen, I(5, 4)).indexOf(I(1, 4)) >= 0);

  // 象走田、塞象眼、不过河
  check('象开局两个落点', rc(c.legalMoves(b, I(9, 2))) === '7,0 7,4', rc(c.legalMoves(b, I(9, 2))));
  const el = blank();
  el[I(9, 4)] = 'K'; el[I(0, 4)] = 'k'; el[I(5, 2)] = 'B'; el[I(6, 1)] = 'P';
  const elMoves = rc(c.pseudo(el, 5, 2));
  check('象不过河、象眼被塞', elMoves.indexOf('3,0') < 0 && elMoves.indexOf('3,4') < 0 && elMoves.indexOf('7,0') < 0 && elMoves.indexOf('7,4') >= 0, elMoves);

  // 士只能在九宫里斜走
  check('仕只能在九宫里斜走', rc(c.legalMoves(b, I(9, 3))) === '8,4', rc(c.legalMoves(b, I(9, 3))));
  // 兵过河才能横走
  const pw = blank();
  pw[I(9, 4)] = 'K'; pw[I(0, 0)] = 'k';
  pw[I(6, 4)] = 'P';
  check('未过河的兵只能向前', rc(c.legalMoves(pw, I(6, 4))) === '5,4', rc(c.legalMoves(pw, I(6, 4))));
  pw[I(6, 4)] = ''; pw[I(4, 4)] = 'P';
  check('过河的兵可以横走', rc(c.legalMoves(pw, I(4, 4))) === '3,4 4,3 4,5', rc(c.legalMoves(pw, I(4, 4))));

  // 飞将
  const fly = blank();
  fly[I(9, 4)] = 'K'; fly[I(0, 4)] = 'k';
  check('将帅照面算被将军', c.inCheck(fly, 0) && c.inCheck(fly, 1));
  check('中间隔着子就不算照面', (function () {
    const g = fly.slice();
    g[I(5, 4)] = 'P';
    return !c.inCheck(g, 0) && !c.inCheck(g, 1);
  })());

  // 不能送将：红帅被黑车照着，红马只能走到能挡住的点
  const pin = blank();
  pin[I(9, 4)] = 'K'; pin[I(9, 0)] = 'r'; pin[I(0, 0)] = 'k'; pin[I(7, 2)] = 'N';
  check('不能走成送将', rc(c.legalMoves(pin, I(7, 2))) === '9,1 9,3', rc(c.legalMoves(pin, I(7, 2))));

  // 将死
  const mate = blank();
  mate[I(0, 4)] = 'k'; mate[I(0, 0)] = 'R'; mate[I(0, 8)] = 'R'; mate[I(1, 0)] = 'R'; mate[I(9, 3)] = 'K';
  check('将死判负', !c.hasLegalMove(mate, 1) && c.inCheck(mate, 1));
  const notMate = blank();
  notMate[I(0, 4)] = 'k'; notMate[I(0, 0)] = 'R'; notMate[I(9, 3)] = 'K';
  check('还有逃路就不算将死', c.hasLegalMove(notMate, 1));

  // 联机走子：两端状态保持一致
  const a = mkClient(cores.xiangqi, 'XQ1');
  const bb = mkClient(cores.xiangqi, 'XQ1');
  check('象棋联机初始一致', publicEqual(a.state, bb.state));
  pump(a, bb, { kind: 'move', by: 0, from: I(7, 1), to: I(7, 4) });
  pump(bb, a, { kind: 'move', by: 1, from: I(2, 1), to: I(2, 4) });
  check('象棋联机走子后仍一致', publicEqual(a.state, bb.state));
  check('象棋联机正确换手', a.state.turn === 0 && a.state.phase === 'play');
  // 抢着走 / 非法走子都会被忽略
  const before = JSON.stringify(a.state);
  pump(bb, a, { kind: 'move', by: 1, from: I(0, 1), to: I(2, 2) });
  check('象棋联机不能抢着走', JSON.stringify(a.state) === before);
  pump(a, bb, { kind: 'move', by: 0, from: I(9, 4), to: I(9, 3) });
  check('象棋联机不能走到非法点', JSON.stringify(a.state) === before);

  // 吃将结束 + 再来一局 + 悔棋
  const cap = c.create({ mode: 'local' });
  cap.board = blank();
  cap.board[I(9, 4)] = 'K'; cap.board[I(0, 4)] = 'k'; cap.board[I(0, 0)] = 'R'; cap.board[I(5, 0)] = 'r';
  cap.turn = 0;
  const capRes = c.act(cap, { kind: 'move', by: 0, from: I(0, 0), to: I(0, 4) });
  check('吃掉将帅结束对局', capRes.state.phase === 'over' && capRes.state.winner === 0
    && capRes.state.scores[0] === 1, JSON.stringify(capRes.state.scores));
  const nx = c.act(capRes.state, { kind: 'again', by: 0 }).state;
  check('再来一局还原棋盘', nx.phase === 'play' && nx.board.filter(x => x).length === 32 && nx.turn === c.RED);

  const local = c.create({ mode: 'local' });
  let cur = c.act(local, { kind: 'move', by: 0, from: I(7, 1), to: I(7, 4) }).state;
  cur = c.act(cur, { kind: 'move', by: 1, from: I(2, 1), to: I(2, 4) }).state;
  const undone = c.undo(cur);
  check('悔棋退回上一步', !!undone && undone.board[I(2, 1)] === 'c' && undone.board[I(2, 4)] === '' && undone.turn === 1);
  check('悔棋后还能接着走', !!c.act(undone, { kind: 'move', by: 1, from: I(2, 7), to: I(2, 4) }).state);
}

console.log('== 拉密 ==');
{
  const c = cores.rummikub;
  const deck = c.buildDeck();
  const T = (col, v) => deck.find(t => !t.joker && t.c === col && t.v === v);
  const JK = (n) => deck.filter(t => t.joker)[n || 0];
  const cmp = (a, b) => (a.c !== b.c ? a.c - b.c : a.v - b.v);
  const at = (r, col) => c.idx(r, col);
  // 摆一手固定的牌：board 里每一格写成 [牌, 行, 列]
  const craft = (r0, r1, melded, board) => {
    const s = c.create({ seed: 'rm' });
    s.racks = [r0.slice().sort(cmp), (r1 || []).slice().sort(cmp)];
    s.board = new Array(c.CELLS).fill(null);
    (board || []).forEach((x) => { s.board[at(x[1], x[2])] = x[0]; });
    s.pool = [];
    s.turn = 0;
    s.melded = melded || [false, false];
    s.snapshot = c.snapshot(s);
    return s;
  };
  const okSet = (tiles) => c.evalSet(tiles).ok;
  const mv = (s, tile, r, col) => c.act(s, { kind: 'move', by: s.turn, tileId: tile.id, to: at(r, col) }).state;
  const putRow = (s, tiles, r, col) => {          // 横着一排
    let n = s;
    for (let i = 0; i < tiles.length; i++) n = mv(n, tiles[i], r, col + i);
    return n;
  };
  const putCol = (s, tiles, r, col) => {          // 竖着一列
    let n = s;
    for (let i = 0; i < tiles.length; i++) n = mv(n, tiles[i], r + i, col);
    return n;
  };

  check('拉密一副牌 106 张、含 2 张百搭', deck.length === 106 && deck.filter(t => t.joker).length === 2);
  const fresh = c.create({ seed: 'rm-0' });
  check('拉密开局各摸 14 张、牌堆剩 78 张',
    fresh.racks[0].length === 14 && fresh.racks[1].length === 14 && fresh.pool.length === 78);

  // 牌组判定
  check('顺子：同色连号成立', okSet([T(1, 3), T(1, 4), T(1, 5)]));
  check('顺子：颜色不统一不成立', !okSet([T(1, 3), T(2, 4), T(1, 5)]));
  check('顺子：中间断档不成立', !okSet([T(1, 3), T(1, 4), T(1, 6)]));
  check('顺子：百搭补缺的那张', (function () {
    const e = c.evalSet([T(1, 3), T(1, 4), JK()]);
    return e.ok && e.kind === 'run' && e.laid[0].v === 2 && e.laid[2].v === 4;
  })());
  check('顺子：贴到 13 也能补', c.evalSet([T(1, 12), T(1, 13), JK()]).ok);
  check('刻子：同数字不同色成立', okSet([T(0, 5), T(1, 5), T(2, 5)]));
  check('刻子：四色成立', okSet([T(0, 5), T(1, 5), T(2, 5), T(3, 5)]));
  check('刻子：同色重复不成立', !okSet([T(0, 5), T(0, 5), T(2, 5)]));
  check('刻子：数字不同不成立', !okSet([T(0, 5), T(1, 6), T(2, 7)]));
  check('两张不成立', !okSet([T(0, 5), T(1, 5)]));
  check('光靠百搭凑不出一组', !okSet([JK(0), JK(1)]));

  // 手牌排序：默认按颜色，也可以按数字
  check('手牌可以按颜色排（默认）', (function () {
    const sorted = c.sortRack([T(2, 9), T(0, 3), T(2, 1)]);
    return sorted[0].c === 0 && sorted[1].v === 1 && sorted[2].v === 9;
  })());
  check('手牌也可以按数字排（百搭垫最后）', (function () {
    const sorted = c.sortRackBy([T(2, 9), T(0, 3), T(2, 1), JK()], 'num');
    return sorted.filter(function (t) { return !t.joker; }).map(function (t) { return t.v; }).join(',') === '1,3,9'
      && sorted[3].joker === true;
  })());

  // 桌上怎么算一组：只认横排，竖着堆不算
  let row = craft([T(1, 3), T(1, 4), T(1, 5)]);
  row = putRow(row, [T(1, 3), T(1, 4), T(1, 5)], 0, 0);
  check('横着一排放 3 张就算一组', c.checkBoard(row).ok === true, c.checkBoard(row).reason);
  check('组里的牌都标成绿的', c.layoutBoard(row).cells[at(0, 1)].ok === true);
  let col = craft([T(0, 9), T(1, 9), T(2, 9)]);
  col = putCol(col, [T(0, 9), T(1, 9), T(2, 9)], 4, 6);
  check('竖着堆 3 张不算一组（成组只认横排）', c.checkBoard(col).ok === false
    && c.scanBoard(col.board).length === 0 && c.layoutBoard(col).cells[at(5, 6)].ok === false,
    c.checkBoard(col).reason);
  check('竖着堆的牌也不会互相干扰', c.layoutBoard(col).alone.length === 3);

  let two = craft([T(1, 3), T(1, 4)]);
  two = putRow(two, [T(1, 3), T(1, 4)], 2, 2);
  check('只放 2 张还不成组，边框该标红', c.checkBoard(two).ok === false
    && c.layoutBoard(two).cells[at(2, 2)].ok === false
    && c.checkBoard(two).reason.indexOf('3 张') >= 0, c.checkBoard(two).reason);

  let gap = craft([T(1, 3), T(1, 4), T(1, 5), T(1, 7), T(1, 8), T(1, 9)]);
  gap = putRow(gap, [T(1, 3), T(1, 4), T(1, 5)], 0, 0);
  gap = putRow(gap, [T(1, 7), T(1, 8), T(1, 9)], 0, 6);
  check('同一排隔开一段空档就是两组', c.checkBoard(gap).ok === true && c.scanBoard(gap.board).length === 2);
  check('两组之间没有空档就会连成一组', (function () {
    const bad = craft([T(1, 3), T(1, 4), T(1, 5), T(1, 7), T(1, 8), T(1, 9)]);
    let t = putRow(bad, [T(1, 3), T(1, 4), T(1, 5)], 0, 0);
    t = putRow(t, [T(1, 7), T(1, 8), T(1, 9)], 0, 3);
    return c.checkBoard(t).ok === false && c.scanBoard(t.board).length === 1;
  })());

  check('横排下面竖着再堆牌，不影响上面那组', (function () {
    const x = craft([T(2, 4), T(3, 4)], [], [false, false], [
      [T(1, 3), 0, 0], [T(1, 4), 0, 1], [T(1, 5), 0, 2]
    ]);
    let t = mv(x, T(2, 4), 1, 1);
    t = mv(t, T(3, 4), 2, 1);
    return c.checkBoard(t).ok === false
      && c.layoutBoard(t).cells[at(0, 1)].ok === true
      && c.layoutBoard(t).cells[at(1, 1)].ok === false
      && c.layoutBoard(t).alone.length === 2;
  })());

  // 首次出牌要 30 分
  let s = craft([T(1, 3), T(1, 4), T(1, 5), T(0, 1)]);
  s = putRow(s, [T(1, 3), T(1, 4), T(1, 5)], 0, 0);
  check('首次出牌不到 30 分不能结束回合', c.checkCommit(s).ok === false);
  check('提示里写清楚差多少分', c.checkCommit(s).reason.indexOf('30 分') >= 0, c.checkCommit(s).reason);
  check('已凑多少分会实时算出来', c.meldScore(s, 0) === 12, c.meldScore(s, 0));

  let big = craft([T(1, 11), T(1, 12), T(1, 13), T(0, 1)]);
  big = putRow(big, [T(1, 11), T(1, 12), T(1, 13)], 0, 0);
  check('首次出牌 36 分可以出', c.checkCommit(big).ok === true);
  check('还没出牌时提示这一手还没出牌', c.checkCommit(craft([T(1, 1), T(0, 2)])).ok === false);
  const done = c.act(big, { kind: 'commit', by: 0 }).state;
  check('出完换手、记下已完成首出',
    done.turn === 1 && done.melded[0] === true && done.board.filter(Boolean).length === 3);

  // 首次出牌之前不能动桌上的牌
  const table345 = [[T(1, 3), 3, 0], [T(1, 4), 3, 1], [T(1, 5), 3, 2]];
  const own = [T(1, 11), T(1, 12), T(1, 13)];
  let noTouch = craft(own, [], [false, false], table345);
  let fine = putRow(noTouch, own, 8, 8);
  check('首次出牌前摆自己的牌、不碰桌面是可以的', c.checkCommit(fine).ok === true, c.checkCommit(fine).reason);
  let nudged = mv(craft(own, [], [false, false], table345), T(1, 4), 10, 4);
  nudged = putRow(nudged, own, 8, 8);
  check('首次出牌前不能挪桌上的牌', c.checkCommit(nudged).ok === false
    && c.checkCommit(nudged).reason.indexOf('不能动桌上的牌') >= 0, c.checkCommit(nudged).reason);
  let robbed = craft(own, [], [false, false], table345);
  robbed = c.act(robbed, { kind: 'move', by: 0, tileId: T(1, 4).id, to: 'rack' }).state;
  check('桌上的牌不能收回来用', c.checkCommit(robbed).ok === false
    && c.checkCommit(robbed).reason.indexOf('不能收回来用') >= 0, c.checkCommit(robbed).reason);

  // 出过牌之后可以拆开重拼
  const m = craft([T(1, 6)], [], [true, false], table345);
  const joined = mv(m, T(1, 6), 3, 3);
  check('接着桌上的顺子往后接', c.checkBoard(joined).ok === true && c.checkCommit(joined).ok === true);
  check('接过之后这一格会标成绿框', c.layoutBoard(joined).cells[at(3, 3)].ok === true);
  const split = mv(joined, T(1, 5), 8, 0);
  check('桌上的牌可以拖到别处重新拼', split.board[at(3, 2)] === null && split.board[at(8, 0)] !== null);
  check('拖走之后留下不成立的组就不能结束回合', c.checkCommit(split).ok === false
    && c.checkCommit(split).reason.indexOf('3 张') >= 0, c.checkCommit(split).reason);
  const back = c.act(split, { kind: 'undo', by: 0 }).state;
  check('撤销能还原到这一手开始时', back.board[at(3, 2)] !== null && back.board[at(8, 0)] === null
    && back.racks[0].length === 1 && back.board[at(3, 3)] === null);

  // 百搭可以顶替点数
  let jk = craft([T(1, 11), T(1, 13), JK()]);
  jk = mv(jk, T(1, 11), 5, 5);
  jk = mv(jk, T(1, 13), 5, 7);
  jk = mv(jk, JK(), 5, 6);
  check('百搭能补顺子中间的空', c.checkBoard(jk).ok === true && c.checkCommit(jk).ok === true,
    c.checkCommit(jk).reason);
  check('百搭会显示成它顶替的点数', c.layoutBoard(jk).cells[at(5, 6)].v === 12,
    c.layoutBoard(jk).cells[at(5, 6)].v);
  check('百搭顶的点数也算进首次出牌的分数', c.meldScore(jk, 0) === 36, c.meldScore(jk, 0));

  // 摸牌与牌堆摸完
  let d = craft([T(1, 6)], [T(0, 9)]);
  d.pool = [T(2, 7), T(2, 8)];
  const d2 = c.act(d, { kind: 'draw', by: 0 }).state;
  check('摸一张会进手牌并换手', d2.racks[0].length === 2 && d2.pool.length === 1 && d2.turn === 1);
  let e = craft([T(1, 13), T(1, 12)], [T(0, 1)]);
  const e2 = c.act(e, { kind: 'draw', by: 0 }).state;
  check('牌堆摸完就比谁手上分少', e2.phase === 'over' && e2.winner === 1,
    e2.phase + '/' + e2.winner + ' ' + JSON.stringify([c.handPoints(e.racks[0]), c.handPoints(e.racks[1])]));

  // 出完手牌获胜 + 再来一局
  let w = craft([T(1, 11), T(1, 12), T(1, 13)], [], [true, false]);
  w = putRow(w, [T(1, 11), T(1, 12), T(1, 13)], 0, 0);
  const w2 = c.act(w, { kind: 'commit', by: 0 }).state;
  check('先出完手牌就赢', w2.phase === 'over' && w2.winner === 0 && w2.scores[0] === 1);
  const w3 = c.act(w2, { kind: 'again', by: 0 }).state;
  check('再来一局重新发牌', w3.phase === 'play' && w3.racks[0].length === 14 && w3.pool.length === 78
    && w3.round === 1 && w3.board.filter(Boolean).length === 0);

  // 联机：按动作重放，两端始终一致
  const rackA = [T(1, 11), T(1, 12), T(1, 13), T(0, 1)];
  const rackB = [T(2, 5), T(2, 6), T(2, 7), JK()];
  const a = { core: c, state: craft(rackA, rackB) };
  const b = { core: c, state: craft(rackA, rackB) };
  a.state.pool = [T(3, 3)];      // 牌堆里留一张，摸完正好空但还没结束
  b.state.pool = [T(3, 3)];
  check('拉密联机初始一致', publicEqual(a.state, b.state));
  pump(a, b, { kind: 'move', by: 0, tileId: T(1, 11).id, to: at(0, 0) });
  pump(a, b, { kind: 'move', by: 0, tileId: T(1, 12).id, to: at(0, 1) });
  pump(a, b, { kind: 'move', by: 0, tileId: T(1, 13).id, to: at(0, 2) });
  check('拉密联机拖牌两端一致', a.state.board[at(0, 1)] !== null
    && b.state.board[at(0, 2)] !== null && publicEqual(a.state, b.state));
  pump(a, b, { kind: 'commit', by: 0 });
  check('拉密联机出牌后两端一致', a.state.turn === 1 && a.state.melded[0] === true
    && publicEqual(a.state, b.state));
  pump(b, a, { kind: 'move', by: 1, tileId: T(2, 5).id, to: at(2, 0) });
  pump(b, a, { kind: 'move', by: 1, tileId: T(2, 6).id, to: at(2, 1) });
  pump(b, a, { kind: 'move', by: 1, tileId: T(2, 7).id, to: at(2, 2) });
  check('拉密联机对方摆牌也一致', a.state.board[at(2, 2)] !== null
    && publicEqual(a.state, b.state));
  pump(b, a, { kind: 'draw', by: 1 });
  check('拉密联机动过牌之后就不能再摸', a.state.pool.length === 1
    && a.state.turn === 1 && publicEqual(a.state, b.state));
  pump(b, a, { kind: 'undo', by: 1 });
  pump(b, a, { kind: 'draw', by: 1 });
  check('拉密联机摸牌后两端一致', a.state.turn === 0 && a.state.pool.length === 0
    && a.state.racks[1].length === 5 && publicEqual(a.state, b.state),
    a.state.pool.length + '/' + b.state.pool.length);
  const before1 = JSON.stringify(a.state);
  pump(b, a, { kind: 'move', by: 1, tileId: T(2, 5).id, to: at(9, 9) });
  check('拉密联机不能替对方出牌', JSON.stringify(a.state) === before1);
}

console.log('== 可复现随机 ==');
{
  const t1 = cores.tictactoe.create({ seed: 'X' });
  const t2 = cores.tictactoe.create({ seed: 'X' });
  check('ttt 同 seed 同先后手', t1.turn === t2.turn);
  const r1 = cores.rummikub.create({ seed: 'M' });
  const r2 = cores.rummikub.create({ seed: 'M' });
  check('拉密 同 seed 同发牌', r1.racks[0].map(t => t.id).join(',') === r2.racks[0].map(t => t.id).join(',')
    && r1.pool.length === r2.pool.length);
}


console.log('== 并发点击一致性 ==');
{
  // ttt：双方同时点"再来一局"
  const t = mkClient(cores.tictactoe, 'CC2');
  const u = mkClient(cores.tictactoe, 'CC2');
  const seq2 = [0, 1, 3, 4, 6];
  for (let i = 0; i < seq2.length; i++) {
    const by = t.state.turn;
    const snd = by === 0 ? t : u;
    const rcv = by === 0 ? u : t;
    pump(snd, rcv, { kind: 'move', by: by, i: seq2[i] });
  }
  check('并发 ttt 已结束', t.state.phase === 'over' && u.state.phase === 'over');
  pump(t, u, { kind: 'again', by: 0 });
  pump(u, t, { kind: 'again', by: 1 });
  check('并发 ttt again 幂等一致', t.state.round === 1 && u.state.round === 1 && publicEqual(t.state, u.state));

  // 象棋：双方同时点"再来一局"
  const x1 = mkClient(cores.xiangqi, 'CC3');
  const x2 = mkClient(cores.xiangqi, 'CC3');
  pump(x1, x2, { kind: 'again', by: 0 });
  pump(x2, x1, { kind: 'again', by: 1 });
  check('并发 象棋 again 幂等一致', x1.state.round === x2.state.round && publicEqual(x1.state, x2.state));

  // 拉密：同一张牌被两边同时点，也只会放进去一次
  const m1 = mkClient(cores.rummikub, 'CC4');
  const m2 = mkClient(cores.rummikub, 'CC4');
  check('并发 拉密 初始一致', publicEqual(m1.state, m2.state));
  const first = m1.state.turn;
  const tile = m1.state.racks[first][0];
  const cell = cores.rummikub.idx(0, 0);
  pump(m1, m2, { kind: 'move', by: first, tileId: tile.id, to: cell });
  pump(m1, m2, { kind: 'move', by: first, tileId: tile.id, to: cell });
  check('并发 拉密 同一张牌重复拖到同一格只生效一次', m1.state.board[cell] !== null
    && m1.state.board.filter(function (x) { return x; }).length === 1
    && publicEqual(m1.state, m2.state));
}
console.log('== 斋普尔 ==');
{
  const a = mkClient(cores.jaipur, 'JP1');
  const b = mkClient(cores.jaipur, 'JP1');
  check('斋普尔 初始一致', publicEqual(a.state, b.state));
  let camels = 0;
  a.state.market.forEach(function (t) { if (t === 6) camels++; });
  check('斋普尔 开局市场里有 3 只骆驼打底', camels >= 3, a.state.market.join(','));
  check('斋普尔 每人 5 张手牌（骆驼直接进骆驼群）',
    a.state.hands[0].length + a.state.camels[0] === 5 && a.state.hands[1].length + a.state.camels[1] === 5);

  const by = a.state.turn;
  const snd = by === 0 ? a : b;
  const rcv = by === 0 ? b : a;
  // 只拿 1 张货牌
  let idx = -1;
  for (let i = 0; i < a.state.market.length; i++) if (a.state.market[i] !== 6) { idx = i; break; }
  pump(snd, rcv, { kind: 'take', by: by, takeIdx: [idx], handIdx: [] });
  check('斋普尔 拿牌后两端一致', publicEqual(a.state, b.state));
  check('斋普尔 拿牌后市场补满 5 张', a.state.market.length === 5, a.state.market.join(','));

  // 拿骆驼必须一次全拿走
  const s0 = cores.jaipur.create({ seed: 'JP-camel' });
  s0.market = [6, 6, 3, 6, 1];
  const bad = cores.jaipur.act(s0, { kind: 'take', by: s0.turn, takeIdx: [0], handIdx: [] });
  check('斋普尔 不能只拿一只骆驼', bad.state === s0);
  const good = cores.jaipur.act(s0, { kind: 'take', by: s0.turn, takeIdx: [0, 1, 3], handIdx: [] });
  check('斋普尔 一次拿走全部骆驼', good.state !== s0 && good.state.camels[s0.turn] === s0.camels[s0.turn] + 3);

  // 卖牌换卢比
  const s1 = cores.jaipur.create({ seed: 'JP-sell' });
  s1.hands[0] = [0, 0, 0, 0, 0, 0, 0];
  s1.turn = 0;
  const r1 = cores.jaipur.act(s1, { kind: 'sell', by: 0, type: 0, handIdx: [0, 1] });
  check('斋普尔 卖钻石得高分筹码', r1.state !== s1 && r1.state.money[0] === 14, r1.state === s1 ? '' : r1.state.money[0]);
  check('斋普尔 卖 2 张之后的筹码堆变短', r1.state.piles[0].join(',') === '5,5,5', r1.state.piles[0].join(','));
  const s1b = cores.jaipur.create({ seed: 'JP-sell2' });
  s1b.hands[0] = [5, 5, 5, 5, 5, 5, 5];
  s1b.turn = 0;
  const r1b = cores.jaipur.act(s1b, { kind: 'sell', by: 0, type: 5, handIdx: [0, 1, 2, 3] });
  check('斋普尔 卖 4 张皮革有奖励筹码', r1b.state !== s1b && r1b.state.taken[0].bonus === 1
    && r1b.state.money[0] === 4 + 3 + 2 + 1 + 4, s1b === r1b.state ? '' : r1b.state.money[0]);
  const s1c = cores.jaipur.create({ seed: 'JP-sell3' });
  s1c.hands[0] = [0, 0, 1, 1, 1, 1, 1];
  s1c.turn = 0;
  const r1c = cores.jaipur.act(s1c, { kind: 'sell', by: 0, type: 0, handIdx: [0] });
  check('斋普尔 钻石不能只卖 1 张', r1c.state === s1c);
  const r1d = cores.jaipur.act(s1c, { kind: 'sell', by: 0, type: 0, handIdx: [0, 2] });
  check('斋普尔 一次只能卖同一种货', r1d.state === s1c);
  const r1e = cores.jaipur.act(s1c, { kind: 'sell', by: 0, type: 1, handIdx: [2, 3, 4] });
  check('斋普尔 卖 3 张还能拿 1 枚奖励筹码', r1e.state !== s1c
    && r1e.state.money[0] === 6 + 6 + 5 + 1 && r1e.state.taken[0].bonus === 1, r1e.state === s1c ? '' : r1e.state.money[0]);

  // 筹码堆被拿空 3 种 → 这一局结束
  const s2 = cores.jaipur.create({ seed: 'JP-end' });
  s2.piles[0] = [];
  s2.piles[1] = [];
  s2.piles[2] = [];
  s2.turn = 0;
  s2.hands[0] = [3, 3, 3, 3, 3, 3, 3];
  const r2 = cores.jaipur.act(s2, { kind: 'sell', by: 0, type: 3, handIdx: [0, 1, 2] });
  check('斋普尔 3 种货拿空就结算', r2.state !== s2 && r2.state.phase === 'over');
  check('斋普尔 赢家拿 1 枚卓越之印', r2.state.scores[r2.state.winner] === 1
    || (r2.state.winner === -2 && r2.state.scores[0] === 1), JSON.stringify(r2.state.scores));
  check('斋普尔 结算后骆驼多的一方能拿骆驼筹码', r2.state.camelToken === -1 || r2.state.camelToken === 0 || r2.state.camelToken === 1);
  const r3 = cores.jaipur.act(r2.state, { kind: 'again', by: 0 });
  check('斋普尔 再来一局保留印数', r3.state !== r2.state && r3.state.phase === 'play'
    && r3.state.scores.join(',') === r2.state.scores.join(',') && r3.state.round === 1);
  const r4 = cores.jaipur.act(r2.state, { kind: 'sell', by: 0, type: 3, handIdx: [0] });
  check('斋普尔 结算后不能再卖货', r4.state === r2.state);
}

console.log('== 桌游战线 ==');
{
  const a = mkClient(cores.battleline, 'BL1');
  const b = mkClient(cores.battleline, 'BL1');
  check('战线 初始一致', publicEqual(a.state, b.state));
  check('战线 每人 7 张手牌、牌堆 46 张', a.state.hands[0].length === 7 && a.state.hands[1].length === 7
    && a.state.deck.length === 46);
  const by = a.state.turn;
  const snd = by === 0 ? a : b;
  const rcv = by === 0 ? b : a;
  pump(snd, rcv, { kind: 'place', by: by, flag: 4, card: 0 });
  check('战线 出牌后自动补牌', a.state.hands[by].length === 7 && a.state.slots[4][by].length === 1);
  check('战线 出牌后两端一致', publicEqual(a.state, b.state));
  check('战线 轮到对方', a.state.turn === 1 - by);
  const before = JSON.stringify(a.state);
  const bad = cores.battleline.act(a.state, { kind: 'place', by: by, flag: 4, card: 0 });
  check('战线 不能替对方出牌', bad.state === a.state && JSON.stringify(a.state) === before);

  const f = cores.battleline.formation;
  check('战线 楔形最强', f([1, 2, 3]).rank === 5);
  check('战线 方阵次之', f([5, 15, 25]).rank === 4);
  check('战线 大队第三', f([1, 5, 9]).rank === 3);
  check('战线 散兵线第四', f([1, 12, 23]).rank === 2);
  check('战线 乌合最低', f([1, 15, 29]).rank === 1);
  check('战线 同阵型比点数和', f([1, 2, 3]).sum === 6);

  // 判旗
  const s = cores.battleline.create({ seed: 'BL-flags' });
  s.slots[0][0] = [1, 2, 3];
  s.slots[0][1] = [11, 22, 33];
  check('战线 楔形打赢散兵线', cores.battleline.flagWinner(s, 0) === 0);
  s.slots[1][0] = [21, 32, 43];
  s.slots[1][1] = [45, 56, 67];
  check('战线 同为散兵线时比点数和', cores.battleline.flagWinner(s, 1) === 1);
  s.slots[2][0] = [4, 5, 6];
  s.slots[2][1] = [14, 15, 16];
  s.lastAt[2][0] = 10;
  s.lastAt[2][1] = 20;
  check('战线 阵型完全一样时后放牌的输', cores.battleline.flagWinner(s, 2) === 0);
  check('战线 双方都没摆满时先不判', cores.battleline.flagWinner(s, 3) === -1);

  // 打到结束
  let g = cores.battleline.create({ seed: 'BL-run' });
  let guard = 0;
  while (g.phase === 'play' && guard < 400) {
    guard++;
    const side = g.turn;
    let target = -1;
    for (let fl = 0; fl < 9; fl++) if (g.slots[fl][side].length < 3) { target = fl; break; }
    if (target < 0) break;
    const r = cores.battleline.act(g, { kind: 'place', by: side, flag: target, card: 0 });
    if (r.state === g) break;
    g = r.state;
  }
  check('战线 能打完整局', g.phase === 'over' && guard < 400, 'moves=' + guard);
  check('战线 结束后有获胜方或平局', g.winner === 0 || g.winner === 1 || g.winner === -2, String(g.winner));
  const again = cores.battleline.act(g, { kind: 'again', by: 0 });
  check('战线 再来一局回到开局', again.state !== g && again.state.phase === 'play'
    && again.state.slots[0][0].length === 0 && again.state.scores.join(',') === g.scores.join(','));
}

console.log('== 水门事件 ==');
{
  const a = mkClient(cores.watergate, 'WG1');
  const b = mkClient(cores.watergate, 'WG1');
  check('水门 初始一致', publicEqual(a.state, b.state));
  check('水门 每轮开始在轨道正中放 3 枚证据', a.state.track[cores.watergate.CENTER].length === 3);
  const init = a.state.initiative;
  check('水门 先手抽 5 张、后手抽 4 张',
    a.state.hands[init].length === 5 && a.state.hands[1 - init].length === 4);
  check('水门 开局气势筹码一共 5 枚', a.state.momentumLeft === 5 && a.state.momentum.join(',') === '0,0');

  const by = a.state.turn;
  const id = a.state.hands[by][0];
  const vt = cores.watergate.valueTargets(a.state, id);
  if (vt.length) {
    const snd = by === 0 ? a : b;
    const rcv = by === 0 ? b : a;
    pump(snd, rcv, { kind: 'value', by: by, card: 0, cell: vt[0].cell, slot: vt[0].slot });
    check('水门 按数值推进后两端一致', publicEqual(a.state, b.state));
  } else {
    check('水门 没有同色证据时不会有数值目标', cores.watergate.valueTargets(a.state, id).length === 0);
  }

  // 色不对的牌不能推进
  const s1 = cores.watergate.create({ seed: 'WG-x' });
  const side = s1.turn;
  s1.hands[side] = [3];
  s1.track[cores.watergate.CENTER] = [0, 100, 200];
  const wrong = cores.watergate.act(s1, { kind: 'value', by: side, card: 0, cell: 4, slot: 0 });
  check('水门 只能用同色证据推进', wrong.state === s1);
  const right = cores.watergate.act(s1, { kind: 'value', by: side, card: 0, cell: 4, slot: 1 });
  check('水门 同色就能推进', right.state !== s1);
  // 推进之后，这枚证据应该整体挪到新格子，全轨道上只出现一次（谁先手都成立）
  let copies = 0;
  right.state.track.forEach(function (cell) {
    cell.forEach(function (t) { if (t === 100) copies++; });
  });
  check('水门 数据不会重复用同一枚证据', right.state !== s1 && copies === 1
    && right.state.track[cores.watergate.CENTER].indexOf(100) < 0);

  // 用不上的牌可以弃掉
  const s2 = cores.watergate.create({ seed: 'WG-drop' });
  const by2 = s2.turn;
  const r2 = cores.watergate.act(s2, { kind: 'discard', by: by2, card: 0 });
  check('水门 用不上的牌可以弃掉', r2.state !== s2
    && r2.state.hands[by2].length === s2.hands[by2].length - 1 && r2.state.turn === 1 - by2);

  // 打通整局
  let g = cores.watergate.create({ seed: 'WG-run' });
  let guard = 0;
  while (g.phase === 'play' && guard < 900) {
    guard++;
    const t = g.turn;
    let done = false;
    for (let ci = 0; ci < g.hands[t].length && !done; ci++) {
      const cid = g.hands[t][ci];
      const at = cores.watergate.actionTargets(g, t, cid);
      if (at.length) {
        const r = cores.watergate.act(g, { kind: 'action', by: t, card: ci, target: at[0] });
        if (r.state !== g) { g = r.state; done = true; }
      }
      if (!done) {
        const v = cores.watergate.valueTargets(g, cid);
        if (v.length) {
          const r = cores.watergate.act(g, { kind: 'value', by: t, card: ci, cell: v[0].cell, slot: v[0].slot });
          if (r.state !== g) { g = r.state; done = true; }
        }
      }
    }
    if (!done) {
      const r = cores.watergate.act(g, { kind: 'discard', by: t, card: 0 });
      if (r.state === g) break;
      g = r.state;
    }
  }
  check('水门 能打完整局', g.phase === 'over' && guard < 900, 'round=' + g.round + ' steps=' + guard);
  check('水门 结束时给出明确结果', g.winner === 0 || g.winner === 1 || g.winner === -2, String(g.winner));
  check('水门 结束后不再接受出牌', cores.watergate.act(g, { kind: 'discard', by: g.turn, card: 0 }).state === g);
  const again = cores.watergate.act(g, { kind: 'again', by: 0 });
  check('水门 再来一局重新开始', again.state !== g && again.state.phase === 'play' && again.state.round === 1);
}
console.log('\n结果: ' + passCount + ' 通过, ' + failCount + ' 失败');
if (failCount > 0) process.exit(1);

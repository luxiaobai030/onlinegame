// ===== 密档对决（简化版）核心逻辑 =====
// 非对称二人对抗：档案室（0 号）vs 调查组（1 号）。
// 调查组：把 2 名线人用正面证据连到密档上就赢。
// 档案室：集齐 4 枚气势标记就赢。
const rnd = require('../../utils/rand.js');

const ARMS = 4;              // 证据板 4 条支线
const LINKS = 3;             // 每条支线 3 格链接
const TRACK_LEN = 9;         // 研究轨道 9 格：0..8 = -4..+4
const CENTER = 4;            // 正中（每轮从这里放 3 枚证据）
const COLORS = 3;            // 证据 3 种颜色
const BAG_TOTAL = 24;        // 证据总数（3 色 × 8）
const MOMENTUM_POOL = 5;     // 气势标记总数
const MOMENTUM_TO_WIN = 4;   // 档案室集齐这么多就赢
const CONNECT_TO_WIN = 2;    // 调查组接通这么多线人就赢
const MAX_ROUNDS = 10;       // 兜底：打满这么多轮就按进度判定
const HAND_INIT = [5, 4];    // 有主动权的一方抽 5 张，另一方 4 张

// 证据 id：颜色 * 100 + 序号
function tokenColor(tid) { return Math.floor(tid / 100); }
// 牌 id：颜色 * 3 + (点数 - 1)
function cardColor(id) { return Math.floor(id / 3); }
function cardValue(id) { return (id % 3) + 1; }

// 牌上的行动
const ACTIONS = [
  ['施压', '销毁', '封口'],   // 档案室（0 号）
  ['调查', '曝光', '加印']    // 调查组（1 号）
];
const ACTION_DESC = [
  ['把轨道上一枚证据推到档案室侧 -1 位', '把轨道上一枚证据扔回证据袋', '把证据板上的一枚正面证据翻成暗置'],
  ['把轨道上一枚证据拉到调查组侧 -1 位', '把证据板上的一枚暗置证据翻成正面', '额外抽 1 张牌']
];

const COLOR_NAME = ['蓝', '红', '黄'];

function isInt(v) { return typeof v === 'number' && v === Math.floor(v); }
function copy(s) { return JSON.parse(JSON.stringify(s)); }

function makeDeck(seed, side) {
  const d = [];
  for (let c = 0; c < COLORS; c++) {
    for (let i = 0; i < 3; i++) d.push(c * 3 + 0);
    for (let i = 0; i < 2; i++) {
      d.push(c * 3 + 1);
      d.push(c * 3 + 2);
    }
  }
  return rnd.seededShuffle(d, seed + '|wg-deck' + side);
}

function drawCard(s, side) {
  if (!s.decks[side].length) {
    if (!s.discards[side].length) return null;
    s.decks[side] = rnd.seededShuffle(s.discards[side], s.seed + '|wg-re' + side + '-' + s.reshuffles[side]);
    s.reshuffles[side] += 1;
    s.discards[side] = [];
  }
  return s.decks[side].pop();
}

// ---------- 开局 ----------
function create(opts) {
  opts = opts || {};
  const seed = opts.seed || 'local';
  const state = {
    mode: opts.mode || 'local',
    seed: seed,
    phase: 'play',
    winner: -1,
    scores: [0, 0],
    round: 0,
    turn: 0,
    firstTurn: 0,
    initiative: 0,
    bag: [],
    track: [],
    board: [],
    hands: [[], []],
    decks: [[], []],
    discards: [[], []],
    reshuffles: [0, 0],
    momentum: [0, 0],
    momentumLeft: MOMENTUM_POOL,
    pins: [0, 0],
    connects: 0,
    last: ''
  };
  const bag = [];
  for (let c = 0; c < COLORS; c++) {
    for (let i = 0; i < BAG_TOTAL / COLORS; i++) bag.push(c * 100 + i);
  }
  state.bag = rnd.seededShuffle(bag, seed + '|wg-bag');
  state.decks[0] = makeDeck(seed, 0);
  state.decks[1] = makeDeck(seed, 1);
  for (let a = 0; a < ARMS; a++) state.board.push([null, null, null]);
  for (let i = 0; i < TRACK_LEN; i++) state.track.push([]);
  // 开局固定由「玩家 1」掌握主动权，不再随机
  state.initiative = 0;
  state.firstTurn = state.initiative;
  startRound(state);
  state.last = '第 1 轮：' + (state.initiative === 0 ? '档案室' : '调查组') + ' 掌握主动权';
  return state;
}

// 新一轮：补手牌 + 往轨道正中放 3 枚证据
function startRound(s) {
  s.round += 1;
  s.pins = [0, 0];
  for (let side = 0; side < 2; side++) {
    const n = (side === s.initiative) ? HAND_INIT[0] : HAND_INIT[1];
    for (let i = 0; i < n; i++) {
      const c = drawCard(s, side);
      if (c === null) break;
      s.hands[side].push(c);
    }
  }
  for (let i = 0; i < 3; i++) {
    const t = s.bag.pop();
    if (t === undefined) break;
    s.track[CENTER].push(t);
  }
  s.turn = s.initiative;
}

// ---------- 局面查询 ----------
function completeArms(s) {
  let n = 0;
  for (let a = 0; a < ARMS; a++) {
    let ok = true;
    for (let k = 0; k < LINKS; k++) {
      const sl = s.board[a][k];
      if (!sl || !sl.face) { ok = false; break; }
    }
    if (ok) n++;
  }
  return n;
}

// 轨道上能配这张牌的格子（同色）
function valueTargets(s, cardId) {
  const want = cardColor(cardId);
  const out = [];
  for (let i = 0; i < TRACK_LEN; i++) {
    for (let k = 0; k < s.track[i].length; k++) {
      if (tokenColor(s.track[i][k]) === want) out.push({ cell: i, slot: k });
    }
  }
  return out;
}

function actionTargets(s, side, cardId) {
  const c = cardColor(cardId);
  const out = [];
  if (side === 1) {
    if (c === 0) {
      for (let i = CENTER; i < TRACK_LEN; i++) {
        for (let k = 0; k < s.track[i].length; k++) out.push({ cell: i, slot: k });
      }
    } else if (c === 1) {
      for (let a = 0; a < ARMS; a++) {
        for (let k = 0; k < LINKS; k++) {
          const sl = s.board[a][k];
          if (sl && !sl.face) out.push({ arm: a, k: k });
        }
      }
    } else {
      out.push({ any: true });   // 加印不需要指定目标
    }
  } else {
    if (c === 0) {
      for (let i = 0; i <= CENTER; i++) {
        for (let k = 0; k < s.track[i].length; k++) out.push({ cell: i, slot: k });
      }
    } else if (c === 1) {
      for (let i = 0; i < TRACK_LEN; i++) {
        for (let k = 0; k < s.track[i].length; k++) out.push({ cell: i, slot: k });
      }
    } else {
      for (let a = 0; a < ARMS; a++) {
        for (let k = 0; k < LINKS; k++) {
          const sl = s.board[a][k];
          if (sl && sl.face) out.push({ arm: a, k: k });
        }
      }
    }
  }
  return out;
}

function momentumWinner(s) {
  if (s.pins[0] === s.pins[1]) return -1;
  return s.pins[0] > s.pins[1] ? 0 : 1;
}

// ---------- 一轮结束结算 ----------
function pinToken(s, side, tid, face) {
  const order = side === 1 ? [0, 1, 2] : [2, 1, 0];
  for (let a = 0; a < ARMS; a++) {
    for (let oi = 0; oi < LINKS; oi++) {
      const k = order[oi];
      if (!s.board[a][k]) {
        s.board[a][k] = { t: tid, face: face };
        return true;
      }
    }
  }
  return false;
}

function settleRound(s) {
  const forNixon = [];
  const forEditor = [];
  for (let i = 0; i < TRACK_LEN; i++) {
    const cell = s.track[i];
    for (let k = 0; k < cell.length; k++) {
      if (i < CENTER) forEditor.push(cell[k]);
      else if (i > CENTER) forNixon.push(cell[k]);
      else s.bag.push(cell[k]);
    }
    s.track[i] = [];
  }
  // 档案室先钉（从最外侧往里堵），调查组后钉（从最内侧往外铺）
  let pn = 0;
  let pe = 0;
  for (let i = 0; i < forNixon.length; i++) {
    if (pinToken(s, 0, forNixon[i], false)) pn++;
    else s.bag.push(forNixon[i]);
  }
  for (let i = 0; i < forEditor.length; i++) {
    if (pinToken(s, 1, forEditor[i], true)) pe++;
    else s.bag.push(forEditor[i]);
  }
  s.pins = [pn, pe];
  // 气势标记
  const mw = momentumWinner(s);
  if (mw >= 0 && s.momentumLeft > 0) {
    s.momentum[mw] += 1;
    s.momentumLeft -= 1;
  }
  // 主动权
  if (mw >= 0) s.initiative = mw;
  s.connects = completeArms(s);
  s.last = '第 ' + s.round + ' 轮结算：档案室钉 ' + pn + ' 枚，调查组钉 ' + pe + ' 枚' +
    (mw >= 0 ? '，' + (mw === 0 ? '档案室' : '调查组') + ' 拿到主动权' : '');
  if (s.connects >= CONNECT_TO_WIN) return finish(s, 1, '调查组把 ' + s.connects + ' 名线人连到了密档');
  if (s.momentum[0] >= MOMENTUM_TO_WIN) return finish(s, 0, '档案室集齐 ' + s.momentum[0] + ' 枚气势标记');
  if (s.round >= MAX_ROUNDS) {
    const e = s.connects / CONNECT_TO_WIN;
    const n = s.momentum[0] / MOMENTUM_TO_WIN;
    if (e !== n) return finish(s, e > n ? 1 : 0, '打满 ' + MAX_ROUNDS + ' 轮，按进度判定');
    return finish(s, -2, '打满 ' + MAX_ROUNDS + ' 轮，双方进度一样');
  }
  startRound(s);
  return s;
}

function finish(s, winner, reason) {
  s.phase = 'over';
  s.winner = winner;
  s.reason = reason;
  if (winner >= 0) s.scores[winner] += 1;
  return s;
}

function checkWin(s) {
  if (completeArms(s) >= CONNECT_TO_WIN) {
    s.connects = completeArms(s);
    return finish(s, 1, '调查组把 ' + s.connects + ' 名线人连到了密档');
  }
  if (s.momentum[0] >= MOMENTUM_TO_WIN) return finish(s, 0, '档案室集齐气势标记');
  return null;
}

// ---------- 出牌 ----------
function takeFromTrack(s, cell, slot) {
  const tid = s.track[cell][slot];
  s.track[cell].splice(slot, 1);
  return tid;
}

function moveToken(s, cell, slot, to) {
  const tid = takeFromTrack(s, cell, slot);
  s.track[to].push(tid);
}

function doValue(s, by, a) {
  const id = s.hands[by][a.card];
  if (id === undefined) return null;
  if (!isInt(a.cell) || a.cell < 0 || a.cell >= TRACK_LEN) return null;
  if (!isInt(a.slot) || a.slot < 0 || a.slot >= s.track[a.cell].length) return null;
  const tid = s.track[a.cell][a.slot];
  if (tokenColor(tid) !== cardColor(id)) return null;
  const v = cardValue(id);
  const next = copy(s);
  const to = by === 0 ? Math.min(TRACK_LEN - 1, a.cell + v) : Math.max(0, a.cell - v);
  moveToken(next, a.cell, a.slot, to);
  next.last = (by === 0 ? '档案室' : '调查组') + '：' + COLOR_NAME[tokenColor(tid)] + '色证据朝自己推进 ' + v + ' 格';
  return next;
}

function doAction(s, by, a) {
  const id = s.hands[by][a.card];
  if (id === undefined) return null;
  const c = cardColor(id);
  const next = copy(s);
  const targets = actionTargets(s, by, id);
  if (!targets.length) return null;
  const tg = a.target || {};
  let hit = null;
  if (targets.length === 1 && targets[0].any) hit = targets[0];
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    if (t.cell !== undefined && t.cell === tg.cell && t.slot === tg.slot) hit = t;
    if (t.arm !== undefined && t.arm === tg.arm && t.k === tg.k) hit = t;
  }
  if (!hit) return null;
  if (by === 1) {
    if (c === 0) {
      moveToken(next, hit.cell, hit.slot, CENTER - 1);
      next.last = '调查组：调查，把一枚证据拉到自己这侧';
    } else if (c === 1) {
      next.board[hit.arm][hit.k].face = true;
      next.last = '调查组：曝光，把一枚暗置证据翻成正面';
    } else {
      const card = drawCard(next, by);
      if (card !== null) next.hands[by].push(card);
      next.last = '调查组：加印，额外抽 1 张牌';
    }
  } else {
    if (c === 0) {
      moveToken(next, hit.cell, hit.slot, CENTER + 1);
      next.last = '档案室：施压，把一枚证据推到自己这侧';
    } else if (c === 1) {
      const tid = takeFromTrack(next, hit.cell, hit.slot);
      next.bag.push(tid);
      next.last = '档案室：销毁，把一枚证据扔回证据袋';
    } else {
      next.board[hit.arm][hit.k].face = false;
      next.last = '档案室：封口，把一枚正面证据翻成暗置';
    }
  }
  return next;
}

function playCard(s, by, action) {
  let next = null;
  if (action.kind === 'value') next = doValue(s, by, action);
  else if (action.kind === 'action') next = doAction(s, by, action);
  else if (action.kind === 'discard') {
    // 手里的牌怎么都用不上时，可以弃掉它交给对手
    if (s.hands[by][action.card] === undefined) return null;
    next = copy(s);
    next.last = (by === 0 ? '档案室' : '调查组') + '：这张牌用不上，弃掉';
  }
  if (!next) return null;
  const used = next.hands[by].splice(action.card, 1)[0];
  if (used !== undefined) next.discards[by].push(used);
  const win = checkWin(next);
  if (win) return win;
  const other = 1 - by;
  if (next.hands[other].length) next.turn = other;
  else if (next.hands[by].length) next.turn = by;
  else return settleRound(next);
  return next;
}

function doAgain(s, by) {
  if (s.phase !== 'over') return null;
  const round = s.round + 1;
  const next = create({ seed: s.seed + '|g' + round, mode: s.mode });
  next.scores = s.scores.slice();
  return next;
}

function act(s, action) {
  if (action.kind === 'again') {
    const next = doAgain(s, action.by);
    if (!next) return { state: s, outbox: [] };
    return { state: next, outbox: [{ kind: 'again', by: action.by }] };
  }
  if (s.phase !== 'play' || s.turn !== action.by) return { state: s, outbox: [] };
  if (action.kind !== 'value' && action.kind !== 'action' && action.kind !== 'discard') return { state: s, outbox: [] };
  const next = playCard(s, action.by, action);
  if (!next) return { state: s, outbox: [] };
  return { state: next, outbox: [action] };
}

function recv(s, msg) {
  if (msg.kind === 'again') {
    const next = doAgain(s, msg.by);
    return { state: next || s, outbox: [] };
  }
  if (s.phase !== 'play' || s.turn !== msg.by) return { state: s, outbox: [] };
  if (msg.kind !== 'value' && msg.kind !== 'action' && msg.kind !== 'discard') return { state: s, outbox: [] };
  const next = playCard(s, msg.by, msg);
  return { state: next || s, outbox: [] };
}

function baseState(s) {
  return JSON.stringify({
    mode: s.mode, phase: s.phase, turn: s.turn, round: s.round,
    track: s.track, board: s.board, hands: s.hands, momentum: s.momentum, scores: s.scores
  });
}

module.exports = {
  id: 'watergate',
  create: create, act: act, recv: recv, baseState: baseState,
  ARMS: ARMS, LINKS: LINKS, TRACK_LEN: TRACK_LEN, CENTER: CENTER,
  COLORS: COLORS, COLOR_NAME: COLOR_NAME,
  MOMENTUM_TO_WIN: MOMENTUM_TO_WIN, MOMENTUM_POOL: MOMENTUM_POOL,
  CONNECT_TO_WIN: CONNECT_TO_WIN, HAND_INIT: HAND_INIT, MAX_ROUNDS: MAX_ROUNDS,
  ACTIONS: ACTIONS, ACTION_DESC: ACTION_DESC,
  tokenColor: tokenColor, cardColor: cardColor, cardValue: cardValue,
  completeArms: completeArms, valueTargets: valueTargets, actionTargets: actionTargets,
  momentumWinner: momentumWinner
};

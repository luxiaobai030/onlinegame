// ===== 桌游战线（Battle Line）核心逻辑 =====
// 9 面旗帜排成一条战线，每面旗两侧各 3 个位置；
// 6 色 × 1~10 共 60 张兵种牌，双方轮流布阵，先拿下 5 面旗（或连着的 3 面）者胜。
const rnd = require('../../utils/rand.js');

const COLORS = 6;
const FLAGS = 9;
const PER_SIDE = 3;
const NAME_HAND = 7;

// 阵型从高到低
const FORMS = ['乌合', '散兵线', '大队', '方阵', '楔形'];
const FORM_DESC = [
  '乌合：不成形的三张',
  '散兵线：三张连号（颜色不限）',
  '大队：三张同色',
  '方阵：三张同点数',
  '楔形：三张同色且连号（最强）'
];

function isInt(v) { return typeof v === 'number' && v === Math.floor(v); }
function copy(s) { return JSON.parse(JSON.stringify(s)); }
function colorOf(id) { return Math.floor(id / 10); }
function valueOf(id) { return id % 10; }
function cardLabel(id) { return colorOf(id) + '-' + valueOf(id); }

// 三张牌组成的阵型：{ rank, sum }
function formation(cards) {
  if (!cards || cards.length !== PER_SIDE) return null;
  const cs = [colorOf(cards[0]), colorOf(cards[1]), colorOf(cards[2])];
  const vs = [valueOf(cards[0]), valueOf(cards[1]), valueOf(cards[2])];
  const sameColor = cs[0] === cs[1] && cs[1] === cs[2];
  const sameValue = vs[0] === vs[1] && vs[1] === vs[2];
  const sorted = vs.slice().sort(function (a, b) { return a - b; });
  const run = sorted[1] === sorted[0] + 1 && sorted[2] === sorted[1] + 1;
  let rank = 1;
  if (sameColor && run) rank = 5;
  else if (sameValue) rank = 4;
  else if (sameColor) rank = 3;
  else if (run) rank = 2;
  return { rank: rank, sum: vs[0] + vs[1] + vs[2], name: FORMS[rank - 1] };
}

// ---------- 开局 ----------
function create(opts) {
  opts = opts || {};
  const seed = opts.seed || 'local';
  // 开局固定由「玩家 1」先手，不再随机
  const firstTurn = 0;
  const deck = [];
  for (let c = 0; c < COLORS; c++) {
    for (let v = 1; v <= 10; v++) deck.push(c * 10 + v);
  }
  const bag = rnd.seededShuffle(deck, seed + '|battleline');
  const state = {
    mode: opts.mode || 'local',
    seed: seed,
    turn: firstTurn,
    firstTurn: firstTurn,
    phase: 'play',
    winner: -1,
    scores: [0, 0],
    round: 0,
    deck: [],
    hands: [[], []],
    slots: [],
    lastAt: [],
    flags: [],
    moveNo: 0,
    lastMove: null,
    reason: ''
  };
  for (let f = 0; f < FLAGS; f++) {
    state.slots.push([[], []]);
    state.lastAt.push([0, 0]);
    state.flags.push(-1);
  }
  for (let side = 0; side < 2; side++) {
    for (let i = 0; i < NAME_HAND; i++) state.hands[side].push(bag.pop());
  }
  state.deck = bag;
  return state;
}

// ---------- 局面查询 ----------
function emptySlotsFor(s, side, flag) {
  let n = 0;
  for (let f = 0; f < FLAGS; f++) {
    if (flag !== undefined && f !== flag) continue;
    n += PER_SIDE - s.slots[f][side].length;
  }
  return n;
}

function canPlay(s, side) {
  return s.hands[side].length > 0 && emptySlotsFor(s, side) > 0;
}

// 这面旗已经不用再等对面了吗（对面再也放不了牌）
function rivalStuck(s, side) {
  return !canPlay(s, 1 - side);
}

// 单面旗的归属：-1 未定 / 0 / 1
function flagWinner(s, f) {
  const a = s.slots[f][0];
  const b = s.slots[f][1];
  const fa = a.length === PER_SIDE ? formation(a) : null;
  const fb = b.length === PER_SIDE ? formation(b) : null;
  if (fa && fb) {
    if (fa.rank !== fb.rank) return fa.rank > fb.rank ? 0 : 1;
    if (fa.sum !== fb.sum) return fa.sum > fb.sum ? 0 : 1;
    // 阵型完全一样：后放牌的一方输
    return s.lastAt[f][0] > s.lastAt[f][1] ? 1 : 0;
  }
  if (fa && rivalStuck(s, 0)) return 0;
  if (fb && rivalStuck(s, 1)) return 1;
  return -1;
}

function resolveAll(s) {
  for (let f = 0; f < FLAGS; f++) {
    if (s.flags[f] === -1) {
      const w = flagWinner(s, f);
      if (w !== -1) s.flags[f] = w;
    }
  }
}

function flagCount(s, side) {
  let n = 0;
  for (let f = 0; f < FLAGS; f++) if (s.flags[f] === side) n++;
  return n;
}

function runOfThree(s, side) {
  for (let f = 0; f + 2 < FLAGS; f++) {
    if (s.flags[f] === side && s.flags[f + 1] === side && s.flags[f + 2] === side) return f;
  }
  return -1;
}

function allResolved(s) {
  for (let f = 0; f < FLAGS; f++) if (s.flags[f] === -1) return false;
  return true;
}

// 整局结算
function finish(s, winner, reason) {
  s.phase = 'over';
  s.winner = winner;
  s.reason = reason;
  if (winner >= 0) s.scores[winner] += 1;
  return s;
}

function endCheck(s, mover) {
  resolveAll(s);
  const c0 = flagCount(s, 0);
  const c1 = flagCount(s, 1);
  if (c0 >= 5 || c1 >= 5) {
    if (c0 > c1) return finish(s, 0, '拿下 ' + c0 + ' 面旗帜（包围战）');
    if (c1 > c0) return finish(s, 1, '拿下 ' + c1 + ' 面旗帜（包围战）');
  }
  const r0 = runOfThree(s, 0);
  const r1 = runOfThree(s, 1);
  if (r0 >= 0 || r1 >= 0) {
    if (r0 >= 0 && r1 < 0) return finish(s, 0, '第 ' + (r0 + 1) + '~' + (r0 + 3) + ' 面旗连成一线（突破战）');
    if (r1 >= 0 && r0 < 0) return finish(s, 1, '第 ' + (r1 + 1) + '~' + (r1 + 3) + ' 面旗连成一线（突破战）');
    return finish(s, mover === 0 ? 0 : 1, '同一手两边都连成三面，出牌方算赢');
  }
  if (!canPlay(s, 0) && !canPlay(s, 1)) {
    if (c0 !== c1) return finish(s, c0 > c1 ? 0 : 1, '牌用完了，以旗帜数分胜负');
    return finish(s, -2, '牌用完了，旗帜数相同');
  }
  if (allResolved(s)) {
    if (c0 !== c1) return finish(s, c0 > c1 ? 0 : 1, '9 面旗全部判完');
    return finish(s, -2, '9 面旗全部判完，数量相同');
  }
  return null;
}

// 出牌后轮到谁；都动不了就返回 -1
function advance(s, justMoved) {
  const other = 1 - justMoved;
  if (canPlay(s, other)) return other;
  if (canPlay(s, justMoved)) return justMoved;
  return -1;
}

function doPlace(s, by, action) {
  if (action.flag === undefined || !isInt(action.flag) || action.flag < 0 || action.flag >= FLAGS) return null;
  const ci = action.card;
  if (!isInt(ci) || ci < 0 || ci >= s.hands[by].length) return null;
  if (s.slots[action.flag][by].length >= PER_SIDE) return null;
  const next = copy(s);
  const id = next.hands[by].splice(ci, 1)[0];
  next.slots[action.flag][by].push(id);
  next.moveNo += 1;
  next.lastAt[action.flag][by] = next.moveNo;
  if (next.deck.length) next.hands[by].push(next.deck.pop());
  next.lastMove = { by: by, flag: action.flag, id: id };
  const ended = endCheck(next, by);
  if (ended) return ended;
  const np = advance(next, by);
  if (np < 0) return endCheck(next, by) || finish(next, -2, '双方都动不了了');
  next.turn = np;
  return next;
}

function doAgain(s, by) {
  if (s.phase !== 'over') return null;
  const round = s.round + 1;
  const next = create({ seed: s.seed + '|r' + round, mode: s.mode });
  next.round = round;
  next.scores = s.scores.slice();
  next.firstTurn = (s.firstTurn + round) % 2;
  next.turn = next.firstTurn;
  return next;
}

function act(s, action) {
  if (action.kind === 'again') {
    const next = doAgain(s, action.by);
    if (!next) return { state: s, outbox: [] };
    return { state: next, outbox: [{ kind: 'again', by: action.by }] };
  }
  if (s.phase !== 'play' || s.turn !== action.by) return { state: s, outbox: [] };
  if (action.kind !== 'place') return { state: s, outbox: [] };
  const next = doPlace(s, action.by, action);
  if (!next) return { state: s, outbox: [] };
  return { state: next, outbox: [action] };
}

function recv(s, msg) {
  if (msg.kind === 'again') {
    const next = doAgain(s, msg.by);
    return { state: next || s, outbox: [] };
  }
  if (s.phase !== 'play' || s.turn !== msg.by || msg.kind !== 'place') return { state: s, outbox: [] };
  const next = doPlace(s, msg.by, msg);
  return { state: next || s, outbox: [] };
}

function baseState(s) {
  return JSON.stringify({
    mode: s.mode, phase: s.phase, turn: s.turn, round: s.round,
    deck: s.deck, hands: s.hands, slots: s.slots, flags: s.flags, scores: s.scores
  });
}

module.exports = {
  id: 'battleline',
  create: create, act: act, recv: recv, baseState: baseState,
  COLORS: COLORS, FLAGS: FLAGS, PER_SIDE: PER_SIDE, NAME_HAND: NAME_HAND,
  FORMS: FORMS, FORM_DESC: FORM_DESC,
  formation: formation, colorOf: colorOf, valueOf: valueOf, cardLabel: cardLabel,
  flagWinner: flagWinner, canPlay: canPlay, emptySlotsFor: emptySlotsFor,
  flagCount: flagCount, runOfThree: runOfThree
};

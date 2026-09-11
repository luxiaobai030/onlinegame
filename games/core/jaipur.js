// ===== 斋普尔（Jaipur）核心逻辑：市场买卖，先拿 2 枚卓越之印者赢 =====
const rnd = require('../../utils/rand.js');

const GOODS = ['diamond', 'gold', 'silver', 'cloth', 'spice', 'leather'];
const GOOD_NAMES = ['钻石', '金', '银', '布', '香料', '皮革'];
const CAMEL = 6;

const CARD_COUNT = [6, 6, 6, 8, 8, 10];   // 六种货物的牌数
const MIN_SELL = [2, 2, 2, 1, 1, 1];      // 卖货起卖张数
// 货物标记（从前往后拿，所以高分排前面）
const TOKENS = [
  [7, 7, 5, 5, 5],
  [6, 6, 5, 5, 5],
  [5, 5, 5, 5, 5],
  [5, 3, 3, 2, 2, 1, 1],
  [5, 3, 3, 2, 2, 1, 1],
  [4, 3, 2, 1, 1, 1, 1, 1, 1]
];
// 奖励标记：一次卖 3 / 4 / 5 张及以上各拿一枚
const BONUS = { 3: [1, 1, 2, 2, 2, 3, 3], 4: [4, 4, 5, 5, 6, 6], 5: [8, 8, 9, 10, 10] };

const CAMEL_TOKEN = 5;
const HAND_MAX = 7;
const MARKET_MAX = 5;
const SEALS_TO_WIN = 2;

function isInt(v) {
  return typeof v === 'number' && v === Math.floor(v);
}

// 去重并检查下标数组；非法返回 null，空数组返回 []
function uniqInts(arr) {
  if (!arr || !arr.length) return [];
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (!isInt(v) || v < 0) return null;
    if (out.indexOf(v) >= 0) return null;
    out.push(v);
  }
  return out;
}

function copy(s) {
  return JSON.parse(JSON.stringify(s));
}

// ---------- 开局 ----------
function create(opts) {
  opts = opts || {};
  const seed = opts.seed || 'local';
  // 开局固定由「玩家 1」先手，不再随机
  const firstTurn = 0;

  const cards = [];
  for (let g = 0; g < 6; g++) {
    for (let i = 0; i < CARD_COUNT[g]; i++) cards.push(g);
  }
  for (let i = 0; i < 11; i++) cards.push(CAMEL);
  const bag = rnd.seededShuffle(cards, seed + '|jaipur');
  let p = 0;
  const draw = function () { return bag[p++]; };

  const state = {
    mode: opts.mode || 'local',
    seed: seed,
    turn: firstTurn,
    firstTurn: firstTurn,
    phase: 'play',
    winner: -1,
    roundWinner: -1,
    matchOver: false,
    matchWinner: -1,
    scores: [0, 0],
    round: 0,
    deck: [],
    market: [],
    hands: [[], []],
    camels: [0, 0],
    money: [0, 0],
    taken: [{ goods: 0, bonus: 0 }, { goods: 0, bonus: 0 }],
    piles: [],
    bonusPiles: { 3: [], 4: [], 5: [] },
    camelToken: -1,
    detail: '',
    last: '开局：市场 3 只骆驼 + 2 张货牌'
  };

  // 市场：先摆 3 只骆驼，再从牌堆翻 2 张
  state.market = [CAMEL, CAMEL, CAMEL, draw(), draw()];
  // 每人 5 张，手牌里的骆驼直接进骆驼群
  for (let side = 0; side < 2; side++) {
    for (let i = 0; i < 5; i++) {
      const c = draw();
      if (c === CAMEL) state.camels[side] += 1;
      else state.hands[side].push(c);
    }
  }
  state.deck = bag.slice(p);
  state.piles = TOKENS.map(function (a) { return a.slice(); });
  state.bonusPiles = { 3: BONUS[3].slice(), 4: BONUS[4].slice(), 5: BONUS[5].slice() };
  return state;
}

// ---------- 规则判定（界面和核心共用） ----------
// 检查「拿牌」是否合法
function checkTake(s, side, takeIdx, handIdx) {
  const ti = uniqInts(takeIdx);
  const hi = uniqInts(handIdx);
  if (!ti || !hi) return { ok: false, reason: '选择有问题' };
  if (!ti.length) return { ok: false, reason: '先点市场里的牌' };
  for (let i = 0; i < ti.length; i++) {
    if (ti[i] >= MARKET_MAX || s.market[ti[i]] === -1 || s.market[ti[i]] === undefined) {
      return { ok: false, reason: '市场里没有这张牌' };
    }
  }
  for (let i = 0; i < hi.length; i++) {
    if (hi[i] >= s.hands[side].length) return { ok: false, reason: '手牌选择有问题' };
  }
  const types = ti.map(function (i) { return s.market[i]; });
  let allCamel = true;
  for (let i = 0; i < types.length; i++) if (types[i] !== CAMEL) allCamel = false;

  if (allCamel) {
    if (hi.length === 0) {
      let camels = 0;
      for (let i = 0; i < MARKET_MAX; i++) if (s.market[i] === CAMEL) camels++;
      if (types.length !== camels) return { ok: false, reason: '只拿骆驼就要把市场里的骆驼全拿走' };
      return { ok: true, reason: '拿走 ' + types.length + ' 只骆驼' };
    }
  }
  if (hi.length === 0) {
    if (types.length !== 1 || types[0] === CAMEL) {
      return { ok: false, reason: '只拿 1 张货牌；想拿更多（含骆驼）就得还回同样张数' };
    }
  } else if (types.length !== hi.length) {
    return { ok: false, reason: '拿 ' + types.length + ' 张就要还 ' + types.length + ' 张' };
  }
  const keep = s.hands[side].length - hi.length + types.length;
  if (keep > HAND_MAX) return { ok: false, reason: '手牌最多 ' + HAND_MAX + ' 张' };
  return { ok: true, reason: types.length === 1 && !hi.length ? '拿 1 张' : '交换 ' + types.length + ' 张' };
}

// 检查「卖牌」是否合法；返回 { ok, reason, type, count }
function checkSell(s, side, handIdx) {
  const hi = uniqInts(handIdx);
  if (!hi || !hi.length) return { ok: false, reason: '先点要卖的货' };
  const type = s.hands[side][hi[0]];
  for (let i = 0; i < hi.length; i++) {
    if (hi[i] >= s.hands[side].length) return { ok: false, reason: '手牌选择有问题' };
    if (s.hands[side][hi[i]] !== type) return { ok: false, reason: '一次只能卖同一种货' };
  }
  if (hi.length < MIN_SELL[type]) {
    return { ok: false, reason: GOOD_NAMES[type] + ' 至少卖 ' + MIN_SELL[type] + ' 张' };
  }
  return { ok: true, reason: '卖 ' + hi.length + ' 张' + GOOD_NAMES[type], type: type, count: hi.length };
}

function emptyPiles(s) {
  let n = 0;
  for (let i = 0; i < 6; i++) if (!s.piles[i].length) n++;
  return n;
}

// 补满市场；返回是否「因为牌堆空了补不满」
function refill(s) {
  let short = false;
  while (s.market.length < MARKET_MAX) {
    if (!s.deck.length) { short = true; break; }
    s.market.push(s.deck.pop());
  }
  return short;
}

// ---------- 结算 ----------
function finishRound(next) {
  if (next.camels[0] !== next.camels[1]) {
    const win = next.camels[0] > next.camels[1] ? 0 : 1;
    next.money[win] += CAMEL_TOKEN;
    next.camelToken = win;
  } else {
    next.camelToken = -1;
  }
  let w;
  if (next.money[0] !== next.money[1]) w = next.money[0] > next.money[1] ? 0 : 1;
  else if (next.taken[0].bonus !== next.taken[1].bonus) w = next.taken[0].bonus > next.taken[1].bonus ? 0 : 1;
  else if (next.taken[0].goods !== next.taken[1].goods) w = next.taken[0].goods > next.taken[1].goods ? 0 : 1;
  else w = -2;

  next.phase = 'over';
  next.winner = w;
  next.roundWinner = w;
  if (w === -2) {
    next.scores[0] += 1;
    next.scores[1] += 1;
  } else {
    next.scores[w] += 1;
  }
  next.matchOver = next.scores[0] >= SEALS_TO_WIN || next.scores[1] >= SEALS_TO_WIN;
  if (next.scores[0] >= SEALS_TO_WIN && next.scores[1] >= SEALS_TO_WIN) next.matchWinner = -2;
  else if (next.scores[0] >= SEALS_TO_WIN) next.matchWinner = 0;
  else if (next.scores[1] >= SEALS_TO_WIN) next.matchWinner = 1;
  else next.matchWinner = -1;
  next.detail = '本局卢比 ' + next.money[0] + ' : ' + next.money[1];
  return next;
}

// 动作结算后统一检查这一局是否结束
function settle(next) {
  if (emptyPiles(next) >= 3) {
    next.last = '有 3 种货的标记被拿空了';
    return finishRound(next);
  }
  if (next.market.length < MARKET_MAX && !next.deck.length) {
    next.last = '牌堆摸空了，市场补不满';
    return finishRound(next);
  }
  next.turn = 1 - next.turn;
  return next;
}

// ---------- 拿牌 ----------
function doTake(s, by, action) {
  const chk = checkTake(s, by, action.takeIdx, action.handIdx);
  if (!chk.ok) return null;
  const ti = uniqInts(action.takeIdx);
  const hi = uniqInts(action.handIdx);
  const next = copy(s);

  const got = ti.map(function (i) { return next.market[i]; });
  const back = hi.map(function (i) { return next.hands[by][i]; });
  const kept = [];
  for (let i = 0; i < next.market.length; i++) {
    if (ti.indexOf(i) < 0) kept.push(next.market[i]);
  }
  let hand = [];
  for (let i = 0; i < next.hands[by].length; i++) {
    if (hi.indexOf(i) < 0) hand.push(next.hands[by][i]);
  }
  for (let i = 0; i < got.length; i++) {
    if (got[i] === CAMEL) next.camels[by] += 1;
    else hand.push(got[i]);
  }
  next.hands[by] = hand;
  next.market = kept.concat(back);
  refill(next);
  next.last = (by === 0 ? '玩家 1' : '玩家 2') + '：' + chk.reason;
  return settle(next);
}

// ---------- 卖牌 ----------
function doSell(s, by, action) {
  if (!isInt(action.type)) return null;
  const chk = checkSell(s, by, action.handIdx);
  if (!chk.ok || chk.type !== action.type) return null;
  const hi = uniqInts(action.handIdx);
  const next = copy(s);
  const type = chk.type;
  const n = chk.count;

  const pile = next.piles[type];
  const take = Math.min(n, pile.length);
  let gain = 0;
  for (let k = 0; k < take; k++) gain += pile.shift();
  next.money[by] += gain;
  next.taken[by].goods += take;

  let bonus = 0;
  if (n >= 3) {
    const bp = next.bonusPiles[String(Math.min(n, 5))];
    if (bp && bp.length) {
      bonus = bp.shift();
      next.money[by] += bonus;
      next.taken[by].bonus += 1;
    }
  }
  next.hands[by] = next.hands[by].filter(function (_, i) { return hi.indexOf(i) < 0; });
  next.last = (by === 0 ? '玩家 1' : '玩家 2') + '：卖 ' + n + ' 张' + GOOD_NAMES[type] +
    '，得 ' + gain + ' 卢比' + (bonus ? ' + 奖励 ' + bonus : '');
  return settle(next);
}

// ---------- 再来一局（接着打整场，先拿 2 枚印者赢） ----------
function doAgain(s, by) {
  if (s.phase !== 'over') return null;
  const round = s.round + 1;
  const next = create({ seed: s.seed + '|r' + round, mode: s.mode });
  next.round = round;
  next.firstTurn = (s.firstTurn + 1) % 2;
  next.turn = next.firstTurn;
  next.scores = s.matchOver ? [0, 0] : s.scores.slice();
  return next;
}

function act(s, action) {
  if (action.kind === 'again') {
    const next = doAgain(s, action.by);
    if (!next) return { state: s, outbox: [] };
    return { state: next, outbox: [{ kind: 'again', by: action.by }] };
  }
  if (s.phase !== 'play' || s.turn !== action.by) return { state: s, outbox: [] };
  let next = null;
  if (action.kind === 'take') next = doTake(s, action.by, action);
  else if (action.kind === 'sell') next = doSell(s, action.by, action);
  if (!next) return { state: s, outbox: [] };
  return { state: next, outbox: [action] };
}

function recv(s, msg) {
  if (msg.kind === 'again') {
    const next = doAgain(s, msg.by);
    return { state: next || s, outbox: [] };
  }
  if (s.phase !== 'play' || s.turn !== msg.by) return { state: s, outbox: [] };
  let next = null;
  if (msg.kind === 'take') next = doTake(s, msg.by, msg);
  else if (msg.kind === 'sell') next = doSell(s, msg.by, msg);
  return { state: next || s, outbox: [] };
}

// 给测试用的一致性摘要
function baseState(s, extra) {
  return JSON.stringify({
    mode: s.mode, phase: s.phase, turn: s.turn, round: s.round,
    market: s.market, hands: s.hands, camels: s.camels, money: s.money,
    deck: s.deck, piles: s.piles, scores: s.scores, extra: extra === undefined ? null : extra
  });
}

module.exports = {
  id: 'jaipur',
  create: create, act: act, recv: recv, baseState: baseState,
  GOODS: GOODS, GOOD_NAMES: GOOD_NAMES, CAMEL: CAMEL, MIN_SELL: MIN_SELL,
  HAND_MAX: HAND_MAX, MARKET_MAX: MARKET_MAX, SEALS_TO_WIN: SEALS_TO_WIN,
  checkTake: checkTake, checkSell: checkSell
};

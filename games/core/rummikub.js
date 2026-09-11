// ===== 数字牌（Rummikub）核心逻辑（纯逻辑，可单测）=====
// 106 张牌：黑/红/蓝/橙四色 × 1~13 各两张，外加 2 张百搭。每人先摸 14 张。
//
// 桌面是一块 13×13 的大格子（和牌面数字 1~13 对齐），牌可以拖到任意空格里自由摆放。
// 判定规则：
//   同一排横着连成一串（中间不留空档）就是一组；竖着堆在一起不算，成组只认横排；
//   刻子 = 3~4 张同数字、颜色互不相同；顺子 = 3 张以上同色连号（百搭能补缺的那一张）；
//   桌上每张牌都得落在某一组里，所以每一排里散着的单张都要处理掉。
//   第一次出牌必须一次凑够 30 分，而且在那之前不能动桌面上的牌。
//   桌上总共的牌不能变少（也就是不能把牌收进自己手里）。
//   谁先把手牌出完谁赢；牌堆摸完还有人出不了牌，就比谁手上剩下的分少。
//
// 说明：规则为自行实现，未复制任何第三方代码。
const rnd = require('../../utils/rand.js');

const COLORS = 4;          // 0 黑 1 红 2 蓝 3 橙
const MAX_NUM = 13;
const HAND = 14;
const MELD_MIN = 30;       // 首次出牌的最低分
const JOKER_POINT = 30;    // 结算时百搭算 30 分
const N = 13;              // 桌面 13×13 格
const CELLS = N * N;

function buildDeck() {
  const deck = [];
  let id = 0;
  for (let copy = 0; copy < 2; copy++) {
    for (let c = 0; c < COLORS; c++) {
      for (let v = 1; v <= MAX_NUM; v++) deck.push({ id: id++, c: c, v: v, joker: false });
    }
  }
  for (let k = 0; k < 2; k++) deck.push({ id: id++, c: -1, v: 0, joker: true });
  return deck;
}

function cmpTile(a, b) {
  if (a.joker !== b.joker) return a.joker ? 1 : -1;
  if (a.c !== b.c) return a.c - b.c;
  if (a.v !== b.v) return a.v - b.v;
  return a.id - b.id;
}

function sortRack(rack) {
  return sortRackBy(rack, 'color');
}

// 手牌排序：color = 先按颜色再看数字（默认）；num = 先按数字再看颜色
function sortRackBy(rack, mode) {
  const list = rack.slice();
  if (mode === 'num') {
    list.sort(function (a, b) {
      if (a.joker !== b.joker) return a.joker ? 1 : -1;
      if (a.v !== b.v) return a.v - b.v;
      if (a.c !== b.c) return a.c - b.c;
      return a.id - b.id;
    });
  } else {
    list.sort(cmpTile);
  }
  return list;
}

// 判断一组牌是否成立。成立时顺带算出每张牌的摆放值（百搭会补上缺的那张）
function evalSet(tiles) {
  const n = tiles.length;
  if (n < 3) return { ok: false, reason: '每组至少要 3 张牌' };
  if (n > MAX_NUM) return { ok: false, reason: '每组最多 13 张牌' };
  const real = [];
  const jokes = [];
  for (let i = 0; i < n; i++) {
    if (tiles[i].joker) jokes.push(tiles[i]); else real.push(tiles[i]);
  }
  if (!real.length) return { ok: false, reason: '不能全用百搭凑一组' };

  // 顺子：同色、数字不重复，中间的空位可以用百搭补
  let sameColor = true;
  for (let i = 1; i < real.length; i++) {
    if (real[i].c !== real[0].c) sameColor = false;
  }
  let dupValue = false;
  const seen = {};
  for (let i = 0; i < real.length; i++) {
    if (seen[real[i].v]) dupValue = true;
    seen[real[i].v] = true;
  }
  if (sameColor && !dupValue) {
    let mn = real[0].v;
    let mx = real[0].v;
    for (let i = 1; i < real.length; i++) {
      if (real[i].v < mn) mn = real[i].v;
      if (real[i].v > mx) mx = real[i].v;
    }
    const loMin = Math.max(1, mx - n + 1);
    const loMax = Math.min(mn, MAX_NUM - n + 1);
    if (loMin <= loMax) {
      const lo = loMin;
      const slots = new Array(n).fill(null);
      for (let i = 0; i < real.length; i++) slots[real[i].v - lo] = real[i];
      let ji = 0;
      const laid = [];
      for (let i = 0; i < n; i++) {
        const t = slots[i] || jokes[ji++];
        laid.push({ tile: t, v: lo + i, c: real[0].c });
      }
      return { ok: true, kind: 'run', laid: laid };
    }
  }

  // 刻子：同数字、颜色互不相同（至少两张真牌）
  let sameNumber = true;
  for (let i = 1; i < real.length; i++) {
    if (real[i].v !== real[0].v) sameNumber = false;
  }
  let dupColor = false;
  const colorSeen = {};
  for (let i = 0; i < real.length; i++) {
    if (colorSeen[real[i].c]) dupColor = true;
    colorSeen[real[i].c] = true;
  }
  if (sameNumber && !dupColor && real.length >= 2 && n <= COLORS) {
    const sorted = real.slice().sort(cmpTile);
    const laid = [];
    for (let i = 0; i < sorted.length; i++) {
      laid.push({ tile: sorted[i], v: sorted[i].v, c: sorted[i].c });
    }
    for (let i = 0; i < jokes.length; i++) {
      laid.push({ tile: jokes[i], v: real[0].v, c: -1 });
    }
    return { ok: true, kind: 'group', laid: laid };
  }

  return { ok: false, reason: '牌组还凑不成：刻子要同数字不同色，顺子要同色连号' };
}

function idx(r, c) { return r * N + c; }
function rowOf(i) { return Math.floor(i / N); }
function colOf(i) { return i % N; }

// 把桌面扫成一组一组：只看横排，同一排连着一串（中间不留空档）就是一组。
// 竖着堆在一起不算——牌可以随便摆，但成组只认横排。
function scanBoard(board) {
  const groups = [];
  for (let r = 0; r < N; r++) {
    let from = -1;
    for (let c = 0; c <= N; c++) {
      if (c < N && board[idx(r, c)]) {
        if (from < 0) from = c;
      } else if (from >= 0) {
        if (c - from >= 2) groups.push({ dir: 'row', at: r, from: from, to: c - 1 });
        from = -1;
      }
    }
  }
  return groups;
}

function groupCells(g) {
  const out = [];
  for (let k = g.from; k <= g.to; k++) out.push(idx(g.at, k));
  return out;
}

// 桌面现状：每一格属于哪一组、这一组成不成立、百搭该显示成几
// 返回的 cells[i] = { tile, v, ok, reason }，界面照它画绿框 / 红框
function layoutBoard(s) {
  const board = s.board;
  const cells = [];
  for (let i = 0; i < CELLS; i++) {
    const t = board[i];
    cells.push({ tile: t, v: t ? t.v : 0, ok: false, reason: '' });
  }
  const groups = [];
  const owner = {};     // 格子 -> 属于第几组
  const raw = scanBoard(board);
  for (let gi = 0; gi < raw.length; gi++) {
    const cs = groupCells(raw[gi]);
    const tiles = [];
    for (let k = 0; k < cs.length; k++) tiles.push(board[cs[k]]);
    const e = evalSet(tiles);
    groups.push({ cells: cs, ok: e.ok, reason: e.ok ? '' : e.reason });
    const at = {};
    for (let k = 0; k < cs.length; k++) {
      at[board[cs[k]].id] = cs[k];
      owner[cs[k]] = gi;
    }
    if (e.ok) {
      for (let k = 0; k < e.laid.length; k++) cells[at[e.laid[k].tile.id]].v = e.laid[k].v;
    }
  }
  const alone = [];
  for (let i = 0; i < CELLS; i++) {
    if (!board[i]) continue;
    if (owner[i] === undefined) {
      alone.push(i);
      cells[i].ok = false;
      cells[i].reason = '这张牌还没凑成组（同一排要连着 3 张以上）';
      continue;
    }
    cells[i].ok = groups[owner[i]].ok;
    cells[i].reason = groups[owner[i]].reason;
  }
  return { cells: cells, groups: groups, alone: alone };
}

// 能不能收手：桌上每一格都得在成立的组里
function checkBoard(s) {
  const view = layoutBoard(s);
  for (let gi = 0; gi < view.groups.length; gi++) {
    if (!view.groups[gi].ok) return { ok: false, reason: view.groups[gi].reason };
  }
  for (let i = 0; i < CELLS; i++) {
    if (view.cells[i].tile && !view.cells[i].ok) return { ok: false, reason: view.cells[i].reason };
  }
  return { ok: true, reason: '' };
}

function findTile(s, id) {
  for (let i = 0; i < CELLS; i++) {
    if (s.board[i] && s.board[i].id === id) return s.board[i];
  }
  return null;
}

function handPoints(rack) {
  let sum = 0;
  for (let i = 0; i < rack.length; i++) sum += rack[i].joker ? JOKER_POINT : rack[i].v;
  return sum;
}

// 本回合从自己手牌里打出去的牌（对比回合开始时的快照）
function playedFromRack(s, by) {
  const before = {};
  if (s.snapshot) {
    for (let i = 0; i < s.snapshot.racks[by].length; i++) before[s.snapshot.racks[by][i].id] = true;
  }
  const now = {};
  for (let i = 0; i < s.racks[by].length; i++) now[s.racks[by][i].id] = true;
  const out = [];
  const ids = Object.keys(before);
  for (let i = 0; i < ids.length; i++) {
    if (!now[ids[i]]) out.push(Number(ids[i]));
  }
  return out;
}

// 本回合动过的格子（和回合开始时比，位置变了的牌）——界面用来高亮
function latelyCells(s) {
  const back = {};
  if (s.snapshot) {
    for (let i = 0; i < CELLS; i++) {
      if (s.snapshot.board[i]) back[s.snapshot.board[i].id] = i;
    }
  }
  const out = [];
  for (let i = 0; i < CELLS; i++) {
    const t = s.board[i];
    if (t && back[t.id] !== i) out.push(i);
  }
  return out;
}

// 这一手打出去的点数合计（首次出牌要够 30 分；百搭按它顶替的点数算）
function meldScore(s, by) {
  const view = layoutBoard(s);
  const values = {};
  for (let gi = 0; gi < view.groups.length; gi++) {
    const g = view.groups[gi];
    for (let k = 0; k < g.cells.length; k++) {
      values[s.board[g.cells[k]].id] = view.cells[g.cells[k]].v;
    }
  }
  const played = playedFromRack(s, by);
  let sum = 0;
  for (let i = 0; i < played.length; i++) {
    const t = findTile(s, played[i]);
    if (!t) continue;
    if (values[t.id] !== undefined) sum += values[t.id];
    else sum += t.joker ? JOKER_POINT : t.v;
  }
  return sum;
}

function takeFrom(array, id) {
  for (let i = 0; i < array.length; i++) {
    if (array[i].id === id) return i;
  }
  return -1;
}

// 这一手能不能收手；不能的话给出原因
function checkCommit(s) {
  if (s.phase !== 'play') return { ok: false, reason: '这局已经结束了' };
  const by = s.turn;
  const played = playedFromRack(s, by);

  const before = s.snapshot ? s.snapshot.board : [];

  // 桌上的牌只能变多，不能少（少一张就是被收回手里了）
  let countBefore = 0;
  let countNow = 0;
  for (let i = 0; i < CELLS; i++) {
    if (before[i]) countBefore++;
    if (s.board[i]) countNow++;
  }
  if (countNow < countBefore) return { ok: false, reason: '桌上的牌不能收回来用' };

  if (!played.length) return { ok: false, reason: '这一手还没出牌，可以直接点「摸一张」' };

  // 首次出牌之前连桌面上的牌都不能碰；这条要先判，
  // 不然把一组拆坏之后只会提示「每组至少要 3 张」，看不出真正的原因
  if (!s.melded[by]) {
    for (let i = 0; i < CELLS; i++) {
      if (before[i] && s.board[i] !== before[i]) {
        return { ok: false, reason: '首次出牌前不能动桌上的牌' };
      }
    }
  }

  const board = checkBoard(s);
  if (!board.ok) return { ok: false, reason: board.reason };

  if (!s.melded[by]) {
    const sum = meldScore(s, by);
    if (sum < MELD_MIN) {
      return { ok: false, reason: '首次出牌要一次凑够 ' + MELD_MIN + ' 分，现在只有 ' + sum + ' 分' };
    }
  }
  return { ok: true, played: played };
}

// ---------- 状态 ----------

function snapshot(s) {
  return {
    board: s.board.slice(),
    racks: [s.racks[0].slice(), s.racks[1].slice()],
    melded: [s.melded[0], s.melded[1]]
  };
}

function create(opts) {
  opts = opts || {};
  const seed = opts.seed || 'rummikub';
  const deck = rnd.seededShuffle(buildDeck(), seed);
  const r0 = [];
  const r1 = [];
  for (let i = 0; i < HAND; i++) {
    r0.push(deck.shift());
    r1.push(deck.shift());
  }
  const s = {
    mode: opts.mode || 'local',
    board: new Array(CELLS).fill(null),
    racks: [sortRack(r0), sortRack(r1)],
    pool: deck,
    // 开局固定由「玩家 1」先手，不再随机
    turn: 0,
    firstTurn: 0,
    phase: 'play',          // play | over
    winner: -1,
    reason: '',
    scores: [0, 0],
    round: 0,
    melded: [false, false], // 是否已经完成首次出牌
    snapshot: null
  };
  s.firstTurn = s.turn;
  s.snapshot = snapshot(s);
  return s;
}

function baseState(s, patch) {
  const next = {
    mode: s.mode,
    board: s.board,
    racks: s.racks,
    pool: s.pool,
    turn: s.turn,
    firstTurn: s.firstTurn,
    phase: s.phase,
    winner: s.winner,
    reason: s.reason,
    scores: s.scores,
    round: s.round,
    melded: s.melded,
    snapshot: s.snapshot
  };
  for (const k in patch) next[k] = patch[k];
  return next;
}

function endTurn(s, by) {
  const scores = s.scores.slice();
  let phase = 'play';
  let winner = -1;
  let reason = '';
  if (s.racks[by].length === 0) {
    phase = 'over';
    winner = by;
    reason = '手牌出完了！';
    scores[by] += 1;
  }
  const next = baseState(s, {
    phase: phase,
    winner: winner,
    reason: reason,
    scores: scores,
    turn: phase === 'over' ? s.turn : 1 - by
  });
  next.snapshot = phase === 'over' ? s.snapshot : snapshot(next);
  return next;
}

// 挪牌：把一张牌放到某个格子（to 传 'rack' 表示收回自己手里）
function doMove(s, by, tileId, to) {
  if (s.phase !== 'play' || by !== s.turn) return null;
  const board = s.board.slice();
  const racks = [s.racks[0].slice(), s.racks[1].slice()];
  let from = -1;
  for (let i = 0; i < CELLS; i++) {
    if (board[i] && board[i].id === tileId) { from = i; break; }
  }
  let tile = null;
  if (from >= 0) {
    tile = board[from];
  } else {
    const at = takeFrom(racks[by], tileId);
    if (at < 0) return null;              // 既不在桌上，也不在自己手里
    tile = racks[by][at];
    racks[by].splice(at, 1);
  }
  if (to === 'rack') {
    if (from < 0) return null;            // 本来就在手里，不用挪
    board[from] = null;
    racks[by] = sortRack(racks[by].concat([tile]));
  } else {
    const cell = Number(to);
    if (!(cell >= 0 && cell < CELLS)) return null;
    if (board[cell]) return null;         // 那一格已经有牌了
    if (from >= 0) board[from] = null;
    board[cell] = tile;
    racks[by] = sortRack(racks[by]);
  }
  return baseState(s, { board: board, racks: racks });
}

function doDraw(s, by) {
  if (s.phase !== 'play' || by !== s.turn) return null;
  // 这一手已经动过牌，就不能再摸了（先把牌恢复原样）
  if (playedFromRack(s, by).length || latelyCells(s).length) return null;
  if (!s.pool.length) {
    // 牌堆摸空了，比谁手上剩的分少
    const p0 = handPoints(s.racks[0]);
    const p1 = handPoints(s.racks[1]);
    const scores = s.scores.slice();
    let winner = -2;
    if (p0 < p1) winner = 0;
    if (p1 < p0) winner = 1;
    if (winner >= 0) scores[winner] += 1;
    return baseState(s, {
      phase: 'over',
      winner: winner,
      reason: '牌堆摸完了，比谁手上剩的分少',
      scores: scores
    });
  }
  const pool = s.pool.slice();
  const tile = pool.shift();
  const racks = [s.racks[0].slice(), s.racks[1].slice()];
  racks[by] = sortRack(racks[by].concat([tile]));
  const next = baseState(s, { pool: pool, racks: racks, turn: 1 - by });
  next.snapshot = snapshot(next);
  return next;
}

function doCommit(s, by) {
  if (s.phase !== 'play' || by !== s.turn) return null;
  if (!checkCommit(s).ok) return null;
  const melded = [s.melded[0], s.melded[1]];
  melded[by] = true;
  return endTurn(baseState(s, { melded: melded }), by);
}

function doUndo(s, by) {
  if (s.phase !== 'play' || by !== s.turn || !s.snapshot) return null;
  return baseState(s, {
    board: s.snapshot.board.slice(),
    racks: [s.snapshot.racks[0].slice(), s.snapshot.racks[1].slice()],
    melded: [s.snapshot.melded[0], s.snapshot.melded[1]]
  });
}

function doAgain(s) {
  if (s.phase !== 'over') return null;
  const round = s.round + 1;
  const fresh = create({ seed: 'rummikub#' + round, mode: s.mode });
  return baseState(fresh, { round: round, scores: s.scores.slice(), turn: round % 2, firstTurn: round % 2 });
}

function act(s, action) {
  const by = action.by;
  let next = null;
  const msg = { kind: action.kind, by: by };
  if (action.kind === 'move') {
    msg.tileId = action.tileId;
    msg.to = action.to;
    next = doMove(s, by, action.tileId, action.to);
  } else if (action.kind === 'commit') next = doCommit(s, by);
  else if (action.kind === 'draw') next = doDraw(s, by);
  else if (action.kind === 'undo') next = doUndo(s, by);
  else if (action.kind === 'again') next = doAgain(s);
  if (!next) return { state: s, outbox: [] };
  return { state: next, outbox: [msg] };
}

// 收到的消息按同样的规则重放一遍，两端就一致了
function recv(s, msg) {
  const by = msg.by;
  let next = null;
  if (msg.kind === 'move') next = doMove(s, by, msg.tileId, msg.to);
  else if (msg.kind === 'commit') next = doCommit(s, by);
  else if (msg.kind === 'draw') next = doDraw(s, by);
  else if (msg.kind === 'undo') next = doUndo(s, by);
  else if (msg.kind === 'again') next = doAgain(s);
  return { state: next || s, outbox: [] };
}

module.exports = {
  id: 'rummikub', COLORS: COLORS, MAX_NUM: MAX_NUM, HAND: HAND, MELD_MIN: MELD_MIN,
  JOKER_POINT: JOKER_POINT, N: N, CELLS: CELLS,
  buildDeck: buildDeck, create: create, act: act, recv: recv, snapshot: snapshot,
  evalSet: evalSet, sortRack: sortRack, sortRackBy: sortRackBy, handPoints: handPoints,
  idx: idx, rowOf: rowOf, colOf: colOf,
  scanBoard: scanBoard, groupCells: groupCells, layoutBoard: layoutBoard,
  checkBoard: checkBoard, checkCommit: checkCommit, playedFromRack: playedFromRack,
  latelyCells: latelyCells, meldScore: meldScore, findTile: findTile
};

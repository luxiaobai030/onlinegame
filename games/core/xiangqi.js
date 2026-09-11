// ===== 中国象棋核心逻辑（纯逻辑，可单测）=====
// 9 列 × 10 行，红方（0）在下方、黑方（1）在上方，红先。
// 棋子：K 帅/将  A 仕/士  B 相/象  N 马  R 车  C 炮  P 兵/卒；大写 = 红方，小写 = 黑方。
// 规则包含：蹩马腿、塞象眼、象不过河、士帅不出九宫、炮隔子吃、
// 兵过河可横走、飞将（将帅照面判负），以及"不能送将"的走子合法性过滤。
// 说明：走子规则为自行实现，未复制任何第三方代码（参考实现见 README）。
const ROWS = 10;
const COLS = 9;
const N = ROWS * COLS;
const RED = 0;
const BLACK = 1;

// 初始阵型（第 0 行是黑方底线，第 9 行是红方底线）
const INIT = [
  'rnbakabnr',
  '.........',
  '.c.....c.',
  'p.p.p.p.p',
  '.........',
  '.........',
  'P.P.P.P.P',
  '.C.....C.',
  '.........',
  'RNBAKABNR'
];

const PIECE_NAME = {
  K: '帅', A: '仕', B: '相', N: '马', R: '车', C: '炮', P: '兵',
  k: '将', a: '士', b: '象', n: '马', r: '车', c: '炮', p: '卒'
};

const D4 = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
// 马走日：[目标行偏移, 目标列偏移, 马腿行偏移, 马腿列偏移]
const HORSE = [
  [-2, -1, -1, 0], [-2, 1, -1, 0], [2, -1, 1, 0], [2, 1, 1, 0],
  [-1, -2, 0, -1], [1, -2, 0, -1], [-1, 2, 0, 1], [1, 2, 0, 1]
];
// 象走田：[行偏移, 列偏移]
const ELEPHANT = [[-2, -2], [-2, 2], [2, -2], [2, 2]];

function idx(r, c) { return r * COLS + c; }
function rowOf(i) { return Math.floor(i / COLS); }
function colOf(i) { return i % COLS; }
function inBoard(r, c) { return r >= 0 && r < ROWS && c >= 0 && c < COLS; }
function at(board, r, c) { return inBoard(r, c) ? board[idx(r, c)] : ''; }
function sideOf(ch) { return (!ch || ch === ch.toUpperCase()) ? RED : BLACK; }   // 大写 = 红方
function inPalace(r, c, side) {
  if (c < 3 || c > 5) return false;
  return side === RED ? (r >= 7 && r <= 9) : (r >= 0 && r <= 2);
}
function ownHalf(r, side) { return side === RED ? r >= 5 : r <= 4; }              // 象不过河

function startBoard() {
  const board = new Array(N).fill('');
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const ch = INIT[r].charAt(c);
      if (ch !== '.') board[idx(r, c)] = ch;
    }
  }
  return board;
}

// 落一步：空位可走（返回 true 表示还能继续延伸），敌子可吃（不能再延伸）
function stepTo(board, out, side, r, c) {
  if (!inBoard(r, c)) return false;
  const t = board[idx(r, c)];
  if (!t) { out.push(idx(r, c)); return true; }
  if (sideOf(t) !== side) out.push(idx(r, c));
  return false;
}

// 不考虑"送将"的走法（也就是棋子本身的走子规则）
function pseudo(board, r, c) {
  const ch = at(board, r, c);
  if (!ch) return [];
  const side = sideOf(ch);
  const type = ch.toUpperCase();
  const out = [];
  let i;

  if (type === 'R') {
    for (i = 0; i < 4; i++) {
      let rr = r + D4[i][0];
      let cc = c + D4[i][1];
      while (inBoard(rr, cc)) {
        const t = board[idx(rr, cc)];
        if (!t) out.push(idx(rr, cc));
        else {
          if (sideOf(t) !== side) out.push(idx(rr, cc));
          break;
        }
        rr += D4[i][0];
        cc += D4[i][1];
      }
    }
  } else if (type === 'C') {
    for (i = 0; i < 4; i++) {
      let rr = r + D4[i][0];
      let cc = c + D4[i][1];
      let screen = false;
      while (inBoard(rr, cc)) {
        const t = board[idx(rr, cc)];
        if (!screen) {
          if (!t) out.push(idx(rr, cc));
          else screen = true;                       // 遇到炮架，之后才吃子
        } else if (t) {
          if (sideOf(t) !== side) out.push(idx(rr, cc));
          break;
        }
        rr += D4[i][0];
        cc += D4[i][1];
      }
    }
  } else if (type === 'N') {
    for (i = 0; i < HORSE.length; i++) {
      const h = HORSE[i];
      if (at(board, r + h[2], c + h[3])) continue;  // 蹩马腿
      stepTo(board, out, side, r + h[0], c + h[1]);
    }
  } else if (type === 'B') {
    for (i = 0; i < ELEPHANT.length; i++) {
      const rr = r + ELEPHANT[i][0];
      const cc = c + ELEPHANT[i][1];
      if (!inBoard(rr, cc)) continue;
      if (at(board, r + ELEPHANT[i][0] / 2, c + ELEPHANT[i][1] / 2)) continue;  // 塞象眼
      if (!ownHalf(rr, side)) continue;                                          // 象不过河
      stepTo(board, out, side, rr, cc);
    }
  } else if (type === 'A') {
    for (i = 0; i < DIAG.length; i++) {
      const rr = r + DIAG[i][0];
      const cc = c + DIAG[i][1];
      if (!inPalace(rr, cc, side)) continue;        // 士不出九宫
      stepTo(board, out, side, rr, cc);
    }
  } else if (type === 'K') {
    for (i = 0; i < D4.length; i++) {
      const rr = r + D4[i][0];
      const cc = c + D4[i][1];
      if (!inPalace(rr, cc, side)) continue;        // 帅不出九宫
      stepTo(board, out, side, rr, cc);
    }
    // 飞将：同一列、中间无子时可以直接"照面"吃对方将帅
    const foe = side === RED ? 'k' : 'K';
    for (i = 0; i < 2; i++) {
      const dr = i === 0 ? -1 : 1;
      let rr = r + dr;
      while (inBoard(rr, c)) {
        const t = board[idx(rr, c)];
        if (t) {
          if (t === foe) out.push(idx(rr, c));
          break;
        }
        rr += dr;
      }
    }
  } else if (type === 'P') {
    const fwd = side === RED ? -1 : 1;
    stepTo(board, out, side, r + fwd, c);           // 只能向前
    const crossed = side === RED ? r <= 4 : r >= 5;
    if (crossed) {                                  // 过河后可以横走
      stepTo(board, out, side, r, c - 1);
      stepTo(board, out, side, r, c + 1);
    }
  }
  return out;
}

function applyMove(board, from, to) {
  const next = board.slice();
  next[to] = next[from];
  next[from] = '';
  return next;
}

function generalPos(board, side) {
  const target = side === RED ? 'K' : 'k';
  for (let i = 0; i < N; i++) {
    if (board[i] === target) return i;
  }
  return -1;
}

// 某一方是否被将军（含飞将）
function inCheck(board, side) {
  const g = generalPos(board, side);
  if (g < 0) return true;                       // 将已经不在了
  const foe = 1 - side;
  const gr = rowOf(g);
  const gc = colOf(g);
  for (let i = 0; i < N; i++) {
    const ch = board[i];
    if (!ch || sideOf(ch) !== foe) continue;
    if (pseudo(board, rowOf(i), colOf(i)).indexOf(g) >= 0) return true;
  }
  return false;
}

// 合法的落点（会滤掉走完自己被将军的走法）
function legalMoves(board, from) {
  const ch = board[from];
  if (!ch) return [];
  const side = sideOf(ch);
  const raw = pseudo(board, rowOf(from), colOf(from));
  const out = [];
  for (let i = 0; i < raw.length; i++) {
    if (!inCheck(applyMove(board, from, raw[i]), side)) out.push(raw[i]);
  }
  return out;
}

// 这一方还有没有棋可走（没有 = 被将死或困毙，判负）
function hasLegalMove(board, side) {
  for (let i = 0; i < N; i++) {
    const ch = board[i];
    if (!ch || sideOf(ch) !== side) continue;
    if (legalMoves(board, i).length) return true;
  }
  return false;
}

function create(opts) {
  opts = opts || {};
  return {
    mode: opts.mode || 'local',
    board: startBoard(),
    turn: RED,              // 象棋规矩：红先
    firstTurn: RED,
    phase: 'play',          // play | over
    winner: -1,
    reason: '',
    scores: [0, 0],
    round: 0,
    lastMove: -1,           // 上一手的落点
    lastFrom: -1,
    check: -1,              // 被将军的一方，-1 = 没人被将军
    history: []             // 悔棋用的历史快照
  };
}

function doMove(s, by, from, to) {
  if (s.phase !== 'play') return null;
  if (s.turn !== by) return null;
  if (from < 0 || from >= N || to < 0 || to >= N) return null;
  const ch = s.board[from];
  if (!ch || sideOf(ch) !== by) return null;
  if (legalMoves(s.board, from).indexOf(to) < 0) return null;

  const board = applyMove(s.board, from, to);
  const taken = s.board[to];
  let phase = 'play';
  let winner = -1;
  let reason = '';
  if (taken && taken.toUpperCase() === 'K') {
    phase = 'over';
    winner = by;
    reason = '将帅被吃';
  } else if (!hasLegalMove(board, 1 - by)) {
    phase = 'over';
    winner = by;
    reason = inCheck(board, 1 - by) ? '将死' : '困毙';
  }
  const scores = s.scores.slice();
  if (phase === 'over') scores[by] += 1;

  const history = s.history.slice();
  history.push({ board: s.board, turn: s.turn });
  if (history.length > 400) history.shift();

  return {
    mode: s.mode,
    board: board,
    turn: phase === 'over' ? s.turn : 1 - by,
    firstTurn: s.firstTurn,
    phase: phase,
    winner: winner,
    reason: reason,
    scores: scores,
    round: s.round,
    lastMove: to,
    lastFrom: from,
    check: (phase === 'play' && inCheck(board, 1 - by)) ? (1 - by) : -1,
    history: history
  };
}

function doAgain(s, by) {
  if (s.phase !== 'over') return null;
  const round = s.round + 1;
  return {
    mode: s.mode,
    board: startBoard(),
    turn: RED,              // 每一局都是红先
    firstTurn: s.firstTurn,
    phase: 'play',
    winner: -1,
    reason: '',
    scores: s.scores.slice(),
    round: round,
    lastMove: -1,
    lastFrom: -1,
    check: -1,
    history: []
  };
}

// 悔棋：退回上一步（只在同屏模式用，联机模式不提供）
function undo(s) {
  if (!s.history || !s.history.length) return null;
  const history = s.history.slice();
  const snap = history.pop();
  return {
    mode: s.mode,
    board: snap.board,
    turn: snap.turn,
    firstTurn: s.firstTurn,
    phase: 'play',
    winner: -1,
    reason: '',
    scores: s.phase === 'over' ? [s.scores[0] - (s.winner === 0 ? 1 : 0), s.scores[1] - (s.winner === 1 ? 1 : 0)] : s.scores.slice(),
    round: s.round,
    lastMove: -1,
    lastFrom: -1,
    check: -1,
    history: history
  };
}

function act(s, action) {
  const by = action.by;
  if (action.kind === 'move') {
    const next = doMove(s, by, action.from, action.to);
    if (!next) return { state: s, outbox: [] };
    return { state: next, outbox: [{ kind: 'move', by: by, from: action.from, to: action.to }] };
  }
  if (action.kind === 'again') {
    const next = doAgain(s, by);
    if (!next) return { state: s, outbox: [] };
    return { state: next, outbox: [{ kind: 'again', by: by }] };
  }
  return { state: s, outbox: [] };
}

function recv(s, msg) {
  if (msg.kind === 'move') {
    const next = doMove(s, msg.by, msg.from, msg.to);
    return { state: next || s, outbox: [] };
  }
  if (msg.kind === 'again') {
    const next = doAgain(s, msg.by);
    return { state: next || s, outbox: [] };
  }
  return { state: s, outbox: [] };
}

module.exports = {
  id: 'xiangqi', ROWS: ROWS, COLS: COLS, N: N, RED: RED, BLACK: BLACK,
  PIECE_NAME: PIECE_NAME, INIT: INIT,
  create: create, act: act, recv: recv, undo: undo,
  idx: idx, rowOf: rowOf, colOf: colOf, at: at, sideOf: sideOf,
  startBoard: startBoard, pseudo: pseudo, legalMoves: legalMoves,
  inCheck: inCheck, hasLegalMove: hasLegalMove, generalPos: generalPos
};

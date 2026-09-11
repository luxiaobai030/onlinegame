// ===== 黑白棋（奥赛罗 / Reversi）核心逻辑（纯逻辑，可单测）=====
// 8×8 棋盘，落子后夹住的对方棋子全部翻成自己颜色；
// 一方无子可下时自动跳过（pass），双方都下不了就数子定胜负
const rnd = require('../../utils/rand.js');

const SIZE = 8;
const N = SIZE * SIZE;
const DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];

function idx(r, c) { return r * SIZE + c; }
function onBoard(r, c) { return r >= 0 && r < SIZE && c >= 0 && c < SIZE; }

// 从 (r,c) 沿 (dr,dc) 方向能夹住的对方棋子；夹不住返回 null
function lineFlips(board, by, r, c, dr, dc) {
  const foe = 1 - by;
  const out = [];
  let rr = r + dr;
  let cc = c + dc;
  while (onBoard(rr, cc) && board[idx(rr, cc)] === foe) {
    out.push(idx(rr, cc));
    rr += dr;
    cc += dc;
  }
  if (!out.length) return null;
  if (!onBoard(rr, cc) || board[idx(rr, cc)] !== by) return null;
  return out;
}

// 在 i 落子能翻掉的所有棋子；不能下返回 null
function flipsFor(board, by, i) {
  if (i < 0 || i >= N || board[i] !== -1) return null;
  const r = Math.floor(i / SIZE);
  const c = i % SIZE;
  const all = [];
  for (let d = 0; d < DIRS.length; d++) {
    const f = lineFlips(board, by, r, c, DIRS[d][0], DIRS[d][1]);
    if (f) for (let k = 0; k < f.length; k++) all.push(f[k]);
  }
  return all.length ? all : null;
}

// by 现在所有能下的位置
function legalMoves(board, by) {
  const out = [];
  for (let i = 0; i < N; i++) if (flipsFor(board, by, i)) out.push(i);
  return out;
}

function countPieces(board) {
  let a = 0;
  let b = 0;
  for (let i = 0; i < N; i++) {
    if (board[i] === 0) a++;
    else if (board[i] === 1) b++;
  }
  return [a, b];
}

function startBoard(firstTurn) {
  const board = new Array(N).fill(-1);
  board[idx(3, 3)] = 1 - firstTurn;
  board[idx(3, 4)] = firstTurn;
  board[idx(4, 3)] = firstTurn;
  board[idx(4, 4)] = 1 - firstTurn;
  return board;
}

function create(opts) {
  opts = opts || {};
  const seed = opts.seed || 'local';
  // 开局固定由「玩家 1」先手，不再随机
  const firstTurn = 0;
  return {
    mode: opts.mode || 'local',
    board: startBoard(firstTurn),
    turn: firstTurn,
    firstTurn: firstTurn,
    phase: 'play',        // play | over
    winner: -1,           // -1 无 / 0 | 1 / -2 平局
    counts: [2, 2],       // 双方当前棋子数
    scores: [0, 0],       // 胜局数
    round: 0,
    lastMove: -1,
    lastFlips: [],
    passed: -1            // 上一手之后被跳过的一方（无跳过为 -1）
  };
}

function doMove(s, by, i) {
  if (s.phase !== 'play') return null;
  if (s.turn !== by) return null;
  const flips = flipsFor(s.board, by, i);
  if (!flips) return null;
  const board = s.board.slice();
  board[i] = by;
  for (let k = 0; k < flips.length; k++) board[flips[k]] = by;
  const counts = countPieces(board);
  const foe = 1 - by;
  const scores = s.scores.slice();
  let turn = foe;
  let passed = -1;
  let phase = 'play';
  let winner = -1;
  if (legalMoves(board, foe).length) {
    turn = foe;
  } else if (legalMoves(board, by).length) {
    turn = by;            // 对方没得下，直接跳过，还是自己接着下
    passed = foe;
  } else {
    phase = 'over';       // 双方都下不了，数子定胜负
    winner = counts[0] === counts[1] ? -2 : (counts[0] > counts[1] ? 0 : 1);
    if (winner >= 0) scores[winner] += 1;
  }
  return {
    mode: s.mode,
    board: board,
    turn: turn,
    firstTurn: s.firstTurn,
    phase: phase,
    winner: winner,
    counts: counts,
    scores: scores,
    round: s.round,
    lastMove: i,
    lastFlips: flips,
    passed: passed
  };
}

function doAgain(s, by) {
  if (s.phase !== 'over') return null;
  const round = s.round + 1;
  const firstTurn = (s.firstTurn + round) % 2;
  return {
    mode: s.mode,
    board: startBoard(firstTurn),
    turn: firstTurn,
    firstTurn: firstTurn,
    phase: 'play',
    winner: -1,
    counts: [2, 2],
    scores: s.scores.slice(),
    round: round,
    lastMove: -1,
    lastFlips: [],
    passed: -1
  };
}

function act(s, action) {
  const by = action.by;
  if (action.kind === 'move') {
    const next = doMove(s, by, action.i);
    if (!next) return { state: s, outbox: [] };
    return { state: next, outbox: [{ kind: 'move', by: by, i: action.i }] };
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
    const next = doMove(s, msg.by, msg.i);
    return { state: next || s, outbox: [] };
  }
  if (msg.kind === 'again') {
    const next = doAgain(s, msg.by);
    return { state: next || s, outbox: [] };
  }
  return { state: s, outbox: [] };
}

module.exports = { id: 'reversi', SIZE, N, create, act, recv, legalMoves, flipsFor, countPieces };

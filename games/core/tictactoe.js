// ===== 井字棋核心逻辑（纯逻辑，可单测） =====
const rnd = require('../../utils/rand.js');

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6]
];

function checkWinner(board) {
  for (let i = 0; i < LINES.length; i++) {
    const l = LINES[i];
    const v = board[l[0]];
    if (v !== -1 && board[l[1]] === v && board[l[2]] === v) {
      return { winner: v, line: l };
    }
  }
  return null;
}

function create(opts) {
  opts = opts || {};
  const seed = opts.seed || 'local';
  // 开局固定由「玩家 1」先手，不再随机
  const firstTurn = 0;
  return {
    mode: opts.mode || 'local',
    board: [-1, -1, -1, -1, -1, -1, -1, -1, -1],
    turn: firstTurn,
    firstTurn: firstTurn,
    phase: 'play',          // play | over
    winner: -1,             // -1 无 / 0 | 1 / -2 平局
    winLine: [],
    scores: [0, 0],
    round: 0,
    lastMove: -1
  };
}

function baseState(s, moveBy) {
  return s.mode + '|' + s.phase + '|' + s.turn + '|' + s.round + '|' +
    s.board.join(',') + '|' + s.scores.join(',') + '|' + moveBy;
}

// 落子
function doMove(s, by, i) {
  if (s.phase !== 'play') return null;
  if (s.turn !== by) return null;
  if (i < 0 || i > 8 || s.board[i] !== -1) return null;
  const board = s.board.slice();
  board[i] = by;
  const win = checkWinner(board);
  const full = board.indexOf(-1) === -1;
  const next = {
    board: board,
    turn: 1 - by,
    phase: win ? 'over' : (full ? 'over' : 'play'),
    winner: win ? win.winner : (full ? -2 : -1),
    winLine: win ? win.line : [],
    scores: s.scores.slice(),
    round: s.round,
    firstTurn: s.firstTurn,
    mode: s.mode,
    lastMove: i
  };
  if (win) next.scores[win.winner] += 1;
  return next;
}

// 再来一局
function doAgain(s, by) {
  if (s.phase !== 'over') return null;
  const round = s.round + 1;
  const turn = (s.firstTurn + round) % 2;
  return {
    mode: s.mode,
    board: [-1, -1, -1, -1, -1, -1, -1, -1, -1],
    turn: turn,
    firstTurn: s.firstTurn,
    phase: 'play',
    winner: -1,
    winLine: [],
    scores: s.scores.slice(),
    round: round,
    lastMove: -1
  };
}

// 本地/主动方执行操作；返回 { state, outbox }
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

// 收到对方消息
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

module.exports = { id: 'tictactoe', create, act, recv, baseState };

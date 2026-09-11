// ===== 五子棋核心逻辑（纯逻辑，可单测） =====
// 悔棋说明：
//  - 本地同屏：直接回退上一手（kind: 'undo'）
//  - 联机：先请求（kind: 'undo-req'），对方回应后才回退（kind: 'undo-res'），
//    两端都跑同一套确定性逻辑，所以状态始终一致
const rnd = require('../../utils/rand.js');

const SIZE = 15;
const N = SIZE * SIZE;
const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];
const MAX_HISTORY = 400;   // 悔棋历史最多保留的手数

function inBoard(r, c) {
  return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
}

// 检查 (r,c) 处是否有五连
function checkWin(board, r, c) {
  const color = board[r * SIZE + c];
  if (color === -1) return null;
  for (let d = 0; d < DIRS.length; d++) {
    const dr = DIRS[d][0];
    const dc = DIRS[d][1];
    const cells = [r * SIZE + c];
    for (let k = 1; k < 5; k++) {
      const rr = r + dr * k;
      const cc = c + dc * k;
      if (!inBoard(rr, cc) || board[rr * SIZE + cc] !== color) break;
      cells.push(rr * SIZE + cc);
    }
    for (let k = 1; k < 5; k++) {
      const rr = r - dr * k;
      const cc = c - dc * k;
      if (!inBoard(rr, cc) || board[rr * SIZE + cc] !== color) break;
      cells.push(rr * SIZE + cc);
    }
    if (cells.length >= 5) return cells;
  }
  return null;
}

// 悔棋快照：只保存会随落子变化的字段
function snapshot(s) {
  return {
    board: s.board.slice(),
    turn: s.turn,
    phase: s.phase,
    winner: s.winner,
    winCells: s.winCells.slice(),
    scores: s.scores.slice(),
    round: s.round,
    lastMove: s.lastMove
  };
}

// 基于旧状态生成新状态，避免漏字段
function carry(s, patch) {
  const base = Object.assign({
    mode: s.mode,
    firstTurn: s.firstTurn,
    history: s.history.slice(),
    undoReq: -1
  }, snapshot(s));
  return Object.assign(base, patch || {});
}

function create(opts) {
  opts = opts || {};
  const seed = opts.seed || 'local';
  // 开局固定由「玩家 1」先手，不再随机
  const firstTurn = 0;
  return {
    mode: opts.mode || 'local',
    board: new Array(N).fill(-1),
    turn: firstTurn,
    firstTurn: firstTurn,
    phase: 'play',
    winner: -1,
    winCells: [],
    scores: [0, 0],
    round: 0,
    lastMove: -1,
    history: [],     // 每一手之前的状态，用于悔棋
    undoReq: -1      // 联机：正在请求悔棋的一方
  };
}

function doMove(s, by, i) {
  if (s.phase !== 'play') return null;
  if (s.turn !== by) return null;
  if (i < 0 || i >= N || s.board[i] !== -1) return null;
  const r = Math.floor(i / SIZE);
  const c = i % SIZE;
  const board = s.board.slice();
  board[i] = by;
  const win = checkWin(board, r, c);
  const full = board.indexOf(-1) === -1;
  const scores = s.scores.slice();
  if (win) scores[by] += 1;
  const next = carry(s, {
    board: board,
    turn: 1 - by,
    phase: win ? 'over' : (full ? 'over' : 'play'),
    winner: win ? by : (full ? -2 : -1),
    winCells: win || [],
    scores: scores,
    lastMove: i
  });
  const history = s.history.slice();
  history.push(snapshot(s));
  if (history.length > MAX_HISTORY) history.shift();
  next.history = history;
  return next;
}

// 悔棋：回到上一手之前（比分、胜负一起回退）
function doUndo(s) {
  if (!s.history.length) return null;
  const history = s.history.slice();
  const prev = history.pop();
  return carry(s, Object.assign({}, prev, { history: history }));
}

// 联机：发起悔棋请求
function doUndoReq(s, by) {
  if (!s.history.length) return null;
  if (s.undoReq === -1) return carry(s, { undoReq: by });
  if (s.undoReq !== by) {
    // 双方同时按了悔棋：视为都同意，直接回退一手
    return doUndo(s) || carry(s, { undoReq: -1 });
  }
  return null;   // 自己重复点击
}

// 联机：回应悔棋请求（by 必须是没有发起请求的那一方）
function doUndoRes(s, by, accept) {
  if (s.undoReq === -1 || s.undoReq === by) return null;
  if (!accept) return carry(s, { undoReq: -1 });
  return doUndo(s) || carry(s, { undoReq: -1 });
}

// 再来一局：清空棋盘与悔棋历史
function doAgain(s, by) {
  if (s.phase !== 'over') return null;
  const round = s.round + 1;
  const turn = (s.firstTurn + round) % 2;
  return carry(s, {
    board: new Array(N).fill(-1),
    turn: turn,
    phase: 'play',
    winner: -1,
    winCells: [],
    round: round,
    lastMove: -1,
    history: [],
    undoReq: -1
  });
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
  if (action.kind === 'undo') {
    const next = doUndo(s);
    if (!next) return { state: s, outbox: [] };
    return { state: next, outbox: [] };
  }
  if (action.kind === 'undo-req') {
    const next = doUndoReq(s, by);
    if (!next) return { state: s, outbox: [] };
    return { state: next, outbox: [{ kind: 'undo-req', by: by }] };
  }
  if (action.kind === 'undo-res') {
    const next = doUndoRes(s, by, action.accept);
    if (!next) return { state: s, outbox: [] };
    return { state: next, outbox: [{ kind: 'undo-res', by: by, accept: !!action.accept }] };
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
  if (msg.kind === 'undo-req') {
    const next = doUndoReq(s, msg.by);
    return { state: next || s, outbox: [] };
  }
  if (msg.kind === 'undo-res') {
    const next = doUndoRes(s, msg.by, msg.accept);
    return { state: next || s, outbox: [] };
  }
  return { state: s, outbox: [] };
}

module.exports = { id: 'gomoku', SIZE, N, create, act, recv };

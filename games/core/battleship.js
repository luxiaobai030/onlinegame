// ===== 海战棋（Battleship）核心逻辑（纯逻辑，可单测）=====
// 6×6 海域，各放 3 艘船（巡洋舰 3 格 / 驱逐舰 2 格 / 快艇 1 格）；
// 轮流开炮，先把对方三条船全部击沉者胜。双方舰队互相不可见。
const rnd = require('../../utils/rand.js');

const SIZE = 6;
const N = SIZE * SIZE;
const SHIPS = [3, 2, 1];
const SHIP_NAMES = ['巡洋舰', '驱逐舰', '快艇'];

function inBoard(r, c) { return r >= 0 && r < SIZE && c >= 0 && c < SIZE; }

// 从 (row,col) 起、长度 len、横向 horiz 的格子；越界返回 null
function shipCells(row, col, len, horiz) {
  const out = [];
  for (let k = 0; k < len; k++) {
    const r = row + (horiz ? 0 : k);
    const c = col + (horiz ? k : 0);
    if (!inBoard(r, c)) return null;
    out.push(r * SIZE + c);
  }
  return out;
}

function shipCellsOf(fleet) {
  const out = [];
  for (let k = 0; k < fleet.length; k++) {
    for (let j = 0; j < fleet[k].cells.length; j++) out.push(fleet[k].cells[j]);
  }
  return out;
}

function overlaps(fleet, cells) {
  const used = shipCellsOf(fleet);
  for (let k = 0; k < cells.length; k++) {
    if (used.indexOf(cells[k]) >= 0) return true;
  }
  return false;
}

function emptyGrid() {
  return new Array(N).fill(-1);
}

function create(opts) {
  opts = opts || {};
  const seed = opts.seed || 'local';
  // 开局固定由「玩家 1」先开炮，不再随机
  const firstTurn = 0;
  return {
    mode: opts.mode || 'local',
    size: SIZE,
    ships: SHIPS.slice(),
    phase: 'setup',            // setup 布阵 → play 开打 → over 结束
    setupBy: 0,                // 布阵阶段轮到谁
    fleets: [[], []],          // 每人已放好的船：[{ len, cells:[...] }]
    ready: [false, false],
    shots: [new Array(N).fill(-1), new Array(N).fill(-1)],   // shots[by][i]：by 打 i 的结果 -1/0 空/1 中
    turn: firstTurn,
    firstTurn: firstTurn,
    phaseState: 'ok',
    winner: -1,
    scores: [0, 0],
    round: 0,
    lastShot: null,            // { by, i, hit, sunk }
    sunkCount: [0, 0]          // 各自被击沉的船数
  };
}

// 布阵：放下当前这艘船（按 SHIPS 顺序，从大到小）
function doPlace(s, by, row, col, horiz) {
  if (s.phase !== 'setup') return null;
  const fleet = s.fleets[by];
  if (fleet.length >= SHIPS.length) return null;
  const cells = shipCells(row, col, SHIPS[fleet.length], !!horiz);
  if (!cells) return null;
  if (overlaps(fleet, cells)) return null;
  const fleets = [s.fleets[0].slice(), s.fleets[1].slice()];
  fleets[by] = fleet.concat([{ len: SHIPS[fleet.length], cells: cells }]);
  return Object.assign({}, s, { fleets: fleets });
}

// 布阵：撤掉最后一艘
function doUndoPlace(s, by) {
  if (s.phase !== 'setup') return null;
  const fleet = s.fleets[by];
  if (!fleet.length) return null;
  const fleets = [s.fleets[0].slice(), s.fleets[1].slice()];
  fleets[by] = fleet.slice(0, fleet.length - 1);
  return Object.assign({}, s, { fleets: fleets });
}

// 布阵：随机摆满（seed 相同就摆得一样，方便测试复现）
function doAutoPlace(s, by, seed) {
  if (s.phase !== 'setup') return null;
  if (s.fleets[by].length >= SHIPS.length) return s;
  let cur = s;
  let guard = 0;
  while (cur.fleets[by].length < SHIPS.length && guard++ < 500) {
    const k = cur.fleets[by].length;
    const len = SHIPS[k];
    const salt = (seed || 'auto') + '::' + by + '::' + k + '::' + guard;
    const horiz = rnd.randInt(salt, 'h', 2) === 0;
    const row = rnd.randInt(salt, 'r', SIZE);
    const col = rnd.randInt(salt, 'c', SIZE);
    const next = doPlace(cur, by, row, col, horiz);
    if (next) cur = next;
  }
  return cur;
}

// 布阵完成（两艘都摆完才算）
function doReady(s, by) {
  if (s.phase !== 'setup') return null;
  if (s.fleets[by].length < SHIPS.length) return null;
  const ready = s.ready.slice();
  ready[by] = true;
  const next = Object.assign({}, s, { ready: ready });
  if (ready[0] && ready[1]) {
    next.phase = 'play';
    next.setupBy = -1;
    next.turn = next.firstTurn;
  } else {
    next.setupBy = ready[0] ? 1 : 0;
  }
  return next;
}

// 开炮
function doShoot(s, by, i) {
  if (s.phase !== 'play') return null;
  if (s.turn !== by) return null;
  if (i < 0 || i >= N || s.shots[by][i] !== -1) return null;
  const foeCells = shipCellsOf(s.fleets[1 - by]);
  const hit = foeCells.indexOf(i) >= 0;
  const shots = [s.shots[0].slice(), s.shots[1].slice()];
  shots[by][i] = hit ? 1 : 0;

  // 这一炮有没有把某条船打沉（只认「正好被这一炮打完」的那条，否则已沉的会被反复计数）
  let sunk = '';
  if (hit) {
    const fleet = s.fleets[1 - by];
    for (let k = 0; k < fleet.length; k++) {
      const cells = fleet[k].cells;
      if (cells.indexOf(i) < 0) continue;
      let all = true;
      for (let j = 0; j < cells.length; j++) {
        if (shots[by][cells[j]] !== 1) { all = false; break; }
      }
      if (all) { sunk = SHIP_NAMES[k] || '敌舰'; break; }
    }
  }

  // 对方全灭？
  let remain = 0;
  for (let k = 0; k < foeCells.length; k++) {
    if (shots[by][foeCells[k]] !== 1) remain++;
  }
  const over = remain === 0;
  const scores = s.scores.slice();
  if (over) scores[by] += 1;

  const sunkCount = s.sunkCount.slice();
  if (sunk) sunkCount[1 - by] += 1;

  return Object.assign({}, s, {
    shots: shots,
    turn: over ? s.turn : 1 - by,
    phase: over ? 'over' : 'play',
    winner: over ? by : -1,
    scores: scores,
    sunkCount: sunkCount,
    lastShot: { by: by, i: i, hit: hit, sunk: sunk }
  });
}

function doAgain(s, by) {
  if (s.phase !== 'over') return null;
  const round = s.round + 1;
  const firstTurn = (s.firstTurn + round) % 2;
  return Object.assign({}, s, {
    phase: 'setup',
    setupBy: firstTurn,
    fleets: [[], []],
    ready: [false, false],
    shots: [new Array(N).fill(-1), new Array(N).fill(-1)],
    turn: firstTurn,
    firstTurn: firstTurn,
    winner: -1,
    round: round,
    lastShot: null,
    sunkCount: [0, 0]
  });
}

function act(s, action) {
  const by = action.by;
  if (action.kind === 'place') {
    const next = doPlace(s, by, action.row, action.col, action.horiz);
    if (!next) return { state: s, outbox: [] };
    return { state: next, outbox: [{ kind: 'place', by: by, row: action.row, col: action.col, horiz: !!action.horiz }] };
  }
  if (action.kind === 'undoPlace') {
    const next = doUndoPlace(s, by);
    if (!next) return { state: s, outbox: [] };
    return { state: next, outbox: [{ kind: 'undoPlace', by: by }] };
  }
  if (action.kind === 'autoPlace') {
    const next = doAutoPlace(s, by, action.seed);
    if (!next || next === s) return { state: s, outbox: [] };
    return { state: next, outbox: [{ kind: 'autoPlace', by: by, seed: action.seed }] };
  }
  if (action.kind === 'ready') {
    const next = doReady(s, by);
    if (!next) return { state: s, outbox: [] };
    return { state: next, outbox: [{ kind: 'ready', by: by }] };
  }
  if (action.kind === 'shoot') {
    const next = doShoot(s, by, action.i);
    if (!next) return { state: s, outbox: [] };
    return { state: next, outbox: [{ kind: 'shoot', by: by, i: action.i }] };
  }
  if (action.kind === 'again') {
    const next = doAgain(s, by);
    if (!next) return { state: s, outbox: [] };
    return { state: next, outbox: [{ kind: 'again', by: by }] };
  }
  return { state: s, outbox: [] };
}

function recv(s, msg) {
  const map = { place: 1, undoPlace: 1, autoPlace: 1, ready: 1, shoot: 1, again: 1 };
  if (!map[msg.kind]) return { state: s, outbox: [] };
  const next = act(s, Object.assign({}, msg, { by: msg.by }));
  return { state: next.state, outbox: [] };
}

module.exports = {
  id: 'battleship', SIZE: SIZE, N: N, SHIPS: SHIPS, SHIP_NAMES: SHIP_NAMES,
  create: create, act: act, recv: recv,
  shipCells: shipCells, shipCellsOf: shipCellsOf, emptyGrid: emptyGrid
};

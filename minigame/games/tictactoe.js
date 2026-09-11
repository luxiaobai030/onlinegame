// ===== 井字棋：canvas 界面 =====
const core = require('../../games/core/tictactoe.js');
const d = require('./../draw.js');
const bd = require('./board.js');
const { C, F, sideColor } = require('./../theme.js');

function create(seed, mode) {
  return core.create({ seed: seed, mode: mode });
}

function turn(s) { return s.turn; }
function over(s) { return s.phase === 'over'; }

function result(s, api) {
  if (s.winner === -2) return { winner: -2, title: '平局', sub: '格子下满了，谁也没连成线' };
  return {
    winner: s.winner,
    title: (api.names[s.winner] || '玩家') + ' 获胜',
    sub: '三子连成一线'
  };
}

function hint(s, api) {
  if (s.phase === 'over') return '本局结束';
  if (api.mode === 'net' && s.turn !== api.role) return '等对方落子…';
  return '轮到 ' + (api.names[s.turn] || '玩家') + ' 落子';
}

function geo(area) {
  return bd.grid(area, 3, 3, 10);
}

function drawMark(ctx, g, r, c, side) {
  const p = bd.cellCenter(g, r, c);
  const k = g.cell * 0.3;
  if (side === 0) {
    d.line(ctx, p.x - k, p.y - k, p.x + k, p.y + k, C.p0, 5);
    d.line(ctx, p.x + k, p.y - k, p.x - k, p.y + k, C.p0, 5);
  } else {
    d.ringCircle(ctx, p.x, p.y, k, C.p1, 5);
  }
}

function draw(ctx, area, s, api) {
  const g = geo(area);
  bd.gridPlate(ctx, g, { bg: C.board });
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const i = r * 3 + c;
      if (s.board[i] >= 0) drawMark(ctx, g, r, c, s.board[i]);
    }
  }
  if (s.winLine.length) {
    const a = bd.cellCenter(g, Math.floor(s.winLine[0] / 3), s.winLine[0] % 3);
    const z = bd.cellCenter(g, Math.floor(s.winLine[2] / 3), s.winLine[2] % 3);
    d.line(ctx, a.x, a.y, z.x, z.y, 'rgba(50,175,125,0.75)', 6);
  }
}

function touch(type, pt, area, s, api) {
  if (type !== 'end' || api.blocked()) return;
  if (s.phase === 'over') return;
  const g = geo(area);
  const cell = bd.hitCell(g, pt.x, pt.y);
  if (!cell) return;
  const i = cell.r * 3 + cell.c;
  if (s.board[i] !== -1) return;
  if (api.act({ kind: 'move', i: i })) {
    api.vibrate();
  }
}

module.exports = {
  id: 'tictactoe', name: '井字棋', icon: '⭕', tint: C.p1,
  desc: '经典三连棋，先把三子连成一线者赢',
  core: core, create: create, turn: turn, over: over, result: result, hint: hint,
  buttons: function () { return []; }, geo: geo,
  draw: draw, touch: touch
};

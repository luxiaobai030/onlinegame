// ===== 黑白棋：canvas 界面 =====
const core = require('../../games/core/reversi.js');
const d = require('./../draw.js');
const bd = require('./board.js');
const { C, F, sideColor } = require('./../theme.js');

function create(seed, mode) { return core.create({ seed: seed, mode: mode }); }
function turn(s) { return s.turn; }
function over(s) { return s.phase === 'over'; }
function score(s, side) { return s.counts[side]; }

function result(s, api) {
  if (s.winner === -2) return { winner: -2, title: '平局', sub: '双方棋子数一样多' };
  return {
    winner: s.winner,
    title: (api.names[s.winner] || '玩家') + ' 获胜',
    sub: '棋子数 ' + s.counts[0] + ' : ' + s.counts[1]
  };
}

function hint(s, api) {
  if (s.phase === 'over') return '本局结束';
  if (s.passed >= 0) return (api.names[s.passed] || '对方') + ' 无处可下，已跳过';
  if (api.mode === 'net' && s.turn !== api.role) return '等对方落子…';
  return '轮到 ' + (api.names[s.turn] || '玩家') + '：点亮的地方都能夹子';
}

function geo(area) { return bd.grid(area, core.SIZE, core.SIZE, 6); }

function draw(ctx, area, s, api) {
  const g = geo(area);
  bd.gridPlate(ctx, g, { bg: '#16281F', line: 'rgba(120,200,160,0.28)' });
  const legal = (s.phase === 'play') ? core.legalMoves(s.board, s.turn) : [];
  for (let i = 0; i < core.N; i++) {
    const r = Math.floor(i / core.SIZE);
    const c = i % core.SIZE;
    const p = bd.cellCenter(g, r, c);
    const rad = g.cell * 0.38;
    if (s.board[i] >= 0) {
      const flipped = s.lastFlips.indexOf(i) >= 0;
      d.circle(ctx, p.x, p.y, rad, s.board[i] === 0 ? '#20252F' : '#F3F5FA');
      d.ringCircle(ctx, p.x, p.y, rad, s.board[i] === 0 ? '#4A5265' : '#BCC3D2', 1);
      if (flipped) d.ringCircle(ctx, p.x, p.y, rad, 'rgba(231,169,59,0.9)', 2);
      if (i === s.lastMove) d.ringCircle(ctx, p.x, p.y, rad * 0.45, 'rgba(231,169,59,1)', 2);
    } else if (legal.indexOf(i) >= 0) {
      d.circle(ctx, p.x, p.y, rad * 0.22, 'rgba(120,200,160,0.45)');
    }
  }
}

function touch(type, pt, area, s, api) {
  if (type !== 'end' || api.blocked()) return;
  if (s.phase !== 'play') return;
  const g = geo(area);
  const cell = bd.hitCell(g, pt.x, pt.y);
  if (!cell) return;
  const i = cell.r * core.SIZE + cell.c;
  if (!core.flipsFor(s.board, s.turn, i)) {
    api.toast('这里夹不住对方的子');
    return;
  }
  if (api.act({ kind: 'move', i: i })) api.vibrate();
}

module.exports = {
  id: 'reversi', name: '黑白棋', icon: '⚪', tint: '#2A9D74',
  desc: '夹住对方的棋子就能翻面，最后子多者胜',
  core: core, create: create, turn: turn, over: over, result: result, hint: hint,
  score: score, geo: geo,
  buttons: function () { return []; },
  draw: draw, touch: touch
};

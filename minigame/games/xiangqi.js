// ===== 中国象棋：canvas 界面 =====
const core = require('../../games/core/xiangqi.js');
const d = require('./../draw.js');
const { C, F } = require('./../theme.js');

const WOOD = '#2A2119';
const WLINE = 'rgba(226,196,150,0.55)';

function create(seed, mode) { return core.create({ seed: seed, mode: mode }); }
function turn(s) { return s.turn; }
function over(s) { return s.phase === 'over'; }

function sideName(side) { return side === core.RED ? '红方' : '黑方'; }

function result(s, api) {
  return {
    winner: s.winner,
    title: (api.names[s.winner] || sideName(s.winner)) + ' 获胜',
    sub: s.reason || ''
  };
}

function hint(s, api) {
  if (s.phase === 'over') return '本局结束：' + (s.reason || '分出胜负');
  if (api.mode === 'net' && s.turn !== api.role) return '等对方走子…';
  if (s.check === s.turn) return '将军！先解将';
  return '轮到 ' + (api.names[s.turn] || sideName(s.turn)) + '（' + sideName(s.turn) + '）';
}

// 象棋棋子摆在交点上：cell 是两条线的间距
function geo(area) {
  const cell = Math.min((area.w - 26) / 8.8, (area.h - 26) / 9.8);
  const gw = cell * 8;
  const gh = cell * 9;
  return { x: area.x + (area.w - gw) / 2, y: area.y + (area.h - gh) / 2, cell: cell, w: gw, h: gh };
}

function pt(g, r, c) {
  return { x: g.x + c * g.cell, y: g.y + r * g.cell };
}

function pick(g, x, y) {
  const c = Math.round((x - g.x) / g.cell);
  const r = Math.round((y - g.y) / g.cell);
  if (r < 0 || r >= core.ROWS || c < 0 || c >= core.COLS) return -1;
  const p = pt(g, r, c);
  const lim = g.cell * 0.52;
  if (Math.abs(p.x - x) > lim || Math.abs(p.y - y) > lim) return -1;
  return r * core.COLS + c;
}

function drawPiece(ctx, g, i, ch, o) {
  o = o || {};
  const p = pt(g, Math.floor(i / core.COLS), i % core.COLS);
  const rad = g.cell * 0.44;
  const red = core.sideOf(ch) === core.RED;
  d.circle(ctx, p.x, p.y, rad, '#EADFC8');
  d.ringCircle(ctx, p.x, p.y, rad, red ? '#B3332A' : '#2A2F3C', 1.5);
  d.ringCircle(ctx, p.x, p.y, rad * 0.8, 'rgba(0,0,0,0.14)', 1);
  d.text(ctx, core.PIECE_NAME[ch] || ch, p.x, p.y, {
    size: rad * 1.02, bold: true, align: 'center',
    color: red ? '#B3332A' : '#262B38'
  });
  if (o.selected) d.ringCircle(ctx, p.x, p.y, rad + 2, '#E7A93B', 3);
  if (o.check) d.ringCircle(ctx, p.x, p.y, rad + 3, '#E4574C', 3);
  if (o.last) d.ringCircle(ctx, p.x, p.y, rad * 0.42, 'rgba(231,169,59,0.95)', 2);
}

function draw(ctx, area, s, api) {
  const g = geo(area);
  const m = g.cell * 0.6;
  d.fillRound(ctx, g.x - m, g.y - m, g.w + m * 2, g.h + m * 2, 12, WOOD);
  for (let r = 0; r < core.ROWS; r++) {
    d.line(ctx, g.x, g.y + r * g.cell, g.x + g.w, g.y + r * g.cell, WLINE, 1);
  }
  for (let c = 0; c < core.COLS; c++) {
    const x = g.x + c * g.cell;
    if (c === 0 || c === core.COLS - 1) {
      d.line(ctx, x, g.y, x, g.y + g.h, WLINE, 1);
    } else {
      d.line(ctx, x, g.y, x, g.y + 4 * g.cell, WLINE, 1);
      d.line(ctx, x, g.y + 5 * g.cell, x, g.y + g.h, WLINE, 1);
    }
  }
  d.line(ctx, g.x + 3 * g.cell, g.y, g.x + 5 * g.cell, g.y + 2 * g.cell, WLINE, 1);
  d.line(ctx, g.x + 5 * g.cell, g.y, g.x + 3 * g.cell, g.y + 2 * g.cell, WLINE, 1);
  d.line(ctx, g.x + 3 * g.cell, g.y + 7 * g.cell, g.x + 5 * g.cell, g.y + 9 * g.cell, WLINE, 1);
  d.line(ctx, g.x + 5 * g.cell, g.y + 7 * g.cell, g.x + 3 * g.cell, g.y + 9 * g.cell, WLINE, 1);
  d.text(ctx, '楚 河', g.x + 1.6 * g.cell, g.y + 4.5 * g.cell, {
    size: g.cell * 0.42, color: 'rgba(226,196,150,0.5)', align: 'center'
  });
  d.text(ctx, '汉 界', g.x + 6.4 * g.cell, g.y + 4.5 * g.cell, {
    size: g.cell * 0.42, color: 'rgba(226,196,150,0.5)', align: 'center'
  });

  const sel = api.pending ? api.pending.sel : undefined;
  if (sel !== undefined && sel !== null && s.board[sel]) {
    const moves = core.legalMoves(s.board, sel);
    for (let k = 0; k < moves.length; k++) {
      const p = pt(g, Math.floor(moves[k] / core.COLS), moves[k] % core.COLS);
      if (s.board[moves[k]]) d.ringCircle(ctx, p.x, p.y, g.cell * 0.5, 'rgba(231,169,59,0.85)', 3);
      else d.circle(ctx, p.x, p.y, g.cell * 0.13, 'rgba(231,169,59,0.85)');
    }
  }
  for (let i = 0; i < core.N; i++) {
    const ch = s.board[i];
    if (!ch) continue;
    drawPiece(ctx, g, i, ch, {
      selected: sel === i,
      last: i === s.lastMove || i === s.lastFrom,
      check: s.check >= 0 && ch.toUpperCase() === 'K' && core.sideOf(ch) === s.check
    });
  }
}

function touch(type, pt2, area, s, api) {
  if (type !== 'end' || api.blocked()) return;
  if (s.phase !== 'play') return;
  const g = geo(area);
  const hit = pick(g, pt2.x, pt2.y);
  if (hit < 0) return;
  const sel = (api.pending && api.pending.sel !== undefined && api.pending.sel !== null) ? api.pending.sel : -1;
  const ch = s.board[hit];
  if (ch && core.sideOf(ch) === s.turn) {
    api.setPending({ sel: hit });
    return;
  }
  if (sel >= 0 && core.legalMoves(s.board, sel).indexOf(hit) >= 0) {
    if (api.act({ kind: 'move', from: sel, to: hit })) {
      api.setPending(null);
      api.vibrate();
    }
    return;
  }
  if (sel >= 0) api.setPending(null);
}

function press(key, s, api) {
  if (key !== 'undo' || api.mode === 'net') return;
  const prev = core.undo(s);
  if (!prev) {
    api.toast('还没走过子');
    return;
  }
  api.set(prev);
  api.setPending(null);
  api.toast('已悔棋');
}

module.exports = {
  id: 'xiangqi', name: '中国象棋', icon: '♟️', tint: '#B23A2E',
  desc: '经典中国象棋，红先走子，将死对方获胜',
  core: core, create: create, turn: turn, over: over, result: result, hint: hint,
  buttons: function (s, api) {
    return api.mode === 'net' ? [] : [{ key: 'undo', label: '悔棋', tone: 'ghost' }];
  },
  press: press, draw: draw, touch: touch,
  geo: geo, pt: pt, pick: pick
};

// ===== 棋盘通用件：网格定位、棋子、数字牌 =====
const { C, F } = require('./../theme.js');
const d = require('./../draw.js');

// 把一块区域摆成 cols×rows 的方阵（居中，格子尽量大）
function grid(area, cols, rows, pad) {
  const p = pad === undefined ? 6 : pad;
  const cell = Math.min((area.w - p * 2) / cols, (area.h - p * 2) / rows);
  const gw = cell * cols;
  const gh = cell * rows;
  return {
    x: area.x + (area.w - gw) / 2,
    y: area.y + (area.h - gh) / 2,
    cell: cell, cols: cols, rows: rows, w: gw, h: gh
  };
}

function cellCenter(g, r, c) {
  return { x: g.x + (c + 0.5) * g.cell, y: g.y + (r + 0.5) * g.cell };
}

function cellRect(g, r, c) {
  return { x: g.x + c * g.cell, y: g.y + r * g.cell, w: g.cell, h: g.cell };
}

// 点在哪一格（超出棋盘返回 null）
function hitCell(g, x, y) {
  if (x < g.x || x > g.x + g.w || y < g.y || y > g.y + g.h) return null;
  const c = Math.floor((x - g.x) / g.cell);
  const r = Math.floor((y - g.y) / g.cell);
  if (r < 0 || c < 0 || r >= g.rows || c >= g.cols) return null;
  return { r: r, c: c };
}

// 拖放用：离得最近的一格（带一点吸附范围）
function nearCell(g, x, y, slack) {
  const s = slack === undefined ? 0.6 : slack;
  const c = Math.round((x - g.x) / g.cell - 0.5);
  const r = Math.round((y - g.y) / g.cell - 0.5);
  if (r < 0 || c < 0 || r >= g.rows || c >= g.cols) return null;
  const p = cellCenter(g, r, c);
  const lim = g.cell * (0.5 + s);
  if (Math.abs(p.x - x) > lim || Math.abs(p.y - y) > lim) return null;
  return { r: r, c: c };
}

// 棋盘底板 + 格子
function gridPlate(ctx, g, o) {
  o = o || {};
  d.fillRound(ctx, g.x, g.y, g.w, g.h, o.radius === undefined ? 10 : o.radius, o.bg || C.board);
  if (o.lines === false) return;
  for (let r = 1; r < g.rows; r++) {
    d.line(ctx, g.x, g.y + r * g.cell, g.x + g.w, g.y + r * g.cell, o.line || C.boardLine, 1);
  }
  for (let c = 1; c < g.cols; c++) {
    d.line(ctx, g.x + c * g.cell, g.y, g.x + c * g.cell, g.y + g.h, o.line || C.boardLine, 1);
  }
}

// 五子棋棋子：side 0 黑 1 白
function stone(ctx, x, y, r, side, o) {
  o = o || {};
  if (side === 0) {
    d.circle(ctx, x, y, r, '#15171F');
    d.ringCircle(ctx, x, y, r, '#3A3F52', 1);
    d.circle(ctx, x - r * 0.3, y - r * 0.32, r * 0.22, 'rgba(255,255,255,0.16)');
  } else {
    d.circle(ctx, x, y, r, '#F3F5FA');
    d.ringCircle(ctx, x, y, r, '#B9C0D0', 1);
    d.circle(ctx, x - r * 0.3, y - r * 0.32, r * 0.22, 'rgba(255,255,255,0.9)');
  }
  if (o.mark) d.ringCircle(ctx, x, y, r * 0.45, o.mark, 2);
  if (o.ghost) {
    ctx.globalAlpha = 0.45;
    d.circle(ctx, x, y, r, side === 0 ? '#15171F' : '#F3F5FA');
    ctx.globalAlpha = 1;
  }
}

// 数字牌：o = { color, num, joker, ok, bad, dim, sub }
function tile(ctx, x, y, w, h, o) {
  o = o || {};
  const r = Math.max(4, Math.min(9, w * 0.22));
  const bg = o.joker ? C.joker : C.tile[o.color];
  if (o.dim) ctx.globalAlpha = 0.5;
  d.fillRound(ctx, x, y, w, h, r, bg);
  d.strokeRound(ctx, x, y, w, h, r, 'rgba(0,0,0,0.35)', 1);
  const size = o.size || Math.max(11, Math.min(20, h * 0.5));
  d.text(ctx, o.joker ? '★' : String(o.num), x + w / 2, y + h / 2 + (o.sub ? -h * 0.08 : 0), {
    size: size, bold: true, color: C.white, align: 'center'
  });
  if (o.sub) {
    d.text(ctx, o.sub, x + w / 2, y + h * 0.76, { size: F.xs, color: 'rgba(255,255,255,0.8)', align: 'center' });
  }
  if (o.ok) d.strokeRound(ctx, x - 1, y - 1, w + 2, h + 2, r + 2, C.ok, 2);
  if (o.bad) d.strokeRound(ctx, x - 1, y - 1, w + 2, h + 2, r + 2, C.bad, 2);
  if (o.dim) ctx.globalAlpha = 1;
}

module.exports = {
  grid: grid, cellCenter: cellCenter, cellRect: cellRect, hitCell: hitCell, nearCell: nearCell,
  gridPlate: gridPlate, stone: stone, tile: tile
};

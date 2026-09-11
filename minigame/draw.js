// ===== canvas 绘图基础工具 =====
const { C, F } = require('./theme.js');

function font(size, bold) {
  return (bold ? 'bold ' : '') + size + 'px sans-serif';
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}

function fillRound(ctx, x, y, w, h, r, color) {
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = color;
  ctx.fill();
}

function strokeRound(ctx, x, y, w, h, r, color, lw) {
  roundRect(ctx, x, y, w, h, r);
  ctx.strokeStyle = color;
  ctx.lineWidth = lw || 1;
  ctx.stroke();
}

function fillRect(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function line(ctx, x1, y1, x2, y2, color, lw) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = color;
  ctx.lineWidth = lw || 1;
  ctx.stroke();
}

function circle(ctx, x, y, r, color) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function ringCircle(ctx, x, y, r, color, lw) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = lw || 1;
  ctx.stroke();
}

// 文字：o = { size, color, align, baseline, bold, alpha }
function text(ctx, str, x, y, o) {
  o = o || {};
  ctx.font = font(o.size || F.md, o.bold);
  ctx.fillStyle = o.color || C.text;
  ctx.textAlign = o.align || 'left';
  ctx.textBaseline = o.baseline || 'middle';
  if (o.alpha !== undefined) ctx.globalAlpha = o.alpha;
  ctx.fillText(String(str), x, y);
  if (o.alpha !== undefined) ctx.globalAlpha = 1;
}

function width(ctx, str, size, bold) {
  ctx.font = font(size || F.md, bold);
  return ctx.measureText(String(str)).width;
}

// 太长就截断加省略号
function ellipsis(ctx, str, maxWidth, size, bold) {
  let s = String(str);
  ctx.font = font(size || F.md, bold);
  if (ctx.measureText(s).width <= maxWidth) return s;
  while (s.length > 1 && ctx.measureText(s + '…').width > maxWidth) s = s.slice(0, -1);
  return s + '…';
}

// 自动换行，最多 maxLines 行
const HANG = '，。、；：！？）」』】”’·…％';   // 这些标点不另起一行
function wrap(ctx, str, x, y, maxWidth, o) {
  o = o || {};
  const size = o.size || F.md;
  const lh = o.lineHeight || size + 5;
  const maxLines = o.maxLines || 2;
  const chars = String(str).split('');
  const lines = [];
  let cur = '';
  ctx.font = font(size, o.bold);
  for (let i = 0; i < chars.length; i++) {
    const t = cur + chars[i];
    if (ctx.measureText(t).width > maxWidth && cur) {
      // 行首要撞上标点就让它挂在上一行末尾，别让标点独自起一行
      if (HANG.indexOf(chars[i]) >= 0) { lines.push(t); cur = ''; }
      else { lines.push(cur); cur = chars[i]; }
      if (lines.length >= maxLines) break;
    } else {
      cur = t;
    }
  }
  if (lines.length < maxLines && cur) lines.push(cur);
  if (lines.length === maxLines) {
    const last = lines[maxLines - 1];
    const rest = chars.join('').slice(lines.join('').length);
    if (rest.length > last.length) lines[maxLines - 1] = ellipsis(ctx, last + rest, maxWidth, size, o.bold);
  }
  for (let i = 0; i < lines.length; i++) {
    text(ctx, lines[i], x, y + i * lh, Object.assign({}, o, { size: size }));
  }
  return lines.length * lh;
}

function inRect(x, y, r) {
  return !!r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

function inCircle(x, y, cx, cy, r) {
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

module.exports = {
  font: font, roundRect: roundRect, fillRound: fillRound, strokeRound: strokeRound,
  fillRect: fillRect, line: line, circle: circle, ringCircle: ringCircle,
  text: text, width: width, ellipsis: ellipsis, wrap: wrap,
  inRect: inRect, inCircle: inCircle
};

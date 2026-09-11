// ===== 常用界面控件：按钮、玩家条、卡片、标签 =====
const { C, F, sideColor } = require('./theme.js');
const d = require('./draw.js');

const TONES = {
  primary: { bg: C.primary, fg: C.white },
  ok: { bg: C.ok, fg: C.white },
  bad: { bg: C.bad, fg: C.white },
  warn: { bg: C.warn, fg: '#241708' },
  ghost: { bg: 'rgba(255,255,255,0.07)', fg: C.text },
  quiet: { bg: 'rgba(255,255,255,0.04)', fg: C.muted }
};

// 把一条区域横向切成 n 份
function rowRects(area, n, gap) {
  const g = gap === undefined ? 8 : gap;
  const w = (area.w - g * (n - 1)) / n;
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ x: area.x + i * (w + g), y: area.y, w: w, h: area.h });
  }
  return out;
}

// 按钮：r = {x,y,w,h}，o = { tone, size, disabled, outline, radius }
function button(ctx, r, label, o) {
  o = o || {};
  const t = TONES[o.tone] || TONES.ghost;
  const radius = o.radius === undefined ? Math.min(14, r.h / 2) : o.radius;
  const bg = o.disabled ? 'rgba(255,255,255,0.04)' : t.bg;
  d.fillRound(ctx, r.x, r.y, r.w, r.h, radius, bg);
  if (o.outline) d.strokeRound(ctx, r.x, r.y, r.w, r.h, radius, C.line, 1);
  const size = o.size || Math.min(F.md, Math.max(F.sm, r.h * 0.38));
  d.text(ctx, d.ellipsis(ctx, label, r.w - 12, size, true), r.x + r.w / 2, r.y + r.h / 2, {
    size: size, bold: true, color: o.disabled ? C.dim : t.fg, align: 'center'
  });
}

// 顶部玩家条：显示名字、分数，轮到谁就亮谁的边
function playerBar(ctx, r, o) {
  const accent = sideColor(o.side);
  d.fillRound(ctx, r.x, r.y, r.w, r.h, 12, o.active ? C.card2 : C.card);
  if (o.active) d.strokeRound(ctx, r.x, r.y, r.w, r.h, 12, accent, 2);
  d.circle(ctx, r.x + 16, r.y + r.h / 2, 5, accent);
  d.text(ctx, d.ellipsis(ctx, o.name, r.w - 60, F.md, true), r.x + 28, r.y + r.h / 2, {
    size: F.md, bold: true, color: o.active ? C.text : C.muted
  });
  d.text(ctx, String(o.score), r.x + r.w - 12, r.y + r.h / 2, {
    size: F.lg, bold: true, align: 'right', color: accent
  });
}

// 卡片底板
function panel(ctx, r, o) {
  o = o || {};
  d.fillRound(ctx, r.x, r.y, r.w, r.h, o.radius || 14, o.color || C.card);
  if (o.line) d.strokeRound(ctx, r.x, r.y, r.w, r.h, o.radius || 14, o.line, 1);
}

// 小标签
function tag(ctx, x, y, label, color) {
  const w = d.width(ctx, label, F.xs) + 14;
  d.fillRound(ctx, x, y, w, 18, 9, 'rgba(255,255,255,0.07)');
  d.text(ctx, label, x + w / 2, y + 9, { size: F.xs, color: color || C.muted, align: 'center' });
  return w;
}

module.exports = { TONES: TONES, rowRects: rowRects, button: button, playerBar: playerBar, panel: panel, tag: tag };

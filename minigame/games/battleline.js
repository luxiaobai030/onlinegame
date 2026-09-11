// ===== 桌游战线：canvas 界面 =====
const core = require('../../games/core/battleline.js');
const d = require('./../draw.js');
const { C, F, sideColor } = require('./../theme.js');

// 六种兵种颜色
const BC = ['#D8453C', '#3B7DD8', '#2FA97C', '#E08A2E', '#8C5FD0', '#C9A227'];
const BC_NAME = ['红', '蓝', '绿', '橙', '紫', '金'];

function create(seed, mode) { return core.create({ seed: seed, mode: mode }); }
function turn(s) { return s.turn; }
function over(s) { return s.phase === 'over'; }
function score(s, side) { return core.flagCount(s, side); }

function result(s, api) {
  if (s.winner === -2) return { winner: -2, title: '平局', sub: s.reason || '旗帜数一样多' };
  return {
    winner: s.winner,
    title: (api.names[s.winner] || '玩家') + ' 获胜',
    sub: s.reason || '拿下更多旗帜'
  };
}

function hint(s, api) {
  if (s.phase === 'over') return '本局结束';
  if (api.mode === 'net' && s.turn !== api.role) return '等对方布阵…';
  const p = api.pending || {};
  const parts = ['轮到 ' + (api.names[s.turn] || '玩家') + ' 布阵',
    '旗 ' + core.flagCount(s, 0) + ' : ' + core.flagCount(s, 1)];
  if (p.blCard !== undefined && p.blCard !== null) parts.push('点自己一侧的空位放下这张牌');
  else parts.push('先点一张手牌');
  return parts.join(' · ');
}

// ---------- 布局 ----------
function layout(area) {
  const pad = 6;
  const x = area.x + pad;
  const w = area.w - pad * 2;
  const handH = 74;
  const flagTop = area.y + 2;
  const flagH = Math.min(40, (area.h - handH - 8) / core.FLAGS);
  const gap = 2;
  const flagW = 32;
  const cardW = Math.min(34, (w - flagW - 12 - gap * 5) / 6);
  const cardH = Math.min(34, flagH - 5);
  const rowW = cardW * 6 + gap * 5 + flagW + 12;
  const x0 = x + (w - rowW) / 2;
  const handY = area.y + area.h - handH;
  const handW = (w - 6 * 6) / 7;
  return {
    x: x, w: w, flagTop: flagTop, flagH: flagH, cardW: cardW, cardH: cardH,
    gap: gap, flagW: flagW, x0: x0, rowW: rowW,
    hand: { x: x, y: handY + 8, w: w, h: handH - 10, cardW: handW, cardH: handH - 16, gap: 6 }
  };
}

function slotRect(lay, f, side, k) {
  const y = lay.flagTop + f * lay.flagH + (lay.flagH - lay.cardH) / 2;
  const step = lay.cardW + lay.gap;
  const base = side === 0
    ? lay.x0 + k * step
    : lay.x0 + 3 * step + lay.flagW + 12 + k * step;
  return { x: base, y: y, w: lay.cardW, h: lay.cardH };
}

function flagRect(lay, f) {
  const step = lay.cardW + lay.gap;
  return {
    x: lay.x0 + 3 * step + 6, y: lay.flagTop + f * lay.flagH + 2,
    w: lay.flagW, h: lay.flagH - 4
  };
}

function handRect(lay, k) {
  const h = lay.hand;
  return {
    x: h.x + k * (h.cardW + h.gap), y: h.y,
    w: h.cardW, h: h.cardH
  };
}

function geo(area) { return layout(area); }

// ---------- 绘制 ----------
function drawCard(ctx, r, id, o) {
  o = o || {};
  const c = core.colorOf(id);
  const v = core.valueOf(id);
  const radius = Math.max(3, Math.min(8, r.w * 0.24));
  ctx.globalAlpha = o.dim ? 0.42 : 1;
  d.fillRound(ctx, r.x, r.y, r.w, r.h, radius, BC[c]);
  d.strokeRound(ctx, r.x, r.y, r.w, r.h, radius, 'rgba(0,0,0,0.35)', 1);
  d.text(ctx, String(v), r.x + r.w / 2, r.y + r.h / 2 + 1, {
    size: Math.max(11, Math.min(20, r.h * 0.55)), bold: true, color: C.white, align: 'center'
  });
  if (o.selected) d.strokeRound(ctx, r.x - 2, r.y - 2, r.w + 4, r.h + 4, radius + 2, '#FFFFFF', 2.5);
  ctx.globalAlpha = 1;
}

function drawEmpty(ctx, r, tint) {
  d.strokeRound(ctx, r.x + 1, r.y + 1, r.w - 2, r.h - 2, 5, tint, 1);
}

function draw(ctx, area, s, api) {
  const lay = layout(area);
  const p = api.pending || {};
  const mine = api.mySide();
  for (let f = 0; f < core.FLAGS; f++) {
    const rowY = lay.flagTop + f * lay.flagH;
    if (f % 2 === 0) {
      d.fillRound(ctx, area.x + 2, rowY, area.w - 4, lay.flagH - 2, 6, 'rgba(255,255,255,0.025)');
    }
    for (let side = 0; side < 2; side++) {
      const cards = s.slots[f][side];
      for (let k = 0; k < core.PER_SIDE; k++) {
        const r = slotRect(lay, f, side, k);
        if (k < cards.length) {
          const dim = s.flags[f] !== -1 && s.flags[f] !== side;
          drawCard(ctx, r, cards[k], { dim: dim });
        } else if (side === mine && s.phase === 'play') {
          drawEmpty(ctx, r, 'rgba(255,255,255,0.18)');
        }
      }
    }
    // 中间的旗
    const fr = flagRect(lay, f);
    const w = s.flags[f];
    const tint = w === -1 ? C.line : sideColor(w);
    d.fillRound(ctx, fr.x, fr.y, fr.w, fr.h, 6, w === -1 ? 'rgba(255,255,255,0.06)' : tint);
    d.text(ctx, w === -1 ? String(f + 1) : '✓', fr.x + fr.w / 2, fr.y + fr.h / 2 + 1, {
      size: w === -1 ? F.sm : F.md, bold: true, align: 'center',
      color: w === -1 ? C.muted : C.white
    });
  }
  // 手牌
  d.fillRound(ctx, area.x + 2, lay.hand.y - 8, area.w - 4, lay.hand.h + 14, 8, 'rgba(255,255,255,0.04)');
  const sel = (p.blCard === undefined) ? null : p.blCard;
  for (let k = 0; k < s.hands[mine].length; k++) {
    const r = handRect(lay, k);
    drawCard(ctx, r, s.hands[mine][k], { selected: sel === k });
  }
  d.text(ctx, '手牌 ' + s.hands[mine].length + ' 张 · 牌堆 ' + s.deck.length, lay.hand.x + 2, lay.hand.y - 14, {
    size: F.xs, color: C.muted
  });
}

// ---------- 交互 ----------
function touch(type, pt, area, s, api) {
  if (type !== 'end' || api.blocked() || s.phase === 'over') return;
  const lay = layout(area);
  const mine = api.mySide();
  const p = api.pending || {};
  // 点手牌
  const hand = s.hands[mine];
  for (let k = 0; k < hand.length; k++) {
    if (d.inRect(pt.x, pt.y, handRect(lay, k))) {
      const cur = (p.blCard === k) ? null : k;
      api.setPending(Object.assign({}, p, { blCard: cur }));
      api.vibrate();
      return;
    }
  }
  // 点自己一侧的位置
  for (let f = 0; f < core.FLAGS; f++) {
    if (s.slots[f][mine].length >= core.PER_SIDE) continue;
    for (let k = 0; k < core.PER_SIDE; k++) {
      if (d.inRect(pt.x, pt.y, slotRect(lay, f, mine, k))) {
        const sel = p.blCard;
        if (sel === undefined || sel === null || sel >= hand.length) {
          api.toast('先点一张手牌，再点这里放牌');
          return;
        }
        if (api.act({ kind: 'place', flag: f, card: sel })) {
          api.setPending(Object.assign({}, p, { blCard: null }));
          api.vibrate();
        }
        return;
      }
    }
  }
}

function buttons(s, api) {
  if (s.phase !== 'play') return [];
  const p = api.pending || {};
  return [
    { key: 'clear', label: '取消选择', tone: 'ghost', disabled: p.blCard === undefined || p.blCard === null },
    { key: 'forms', label: '牌型大小', tone: 'ghost' }
  ];
}

function press(key, s, api) {
  if (key === 'clear') {
    api.setPending(Object.assign({}, api.pending, { blCard: null }));
    return;
  }
  if (key === 'forms') {
    api.toast('楔形（同色连号）> 方阵（同点）> 大队（同色）> 散兵线（连号）> 乌合');
  }
}

function coverKey(s, api) {
  if (api.mode !== 'local') return null;
  return s.phase === 'play' ? 'turn:' + s.turn : null;
}

function coverText(s, api) {
  return {
    side: s.turn,
    title: '请把手机交给 ' + (api.names[s.turn] || '玩家'),
    sub: '轮到你布阵：把 3 张牌放到旗帜自己那一侧'
  };
}

module.exports = {
  id: 'battleline', name: '桌游战线', icon: '🚩', tint: '#C0553F',
  desc: '9 面旗帜一字排开，比阵型抢旗：先拿下 5 面或连着的 3 面者胜',
  core: core, create: create, turn: turn, over: over, result: result, hint: hint,
  score: score, buttons: buttons, press: press, draw: draw, touch: touch,
  geo: geo, layout: layout, slotRect: slotRect, flagRect: flagRect, handRect: handRect,
  coverKey: coverKey, coverText: coverText
};
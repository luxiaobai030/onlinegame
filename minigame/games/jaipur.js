// ===== 斋普尔：canvas 界面（点市场牌拿货、点手牌卖货）=====
const core = require('../../games/core/jaipur.js');
const d = require('./../draw.js');
const { C, F, sideColor } = require('./../theme.js');

const GLYPH = ['钻', '金', '银', '布', '香', '皮', '驼'];
const GCOLOR = [
  C.goods.diamond, C.goods.gold, C.goods.silver,
  C.goods.cloth, C.goods.spice, C.goods.leather, C.goods.camel
];

function create(seed, mode) { return core.create({ seed: seed, mode: mode }); }
function turn(s) { return s.turn; }
function over(s) { return s.phase === 'over'; }
function score(s, side) { return s.scores[side]; }

function result(s, api) {
  if (s.matchOver) {
    if (s.matchWinner === -2) {
      return { winner: -2, title: '整场平局', sub: '双方都拿到 2 枚卓越之印' };
    }
    return {
      winner: s.matchWinner,
      title: (api.names[s.matchWinner] || '玩家') + ' 赢下整场',
      sub: '拿到 2 枚卓越之印　' + s.detail
    };
  }
  if (s.winner === -2) {
    return { winner: -2, title: '这一局平局', sub: s.detail + '　双方各得 1 枚印' };
  }
  return {
    winner: s.winner,
    title: (api.names[s.winner] || '玩家') + ' 赢下这一局',
    sub: s.detail + '　卓越之印 ' + s.scores[0] + ' : ' + s.scores[1]
  };
}

function hint(s, api) {
  if (s.phase === 'over') return s.matchOver ? '整场结束' : '这一局结束，再来一局接着打';
  if (api.mode === 'net' && s.turn !== api.role) return '等对方行动…';
  const p = api.pending || {};
  const mk = (p.jpMk || []).length;
  const hd = (p.jpHand || []).length;
  const t = (api.names[s.turn] || '玩家') + '：';
  if (mk || hd) {
    const chk = mk ? core.checkTake(s, s.turn, p.jpMk, p.jpHand) : core.checkSell(s, s.turn, p.jpHand);
    return t + '已选 市场 ' + mk + ' 张 / 手牌 ' + hd + ' 张 · ' + chk.reason;
  }
  return t + '点市场牌拿货，或点手牌卖货 · 印 ' + s.scores[0] + ':' + s.scores[1];
}

// ---------- 布局 ----------
function layout(area) {
  const pad = 6;
  const x = area.x + pad;
  const w = area.w - pad * 2;
  const oppH = 22, pilesH = 58, marketH = 92, infoH = 22, handH = 74;
  const blockH = oppH + 8 + pilesH + 12 + marketH + 10 + infoH + 8 + handH;
  const y = area.y + Math.max(0, (area.h - blockH) / 2);
  const mw = (w - 4 * 8) / 5;
  const hw = (w - 6 * 6) / 7;
  return {
    x: x, w: w,
    opp: { x: x, y: y, w: w, h: oppH },
    piles: { x: x, y: y + oppH + 8, w: w, h: pilesH, cw: (w - 5 * 5) / 6 },
    market: {
      x: x, y: y + oppH + 8 + pilesH + 12, w: w, h: marketH,
      cw: mw, ch: Math.min(marketH, mw * 1.42), gap: 8
    },
    info: { x: x, y: y + oppH + 8 + pilesH + 12 + marketH + 10, w: w, h: infoH },
    hand: {
      x: x, y: y + oppH + 8 + pilesH + 12 + marketH + 10 + infoH + 8, w: w, h: handH,
      cw: hw, ch: Math.min(handH, hw * 1.5), gap: 6
    }
  };
}

function marketRect(lay, i) {
  const m = lay.market;
  const cy = m.y + (m.h - m.ch) / 2;
  return { x: m.x + i * (m.cw + m.gap), y: cy, w: m.cw, h: m.ch };
}

function handRectAt(lay, i) {
  const h = lay.hand;
  const cy = h.y + (h.h - h.ch) / 2;
  return { x: h.x + i * (h.cw + h.gap), y: cy, w: h.cw, h: h.ch };
}

function pileRect(lay, g) {
  return { x: lay.piles.x + g * (lay.piles.cw + 5), y: lay.piles.y, w: lay.piles.cw, h: lay.piles.h };
}

function geo(area) { return layout(area); }

// ---------- 绘制 ----------
function goodsCard(ctx, r, type, o) {
  o = o || {};
  const radius = Math.max(5, Math.min(10, r.w * 0.2));
  d.fillRound(ctx, r.x, r.y, r.w, r.h, radius, GCOLOR[type]);
  d.strokeRound(ctx, r.x, r.y, r.w, r.h, radius, 'rgba(0,0,0,0.35)', 1);
  d.text(ctx, GLYPH[type], r.x + r.w / 2, r.y + r.h * 0.42, {
    size: Math.min(r.w * 0.62, r.h * 0.5), bold: true, color: C.white, align: 'center'
  });
  if (type !== core.CAMEL) {
    d.text(ctx, core.GOOD_NAMES[type], r.x + r.w / 2, r.y + r.h * 0.8, {
      size: F.xs, color: 'rgba(255,255,255,0.85)', align: 'center'
    });
  } else {
    d.text(ctx, '骆驼', r.x + r.w / 2, r.y + r.h * 0.8, {
      size: F.xs, color: 'rgba(255,255,255,0.85)', align: 'center'
    });
  }
  if (o.selected) d.strokeRound(ctx, r.x - 2, r.y - 2, r.w + 4, r.h + 4, radius + 2, '#FFFFFF', 3);
  if (o.dim) ctx.globalAlpha = 1;
}

function drawEmpty(ctx, r) {
  d.strokeRound(ctx, r.x + 1, r.y + 1, r.w - 2, r.h - 2, 8, 'rgba(255,255,255,0.16)', 1);
}

function moneyLine(s, side, api) {
  return (api.names[side] || ('玩家' + (side + 1))) + '　🐪 ' + s.camels[side] +
    '　手牌 ' + s.hands[side].length + ' 张　卢比 ' + s.money[side];
}

function draw(ctx, area, s, api) {
  const lay = layout(area);
  const p = api.pending || {};
  const mine = api.mySide();
  const other = 1 - mine;
  const mk = p.jpMk || [];
  const hd = p.jpHand || [];

  // 对方信息
  d.fillRound(ctx, lay.opp.x, lay.opp.y, lay.opp.w, lay.opp.h, 8, 'rgba(255,255,255,0.05)');
  d.text(ctx, moneyLine(s, other, api), lay.opp.x + 8, lay.opp.y + lay.opp.h / 2, {
    size: F.sm, color: sideColor(other)
  });

  // 六堆标记
  for (let g = 0; g < 6; g++) {
    const r = pileRect(lay, g);
    const pile = s.piles[g];
    d.fillRound(ctx, r.x, r.y, r.w, r.h, 8, 'rgba(255,255,255,0.05)');
    d.fillRound(ctx, r.x + 4, r.y + 4, r.w - 8, 16, 5, GCOLOR[g]);
    d.text(ctx, core.GOOD_NAMES[g], r.x + r.w / 2, r.y + 12, {
      size: F.xs, color: C.white, align: 'center', bold: true
    });
    d.text(ctx, pile.length ? String(pile.length) + ' 张' : '空了', r.x + r.w / 2, r.y + 30, {
      size: F.sm, bold: true, align: 'center', color: pile.length ? C.text : C.dim
    });
    d.text(ctx, pile.length ? '下一张 ' + pile[0] : '—', r.x + r.w / 2, r.y + 46, {
      size: F.xs, align: 'center', color: C.muted
    });
  }

  // 市场
  for (let i = 0; i < core.MARKET_MAX; i++) {
    const r = marketRect(lay, i);
    const t = s.market[i];
    if (t === undefined || t === -1) { drawEmpty(ctx, r); continue; }
    goodsCard(ctx, r, t, { selected: mk.indexOf(i) >= 0 });
  }

  // 我的信息 + 印数
  d.fillRound(ctx, lay.info.x, lay.info.y, lay.info.w, lay.info.h, 8, 'rgba(255,255,255,0.05)');
  d.text(ctx, moneyLine(s, mine, api), lay.info.x + 8, lay.info.y + lay.info.h / 2, {
    size: F.sm, color: sideColor(mine)
  });
  d.text(ctx, '卓越之印 ' + s.scores[0] + ' : ' + s.scores[1], lay.info.x + lay.info.w - 8, lay.info.y + lay.info.h / 2, {
    size: F.sm, color: C.warn, align: 'right', bold: true
  });

  // 我的手牌
  const hand = s.hands[mine];
  for (let k = 0; k < hand.length; k++) {
    goodsCard(ctx, handRectAt(lay, k), hand[k], { selected: hd.indexOf(k) >= 0 });
  }
  d.text(ctx, '我的手牌 ' + hand.length + ' / ' + core.HAND_MAX, lay.hand.x, lay.hand.y - 4, {
    size: F.xs, color: C.muted
  });
}

// ---------- 交互 ----------
function touch(type, pt, area, s, api) {
  if (type !== 'end' || api.blocked() || s.phase === 'over') return;
  const lay = layout(area);
  const mine = api.mySide();
  const p = api.pending || {};
  const mk = (p.jpMk || []).slice();
  const hd = (p.jpHand || []).slice();
  for (let i = 0; i < core.MARKET_MAX; i++) {
    if (d.inRect(pt.x, pt.y, marketRect(lay, i))) {
      const t = s.market[i];
      if (t === undefined || t === -1) return;
      const at = mk.indexOf(i);
      if (at >= 0) mk.splice(at, 1); else mk.push(i);
      api.setPending(Object.assign({}, p, { jpMk: mk, jpHand: hd }));
      api.vibrate();
      return;
    }
  }
  const hand = s.hands[mine];
  for (let k = 0; k < hand.length; k++) {
    if (d.inRect(pt.x, pt.y, handRectAt(lay, k))) {
      const at = hd.indexOf(k);
      if (at >= 0) hd.splice(at, 1); else hd.push(k);
      api.setPending(Object.assign({}, p, { jpMk: mk, jpHand: hd }));
      api.vibrate();
      return;
    }
  }
}

function buttons(s, api) {
  if (s.phase !== 'over' && s.phase !== 'play') return [];
  if (s.phase === 'over') return [];
  const p = api.pending || {};
  const mk = p.jpMk || [];
  const hd = p.jpHand || [];
  const side = api.mySide();
  const canTake = mk.length ? core.checkTake(s, side, mk, hd).ok : false;
  const canSell = (hd.length && !mk.length) ? core.checkSell(s, side, hd).ok : false;
  return [
    { key: 'take', label: mk.length && mk.length > 1 ? '交换 / 拿牌' : '拿牌', tone: 'primary', disabled: !canTake },
    { key: 'sell', label: '卖货', tone: 'ok', disabled: !canSell },
    { key: 'clear', label: '清空', tone: 'ghost', disabled: !(mk.length || hd.length) }
  ];
}

function press(key, s, api) {
  const p = api.pending || {};
  const side = api.mySide();
  if (key === 'clear') {
    api.setPending(Object.assign({}, p, { jpMk: [], jpHand: [] }));
    return;
  }
  if (key === 'take') {
    const chk = core.checkTake(s, side, p.jpMk || [], p.jpHand || []);
    if (!chk.ok) { api.toast(chk.reason); return; }
    if (api.act({ kind: 'take', takeIdx: p.jpMk, handIdx: p.jpHand })) {
      api.setPending(Object.assign({}, p, { jpMk: [], jpHand: [] }));
      api.vibrate();
    }
    return;
  }
  if (key === 'sell') {
    const chk = core.checkSell(s, side, p.jpHand || []);
    if (!chk.ok) { api.toast(chk.reason); return; }
    if (api.act({ kind: 'sell', type: chk.type, handIdx: p.jpHand })) {
      api.setPending(Object.assign({}, p, { jpMk: [], jpHand: [] }));
      api.vibrate();
    }
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
    sub: '轮到你：从市场拿货，或者卖掉手里的货换卢比'
  };
}

module.exports = {
  id: 'jaipur', name: '斋普尔', icon: '💎', tint: '#D9964E',
  desc: '市场买卖香料的二人经典：赚卢比拿卓越之印，先拿 2 枚者赢',
  core: core, create: create, turn: turn, over: over, result: result, hint: hint,
  score: score, buttons: buttons, press: press, draw: draw, touch: touch, geo: geo,
  layout: layout, marketRect: marketRect, handRectAt: handRectAt, pileRect: pileRect,
  coverKey: coverKey, coverText: coverText
};
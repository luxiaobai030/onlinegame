// ===== 密档对决（简化版）：canvas 界面 =====
const core = require('../../games/core/watergate.js');
const d = require('./../draw.js');
const { C, F, sideColor } = require('./../theme.js');

const WG_C = ['#3B7DD8', '#D8453C', '#E0B13A'];
const ARM_NAME = ['线人 A', '线人 B', '线人 C', '线人 D'];
const ROLE = ['档案室', '调查组'];

function create(seed, mode) { return core.create({ seed: seed, mode: mode }); }
function turn(s) { return s.turn; }
function over(s) { return s.phase === 'over'; }
function score(s, side) { return s.scores[side]; }

function result(s, api) {
  if (s.winner === -2) return { winner: -2, title: '平局', sub: s.reason || '谁也没能达成目标' };
  return {
    winner: s.winner,
    title: (api.names[s.winner] || '玩家') + ' 获胜',
    sub: s.reason || (s.winner === 0 ? '档案室守住了密档' : '线索全部接通')
  };
}

function hint(s, api) {
  if (s.phase === 'over') return '本局结束';
  if (api.mode === 'net' && s.turn !== api.role) return '等对方出牌…';
  const p = api.pending || {};
  const side = api.mySide();
  const head = (api.names[s.turn] || '玩家') + '（' + ROLE[s.turn] + '）';
  if (p.wgCard === undefined || p.wgCard === null) return head + '：点一张手牌，再选用数值还是行动';
  const id = s.hands[side][p.wgCard];
  if (id === undefined) return head;
  const act = core.ACTIONS[side][core.cardColor(id)];
  let t = '已选【' + core.COLOR_NAME[core.cardColor(id)] + '色 ' + core.cardValue(id) + '】· 行动「' + act + '」';
  if (core.valueTargets(s, id).length) t += '，也可按数值推进';
  if (core.actionTargets(s, side, id).length && !p.wgTarget) t += '（先点目标）';
  return t;
}

function sideName(side) { return ROLE[side]; }

// ---------- 布局 ----------
function layout(area) {
  const pad = 6;
  const x = area.x + pad;
  const w = area.w - pad * 2;
  const rowH = 34;
  const blockH = 22 + 6 + 4 * rowH + 8 + 54 + 8 + 22 + 6 + 72;
  const y = area.y + Math.max(0, (area.h - blockH) / 2);
  const boardY = y + 28;
  const trackY = boardY + 4 * rowH + 8;
  const infoY = trackY + 54 + 8;
  const handY = infoY + 22 + 6;
  const nixW = 44;
  const infW = 54;
  const gap = 4;
  const linkW = (w - nixW - infW - gap * 4) / 3;
  return {
    x: x, w: w, rowH: rowH,
    opp: { x: x, y: y, w: w, h: 22 },
    boardY: boardY, nixW: nixW, infW: infW, linkW: linkW, gap: gap,
    track: { x: x, y: trackY, w: w, h: 54, cw: (w - 8 * 3) / 9, gap: 3 },
    info: { x: x, y: infoY, w: w, h: 22 },
    hand: { x: x, y: handY, w: w, h: 72 }
  };
}

function linkRect(lay, arm, k) {
  const y = lay.boardY + arm * lay.rowH + 4;
  const step = lay.linkW + lay.gap;
  return { x: lay.x + lay.nixW + lay.gap + k * step, y: y, w: lay.linkW, h: lay.rowH - 8 };
}

function nixonRect(lay, arm) {
  return { x: lay.x, y: lay.boardY + arm * lay.rowH + 4, w: lay.nixW, h: lay.rowH - 8 };
}

function informantRect(lay, arm) {
  return {
    x: lay.x + lay.nixW + lay.gap + 3 * (lay.linkW + lay.gap) + lay.gap,
    y: lay.boardY + arm * lay.rowH + 4, w: lay.infW, h: lay.rowH - 8
  };
}

function trackCellRect(lay, i) {
  return { x: lay.track.x + i * (lay.track.cw + lay.track.gap), y: lay.track.y, w: lay.track.cw, h: lay.track.h };
}

function handRect(lay, i, n) {
  const cnt = Math.max(5, n);
  const cw = Math.min(52, (lay.w - (cnt - 1) * 6) / cnt);
  const ch = Math.min(lay.hand.h, cw * 1.4);
  const total = cnt * cw + (cnt - 1) * 6;
  const x0 = lay.x + (lay.w - total) / 2;
  return { x: x0 + i * (cw + 6), y: lay.hand.y + (lay.hand.h - ch) / 2, w: cw, h: ch };
}

function geo(area) { return layout(area); }

// ---------- 绘制 ----------
function token(ctx, cx, cy, r, color, face) {
  d.circle(ctx, cx, cy, r, face ? WG_C[color] : '#3A4152');
  d.ringCircle(ctx, cx, cy, r, face ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.25)', 1.5);
  d.text(ctx, face ? '' : '?', cx, cy + 1, { size: r * 1.25, bold: true, color: '#8B94AB', align: 'center' });
}

function drawCard(ctx, r, id, o) {
  o = o || {};
  const c = core.cardColor(id);
  const v = core.cardValue(id);
  const side = o.side === undefined ? 0 : o.side;
  const radius = Math.max(4, Math.min(10, r.w * 0.2));
  d.fillRound(ctx, r.x, r.y, r.w, r.h, radius, WG_C[c]);
  d.strokeRound(ctx, r.x, r.y, r.w, r.h, radius, 'rgba(0,0,0,0.35)', 1);
  d.text(ctx, String(v), r.x + r.w / 2, r.y + r.h * 0.34, {
    size: Math.min(r.w * 0.72, r.h * 0.42), bold: true, color: C.white, align: 'center'
  });
  d.text(ctx, core.ACTIONS[side][c], r.x + r.w / 2, r.y + r.h * 0.76, {
    size: F.xs, color: 'rgba(255,255,255,0.92)', align: 'center'
  });
  if (o.selected) d.strokeRound(ctx, r.x - 2, r.y - 2, r.w + 4, r.h + 4, radius + 2, '#FFFFFF', 3);
  if (o.target) d.strokeRound(ctx, r.x - 2, r.y - 2, r.w + 4, r.h + 4, radius + 2, C.ok, 3);
}

function draw(ctx, area, s, api) {
  const lay = layout(area);
  const p = api.pending || {};
  const mine = api.mySide();
  const other = 1 - mine;
  const sel = (p.wgCard === undefined) ? null : p.wgCard;
  const tg = p.wgTarget || null;
  const cardId = (sel === null || sel === undefined) ? null : s.hands[mine][sel];
  const wantColor = cardId === null ? -1 : core.cardColor(cardId);

  // 状态条
  d.fillRound(ctx, lay.opp.x, lay.opp.y, lay.opp.w, lay.opp.h, 8, 'rgba(255,255,255,0.05)');
  d.text(ctx, '气势 ' + s.momentum[0] + ' / ' + core.MOMENTUM_TO_WIN +
    '　线人接通 ' + core.completeArms(s) + ' / ' + core.CONNECT_TO_WIN +
    '　第 ' + s.round + ' 轮　剩余标记 ' + s.momentumLeft,
    lay.opp.x + 8, lay.opp.y + lay.opp.h / 2, { size: F.xs, color: C.muted });

  // 证据板
  for (let arm = 0; arm < core.ARMS; arm++) {
    const nr = nixonRect(lay, arm);
    d.fillRound(ctx, nr.x, nr.y, nr.w, nr.h, 6, '#6B5B3E');
    d.text(ctx, '🏛', nr.x + nr.w / 2, nr.y + nr.h / 2, { size: 15, align: 'center' });
    for (let k = 0; k < core.LINKS; k++) {
      const r = linkRect(lay, arm, k);
      const slot = s.board[arm][k];
      const isTg = tg && tg.arm === arm && tg.k === k;
      d.fillRound(ctx, r.x, r.y, r.w, r.h, 6, slot ? (slot.face ? 'rgba(59,125,216,0.30)' : 'rgba(120,130,150,0.22)') : 'rgba(255,255,255,0.04)');
      if (isTg) d.strokeRound(ctx, r.x - 1, r.y - 1, r.w + 2, r.h + 2, 7, C.ok, 2.5);
      if (slot) {
        token(ctx, r.x + 16, r.y + r.h / 2, Math.min(11, r.h * 0.36), core.tokenColor(slot.t), slot.face);
        d.text(ctx, slot.face ? '正面证据' : '暗置', r.x + 30, r.y + r.h / 2, {
          size: F.xs, color: slot.face ? '#9CC6F5' : C.muted
        });
      } else {
        d.text(ctx, '空位 ' + (k + 1), r.x + r.w / 2, r.y + r.h / 2, { size: F.xs, color: C.dim, align: 'center' });
      }
    }
    const ir = informantRect(lay, arm);
    const done = (function () {
      for (let k = 0; k < core.LINKS; k++) {
        const sl = s.board[arm][k];
        if (!sl || !sl.face) return false;
      }
      return true;
    })();
    d.fillRound(ctx, ir.x, ir.y, ir.w, ir.h, 6, done ? C.ok : 'rgba(255,255,255,0.07)');
    d.text(ctx, '👤', ir.x + ir.w / 2, ir.y + ir.h / 2 - 5, { size: 13, align: 'center' });
    d.text(ctx, ARM_NAME[arm].slice(2), ir.x + ir.w / 2, ir.y + ir.h - 7, {
      size: F.xs, color: done ? C.white : C.muted, align: 'center'
    });
  }

  // 研究轨道
  const showColor = !api.blocked();
  for (let i = 0; i < core.TRACK_LEN; i++) {
    const r = trackCellRect(lay, i);
    const isCenter = i === core.CENTER;
    d.fillRound(ctx, r.x, r.y, r.w, r.h, 6,
      isCenter ? 'rgba(231,169,59,0.16)' : (i < core.CENTER ? 'rgba(59,125,216,0.14)' : 'rgba(232,163,61,0.13)'));
    if (isCenter) d.strokeRound(ctx, r.x, r.y, r.w, r.h, 6, 'rgba(231,169,59,0.5)', 1);
    const cell = s.track[i];
    for (let k = 0; k < cell.length && k < 3; k++) {
      const tid = cell[k];
      const cy = r.y + 12 + k * 15;
      const isTg = tg && tg.cell === i && tg.slot === k;
      const match = wantColor >= 0 && core.tokenColor(tid) === wantColor;
      token(ctx, r.x + r.w / 2, cy, 9, core.tokenColor(tid), i < core.CENTER);
      if (isTg) d.ringCircle(ctx, r.x + r.w / 2, cy, 12, C.ok, 2.5);
      else if (match && showColor) d.ringCircle(ctx, r.x + r.w / 2, cy, 12, 'rgba(255,255,255,0.6)', 1.5);
    }
    if (i === core.CENTER) {
      d.text(ctx, '0', r.x + r.w / 2, r.y + r.h - 6, { size: F.xs, color: C.warn, align: 'center' });
    }
  }
  d.text(ctx, '◀ 调查组这侧', lay.track.x, lay.track.y - 4, { size: F.xs, color: sideColor(1) });
  d.text(ctx, '档案室这侧 ▶', lay.track.x + lay.track.w, lay.track.y - 4, {
    size: F.xs, color: sideColor(0), align: 'right'
  });

  // 我的信息
  d.fillRound(ctx, lay.info.x, lay.info.y, lay.info.w, lay.info.h, 8, 'rgba(255,255,255,0.05)');
  d.text(ctx, '我（' + ROLE[mine] + '）　手牌 ' + s.hands[mine].length + ' 张　本轮钉牌 ' + s.pins[mine],
    lay.info.x + 8, lay.info.y + lay.info.h / 2, { size: F.xs, color: sideColor(mine) });

  // 手牌
  const hand = s.hands[mine];
  for (let k = 0; k < hand.length; k++) {
    drawCard(ctx, handRect(lay, k, hand.length), hand[k], { side: mine, selected: sel === k });
  }
  if (!hand.length) {
    d.text(ctx, '手牌出完了', lay.hand.x + lay.hand.w / 2, lay.hand.y + lay.hand.h / 2, {
      size: F.sm, color: C.dim, align: 'center'
    });
  }
}

// ---------- 交互辅助 ----------
function legalTargets(s, side, kind, cardId) {
  if (kind === 'value') return core.valueTargets(s, cardId);
  return core.actionTargets(s, side, cardId);
}

function sameTarget(a, b) {
  if (!a || !b) return false;
  if (a.cell !== undefined) return a.cell === b.cell && a.slot === b.slot;
  if (a.arm !== undefined) return a.arm === b.arm && a.k === b.k;
  return !!b.any;
}

// 选中目标优先；没选就自动挑唯一合法目标
function pickTarget(s, side, kind, cardId, sel) {
  const list = legalTargets(s, side, kind, cardId);
  if (!list.length) return null;
  if (list.length === 1 && list[0].any) return list[0];
  if (sel) {
    for (let i = 0; i < list.length; i++) if (sameTarget(list[i], sel)) return list[i];
  }
  if (list.length === 1) return list[0];
  return null;
}

function touch(type, pt, area, s, api) {
  if (type !== 'end' || api.blocked() || s.phase === 'over') return;
  const lay = layout(area);
  const mine = api.mySide();
  const p = api.pending || {};
  const hand = s.hands[mine];
  for (let k = 0; k < hand.length; k++) {
    if (d.inRect(pt.x, pt.y, handRect(lay, k, hand.length))) {
      const cur = (p.wgCard === k) ? null : k;
      api.setPending(Object.assign({}, p, { wgCard: cur, wgTarget: null }));
      api.vibrate();
      return;
    }
  }
  for (let i = 0; i < core.TRACK_LEN; i++) {
    const r = trackCellRect(lay, i);
    if (!d.inRect(pt.x, pt.y, r)) continue;
    for (let k = s.track[i].length - 1; k >= 0; k--) {
      if (d.inCircle(pt.x, pt.y, r.x + r.w / 2, r.y + 12 + k * 15, 14) || k === 0) {
        api.setPending(Object.assign({}, p, { wgTarget: { cell: i, slot: k } }));
        api.vibrate();
        return;
      }
    }
    return;
  }
  for (let arm = 0; arm < core.ARMS; arm++) {
    for (let k = 0; k < core.LINKS; k++) {
      if (d.inRect(pt.x, pt.y, linkRect(lay, arm, k))) {
        api.setPending(Object.assign({}, p, { wgTarget: { arm: arm, k: k } }));
        api.vibrate();
        return;
      }
    }
  }
}

function buttons(s, api) {
  if (s.phase !== 'play') return [];
  const p = api.pending || {};
  const side = api.mySide();
  const sel = (p.wgCard === undefined) ? null : p.wgCard;
  const hand = s.hands[side];
  const cardId = (sel === null || sel === undefined) ? null : hand[sel];
  const tg = p.wgTarget || null;
  let vOk = false;
  let aOk = false;
  let actName = '行动';
  if (cardId !== null && cardId !== undefined) {
    const c = core.cardColor(cardId);
    actName = core.ACTIONS[side][c];
    const vList = legalTargets(s, side, 'value', cardId);
    const aList = legalTargets(s, side, 'action', cardId);
    vOk = vList.length > 0;
    aOk = aList.length > 0;
  }
  return [
    { key: 'value', label: cardId === null || cardId === undefined ? '按数值推进' : '推进 ' + core.cardValue(cardId) + ' 格', tone: 'primary', disabled: !vOk },
    { key: 'action', label: actName, tone: 'ok', disabled: !aOk },
    { key: 'discard', label: '弃掉这张', tone: 'ghost', disabled: cardId === null || cardId === undefined }
  ];
}

function press(key, s, api) {
  const p = api.pending || {};
  const side = api.mySide();
  const sel = (p.wgCard === undefined) ? null : p.wgCard;
  const cardId = (sel === null || sel === undefined) ? null : s.hands[side][sel];
  if (cardId === null || cardId === undefined) { api.toast('先点一张手牌'); return; }
  const tg = p.wgTarget || null;
  if (key === 'discard') {
    if (api.act({ kind: 'discard', card: sel })) {
      api.setPending(Object.assign({}, p, { wgCard: null, wgTarget: null }));
    }
    return;
  }
  const kind = key === 'value' ? 'value' : 'action';
  const target = pickTarget(s, side, kind, cardId, tg);
  if (!target) {
    api.toast(kind === 'value' ? '先在研究轨道上点一枚同色证据' : '先点一下要作用的证据或空格');
    return;
  }
  const action = { kind: kind, card: sel, target: target };
  if (kind === 'value') { action.cell = target.cell; action.slot = target.slot; }
  if (!api.act(action)) { api.toast('这一步走不了'); return; }
  api.setPending(Object.assign({}, p, { wgCard: null, wgTarget: null }));
  api.vibrate();
}

function coverKey(s, api) {
  if (api.mode !== 'local') return null;
  return s.phase === 'play' ? 'turn:' + s.turn : null;
}

function coverText(s, api) {
  return {
    side: s.turn,
    title: '请把手机交给 ' + (api.names[s.turn] || '玩家'),
    sub: '你是「' + ROLE[s.turn] + '」：' +
      (s.turn === 0 ? '集齐 4 枚气势标记就赢' : '把 2 名线人连到密档上就赢')
  };
}

module.exports = {
  id: 'watergate', name: '密档对决', icon: '🔍', tint: '#6B5B3E',
  desc: '非对称二人对抗：一方封存密档攒气势，一方挖证据连线人',
  core: core, create: create, turn: turn, over: over, result: result, hint: hint,
  score: score, buttons: buttons, press: press, draw: draw, touch: touch, geo: geo,
  layout: layout, linkRect: linkRect, trackCellRect: trackCellRect, handRect: handRect,
  coverKey: coverKey, coverText: coverText, sideName: sideName
};

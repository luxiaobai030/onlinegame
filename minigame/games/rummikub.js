// ===== 数字牌：canvas 界面（13×13 大格子 + 手动拖放 + 绿/红边框）=====
const core = require('../../games/core/rummikub.js');
const d = require('./../draw.js');
const bd = require('./board.js');
const { C, F, sideColor } = require('./../theme.js');

const RACK_COLS = 7;     // 手牌每行 7 张；摸到第 15 张会自动多分几列，牌窄一点，但不会跑出手牌区
const RACK_ROWS = 2;     // 手牌固定两行
const RACK_HEAD = 30;    // 手牌上方留给「标题 + 排序按钮」的高度，棋盘必须停在这条线以上
const RACK_TILE_MAX_H = 42;

function create(seed, mode) { return core.create({ seed: seed, mode: mode }); }
function turn(s) { return s.turn; }
function over(s) { return s.phase === 'over'; }

function result(s, api) {
  if (s.winner === -2) {
    return { winner: -2, title: '平局', sub: s.reason || '双方剩下的点数一样' };
  }
  return {
    winner: s.winner,
    title: (api.names[s.winner] || '玩家') + ' 获胜',
    sub: s.reason || '先把手牌出完'
  };
}

function hint(s, api) {
  if (s.phase === 'over') return '本局结束';
  if (api.mode === 'net' && s.turn !== api.role) return '等对方出牌…';
  const parts = [(api.names[s.turn] || '玩家') + ' 出牌', '牌堆 ' + s.pool.length];
  if (!s.melded[s.turn]) {
    parts.push('首次要凑够 ' + core.MELD_MIN + ' 分（现在 ' + core.meldScore(s, s.turn) + ' 分）');
  }
  return parts.join(' · ');
}

// 布局：上边棋盘，下边手牌
// count = 当前这手的手牌张数（超过 14 张时自动加列，行高不变，棋盘不会跟着跳）
function layout(area, count) {
  const pad = 8;
  const gap = 5;
  const rackW = area.w - pad * 2;
  const baseTileW = (rackW - (RACK_COLS - 1) * gap) / RACK_COLS;
  const rackTileH = Math.min(baseTileW * 1.15, RACK_TILE_MAX_H);
  const rackH = rackTileH * RACK_ROWS + 6;
  const cols = Math.max(RACK_COLS, Math.ceil((count || 0) / RACK_ROWS));
  const tileW = (rackW - (cols - 1) * gap) / cols;
  const boardArea = {
    x: area.x, y: area.y, w: area.w,
    h: Math.max(80, area.h - rackH - RACK_HEAD)
  };
  const rack = {
    x: area.x + pad, y: area.y + area.h - rackH, w: rackW, h: rackH,
    tileW: tileW, tileH: rackTileH, gap: gap, cols: cols
  };
  return {
    g: bd.grid(boardArea, core.N, core.N, 0),
    rack: rack,
    head: { x: rack.x, y: rack.y - RACK_HEAD + 6, w: rackW, h: 18 }
  };
}

function rackTileRect(rack, k) {
  const cols = rack.cols || RACK_COLS;
  const row = Math.floor(k / cols);
  const col = k % cols;
  return {
    x: rack.x + col * (rack.tileW + rack.gap),
    y: rack.y + row * (rack.tileH + 6),
    w: rack.tileW,
    h: rack.tileH
  };
}

// 手指位置落在哪张手牌上
function rackHit(rack, x, y) {
  const cols = rack.cols || RACK_COLS;
  for (let k = 0; k < cols * RACK_ROWS; k++) {
    if (d.inRect(x, y, rackTileRect(rack, k))) return k;
  }
  return -1;
}

function drawBoard(ctx, lay, s, api) {
  const g = lay.g;
  const view = core.layoutBoard(s);
  d.fillRound(ctx, g.x - 1, g.y - 1, g.w + 2, g.h + 2, 8, '#101725');
  for (let r = 1; r < core.N; r++) {
    d.line(ctx, g.x, g.y + r * g.cell, g.x + g.w, g.y + r * g.cell, 'rgba(80,100,150,0.25)', 1);
  }
  for (let c = 1; c < core.N; c++) {
    d.line(ctx, g.x + c * g.cell, g.y, g.x + c * g.cell, g.y + g.h, 'rgba(80,100,150,0.25)', 1);
  }
  const drag = api.pending ? api.pending.rmDrag : null;
  const hover = api.pending ? api.pending.rmHover : null;
  const lately = core.latelyCells(s);
  for (let i = 0; i < core.CELLS; i++) {
    const r = core.rowOf(i);
    const c = core.colOf(i);
    const p = bd.cellRect(g, r, c);
    const t = view.cells[i].tile;
    if (i === hover) {
      d.fillRound(ctx, p.x + 1, p.y + 1, g.cell - 2, g.cell - 2, 5, 'rgba(231,169,59,0.22)');
    }
    if (!t) continue;
    if (drag && drag.tileId === t.id) continue;
    const sel = api.pending && api.pending.rmSel === t.id;
    bd.tile(ctx, p.x + 2.5, p.y + 2.5, g.cell - 5, g.cell - 5, {
      color: t.c, num: view.cells[i].v, joker: t.joker,
      ok: view.cells[i].ok, bad: !view.cells[i].ok,
      size: Math.max(10, g.cell * 0.52)
    });
    if (sel) d.strokeRound(ctx, p.x + 1, p.y + 1, g.cell - 2, g.cell - 2, 7, '#E7A93B', 2.5);
    if (lately.indexOf(i) >= 0 && !sel) {
      d.strokeRound(ctx, p.x + 2.5, p.y + 2.5, g.cell - 5, g.cell - 5, 6, 'rgba(231,169,59,0.55)', 1.5);
    }
  }
}

function drawRack(ctx, lay, s, api) {
  const side = api.mySide();
  const mode = (api.pending && api.pending.rmSort) || 'color';
  const mine = s.racks[side];
  const rack = core.sortRackBy(mine, mode);
  const box = lay.rack;
  d.fillRound(ctx, box.x - 6, box.y - 6, box.w + 12, box.h + 12, 12, 'rgba(255,255,255,0.04)');
  d.text(ctx, '我的手牌（' + mine.length + ' 张）', lay.head.x, lay.head.y + lay.head.h / 2, {
    size: F.sm, color: C.muted
  });
  for (let k = 0; k < rack.length; k++) {
    const t = rack[k];
    const rc = rackTileRect(box, k);
    const drag = api.pending ? api.pending.rmDrag : null;
    if (drag && drag.tileId === t.id && drag.from === 'rack') continue;
    const sel = api.pending && api.pending.rmSel === t.id;
    bd.tile(ctx, rc.x, rc.y, rc.w, rc.h, { color: t.c, num: t.v, joker: t.joker, size: Math.max(11, rc.h * 0.44) });
    if (sel) d.strokeRound(ctx, rc.x - 2, rc.y - 2, rc.w + 4, rc.h + 4, 8, '#E7A93B', 2.5);
  }
  // 排序切换
  const sr = sortButton(lay);
  d.fillRound(ctx, sr.x, sr.y, sr.w, sr.h, 9, 'rgba(255,255,255,0.08)');
  d.text(ctx, mode === 'num' ? '按数字 ▸' : '按颜色 ▸', sr.x + sr.w / 2, sr.y + sr.h / 2, {
    size: F.xs, color: C.text, align: 'center'
  });
  return sr;
}

function drawGhost(ctx, lay, s, api) {
  const drag = api.pending ? api.pending.rmDrag : null;
  if (!drag) return;
  const t = core.findTile(s, drag.tileId) || (s.racks[api.mySide()] || []).filter(function (x) { return x.id === drag.tileId; })[0];
  if (!t) return;
  const w = lay.g.cell * 1.25;
  const h = w * 1.15;
  ctx.globalAlpha = 0.9;
  bd.tile(ctx, drag.x - w / 2, drag.y - h / 2, w, h, { color: t.c, num: t.v, joker: t.joker });
  ctx.globalAlpha = 1;
}

function draw(ctx, area, s, api) {
  const lay = layout(area, s.racks[api.mySide()].length);
  drawBoard(ctx, lay, s, api);
  drawRack(ctx, lay, s, api);
  drawGhost(ctx, lay, s, api);
}

function cellIndex(lay, x, y) {
  const cell = bd.hitCell(lay.g, x, y);
  if (!cell) return -1;
  return cell.r * core.N + cell.c;
}

function touch(type, pt, area, s, api) {
  if (api.blocked() || s.phase !== 'play') return;
  const lay = layout(area, s.racks[api.mySide()].length);
  const p = api.pending || {};
  const side = api.mySide();
  const sort = p.rmSort || 'color';
  const cellIdx = cellIndex(lay, pt.x, pt.y);
  const overRack = d.inRect(pt.x, pt.y, { x: lay.rack.x - 8, y: lay.rack.y - 8, w: lay.rack.w + 16, h: lay.rack.h + 16 });

  if (type === 'start') {
    let tileId = null;
    let from = '';
    const k = rackHit(lay.rack, pt.x, pt.y);
    const rack = core.sortRackBy(s.racks[side], sort);
    if (k >= 0 && k < rack.length) {
      tileId = rack[k].id;
      from = 'rack';
    } else if (cellIdx >= 0 && s.board[cellIdx]) {
      tileId = s.board[cellIdx].id;
      from = 'board';
    }
    const patch = { rmDrag: null, rmHover: null };
    if (tileId !== null) patch.rmDrag = { tileId: tileId, from: from, x: pt.x, y: pt.y };
    api.setPending(Object.assign({}, p, patch));
    return;
  }

  if (type === 'move') {
    if (!p.rmDrag) return;
    const hover = overRack ? null : (cellIdx >= 0 ? cellIdx : null);
    api.setPending(Object.assign({}, p, {
      rmDrag: { tileId: p.rmDrag.tileId, from: p.rmDrag.from, x: pt.x, y: pt.y },
      rmHover: hover
    }));
    return;
  }

  if (type !== 'end') return;
  const drag = p.rmDrag;
  if (drag && api.moved) {
    let ok = false;
    if (overRack && drag.from === 'board') {
      ok = api.act({ kind: 'move', tileId: drag.tileId, to: 'rack' });
    } else if (cellIdx >= 0) {
      if (s.board[cellIdx]) api.toast('这一格已经有牌了');
      else ok = api.act({ kind: 'move', tileId: drag.tileId, to: cellIdx });
    }
    api.setPending(Object.assign({}, p, { rmDrag: null, rmHover: null, rmSel: ok ? null : p.rmSel }));
    if (ok) api.vibrate();
    return;
  }
  if (drag) {
    // 没怎么动 = 点了一下，切换选中
    const sel = p.rmSel === drag.tileId ? null : drag.tileId;
    api.setPending(Object.assign({}, p, { rmDrag: null, rmHover: null, rmSel: sel }));
    return;
  }
  const sel = p.rmSel;
  if (cellIdx >= 0) {
    const t = s.board[cellIdx];
    if (t) {
      api.setPending(Object.assign({}, p, { rmSel: t.id }));
      return;
    }
    if (sel !== undefined && sel !== null) {
      const ok = api.act({ kind: 'move', tileId: sel, to: cellIdx });
      if (ok) api.vibrate();
      api.setPending(Object.assign({}, p, { rmSel: null }));
    }
    return;
  }
  if (overRack && sel !== undefined && sel !== null) {
    const inHand = s.racks[side].filter(function (x) { return x.id === sel; }).length > 0;
    if (!inHand && api.act({ kind: 'move', tileId: sel, to: 'rack' })) api.vibrate();
    api.setPending(Object.assign({}, p, { rmSel: null }));
    return;
  }
  if (p.rmSel !== undefined && p.rmSel !== null) {
    api.setPending(Object.assign({}, p, { rmSel: null }));
  }
}

function buttons(s, api) {
  if (s.phase !== 'play') return [];
  return [
    { key: 'undo', label: '撤销这一手', tone: 'ghost' },
    { key: 'draw', label: '摸一张', tone: 'ghost', disabled: !s.pool.length },
    { key: 'commit', label: '收手', tone: 'ok' }
  ];
}

function press(key, s, api) {
  if (key === 'sort') {
    const cur = (api.pending && api.pending.rmSort) || 'color';
    api.setPending(Object.assign({}, api.pending, { rmSort: cur === 'color' ? 'num' : 'color' }));
    return;
  }
  if (key === 'undo') {
    if (!api.act({ kind: 'undo' })) api.toast('这一手还没动过牌');
    else api.setPending(Object.assign({}, api.pending, { rmSel: null, rmDrag: null }));
    return;
  }
  if (key === 'draw') {
    if (!api.act({ kind: 'draw' })) api.toast('动过牌就不能摸了：先「撤销这一手」或直接「收手」');
    return;
  }
  if (key === 'commit') {
    const check = core.checkCommit(s);
    if (!check.ok) {
      api.toast(check.reason);
      return;
    }
    if (api.act({ kind: 'commit' })) api.toast('这一手成了！');
  }
}

// 手牌排序切换按钮的位置（画在手牌右上角）
function sortButton(lay) {
  const head = lay.head;
  return { x: head.x + head.w - 76, y: head.y, w: 76, h: head.h };
}

function onExtraTap(pt, area, s, api) {
  const lay = layout(area, s.racks[api.mySide()].length);
  if (d.inRect(pt.x, pt.y, sortButton(lay))) {
    press('sort', s, api);
    return true;
  }
  return false;
}

function coverKey(s, api) {
  if (api.mode !== 'local') return null;
  return s.phase === 'play' ? 'turn:' + s.turn : null;
}

function coverText(s, api) {
  return {
    side: s.turn,
    title: '请把手机交给 ' + (api.names[s.turn] || '玩家'),
    sub: '轮到你出牌（手牌 14 张，首次出牌要够 30 分）'
  };
}

module.exports = {
  id: 'rummikub', name: '数字牌', icon: '🔢', tint: '#3D7A5C',
  desc: '横排凑同色顺子或同数字，能拆能拼，先出完手牌者胜',
  core: core, create: create, turn: turn, over: over, result: result, hint: hint,
  buttons: buttons, press: press, draw: draw, touch: touch,
  onExtraTap: onExtraTap, coverKey: coverKey, coverText: coverText,
  layout: layout, rackTileRect: rackTileRect, sortButton: sortButton
};

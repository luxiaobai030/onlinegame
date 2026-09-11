// ===== 海战棋：canvas 界面 =====
const core = require('../../games/core/battleship.js');
const d = require('./../draw.js');
const bd = require('./board.js');
const { C, F, sideColor } = require('./../theme.js');

const SEA = '#0E1F31';
const SEA_LINE = 'rgba(120,170,230,0.28)';

function create(seed, mode) { return core.create({ seed: seed, mode: mode }); }
function turn(s) { return s.phase === 'setup' ? s.setupBy : s.turn; }
function over(s) { return s.phase === 'over'; }

function result(s, api) {
  return {
    winner: s.winner,
    title: (api.names[s.winner] || '玩家') + ' 获胜',
    sub: '把对方三艘船全打沉了'
  };
}

function hint(s, api) {
  if (s.phase === 'over') return '本局结束';
  if (s.phase === 'setup') {
    const who = api.mode === 'net' ? '你' : (api.names[s.setupBy] || '玩家');
    const k = s.fleets[s.setupBy].length;
    if (k >= core.SHIPS.length) return who + ' 已摆好，点「准备好了」';
    return who + ' 布阵：放下 ' + core.SHIP_NAMES[k] + '（' + core.SHIPS[k] + ' 格）';
  }
  if (api.mode === 'net' && s.turn !== api.role) return '等对方开炮…';
  return '轮到 ' + (api.names[s.turn] || '玩家') + ' 开炮：点对方海域';
}

function geoSetup(area) { return bd.grid(area, core.SIZE, core.SIZE, 6); }

function geoPair(area) {
  const gap = 30;
  const h = (area.h - gap) / 2;
  return {
    foe: bd.grid({ x: area.x, y: area.y, w: area.w, h: h }, core.SIZE, core.SIZE, 4),
    own: bd.grid({ x: area.x, y: area.y + h + gap, w: area.w, h: h }, core.SIZE, core.SIZE, 4)
  };
}

// 一艘船：整条画成一个圆角长条
function shipBar(ctx, g, cells, color, alpha) {
  const half = g.cell * 0.34;
  const first = { r: Math.floor(cells[0] / core.SIZE), c: cells[0] % core.SIZE };
  const last = { r: Math.floor(cells[cells.length - 1] / core.SIZE), c: cells[cells.length - 1] % core.SIZE };
  const x = g.x + first.c * g.cell + (g.cell - half * 2) / 2;
  const y = g.y + first.r * g.cell + (g.cell - half * 2) / 2;
  const w = first.r === last.r ? (last.c - first.c + 1) * g.cell - (g.cell - half * 2) : half * 2;
  const h = first.c === last.c ? (last.r - first.r + 1) * g.cell - (g.cell - half * 2) : half * 2;
  if (alpha !== undefined) ctx.globalAlpha = alpha;
  d.fillRound(ctx, x, y, w, h, half, color);
  if (alpha !== undefined) ctx.globalAlpha = 1;
}

function markShot(ctx, g, i, hit) {
  const r = Math.floor(i / core.SIZE);
  const c = i % core.SIZE;
  const p = bd.cellCenter(g, r, c);
  const k = g.cell * 0.22;
  if (hit) {
    d.line(ctx, p.x - k, p.y - k, p.x + k, p.y + k, C.bad, 4);
    d.line(ctx, p.x + k, p.y - k, p.x - k, p.y + k, C.bad, 4);
  } else {
    d.circle(ctx, p.x, p.y, k * 0.62, 'rgba(180,195,220,0.55)');
  }
}

function drawSetup(ctx, area, s, api) {
  const g = geoSetup(area);
  const side = api.mySide();
  bd.gridPlate(ctx, g, { bg: SEA, line: SEA_LINE });
  const fleet = s.fleets[side];
  for (let k = 0; k < fleet.length; k++) shipBar(ctx, g, fleet[k].cells, '#2B4C7E');
  const pos = api.pending ? api.pending.bsPos : null;
  if (pos && s.fleets[side].length < core.SHIPS.length) {
    const len = core.SHIPS[s.fleets[side].length];
    const cells = core.shipCells(pos.r, pos.c, len, pos.horiz);
    let legal = !!cells;
    if (cells) {
      const used = core.shipCellsOf(s.fleets[side]);
      for (let i = 0; i < cells.length; i++) if (used.indexOf(cells[i]) >= 0) legal = false;
    }
    if (cells) shipBar(ctx, g, cells, legal ? C.ok : C.bad, 0.5);
  }
  d.text(ctx, '我的海域', g.x, g.y - 14, { size: F.sm, color: C.muted });
  d.text(ctx, (s.ready[side] ? '已准备' : '布阵中'), g.x + g.w, g.y - 14, {
    size: F.sm, color: s.ready[side] ? C.ok : C.muted, align: 'right'
  });
}

function drawPlay(ctx, area, s, api) {
  const side = api.mySide();
  const p = geoPair(area);
  bd.gridPlate(ctx, p.foe, { bg: SEA, line: SEA_LINE });
  d.text(ctx, '对方海域（点这里开炮）', p.foe.x, p.foe.y - 12, { size: F.sm, color: C.muted });
  for (let i = 0; i < core.N; i++) {
    if (s.shots[side][i] >= 0) markShot(ctx, p.foe, i, s.shots[side][i] === 1);
  }
  if (s.lastShot && s.lastShot.by === side) {
    markShot(ctx, p.foe, s.lastShot.i, s.lastShot.hit);
  }

  bd.gridPlate(ctx, p.own, { bg: '#0B1A2A', line: SEA_LINE });
  d.text(ctx, '我的海域（被打了 ' + s.sunkCount[side] + '/' + core.SHIPS.length + ' 艘）', p.own.x, p.own.y - 12, {
    size: F.sm, color: C.muted
  });
  const fleet = s.fleets[side];
  for (let k = 0; k < fleet.length; k++) {
    let allHit = true;
    for (let j = 0; j < fleet[k].cells.length; j++) {
      if (s.shots[1 - side][fleet[k].cells[j]] !== 1) allHit = false;
    }
    shipBar(ctx, p.own, fleet[k].cells, allHit ? '#63302F' : '#37628F');
  }
  for (let i = 0; i < core.N; i++) {
    if (s.shots[1 - side][i] >= 0) markShot(ctx, p.own, i, s.shots[1 - side][i] === 1);
  }
}

function draw(ctx, area, s, api) {
  if (s.phase === 'setup') drawSetup(ctx, area, s, api);
  else drawPlay(ctx, area, s, api);
}

function touch(type, pt, area, s, api) {
  if (api.blocked()) return;
  if (s.phase === 'setup') {
    const g = geoSetup(area);
    const cell = bd.nearCell(g, pt.x, pt.y, 1.2);
    if (!cell) return;
    const horiz = api.pending && api.pending.bsHoriz !== undefined ? api.pending.bsHoriz : true;
    api.setPending(Object.assign({}, api.pending, { bsPos: { r: cell.r, c: cell.c, horiz: horiz } }));
    if (type === 'end' && s.fleets[api.mySide()].length < core.SHIPS.length) {
      const pos = api.pending.bsPos;
      if (api.act({
        kind: 'place', row: pos.r, col: pos.c, horiz: pos.horiz
      })) api.vibrate();
    }
    return;
  }
  if (s.phase !== 'play' || type !== 'end') return;
  const p = geoPair(area);
  const cell = bd.hitCell(p.foe, pt.x, pt.y);
  if (!cell) return;
  const i = cell.r * core.SIZE + cell.c;
  if (s.shots[api.mySide()][i] >= 0) {
    api.toast('这里已经打过了');
    return;
  }
  if (api.act({ kind: 'shoot', i: i })) {
    api.vibrate();
    const shot = api.getState().lastShot || {};
    api.toast(shot.sunk ? ('打沉了' + shot.sunk + '！') : (shot.hit ? '打中了！' : '打空了'));
  }
}

function buttons(s, api) {
  if (s.phase !== 'setup') return [];
  const side = api.mySide();
  if (s.ready[side]) return [];
  const horiz = api.pending && api.pending.bsHoriz !== undefined ? api.pending.bsHoriz : true;
  return [
    { key: 'rot', label: horiz ? '横着放' : '竖着放', tone: 'ghost' },
    { key: 'rand', label: '随机摆', tone: 'ghost' },
    { key: 'undo', label: '撤销', tone: 'ghost', disabled: !s.fleets[side].length },
    { key: 'ready', label: '准备好了', tone: 'ok', disabled: s.fleets[side].length < core.SHIPS.length }
  ];
}

function press(key, s, api) {
  const side = api.mySide();
  const horiz = api.pending && api.pending.bsHoriz !== undefined ? api.pending.bsHoriz : true;
  if (key === 'rot') {
    api.setPending(Object.assign({}, api.pending, { bsHoriz: !horiz }));
    return;
  }
  if (key === 'rand') {
    api.act({ kind: 'autoPlace', seed: api.seed + ':auto:' + side });
    api.toast('已随机摆好，也可以点「撤销」重摆');
    return;
  }
  if (key === 'undo') {
    if (!api.act({ kind: 'undoPlace' })) api.toast('还没有放船');
    return;
  }
  if (key === 'ready') {
    if (api.act({ kind: 'ready' })) api.toast('已准备，等对方摆好');
  }
}

function coverKey(s, api) {
  if (api.mode !== 'local') return null;
  if (s.phase === 'setup') return 'setup:' + s.setupBy;
  if (s.phase === 'play') return 'turn:' + s.turn;
  return null;
}

function coverText(s, api) {
  const side = turn(s);
  let sub = s.phase === 'setup' ? '摆放你的三艘船，好了点「准备好了」' : '轮到你开炮';
  if (s.phase === 'play' && s.lastShot && s.lastShot.by !== side) {
    sub = '对方上一炮' + (s.lastShot.hit ? ('打中了你的' + (s.lastShot.sunk || '船')) : '打空了');
  }
  return { side: side, title: '请把手机交给 ' + (api.names[side] || '玩家'), sub: sub };
}

module.exports = {
  id: 'battleship', name: '海战棋', icon: '🚢', tint: '#2B4C7E',
  desc: '藏好三条船，轮流开炮，先击沉对方者胜',
  core: core, create: create, turn: turn, over: over, result: result, hint: hint,
  buttons: buttons, press: press, draw: draw, touch: touch,
  coverKey: coverKey, coverText: coverText,
  geoSetup: geoSetup, geoPair: geoPair
};

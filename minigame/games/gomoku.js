// ===== 五子棋：canvas 界面（双击落子 + 悔棋）=====
const core = require('../../games/core/gomoku.js');
const d = require('./../draw.js');
const bd = require('./board.js');
const { C, F } = require('./../theme.js');

function create(seed, mode) { return core.create({ seed: seed, mode: mode }); }
function turn(s) { return s.turn; }
function over(s) { return s.phase === 'over'; }

function result(s, api) {
  if (s.winner === -2) return { winner: -2, title: '平局', sub: '棋盘下满了' };
  return { winner: s.winner, title: (api.names[s.winner] || '玩家') + ' 获胜', sub: '连成五子' };
}

function hint(s, api) {
  if (s.phase === 'over') return '本局结束';
  if (api.mode === 'net' && s.turn !== api.role) return '等对方落子…';
  return '轮到 ' + (api.names[s.turn] || '玩家') + '：点一下预览，再点一下落子';
}

function geo(area) { return bd.grid(area, core.SIZE, core.SIZE, 6); }

function stoneAt(ctx, g, i, side, o) {
  const r = Math.floor(i / core.SIZE);
  const c = i % core.SIZE;
  const p = bd.cellCenter(g, r, c);
  bd.stone(ctx, p.x, p.y, g.cell * 0.42, side, o);
}

function draw(ctx, area, s, api) {
  const g = geo(area);
  bd.gridPlate(ctx, g, { bg: C.board, line: 'rgba(90,110,170,0.35)' });
  for (let i = 0; i < core.N; i++) {
    if (s.board[i] >= 0) stoneAt(ctx, g, i, s.board[i], {});
  }
  if (s.lastMove >= 0 && s.board[s.lastMove] >= 0) {
    stoneAt(ctx, g, s.lastMove, s.board[s.lastMove], { mark: 'rgba(231,169,59,0.95)' });
  }
  for (let k = 0; k < s.winCells.length; k++) {
    stoneAt(ctx, g, s.winCells[k], s.board[s.winCells[k]], { mark: 'rgba(50,175,125,1)' });
  }
  // 双击落子：第一次点中的位置先亮个圈
  if (api.pending && api.pending.i !== undefined && s.phase === 'play') {
    const r = Math.floor(api.pending.i / core.SIZE);
    const c = api.pending.i % core.SIZE;
    const p = bd.cellCenter(g, r, c);
    d.ringCircle(ctx, p.x, p.y, g.cell * 0.46, 'rgba(231,169,59,0.95)', 2.5);
  }
}

function touch(type, pt, area, s, api) {
  if (type !== 'end' || api.blocked()) return;
  if (s.phase !== 'play') return;
  const g = geo(area);
  const cell = bd.hitCell(g, pt.x, pt.y);
  if (!cell) return;
  const i = cell.r * core.SIZE + cell.c;
  if (s.board[i] !== -1) return;
  if (!api.pending || api.pending.i !== i) {
    api.setPending({ i: i });
    return;
  }
  if (api.act({ kind: 'move', i: i })) {
    api.setPending(null);
    api.vibrate();
  }
}

function buttons(s, api) {
  const out = [];
  if (s.phase !== 'play' || !s.history.length) return out;
  if (api.mode === 'net') {
    out.push({ key: 'undo', label: '请求悔棋', tone: 'ghost', disabled: s.undoReq !== -1 });
  } else {
    out.push({ key: 'undo', label: '悔棋', tone: 'ghost' });
  }
  return out;
}

function press(key, s, api) {
  if (key !== 'undo') return;
  if (api.mode === 'net') {
    if (api.act({ kind: 'undo-req' })) api.toast('已发出悔棋请求');
    return;
  }
  if (api.act({ kind: 'undo' })) {
    api.setPending(null);
    api.toast('已悔棋');
  }
}

module.exports = {
  id: 'gomoku', name: '五子棋', icon: '⚫', tint: '#7C6CF0',
  desc: '15×15 棋盘，率先连成五子者胜；支持悔棋',
  core: core, create: create, turn: turn, over: over, result: result, hint: hint,
  buttons: buttons, press: press, draw: draw, touch: touch, geo: geo
};

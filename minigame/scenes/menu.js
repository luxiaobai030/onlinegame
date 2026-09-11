// ===== 主菜单：挑游戏 + 选同屏/联机 =====
const { C, F } = require('./../theme.js');
const d = require('./../draw.js');
const w = require('./../widgets.js');
const games = require('./../games/index.js');

function geom(a) {
  const pad = 14;
  const head = a.topInset + 62;
  return {
    pad: pad, head: head, cardH: 84, gap: 10,
    listTop: head, listH: a.height - head - 54
  };
}

function contentH(g) {
  return games.GAMES.length * (g.cardH + g.gap);
}

function cardAt(a, scene, x, y) {
  const g = geom(a);
  if (x < g.pad || x > a.width - g.pad) return -1;
  const idx = Math.floor((y - g.listTop + scene.scroll) / (g.cardH + g.gap));
  if (idx < 0 || idx >= games.GAMES.length) return -1;
  const top = g.listTop + idx * (g.cardH + g.gap) - scene.scroll;
  if (y < top || y > top + g.cardH) return -1;
  return idx;
}

function drawCard(ctx, r, g) {
  w.panel(ctx, r, { color: C.card, radius: 16, line: C.line });
  const box = { x: r.x + 12, y: r.y + (r.h - 48) / 2, w: 48, h: 48 };
  d.fillRound(ctx, box.x, box.y, box.w, box.h, 14, 'rgba(255,255,255,0.06)');
  d.strokeRound(ctx, box.x, box.y, box.w, box.h, 14, g.tint, 1.5);
  d.text(ctx, g.icon, box.x + box.w / 2, box.y + box.h / 2 + 1, { size: 24, align: 'center' });
  const tx = box.x + box.w + 12;
  d.text(ctx, g.name, tx, r.y + 30, { size: F.lg, bold: true });
  // 简介太长就折成两行（卡片高度放得下），别把规则截断
  d.wrap(ctx, g.desc, tx, r.y + 54, r.w - (tx - r.x) - 30, {
    size: F.sm, color: C.muted, maxLines: 2, lineHeight: 14
  });
  d.text(ctx, '›', r.x + r.w - 18, r.y + r.h / 2, { size: 24, color: C.dim, align: 'center' });
}

function drawSheet(ctx, a, scene) {
  const g = scene.sheet;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(0, 0, a.width, a.height);
  const h = 250 + a.bottomInset;
  const box = { x: 0, y: a.height - h, w: a.width, h: h };
  d.fillRound(ctx, box.x, box.y, box.w, box.h, 20, C.card2);
  d.text(ctx, g.name, 20, box.y + 34, { size: F.xl, bold: true });
  d.text(ctx, '选一种玩法', a.width - 20, box.y + 34, { size: F.sm, color: C.muted, align: 'right' });
  const rows = sheetRects(a, scene);
  w.button(ctx, rows[0], '📱  同屏双人（一台手机轮流玩）', { tone: 'primary', size: F.md });
  w.button(ctx, rows[1], '🛜  邀请好友联机对战', { tone: 'ok', size: F.md });
  w.button(ctx, rows[2], '取消', { tone: 'quiet', size: F.md });
}

function sheetRects(a, scene) {
  const h = 250 + a.bottomInset;
  const top = a.height - h;
  const x = 16;
  const bw = a.width - 32;
  return [
    { x: x, y: top + 62, w: bw, h: 50 },
    { x: x, y: top + 122, w: bw, h: 50 },
    { x: x, y: top + 182, w: bw, h: 40 }
  ];
}

function create() {
  const scene = {
    name: 'menu',
    scroll: 0,
    sheet: null,
    downY: 0,
    downScroll: 0,
    moved: false,
    enter: function (a) {
      a.setQueryHandler(function (q) {
        const game = games.getById(q.game);
        if (!game || !q.room) return;
        while (a._stack.length > 1) a.pop();
        a.push(require('./room.js').create(game.id, q.room));
      });
    },
    touch: function (type, x, y, a) {
      const g = geom(a);
      if (this.sheet) {
        if (type !== 'end') return;
        const rows = sheetRects(a, this);
        const game = this.sheet;
        if (d.inRect(x, y, rows[0])) {
          this.sheet = null;
          a.push(require('./play.js').create(game.id, { mode: 'local' }));
        } else if (d.inRect(x, y, rows[1])) {
          this.sheet = null;
          a.push(require('./room.js').create(game.id, ''));
        } else if (d.inRect(x, y, rows[2])) {
          this.sheet = null;
          a.render();
        }
        return;
      }
      if (type === 'start') {
        this.downY = y;
        this.downScroll = this.scroll;
        this.moved = false;
        return;
      }
      if (type === 'move') {
        const dy = y - this.downY;
        if (Math.abs(dy) > 8) this.moved = true;
        if (this.moved) {
          const max = Math.max(0, contentH(g) - g.listH);
          this.scroll = Math.max(0, Math.min(max, this.downScroll - dy));
          a.render();
        }
        return;
      }
      if (type !== 'end' || this.moved) return;
      const idx = cardAt(a, this, x, y);
      if (idx >= 0) {
        this.sheet = games.GAMES[idx];
        a.render();
      }
    },
    render: function (a, ctx) {
      const g = geom(a);
      d.text(ctx, '双人游戏合集', g.pad, a.topInset + 22, { size: 24, bold: true });
      d.text(ctx, games.GAMES.length + ' 款对战游戏 · 同屏或邀请好友联机', g.pad, a.topInset + 48, {
        size: F.sm, color: C.muted
      });
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, g.listTop - 6, a.width, g.listH + 12);
      ctx.clip();
      for (let i = 0; i < games.GAMES.length; i++) {
        const y = g.listTop + i * (g.cardH + g.gap) - this.scroll;
        if (y > a.height || y + g.cardH < 0) continue;
        drawCard(ctx, { x: g.pad, y: y, w: a.width - g.pad * 2, h: g.cardH }, games.GAMES[i]);
      }
      ctx.restore();
      d.text(ctx, '同屏：一台手机轮流玩　·　联机：把卡片发给好友', a.width / 2, a.height - a.bottomInset - 22, {
        size: F.xs, color: C.dim, align: 'center'
      });
      if (this.sheet) drawSheet(ctx, a, this);
    }
  };
  return scene;
}

module.exports = { create: create };

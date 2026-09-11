// ===== 网页版测试：真起一个服务器，真用 WebSocket 连上去跑一整套房间流程 =====
const { createServer } = require('../server.js');
const NetLink = require('../web/net-web.js');

const results = [];
const links = [];
function check(name, cond) {
  results.push({ name: name, ok: !!cond });
  if (!cond) console.log('  × ' + name);
}
function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
async function until(fn, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < (ms || 2500)) {
    if (fn()) return true;
    await wait(15);
  }
  return false;
}
async function open(fn) {
  const link = await fn();
  links.push(link);
  return link;
}
async function refuse(fn) {
  try { const l = await fn(); links.push(l); return '(居然成功了)'; }
  catch (e) { return (e && e.message) || '出错了'; }
}

// 把回调都记下来，方便断言
function recorder() {
  const rec = { states: [], msgs: [], leaves: [], errors: [], started: 0 };
  rec.cb = {
    onState: function (s) { rec.states.push(s); },
    onGameMsg: function (m) { rec.msgs.push(m); },
    onPeerLeave: function (w) { rec.leaves.push(w); },
    onError: function (t) { rec.errors.push(t); },
    onGameStart: function () { rec.started++; }
  };
  rec.last = function () { return rec.states[rec.states.length - 1] || null; };
  return rec;
}

const me1 = { id: 'c111111111111111', name: '甲', avatar: '🦊' };
const me2 = { id: 'c222222222222222', name: '乙', avatar: '🐼' };
const me3 = { id: 'c333333333333333', name: '丙', avatar: '🐰' };

async function main() {
  const server = createServer();
  await new Promise(function (r) { server.listen(0, '127.0.0.1', r); });
  const port = server.address().port;
  const url = 'ws://127.0.0.1:' + port + '/ws';
  const base = 'http://127.0.0.1:' + port;

  // ---------- 静态托管 ----------
  check('联机完全可用（网页版不该有"环境不支持"的提示）', NetLink.supportError() === '');
  const page = await fetch(base + '/');
  check('首页能打开', page.status === 200);
  check('首页就是那个画布页面', (await page.text()).indexOf('<canvas id="game"') > 0);
  check('游戏核心代码能读到', (await fetch(base + '/games/core/gomoku.js')).status === 200);
  check('网页版联机层能读到', (await fetch(base + '/web/net-web.js')).status === 200);
  check('服务器自己的源码不外泄', (await fetch(base + '/server.js')).status === 404);
  check('目录穿越被挡住', (await fetch(base + '/../package.json')).status === 404);

  // ---------- 建房 ----------
  const r1 = recorder();
  const host = await open(function () {
    return NetLink.createRoom({ url: url, gameId: 'gomoku', self: me1, cb: r1.cb, minPlayers: 2, maxPlayers: 2 });
  });
  check('房主建房成功', !!host);
  check('房间号是 6 位', /^[0-9A-Z]{6}$/.test(host.roomCode));
  check('房主身份正确', host.isHost === true && host.myIndex() === 0);
  await until(function () { return r1.last(); });
  check('房主收到房间状态', r1.last() && r1.last().count === 1);
  check('还没凑齐人时不能开局', r1.last() && r1.last().allReady === false);

  // ---------- 加入 ----------
  const r2 = recorder();
  const guest = await open(function () {
    return NetLink.joinRoom({ url: url, gameId: 'gomoku', roomCode: host.roomCode, self: me2, cb: r2.cb });
  });
  check('好友加入成功', !!guest);
  check('好友不是房主，坐 1 号位', guest.isHost === false && guest.myIndex() === 1);
  check('好友看到的房间号一致', guest.roomCode === host.roomCode);
  await until(function () { return r1.last() && r1.last().count === 2; });
  check('房主看到 2 个人', r1.last().count === 2);
  check('好友也看到 2 个人', r2.last() && r2.last().count === 2);
  check('座位表标出了"自己"', r2.last().players[1].self === true && r2.last().players[0].self === false);
  check('好友看到的昵称是房主的', r2.last().players[0].name === '甲');
  check('对局里拿得到两个人的名字', guest.playerNames().join(',') === '甲,乙');

  // ---------- 准备与开局 ----------
  host.toggleReady(true);
  await until(function () { return r2.last() && r2.last().players[0].ready; });
  check('房主点了准备，对方也看得到', r2.last().players[0].ready === true);
  check('这时还没开局', r1.started === 0 && r2.started === 0);
  guest.toggleReady(true);
  check('全员准备后自动开局', await until(function () { return r1.started === 1 && r2.started === 1; }, 4000));
  check('开局只触发一次', r1.started === 1 && r2.started === 1);
  check('开局后房间状态是 playing', r1.last().status === 'playing');

  // ---------- 对局消息 ----------
  host.sendGameMsg({ kind: 'move', x: 7, y: 7 });
  check('房主的落子传到好友那边', await until(function () { return r2.msgs.length === 1; }));
  check('消息里带着发送者身份', r2.msgs[0] && r2.msgs[0].from === me1.id);
  check('落子内容没被改', r2.msgs[0].kind === 'move' && r2.msgs[0].x === 7 && r2.msgs[0].y === 7);
  check('自己发的消息不会回给自己', r1.msgs.length === 0);
  guest.sendGameMsg({ kind: 'move', x: 8, y: 8 });
  check('好友的落子也能传回房主', await until(function () { return r1.msgs.length === 1; }));
  check('双向消息都带着发送者', r1.msgs[0].from === me2.id);

  // ---------- 有人离开 ----------
  guest.leaveAndClose();
  check('好友离开后房主收到通知', await until(function () { return r1.leaves.length === 1; }));
  check('离开通知里带着昵称', r1.leaves[0] && r1.leaves[0].name === '乙');

  // ---------- 房间号大小写 / 四人间 ----------
  const r3 = recorder();
  const host4 = await open(function () {
    return NetLink.createRoom({ url: url, gameId: 'xiangqi', self: me1, cb: r3.cb, minPlayers: 2, maxPlayers: 4 });
  });
  const r4 = recorder();
  const guest4 = await open(function () {
    return NetLink.joinRoom({ url: url, gameId: 'xiangqi', roomCode: host4.roomCode.toLowerCase(), self: me2, cb: r4.cb });
  });
  check('房间号大小写不敏感', guest4.roomCode === host4.roomCode);
  await until(function () { return r3.last() && r3.last().count === 2; });
  check('四人间里只来 2 个人也允许', r3.last().count === 2 && r3.last().full === false);

  // ---------- 房主离开 ----------
  host4.leaveAndClose();
  check('房主离开后，好友会收到提示', await until(function () { return r4.errors.length > 0; }));
  check('提示内容是"房主已离开房间"', r4.errors.indexOf('房主已离开房间') >= 0);
  check('好友也收到同伴离开', r4.leaves.length === 1);
  guest4.close();

  // ---------- 各种进不去的情况 ----------
  check('房间号不存在时给的是人话',
    (await refuse(function () {
      return NetLink.joinRoom({ url: url, gameId: 'gomoku', roomCode: 'ZZZZZZ', self: me3, cb: recorder().cb });
    })).indexOf('没有找到这个房间') >= 0);

  check('游戏对不上时会被拦下',
    (await refuse(function () {
      return NetLink.joinRoom({ url: url, gameId: 'reversi', roomCode: host.roomCode, self: me3, cb: recorder().cb });
    })).indexOf('不一致') >= 0);

  const r6 = recorder();
  const host2 = await open(function () {
    return NetLink.createRoom({ url: url, gameId: 'reversi', self: me1, cb: r6.cb, maxPlayers: 2 });
  });
  const r7 = recorder();
  const guest2 = await open(function () {
    return NetLink.joinRoom({ url: url, gameId: 'reversi', roomCode: host2.roomCode, self: me2, cb: r7.cb });
  });
  check('两人房满员后第三个人进不来',
    (await refuse(function () {
      return NetLink.joinRoom({ url: url, gameId: 'reversi', roomCode: host2.roomCode, self: me3, cb: recorder().cb });
    })).indexOf('满了') >= 0);

  host2.toggleReady(true);
  guest2.toggleReady(true);
  await until(function () { return r6.started === 1; }, 4000);
  check('已经开局的房间进不去',
    (await refuse(function () {
      return NetLink.joinRoom({ url: url, gameId: 'reversi', roomCode: host2.roomCode, self: me3, cb: recorder().cb });
    })).indexOf('已开始') >= 0);
  check('开局后房主的准备按钮不再影响房间', r6.started === 1);

  for (let i = 0; i < links.length; i++) { try { links[i].close(); } catch (e) {} }
  await wait(400);
  server.close();

  const fail = results.filter(function (r) { return !r.ok; }).length;
  console.log('');
  for (let i = 0; i < results.length; i++) {
    console.log((results[i].ok ? '  ✓ ' : '  × ') + results[i].name);
  }
  console.log('');
  console.log('结果: ' + (results.length - fail) + ' 通过, ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
}

main()['catch'](function (e) {
  console.log('测试自己崩了：' + ((e && e.stack) || e));
  process.exit(1);
});
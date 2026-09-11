// ===== 网页版联机层（公共 MQTT 中转版）测试 =====
// 这个测试要连着公共中转站跑，属于联网测试：网络不通时会失败，那不代表代码坏了。
// 跑法：node tests/mqtt.test.js
const NetLink = require('../web/net-mqtt.js');

const results = [];
function check(name, cond) {
  results.push({ name: name, ok: !!cond });
  if (!cond) console.log('  × ' + name);
}
function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
async function until(fn, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < (ms || 4000)) {
    if (fn()) return true;
    await wait(20);
  }
  return false;
}
async function refuse(fn) {
  try { const l = await fn(); l.close(); return '(居然成功了)'; }
  catch (e) { return (e && e.message) || '出错了'; }
}
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

const me1 = { id: 'chost00000000001', name: '甲', avatar: '🦊' };
const me2 = { id: 'cguest0000000002', name: '乙', avatar: '🐼' };

async function main() {
  if (typeof WebSocket === 'undefined') {
    console.log('这个 Node 没内置 WebSocket（要 22 以上），跳过联网测试');
    return;
  }

  // ---------- 建房 ----------
  const host = recorder();
  const a = await NetLink.createRoom({
    gameId: 'tictactoe', self: me1, cb: host.cb, minPlayers: 2, maxPlayers: 2
  });
  check('能建出房间，房间码是 6 位', /^[A-Z0-9]{6}$/.test(a.roomCode));
  check('房主看到自己一个人', a.playerCount() === 1 && a.myIndex() === 0);
  const code = a.roomCode;

  // ---------- 加入 ----------
  const guest = recorder();
  const b = await NetLink.joinRoom({ gameId: 'tictactoe', roomCode: code, self: me2, cb: guest.cb });
  check('好友能加进来', b.isHost === false);
  check('好友坐 1 号位，房间里是两个人', await until(function () { return b.players().length === 2 && b.myIndex() === 1; }));
  check('房主这边也看到两个人了', await until(function () { return a.playerCount() === 2; }));
  check('座位上是两个人的名字', a.playerNames().join('/') === '甲/乙');
  check('状态里标出了"我自己"', a.players().filter(function (p) { return p.self; }).length === 1);

  // ---------- 房间码不对 ----------
  check('房间码不对会明确报错', (await refuse(function () {
    return NetLink.joinRoom({ gameId: 'tictactoe', roomCode: 'ZZZZZZ', self: me2, cb: recorder().cb });
  })).indexOf('没找到') >= 0);

  // ---------- 准备 -> 自动开局 ----------
  b.toggleReady(true);
  check('好友点了准备，房主这边看得到', await until(function () { return a.players()[1] && a.players()[1].ready; }));
  a.toggleReady(true);
  check('全员准备，两边同时开局', await until(function () { return a.cb && host.started === 1 && guest.started === 1; }));

  // ---------- 对局消息 ----------
  a.sendGameMsg({ x: 0, y: 0 });
  check('房主落子，好友收得到', await until(function () { return guest.msgs.length === 1; }));
  check('自己发的不回给自己', host.msgs.length === 0);
  b.sendGameMsg({ x: 1, y: 1 });
  check('好友落子，房主收得到', await until(function () { return host.msgs.length === 1; }));
  check('消息内容没走样', guest.msgs[0].x === 0 && host.msgs[0].x === 1);

  // ---------- 掉线：靠中转站替掉线的人发的遗嘱 ----------
  b._mq._sock.close();                       // 模拟浏览器被直接关掉（不发告别消息）
  check('好友掉线，房主马上知道', await until(function () { return host.leaves.length >= 1; }, 8000));
  check('房主重新变成一个人', await until(function () { return a.playerCount() === 1; }));

  // ---------- 房主走了，房间散伙 ----------
  const g2 = recorder();
  const host2 = recorder();
  const a2 = await NetLink.createRoom({ gameId: 'tictactoe', self: { id: 'chost00000000009', name: '丙', avatar: '🐰' }, cb: host2.cb, minPlayers: 2, maxPlayers: 2 });
  const c = await NetLink.joinRoom({ gameId: 'tictactoe', roomCode: a2.roomCode, self: { id: 'cguest0000000003', name: '丁', avatar: '🐻' }, cb: g2.cb });
  check('新房间照样能进人', await until(function () { return c.players().length === 2; }));
  a2.leaveAndClose();
  check('房主走了，剩下的人会收到提示', await until(function () { return g2.errors.length >= 1; }, 5000));
  check('提示内容说得清楚', (g2.errors[0] || '').indexOf('房主') >= 0);
  c.close();

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
  console.log('');
  for (let i = 0; i < results.length; i++) {
    console.log((results[i].ok ? '  ✓ ' : '  × ') + results[i].name);
  }
  process.exit(1);
});
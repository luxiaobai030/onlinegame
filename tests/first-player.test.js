// ===== 先手测试：每款游戏开局都固定由「玩家 1」先出手 =====
// 以前先手是拿种子随机抽的，抽到 2 号开局就会觉得"怎么老是对方先走"。
// 现在所有游戏统一成玩家 1 先手；「再来一局」仍然两人轮换，保证公平。
const games = require('../minigame/games/index.js').GAMES;
const tictactoe = require('../games/core/tictactoe.js');
const reversi = require('../games/core/reversi.js');
const gomoku = require('../games/core/gomoku.js');
const watergate = require('../games/core/watergate.js');

let passCount = 0;
let failCount = 0;
function check(name, cond, extra) {
  if (cond) {
    passCount++;
    return;
  }
  failCount++;
  console.log('  FAIL: ' + name + (extra ? '  ' + extra : ''));
}

// 每个游戏换一批种子开局，先手都该是玩家 1（0 号座位）
const SEEDS = [];
for (let i = 0; i < 24; i++) SEEDS.push('first-' + i + '-' + (i * 7919 + 13));

console.log('== 开局先手 ==');
for (let g = 0; g < games.length; g++) {
  const game = games[g];
  let bad = null;
  for (let i = 0; i < SEEDS.length; i++) {
    let st = null;
    try {
      st = game.create(SEEDS[i], 'local');
    } catch (e) {
      bad = SEEDS[i] + ' (' + e.message + ')';
      break;
    }
    if (!st || st.turn !== 0) { bad = SEEDS[i]; break; }
  }
  check(game.id + ' 开局由玩家 1 先手', bad === null, bad ? ('种子 ' + bad) : '');
}

console.log('== 联机也是同一个先手 ==');
{
  const rooms = ['ABC123', 'ROOM5', 'ZZZ999', 'N0ROOM'];
  for (let i = 0; i < rooms.length; i++) {
    const st = gomoku.create({ seed: rooms[i], mode: 'net' });
    check('联机房间 ' + rooms[i] + ' 也是玩家 1 先手', st.turn === 0, 'turn=' + st.turn);
  }
}

console.log('== 先手方的开局是摆好的 ==');
{
  const rv = reversi.create({ seed: 'rv-first' });
  const n = reversi.SIZE;
  check('黑白棋：先手方一开始就有地方下',
    rv.turn === 0 && reversi.legalMoves(rv.board, 0).length > 0);
  check('黑白棋：场上是先手方两子对后手方两子',
    rv.board[3 * n + 4] === 0 && rv.board[4 * n + 3] === 0
    && rv.board[3 * n + 3] === 1 && rv.board[4 * n + 4] === 1);
}

console.log('== 密档对决 ==');
{
  const wg = watergate.create({ seed: 'wg-first' });
  check('密档：玩家 1 掌握主动权', wg.initiative === 0 && wg.turn === 0);
  check('密档：先手抽 5 张、后手抽 4 张',
    wg.hands[0].length === 5 && wg.hands[1].length === 4,
    wg.hands[0].length + '/' + wg.hands[1].length);
}

console.log('== 再来一局时先手轮换 ==');
{
  let st = tictactoe.create({ seed: 'tt-first' });
  const seq = [0, 1, 3, 4, 6];   // 玩家 1 占住左边一列
  for (let i = 0; i < seq.length; i++) {
    st = tictactoe.act(st, { kind: 'move', by: st.turn, i: seq[i] }).state;
  }
  check('井字棋：这一局能下完', st.phase === 'over', st.phase);
  const again = tictactoe.act(st, { kind: 'again', by: st.winner }).state;
  check('井字棋：再来一局换成对方先手', again.round === 1 && again.turn === 1, 'turn=' + again.turn);
}

console.log('\n结果: ' + passCount + ' 通过, ' + failCount + ' 失败');
if (failCount > 0) process.exit(1);
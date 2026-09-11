// ===== 文字排版测试：提示太长要折行，且标点不能跑到行首 =====
const d = require('../minigame/draw.js');

// 每个字按 12 宽算（和真实字体下汉字宽度接近），够用了
let buf = {};
const ctx = {
  font: '',
  measureText: function (s) { return { width: String(s).length * 12 }; },
  fillText: function (s, x, y) { buf[y] = String(s); }
};
function lines(str, maxWidth, maxLines) {
  buf = {};
  d.wrap(ctx, str, 0, 100, maxWidth, { size: 12, maxLines: maxLines || 2, lineHeight: 17 });
  return Object.keys(buf).map(Number).sort(function (a, b) { return a - b; }).map(function (y) { return buf[y]; });
}
function startsWithPunct(s) { return '，。、；：！？）」』】'.indexOf(s.charAt(0)) >= 0; }

let passCount = 0;
let failCount = 0;
function check(name, cond, extra) {
  if (cond) { passCount++; return; }
  failCount++;
  console.log('  FAIL: ' + name + (extra ? '  ' + extra : ''));
}

const SHORT = '轮到 玩家 1：点一下预览，再点一下落子';
const LONG = '玩家 1：已选 市场 2 张 / 手牌 1 张 · 只拿 1 张货牌；想拿更多（含骆驼）就得还回同样张数';
const DESC = '市场买卖香料的二人经典：赚卢比拿卓越之印，先拿 2 枚者赢';

console.log('== 折行 ==');
{
  const one = lines(SHORT, 351);
  check('短提示只占一行', one.length === 1 && one[0] === SHORT, JSON.stringify(one));

  const two = lines(LONG, 351);
  check('长提示折成两行', two.length === 2, JSON.stringify(two));
  check('折行后一个字都没丢', two.join('') === LONG, JSON.stringify(two.join('')));

  const desc = lines(DESC, 245);
  check('大厅简介折成两行', desc.length === 2, JSON.stringify(desc));
  check('两行加起来就是完整简介', desc.join('') === DESC, JSON.stringify(desc.join('')));

  const tiny = lines(LONG.repeat(2), 245);
  check('实在太长时最多两行、末尾加省略号',
    tiny.length === 2 && tiny[1].slice(-1) === '…', JSON.stringify(tiny));
}

console.log('== 标点位置 ==');
{
  const ls = lines(DESC, 245);
  check('逗号不会掉到第二行开头', !startsWithPunct(ls[1]), JSON.stringify(ls));

  const many = lines('甲乙，丙丁，戊己，庚辛，壬癸，子丑，寅卯，辰巳，午未，申酉', 60);
  check('每行都不会以标点开头', many.every(function (l) { return !startsWithPunct(l); }), JSON.stringify(many));

  const brk = lines('甲乙丙丁，戊己庚辛', 60);
  check('每行都有实际内容（不会出现空行）',
    brk.every(function (l) { return l.length > 0; }), JSON.stringify(brk));
}

console.log('\n结果: ' + passCount + ' 通过, ' + failCount + ' 失败');
if (failCount > 0) process.exit(1);
// ===== 小游戏界面主题：颜色与字号 =====
const C = {
  bg: '#0F1320',
  bgTop: '#171E33',
  card: '#1B2233',
  card2: '#232B41',
  line: '#2C3550',
  text: '#F2F5FF',
  muted: '#8B94AB',
  dim: '#5E677D',
  primary: '#4C7CF3',
  ok: '#2FA97C',
  bad: '#E4574C',
  warn: '#E7A93B',
  white: '#FFFFFF',
  board: '#141A2A',
  boardLine: '#33406A',
  // 0 号 / 1 号玩家的代表色（棋子、玩家条、结算标题都用它）
  p0: '#4C7CF3',
  p1: '#E8A33D',
  // 拉密四种颜色：0 黑 1 红 2 蓝 3 橙
  tile: ['#39415A', '#D8453C', '#3B7DD8', '#E08A2E'],
  joker: '#7C4DE0',
  // 斋普尔的六种货物 + 骆驼
  goods: {
    diamond: '#49A8D8',
    gold: '#E3B341',
    silver: '#9FA9B8',
    cloth: '#8C5FD0',
    spice: '#42A96D',
    leather: '#A97350',
    camel: '#D9964E'
  }
};

const F = { xs: 10, sm: 12, md: 14, lg: 17, xl: 21, xxl: 26 };

// 玩家配色：0 号 / 1 号
function sideColor(side) {
  return side === 1 ? C.p1 : C.p0;
}

module.exports = { C: C, F: F, sideColor: sideColor };

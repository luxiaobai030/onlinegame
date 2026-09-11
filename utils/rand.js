// 可复现的伪随机：双方用同一个种子推导出相同结果（用于开局先后手、洗牌等）
function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// 由 seed + salt 得到一个稳定的 [0, max) 整数
function randInt(seed, salt, max) {
  const h = hashString(seed + '::' + salt);
  return h % max;
}

// 由 seed 洗牌（Fisher-Yates，可复现）
function seededShuffle(arr, seed) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(seed, 'shuffle' + i, i + 1);
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

module.exports = { randInt, seededShuffle, hashString };

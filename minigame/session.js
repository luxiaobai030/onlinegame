// ===== 对局存档 =====
// 小游戏被微信回收（切后台、锁屏、来消息）或开发者工具重新编译时，进程会重启、直接回到主菜单。
// 这里把「同屏双人」正在进行的对局写进本地缓存，重开后就能接着玩。
const KEY = 'duo_session_v1';
const TTL = 8 * 60 * 60 * 1000;   // 超过 8 小时的存档不再恢复

function save(data) {
  try {
    if (typeof wx === 'undefined' || !wx.setStorageSync) return false;
    wx.setStorageSync(KEY, JSON.stringify({ t: Date.now(), data: data }));
    return true;
  } catch (e) {
    return false;
  }
}

function load() {
  try {
    if (typeof wx === 'undefined' || !wx.getStorageSync) return null;
    const raw = wx.getStorageSync(KEY);
    if (!raw) return null;
    const box = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!box || !box.data || !box.t) return null;
    if (Date.now() - box.t > TTL) return null;
    return box.data;
  } catch (e) {
    return null;
  }
}

function clear() {
  try {
    if (typeof wx === 'undefined' || !wx.removeStorageSync) return;
    wx.removeStorageSync(KEY);
  } catch (e) {}
}

module.exports = { KEY: KEY, TTL: TTL, save: save, load: load, clear: clear };
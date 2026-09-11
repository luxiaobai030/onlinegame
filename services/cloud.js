const config = require('../config.js');

let inited = false;
let ready = false;
let reason = '';

function init() {
  if (inited) return;
  inited = true;
  if (!wx.cloud) {
    reason = '当前微信版本过低，暂不支持联机对战（需基础库 2.8.1 以上）';
    return;
  }
  try {
    const options = { traceUser: true };
    if (config.CLOUD_ENV) options.env = config.CLOUD_ENV;
    wx.cloud.init(options);
    ready = true;
  } catch (e) {
    reason = (e && e.message) ? e.message : '云开发初始化失败，请检查是否已开通云开发';
  }
}

module.exports = {
  init,
  isReady: function () { return ready; },
  reason: function () { return reason; }
};

// 生成房号/客户端 ID 的公共工具
const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // 去掉易混淆字符

function randomString(len) {
  let s = '';
  for (let i = 0; i < len; i++) {
    s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return s;
}

// 6 位房间邀请码
function roomCode() {
  return randomString(6);
}

// 客户端身份 ID
function clientId() {
  return 'c' + randomString(15);
}

module.exports = { roomCode, clientId, randomString };

// 默认玩家形象与昵称
const AVATARS = ['🦊', '🐼', '🐰', '🐸', '🐯', '🦁', '🐨', '🐷', '🐵', '🐶', '🐱', '🦄', '🐙', '🦉', '🐳', '🐝'];

const DEFAULT_NAME = '我';

function pickAvatar() {
  const key = 'game_avatar';
  let avatar = wx.getStorageSync(key);
  if (!avatar) {
    avatar = AVATARS[Math.floor(Math.random() * AVATARS.length)];
    try { wx.setStorageSync(key, avatar); } catch (e) {}
  }
  return avatar;
}

function defaultName() {
  return DEFAULT_NAME;
}

module.exports = { AVATARS, pickAvatar, defaultName };

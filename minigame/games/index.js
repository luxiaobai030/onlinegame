// ===== 小游戏版游戏清单（顺序即菜单顺序）=====
const GAMES = [
  require('./tictactoe.js'),
  require('./gomoku.js'),
  require('./reversi.js'),
  require('./xiangqi.js'),
  require('./battleship.js'),
  require('./rummikub.js'),
  require('./jaipur.js'),
  require('./battleline.js'),
  require('./watergate.js')
];

function getById(id) {
  for (let i = 0; i < GAMES.length; i++) {
    if (GAMES[i].id === id) return GAMES[i];
  }
  return null;
}

module.exports = { GAMES: GAMES, getById: getById };

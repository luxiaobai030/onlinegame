// ===== 网页版启动器 =====
// 做的事情只有三件：
//   1) 一个极简的 CommonJS 加载器：让小游戏那套 require/module.exports 能在浏览器里跑
//   2) 一个假的 wx 对象：把微信小游戏用到的那十几个接口，映射成浏览器里对应的能力
//   3) 只把「联机层」换掉（services/net.js -> web/net-mqtt.js），其余代码原样复用
(function () {
  // 逻辑分辨率固定成竖屏手机的尺寸，界面代码按这个尺寸画，不管什么屏幕都不会错位
  var W = 390, H = 844;
  // 网页自身所在的目录，所有文件都相对它来取 —— 换到子目录部署不会找不到文件
  var SITE = location.pathname.replace(/[^/]*$/, '');

  var canvas = document.getElementById('game');
  var view = canvas.getContext('2d');
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);

  // 按窗口大小等比缩放（留黑边，不拉伸）
  function fit() {
    var s = Math.min(window.innerWidth / W, window.innerHeight / H);
    canvas.style.width = Math.floor(W * s) + 'px';
    canvas.style.height = Math.floor(H * s) + 'px';
  }
  fit();
  window.addEventListener('resize', fit);
  window.addEventListener('orientationchange', fit);

  // ---------- 1) 极简 CommonJS 加载器 ----------
  var cache = {};
  var cacheSource = {};
  // 联机层换成网页版：借公共 MQTT 代理中转，不用自己架服务器；其余文件原样复用
  var REMAP = { 'services/net.js': 'web/net-mqtt.js' };

  function normalize(base, p) {
    var parts = (p.charAt(0) === '/' ? p : base + '/' + p).split('/');
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      if (parts[i] === '' || parts[i] === '.') continue;
      if (parts[i] === '..') { out.pop(); continue; }
      out.push(parts[i]);
    }
    return out.join('/');
  }

  function readText(p) {
    if (cacheSource[p]) return cacheSource[p];
    var xhr = new XMLHttpRequest();
    xhr.open('GET', SITE + p, false);      // 同步读取：只发生在启动那一下，几十个小文件而已
    xhr.send(null);
    if (xhr.status !== 200 && xhr.status !== 0) {
      throw new Error('读不到文件 /' + p + '（' + xhr.status + '）');
    }
    cacheSource[p] = xhr.responseText;
    return cacheSource[p];
  }

  function makeRequire(base) {
    return function (req) {
      var p = normalize(base, req);
      if (REMAP[p]) p = REMAP[p];
      if (cache[p]) return cache[p].exports;
      var mod = { exports: {} };
      cache[p] = mod;
      var dir = p.indexOf('/') < 0 ? '' : p.slice(0, p.lastIndexOf('/'));
      var body = readText(p) + '\n//# sourceURL=/' + p;
      var fn = new Function('module', 'exports', 'require', '__filename', '__dirname', body);
      fn(mod, mod.exports, makeRequire(dir), p, dir);
      return mod.exports;
    };
  }

  function toast(text) {
    try { window.require('minigame/app.js').toast(text); } catch (e) {}
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text)['catch'](function () {});
      return;
    }
    try {                                  // http 下没有剪贴板接口，用老办法兜底
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    } catch (e) {}
  }

  // ---------- 2) 假的 wx：把边界上的接口搬过来 ----------
  var touchHandlers = { start: [], move: [], end: [], cancel: [] };
  var showHandlers = [];
  var hideHandlers = [];

  function toLocal(ev) {
    var rect = canvas.getBoundingClientRect();
    var t = (ev.touches && ev.touches.length) ? ev.touches[0] : ev;
    return {
      x: (t.clientX - rect.left) * (W / rect.width),
      y: (t.clientY - rect.top) * (H / rect.height)
    };
  }

  function fire(type, ev) {
    if (ev.cancelable) ev.preventDefault();
    var p = toLocal(ev);
    var touch = [{ clientX: p.x, clientY: p.y }];
    var list = touchHandlers[type];
    if (!list.length && type === 'cancel') list = touchHandlers.end;   // 没注册取消回调的就按抬起处理
    for (var i = 0; i < list.length; i++) list[i]({ touches: touch, changedTouches: touch });
  }

  if (window.PointerEvent) {
    canvas.addEventListener('pointerdown', function (e) {
      try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
      fire('start', e);
    });
    canvas.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'mouse' && !e.buttons) return;   // 鼠标划过不算拖动
      fire('move', e);
    });
    canvas.addEventListener('pointerup', function (e) { fire('end', e); });
    canvas.addEventListener('pointercancel', function (e) { fire('cancel', e); });
  } else {                                 // 老手机的兜底：触摸 + 鼠标
    canvas.addEventListener('touchstart', function (e) { fire('start', e); });
    canvas.addEventListener('touchmove', function (e) { fire('move', e); });
    canvas.addEventListener('touchend', function (e) { fire('end', e); });
    canvas.addEventListener('touchcancel', function (e) { fire('cancel', e); });
    canvas.addEventListener('mousedown', function (e) { fire('start', e); });
    canvas.addEventListener('mousemove', function (e) { if (e.buttons) fire('move', e); });
    canvas.addEventListener('mouseup', function (e) { fire('end', e); });
  }
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  document.addEventListener('visibilitychange', function () {
    var list = document.hidden ? hideHandlers : showHandlers;
    for (var i = 0; i < list.length; i++) list[i]({ query: query() });
  });
  window.addEventListener('pagehide', function () {
    for (var i = 0; i < hideHandlers.length; i++) hideHandlers[i]({ query: query() });
  });

  function query() {
    var q = {};
    var raw = String(location.search || '').replace(/^\?/, '');
    if (!raw) return q;
    var parts = raw.split('&');
    for (var i = 0; i < parts.length; i++) {
      var kv = parts[i].split('=');
      var k = decodeURIComponent(kv[0] || '');
      if (k) q[k] = decodeURIComponent((kv[1] || '').replace(/\+/g, ' '));
    }
    return q;
  }

  window.wx = {
    createCanvas: function () { return canvas; },
    getSystemInfoSync: function () {
      return {
        windowWidth: W, windowHeight: H, screenWidth: W, screenHeight: H,
        pixelRatio: dpr, platform: 'web',
        safeArea: { top: 0, bottom: H, left: 0, right: W }
      };
    },
    getMenuButtonBoundingClientRect: function () { return null; },   // 网页里没有右上角胶囊
    getLaunchOptionsSync: function () { return { query: query() }; },
    onTouchStart: function (fn) { touchHandlers.start.push(fn); },
    onTouchMove: function (fn) { touchHandlers.move.push(fn); },
    onTouchEnd: function (fn) { touchHandlers.end.push(fn); },
    onTouchCancel: function (fn) { touchHandlers.cancel.push(fn); },
    onShow: function (fn) { showHandlers.push(fn); },
    onHide: function (fn) { hideHandlers.push(fn); },
    onShareAppMessage: function () {},
    showShareMenu: function () {},
    // 网页里没有微信转发，改成把邀请链接复制到剪贴板
    shareAppMessage: function (o) {
      var url = location.origin + location.pathname + (o && o.query ? '?' + o.query : '');
      copyText(url);
      toast('邀请链接已复制，发给好友就能进房间');
    },
    vibrateShort: function () {
      try { if (navigator.vibrate) navigator.vibrate(15); } catch (e) {}
    },
    setClipboardData: function (o) {
      copyText((o && o.data) || '');
      toast('房间码已复制：' + ((o && o.data) || ''));
    },
    getStorageSync: function (k) {
      try { return localStorage.getItem(k) || ''; } catch (e) { return ''; }
    },
    setStorageSync: function (k, v) {
      try { localStorage.setItem(k, v); } catch (e) {}
    },
    removeStorageSync: function (k) {
      try { localStorage.removeItem(k); } catch (e) {}
    },
    // 有这个壳，services/cloud.js 就会认为「联机可用」；真正的联机走 web/net-web.js
    cloud: { init: function () {} }
  };

  // ---------- 3) 启动 ----------
  window.require = makeRequire('');
  try {
    window.require('minigame/app.js').start();   // 小程序的入口是 game.js，网页版直接起界面层
  } catch (e) {
    var msg = String((e && e.message) || e);
    view.fillStyle = '#10131F';
    view.fillRect(0, 0, W, H);
    view.fillStyle = '#E4574C';
    view.font = 'bold 20px sans-serif';
    view.fillText('网页版启动失败', 20, 80);
    view.fillStyle = '#F2F5FF';
    view.font = '14px sans-serif';
    for (var i = 0; i < msg.length; i += 26) {
      view.fillText(msg.substr(i, 26), 20, 120 + (i / 26) * 22);
    }
  }
})();
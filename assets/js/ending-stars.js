
/* ------------------------------------------------------------------
   尾声背景的星空：Canvas 2D 粒子
   - 星星按“深度”分层：移动鼠标时产生视差
   - 静止时整片星野统一往左上漂移，并各自呼吸闪烁
   - 只在尾声进入视口时跑 rAF，切后台自动暂停
   - prefers-reduced-motion：只画一帧静态星图，不做动画
   ------------------------------------------------------------------ */
/* ------------------------------------------------------------------
   尾声背景的星空：Canvas 2D 粒子
   - 星星按“深度”分层：移动鼠标时产生视差，指针靠近时被轻轻拨开并亮起
   - 常驻极慢上浮 + 呼吸闪烁；只在尾声进入视口时跑 rAF，切后台自动暂停
   - prefers-reduced-motion：只画一帧静态星图，不做动画
   ------------------------------------------------------------------ */
(function () {
'use strict';
var host = document.getElementById('ending');
if (!host) return;
var cv = host.querySelector('.ending-stars');
if (!cv || !cv.getContext) return;
var ctx = cv.getContext('2d');
if (!ctx) return;

var reduce = false;
try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

var W = 0, H = 0, dpr = 1, area0 = 0;
var stars = [];
var raf = 0, running = false, visible = false, last = 0, clock = 0;
var ptr = { x: 0, y: 0, tx: 0, ty: 0, on: false };
var glow = makeGlow();
/* 偶发流星：让静止时也有东西划过 */
var meteor = { wait: 5 + Math.random() * 7, life: 0, dur: 1.1, x: 0, y: 0, vx: 0, vy: 0 };

function makeGlow() {
  var s = document.createElement('canvas');
  s.width = s.height = 64;
  var g = s.getContext('2d');
  var rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  rg.addColorStop(0, 'rgba(255,255,255,1)');
  rg.addColorStop(0.18, 'rgba(226,236,255,.8)');
  rg.addColorStop(0.46, 'rgba(170,196,255,.2)');
  rg.addColorStop(1, 'rgba(120,150,255,0)');
  g.fillStyle = rg;
  g.fillRect(0, 0, 64, 64);
  return s;
}

function seed() {
  var count = Math.round(Math.min(380, Math.max(90, (W * H) / 6000)));
  stars = [];
  for (var i = 0; i < count; i++) {
    var depth = Math.pow(Math.random(), 1.6);    /* 大多数是小而远的点 */
    stars.push({
      x: Math.random(),
      y: Math.random(),
      r: 0.55 + depth * 1.15 + (Math.random() < 0.06 ? 0.9 : 0),
      a: 0.24 + Math.random() * 0.52 + depth * 0.16,
      tw: Math.random() * 6.283,
      ts: 0.6 + Math.random() * 1.1,
      sp: 6.0 + depth * 20.0,                    /* 每秒漂移的像素（越近越快） */
      depth: 0.15 + depth,
      warm: Math.random() < 0.1
    });
  }
}

function resize() {
  var box = host.getBoundingClientRect();
  var w = Math.round(box.width), h = Math.round(box.height);
  if (w < 40 || h < 120) return;                             /* 尺寸还没量出来时先不动 */
  var next = Math.min(1.5, window.devicePixelRatio || 1);     /* 星点是柔光，不必 2x */
  if (w * h * next * next > 7.2e6) next = 1;                  /* 超大屏兜底，避免画布过大 */
  if (w === W && h === H && next === dpr) return;
  var first = !W || !H || !stars.length;
  W = w; H = h; dpr = next;
  cv.width = Math.round(W * dpr);
  cv.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ptr.x = W * 0.5; ptr.y = H * 0.5;
  /* 位置是归一化的，尺寸变了不用重新撒点；只有第一次或面积差太多才重来 */
  if (first || !area0 || Math.abs(W * H - area0) > area0 * 0.6) { seed(); area0 = W * H; }
  draw(0, true);
}

function draw(dt, still) {
  if (!W || !H) return;
  ctx.clearRect(0, 0, W, H);

  /* 视线中心：指针进入时缓慢跟过去，移开后缓慢回到画面中心，全程无跳变 */
  var cx = ptr.x, cy = ptr.y;
  var parX = (cx - W * 0.5) * -0.016;
  var parY = (cy - H * 0.5) * -0.013;

  for (var i = 0; i < stars.length; i++) {
    var s = stars[i];
    if (!still) {
      /* 静止时整片星野统一往左上漂移；用取模回绕，位置分布永远是均匀的，
         不会像“跳到 1.02”那样把星点堆在边缘 */
      s.x -= (s.sp * 0.55 * dt) / W;
      s.y -= (s.sp * dt) / H;
      if (s.y < 0) s.y += 1;
      if (s.x < 0) s.x += 1;
    }
    var sx = s.x * W + parX * s.depth * 6;
    var sy = s.y * H + parY * s.depth * 6;

    var tw = still ? 1 : 0.62 + 0.38 * Math.sin(clock * 0.001 * s.ts + s.tw);
    var a = s.a * tw;
    if (a <= 0.012) continue;

    var g = s.r * 7.5;
    ctx.globalAlpha = a * 0.5;
    ctx.drawImage(glow, sx - g / 2, sy - g / 2, g, g);
    ctx.globalAlpha = a;
    ctx.fillStyle = s.warm ? 'rgb(255,236,206)' : 'rgb(226,236,255)';
    ctx.beginPath();
    ctx.arc(sx, sy, s.r * 0.85, 0, 6.2832);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  if (!still) drawMeteor(dt);
}

/* 一颗偶尔划过的流星：细长的尾巴 + 头部微光 */
function drawMeteor(dt) {
  if (meteor.life > 0) {
    meteor.life -= dt;
    meteor.x += meteor.vx * dt;
    meteor.y += meteor.vy * dt;
    var k = Math.max(0, meteor.life / meteor.dur);
    var tx = meteor.x - meteor.vx * 0.09;
    var ty = meteor.y - meteor.vy * 0.09;
    var grad = ctx.createLinearGradient(tx, ty, meteor.x, meteor.y);
    grad.addColorStop(0, 'rgba(190,214,255,0)');
    grad.addColorStop(0.7, 'rgba(214,230,255,' + (0.34 * k).toFixed(3) + ')');
    grad.addColorStop(1, 'rgba(236,244,255,' + (0.72 * k).toFixed(3) + ')');
    ctx.globalAlpha = 1;
    ctx.strokeStyle = grad;
    ctx.lineWidth = 1.25;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(meteor.x, meteor.y);
    ctx.stroke();

    var hg = 26 * (0.5 + k * 0.6);
    ctx.globalAlpha = 0.32 * k;
    ctx.drawImage(glow, meteor.x - hg / 2, meteor.y - hg / 2, hg, hg);
    ctx.globalAlpha = 1;
    if (meteor.life <= 0) meteor.wait = 6 + Math.random() * 9;
    return;
  }
  meteor.wait -= dt;
  if (meteor.wait > 0) return;

  /* 从画面左上或右上方向下斜切 */
  var dir = Math.random() < 0.5 ? 1 : -1;
  var sp = (0.32 + Math.random() * 0.22) * W;
  var ang = 0.42 + Math.random() * 0.22;
  meteor.x = (dir > 0 ? 0.12 + Math.random() * 0.35 : 0.55 + Math.random() * 0.33) * W;
  meteor.y = (0.06 + Math.random() * 0.28) * H;
  meteor.vx = Math.cos(ang) * sp * dir;
  meteor.vy = Math.sin(ang) * sp;
  meteor.dur = 0.9 + Math.random() * 0.5;
  meteor.life = meteor.dur;
}

function frame(now) {
  if (!running) return;
  raf = requestAnimationFrame(frame);
  var dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
  last = now;
  clock = now;
  /* 指针进/出都只是改变“视线中心”的目标，缓动过去，不会突变 */
  var aimX = ptr.on ? ptr.tx : W * 0.5;
  var aimY = ptr.on ? ptr.ty : H * 0.5;
  var k = Math.min(1, dt * 3.2);
  ptr.x += (aimX - ptr.x) * k;
  ptr.y += (aimY - ptr.y) * k;
  draw(dt, false);
}

function start() {
  if (reduce || running || !W) return;
  running = true;
  last = 0;
  raf = requestAnimationFrame(frame);
}
function stop() {
  running = false;
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
}

/* 指针：只关心落在尾声范围内的位置。
   pointermove 频率高于帧率，逐个事件读 getBoundingClientRect 会让整页范围的
   指针移动持续触发同步布局 —— 合并到一帧只读一次。 */
var moveEvent = null, moveQueued = false;
function onMove(e) {
moveEvent = e;
if (moveQueued) return;
moveQueued = true;
requestAnimationFrame(flushMove);
}
function flushMove() {
moveQueued = false;
var e = moveEvent;
moveEvent = null;
if (!e) return;
var box = host.getBoundingClientRect();
if (e.clientY < box.top - 120 || e.clientY > box.bottom + 120) { ptr.on = false; return; }
ptr.on = true;
ptr.tx = e.clientX - box.left;
ptr.ty = e.clientY - box.top;
if (reduce) { ptr.x = ptr.tx; ptr.y = ptr.ty; draw(0, true); }
}
window.addEventListener('pointermove', onMove, { passive: true });
window.addEventListener('pointerdown', onMove, { passive: true });
document.addEventListener('mouseleave', function () { ptr.on = false; });

resize();
cv.classList.add('is-live');

window.addEventListener('resize', resize, { passive: true });
window.addEventListener('orientationchange', resize, { passive: true });
if (window.ResizeObserver) new ResizeObserver(resize).observe(host);

if (window.IntersectionObserver) {
  new IntersectionObserver(function (entries) {
    visible = entries[0].isIntersecting;
    if (visible && !document.hidden) start(); else stop();
  }, { threshold: 0 }).observe(host);
} else {
  visible = true;
  start();
}

document.addEventListener('visibilitychange', function () {
  if (document.hidden) stop();
  else if (visible) start();
});

if (reduce) { clock = 0; draw(0, true); }
})();

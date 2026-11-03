
(function () {
'use strict';
if (!window.Legend) return;
var L = window.Legend;
var gsap = L.gsap, ST = L.ScrollTrigger;
var reduce = L.reduceMotion;
var docEl = document.documentElement;

/* ---------- 页眉：滚动变实底 + 产品子导航出现 ---------- */
var header = document.getElementById('site-header');
var heroEl = document.getElementById('hero');
var ticking = false;
function onScroll() {
if (!header || ticking) return;
ticking = true;
requestAnimationFrame(function () {
var y = window.pageYOffset || docEl.scrollTop || 0;
header.classList.toggle('is-scrolled', y > 16);
var threshold = heroEl ? heroEl.offsetHeight * 0.9 : window.innerHeight * 0.9;
header.classList.toggle('is-past-hero', y > threshold);
ticking = false;
});
}
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

/* ---------- Hero / LaserLink 滚动叙事（仅桌面 + 非 reduce） ---------- */
function initIntro() {
var intro = document.getElementById('intro');
if (!intro) return;
var phone = intro.querySelector('[data-hero-phone]');
var title = intro.querySelector('[data-hero-title]');
var heroFades = intro.querySelectorAll('[data-hero-fade]');
var laserEls = intro.querySelectorAll('[data-laser-el]');
var litImg = intro.querySelector('.hero-img--lit');
var flatImg = intro.querySelector('.hero-img--flat');
var darkImg = intro.querySelector('.hero-img--dark');
var turnEl = intro.querySelector('.hero-turn');
var straightDark = intro.querySelector('.hero-img--straight-dark');
var useSprite = false;
/* 预加载旋转序列帧；成功则启用真·3D 转身 */
if (turnEl && straightDark && phone) {
var probe = new Image();
probe.onload = function () {
useSprite = true;
phone.classList.add('use-sprite');
if (ST) ST.refresh();
};
/* 1×1 极小 WebP：这里只需要判断浏览器能否解码 WebP，
   原来拿 431KB 的 hero 旋转序列图当探测图，白存一份 base64 */
probe.src = 'assets/img/bb036c5c10.webp';
}

var veil = intro.querySelector('.hero-phone-veil');
var titleWords = title ? title.querySelectorAll('.hero-title-word') : [];

/* 竖屏 / 近方屏（与 CSS 的堆叠分支同一个条件）：
   这些视口下首屏是自然排布，不能再跑「钉屏 + 飞行」的滚动叙事，
   否则机身会被 timeline 推到画面外、文案也停在 opacity:0。 */
var stackedMQ = null;
try { stackedMQ = window.matchMedia('(min-width:769px) and (max-aspect-ratio:11/10)'); } catch (e) {}
function inStacked() { return !!(stackedMQ && stackedMQ.matches); }

/* 缓慢优雅的入场：光晕 → 手机 → 大标题字 → 副标题/眉题
用 fromTo+clearProps，避免与滚动叙事的 to() 互相抢最终态 */
function playEntrance(onDone) {
L.entranceStarted = true;
if (!gsap) { if (onDone) onDone(); return; }
var e = gsap.timeline({
defaults: { ease: 'power3.out' },
onComplete: function () {
/* 滚动叙事会立刻接管：不要 clearProps（会把 scrub 终点态打回可见） */
if (phone) gsap.set(phone, { clearProps: 'filter' });
if (titleWords.length) gsap.set(titleWords, { clearProps: 'filter' });
if (onDone) onDone();
}
});
e.fromTo('.intro-glow, .intro-grid, .intro-vignette',
{ autoAlpha: 0 },
{ autoAlpha: 1, duration: 1.8, stagger: 0.12, ease: 'power2.out' }, 0);
if (phone) {
e.fromTo(phone,
{ autoAlpha: 0, y: 56, scale: 1.045, filter: 'blur(10px)' },
{ autoAlpha: 1, y: 0, scale: 1, filter: 'blur(0px)', duration: 2.1, ease: 'power2.out' }, 0.18);
}
if (titleWords.length) {
e.fromTo(titleWords,
{ autoAlpha: 0, y: 34, filter: 'blur(14px)' },
{ autoAlpha: 1, y: 0, filter: 'blur(0px)', duration: 1.55, stagger: 0.22, ease: 'power3.out' }, 0.48);
}
if (heroFades && heroFades.length) {
e.fromTo(heroFades,
{ autoAlpha: 0, y: 18 },
{ autoAlpha: 1, y: 0, duration: 1.25, stagger: 0.14, ease: 'power2.out' }, 1.05);
}
}

/* 移动端 / reduced motion：CSS 已改为自然排布，只做缓慢入场 */
if (reduce) { L.entranceStarted = true; return; }
if (L.isMobile() || inStacked() || !gsap || !ST) {
playEntrance();
return;
}

gsap.set(laserEls, { autoAlpha: 0, y: 46 });
if (litImg) gsap.set(litImg, { autoAlpha: 1 });
if (flatImg) gsap.set(flatImg, { autoAlpha: 0 });
if (darkImg) gsap.set(darkImg, { autoAlpha: 0 });
if (veil) gsap.set(veil, { opacity: 0 });

/* 入场播完后再挂上滚动叙事，避免 from/to 抢状态 */
var introTL = null;
function setupScroll() {
if (inStacked()) return;
gsap.set(laserEls, { autoAlpha: 0, y: 46 });
/* 入场刚结束时副标题仍是可见：先归位，再交给 scrub 控制 */
if (heroFades && heroFades.length) gsap.set(heroFades, { autoAlpha: 1, y: 0, clearProps: 'transform' });
if (title) gsap.set(title, { autoAlpha: 1, yPercent: 0, clearProps: 'transform,filter' });
if (litImg) gsap.set(litImg, { autoAlpha: 1 });
if (flatImg) gsap.set(flatImg, { autoAlpha: 0 });
if (darkImg) gsap.set(darkImg, { autoAlpha: 0 });
if (veil) gsap.set(veil, { opacity: 0 });

var tl = gsap.timeline({
defaults: { ease: 'none' },
scrollTrigger: {
trigger: intro,
start: 'top top',
end: 'bottom bottom',
scrub: 0.45,
invalidateOnRefresh: true,
/* invalidateOnRefresh 会在刷新时把「当前样式」当成补间起点。
   如果刷新发生在页面中段（旋转屏幕 / 图片加载 / ScrollTrigger.refresh），
   起点就变成"已隐藏"，回到顶部后标题与副标题会永远不出现。
   刷新前先把叙事复位到 progress 0 的状态，让起点始终是"可见"。 */
onRefreshInit: function () {
gsap.set(heroFades, { autoAlpha: 1, y: 0 });
if (title) gsap.set(title, { autoAlpha: 1, yPercent: 0, filter: 'none' });
if (phone) gsap.set(phone, { x: 0, y: 0, scale: 1, autoAlpha: 1 });
gsap.set(laserEls, { autoAlpha: 0, y: 46, x: 0 });
if (litImg) gsap.set(litImg, { autoAlpha: 1, rotationY: 0, scale: 1, filter: 'none' });
if (flatImg) gsap.set(flatImg, { autoAlpha: 0, rotationY: 55 });
if (darkImg) gsap.set(darkImg, { autoAlpha: 0 });
if (straightDark) gsap.set(straightDark, { autoAlpha: 0 });
if (veil) gsap.set(veil, { opacity: 0 });
},
onUpdate: function (self) {
var p = self.progress;
/* 说明：这里不再用 gsap.set 强制隐藏标题/副标题。
   强制写在 refresh 时可能拿到过期的 progress（渲染已回到 0，opacity 却被写成 0），
   刷新一次首屏就永久空白。标题/副标题的淡出已改成 fromTo，起点写死为可见，
   scrub 追帧足够快，不需要额外的强制收尾。 */
if (phone) phone.classList.toggle('is-flat', p > 0.40);
if (useSprite && phone && turnEl) {
var turning = p > 0.235 && p < 0.47;
phone.classList.toggle('turn-mode', turning);
phone.classList.toggle('turn-done', p >= 0.47);
if (turning) {
var t = (p - 0.245) / (0.47 - 0.245);
var f = Math.max(0, Math.min(11, Math.round(t * 11)));
var col = f % 4, row = (f - col) / 4;
turnEl.style.backgroundPosition = (col * 33.3333).toFixed(3) + '% ' + (row * 50).toFixed(3) + '%';
}
}
var on = p > 0.50;
if (on !== intro.classList.contains('is-laser')) {
intro.classList.toggle('is-laser', on);
intro.removeAttribute('data-aim');
}
}
}
});

introTL = tl;

/* 标题/副标题用 fromTo 写死"可见"起点：
   这样 invalidateOnRefresh 重新记录起点时也不会把"已隐藏"当成起点，
   回到顶部 / 旋转屏幕后文字一定能回来。 */
if (title) tl.fromTo(title,
{ autoAlpha: 1, yPercent: 0, filter: 'blur(0px)' },
{ autoAlpha: 0, yPercent: -8, filter: 'blur(10px)', duration: 0.2, immediateRender: false }, 0);
if (heroFades && heroFades.length) tl.fromTo(heroFades,
{ autoAlpha: 1, y: 0 },
{ autoAlpha: 0, y: -14, duration: 0.16, stagger: 0.02, immediateRender: false }, 0);
if (phone) tl.to(phone, { scale: 0.8, x: function () { return -window.innerWidth * 0.27; }, y: '-2.9vh', duration: 0.46, ease: 'power1.inOut' }, 0.06);
if (litImg) tl.to(litImg, { rotationY: -55, autoAlpha: 0, scale: 0.965, filter: 'blur(5px)', duration: 0.14, ease: 'power1.in', transformOrigin: '50% 50%' }, 0.24);
if (flatImg) tl.fromTo(flatImg, { rotationY: 55, autoAlpha: 0, scale: 0.965, filter: 'blur(6px)' }, { rotationY: 0, autoAlpha: 1, scale: 1, filter: 'blur(0px)', duration: 0.15, ease: 'power2.out', transformOrigin: '50% 50%' }, 0.32);
/* 逐渐变黑：面纱 + 亮图亮度线性压暗，再长交叉到暗部图 */
if (veil) tl.fromTo(veil, { opacity: 0 }, { opacity: 1, duration: 0.5, ease: 'none' }, 0.22);
if (flatImg) {
tl.to(flatImg, { filter: 'brightness(.55) saturate(.55)', duration: 0.22, ease: 'none' }, 0.28);
tl.to(flatImg, { autoAlpha: 0, duration: 0.4, ease: 'sine.inOut' }, 0.4);
}
if (darkImg) tl.to(darkImg, { autoAlpha: 1, duration: 0.4, ease: 'sine.inOut' }, 0.4);
if (straightDark) tl.fromTo(straightDark, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.36, ease: 'sine.inOut' }, 0.42);
tl.to(laserEls, { autoAlpha: 1, y: 0, duration: 0.22, stagger: 0.04, ease: 'power2.out' }, 0.48);
if (phone) tl.to(phone, { x: function () { return -window.innerWidth * 0.82; }, autoAlpha: 0, duration: 0.3, ease: 'power2.in' }, 0.74);
tl.to(laserEls, { x: function () { return window.innerWidth * 0.34; }, autoAlpha: 0, duration: 0.28, stagger: 0.02, ease: 'power2.in' }, 0.76);
}

var scrollArmed = false;
function armScroll() {
if (scrollArmed) return;
scrollArmed = true;
setupScroll();
if (ST) ST.refresh();
}
playEntrance(armScroll);
setTimeout(armScroll, 2600);

/* 宽高比跨越 1.1（旋转设备 / 拖窗口）：在叙事与堆叠之间切换，
   只停用 / 恢复 ScrollTrigger，不重建 timeline，避免重复绑定。 */
if (stackedMQ && stackedMQ.addEventListener) {
stackedMQ.addEventListener('change', function () {
var stacked = inStacked();
intro.classList.remove('is-laser');
intro.removeAttribute('data-aim');
if (stacked) {
if (introTL && introTL.scrollTrigger) introTL.scrollTrigger.disable(false);
if (gsap) {
if (phone) gsap.set(phone, { clearProps: 'transform,filter,opacity,visibility' });
if (titleWords && titleWords.length) gsap.set(titleWords, { clearProps: 'filter,opacity,visibility,transform' });
if (heroFades && heroFades.length) gsap.set(heroFades, { autoAlpha: 1, y: 0, clearProps: 'transform' });
if (title) gsap.set(title, { autoAlpha: 1, yPercent: 0, clearProps: 'transform,filter' });
if (laserEls && laserEls.length) gsap.set(laserEls, { autoAlpha: 1, y: 0, x: 0 });
if (litImg) gsap.set(litImg, { autoAlpha: 1, rotationY: 0, scale: 1, filter: 'none' });
if (flatImg) gsap.set(flatImg, { autoAlpha: 0 });
if (darkImg) gsap.set(darkImg, { autoAlpha: 0 });
if (straightDark) gsap.set(straightDark, { autoAlpha: 0 });
if (veil) gsap.set(veil, { opacity: 0 });
}
if (phone) phone.classList.remove('is-flat', 'turn-mode', 'turn-done');
} else if (introTL && introTL.scrollTrigger) {
introTL.scrollTrigger.enable(true);
}
if (ST) ST.refresh();
});
}

/* Laser 阶段：机身可随意水平拖动旋转（rotationY），松手保持角度 */
var laserDrag = { active: false, id: null, x: 0, startYaw: 0, yaw: 0 };

/* 鼠标微视差：手机随指针轻微倾斜（只在首屏阶段） */
if (!window.matchMedia('(hover:none)').matches && phone) {
var rx = gsap.quickTo(phone, 'rotationX', { duration: 0.9, ease: 'power3' });
var ry = gsap.quickTo(phone, 'rotationY', { duration: 0.9, ease: 'power3' });
intro.addEventListener('pointermove', function (e) {
if (intro.classList.contains('is-laser')) return;
if (laserDrag.active) return;
var nx = (e.clientX / window.innerWidth - 0.5) * 2;
var ny = (e.clientY / window.innerHeight - 0.5) * 2;
rx(-ny * 3.0);
ry(nx * 4.0);
}, { passive: true });
}

if (phone) {
var yawTo = gsap ? gsap.quickTo(phone, 'rotationY', { duration: 0.45, ease: 'power3.out' }) : null;
function applyYaw(v) {
laserDrag.yaw = v;
if (yawTo) yawTo(v);
else phone.style.transform = 'rotateY(' + v + 'deg)';
}
phone.addEventListener('pointerdown', function (e) {
if (!intro.classList.contains('is-laser')) return;
if (e.button != null && e.button > 0) return;
laserDrag.active = true;
laserDrag.id = e.pointerId;
laserDrag.x = e.clientX;
laserDrag.startYaw = laserDrag.yaw;
phone.classList.add('is-drag-rot');
try { phone.setPointerCapture(e.pointerId); } catch (err) {}
});
phone.addEventListener('pointermove', function (e) {
if (!laserDrag.active || e.pointerId !== laserDrag.id) return;
var dx = e.clientX - laserDrag.x;
applyYaw(laserDrag.startYaw + dx * 0.22);
if (e.cancelable) e.preventDefault();
});
function endLaserDrag(e) {
if (!laserDrag.active) return;
if (e && e.pointerId !== undefined && e.pointerId !== laserDrag.id) return;
laserDrag.active = false;
laserDrag.id = null;
phone.classList.remove('is-drag-rot');
}
phone.addEventListener('pointerup', endLaserDrag);
phone.addEventListener('pointercancel', endLaserDrag);
phone.addEventListener('lostpointercapture', endLaserDrag);
}
}

/* ---------- 鼠标只影响 LaserLink 环的发光方向 ---------- */
function initRingAim() {
if (reduce || !gsap) return;
if (window.matchMedia('(hover:none)').matches) return;
var intro = document.getElementById('intro');
var ring = intro && intro.querySelector('.hero-phone .laser-ring');
if (!intro || !ring) return;
var AIM_EASE = 0.18;   // 每帧向目标角度收敛的比例
var AIM_EPS = 0.08;    // 收敛阈值（deg）：小于它直接停帧
var target = -90, current = -90, running = false;
var px = 0, py = 0, pending = false;

/* 环心只在「真有指针移动」的那一帧读一次：旧写法在 pointermove 里
   getBoundingClientRect()，而且 tick 一旦启动就永不停止 —— 首次移动之后
   整页会一直每帧写一次 style，每次移动还多一次同步布局。 */
function tick() {
if (pending) {
pending = false;
var r = ring.getBoundingClientRect();
if (r.width) {
var cx = r.left + r.width / 2;
var cy = r.top + r.height / 2;
/* atan2 角度 + 90°：0deg 为环上方，顺时针为正 */
var a = Math.atan2(py - cy, px - cx) * 180 / Math.PI + 90;
/* 角度解包：始终走最短路径，绕环旋转不会在 ±180° 处瞬移回初始 */
var d = a - (target % 360);
while (d > 180) d -= 360;
while (d < -180) d += 360;
target += d;
}
}
current += (target - current) * AIM_EASE;
if (Math.abs(target - current) < AIM_EPS) {
current = target;
ring.style.setProperty('--aim', current.toFixed(2) + 'deg');
running = false;
return;
}
ring.style.setProperty('--aim', current.toFixed(2) + 'deg');
requestAnimationFrame(tick);
}

function onMove(e) {
if (!intro.classList.contains('is-laser')) return;
px = e.clientX;
py = e.clientY;
pending = true;
if (!running) { running = true; requestAnimationFrame(tick); }
}
window.addEventListener('pointermove', onMove, { passive: true });
}

/* ---------- 01/02/03 悬停：左侧环高光同步换色 ---------- */
function initAimTone() {
var intro = document.getElementById('intro');
if (!intro) return;
var mods = intro.querySelectorAll('.laser-mod[data-tone]');
Array.prototype.forEach.call(mods, function (el) {
var tone = el.getAttribute('data-tone');
function setTone() { intro.setAttribute('data-aim', tone); }
function unsetTone() {
if (intro.getAttribute('data-aim') === tone) intro.removeAttribute('data-aim');
}
el.addEventListener('pointerenter', setTone);
el.addEventListener('pointerleave', unsetTone);
});
}

/* ---------- 尾声：逐行揭幕 ---------- */
function initEnding() {
var ending = document.getElementById('ending');
if (!ending || !gsap || !ST || reduce) { L.reveal(ending); return; }
var word = ending.querySelector('.ending-word');
if (word) {
gsap.fromTo(word, { yPercent: 12, autoAlpha: 0 }, {
yPercent: 0, autoAlpha: 1, duration: 1.4, ease: 'power3.out',
scrollTrigger: { trigger: ending, start: 'top 70%', once: true }
});
}
/* 标题只交给 L.reveal 播一次：以前这里另起了一个 gsap.from(title)，
   和 L.reveal 里的 fromTo 抢同一个元素，快速跳到底部时会卡在半透明状态 */
L.reveal(ending);
}

/* ---------- 资源就绪：跑注册的回调 + 刷新 ScrollTrigger ---------- */
function boot() {
var ran = false;
function run() {
if (ran) return; ran = true;
L._refresh.forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } });
if (ST) ST.refresh();
}
window.addEventListener('load', function () { setTimeout(run, 80); });
if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { setTimeout(run, 120); });
setTimeout(run, 2500); /* 兜底：图片可能很慢 */

/* 图片加载完成后再次刷新（懒加载图会改变布局高度） */
var imgs = document.images;
for (var i = 0; i < imgs.length; i++) {
if (imgs[i].loading === 'lazy') continue;
if (!imgs[i].complete) imgs[i].addEventListener('load', function () { if (ST) ST.refresh(); }, { once: true });
}
}

function start() {
initIntro();
initRingAim();
initAimTone();
initEnding();
boot();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
})();


(function () {
'use strict';

/* 兼容主壳 Legend API 可能晚于 fragment 定义的情况 */
function boot() {
if (!window.Legend) return;
var L = window.Legend;
var gsap = L.gsap;
var ST = L.ScrollTrigger;
var root = document.getElementById('more');
if (!root) return;

L.reveal(root);
initGrip3D(root);
initAudioReveal(root);

var band = root.querySelector('.s8-band');
var track = root.querySelector('.s8-band-track');
var rows = Array.prototype.slice.call(root.querySelectorAll('.s8-row'));
var counters = Array.prototype.slice.call(root.querySelectorAll('[data-count]'));
var isMobile = L.isMobile();

/* 无 GSAP / 减弱动效：静态呈现（HTML 内已是最终数值） */
if (!gsap || !ST || L.reduceMotion) return;

/* ---------- 1. 横向卡带：滚动时整条索引横向缓移 ---------- */
if (band && track && !isMobile) {
gsap.fromTo(track, { xPercent: 3 }, {
xPercent: -5,
ease: 'none',
scrollTrigger: {
trigger: band,
start: 'top bottom',
end: 'bottom top',
scrub: 0.6
}
});
}

/* ---------- 2. 文案侧滑入场 + 图片视差（与 S6 的滚动叙事区分） ---------- */
rows.forEach(function (row, i) {
var copy = row.querySelector('.s8-copy');
var mediaWrap = row.querySelector('.s8-media-wrap');
var index = row.querySelector('.s8-index');
var dir = row.classList.contains('s8-row--flip') ? 1 : -1;
var dist = isMobile ? 26 : 52;

if (copy) {
gsap.fromTo(copy, { autoAlpha: 0, x: dir * dist }, {
autoAlpha: 1, x: 0,
duration: 0.95,
ease: 'power3.out',
scrollTrigger: { trigger: row, start: 'top 78%', once: true }
});
}
if (index) {
gsap.fromTo(index, { autoAlpha: 0, y: 22 }, {
autoAlpha: 1, y: 0,
duration: 1,
ease: 'power3.out',
delay: 0.1,
scrollTrigger: { trigger: row, start: 'top 78%', once: true }
});
}
/* 图片视差：桌面端缓慢反向漂移，移动端关闭以免抖动；摄影手柄那格交给 3D，不做视差 */
if (mediaWrap && !isMobile && !row.classList.contains('s8-row--grip')) {
gsap.fromTo(mediaWrap, { y: 30 + i * 4 }, {
y: -30 - i * 4,
ease: 'none',
scrollTrigger: {
trigger: row,
start: 'top bottom',
end: 'bottom top',
scrub: 0.8
}
});
}
});

/* ---------- 3. 数据点数字滚动 ---------- */
function fmt(num, prefix, suffix) {
var n = Math.round(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
return prefix + n + (suffix ? ' ' + suffix : '');
}

counters.forEach(function (el) {
var target = parseFloat(el.getAttribute('data-count'));
if (isNaN(target)) return;
var prefix = el.getAttribute('data-prefix') || '';
var suffix = el.getAttribute('data-suffix') || '';
var state = { v: 0 };

/* 初始就渲染最终值，滚动到跟前时从 0 滚上去 */
el.textContent = fmt(target, prefix, suffix);

gsap.to(state, {
v: target,
duration: 1.15,
ease: 'power2.out',
scrollTrigger: { trigger: el, start: 'top 88%', once: true },
onUpdate: function () {
el.textContent = fmt(state.v, prefix, suffix);
}
});
});
}

/* ---------- 4. 摄影手柄：钉住这一屏，原地翻面，左侧文案换成拓展坞，翻完再继续下滑 ---------- */
function initGrip3D(scope) {
var row = scope.querySelector('.s8-row--grip');
if (!row) return;
var mount = row.querySelector('[data-grip3d-mount]');
var copyA = row.querySelector('[data-copy-a]');
var copyB = row.querySelector('[data-copy-b]');
if (!mount || !copyA || !copyB) return;
if (!window.LegendGripView || !window.Legend3D || !window.GRIP_GLB_B64) return;

var reduce = false;
try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
var ST = (window.Legend && window.Legend.ScrollTrigger) || window.ScrollTrigger;
var gs = (window.Legend && window.Legend.gsap) || window.gsap;

var view = null;
try {
view = window.LegendGripView.create(mount, {
onLive: function () { row.classList.add('is-3d'); }
});
} catch (e) {
view = null;
}
if (!view) return;

function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }

/* 只有「钉住 + 原地翻面」时才做两套文案的交叉淡入淡出。
   窄屏不钉屏时，第二套文案如果仍被写成 opacity:0，就会留下一大块空白
   （19.5:9 / 平板竖屏上滚到「4 类接口」后面全是空的）。 */
var pinned = false;
function clearCopy() {
copyA.style.opacity = '';
copyB.style.opacity = '';
copyA.style.pointerEvents = '';
copyB.style.pointerEvents = '';
copyA.removeAttribute('aria-hidden');
copyB.removeAttribute('aria-hidden');
}

/* t: 0 → 1 的整段进度。前 62% 翻面，48%~64% 之间换文案 */
function render(t) {
view.setProgress(clamp01(t / 0.62));
if (!pinned) return;
var outA = clamp01((t - 0.46) / 0.12);
var inB = clamp01((t - 0.50) / 0.12);
copyA.style.opacity = (1 - outA).toFixed(3);
copyB.style.opacity = inB.toFixed(3);
copyA.style.pointerEvents = outA > 0.5 ? 'none' : '';
copyB.style.pointerEvents = inB > 0.5 ? '' : 'none';
copyA.setAttribute('aria-hidden', outA > 0.5 ? 'true' : 'false');
copyB.setAttribute('aria-hidden', inB > 0.5 ? 'false' : 'true');
row.classList.toggle('is-flipped', t > 0.62);
}

clearCopy();

/* 减弱动效 / 没有 ScrollTrigger：静态呈现（两套文案都可见，交给 CSS 竖排） */
if (!ST || reduce) {
row.classList.add('is-no-pin');
row.classList.remove('is-3d');
view.setProgress(0);
return;
}

var mm = gs && gs.matchMedia ? gs.matchMedia() : null;
if (mm) {
mm.add('(min-width: 1025px)', function () {
pinned = true;
clearCopy();
ST.create({
trigger: row,
start: 'center center',
end: '+=140%',
pin: row,
pinSpacing: true,
scrub: 0.6,
anticipatePin: 1,
onUpdate: function (self) { render(self.progress); }
});
/* 两套文案在同一格里叠放，清掉内联后要先按 progress 0 摆好，
   否则钉屏建立到第一次 onUpdate 之间会同时出现两段文字 */
render(0);
return function () { pinned = false; clearCopy(); };
});
mm.add('(max-width: 1024px)', function () {
/* 窄屏不钉屏：模型跟着本行滚过时转一下，文案两套都读得到 */
pinned = false;
clearCopy();
ST.create({
trigger: row,
start: 'top 72%',
end: 'top top+=80',
scrub: 0.6,
onUpdate: function (self) {
view.setProgress(clamp01(self.progress / 0.75));
row.classList.toggle('is-flipped', self.progress > 0.75);
}
});
});
} else {
pinned = true;
ST.create({
trigger: row,
start: 'center center',
end: '+=140%',
pin: row,
pinSpacing: true,
scrub: 0.6,
onUpdate: function (self) { render(self.progress); }
});
}
}

/* ---------- 5. 开放音频生态：整块向上浮出（文案逐条升起，产品图晚一步跟上） ---------- */
function initAudioReveal(scope) {
var panel = scope.querySelector('.s8-audio');
if (!panel) return;
var gsap = (window.Legend && window.Legend.gsap) || window.gsap;
var ST = (window.Legend && window.Legend.ScrollTrigger) || window.ScrollTrigger;
var reduce = false;
try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
if (!gsap || !ST || reduce) return;

var parts = ['.s8-kicker', '.s8-audio-title', '.s8-audio-lede', '.s8-audio-list', '.s8-audio-note']
.map(function (sel) { return panel.querySelector(sel); })
.filter(Boolean);
var media = panel.querySelector('.s8-audio-media');

gsap.fromTo(parts, { autoAlpha: 0, y: 44 }, {
autoAlpha: 1,
y: 0,
duration: .9,
ease: 'power3.out',
stagger: .09,
scrollTrigger: { trigger: panel, start: 'top 84%', once: true }
});

if (media) {
gsap.fromTo(media, { autoAlpha: 0, y: 64 }, {
autoAlpha: 1,
y: 0,
duration: 1.15,
ease: 'power3.out',
delay: .16,
scrollTrigger: { trigger: panel, start: 'top 84%', once: true }
});
}
}

/* 外链依赖（grip.glb.b64 / grip-view）已改为 defer：等 DOMContentLoaded，
   那时 window.GRIP_GLB_B64 / LegendGripView 一定已就绪（原来靠脚本顺序同步保证） */
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
})();


/* ------------------------------------------------------------------
window.Legend：给各区块脚本使用的公共 API
- 入场动画统一入口 L.reveal(scope)
- 图片/字体就绪后统一 L.onRefresh(fn) + ScrollTrigger.refresh()
- 依赖 GSAP（CDN 加载失败时自动降级为静态显示）
页面级脚本（页眉/首屏叙事/尾声）在 body 末尾，见页面底部脚本
------------------------------------------------------------------ */
(function () {
'use strict';
var reduce = false;
try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
var Legend = window.Legend = window.Legend || {};
Legend.gsap = window.gsap || null;
Legend.ScrollTrigger = window.ScrollTrigger || null;
Legend.reduceMotion = reduce;
Legend.isMobile = function () { return window.innerWidth <= 768; };
Legend._refresh = [];

/* 调试句柄集合：原来散落在 window.__ORBIT / __FLIP / __S7viewer 上，
   统一收到 Legend.debug 里，不在全局命名空间留脏变量 */
Legend.debug = {};
Legend.debugSet = function (name, obj) { Legend.debug[name] = obj; return obj; };

/* 注册"资源就绪后"回调 */
Legend.onRefresh = function (fn) { if (typeof fn === 'function') Legend._refresh.push(fn); };

/* 统一入场：[data-reveal] 的元素依次淡入上浮 */
Legend.reveal = function (scope, opts) {
opts = opts || {};
var root = scope || document;
var els = root.querySelectorAll('[data-reveal]');
if (!els.length) return;
var gsap = Legend.gsap, ST = Legend.ScrollTrigger;
if (!gsap || !ST || reduce) {
for (var i = 0; i < els.length; i++) {
els[i].style.opacity = '1';
els[i].style.transform = 'none';
}
return;
}
var y = opts.y != null ? opts.y : 28;
var dur = opts.duration || 0.9;
var start = opts.start || 'top 84%';
Array.prototype.forEach.call(els, function (el, i) {
/* 同一个元素只播一次：重复调用 reveal() 时两个 tween 会互相 overwrite，
   快速滚动/跳转时会卡在中间透明度（尾声大字曾因此“消失”） */
if (el.getAttribute('data-revealed') === '1') return;
el.setAttribute('data-revealed', '1');
var delay = parseFloat(el.getAttribute('data-reveal-delay') || '0') || (opts.stagger ? i * opts.stagger : 0);
gsap.fromTo(el, { y: y, autoAlpha: 0 }, {
y: 0, autoAlpha: 1, duration: dur, ease: 'power3.out', delay: delay, overwrite: 'auto',
scrollTrigger: { trigger: el, start: start, once: true },
onComplete: function () {
/* 播完就把 will-change 收回：常驻合成层会让 background-clip:text 的渐变字偶发不重绘 */
el.style.willChange = 'auto';
}
});
});
watch(els);
};

/* 兜底：布局高度变化（图片懒加载、宽高比切换）后 ScrollTrigger 的 start
   可能落在视口之外，元素就永远停在 opacity:0（“滚动字样没有动画”）。
   这里在资源稳定后扫一遍：已经进入视口却仍是完全透明的，直接显示。 */
var watched = [];
function watch(els) {
for (var i = 0; i < els.length; i++) if (watched.indexOf(els[i]) < 0) watched.push(els[i]);
}
function sweep() {
if (!watched.length) return;
var vh = window.innerHeight || 0;
for (var i = watched.length - 1; i >= 0; i--) {
var el = watched[i];
if (!el || !el.parentNode) { watched.splice(i, 1); continue; }
var r = el.getBoundingClientRect();
if (r.bottom < -vh || r.top > vh * 1.25) continue;   /* 还远在视口外，留给 ScrollTrigger */
var op = 1;
try { op = parseFloat(window.getComputedStyle(el).opacity); } catch (e) {}
if (!(op < 0.05)) { watched.splice(i, 1); continue; }
if (Legend.gsap && Legend.gsap.isTweening && Legend.gsap.isTweening(el)) continue;
if (Legend.gsap) Legend.gsap.set(el, { autoAlpha: 1, y: 0, clearProps: 'transform' });
else { el.style.opacity = '1'; el.style.transform = 'none'; }
watched.splice(i, 1);
}
}
Legend.sweepReveals = sweep;
if (typeof window !== 'undefined') {
window.addEventListener('load', function () { setTimeout(sweep, 2200); });
if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { setTimeout(sweep, 1800); });
setTimeout(sweep, 5200);
}

/* 区块首次进入视口时执行一次 */
Legend.onEnter = function (scope, fn) {
if (!Legend.ScrollTrigger || !scope) return;
Legend.ScrollTrigger.create({
trigger: scope, start: 'top 72%', once: true,
onEnter: function () { try { fn(); } catch (e) { console.error('[Legend.onEnter]', e); } }
});
};

/* 按字符拆分（返回 span 数组，供标题做逐字动效） */
Legend.splitChars = function (el) {
if (!el) return [];
var text = el.textContent || '';
el.textContent = '';
var spans = [];
for (var i = 0; i < text.length; i++) {
var s = document.createElement('span');
s.className = 'lg-char';
s.style.display = 'inline-block';
s.textContent = text[i] === ' ' ? '\u00a0' : text[i];
el.appendChild(s);
spans.push(s);
}
return spans;
};
})();

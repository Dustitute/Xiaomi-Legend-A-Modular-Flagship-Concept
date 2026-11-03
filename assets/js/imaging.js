
(function () {
'use strict';

function init() {
if (!window.Legend) return;
var L = window.Legend;
var root = document.getElementById('imaging');
if (!root) return;

// 头部与尾注统一入场
L.reveal(root);

var gsap = L.gsap || window.gsap;
var ST = L.ScrollTrigger || window.ScrollTrigger;
if (!gsap || !ST || L.reduceMotion) return;

var panels = root.querySelectorAll('.s5-panel');
var compare = root.querySelector('.s5-panels');
var seamLine = root.querySelector('.s5-seam-line');
var vs = root.querySelector('.s5-seam-vs');
if (!compare || panels.length < 2) return;

var mobile = window.matchMedia('(max-width: 900px)').matches;
var tl = gsap.timeline({
scrollTrigger: { trigger: compare, start: 'top 80%', once: true }
});

if (mobile) {
// 移动端：两张样张纵向错开浮入
tl.from(panels, { opacity: 0, y: 32, duration: .9, stagger: .14, ease: 'power3.out' });
} else {
// 桌面端：左右相向滑入，中缝发光线由中间向两端生长
tl.fromTo(panels[0], { x: -64, opacity: 0 }, { x: 0, opacity: 1, duration: 1.05, ease: 'power3.out' }, 0);
tl.fromTo(panels[1], { x: 64, opacity: 0 }, { x: 0, opacity: 1, duration: 1.05, ease: 'power3.out' }, 0);
if (seamLine) {
tl.fromTo(seamLine, { scaleY: 0 }, { scaleY: 1, duration: 1.2, ease: 'power2.inOut' }, .12);
}
if (vs) {
tl.fromTo(vs, { scale: .6, opacity: 0 }, { scale: 1, opacity: 1, duration: .6, ease: 'power2.out' }, .62);
}
}
}

// 主壳的 Legend API 可能在 fragment 之后才执行：等 DOM 就绪再初始化，
// 避免 window.Legend 尚未定义时直接 return 导致 [data-reveal] 一直不可见。
function boot() {
if (window.Legend) return init();
window.addEventListener('load', init, { once: true });
}
if (document.readyState === 'loading') {
document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
boot();
}
})();


(function () {
'use strict';
function init() {
if (!window.Legend) return;
var L = window.Legend;
var root = document.getElementById('phone-body');
if (!root) return;
L.reveal(root);

/* 声波中心：CSS 变量 --wave-x / --wave-y 控制（同步到 SVG circle 的 cx / cy） */
var wave = root.querySelector('.s9-media--wave');
if (wave) {
var rings = wave.querySelectorAll('.s9-wave-ring');
var syncWave = function () {
var cs = window.getComputedStyle(wave);
var x = (cs.getPropertyValue('--wave-x') || '66%').trim() || '66%';
var y = (cs.getPropertyValue('--wave-y') || '40%').trim() || '40%';
Array.prototype.forEach.call(rings, function (c) {
c.setAttribute('cx', x);
c.setAttribute('cy', y);
});
};
syncWave();
}

/* 鼠标跟随边缘光 */
if (window.matchMedia('(hover: none)').matches) return;
var cards = root.querySelectorAll('.s9-glow-card');
Array.prototype.forEach.call(cards, function (card) {
/* 卡片矩形按「滚动位置」缓存：鼠标在卡片上来回移动时不再逐个事件读布局 */
var cRect = null, cRectY = -1;
card.addEventListener('pointermove', function (e) {
if (!cRect || cRectY !== window.pageYOffset) {
cRect = card.getBoundingClientRect();
cRectY = window.pageYOffset;
}
card.style.setProperty('--mx', (e.clientX - cRect.left) + 'px');
card.style.setProperty('--my', (e.clientY - cRect.top) + 'px');
}, { passive: true });
card.addEventListener('pointerleave', function () {
card.style.setProperty('--mx', '50%');
card.style.setProperty('--my', '50%');
}, { passive: true });
});
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
})();


(function () {
'use strict';

/* 兼容主壳 Legend API 可能晚于 fragment 定义的情况 */
function boot() {
if (!window.Legend) return;
var L = window.Legend;
var root = document.getElementById('print');
if (!root) return;

L.reveal(root);

var asm = root.querySelector('.s7-asm');
var stage = root.querySelector('.s7-asm-stage');
var canvas = root.querySelector('.s7-asm-canvas');
if (!asm || !stage || !canvas) return;

var isMobile = L.isMobile ? L.isMobile() : window.matchMedia('(max-width: 768px)').matches;
var canRender = !!(window.WebGLRenderingContext);
/* 手机 / 减弱动效 / 无 WebGL：保留静态海报，连 2MB 模型都不下载 */
var want3D = !isMobile && !L.reduceMotion && canRender;

var DEPS = {
bundle: 'assets/vendor/legend-3d-bundle.js',
draco: 'assets/vendor/draco/draco_decoder.js',
models: 'assets/print/models.js?v=20261030b',
viewer: 'assets/print/print-3d.js'
};

var viewer = null;
var failed = false;
var loading = false;
var introPlayed = false;
var depPromise = null;

function loadScript(src) {
return new Promise(function (resolve, reject) {
var s = document.createElement('script');
s.src = src;
s.async = false;
s.onload = function () { resolve(); };
s.onerror = function () { reject(new Error('failed to load ' + src)); };
document.head.appendChild(s);
});
}

function ensureDeps() {
if (depPromise) return depPromise;
var list = [];
if (!window.Legend3D) list.push(DEPS.bundle);
if (typeof window.DracoDecoderModule !== 'function') list.push(DEPS.draco);
if (!window.PRINT_MODELS) list.push(DEPS.models);
if (!window.S7Assembly) list.push(DEPS.viewer);
depPromise = list.reduce(function (p, src) {
return p.then(function () { return loadScript(src); });
}, Promise.resolve());
return depPromise;
}

function startViewer() {
if (viewer || failed || loading || !want3D) return;
loading = true;
ensureDeps().then(function () {
if (!window.S7Assembly || !window.PRINT_MODELS) throw new Error('3D dependencies missing');
var v = new window.S7Assembly(canvas, {
reduceMotion: !!L.reduceMotion
});
return v.load().then(function () {
viewer = v;
if (window.Legend) window.Legend.debugSet('s7viewer', v);
loading = false;
v.start();
watchVisible();
/* 深链 / 刷新时舞台已在视口里：补播一次进场 */
var r = stage.getBoundingClientRect();
if (!introPlayed && r.top < window.innerHeight * 0.75 && r.bottom > 0) playIntro();
});
})['catch'](function (err) {
loading = false;
failed = true;
asm.classList.remove('is-live');
if (window.console && console.warn) console.warn('[S7] 3D 不可用，改用静态海报', err);
});
}

function playIntro() {
if (!viewer || introPlayed) return;
introPlayed = true;
asm.classList.add('is-live');
viewer.playIntro();
}

function watchVisible() {
if (!viewer || !window.IntersectionObserver) return;
var io = new IntersectionObserver(function (entries) {
var e = entries[0];
if (!e) return;
viewer.visible = e.isIntersecting;
if (!e.isIntersecting) {
viewer.stop();
return;
}
viewer.start();
if (!introPlayed && e.intersectionRatio > 0.32) playIntro();
}, { threshold: [0, 0.32] });
io.observe(stage);
}

if (want3D) {
/* 滚到附近再下载：进入视口前 420px 预取 */
if (window.IntersectionObserver) {
var pre = new IntersectionObserver(function (entries) {
if (entries[0] && entries[0].isIntersecting) {
pre.disconnect();
startViewer();
}
}, { rootMargin: '420px 0px' });
pre.observe(stage);
} else {
window.setTimeout(startViewer, 1200);
}
}

L.onRefresh(function () {
if (!want3D) return;
startViewer();
if (viewer && !introPlayed) {
var r = stage.getBoundingClientRect();
if (r.top < window.innerHeight * 0.75 && r.bottom > 0) playIntro();
}
});
}

if (window.Legend) {
boot();
} else {
document.addEventListener('DOMContentLoaded', boot);
}
})();

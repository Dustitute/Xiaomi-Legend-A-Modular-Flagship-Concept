
/* ==========================================================================
S4 · 八个模块 —— 交互脚本
· 入场：卡片从上方飞入、由分散到收紧（ScrollTrigger 进入时播放一次）
· 伪 3D 圆柱：perspective + rotateY 环形排布 8 张（间隔 45°），
rAF + 阻尼驱动顺时针自转（入场后快 → 渐慢 → 稳定慢速）；支持拖拽
· 点击卡片：clip-path 从卡片矩形扩散为全屏详情面板；
转盘精灵图（4×3=12 帧，每帧 320×320）用 background-position 擦洗
· 移动端（≤768px）：圆柱降级为横向 snap 卡带，详情面板全屏
· 只使用 GSAP / ScrollTrigger 与 window.Legend；无全局变量、无裸元素选择器
========================================================================== */
(function () {
'use strict';

var root = document.getElementById('modules');
if (!root) return;

/* ------------------------------------------------------------------
0. 8 个模块数据（id / 序号 / 英文 / 名称 / 一句话 / 介绍 / 参数点）
名称与一句话严格按 DESIGN_SPEC §4 S4；参数取自 PRD 第四部分
------------------------------------------------------------------ */
var MODULES = {
cooling: {
n: '01', tag: 'COOLING', name: '散热模块', line: '冷静，是性能的底气',
desc: '半导体制冷配合离心风扇，为游戏、拍摄等持续高负载场景辅助散热。支持智能调速与手动控制，通过触点或Type-C 供电。',
specs: [['6~10°C', '背板降温'], ['<25dB', '运行噪音'], ['触点/有线', '自由选择供电模式']]
},
battery: {
n: '02', tag: 'BATTERY', name: '外挂电池', line: '把续航焦虑，留给昨天',
desc: 'Legend的第二块电池，可为手机旁路供电，减少内置电池的循环次数。供电与充电模式按需切换。',
specs: [['9000mAh', '标称容量'], ['27W', '触点输出'], ['7mm', '轻薄机身']]
},
mic: {
n: '03', tag: 'MIC', name: '磁吸麦克风', line: '轻若无物，声声清晰',
desc: '磁吸佩戴，支持降噪与蓝牙LEAudio直连。无论随手记录还是出镜讲述，都能让麦克风更靠近说话的人，轻松完成无线收音。',
specs: [['<20g', '单颗重量'], ['≤20ms', '传输延迟'], ['>6h', '单次续航']]
},
printer: {
n: '04', tag: 'PRINTER', name: '打印机模块', line: '从像素，到纸间',
desc: '在相册里选图、编辑、直接打印，无需额外下载App。支持证件照裁切、换底与排版，配合热升华打印和保护覆膜，把手机里的照片带到手中。',
specs: [['1677 万色', '连续色阶'], ['2×3 英寸', '相纸尺寸'], ['30~40s', '单张出片']]
},
terminal: {
n: '05', tag: 'TERMINAL', name: '智能终端模块', line: '落座，连接桌面与家庭',
desc: '集音箱、充电支架与智能家居控制于一体。支持协同播放与触点充电；取下手机，仍可独立使用小爱同学，并通过底座屏幕查看时间、天气和设备状态。',
specs: [['40W', '立体三扬声器阵列'], ['50W', '触点供电'], ['Xiaomi Vela', '操作系统']]
},
flip: {
n: '06', tag: 'FLIP', name: '翻转屏模块', line: '翻一面，见万象',
desc: '贴合时，用后摄自拍预览；展开后，双屏同时处理不同内容。翻转为工作站布局，主屏看画面，副屏可以是键盘、编辑工具或视频时间轴。',
specs: [['0~270°', '屏幕翻转角度'], ['最高120Hz', '超级像素屏'], ['7.5mm', '模块厚度']]
},
optics: {
n: '07', tag: 'OPTICS', name: '模块光学系统', line: '口袋里的微单相机',
desc: 'M4/3 传感器搭配等效 35mm 定焦镜头，通过光通信将 RAW 数据直传手机 ISP。支持一亿像素照片、RAW 输出与最高 4K 60fps 视频，让拍摄与处理在 Legend 上完成。',
specs: [['M4/3', '传感器画幅'], ['100MP', '有效像素'], ['35mm', '等效定焦']]
},
grip: {
n: '08', tag: 'GRIP', name: '摄影手柄', line: '握住的，是创作的形状',
desc: '半按对焦，全按拍摄，拨轮随手调节参数。内置电池与扩展坞，将USB-A、Type-C、TF卡槽和HDMI集成在握柄中，方便连接存储、麦克风与外接显示设备。',
specs: [['两段式按键', '快门半按对焦'], ['1500mAh', '内置电池'], ['4 合 1', '扩展 Hub']]
}
};
var IDS = ['cooling', 'battery', 'mic', 'printer', 'terminal', 'flip', 'optics', 'grip'];

/* 图片路径必须写成完整字面量（不要运行时拼接）：build.py pack 需要按字面量
匹配 assets/... 才能 base64 内联进单文件 */
var TT_URL = {
cooling: 'assets/img/445f74d921.webp',
battery: 'assets/img/6aef1ee22d.webp',
mic: 'assets/img/299021b07f.webp',
printer: 'assets/img/99a69e8131.webp',
terminal: 'assets/img/cfdb124f64.webp',
flip: 'assets/img/4a0f5a3d5e.webp',
optics: 'assets/img/7113890f99.webp',
grip: 'assets/img/4f3fc75044.webp'
};
/* 模块缩略图不再单独内嵌一份 base64：详情面板的静态兜底图直接复用
   模块卡片里那张同图（s4 卡片 img 与本表原本是同一份数据，重复约 380KB） */
function thumbURL(id) {
var card = document.querySelector('.s4-card[data-module="' + id + '"]');
var im = card && card.querySelector('img');
return im ? (im.getAttribute('src') || '') : '';
}

/* ------------------------------------------------------------------
1. 调参
------------------------------------------------------------------ */
var BASE_SPEED = -6.2;   // 稳定自转速度（deg/s，负值 = 顺时针）
var BURST_SPEED = -64;   // 入场后的快速自转（deg/s，与巡航同向）
var DAMP_K = 1.7;        // 速度阻尼系数：越大「由快变慢」越快（时间常数 ≈ 0.6s）
var DRAG_RATIO = 0.34;   // 拖拽 1px 对应的旋转角度
var CLICK_SLOP = 9;      // 按压位移 < 9px（8-10px 区间）视为点击，超过才开始拖拽
var TT_FRAMES = 12;      // 详情转盘 12 帧（4 列 × 3 行）
var TT_STEP = 26;        // 转盘拖拽 26px 切换一帧
var TT_CLICK_SLOP = 6;   // 详情转盘：位移 < 6px 不算拖拽（不屏蔽遮罩点击）

function slice(list) { return Array.prototype.slice.call(list); }

/* ------------------------------------------------------------------
2. 等壳的 window.Legend 就绪（壳在 head 定义；这里只做防御）
------------------------------------------------------------------ */
var waited = 0;
function waitLegend() {
if (window.Legend) { boot(window.Legend); return; }
if (document.readyState === 'loading') {
document.addEventListener('DOMContentLoaded', waitLegend, { once: true });
return;
}
if (waited++ < 240) requestAnimationFrame(waitLegend);
}
waitLegend();

/* ==================================================================
3. 主初始化
================================================================== */
function boot(L) {
var gsap = L.gsap || window.gsap;
var ST = L.ScrollTrigger || window.ScrollTrigger;
var reduce = !!L.reduceMotion;
var canAnim = !!(gsap && ST && !reduce);

var cards = slice(root.querySelectorAll('.s4-card'));
var flies = slice(root.querySelectorAll('.s4-fly'));
var cyl = root.querySelector('[data-s4-cylinder]');
var scene = root.querySelector('.s4-scene');
var stage = root.querySelector('.s4-stage');
var dots = slice(root.querySelectorAll('.s4-dot'));
var hintEl = root.querySelector('[data-s4-hint]');
var prevBtn = root.querySelector('.s4-nav-prev');
var nextBtn = root.querySelector('.s4-nav-next');

function setHint(text) { if (hintEl) hintEl.textContent = text; }
function isMobile() { return L.isMobile ? L.isMobile() : window.innerWidth <= 768; }
function isCyl() { return !isMobile() && root.classList.contains('s4-cyl'); }

/* ---- 3.1 状态 ---- */
var spin = { angle: 0, vel: 0, target: BASE_SPEED, dragging: false, tweening: false };
var par = { x: 0, y: 0, tx: 0, ty: 0, px: 0, py: 0, pending: false };   // 透视灭点偏移（鼠标视差）
var frontIdx = -1;
var lastMobile = null;
var entryPlayed = false;
var inView = false;
var engineOn = false;
var rafId = 0;
var lastT = 0;
var suppressClick = 0;
var press = null;          // 一次按压状态（pointerdown → pointerup）
var pressCard = null;      // 按下时命中的卡片（整卡命中用）

for (var ci = 0; ci < cards.length; ci++) cards[ci].setAttribute('aria-expanded', 'false');

/* ---- 3.2 详情面板（优先创建：无 GSAP / 减少动效时也完整可用） ---- */
var detail = createDetail(L, gsap, {
onOpen: function () {
stopEngine();
if (gsap) gsap.killTweensOf(spin);
spin.tweening = false;
spin.dragging = false;
},
onClose: function () {
if (inView && entryPlayed) {
spin.target = BASE_SPEED;
if (spin.vel < BASE_SPEED * .3) spin.vel = BASE_SPEED * .6;
startEngine();
}
}
});

bindCardOpeners();
L.reveal(root);

/* ---- 3.3 静态兜底：无 GSAP / prefers-reduced-motion → 网格静态呈现 ---- */
if (!canAnim) {
root.classList.add('s4-static');
setHint('点击卡片展开详情');
return;
}

/* ---- 3.4 动效模式 ---- */
root.classList.add('s4-live');
gsap.set(flies, { autoAlpha: 0 });      // 进入视口前先藏起卡片
applyMode(true);                        // 决定桌面圆柱 / 移动端卡带
bindPointer();
bindControls();
bindScroll();
bindObserver();
bindResize();
bindReduce();

/* ================= 3.5 圆柱角度与正对卡片高亮 ================= */
function applyAngle() {
if (!cyl || !isCyl()) return;
cyl.style.transform = 'rotateY(' + spin.angle.toFixed(2) + 'deg)';
updateFront();
}

function updateFront() {
var idx = ((Math.round(-spin.angle / 45) % 8) + 8) % 8;
if (idx === frontIdx) return;
frontIdx = idx;
for (var i = 0; i < cards.length; i++) {
if (i === idx) cards[i].classList.add('is-front');
else cards[i].classList.remove('is-front');
}
for (var d = 0; d < dots.length; d++) {
if (d === idx) dots[d].classList.add('is-on');
else dots[d].classList.remove('is-on');
}
}

/* ================= 3.6 自转引擎：rAF + 阻尼（离开视口暂停） ================= */
function tick(now) {
rafId = 0;
if (!engineOn) return;
var dt = lastT ? Math.min((now - lastT) / 1000, .05) : .016;
lastT = now;
if (!spin.dragging && !spin.tweening) {
/* 一阶阻尼：速度指数逼近目标速度，即「开始快 → 渐慢 → 稳定」 */
spin.vel += (spin.target - spin.vel) * (1 - Math.exp(-DAMP_K * dt));
spin.angle += spin.vel * dt;
if (spin.angle > 36000) spin.angle -= 36000;
if (spin.angle < -36000) spin.angle += 36000;
applyAngle();
}
/* 透视灭点平滑跟随鼠标：只改 perspective-origin，不动 transform */
if (par.pending) {
par.pending = false;
var sbox = stage.getBoundingClientRect();
if (sbox.width && sbox.height) {
par.tx = -((par.px - sbox.left) / sbox.width - .5) * 2.4;
par.ty = -((par.py - sbox.top) / sbox.height - .5) * 1.6;
}
}
if (scene && (Math.abs(par.x - par.tx) > .01 || Math.abs(par.y - par.ty) > .01)) {
par.x += (par.tx - par.x) * (1 - Math.exp(-4 * dt));
par.y += (par.ty - par.y) * (1 - Math.exp(-4 * dt));
scene.style.setProperty('--s4-px', par.x.toFixed(2) + '%');
scene.style.setProperty('--s4-py', par.y.toFixed(2) + '%');
}
rafId = requestAnimationFrame(tick);
}

function startEngine() {
if (engineOn || !isCyl() || (detail && detail.isOpen())) return;
engineOn = true;
lastT = 0;
rafId = requestAnimationFrame(tick);
}

function stopEngine() {
engineOn = false;
if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
lastT = 0;
}

/* ================= 3.7 入场：飞入 + 收紧（圆柱快转、减速） ================= */
function playEntry() {
if (entryPlayed) return;
entryPlayed = true;
var mobile = isMobile();

/* 初始：卡片在上方、横向分散、带一点旋转 */
gsap.set(flies, {
y: function (i) { return mobile ? -130 - (i % 4) * 28 : -300 - (i % 4) * 54; },
x: function (i) { return (i - 3.5) * (mobile ? 16 : 44); },
rotation: function (i) { return mobile ? 0 : ((i % 2 ? 1 : -1) * (3 + (i * 7) % 9)); },
scale: mobile ? .94 : .84,
autoAlpha: 0
});

var tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
tl.to(flies, {
y: 0, x: 0, rotation: 0, scale: 1, autoAlpha: 1,
duration: mobile ? .78 : .98,
stagger: { each: mobile ? .05 : .045, from: 'center' },
clearProps: 'transform,opacity,visibility'
}, 0);

if (!mobile) {
/* 顺时针（角度递增）：先从 -160° 转到正位，随后接管为阻尼减速自转 */
spin.angle = -160;
spin.vel = 0;
applyAngle();
tl.to(spin, {
angle: 0, duration: 1.28, ease: 'power3.out',
onUpdate: applyAngle,
onComplete: function () {
spin.vel = BURST_SPEED;
spin.target = BASE_SPEED;
startEngine();
}
}, 0);
/* 空闲时预取 8 张转盘精灵图，首次打开详情更顺 */
setTimeout(function () { if (detail) detail.preloadSprites(); }, 2200);
}
}

/* ================= 3.8 断点切换：桌面圆柱 ↔ 移动端卡带 ================= */
function applyMode(force) {
var mobile = isMobile();
if (!force && mobile === lastMobile) return;
lastMobile = mobile;
root.classList.toggle('s4-cyl', !mobile);
root.classList.toggle('s4-mobile', mobile);
if (scene) {
scene.style.removeProperty('--s4-px');
scene.style.removeProperty('--s4-py');
}
par.x = par.y = par.tx = par.ty = 0;

if (mobile) {
stopEngine();
if (gsap) gsap.killTweensOf(spin);
spin.angle = 0; spin.vel = 0; spin.tweening = false; spin.dragging = false;
if (cyl) cyl.style.transform = '';
for (var i = 0; i < cards.length; i++) cards[i].classList.remove('is-front');
setHint('左右滑动 · 点击卡片展开详情');
} else {
setHint('拖动旋转 · 点击卡片展开详情');
if (entryPlayed) {
spin.angle = 0;
spin.vel = BASE_SPEED * .5;
spin.target = BASE_SPEED;
applyAngle();
if (inView && !(detail && detail.isOpen())) startEngine();
} else {
spin.angle = -160;
applyAngle();
}
}
}

/* ================= 3.9 按压判定 / 拖拽 / 悬停停转 / 鼠标视差 ================= */
function bindPointer() {
stage.addEventListener('pointerdown', onPointerDown);
window.addEventListener('pointermove', onPointerMove, { passive: true });
window.addEventListener('pointerup', onPointerEnd);
window.addEventListener('pointercancel', onPointerEnd);

function closestCard(node) {
while (node && node !== stage) {
if (node.classList && node.classList.contains('s4-card')) return node;
node = node.parentNode;
}
return null;
}

function onPointerDown(e) {
if (!isCyl() || (detail && detail.isOpen())) return;
if (e.pointerType === 'mouse' && e.button !== 0) return;
if (gsap) gsap.killTweensOf(spin);
spin.tweening = false;
press = {
id: e.pointerId,
x: e.clientX, y: e.clientY, angle: spin.angle,
lastX: e.clientX, lastT: performance.now(), v: 0, moved: false
};
pressCard = closestCard(e.target);
/* 按下立即暂停自转：点击时卡片不再移动，命中率稳定 */
spin.dragging = true;
spin.vel = 0;
spin.target = 0;
stage.classList.add('is-pressing');
}

function onPointerMove(e) {
if (!press || !isCyl() || e.pointerId !== press.id) return;
var dx = e.clientX - press.x;
var dy = e.clientY - press.y;
if (!press.moved) {
/* 位移 < CLICK_SLOP（9px）仍视为点击，超过阈值才进入拖拽 */
if (dx * dx + dy * dy < CLICK_SLOP * CLICK_SLOP) return;
press.moved = true;
stage.classList.remove('is-pressing');
stage.classList.add('is-dragging');
}
spin.angle = press.angle + dx * DRAG_RATIO;   // 往右拖 = 顺时针
applyAngle();
var now = performance.now();
var dt = now - press.lastT;
if (dt > 10) {
press.v = ((e.clientX - press.lastX) / dt) * 1000 * DRAG_RATIO;
press.lastX = e.clientX;
press.lastT = now;
}
}

function onPointerEnd(e) {
if (!press || (e && e.pointerId !== undefined && e.pointerId !== press.id)) return;
var moved = press.moved;
var v = press.v;
var card = pressCard;
var cancelled = !!(e && e.type === 'pointercancel');
press = null;
pressCard = null;
spin.dragging = false;
stage.classList.remove('is-pressing', 'is-dragging');

if (moved) {
/* 拖拽结束：随后的 click 一律忽略，避免误开详情 */
suppressClick = performance.now() + 400;
spin.vel = Math.max(-360, Math.min(360, v));   // 松手惯性
} else {
spin.vel = 0;
if (!cancelled && card) {
/* 整卡命中：在 pointerup 直接开详情，避免旋转或子元素导致 click 目标漂移 */
suppressClick = performance.now() + 400;
if (detail) detail.open(card);
}
}
spin.target = BASE_SPEED;   // pointerup 恢复自转（悬停停转会在下次进入卡片时再次生效）
if (isCyl()) startEngine();
}

if (!window.matchMedia('(hover: none)').matches) {
/* hover 到某张卡就停转，方便阅读与点击；移开继续慢转 */
for (var i = 0; i < cards.length; i++) {
(function (card) {
card.addEventListener('pointerenter', function () {
if (isCyl()) spin.target = 0;
});
card.addEventListener('pointerleave', function () {
if (isCyl() && !spin.dragging) spin.target = BASE_SPEED;
});
})(cards[i]);
}
/* 鼠标移动 → 移动透视灭点，产生轻微 3D 视差（由自转 tick 平滑跟随） */
stage.addEventListener('pointermove', function (e) {
if (!isCyl() || (detail && detail.isOpen())) return;
/* 只记坐标，读布局交给自转 tick（每帧最多一次） */
par.px = e.clientX;
par.py = e.clientY;
par.pending = true;
}, { passive: true });
stage.addEventListener('pointerleave', function () { par.tx = 0; par.ty = 0; });
}
}

/* ================= 3.10 控制条：前后步进 + 8 个刻度 ================= */
function bindControls() {
function spinToIndex(idx) {
if (!isCyl() || (detail && detail.isOpen())) return;
var desired = -idx * 45;
var dest = desired + Math.round((spin.angle - desired) / 360) * 360;
if (Math.abs(dest - spin.angle) < .4) return;
gsap.killTweensOf(spin);
spin.tweening = true;
spin.dragging = false;
spin.vel = 0;
spin.target = BASE_SPEED;
startEngine();
gsap.to(spin, {
angle: dest, duration: .95, ease: 'power3.inOut', overwrite: true,
onUpdate: applyAngle,
onComplete: function () {
spin.tweening = false;
spin.vel = 0;
spin.target = BASE_SPEED;
}
});
}

if (prevBtn) prevBtn.addEventListener('click', function () { spinToIndex(((frontIdx < 0 ? 0 : frontIdx) + 7) % 8); });
if (nextBtn) nextBtn.addEventListener('click', function () { spinToIndex(((frontIdx < 0 ? 7 : frontIdx) + 1) % 8); });
for (var i = 0; i < dots.length; i++) {
(function (idx) { dots[idx].addEventListener('click', function () { spinToIndex(idx); }); })(i);
}
}

/* ================= 3.11 ScrollTrigger 入场 + 资源就绪兜底 ================= */
function bindScroll() {
ST.create({ trigger: root, start: 'top 72%', once: true, onEnter: playEntry });
L.onRefresh(function () {
if (!entryPlayed && root.getBoundingClientRect().top < window.innerHeight * .9) playEntry();
});
/* 双保险：深链接 / 极快滚动时卡片也不会一直藏着 */
setTimeout(function () {
if (!entryPlayed && root.getBoundingClientRect().top < window.innerHeight * .9) playEntry();
}, 2000);
}

/* ================= 3.12 离开视口暂停自转 ================= */    function bindObserver() {
if ('IntersectionObserver' in window) {
var io = new IntersectionObserver(function (entries) {
inView = entries[0].isIntersecting;
if (inView && entryPlayed && !(detail && detail.isOpen())) startEngine();
else stopEngine();
}, { threshold: .01, rootMargin: '120px 0px' });
io.observe(stage);
} else {
inView = true;
}
document.addEventListener('visibilitychange', function () {
if (document.hidden) stopEngine();
else if (inView && entryPlayed && !(detail && detail.isOpen())) startEngine();
});
}

/* ================= 3.13 断点变化：桌面圆柱 ↔ 移动端卡带 ================= */
function bindResize() {
var timer = 0;
function schedule() {
clearTimeout(timer);
timer = setTimeout(function () {
applyMode();              // 仅在 isMobile() 变化时才真正切模式
if (ST) ST.refresh();
}, 180);
}
window.addEventListener('resize', schedule);
if (window.matchMedia) {
var mq = window.matchMedia('(max-width: 768px)');
if (mq.addEventListener) mq.addEventListener('change', schedule);
else if (mq.addListener) mq.addListener(schedule);
}
}

/* ================= 3.13b 运行中切到「减少动效」：立即降级为平面网格 ================= */
function bindReduce() {
if (!window.matchMedia) return;
var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
function onChange() {
if (!mq.matches) return;   // 反向切换保持静态（下次载入再启用动效）
stopEngine();
if (gsap) {
gsap.killTweensOf(spin);
gsap.killTweensOf(flies);
gsap.set(flies, { clearProps: 'all' });
}
spin.tweening = false;
spin.dragging = false;
root.classList.remove('s4-live', 's4-cyl', 's4-mobile');
root.classList.add('s4-static');
for (var i = 0; i < cards.length; i++) cards[i].classList.remove('is-front');
if (cyl) cyl.style.transform = '';
setHint('点击卡片展开详情');
}
if (mq.addEventListener) mq.addEventListener('change', onChange);
else if (mq.addListener) mq.addListener(onChange);
if (mq.matches) onChange();
}

/* ================= 3.14 卡片点击 → 打开详情（键盘 / 非 3D 模式兜底） =================
3D 桌面端的指针点击已在 pointerup 里按位移阈值判定并直接打开（整卡命中），
这里只服务键盘 Enter/Space 与移动端/静态模式的 click；suppressClick 防重复触发 */
function bindCardOpeners() {
for (var i = 0; i < cards.length; i++) {
(function (card) {
card.addEventListener('click', function () {
if (performance.now() < suppressClick) return;   // 刚拖拽/刚由 pointerup 打开，忽略这次 click
if (detail) detail.open(card);
});
})(cards[i]);
}
}

/* ==================================================================
4. 详情面板：从卡片位置扩散的全屏固定层
================================================================== */
function createDetail(L, gsap, opts) {
opts = opts || {};
var dlg = root.querySelector('[data-s4-detail]');
if (!dlg) return null;
document.body.appendChild(dlg);   // 移到 body：fixed 定位稳定、层级高于页眉

var backdrop = dlg.querySelector('[data-s4-backdrop]');
var sheet = dlg.querySelector('[data-s4-sheet]');
var inner = dlg.querySelector('.s4-detail-inner');
var visual = dlg.querySelector('.s4-detail-visual');
var closeBtn = dlg.querySelector('[data-s4-close]');
var eEyebrow = dlg.querySelector('[data-s4-eyebrow]');
var eTitle = dlg.querySelector('[data-s4-title]');
var eLine = dlg.querySelector('[data-s4-line]');
var eDesc = dlg.querySelector('[data-s4-desc]');
var eSpecs = dlg.querySelector('[data-s4-specs]');
var eTt = dlg.querySelector('[data-s4-tt]');
var eFallback = dlg.querySelector('[data-s4-tt-fallback]');
var ticks = slice(dlg.querySelectorAll('[data-s4-ticks] i'));
var copyEls = slice(dlg.querySelectorAll('.s4-detail-copy > *'));
var animEls = [visual].concat(copyEls);

var canAnim = !!(gsap && !L.reduceMotion);
var isOpen = false;
var busy = false;
var currentCard = null;
var currentId = null;
var lastFocus = null;
var frame = 0;
var ttDrag = null;
var overlayBlockUntil = 0;   // 转盘拖拽刚结束：短暂屏蔽遮罩/空白处点击
var sprites = {};          // id -> 'loading' | 'ok' | 'missing'
var scrollLock = null;
var openTl = null;         // 打开动画（允许 ESC 中途打断）

/* ---------- 4.1 转盘帧与精灵图 ---------- */
/* 散热 / 终端转盘：原第 8 帧起轮转——原8→现1，原9→现2，依此类推 */
function srcFrameFor(modId, f) {
if (modId === 'cooling' || modId === 'terminal') return (f + 7) % TT_FRAMES;
return f;
}
function setFrame(f) {
frame = ((f % TT_FRAMES) + TT_FRAMES) % TT_FRAMES;
var src = srcFrameFor(currentId, frame);
var col = src % 4;
var row = Math.floor(src / 4);
if (eTt) eTt.style.backgroundPosition = (col / 3 * 100) + '% ' + (row / 2 * 100) + '%';
for (var i = 0; i < ticks.length; i++) {
if (i === frame) ticks[i].classList.add('is-on');
else ticks[i].classList.remove('is-on');
}
}

function spriteUrl(id) { return TT_URL[id]; }

function applySprite(id) {
if (currentId !== id) return;
var ok = sprites[id] === 'ok';
if (ok) {
eTt.style.backgroundImage = 'url("' + spriteUrl(id) + '")';
eTt.classList.remove('is-missing');
if (eFallback) eFallback.style.display = 'none';
if (visual) visual.classList.remove('is-fallback');
} else {
/* 精灵图缺失：退化为模块静态渲染图，页面不为破图 */
eTt.style.backgroundImage = 'none';
eTt.classList.add('is-missing');
if (eFallback) eFallback.style.display = '';
if (visual) visual.classList.add('is-fallback');
}
}

function loadSprite(id) {
if (sprites[id] === 'ok' || sprites[id] === 'missing') { applySprite(id); return; }
if (sprites[id] === 'loading') return;
sprites[id] = 'loading';
var img = new Image();
img.onload = function () { sprites[id] = 'ok'; applySprite(id); };
img.onerror = function () { sprites[id] = 'missing'; applySprite(id); };
img.src = spriteUrl(id);
}

function render(id, data) {
eEyebrow.textContent = 'MODULE ' + data.n + ' · ' + data.tag;
eTitle.textContent = data.name;
eLine.textContent = data.line;
eDesc.textContent = data.desc;
eSpecs.textContent = '';
for (var i = 0; i < data.specs.length; i++) {
var li = document.createElement('li');
li.className = 's4-spec';
var b = document.createElement('b');
b.textContent = data.specs[i][0];
var sp = document.createElement('span');
sp.textContent = data.specs[i][1];
li.appendChild(b);
li.appendChild(sp);
eSpecs.appendChild(li);
}
setFrame(0);
eTt.style.backgroundImage = 'url("' + spriteUrl(id) + '")';
eTt.classList.remove('is-missing');
if (visual) visual.classList.remove('is-fallback');
if (eFallback) {
eFallback.style.display = 'none';
var thumb = thumbURL(id);
if (thumb) {
eFallback.setAttribute('src', thumb);
eFallback.setAttribute('alt', data.name + ' 静态渲染图');
}
}
loadSprite(id);
}

/* ---------- 4.2 打开：clip-path 从卡片矩形扩散 ---------- */
function clipFromRect(r) {
var vw = window.innerWidth;
var vh = window.innerHeight;
var top = Math.max(0, Math.round(r.top));
var left = Math.max(0, Math.round(r.left));
var right = Math.max(0, Math.round(vw - r.right));
var bottom = Math.max(0, Math.round(vh - r.bottom));
var radius = Math.max(18, Math.round(Math.min(44, r.width / 6)));
return 'inset(' + top + 'px ' + right + 'px ' + bottom + 'px ' + left + 'px round ' + radius + 'px)';
}

function open(card) {
if (isOpen || busy) return;
var id = card.getAttribute('data-module');
var data = MODULES[id];
if (!data) return;
isOpen = true;
busy = true;
currentCard = card;
currentId = id;
lastFocus = card;
card.setAttribute('aria-expanded', 'true');

render(id, data);
dlg.classList.add('is-open');
dlg.setAttribute('aria-hidden', 'false');
lockScroll();
if (opts.onOpen) opts.onOpen();

if (canAnim) {
sheet.style.clipPath = clipFromRect(card.getBoundingClientRect());
backdrop.style.opacity = '0';
gsap.set(animEls, { autoAlpha: 0, y: 18 });
openTl = gsap.timeline({ onComplete: function () { openTl = null; busy = false; } })
.to(sheet, { clipPath: 'inset(0px 0px 0px 0px round 0px)', duration: .62, ease: 'power3.inOut' }, 0)
.to(backdrop, { opacity: 1, duration: .42, ease: 'power2.out' }, 0)
.to(animEls, { autoAlpha: 1, y: 0, duration: .55, stagger: .05, ease: 'power3.out' }, .24);
} else {
sheet.style.clipPath = 'inset(0px 0px 0px 0px round 0px)';
backdrop.style.opacity = '1';
if (gsap) gsap.set(animEls, { autoAlpha: 1, y: 0 });
busy = false;
}
setTimeout(function () {
try { closeBtn.focus({ preventScroll: true }); } catch (err) { closeBtn.focus(); }
}, 90);
}

/* ---------- 4.3 关闭：面板原路收回卡片位置 ---------- */
function close() {
if (!isOpen) return;
/* 打开动画进行中按 ESC/点遮罩：先打断再收回，避免短时间失去响应 */
if (openTl) { openTl.kill(); openTl = null; }
isOpen = false;
busy = true;
var rect = currentCard ? currentCard.getBoundingClientRect() : null;
var to = rect ? clipFromRect(rect) : 'inset(48% 48% 48% 48% round 44px)';
if (canAnim) {
gsap.timeline({ onComplete: finishClose })
.to(animEls, { autoAlpha: 0, y: 10, duration: .2, ease: 'power2.in' }, 0)
.to(sheet, { clipPath: to, duration: .5, ease: 'power3.inOut' }, .03)
.to(backdrop, { opacity: 0, duration: .4, ease: 'power2.out' }, .08);
} else {
finishClose();
}
}

function finishClose() {
dlg.classList.remove('is-open');
dlg.setAttribute('aria-hidden', 'true');
sheet.style.clipPath = '';
backdrop.style.opacity = '';
if (gsap) gsap.set(animEls, { clearProps: 'all' });
if (currentCard) currentCard.setAttribute('aria-expanded', 'false');
var focusTarget = lastFocus;
currentCard = null;
currentId = null;
lastFocus = null;
unlockScroll();
busy = false;
if (opts.onClose) opts.onClose();
if (focusTarget && focusTarget.focus) {
try { focusTarget.focus({ preventScroll: true }); } catch (err) { try { focusTarget.focus(); } catch (err2) {} }
}
}

/* ---------- 4.4 打开时锁 body 滚动 ---------- */
function lockScroll() {
var sbw = window.innerWidth - document.documentElement.clientWidth;
scrollLock = {
overflow: document.body.style.overflow,
paddingRight: document.body.style.paddingRight
};
document.body.style.overflow = 'hidden';
if (sbw > 0) document.body.style.paddingRight = sbw + 'px';
}

function unlockScroll() {
if (!scrollLock) return;
document.body.style.overflow = scrollLock.overflow || '';
document.body.style.paddingRight = scrollLock.paddingRight || '';
scrollLock = null;
}

/* ---------- 4.5 焦点限制在面板内 ---------- */
function trapFocus(e) {
var nodes = dlg.querySelectorAll('button, [href], [tabindex]:not([tabindex="-1"])');
var list = [];
for (var i = 0; i < nodes.length; i++) {
if (nodes[i] === closeBtn || nodes[i].offsetWidth || nodes[i].offsetHeight) list.push(nodes[i]);
}
if (!list.length) return;
var first = list[0];
var last = list[list.length - 1];
var active = document.activeElement;
if (e.shiftKey) {
if (active === first || !dlg.contains(active)) { e.preventDefault(); last.focus(); }
} else if (active === last || !dlg.contains(active)) {
e.preventDefault();
first.focus();
}
}

/* ---------- 4.6 转盘：鼠标 / 触摸拖动擦洗（与关闭按钮/遮罩点击隔离） ---------- */
if (eTt) {
eTt.addEventListener('pointerdown', function (e) {
if (!isOpen) return;
ttDrag = { x: e.clientX, y: e.clientY, frame: frame, id: e.pointerId, moved: false };
eTt.classList.add('is-dragging');
if (eTt.setPointerCapture) { try { eTt.setPointerCapture(e.pointerId); } catch (err) {} }
try { eTt.focus({ preventScroll: true }); } catch (err2) {}
if (e.preventDefault) e.preventDefault();
e.stopPropagation();
});
eTt.addEventListener('pointermove', function (e) {
if (!ttDrag || e.pointerId !== ttDrag.id) return;
var dx = e.clientX - ttDrag.x;
var dy = e.clientY - ttDrag.y;
if (!ttDrag.moved && dx * dx + dy * dy > TT_CLICK_SLOP * TT_CLICK_SLOP) ttDrag.moved = true;
setFrame(ttDrag.frame + Math.round(dx / TT_STEP));
});
function endTtDrag(e) {
if (!ttDrag) return;
if (ttDrag.moved) {
/* 转盘拖拽结束：短暂屏蔽遮罩/空白处 click，避免松手时误关面板 */
overlayBlockUntil = performance.now() + 400;
if (e && e.stopPropagation) e.stopPropagation();
}
ttDrag = null;
eTt.classList.remove('is-dragging');
}
eTt.addEventListener('pointerup', endTtDrag);
eTt.addEventListener('pointercancel', endTtDrag);
eTt.addEventListener('click', function (e) { e.stopPropagation(); });   // 转盘上的点击不参与遮罩关闭
eTt.addEventListener('keydown', function (e) {
if (!isOpen) return;
if (e.key === 'ArrowLeft') { e.preventDefault(); setFrame(frame - 1); }
else if (e.key === 'ArrowRight') { e.preventDefault(); setFrame(frame + 1); }
});
}

/* ---------- 4.7 关闭途径：按钮 / 点击遮罩 / ESC ---------- */
closeBtn.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
closeBtn.addEventListener('click', function (e) { e.stopPropagation(); close(); });
dlg.addEventListener('click', function (e) {
if (!isOpen) return;
if (performance.now() < overlayBlockUntil) return;   // 刚拖完转盘，避免误关
var t = e.target;
if (t === backdrop || t === dlg || t === sheet || t === inner) close();
});
document.addEventListener('keydown', function (e) {
if (!isOpen) return;
if (e.key === 'Escape' || e.key === 'Esc') { e.preventDefault(); close(); return; }
if (e.key === 'Tab') trapFocus(e);
});

/* ---------- 4.8 对外接口 ---------- */
return {
open: open,
close: close,
isOpen: function () { return isOpen; },
preloadSprites: function () {
for (var i = 0; i < IDS.length; i++) loadSprite(IDS[i]);
}
};
}
}
})();

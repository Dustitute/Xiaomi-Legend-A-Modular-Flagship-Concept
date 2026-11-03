
(function () {
'use strict';

/* ------------------------------------------------------------------
规格区初始化：入场动效 + 右侧 GLB 实时 3D
- 3D：自由拖拽（横 / 纵两个轴，可翻转到任意角度）+ 一次性入场旋转
- 入场旋转在首次进入视口时播放，可被拖拽打断，打断后不再继续
- 每次页面加载只播一次（刷新 / 重新打开后可再次播放）
- 依赖 assets/vendor/legend-3d-bundle.js + assets/Legend.glb.b64.js（经典脚本）
------------------------------------------------------------------ */
function init() {
if (!window.Legend) return;
var L = window.Legend;
var root = document.getElementById('specs');
if (!root) return;

/* 统一入场（eyebrow / 标题 / 导语 / 3D / 宣言） */
L.reveal(root);

/* 右侧：Three.js GLB 实时 3D */
initHero3D(root);

var gsap = L.gsap || window.gsap;
var ST = L.ScrollTrigger || window.ScrollTrigger;
if (!gsap || !ST || L.reduceMotion) return;

/* 参数行逐行浮出：滚动进入视口即点亮，每次只播一次 */
var rows = root.querySelectorAll('.s3-row');
if (!rows.length) return;
gsap.set(rows, { opacity: 0, y: 26 });
ST.batch(rows, {
start: 'top 90%',
once: true,
onEnter: function (batch) {
gsap.to(batch, {
opacity: 1,
y: 0,
duration: .9,
stagger: .07,
ease: 'power3.out',
overwrite: true,
clearProps: 'transform'
});
}
});
}

/* ------------------------------------------------------------------
右侧 3D：相机固定，模型在 pivot 上绕自身几何中心旋转
- REST：微微俯视的背面 3/4 产品视角
- 拖拽：横向绕世界 Y、纵向绕世界 X，任意角度可翻转
- 入场：绕 Y 轴 180°，缓入缓出，从背面主视角转到正面 3/4 视角
------------------------------------------------------------------ */
function initHero3D(root) {
var box = root.querySelector('[data-hero3d-stage]');
if (!box) return;
var mount = box.querySelector('[data-hero3d-mount]');
var L3 = window.Legend3D;
var b64 = window.LEGEND_GLB_B64;
if (!mount) return;
if (!L3 || !b64) { failStatic('3D 依赖未加载'); return; }

var THREE = L3.THREE;
var reduced = false;
try { reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

/* ---------- 造型参数（产品宣传向：高对比主光 + 冷调补光 + 利落轮廓） ---------- */
var LOOK = {
targetSize: 1.46,          /* 模型统一到 1.46 单位高（与 30° 相机距离 3.5 配合，约占画面 80%） */
exposure: 1.14,
key: 2.25, fill: .52, rim: 1.72, rim2: .78, top: .22, hemi: .26,
panelMult: .55,
clearcoat: .72,
clearcoatRoughness: .22,
introMs: 3800,
introDelay: 500
};
var REST = { yaw: -0.44, pitch: 0.10, roll: -0.022 };

var restQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(REST.pitch, REST.yaw, REST.roll, 'YXZ'));
var axisY = new THREE.Vector3(0, 1, 0);
var axisX = new THREE.Vector3(1, 0, 0);
var qTmp = new THREE.Quaternion();
var SPEED = 0.0082;          /* 弧度 / 像素 */
/* 入场旋转：从背面主视角出发，绕 Y 轴转 180°，最终停在正面 3/4 视角 */
var INTRO_RAD = Math.PI * 180 / 180;
var endQuat = new THREE.Quaternion().setFromAxisAngle(axisY, INTRO_RAD).multiply(restQuat);

var renderer, scene, camera, model, pivot;
var width = 0, height = 0;
var running = false, lastT = 0;

var intro = { active: false, start: 0, done: false };
var drag = { active: false, id: null, x: 0, y: 0, t: 0, vx: 0, vy: 0 };
var inertia = { active: false, yaw: 0, pitch: 0 };

/* ---------- 工具 ---------- */
function failStatic(err) {
if (window.console && console.warn) console.warn('[hero3d] 3D 模型不可用，保留静态展示', err);
box.classList.remove('is-live');
if (mount) mount.innerHTML = '';
}

function easeInOutCubic(t) {
return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function b64ToArrayBuffer(str) {
var bin = atob(str);
var len = bin.length;
var bytes = new Uint8Array(len);
for (var i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
return bytes.buffer;
}

/* ---------- 渲染循环：只在有动效时跑，静止后停帧 ---------- */
function requestRender() {
if (running || !renderer) return;
running = true;
lastT = performance.now();
requestAnimationFrame(tick);
}

function renderNow() {
if (renderer && scene && camera) renderer.render(scene, camera);
}

function tick(now) {
var dt = Math.min(.05, Math.max(.001, (now - lastT) / 1000));
lastT = now;
var busy = false;

if (intro.active) {
busy = true;
var p = (now - intro.start) / LOOK.introMs;
if (p >= 1) {
intro.active = false;
intro.done = true;
box.classList.remove('is-intro');
pivot.quaternion.copy(endQuat);
} else {
var e = easeInOutCubic(p);
qTmp.setFromAxisAngle(axisY, INTRO_RAD * e);
pivot.quaternion.copy(qTmp).multiply(restQuat);
}
} else if (inertia.active) {
busy = true;
qTmp.setFromAxisAngle(axisY, inertia.yaw * dt);
pivot.quaternion.premultiply(qTmp);
qTmp.setFromAxisAngle(axisX, inertia.pitch * dt);
pivot.quaternion.premultiply(qTmp);
pivot.quaternion.normalize();
var k = Math.exp(-dt * 3.4);
inertia.yaw *= k;
inertia.pitch *= k;
if (Math.abs(inertia.yaw) + Math.abs(inertia.pitch) < .05) {
inertia.active = false;
inertia.yaw = 0;
inertia.pitch = 0;
}
}

renderNow();
if (busy) requestAnimationFrame(tick);
else running = false;
}

/* ---------- 旋转 ---------- */
function rotateBy(dx, dy) {
if (!pivot) return;
if (dx) { qTmp.setFromAxisAngle(axisY, dx * SPEED); pivot.quaternion.premultiply(qTmp); }
if (dy) { qTmp.setFromAxisAngle(axisX, dy * SPEED); pivot.quaternion.premultiply(qTmp); }
pivot.quaternion.normalize();
}

function nudge(yaw, pitch) {
if (!pivot) return;
if (yaw) { qTmp.setFromAxisAngle(axisY, yaw); pivot.quaternion.premultiply(qTmp); }
if (pitch) { qTmp.setFromAxisAngle(axisX, pitch); pivot.quaternion.premultiply(qTmp); }
pivot.quaternion.normalize();
}

/* ---------- 入场自动旋转：一次性、可打断 ---------- */
function playIntro() {
if (intro.done || !model) return;
if (reduced) { intro.done = true; return; }
intro.active = true;
intro.start = performance.now();
box.classList.add('is-intro');
requestRender();
}

function interruptIntro() {
intro.done = true;
if (intro.active) {
intro.active = false;
box.classList.remove('is-intro');
}
requestRender();
}

function armIntro() {
if (intro.done || reduced) { intro.done = true; return; }
var started = false;
function start() {
if (started || intro.done) return;
started = true;
/* 等画面稳定再起转 */
window.setTimeout(function () { if (!intro.done) playIntro(); }, LOOK.introDelay);
}
if (!('IntersectionObserver' in window)) { start(); return; }
var io = new IntersectionObserver(function (entries) {
for (var i = 0; i < entries.length; i++) {
if (entries[i].isIntersecting && entries[i].intersectionRatio >= .45) {
io.disconnect();
start();
break;
}
}
}, { threshold: [0, .45, .7], rootMargin: '0px 0px -8% 0px' });
io.observe(box);
/* 若观察器回调前区块已在视口内（例如锚点直达），补一次检查 */
requestAnimationFrame(function () {
if (started || intro.done) return;
var r = box.getBoundingClientRect();
var vh = window.innerHeight || document.documentElement.clientHeight;
if (r.top < vh * .92 && r.bottom > vh * .08) { io.disconnect(); start(); }
});
}

/* ---------- 拖拽 / 惯性 ---------- */
function onDown(e) {
if (e.pointerType === 'mouse' && e.button !== 0) return;
interruptIntro();
inertia.active = false;
drag.active = true;
drag.id = e.pointerId;
drag.x = e.clientX;
drag.y = e.clientY;
drag.t = performance.now();
drag.vx = 0;
drag.vy = 0;
box.classList.add('is-dragging');
try { box.focus({ preventScroll: true }); } catch (err) { try { box.focus(); } catch (e2) {} }
try { box.setPointerCapture(e.pointerId); } catch (err) {}
if (e.cancelable) e.preventDefault();
requestRender();
}

function onMove(e) {
if (!drag.active || e.pointerId !== drag.id) return;
var dx = e.clientX - drag.x;
var dy = e.clientY - drag.y;
if (!dx && !dy) return;
drag.x = e.clientX;
drag.y = e.clientY;
rotateBy(dx, dy);

var now = performance.now();
var dt = Math.max(8, now - drag.t);
drag.vx = drag.vx * .6 + (dx / dt * 1000) * .4;
drag.vy = drag.vy * .6 + (dy / dt * 1000) * .4;
drag.t = now;

if (e.cancelable) e.preventDefault();
requestRender();
}

function onUp(e) {
if (!drag.active) return;
if (e && e.pointerId !== undefined && e.pointerId !== drag.id) return;
drag.active = false;
box.classList.remove('is-dragging');
try {
if (box.hasPointerCapture && box.hasPointerCapture(drag.id)) box.releasePointerCapture(drag.id);
} catch (err) {}

var idle = performance.now() - drag.t;
if (!reduced && idle < 90) {
var max = 2.8;
var yaw = Math.max(-max, Math.min(max, drag.vx * SPEED));
var pitch = Math.max(-max, Math.min(max, drag.vy * SPEED));
if (Math.abs(yaw) + Math.abs(pitch) > .18) {
inertia.active = true;
inertia.yaw = yaw;
inertia.pitch = pitch;
}
}
requestRender();
}

function onKey(e) {
var step = Math.PI / 16;
var handled = true;
switch (e.key) {
case 'ArrowLeft': nudge(-step, 0); break;
case 'ArrowRight': nudge(step, 0); break;
case 'ArrowUp': nudge(0, -step); break;
case 'ArrowDown': nudge(0, step); break;
default: handled = false;
}
if (!handled) return;
e.preventDefault();
interruptIntro();
inertia.active = false;
requestRender();
}

box.addEventListener('pointerdown', onDown, { passive: false });
box.addEventListener('pointermove', onMove, { passive: false });
box.addEventListener('pointerup', onUp);
box.addEventListener('pointercancel', onUp);
box.addEventListener('lostpointercapture', onUp);
box.addEventListener('keydown', onKey);
box.addEventListener('dragstart', function (e) { e.preventDefault(); });
box.addEventListener('contextmenu', function (e) { e.preventDefault(); });

/* ---------- 尺寸 ---------- */
function onResize() {
if (!renderer) return;
var w = box.clientWidth;
var h = box.clientHeight;
if (!w || !h || (w === width && h === height)) return;
width = w; height = h;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(w, h, false);
camera.aspect = w / h;
camera.updateProjectionMatrix();
requestRender();
}

/* ---------- 光照：RoomEnvironment + 柔光箱组，PMREM 成 IBL（产品宣传向） ---------- */
function addPanels(s, mult) {
function panel(w, h, color, intensity, pos) {
var geo = new THREE.PlaneGeometry(w, h);
var mat = new THREE.MeshBasicMaterial({ color: color, side: THREE.DoubleSide });
mat.color.multiplyScalar(intensity * mult);
var mesh = new THREE.Mesh(geo, mat);
mesh.position.set(pos[0], pos[1], pos[2]);
mesh.lookAt(0, 0, 0);
s.add(mesh);
}
panel(7.2, 4.0, 0xfff3e4, 5.2, [1.4, 5.0, 2.6]);   /* 主光：更大更亮的柔光箱 */
panel(3.4, 4.8, 0xd7e4ff, 1.35, [-4.6, .6, 1.2]);  /* 冷调补光：拉开明暗 */
panel(2.0, 3.6, 0xffe7c8, 2.1, [4.6, .4, .6]);     /* 暖调侧光：金属高光 */
panel(4.2, 0.9, 0xffffff, 3.4, [0, 2.8, -4.8]);    /* 轮廓条灯：边缘刀锋感 */
panel(1.2, 4.0, 0xcfe0ff, 1.8, [-2.8, 1.2, -3.6]); /* 冷侧逆光 */
panel(5.6, 2.6, 0xfff8ef, 1.35, [.3, .35, 4.8]);   /* 正面大面积柔光 */
panel(4.2, 1.2, 0x8fa3c4, .55, [0, -3.6, 1.6]);    /* 底部反射 */
}

function setup() {
width = box.clientWidth || 1;
height = box.clientHeight || 1;

try {
renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
} catch (err) {
failStatic(err);
return;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(width, height, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = LOOK.exposure;
renderer.setClearColor(0x000000, 0);
mount.appendChild(renderer.domElement);

scene = new THREE.Scene();
var pmrem = new THREE.PMREMGenerator(renderer);
var envScene = new L3.RoomEnvironment();
addPanels(envScene, LOOK.panelMult);
scene.environment = pmrem.fromScene(envScene, .03).texture;
pmrem.dispose();
if (envScene.dispose) envScene.dispose();

camera = new THREE.PerspectiveCamera(30, width / height, .1, 100);
camera.position.set(0, .045, 3.5);
camera.lookAt(0, .012, 0);

var key = new THREE.DirectionalLight(0xfff0dc, LOOK.key);
key.position.set(2.8, 4.8, 3.0);
var fill = new THREE.DirectionalLight(0xd0e0ff, LOOK.fill);
fill.position.set(-3.8, .4, -1.2);
var rim = new THREE.DirectionalLight(0xffffff, LOOK.rim);
rim.position.set(-1.6, 3.0, -4.6);
var rim2 = new THREE.DirectionalLight(0xa8c4ff, LOOK.rim2);
rim2.position.set(3.0, -1.8, -3.4);
var top = new THREE.DirectionalLight(0xf8fbff, LOOK.top);
top.position.set(.2, 6, .4);
var kick = new THREE.DirectionalLight(0xffe8c8, .55); /* 底部暖反弹，压住死黑 */
kick.position.set(-.6, -3.2, 2.2);
scene.add(key, fill, rim, rim2, top, kick);
scene.add(new THREE.HemisphereLight(0xeef3ff, 0x6a7388, LOOK.hemi));

if (window.ResizeObserver) new ResizeObserver(onResize).observe(box);
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', onResize);

/* WebGL 上下文丢失时退回静态底图，恢复后重新淡入 */
renderer.domElement.addEventListener('webglcontextlost', function (e) {
e.preventDefault();
box.classList.remove('is-live');
}, false);
renderer.domElement.addEventListener('webglcontextrestored', function () {
box.classList.add('is-live');
requestRender();
}, false);

try {
var loader = new L3.GLTFLoader();
loader.parse(b64ToArrayBuffer(b64), '', build, failStatic);
} catch (err) {
failStatic(err);
}
}

/* ---------- 模型：居中、统一尺度、材质微调 ---------- */
function build(gltf) {
model = gltf.scene || (gltf.scenes && gltf.scenes[0]);
if (!model) throw new Error('GLTF has no scene');

/* 居中：先对未缩放模型求包围盒，再按统一尺度缩放并二次居中 */
var bbox = new THREE.Box3().setFromObject(model);
var size = bbox.getSize(new THREE.Vector3());
var center = bbox.getCenter(new THREE.Vector3());
model.position.sub(center);
var maxDim = Math.max(size.x, size.y, size.z) || 1;
model.scale.setScalar(LOOK.targetSize / maxDim);
bbox.setFromObject(model);
bbox.getCenter(center);
model.position.sub(center);

var maxAniso = renderer.capabilities.getMaxAnisotropy();
var coated = [];
function coatOf(src) {
for (var ci = 0; ci < coated.length; ci++) if (coated[ci].src === src) return coated[ci].dst;
var pm = new THREE.MeshPhysicalMaterial({
color: src.color ? src.color.clone() : 0xffffff,
map: src.map || null,
normalMap: src.normalMap || null,
normalScale: src.normalScale ? src.normalScale.clone() : new THREE.Vector2(1, 1),
roughness: src.roughness,
metalness: src.metalness,
envMapIntensity: src.envMapIntensity,
side: src.side,
transparent: src.transparent,
opacity: src.opacity,
alphaTest: src.alphaTest,
depthWrite: src.depthWrite,
name: src.name
});
pm.roughnessMap = src.roughnessMap || null;
pm.metalnessMap = src.metalnessMap || null;
pm.aoMap = src.aoMap || null;
pm.emissive = src.emissive ? src.emissive.clone() : new THREE.Color(0);
pm.emissiveMap = src.emissiveMap || null;
pm.clearcoat = LOOK.clearcoat;
pm.clearcoatRoughness = LOOK.clearcoatRoughness;
coated.push({ src: src, dst: pm });
return pm;
}

model.traverse(function (o) {
if (!o.isMesh) return;
var isArr = Array.isArray(o.material);
var mats = isArr ? o.material : [o.material];
for (var i = 0; i < mats.length; i++) {
var m = mats[i];
if (!m) continue;
/* 碳纤后盖 / 高光黑塑料 / deco 加一层清漆，模拟树脂与镀膜的反光 */
if (m.name && /后盖|high gloss plastic|deco/.test(m.name)) {
m = coatOf(m);
mats[i] = m;
if (isArr) o.material[i] = m; else o.material = m;
}
/* 正面屏幕：加强玻璃盖板的柔光反射，避免停在中转到正面时是一块死黑 */
var isScreen = !!(m.name && m.name.indexOf('屏幕-1') === 0);
if (isScreen) {
m.roughness = .03;
m.metalness = 0;
m.envMapIntensity = 3.0;
if (m.clearcoat !== undefined) {
m.clearcoat = 1;
m.clearcoatRoughness = .045;
m.specularIntensity = 1;
if (m.specularColor) m.specularColor.setRGB(1, 1, 1);
}
}
if (m.map) { m.map.anisotropy = maxAniso; m.map.needsUpdate = true; }
if (m.normalMap) {
m.normalMap.anisotropy = maxAniso;
if (m.normalScale) m.normalScale.setScalar(.9);
}
if (!isScreen && m.envMapIntensity !== undefined) m.envMapIntensity = (m.metalness || 0) > .45 ? 1.55 : 1.18;
m.needsUpdate = true;
}
});

/* 旋转轴心放在模型几何中心：模型自身保持不转，转 pivot */
pivot = new THREE.Group();
pivot.add(model);
pivot.quaternion.copy(restQuat);
if (reduced) intro.done = true;
scene.add(pivot);

onResize();
renderNow();
/* 首帧就绪后淡入画布；入场旋转在区块进入视口时才开始 */
requestAnimationFrame(function () {
box.classList.add('is-live');
if (!intro.done) armIntro();
});
}

setup();
}

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

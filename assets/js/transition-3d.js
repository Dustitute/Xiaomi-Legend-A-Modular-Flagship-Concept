
/* ------------------------------------------------------------------
过渡页 3D：手机背面暗场 + 单束斜光 + 万象环彩虹发光 + 星环模块
· 光照：暗房 PMREM 环境（柔和金属反射）+ 一盏带阴影的斜向 SpotLight
· 交互：鼠标横向改色相、纵向改亮度，并让高光弧跟随鼠标绕环移动
· 性能：仅进入视口时跑 rAF；离开即停帧
------------------------------------------------------------------ */
(function () {
'use strict';

var root = null;
var S = null;
var raf = 0;

/* ============ 小工具 ============ */
function b64buf(str) {
var bin = atob(str), n = bin.length, u = new Uint8Array(n);
for (var i = 0; i < n; i++) u[i] = bin.charCodeAt(i);
return u.buffer;
}
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

/* 叠加发光：只加颜色，不写入 alpha（否则画布透明度会饱和成硬边） */
function additive(THREE, m) {
m.transparent = true;
m.depthWrite = false;
m.blending = THREE.CustomBlending;
m.blendEquation = THREE.AddEquation;
m.blendSrc = THREE.SrcAlphaFactor;
m.blendDst = THREE.OneFactor;
m.blendSrcAlpha = THREE.ZeroFactor;
m.blendDstAlpha = THREE.OneFactor;
return m;
}

var GLSL_HSV = [
'vec3 hsv2rgb(vec3 c){',
'  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);',
'  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);',
'  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);',
'}'
].join('\n');

var VERT_RING = [
'varying vec2 vP;',
'void main(){',
'  vP = position.xy;',
'  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
'}'
].join('\n');

/* 环带本体：按角度上色，边缘柔化，鼠标方位多一段亮弧 */
var FRAG_CORE = [
'precision highp float;',
'uniform float uTime, uHue, uHot, uGain, uInner, uOuter, uIgnite, uEnergy;',
'varying vec2 vP;',
GLSL_HSV,
'void main(){',
'  float r = length(vP);',
'  float band = max(0.0001, uOuter - uInner);',
'  float t = clamp((r - uInner) / band, 0.0, 1.0);',
'  float a = atan(vP.y, vP.x);',
'  float h = fract(a / 6.2831853 + uTime * 0.042 + uHue + 0.30);',
'  vec3 col = hsv2rgb(vec3(h, 0.80, 0.92));',
'  float hot = pow(max(0.0, cos(a - uHot)), 5.0);',
'  float shade = 0.62 + 0.38 * sin(t * 3.14159265);',
'  float edge = smoothstep(0.0, 0.09, t) * (1.0 - smoothstep(0.91, 1.0, t));',
'  float amt = shade * (0.75 + 1.35 * hot) * edge * uIgnite * uEnergy;',
'  vec3 c2 = mix(col, vec3(1.0), hot * 0.30);',
'  gl_FragColor = vec4(c2 * uGain * amt, 1.0);',
'}'
].join('\n');

/* 外扩辉光：以环带为峰值的柔光 */
var FRAG_BLOOM = [
'precision highp float;',
'uniform float uTime, uHue, uHot, uGain, uInner, uOuter, uIgnite, uEnergy;',
'varying vec2 vP;',
GLSL_HSV,
'void main(){',
'  float r = length(vP);',
'  float mid = (uInner + uOuter) * 0.5;',
'  float d = (r - mid) / max(0.0001, (uOuter - uInner) * 0.5);',
'  float prof = exp(-d * d * 0.26);',
'  float a = atan(vP.y, vP.x);',
'  float h = fract(a / 6.2831853 + uTime * 0.042 + uHue + 0.30);',
'  vec3 col = hsv2rgb(vec3(h, 0.72, 0.86));',
'  float hot = pow(max(0.0, cos(a - uHot)), 3.0);',
'  float amt = prof * (0.34 + 0.66 * hot) * uIgnite * uEnergy;',
'  gl_FragColor = vec4(col * uGain * amt, 1.0);',
'}'
].join('\n');

/* ============ 入口 ============ */
function init() {
root = document.getElementById('orbit');
if (!root) return;
initCopy();
setupPoster();
if (!window.Legend3D || !window.LEGEND_GLB_B64) { fail('3D 依赖未加载'); return; }
try { start(); } catch (e) { fail(e); }
}

/* 文案逐条上浮：等文案块自己进入视口才播，早于它不播 */
function initCopy() {
var items = root.querySelectorAll('.orb-copy > *');
if (!items.length) return;
var L = window.Legend || {};
var gsap = window.gsap || L.gsap;
var ST = window.ScrollTrigger || L.ScrollTrigger;
var reduce = !!(L.reduceMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches);
if (!gsap || !ST || reduce) {
for (var i = 0; i < items.length; i++) {
items[i].style.opacity = '1';
items[i].style.transform = 'none';
}
return;
}
gsap.set(items, { y: 34, autoAlpha: 0 });
ST.create({
trigger: root.querySelector('.orb-copy'),
start: 'top 88%',
once: true,
onEnter: function () {
gsap.to(items, {
y: 0, autoAlpha: 1, duration: 0.95,
stagger: 0.12, ease: 'power3.out', overwrite: true
/* 不要 clearProps:'transform'：这两个元素同时带 data-reveal，
   CSS 的 html.js [data-reveal]{transform:translateY(28px)} 会立刻重新生效，
   动画刚结束文字就会被 CSS 拉回去 28px（首次滚到万象环时标题“顿一下”的原因） */
});
}
});
}

function setupPoster() {
var poster = root.querySelector('[data-orb-poster] img');
if (!poster || poster.getAttribute('src')) return;
var src = document.querySelector('#phone-body .s9-banner-media img');
if (src && src.getAttribute('src')) {
poster.setAttribute('src', src.getAttribute('src'));
} else {
poster.parentNode.style.display = 'none';
}
}

function fail(err) {
if (window.console && console.warn) console.warn('[orbit] 回退静态视图', err);
if (!root) return;
root.classList.add('is-fallback');
buildFallbackRing();
}

/* 无 WebGL：把模块图沿椭圆摆一圈 */
function buildFallbackRing() {
var list = root.querySelector('[data-orb-ring]');
if (!list) return;
var items = list.querySelectorAll('li');
var n = items.length;
for (var i = 0; i < n; i++) {
var a = (i / n) * Math.PI * 2 - Math.PI / 2;
items[i].style.left = (50 + Math.cos(a) * 40) + '%';
items[i].style.top = (50 + Math.sin(a) * 34) + '%';
}
}

/* ============ 主逻辑 ============ */
function start() {
var L3 = window.Legend3D;
var THREE = L3.THREE;
var stage = root.querySelector('[data-orb-stage]');
var mount = root.querySelector('[data-orb-mount]');
if (!stage || !mount) return;

var calm = !!(window.Legend && window.Legend.reduceMotion);

S = {
THREE: THREE, L3: L3, calm: calm,
stage: stage, mount: mount,
w: 0, h: 0,
renderer: null, scene: null, camera: null,
world: null, phoneRoot: null, pivot: null,
orbitTilt: null, orbitSpin: null, orbitLine: null,
matCore: null, matBloom: null, band: null,
mods: [], glows: [], key: null,
particles: null, pPos: null, pN: 0,
mx: 0, my: 0, tx: 0, ty: 0,
px: 0, py: 0, hot: 0, hotT: 0, hotRaw: 0, hasHot: false, hue: 0, hueT: 0,
spin: 0, t: 0, last: 0, frames: 0,
ignite: 0, igniteTarget: 0,
running: false, visible: false, ready: false, live: false,
R: 1.0, flat: 0.72, shift: 0, modelSize: null
};
if (window.Legend) window.Legend.debugSet('orbit', S);

var renderer;
try {
renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
} catch (e) { fail(e); return; }
S.renderer = renderer;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.02;
renderer.setClearColor(0x000000, 0);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
mount.appendChild(renderer.domElement);

var scene = S.scene = new THREE.Scene();
var camera = S.camera = new THREE.PerspectiveCamera(26, 1, 0.1, 100);
camera.position.set(0, 0, 6.5);
camera.lookAt(0, 0, 0);

buildEnvironment(renderer, scene, THREE);

/* 主光：一束斜向硬光，带阴影 */
var key = S.key = new THREE.SpotLight(0xfff2e0, 62, 0, 0.38, 0.62, 1.15);
key.position.set(-4.2, 3.9, 5.2);
key.target.position.set(0.1, -0.2, 0);
key.castShadow = true;
key.shadow.mapSize.width = 1024;
key.shadow.mapSize.height = 1024;
key.shadow.camera.near = 2;
key.shadow.camera.far = 20;
key.shadow.bias = -0.0015;
key.shadow.normalBias = 0.012;
key.shadow.radius = 4;
scene.add(key);
scene.add(key.target);

/* 辅助：极弱补光 + 两侧轮廓光，只用来勾边 */
var fill = new THREE.DirectionalLight(0x9fb2dd, 0.30);
fill.position.set(3.4, -1.2, 3.2);
var rimL = new THREE.DirectionalLight(0xdfe8ff, 0.80);
rimL.position.set(-3.4, 1.6, -3.0);
var rimR = new THREE.DirectionalLight(0xcfe0ff, 0.42);
rimR.position.set(3.8, -0.4, -3.4);
var topL = new THREE.DirectionalLight(0xffffff, 0.12);
topL.position.set(0.4, 4.4, -1.2);
scene.add(fill, rimL, rimR, topL);
scene.add(new THREE.HemisphereLight(0x2a3245, 0x04050a, 0.14));

/* 组层级 */
var world = S.world = new THREE.Group();
scene.add(world);
var phoneRoot = S.phoneRoot = new THREE.Group();
world.add(phoneRoot);

var tilt = S.orbitTilt = new THREE.Group();
tilt.rotation.set(-1.26, 0.10, -0.05);
world.add(tilt);
var spin = S.orbitSpin = new THREE.Group();
tilt.add(spin);
S.ringLift = 0;

/* 静态椭圆轨道线（不随 spin 转） */
var lineMat = additive(THREE, new THREE.MeshBasicMaterial({
color: 0x93a8dc, opacity: 0.14, side: THREE.DoubleSide
}));
var orbitLine = new THREE.Mesh(new THREE.RingGeometry(0.9965, 1.0035, 200, 1), lineMat);
orbitLine.scale.y = S.flat;
orbitLine.renderOrder = 1;
tilt.add(orbitLine);
S.orbitLine = orbitLine;

/* 加载模型 */
var loader = new L3.GLTFLoader();
loader.parse(b64buf(window.LEGEND_GLB_B64), '', function (gltf) {
try { build(gltf, THREE); } catch (e) { fail(e); }
}, fail);

/* ---- 尺寸 ---- */
/* 文案在画布坐标里的起始位置（0 = 画布顶，1 = 画布底） */
function copyFraction() {
var copy = root.querySelector('.orb-copy');
if (!copy) return 0.78;
var sr = stage.getBoundingClientRect();
var cr = copy.getBoundingClientRect();
var h = sr.height || 1;
return clamp((cr.top - sr.top) / h, 0, 1);
}
S.copyFraction = copyFraction;

function resize() {
if (!S.renderer) return;
var w = stage.clientWidth || 1;
var h = stage.clientHeight || 1;
if (w === S.w && h === S.h) return;
S.w = w; S.h = h;
S.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
S.renderer.setSize(w, h, false);
S.camera.aspect = w / h;
S.camera.updateProjectionMatrix();
applyLayout(copyFraction());
requestRender();
}

if (window.ResizeObserver) new ResizeObserver(function () { resize(); }).observe(stage);
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);

/* ---- 鼠标 ---- */
function onMove(e) {
var r = stage.getBoundingClientRect();
S.px = e.clientX - r.left;
S.py = e.clientY - r.top;
S.tx = clamp((S.px / r.width) * 2 - 1, -1, 1);
S.ty = clamp((S.py / r.height) * 2 - 1, -1, 1);
S.hueT = S.tx * 0.55;
var cp = screenCenter();
var ang = Math.atan2(-(S.py - cp.y), S.px - cp.x);
if (!S.hasHot) {
/* 第一次进来直接对齐，避免从 0 开始扫一圈 */
S.hasHot = true;
S.hotRaw = ang;
S.hotT = ang;
S.hot = ang;
} else {
var d = ang - S.hotRaw;
while (d > Math.PI) d -= Math.PI * 2;
while (d < -Math.PI) d += Math.PI * 2;
S.hotT += d;
S.hotRaw = ang;
}
}
function onLeave() {
S.tx = 0; S.ty = 0; S.hueT = 0;
}
root.addEventListener('pointermove', onMove, { passive: true });
root.addEventListener('pointerleave', onLeave, { passive: true });

function screenCenter() {
var three = S.THREE;
var v = new three.Vector3(0, S.shift, 0);
v.project(S.camera);
return { x: (v.x * 0.5 + 0.5) * S.w, y: (-v.y * 0.5 + 0.5) * S.h };
}

/* ---- 可见性：离开视口停帧 ---- */
if ('IntersectionObserver' in window) {
new IntersectionObserver(function (entries) {
for (var i = 0; i < entries.length; i++) {
var e = entries[i];
S.visible = e.isIntersecting;
if (!e.isIntersecting) { stopRender(); continue; }
requestRender();
/* 露头不算，等这一屏基本铺满（55%）再淡入并点亮 */
if (e.intersectionRatio >= 0.55 && S.goLive) S.goLive();
}
}, { threshold: [0, 0.2, 0.55, 0.8, 1], rootMargin: '0px' }).observe(root);
} else {
S.visible = true;
}

/* 进入视口才让画布淡入、并点亮彩虹环（星环只渐显，不做位移） */
function goLive() {
if (!S || S.live || !S.ready || !S.visible) return;
S.live = true;
root.classList.add('is-live');
S.igniteTarget = 1;
requestRender();
}
S.goLive = goLive;

function requestRender() {
if (!S || S.running || !S.renderer || !S.ready || !S.visible) return;
S.running = true;
S.last = performance.now();
raf = requestAnimationFrame(tick);
}
function stopRender() {
if (!S) return;
S.running = false;
if (raf) cancelAnimationFrame(raf);
raf = 0;
}
S.requestRender = requestRender;
S.stopRender = stopRender;
}

/* ---------- 暗房环境：让金属有方向感，整体压暗 ---------- */
function buildEnvironment(renderer, scene, THREE) {
var env = new THREE.Scene();
env.add(new THREE.Mesh(
new THREE.BoxGeometry(26, 18, 26),
new THREE.MeshBasicMaterial({ color: 0x07080d, side: THREE.BackSide })
));

function panel(w, h, color, mul, pos) {
var m = new THREE.MeshBasicMaterial({ color: color });
m.color.multiplyScalar(mul);
var mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
mesh.position.set(pos[0], pos[1], pos[2]);
mesh.lookAt(0, 0, 0);
env.add(mesh);
}
panel(3.4, 7.6, 0xfff2e2, 3.4, [-7.2, 5.6, 6.8]);  /* 主柔光条：左上竖向高光 */
panel(0.9, 7.2, 0xffffff, 5.2, [-5.5, 4.6, 7.4]);  /* 核心细条灯：镜面反射更利 */
panel(1.4, 9, 0x9db6ff, 0.55, [7.4, 1.2, 3.6]);    /* 右侧冷调条灯 */
panel(0.7, 12, 0xffffff, 0.95, [0.8, 1.4, -9.2]);  /* 背后轮廓条灯 */
panel(16, 2.4, 0x60708f, 0.26, [0, -7.6, 1.5]);    /* 底部反弹 */

var pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(env, 0.04).texture;
pmrem.dispose();
env.traverse(function (o) {
if (o.isMesh) {
o.geometry.dispose();
if (o.material) o.material.dispose();
}
});
}

/* ---------- 模型构建 ---------- */
function build(gltf, THREE) {
var scene = S.scene;
var model = gltf.scene || (gltf.scenes && gltf.scenes[0]);
if (!model) throw new Error('GLTF 无场景');

var box = new THREE.Box3().setFromObject(model);
var size = box.getSize(new THREE.Vector3());
var center = box.getCenter(new THREE.Vector3());
model.position.sub(center);
var pivot = new THREE.Group();
pivot.add(model);
S.phoneRoot.add(pivot);
S.pivot = pivot;
S.modelSize = size;

/* 材质：真实 PBR —— 清漆、环境反射、各向异性 */
var maxAniso = S.renderer.capabilities.getMaxAnisotropy();
model.traverse(function (o) {
if (!o.isMesh) return;
var m = o.material;
if (!m) return;
o.receiveShadow = true;
o.castShadow = !m.transparent;

var name = m.name || '';
if (m.map) { m.map.anisotropy = maxAniso; m.map.needsUpdate = true; }
if (m.normalMap) {
m.normalMap.anisotropy = maxAniso;
if (m.normalScale) m.normalScale.setScalar(0.85);
}

/* 默认环境反射强度：压得低，只保留方向感 */
if (m.envMapIntensity !== undefined) m.envMapIntensity = 0.24;

if (/后盖|deco|中框/.test(name) && m.isMeshPhysicalMaterial) {
m.clearcoat = Math.min(1, (m.clearcoat || 0) + 0.60);
m.clearcoatRoughness = 0.15;
}
if (/后盖/.test(name)) {
m.roughness = Math.min(0.60, m.roughness);
m.envMapIntensity = 0.52;
if (m.color) m.color.multiplyScalar(0.30);
m.clearcoat = 0.82;
m.clearcoatRoughness = 0.20;
}
if (/镜头玻璃-1_[01]/.test(name)) { m.envMapIntensity = 1.05; m.roughness = 0.045; }
if (/^镜头-1_/.test(name)) { m.envMapIntensity = 0.5; }
if (/sandblasted|中框-3_0|按键/.test(name)) { m.envMapIntensity = 0.85; }
if (/Mi Logo/.test(name)) { m.envMapIntensity = 1.0; }
if (/^deco-1_/.test(name)) { m.envMapIntensity = 0.55; if (m.color) m.color.multiplyScalar(0.8); }
if (/^屏幕-1_/.test(name)) { m.envMapIntensity = 0.30; m.roughness = 0.05; }
if (m.emissive) m.emissiveIntensity = 0.9;
m.needsUpdate = true;
});

/* 定位：万象环 / 触点 / 顶针 / 红色光口 */
var bandParts = [], contactPart = null, pinParts = [], redPart = null;
model.traverse(function (o) {
if (!o.isMesh) return;
var n = (o.material && o.material.name) || '';
if (n === 'LaserLink传输环-1_0' || n === 'LaserLink传输环-1_1') bandParts.push(o);
else if (n === 'LaserLink传输环-1_2') { if (!redPart) redPart = o; }
else if (/^触点-1_/.test(n)) { if (!contactPart) contactPart = o; }
else if (/^LaserLink顶针-1_/.test(n)) pinParts.push(o);
});

/* 测量前归零世界变换：量到的坐标就是 phoneRoot 局部坐标 */
S.world.position.set(0, 0, 0);
S.world.rotation.set(0, 0, 0);
S.phoneRoot.position.set(0, 0, 0);
S.phoneRoot.scale.setScalar(1);
scene.updateMatrixWorld(true);

if (bandParts.length) {
var bb = new THREE.Box3();
for (var i = 0; i < bandParts.length; i++) bb.expandByObject(bandParts[i]);
var c = bb.getCenter(new THREE.Vector3());
var rMin = Infinity, rMax = 0;
var v3 = new THREE.Vector3();
for (var j = 0; j < bandParts.length; j++) {
var pos = bandParts[j].geometry.attributes.position;
for (var k = 0; k < pos.count; k++) {
v3.fromBufferAttribute(pos, k).applyMatrix4(bandParts[j].matrixWorld);
var rr = Math.hypot(v3.x - c.x, v3.y - c.y);
if (rr > rMax) rMax = rr;
if (rr < rMin) rMin = rr;
}
}
S.band = { x: c.x, y: c.y, z: bb.max.z, inner: rMin, outer: rMax };
buildBand(THREE, S.band);
}

buildGlows(THREE, contactPart, pinParts, redPart);
buildRingDust(THREE);
buildOrbitModules(THREE);
buildStars(THREE);
buildParticles(THREE);

applyLayout(S.copyFraction ? S.copyFraction() : 0.35);
S.ready = true;
S.renderer.render(scene, S.camera);
root.classList.add('is-built');
requestAnimationFrame(function () { if (S.goLive) S.goLive(); });
}

/* ---------- 万象环：彩虹环 + 外扩辉光 ---------- */
function buildBand(THREE, band) {
var inner = band.inner, outer = band.outer;
function mk(frag, gain) {
var mat = new THREE.ShaderMaterial({
vertexShader: VERT_RING,
fragmentShader: frag,
uniforms: {
uTime: { value: 0 }, uHue: { value: 0 }, uHot: { value: 0 },
uGain: { value: gain }, uInner: { value: inner }, uOuter: { value: outer },
uIgnite: { value: 0 }, uEnergy: { value: 1 }
},
depthTest: false,
side: THREE.DoubleSide
});
return additive(THREE, mat);
}

var core = new THREE.Mesh(new THREE.RingGeometry(inner * 0.985, outer * 1.01, 240, 1), mk(FRAG_CORE, 0.52));
core.position.set(band.x, band.y, band.z + 0.0004);
core.renderOrder = 5;
S.matCore = core.material;

var mid = (inner + outer) * 0.5;
var bloom = new THREE.Mesh(new THREE.RingGeometry(mid * 0.42, outer * 1.9, 200, 1), mk(FRAG_BLOOM, 0.55));
bloom.position.set(band.x, band.y, band.z + 0.0003);
bloom.renderOrder = 4;
S.matBloom = bloom.material;

S.phoneRoot.add(core, bloom);
}

/* ---------- 触点 / 顶针 / 光口 ---------- */
function glowTexture(THREE) {
var c = document.createElement('canvas');
c.width = c.height = 128;
var g = c.getContext('2d');
var gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
gr.addColorStop(0, 'rgba(255,255,255,1)');
gr.addColorStop(0.24, 'rgba(255,255,255,.74)');
gr.addColorStop(0.56, 'rgba(255,255,255,.18)');
gr.addColorStop(1, 'rgba(255,255,255,0)');
g.fillStyle = gr;
g.fillRect(0, 0, 128, 128);
var t = new THREE.CanvasTexture(c);
t.colorSpace = THREE.SRGBColorSpace;
return t;
}

/* 沿 X 轴聚类顶点：把发光点对准模型上真实的小圆点（触点 / 顶针） */
function clusterAxis(THREE, mesh, tol, minVerts, yMax) {
var pos = mesh.geometry.attributes.position;
var v = new THREE.Vector3();
var list = [];
for (var i = 0; i < pos.count; i++) {
v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
if (yMax !== null && v.y > yMax) continue;
list.push({ x: v.x, y: v.y, z: v.z });
}
if (!list.length) return [];
list.sort(function (a, b) { return a.x - b.x; });
var groups = [], cur = [list[0]];
for (var j = 1; j < list.length; j++) {
if (list[j].x - list[j - 1].x > tol) { groups.push(cur); cur = []; }
cur.push(list[j]);
}
groups.push(cur);
var out = [];
for (var k = 0; k < groups.length; k++) {
var g = groups[k];
if (g.length < minVerts) continue;
var sx = 0, sy = 0, sz = 0;
for (var q = 0; q < g.length; q++) { sx += g[q].x; sy += g[q].y; sz += g[q].z; }
out.push({ x: sx / g.length, y: sy / g.length, z: sz / g.length, n: g.length });
}
return out;
}

function buildGlows(THREE, contactPart, pinParts, redPart) {
var tex = glowTexture(THREE);
S.glowTex = tex;
var box = new THREE.Box3();
var v3 = new THREE.Vector3();

function glowAt(x, y, z, w, h, color, opacity, pulse) {
var m = additive(THREE, new THREE.MeshBasicMaterial({
map: tex, color: color, opacity: 0, depthTest: false, side: THREE.DoubleSide
}));
var mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
mesh.position.set(x, y, z);
mesh.renderOrder = 6;
S.phoneRoot.add(mesh);
S.glows.push({ mat: m, base: opacity, pulse: pulse, phase: Math.random() * 6.283 });
}

/* 触点：4 枚铜柱，按真实圆心定位 */
if (contactPart) {
box.setFromObject(contactPart);
var cz = box.max.z;
var bandTop = box.min.y + (box.max.y - box.min.y) * 0.30;
var dots = clusterAxis(THREE, contactPart, 0.0016, 10, bandTop);
dots.sort(function (a, b) { return b.n - a.n; });
dots = dots.slice(0, 4);
dots.sort(function (a, b) { return a.x - b.x; });

S.portDebug = { dots: dots.length, pins: 0, dotX: [], pinX: [] };
for (var dq = 0; dq < dots.length; dq++) S.portDebug.dotX.push(+dots[dq].x.toFixed(4));

/* 环心与中径：把发光点放到彩虹带的正中 */
var rx0 = S.band ? S.band.x : 0;
var ry0 = S.band ? S.band.y : 0;
var rMid = S.band ? (S.band.inner + S.band.outer) * 0.5 : 0.0297;
var zBand = S.band ? S.band.z + 0.0009 : cz + 0.0009;

if (dots.length === 4) {
for (var ci = 0; ci < 4; ci++) {
var dx0 = dots[ci].x - rx0;
var yy0 = ry0 - Math.sqrt(Math.max(1e-6, rMid * rMid - dx0 * dx0));
glowAt(dots[ci].x, yy0, zBand, 0.0050, 0.0050, 0xffdca8, 0.95, 0.15);
}
} else {
var cw = (box.min.x + box.max.x) * 0.5;
var step0 = (box.max.x - box.min.x) * 0.225;
for (var cj = 0; cj < 4; cj++) {
var dx1 = cw + (cj - 1.5) * step0 - rx0;
var yy1 = ry0 - Math.sqrt(Math.max(1e-6, rMid * rMid - dx1 * dx1));
glowAt(cw + (cj - 1.5) * step0, yy1, zBand, 0.0050, 0.0050, 0xffdca8, 0.95, 0.15);
}
}
}

/* 顶针：两颗银针头，取聚类结果的两个最大团 */
if (pinParts.length) {
var silver = null;
for (var i = 0; i < pinParts.length; i++) {
var nm = (pinParts[i].material && pinParts[i].material.name) || '';
if (/顶针-1_2$/.test(nm)) { silver = pinParts[i]; break; }
}
var pins = silver ? clusterAxis(THREE, silver, 0.0012, 8, null) : [];
pins.sort(function (a, b) { return b.n - a.n; });
pins = pins.slice(0, 2);
pins.sort(function (a, b) { return a.x - b.x; });

S.portDebug.pins = pins.length;
for (var pq = 0; pq < pins.length; pq++) S.portDebug.pinX.push(+pins[pq].x.toFixed(4));

if (pins.length === 2) {
for (var pi = 0; pi < 2; pi++) {
glowAt(pins[pi].x, pins[pi].y, pins[pi].z + 0.0011, 0.0034, 0.0034, 0xe6f0ff, 0.95, 0.18);
}
} else {
var pb = new THREE.Box3();
for (var pj = 0; pj < pinParts.length; pj++) pb.expandByObject(pinParts[pj]);
var py = (pb.min.y + pb.max.y) * 0.5;
var half = (pb.max.x - pb.min.x) * 0.42;
glowAt((pb.min.x + pb.max.x) * 0.5 - half, py, pb.max.z + 0.0011, 0.0034, 0.0034, 0xe6f0ff, 0.95, 0.18);
glowAt((pb.min.x + pb.max.x) * 0.5 + half, py, pb.max.z + 0.0011, 0.0034, 0.0034, 0xe6f0ff, 0.95, 0.18);
}
}

/* 红色光口：LaserLink —— 普通混合压住彩虹，保证读成红色 */
if (redPart) {
var rb = new THREE.Box3().setFromObject(redPart);
var rsz = rb.getSize(v3);
if (redPart.material) {
redPart.material.emissive = new THREE.Color(0xff1b1b);
redPart.material.emissiveIntensity = 1.4;
redPart.material.needsUpdate = true;
}
var rx = (rb.min.x + rb.max.x) * 0.5;
var ry = (rb.min.y + rb.max.y) * 0.5;
var rz = rb.max.z;

var coreMat = new THREE.MeshBasicMaterial({
map: tex, color: 0xff2233, transparent: true, opacity: 0,
depthWrite: false, depthTest: false, side: THREE.DoubleSide
});
var coreMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.0078, 0.0078), coreMat);
coreMesh.position.set(rx, ry, rz + 0.0010);
coreMesh.renderOrder = 6;
S.phoneRoot.add(coreMesh);
S.glows.push({ mat: coreMat, base: 0.95, pulse: 0.14, phase: 0.7 });

glowAt(rx, ry, rz + 0.0013, 0.026, 0.026, 0xff3a24, 0.55, 0.22);
}
}

/* 环带底光：让尘埃不是散点，而是一条连续的发光簿环 */
var FRAG_BAND = [
'precision highp float;',
'uniform float uTime, uHue, uGain, uIgnite;',
'varying vec2 vP;',
GLSL_HSV,
'void main(){',
'  float r = length(vP);',
'  float a = atan(vP.y, vP.x);',
'  float d = (r - 1.0) / 0.165;',
'  float prof = exp(-d * d * 1.15);',
'  /* 两道卡西尼缝 */',
'  float g1 = 1.0 - 0.55 * (1.0 - smoothstep(0.0, 0.115, abs(a - 0.85)));',
'  float g2 = 1.0 - 0.45 * (1.0 - smoothstep(0.0, 0.090, abs(a - 3.95)));',
'  float h = fract(a / 6.2831853 + uTime * 0.042 + uHue + 0.30);',
'  vec3 col = hsv2rgb(vec3(h, 0.55, 0.75));',
'  gl_FragColor = vec4(col * prof * g1 * g2 * uGain * uIgnite, 1.0);',
'}'
].join('\n');

/* ---------- 星环：土星式粒子环带 ---------- */
function buildRingDust(THREE) {
var N = 4200;
var geo = new THREE.BufferGeometry();
var pos = new Float32Array(N * 3);
var aSize = new Float32Array(N);
var aAlpha = new Float32Array(N);
var aHue = new Float32Array(N);
var n = 0, guard = 0;
while (n < N && guard < N * 6) {
guard++;
var a = Math.random() * Math.PI * 2;
/* 两道"卡西尼缝"，让环带更像真实尘埃盘 */
if ((Math.abs(a - 0.85) < 0.06 || Math.abs(a - 3.95) < 0.045) && Math.random() < 0.92) continue;
var core = Math.random() < 0.50;
var spread = core ? 0.14 : 0.40;
var u = Math.random() * 2 - 1;
var r = 1.0 + u * spread * 0.5;
pos[n * 3] = Math.cos(a) * r;
pos[n * 3 + 1] = Math.sin(a) * r;
pos[n * 3 + 2] = (Math.random() - 0.5) * (core ? 0.010 : 0.024);
/* 越靠环带中轴越亮，边缘自然变淡，避免出现硬边 */
var fall = 1 - Math.pow(Math.abs(u), 2.2);
aSize[n] = core
? 0.0032 + Math.random() * 0.0052
: 0.0048 + Math.random() * 0.0090;
aAlpha[n] = (core ? 0.52 + Math.random() * 0.46 : 0.26 + Math.random() * 0.52) * (0.25 + 0.75 * fall);
aHue[n] = a / (Math.PI * 2);
n++;
}
geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
geo.setAttribute('aSize', new THREE.BufferAttribute(aSize, 1));
geo.setAttribute('aAlpha', new THREE.BufferAttribute(aAlpha, 1));
geo.setAttribute('aHue', new THREE.BufferAttribute(aHue, 1));

var mat = new THREE.ShaderMaterial({
uniforms: {
uMap: { value: S.glowTex },
uScale: { value: 1200 },
uHue: { value: 0 },
uTime: { value: 0 },
uIgnite: { value: 0 }
},
vertexShader: [
'attribute float aSize;',
'attribute float aAlpha;',
'attribute float aHue;',
'uniform float uScale;',
'varying float vA;',
'varying float vH;',
'void main(){',
'  vA = aAlpha;',
'  vH = aHue;',
'  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
'  gl_PointSize = clamp(aSize * uScale / max(1.0, -mv.z), 1.0, 9.0);',
'  gl_Position = projectionMatrix * mv;',
'}'
].join('\n'),
fragmentShader: [
'precision highp float;',
'uniform sampler2D uMap;',
'uniform float uHue, uTime, uIgnite;',
'varying float vA;',
'varying float vH;',
GLSL_HSV,
'void main(){',
'  float m = texture2D(uMap, gl_PointCoord).a;',
'  float h = fract(vH + uHue + uTime * 0.042 + 0.30);',
'  vec3 col = hsv2rgb(vec3(h, 0.50, 0.92));',
'  gl_FragColor = vec4(col * m * vA * uIgnite, 1.0);',
'}'
].join('\n'),
depthWrite: false, depthTest: true, side: THREE.DoubleSide
});
additive(THREE, mat);

var pts = new THREE.Points(geo, mat);
pts.renderOrder = 3;
S.orbitSpin.add(pts);
S.ringDust = pts;
S.matDust = mat;

/* 连续底光 */
var bandMat = new THREE.ShaderMaterial({
uniforms: {
uTime: { value: 0 }, uHue: { value: 0 },
uGain: { value: 0.150 }, uIgnite: { value: 0 }
},
vertexShader: VERT_RING,
fragmentShader: FRAG_BAND,
depthWrite: false, depthTest: true, side: THREE.DoubleSide
});
additive(THREE, bandMat);
var band = new THREE.Mesh(new THREE.RingGeometry(0.70, 1.34, 200, 1), bandMat);
band.renderOrder = 2;
S.orbitSpin.add(band);
S.ringBand = band;
S.matBand = bandMat;
}

/* ---------- 星环模块 ---------- */
/* 星环模块纹理：file:// 下 WebGL 不能上传跨源图片，纹理内嵌为 data URI；
   对应的外链图片仍保留在 HTML 的 <img> / data-halo 中。 */
var ORBIT_TEX = {
"grip": {"body": "data:image/webp;base64,UklGRmwuAABXRUJQVlA4WAoAAAAQAAAAyQAAKwEAQUxQSMgIAAABr6egbRvpHP6w70cQETl8zr9sgzxlCnKZbXb5n1DbtpHj03/39/sPnHMd0f8J0KWtnGHDHWEsNWAE1zw+wBdwK13OF/AkLuAL6InRQl/ukGyQrmqHZhZ6L0Nx2zaOtP/ayfX6i4gJYNVqK8srSpVCazGzI1Oslg7fkB79TVuEcpKUbts2bT1jrr0/27Zj259VjG2raPwBp2TWbNt5X2q27fe19/nstQpx7jknpbRExAT4rm3bbiTZttqAh+ohzkuLECBlSHd7E8SbmAD6H796d/uNiAngf///t6UE0m+dUs7JJQ9+3VWBkEC/WZb5/cGD8X7h2a4KJITajixngz67HXHpbdM//2nehCH4bbi9vvcvv/rbx/3BkyUJIpDahiRRAmC3Q3fcnL/0nO5fH7eXn19fL1/z8ODJ6gqQBAonSVH49fCpW82Zu3cfwkMlVRUIIYrqePIYP4f+19vH69vn7XM9ebKrAiGkPJbd+fXEWVvOmzl7JEBlxl8qhAR0Hc/O4/T+fvv4/9fX28cyiCerKxASiqAE9Jsye+stJs/qBxAeMvH3CwlBVcezy/AxvP96u72+jP1t5dkfFEgI2Uow5fR95000AHdk4p8vJAR0Hc/e79PH61v/8vr+OUwrT1ZVIYSQlcy4q79cA7hLEh0vkBB0VTy5b7f3/uvl5f760k9948nqCpBMNZBZ+e6aNd2SRO0KIQHVFU/u461//bj9fP28ffZbw2fiiJ413T1rqHshIaCr4sl56d8/Pj9/frz044d0XOI7uUSjCglBVcezPas/2/8nRQeZvfWTieYWCgJkGjh+xwGIDk48iNMOnR96iA4ypq61aAlSOJ2cOdMK7dCLpc4y7k9tIDwyvfiyRx0kBnyQovncgHdfePa5UHSOMeMHNV/ou64XXnx9ExB0cq9+xL9+/PkXQEqik90+uoErnP/xv3/5UZfodNv4IkrX/Vd/bMJhRYWDT1w6+UcTQQ8V7zABFfknGxupeKcJMccr7iZ+Dy8bU0PZigGZuET8wqMY93TFhCyAKt+By3NPx9VstDWcOBYbpYUDYXPDgsLtAzIh4hcmQ9WMool5N9EKj8uFWOLtp48j3tpcwB6vycccTqxXyUUL51SMKNxEZwI60hc+p3ijkT1eMzLFexjZw4mZsnGE8zpT4e5GGt9FMVLhBhvQkX43MlHhmpGd7MVsQyzhvO7higHZOK9scOFzbaVkxd3IefJNFOuarZiQCei6bNDwuW4o2nkYOQ6Si/awIfZHNBBGjyPcArJBOuGzGFEwsRmBIvtppBjCHeUDFO4BclEsKJpw+iC5GCgjRzSvYgo3UTagwjWc3qOJhTJyRoMdp/03QuFmyshKRfO6kf1u5QznVPThRiNQ4ZqVie7bcJG8GI2ISaVcbi+y98jIcWXzuuzJitnKeWU7jIhxT4aaESiCq64VGdlHFAuuA6e6SL7PVh5TNMqKrmjbiIxwRivhU8WMYomlGQEukrfLScf0bUi/NC8DCnZSVi5yi5mSj2IJBoXXNdpCWbmiHXgdgomZsnIGgxWv92jfycHMSAWTmYvkvZktmqyIlQo2WYGL5LuZgQp2mEleTFbESMXye5K7GJCVfUep4MRra8QuRvRNAOFUPLZkuxWoiqViNrMtKBQcl5nrIveyWlG1JVjH5QSkYGshK2zBDrwWGwqlepiBjdzNTLEEO394gS7YSsnLHcXye5JaDJSVYooFwu0ZbKbMbMF23C6xxEKZecSCDbcLFavsdOQezYgh2GkGjmB3OwMVS3YauR+GKlQx21ljwWEHEXtAVsR0oFSF2yJ10ZsR0yMVXGbgvFIVGzKzH7kabteWiuu0wxVKtMVOm1AkuE47nKR+TMiKOCYUqjrsFqn31U0xxbqanyOUWA4/eyjYTj8rClX4FZnFeJXc3EPBid8z1kzZGWOJ76JYKTtrKHgYmmMd+N1jDYamWGUo992OGKlQpx24SH03NNCFOg3lPgw9Yk12xEKFOu1AE5GLEdmZTpQIOvyWiFzMdsSypNrt5C5WZGdfUCLY8XseZNbhqEUSx2Bo2yIB5afqCDVvyIzqWlEk8V1UbZ2jIRLsllI/DBUTyoTjncyFDLVIqoXudFP0keDCrkqfXbFIo6GYvD2KdPqBDRto5sNP8OP3RCAxUnbSmlXhgeDAr7hTijRSdooefl9nosJv2PrzTAp0N/Tr3WmiqCWJfvQq0TRragmCb9eSvYSaZENdOQ/c1U1KBVNjVDUFxhuXnPNwz0AomJpArMlWU0Tiq5vPnr9oz+HgHvUH3dVGcj3hngwYs/d+88eDV15zxinHzaGCVEcQBYsCw/ZZ9E02vPI6E3tf8crzF37ywbp6+k2lKDBkj2V7T4MoZnUFJTI8vOrSsVJdATIK9N995d4zIYpZTUGEx9QTj45UY4CMAn12XLHf5kBlUi0B2lhV1L+MAmnHpYu2AiqZagnLqxsAkFFAOy5esrWgkqmGCG8GQKYKbIuFy7brDZVMdePqbgxAsgqYs2D5Ln2gYKqRqHp/2yVvDkCyEjBr8ZJd+0LBykOUnB/e5xOa5deWDZh1wu1frVmzpmDqtHAS3x4JRiNbFjD+kFs+GwEFWeeEk+CbG69BRmNbNmD0/JV7DQN3s04IjwzrX7377h9INLtyAsbss2znSeBu9s8KjwwbX3zg8Q8hOc0vC4eBeyyZPx3czf4p4ZGhWvXQI2+BzIN2KKNAvz1WLpwMVGZ/X3hk2NT14GNvg5I7bVKmCgbssmz+LKAy+1vcM5RVDz3yJii50z5lFOi91fLFWwOVSX+JdGWoXn348TdAyZ22qpQB22b50q2BSqY/455hzfPnbgkoGy1XZhVou6Xzt09QMP2eexLx2qPbAspGK5asArZaMH+XvlAQiogkeOexO18DstGiJauA2fut3KUvv/vGEw91bYJstG+zEjB9wW5zhvbt/uKlp7ocsjst3cwd6N93dQXk8KDNm0UBzMKDf4GC4H///zcmVlA4IH4lAACwcQCdASrKACwBPkkijUSioiEUCnW0KASEtLd+Mh8A42o0yFEC9CHt+e8A92b0FeQB1j/7d+wB+qvWR/up7AH8c/tWrZSo+BX4DwJ/P9aYEO5ievDsD/bPEI8LegZ952Nut/7/0BfbD65/tvzH9yX8P/n+g32z9gD9df+R6o/87wIvxP/f9gH+o/4v/af4X8ifpq/1v/f+XX+L9q32V9OP2D/zz+4f7j8w/8X///Gd6Kf62nDMWH7vJOk6eDbHFiLvX5wbWpdcboS1Xb+J5QdIf8RbKf+OGNYwhNdhf+czAiOWRpHWSBYVoCqEMK6qjKmTBnx1YRkqcEgOUp1kOz6JgO06lsAtV/11O3TSA18qlcyAE/66+RPV0UfIMDWyE9Io9x2XlNIFrm+rK2AgwZc9Ow4N5doW1EccjPC6qDqXAzfrrrWGzCn9aW9vWzxFN44ZmImZBLwnl4TWVGzRy+9OeoAcgKqhXl2llnpdZoVQqOOfB86Ym1inXRMo0JrRFKepQ4fHLshadM4XDHVoebBGyrS436dnVz+mSbFX84PWPZ1tDIFxeSHpyZCBkWz66rIpiWmFnHJ+ZaqE1KMUIGHU3HsMtSNiMMFXPQloFdu8q/msXeVoGEozYKJ6fg2WcEvxkOgAJa5i2EBgLizZfvLAVOTxY0q3ZTrnJc6mKM7v8V95G4FVcChtHECsKxPsIpGHssOERGXWEWpyEhZjZJjdVOCb64pWibjrtz9kE3weux11KBN4sQpvhZxJUoLnJhwsaMd34MjJWtyNAslk74hBGjWbS5/iTpvLrAbMTefuvWjS6GDHIm2ZkGIY/Baqxjdp7v0E7I0QGO5bZRIPmSLhvgoRRu2gIxHVd1w+t6ySvi7KXW3lthNnTTHQBs/j1iiAEtWU1tedqlcB4AHotplbTTVkt0sdGx9UljkZ+SPiYExcOQTZYr4Af4+YgpYMa8leID/vchJDXVmzain9Uq9Nih22oI4pkyxJD3TVVPQM31JDHvbe9HO6oVFr0JBg0p+bE6PjXnRhN3bokey5QqUrHTqwFBlJLHCPQ1pH7tnmPve5ZbLNwy5FALI04gq3DaF5go/3mpdIxoCEyfNgUJ8lAODEP2qMQSHnmd6CqtmM+zUsMaftdlNodTrsvrbIq5ZlR+e0W8atJ4eSeAWsS+0+v2ahraBfH2b3r+OWvzJFHuJvomgY3QnhSeKk04GOnhLXriw/QAAA/v/VBwBDf6c5/7WH5y1DT4oLO1v2lgtxVamf/Kme1Gy5fLSSW2f+AWVDGehMhQc39zp+bbyf8n6M1bG/Dof4LKFP1xH/Bjf+DTM+iiIfK+9GVM6QansYqFLsIXcWNlPxJseDuUD/O+Jv+sbPwMT5abjbG+SqRo44lgQKw4nQUNeKEXNcbAFTP+or9gukDtsTzwdkRmRIbpISgivxW1kn62SGMSf7IiDrbmjvmuxi/4Nv6Ujb6b6nHyGQEy8IfivHjXDbNf5x7t967bJFaQcMaX8D/XATAb7+qgT8x9ue56ynrEkFj0/vO+8RpJvA+yq8S9FejI6E9U6YX8JMzIoYNj/xeH/dKk3yxoogfNB7ob/Zvp3pud230oah+UEeXg1jpRGv0sFC2285l1J2hOZLEQWH0bdiW+xhJjtoM1I9gyU+4W0uf6b+t0i4qh2PMz0+54ZdTv7At7e6EfACQ6VS8AeptQPpWolAzVPjkiCg9MKVnZ51lGVKp0/aNBZ5vPuKC6iVaLyGvQvW+Txy50dG3JIEiZ7LLvkWbf10lMeSRDztj24GfHW9B90EO0AoajrFkqCIa7Al3QgsH4t/CGvtEampsyDHVJnfDv3ahCj8QNQ19FvofdWf0//QN80KW5W0uGGahoaqbTEKyCx+uOPvuq0F+3f7RqdwufdXOwFu9Qjrfs8uYEf6hUgFENgSemxdZDEvLa+v5FXr8nAtQ0VLvdoMgzTNEKrp5H2CIvTA4OiASS3vnW+zf86/RXWR1afkOk2Gf/YM01VgCQc+T+2HX5Nsns50m2umDRtZmV8bm58p0mMBGw1z5uigubu1m5mLrakHVMkoCARMTUS1WPnG3chsD/JtkOlfaTpPJGU4vAK6WX9F6SZvzU7oC9pdMxX/biAhADdrcW82Fz/Gmk0X9Xl1e1+njxOEJNO1xJvLJMgUiAR74cx0bLeRUDX9ZMsqgC7OiPgNZ8aeIWrPDlvSuMht3m5MiOm0Ek2Uv39yOP/g3cJSkLg4T/9HlGZnQhOLQ3vy6Qbwf2iRjfGuAbjLUXBvf0H0UxBJfYx+5xyL/ZrUDzuZMMAGK4SiVKrk4csdb8oRhJ0rHO3qsVKYmYR1q9Xl4I/55SZbVz0PVXA+SJ7hTzaCsnsy8QzVaNv/Erwf8//9irEPDmVyTpkzPM90Sn6MLthy/2MLf2ainOK0+0PRm1yiFRNYcju0FJcNZCWzG3tO1kU6/ay1FDANp62u/H0nD8C1hojRFRXDcI+FhxAShwA2RKNHpa9B9KHtTqV437+vWYatMX7t0G0pIDHpGeJJ+IACMCrzSS0YPWiXnM7tsKax88EYDXkWbYoUKmFl3oZ6valg/obu4UDhNexk4QQx4RE4Q2WhmQ5M/v7VUBRhSkGzUBLZt2B2th0Nj5RhF+VrVZRym+Ty+mjHylVrbP3JPc0hdrByRA8QElaPvDyM72fRp1mF+yclZ+yaE/sEOf3uRkFCrldTCUjBGqhgCAW8GsN/eA77BYBX2mvMCc/9zCk8FMJ+8kuSdK1CMiVgwj6jOAItPN0f+asgkDHm/Pjx5n8jKCROitz814TypIFJvj0vYOmBtHMzP2eNCNMz9D0BF8b+BE3NoUmku+Ay0p/z20LkbxgYHciEYBY09gcKif4H4wC1ELyUIvjev9BeEIX0VqaBX3go1gtOpu8bj5wkbGbGbhpsFdayGCDPb3k2GyK/od9yQe0+0/yCSmqAgri5YFlACR+c8VOSX0uDEQ3yT36vL4oXV529E9d+z+ZZ9ea/GP6Y0fXMBUPHOQ2hOJ5+97e6ftdYoux6eTjz05ZhJ3aNdesAMU25kM0EePbt2vLw9zfAsntwJsldWdT22L11t7cUrzGSZ/khvy9Bv78UcnKDSbtSBjhb7GuA7Je/5tZysMXeLrS1R3pv/1Ieq8czUqSY4UFOfTgfUpCUU+ctWey6rijDazh/3Pn9EmOTMCxXz1SDLbjBsa6Aa/0cDy62yNUDjBYgU7y0NK9FCf+OERJBhfzO7OBKaDzuoaDQFS3Fcf1Gjhw+Hg8oB3BWxI4l6HsVNIXvgh8vMI2rJ0u5I7DjEO5rYUWgyVDjBUUkVXSQZcslmk/IJ2mBLMZQSCume59ULeo5U5/VDHAz+Q1e39MCqaaBw4pLPhUBm+1JcOM/BLGauar+Pjg5YgRMmE1pnCrBAeT+cJ0IZSibte/h6ptdjwm8RdoSLATb+ZCl/gtQQQTVvtat7CVA5vmAJGXgqWa2K5QIEk8W3Y40yietvOdem3qYFKH7N9BGHp7oadgqLikBAjCYA8rebLyX/Tqh+D6HoKVUPgy6i7yJMg79REQPFWDK1FkRy6GdMDhT5207VHW10XhOIwS07QA+CsxggXpty3xaAqvYvF6fsuUNiwf8Y7BySVfg3vtAV3gRzZUawtNeda5V2C7brMGsZattq3RpAJXMy+p6nd1B0+W2NWARjQALt6hFlBxw2y8ti8+exbGJrdQknD8xonCVyUL4uGqpXXax4BBTRlHNZzBejrM/3g2mZJS4wMJeaOo29ADfub4SnhoubL5+5TxVDglqdIINMGlUTWkXJyJLxp7HTabWcsILuNb4tYFrr60S4n6c2MAo8ZYIVmEtOegxE3BQcoIyLX554y583mvyZxqe1Z97CrdVRwEug3d7LgS4bAJimaI0MhFa0Vg/cwR+SuJ3CwyFwOBW8GvXy7a1x7wMnijuy82K+R8nTwv7ZReqqpLA/jF9s69M3o+Y4753iIaZrNfXxm9zSCnL75dJlslkq+j1VMsvUh33okfxOye9Vo/sJmBKA5PErX6b2gnJi6bup8WMR+ybDPG/gFG8SGFxbjQYHJUeCMFsji1gHmFJ6OF08UhQot+a/4tXzBlbz5x1Kx4S6kECFkRTnc5uVETpKWfb+L74hzLC1xAgO5134L/nhwRY8U+HIpXnmklpF3cLrbo07h6mJsIHGTcdE8ufx6Gyd/A5t/OFEUn9HoFxOqGoc//8lXDKJ57noMo6uYNaoVitNgUP+LJqXE3Iv0KcXs8s0gEO7PwrPL/tvWYO+bh2K+gye2IhtsbrhxUBSjaZJd2Ho1N3yHOUuKJsJh6CddIdyqA4lbVt6vpG2m3xOfIWkEja2WT3NOuhW2nBCloBl+hD+/LtCQ4W3NK0c8bJWvJubM3LLM7AkQTzeYaDW55WsDp2a4qkU9tOrnKBOHiy6Unhqm6ypc5b/GEHARFbPU4y3l2EP6q5LrdnVS0zLLXRbMlSFSyYuYUAS/GWRoRAfJj33bNygvDHtAqMWAO7aGmfySKtmsn2wHTlEFj4th9v40WIEzepK55hQWdFTsYaQ3lIroEJC1r8kYls4nmaFIlejWC0loedgd9aGDNCSKdRaaWVkZOHxr/5s8D0Kbe5FHnn4Meo+gTU/xtM9sOdty7yuGqVXwL3RS9ScTawk8FTJ7r5Uu7KTd0Udg/H49wfUHbsAJCeQ+OH1u9s2JPWIO/km3Yk5fAQ9RFHoyvv4Bcbm608VHi+VRn15/PnKapIz3t5ynun7/mB8tG7s+Wl7pF/Pnnbt/362mfH38H2mQ0jgv0RSZaLy9wdAZ/VfE3Z75vcxQ/AGyXoZdF+YEu7l/4Knb56uawjhP1o8mcBLuYxpWZ7WDv/rSRDCW0jqB7Wa/Uu6pgEZ2Xse/VnB1sIuPDlFLsQGfhoclzLT96Km/bdBhHv/HFjBqNTjOnCJR4Uf0/VqxJNLv8DdLy3mjzyOVpeRPR7PlieIeg2NpxFFlY6XWT6dYqowaGuA5pqbjvVASmw/wJgNm1BRP0n8qRoKES50MX8k78Yv/B7FQpMWsjR1KzJ05x9AygIGV9D2tjr3LJzJ6lJ0PHYSkJi5ktnntFu1XJjedIo95iBOTxbbBGS2umMYrEvuX+d0HqYTKf/QsYcL+NKxHogtTUeAVd1ZZZtd1Xr4OD1z+pE3j7T5njkbiallFo6RrlU4q7QDj1UEDTsPj7+/8MIWYPYLcl985VSm0dibSvZH53lhtEzAcHU53j/dXKuZskus6KwNeM7KuD1rLYtTp35jhgSklPMbfgJFujNFvzoP/8n++WJHI5yZq6YQ5KIuSmJJy2BSjugfDDl/qFjVzEDAB4u44fmihmKwJeNPnxb6eeVYu6zEoOGkFFek0bYozNx0IDZQZJ/w2x4Pw4PGd+eP3AZy+e1q6f6AHdAAFxCQs9/pBipnKqjc0cVzrD0cZJEnl+nb+PKe+/JVjyv4FDKMfJ4PaPIJ8XhhMUf0aYNe34a05JtqMLJDlz+7lZy8kGdLMgAEyCVU6lB4wA5M96StnNxelGSXP6bdJTdMZgGN7HX0k7/eHVO7qjJVPaF68H+ye4Gf5k58Lgy2RMP+BlBzxpYCKj7VsO6aYVxOyPWeI8oPMsEi8T1fWWNt/P9HzBKgmU498MGN6JH9WxnYi+ZBQgEuZ4sAWMsSj5veE5SDP/DzPrq4OQQLn9+uv9ghZ/cbryGeK/pALHp4/PIwjM19CwXtVtLTMw2x7Njr4/ahdoS3k6E4V8KckmmvvQjDV6doQh9UD0plYyDdBfC76/3yRymTdTwZ1m3ykR7ZHs4EHA8zSLcK69Vxa4Kz3VKf7bWlRUCiPbwJNxCA64te5y0gLD6S4Pcq9JOHDMmO2CkICSJN/l8or6ukTOxMuPcZgUFyWzqocVu6t/xx0bBHnvkvHB57y861+0qds/dGEcMpEpI1ecPdV4yvCd9FYX3NPYQiGB9e8AtqNu6+4j/2tYVVW2LnzZtL6cQcHq5NhXjaEb7UE7t4pPjK/hYa2Ua5vG7FAEZjMxCiRvfur8MvItscOs4ZJAJc2Jm0RJQlMPhau57kvbv/5joHcJBLrVLQn9Egcb+TaxFEkKD1slxrQOsGjjEPdxl3wRhzEm6TjLbXmoSjxhWdkJGqdn3JgWDqAU2FL8WGb8YSMofi4RSZ7yEW7uGvPhjOvONtDK+4yT9Dyifzbyv/TJXybhA5HNUDkakpzfN04hYQai5ij9FKlEsUY+sXsqGlg98SZOK50HQ9hWZqxUFmOjVfmdVYTH4C/ddhqmL4kvWCkU48PprUh75Hg6HKo7Y0KI2UWn9fyRgC3YWeq74q/Wv7uXT/n8OvdF4RGLRtlMUCRS0YX//VBDZLLGledTGODmERF8Q3z0CCAe1KuaXwRzRctM2MueJ3Yk/cg9BYJeOuaX4TpC6bj/oxqMSLvOr12Kjh+PzmTeWEeeJcNQF33mn4w1PjLjyYWQyhRE9B2UzmuIKQpO0CK9PBqhaczzbvya7SdOLs9auy4x2NvouZtEHzSHWEQQyrOgxn1kB+v/iqEKlF213o/PD0qUKbrZ0b+spDI7iXYMaRS+ZR/M6X2w8GsWSh91TjXtp40RlO0O8aX94k22/Uw2wVJPRQBtaHw88690o220qo/TZNsAWDtAwNp1Rnc/WBL/hwiOJcLqKF5bE6CHG5Tx7ArLbdgkQI0StbngsxOUNVv8t/jairreiVqneWVe//iztyCy9OiUpyMn5w+BLu7dRm1LTMZSHWXV28GLUCI+RzYGmRLEGkJfQuHcj/ld0OLj/QKCssbflxrhATRm70DiLj5tY+45hW4iscXFaxg9rvEPafnt4SPvSPo0YtoFiMvJB7QwubZp0LNkS8zzRrskmrCKzZLymxh8p0ZxTSoyEmWCIfc9nAHJZwf7lsP6q0gIx7Z1OLDyknaVg7DK7LlSyCfy/F7nIZTVLQt9wlGBN8UyzUll7qIC/3T56bwxBTY8JaaK6jbat6qFwpS3wT3gS4xdVKp4Q/OCsvBSOr78HEHCiStbc/LpOWjH0yigx2IOu5IwwKJ5VgnZO2jOwJDzjYk8NNeQzOSAJD8HPEGsq9KYef8F+NRSP8uvzRx/zodD2OYf3wopP9cp/T16L1PitFcUcIptRAU54+9HO3syDIP3UvjD4PQp2ex0IrrTri7xugK91YfkxuxDATV95svpEI7q5YXe1wgHyD+GbsSRLOWUVByaixb0A4cDY/7zg+FwFSZvdmXwuFn4CFdl/J66X5UAZXuj8yX/Kb3sp+NPkDD1LATQqYffw5bGQIqxGi+XFHcIeeK9CwyP7Fz2+11PoBWTZByaddVU4onvZUsgdquWINYHjTAF7RorzN//VkJNxPbMnQnfKRHeMfsOO/PkX6oMAoQrAKqPDheQwPr0eAsM91U3RfHeTV/n+NGaSlHR3aSpzeHRFafjXkgnPzg/LJdOs520LvunDf2+NeXMqb+k+7V9RskXpwSywMEBxZIVpQVr4YI2oZCE0oI6CJ7Z+JT/pfLsERhKdFITiqWCPW48dJtx65DkYtALapzC2Zt2uFWtMmAIEaouYVywbmnRDWtXvzql1si5/j9nD1TIbk05BKQzD0UtQvM0xYfW0PyfhprFj3HA4RhpismO5QXv8N3Y2FjXmc3JLQP7wrDgQ3dALN27DbtN3AcFFBy9GyE4HR3idqK9+e8iuImGuz40s4ckBXRFCmIl35XcZS7X8Uc5HF5mqq8zUOxu3ee90Mcbu+up19kleie/Sfs7Y82u3U5z6YujfTgA79AuCn2zhtSh5MIOQVB0+XlqCceNEfc2OAFKrHCt87alBs7AIb6u91y3TsiGP6eCBG7/sGHP0hfcYAveA7wCf/gaIaTdGNX4d8uO1GhepTIZf7Jg0+FeAC+T3zLjtwXnUiFlZY7xrX7s+O0BhsQF0Uj5Z4Oe+pshhWwmmq/uwbgY+UHvbYQqQZIAznXkUs8mgo5PdvU9ALsUMAYlkEsriflwidOGORh/J5fsPVPOH+cUdDpkfbsZxhnf/AD8mAseuThTLxdh+jrFNQdH4iYGneAWwudBwNb0x4IE4mIU7a2jVNCEqNzGuAWIvVXzzytfhpAdaW/J9sQjz5aP9oSgGdl38we31acLE+rmCfmXOT1FoniGYQqvzxJZAFyuovp3sis2pwOrY46FTTnABThm39vmWvdQQ/qgkVYmwwfPQ6ChhoDcC4kwwt4WMEYQqoam0fpFpXMThVKC8HMJZvQ1bcy5ESFOiRndKxLQsfLMI25FZtDC+d/0UuYkL81X83FXEayyonkkgmxFOGO0nSKekqzl6YZn3jOG1z9jaJcK6RUHIf/qLnIq026nuNLtXTpcOCeTtoJb2AqUgtheVV3Ym6RV8zXtaIBVweqdnqBRTfguRc9VW3R7sq1goeOcQ9PfpSftz6Ymp38huYfOsd8Y38z3d7c56WclGZyte7yebFOLXJDMAq5AUH2ZZGIOXMXzukauRLi3xgUU8Z6yyDuQodN75ynvHbTn+PvUjwfO6zJxXHyNO2U6hTJgUP2ZjKS//gRuPnFekX8P9auH1o5ooREA6u6k2VFzzsgRJQ60SkJU9CVTA6/m77US5FfzhAEDaA7+OvZXfgCyS7rAqfyRJ1F+v+qzdvysXty1CFyQM3cykEX9DXB9g31PNQxasCdgP/NIX0Ixb41ANsqLvB4+vF3nX+now2IUTh/31whUazd/XKY8atJDsl2NoWcvBTHOQ5HGeAtPLzzfArVWcMea8XES/UcdXUPpkpKYqC7ff4mO+U4PtZiVRRVAGvPMAavEUx90xkpmQnub9yiIiUiMAjrwt9fz1+NwckmPgXYxPz2O/A4dj8cDmnwXk4c/x/DcjBn1yhdobnCxvWnU95xZxU9r7jQ5USDQ0LvWqlaOkxBi/mO09yKNJbDfQlAoEAv/I+UC+sEW3Lrl/X1JL3J2GtsEz1croR3szIEHYn7tlQ9CxghPGz7mUYwDwHb+oR0SXyDSQNX5XR1XFu2BK/Q0aPxNwLoVEoOgsfj0YumFKB4Ln9AUuSdFvXSU2VYfJTYpLBO0j0h/qL2rpE0tj843n7Ii/A6M0kINwarcCq/SKhXO5QKfYfmcJO7bkp0vfeTEMLyxOzK4VHvjlAYyDs91zvGZxE9CLuKpObZcdY3E9TSkeDLy0D+Qxq0cKxvKDbjXKU7GHFpPKdTP92w/JnOc9y8GxvDuZBgWIC4c1nAHC8xi1kOhzgc/stQDLEr9W7/XhZwhg+eViJHL80mUXfOTkLDnP6aPqHCLfaOD6QgIGx2PcTV9bT5le5swNHI9wHppoC1rxASX4CH2Re8vjWQB/q7e9XUVzyPVYHjRYMGFvHMYWxHS747hJQFGzkYBOCJ4i74Y6JCs09DhBFK0KdCI34g8KB/JcVglqpWOlf51WBZQJx1FXFEObYGk1N1/N30Q7Xpn3jr5i+6tCdueI7LXEMb5ZRhSH1uGFkSe2hYoENkjN2RkDYG91aryZF7b/X4n/mt1WobxdrHwDOnnXIdL8TmBtpFh7ppL9PWqt/QmYUZNpTx3q7m1zJpHAP5nEYuw0UBVlnB1OKFz0j+2PAzX0AYCqV6l+jJx7QBPHYFCe81U3ibaj3Tsw7UCuDblr/v4oEdix5jxGJoy2BBXtX/CkSCO43je3p9meka2Gxjj0BNlhoylcccwugMwKsKDj1D7sehQ1abaOqeVgqHywJge6tVCx+x2/T6v4D1KJeuqp28FRephvSFPIu/Uzg4NgprDYbVWXdcxZ4022JaHVSmxJ+0VTiD+qN/EMgUnMR0B0dm7IM9Qk0brfIrPQ0hE/O+FcuXi6+oLfbE8PQI6nnUXxQYmi8FLq3I7JQNAd5otLhH5B2jj9NPv8D3YFyiEzRmFgEpLBo+G3tIYAflT1S0FvxFqAinyqkpKHBt+XZdjoWchygB7ErUXuRNLNfHourIelZI+uQTIIGAuQ+4bthCldK3N2ae3+QR8iw14in68zeLXck/pEzD4u1wBZQt9oNSJ054c5tbpz8qlfneIZkT2Nh/xAMX3laKotgTwZH++NWCtB1fMt1Rsgph4rUvTYqTGG2PfKzR/tMVzLFK++9zjkSeXD/DrZjjzKamBCD5K5c6//cJM3MeBfFTRpDsGtau/1Cha5Le9QpRuM+RITe7a9mPtJ8KDPcB+A3ubuVTeNdApZAIK48hLjVrooy4iOrsZxun1n3M88v4VNow2tkHQ3jvoiRaZX//cCicfgz64oQpQ9AsbLSbSwdNvdpiTPI7rzuFIOu71Tlog6ZXAauOD9//gC2s7lawTpe3onjWEc8R46wTrzy4x5PoiimEvQDELlgIkxTlrNNBByW6yR94+mRIxF6F2hLur/kgvlUSwKrQLa1bSTOyYJV7fKvVW50s260axCtE0HFxrosoc1/Zrs+p5BU3jfgLayrY6K4d27toDMcnutVNICY7Ef/R0TCMgiyJfd7he0s2z/x2udlkquXNj5Ii10znmQQTbHU+loCfM6e1cX0+eHL2esfvv/KB0sXsmjycIvOkzDMO7w0e7MwNPzUgmDSTA8dvERY/oatTmdPnihyXmJfutZE0M1oTxnqI46ZlBiLED/8hFZj0rrvEjgWMPaWkGoZuNRmB/5tk58ouCT1duxQyOkOL9Fp+al1sQNb5Bk0fwPi79r7e4Rq1FcGGt/w+MschiHc7WFSCKEz6NStt6AOVlDvdflE6l8mQODRyGmbEXRq6nJ3/k0zBL9/W0hv/UHt08se8HUsVx+X+oPB9eAGr2zCNWDB9NhrYxKgqbQANuqFu7WPJFDJjhZSXq+zU9UTZhHEnQyjKMZ7SmvwY9/K5gDTmNKtQ62pGm7FSONIuQqlo0+iVhIxNjX5u9lAPGKpWd0yjZpH9/2qn0wcmnLO1d+hczlUTxKf3qTfU8eVtRzKO5eNmMcuF7qn/0cKqcrqB2U3G7PPApy5sqJUw5QrBUwvH1GZdZmKG5zmvlbxekS/tnDQJOPd+eHjG8x5+4XwhdpCbKIXpfC8PR1ilfsN40yvWgkageMTe0HWFKT+8WUnWjXkCiPo/fxLd61tsZZE70cj1AFC9sYRc6hcsAszppn2RO7He050VNbtAin5c3F5tD/zl6l8RbA2FDdkPbTlBFSEN/eCnQUTsotwZLB8UfG+137uXRAV62N2d8pAYh0+coAF/uyTSk/6kNJRW6SLDHPb1PGrj21bYf3b2b7cazz1UZ0XhSV8DZFw9KbglhWEAR1Hf+nnWQNs6ReGljBvdXXrY/ywf6NI07xUPCgee3B1Et9yzjQSfm+7o9at1ixx4D+62DVKD2Cy3COkRraAcnRohGyFeQr18xrLpPajdDSPH1YMXvXPubbRXFPdesR2Pk+b39n7kUcEIpPuJ0vKqy3MOcJNngD9UzuIKKNVSF5SIEMTGE353Z+/wFasxiESJQXGR8hIbMl202/FmrtPFJj5vibbhnZzJr1/TYabf6ZvUx/ci0occIkcbHpLMvEM6tRfcyRem8AHrgiDjJA6a8NhZfuxQ0Rtgf+aJ0ECCTtRGQZyEEigMaSGvQI4p0RJnqyKFR2O5xzCNlmmw6SgNC7oQV9sm4AoqSGUSFy9IU7Im2c0lEnRWWMHmvI9KX00W4WbdaJ+UEKcdiPiFNlWzn/cqC50rym2qhUr5NjaDi3tu0NPlOWxG02MoWCoDb0SrYX2vcqqkeWL7iP1Y1fomS+AmJmsqOUgulJEpmdNrOlKUTTn/iryPwVVI69+n4+r6fl54AATR+Lti/+0dthQrouWpMW52Ez7ZnpvHbGuF7UsFbs4Yk33OO9nwrG0F4WgGJhZC+wqUAx0SGAQNVTvJVhS8SpGwUZs6SMGEi8pLLCeaDyZ4inLEndWLMeqRwDqHhq59pulTl1DuHrstOW6hFmyF9fQyg7zDZk6hT2CThdyiPnxIJFx52SjkadJ+OjNkrJF7xbVVqG5ErsJcY98JAW48Hbo5PGlQ7N/rBKucCPdpXAZ5EjK6Oy55CZ/dOaqhsQY91N5FVXDXn3sWxfKQYvfxjgR099MkdQ0L3ZoM3EQ47LDIvmoyg/ABjKQrB7Rzthc4wmiQpeBc+qRnQ+urPBR1imPj2in9ys+F60/2NRO4A2F0Ao5IE2gzUw1Xls9EJjufuu7dMhr4SsYSJ73msTvhpJGBMoG9iB39LFfyMdUai8du2oLhXcHx4uHE+dMW6FM3amP/oijptSxeirFmgCRyb9Y+N14YyjlX4Tcw4lfV0WPmZU1OsRgFyuQ2XJXu8jayY2yTLPbUfi81EiP66WmeIl8NohHGyUdG1u3D7qa3iUFGOegT8Uv/vgmnK7K77dBvJOf5J4u2u+53X7mQoZqnwL/SPtR7FOKa7jHJwdn2D6JpurxDPT3gcxnUdcSGZn8sRyg45LQkP6fiEZgBjZ32etJOcpc2NxMiEVwdnXpTTfyIeelShAuL/ASN4iO96TJXugsX0Q++ie1Dq/MPbl3CYKkvX7/GOVaYP2l6CcmtdP4Kn61fTutkmkQf0gBA98oLh0moA+hgViGMt3p7a7bMutLH4zkRYEDfdMcVyAKVAP+1U4pIdjAJmgDqS5Gnit4cUBqkZFmkA+yUbM0ZqJWHuhi/AU8t+naXQMr5Pzl87G7MKug+gusKZusmYH82tJV0cEXS94mSjVeH0uuhg6pgmtY3qlWh30iRc+yXiMZR3D0YGxjDpD3eHU5LNInluOZDJsh+1GJQGbkKLVH0maIvPQw9R7Pu865P+4Dov8FcgGeliGktCVN5y7/SoALnlj9GAAAAAA", "halo": "data:image/webp;base64,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tZZTWlUlValOJOxKgoNkVm36mrGom870sJc989vv/wQEUPZk4KnPuO973vTVHtOUVpWkGhJDEs86DA7CTM2Xk9hCq/Ti4S9+1vc//OGGsPeHveQB7377F3ssRitVkqokSlPEsybzQZT5KjYdNaCVe3roc5//i4+/g70+9DkP/vxrvjDXNMWUSqqSpJIqBWCCHz9Xn81RY8cOYaxWjPs985U/+9DHb6497OkP+9zbP31j1AKjKpVKkopCSiFM+mP4CjpJcOzEEj1b937uora2Nuntz26zWMaiSqWSpKKQUohbx53EhHRCGsehVT17Whbum64lsUpVKkkMCimFuIUMphCT0CFxHCdQY0AytymVSiqhgSSlELeiAlTIatv3TFslghQqMVQUQ0hyo7iuApSstlaZEiQorTOQqBTF1RVIlpo0BZGoVCFJKYR8ecCBVNSQAalSQkohFG6ZD+zzJbsKpBRC4dZ77BMGClIgFG7B83N2F7f2+b//3zAAVlA4IJoAAABwEACdASrKACwBPm02mUmkIyKhICgAgA2JaW7hdrEbQAnsA99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJwoAD+/9GgAAAAAAAAAAAA"},
"cooling": {"body": "data:image/webp;base64,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", "halo": "data:image/webp;base64,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"},
"optics": {"body": "data:image/webp;base64,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", "halo": "data:image/webp;base64,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"},
"mic": {"body": "data:image/webp;base64,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", "halo": "data:image/webp;base64,UklGRvIVAABXRUJQVlA4WAoAAAAQAAAAHwEAKwEAQUxQSAUVAAABB8WgbSRH5/CHfe0LgIjIUUpERBAyZcqai/y2hCNJcttmQaBAULX8/4NFMDmcI/o/AfjKQhke4FA4uYFDQFKS3vuckiSmRSDu3WZ0w7ibZa0pdpvZFZHwACxiUMgDiCfByWAMSjkBlhvKDeUKJDxSkvJvgF/juYNJ38Ikkq1MEHGgtazbtjaBWm2T6oyZ2RZ9ZzBz9zVdAdyd9DndADjfnmi+AKByKEJyH4AqJI99dwaDRpLC3O36Vw20DwoiYgLydJ8FyF22cYERVm3FYxjU8r3qN6mZrOQMdtpPnZOzN59AukJvmhcqa3KF/aWk6yWy54lc6SnJgScG8xRPRL2HvXiKAG2dkHPn+eJc+TonPcMUzVfiiKGfUy0/a35D1H42g5AkejI3VaPkYktC4Mr7fdu3JNu21dq2FQUkmtAFZP11fMJ4Ho/3j7/+xfgNIEc8VIYMozRaG28jIiaArm3bpm2r9zEm1rlb59lmzNhWZNt+mW3b+A/7pS+0wpfaR3uVc9ace+0xoltKREyAH8m2Vdu2bSulXFpfazMzcwC27RBsdUs7dDsAKG1pqZskZtKYmRlGzULvk0YdfY4tRsQEWLZtW3UjaZ97n8wOcEYMUzBHJDMXM/MPVLc+papfTWbmqmRmpgpKZkaH9O49Z++G5BqBUjciJoD/+3/zvD5U/1PwyXTtyeWAAAEWQIC/1DUm5wGCBAkXFwQSQuAvdTUJEMhSkSyllwIJkCnZkoWsQH61q0bOA6hCahoaHqQBAIlVtLqxJQtZgfxq7x9yHlIVMTYiZhFWYEIyAmoByipaQUsWssLDg3tPECA1VQwRJYFY4roB7BWaoHAJtYDppqIVtFwglnX24C44OQ8woAQjMQrBUAVIJAABQlxRuFzVAmtRQFCXsLCss//epSVUQqqCg0aiIVm5gYxlHaYhIDNYUBDiisJF4QJr0QKFuoR18PB6F5IAgVQxGIlhSGDZk4esm//++z/A59vPN2bJFIhitRZBQYgrBBfCElbrskABXOBBXu+ykfMABiUYBqODXTOj//3Z97//o+//mYf8tLBz+/zC8lS+iVZj0VqLoCDERbKQBZS2VYAAZHmQS1bOQ1YUNGbJLCGbmQVyfuKFl24+fnt0/5K127asn98w4VE9orpX9wjSIzyiBiOCrgiGQkFBNIFGAEqE3QiC+tQhQGqqEqJpSsjKZgJyA715ya5Yr5B9BosHPHhmcXF5cf36aY/qEdVLFIYrIiqjRjD6FQEZjaABEo0QzI0i+DQhQACDokZizDJywBrkeP62v6Bd2LJhUWrA6hPbl9fvmJuerqweNWr1qhqKqMGoERQIJoECIVkZlCqiTwcCBIiCxogZHFiYxgzdp/52JwYKyhvMqAGrz2zevHHbuukJZ/WoHqWEaiiCMIJQChkhUlgQVBGvn1QCUUg0TYhheoOmo/T2/f88jIGGqs1gMWj1qW1bFzdunBlz94jqXgUlJIgmQaubQeSC100gBCUYJUYOKeuZSXH0jv8cQ3+moLoAG2sBmBk1aPW5+a3bZzfOmSfJGJQEJCMSDZ0owgWvl4ASm2giGTTedI7kX9++5V8YmIjAqW4wowatPr9p27b5DRvGkgGUK7iNshlFMVzwOmlQg45NNAnKzXHK+t1XP/kNBppAnEYNZuIgvPbSS2++/542LyztmV+YS6lnp9tDEiUQEPT6SFWDhmwpJUtmApqU+eAZ26F15O5Wu3j4XY7dtney13Y/6naaviSTAYAEvTLWYDAcDHJCSjRrLHcfv+2faBVcR3W1TaerLt7n3TGkTkICDAZBVfCaCIHgkIMxWYJyA739yHWPYiAxd4VT/Xu/sLXTAVKGAZAEloBej2qjE07kPFInxUt3/LWiPxNz24T+ez+c39hkJQiSIKzIFVWjMck4YON67abfY2CSAgZ87snpncloEEVKtddCDGIOx3FcR+yWX36EfhOIYfHYI3O7EwgqBLZgrgKQkOjkiOs41nM/Rr8JwtBoAPBosz8xRJJCXSBeA5yMM2bN6e+f+DgATBCG0INzu+QhQVgmXEUVUapSYkp//BUGxqW6eMvz993UJABKkiuoJEJRJaXzyA8xBO///BORLQFAot51BCMqoksZP3oRw/HVF0kNTBgN4HkDR0SI/MPtGJr9exM1GzAGIOctEBWqfvwWhueDv//ugUBSjJG7WywWoCLIsz/D1L8/cC2VJhHIWdKAyyIsnQdrX/fW95PPKOG8s7Nq15n+fwHs/cyffrAuMRfEcyOiAiQoPQujP9nkBOs7y05CBUUKZu8ZABDSufF8JsRAjJnd8GafIELQ2RA1M8GImmZh+YAEVBjnVXOc3D24DcN9kkmjBnQuVBMzNbwsYdhfQnCcMj0TougcR1vKDgz/DTljmkDnANBMjlMpuzEKRjsvM2MV59AHz+nPhYEL8tpK94gII+5Hi2Zm8ueR8OE5ESVqjVDuQM8RZ45D4MVLS4ni7vF8NypAmLx85AYslFLKKriXUBTleCccOd8tbSlG2b/QC6/5nCf25G7tlfHyTiJIkdML8aMBX2h7bTuJtuzdc4B3ffceAQF7VkpvUIjuY4OGEJtZjJh7mmNtJoKysaSjaNzzxKiBz33UnYkquE/o0ZHc9mH0PLASBUXcRGoYA77w5AjyRSeAZWfVGM69LWzkwDedKEhxk6DpqKzrYRTd90yttSC7qh6Il7wykuA9QAF3EWTstNgL2CjyvZc3be0Cd4BIc2D4KaDRQ94/AAKSKFtmmSid3nMYUd9fR6NEoe6AxNh0CKOpePUcBSkq7CAqgXT3iAJgE64+EG+dpCEaXDe6HN1H9NVuAATFeVdIHFGwOVVGS8uGqRKbZwBiVH1yKxm06AaEDllzBCOrwa+IEqUFrE1rkHQfvwAoky21XFK5oIKzxDXPXxhck7isDIIrkv8A4hYDLox2JRX1S8jy1wDdAmBmtgc5vL/YIJ3fwLcvneMOQ1gbCAR+7RqDX1Vflsta9WUN1F+6BsCGjisLl2vLSiF8zzt1OyFJ3SqamZk/ewevJIaRBrxND4zxr74h8NjGSBQobrtRMvmPbwBcs4eAJOS2nUv4N+icQy+SqW/HwAT3jq+wEGRUb1tIAIhrBJjLoiSxqTiXwLE1MkHIJvdeAm8vhIEA2UG6doDfHjMzUW69uOTeP987MhPZUdCw5J3fZUaTbAANj3DvHyaOgHrLIuDkn3/MTKLc6iIJ9RHL3vlLjqBsafUTzpX/MDXE25epd94ZSGTDCKS+eOf1G27eHUKUjw5a3ACrOrTjNbSz1mcHtU2W3ncVkiO2DRDvAHbiyRtKrLqwshOcKyeHHQVU/OId+M6E7w+Ksm/ekS9A7Jk6J4CugUeVMuqdKWFw76mSDQWyln9+KrkBkqkCdhP88FhK0XsjKM3olqn3QpgbdxaxpemLQyx3MgdF5sbPjuIGSDKpiOyVOfp5UpD3XbTaQlNRjFkjaa57LGPLVhijZiKy0WSszybRDq2FWFUrCWAUGhELCd+qkHxnWYGyWF8rJafBQpPFOsC9qOzZStOMtIo0wUB3WdT7WyDQxa6y1LD+aBThftTYdGHHXRE+ALJQ3KCVJnc1syL2WGFsGSUmgH0SgjEIqBm+O0PIIvpWgimAkVMQW6pN7p88BO2wjIEjyY5FaeodMBKWEErZNK0EsGeATEssOkZGvTNRwoyOKbNky0ll7Jq13JVGL2Ql20IyZ4lgJ34cl0D0/ghKv3LdjiQD2dH04FWzkJWypyQ/uG5jKRsWGaknumoWtez9vZ7ZI1smsRGBRgzaI1NPOxCbgo0ALGckG0YA9fBWTRFTL5gK+e4QMvz+VlJIWcrYoYpiSys7vVVZYhhK5a1ACyy4GzT2FLQedqgxb20D4NYC9yBJT+eJAivepgnuECR+3yMNwTJWXNyqGbJhWNmnPUAYuSPEhgJqnmDtYGT5mZLsWVR9eSthmTQALQSPTsq2oXPLGyctI4rCDDaIkxkZtYFafn6rWW+2BS0Ajw3GngKZ7ClaKgyscLJyEyR7ZW2QBmAZO/5IoWgHgrI7rtmTZWxrOvOAG2i00kMU4iZI8cCOzSJoox+pIe+/yEj9ShuUp1jh5ISxbWZfeVtJs5W3AW3wIMamldbqwxtRCk1KxbEVbrOydoAK1OmNiodSRlxwZyrgFtCa3/aw8YJPVcSeK0uwhz22NhHwRSTagxUWzGmPbKXTmMiurcg3WBuYWTPBTShLT2zZFBvTAguQBNlxSYHm+1ux0NbFthcLwF0axa6tYNjxyoXKKywoXypi21bH6eNVOhSz4oOvboOsGA1gp8DYRPFoBUZtIAsXHaeGlb81WuwrRNU0YmT5biF7xqqFEXUBJz+x2JQa0Ab3jVG0AbRCovrGUwCIUmoHscEPy9hWWHrE7lOi/Jg2+JyFuIeKCa9LgB2PoCWIYSplxW+DhuxZVGqUeRxflRKAioEWPFAYe0pF3X0W0PHw4cmMXQVEr92yjOObWSSIjb43leUOgEj1tlx0nASASEfEINro0zTKxgUvXs4BrIvpEDO0ixonNIJYtUvFevHephMwnREjZUNkqe3EBswk21qBUksvz4AlpjU1XBcxTKUUBryBe5kU94AKSsQXbsWTJ2wekRWaXWgFgrjikZPA4oFZ1kDCtisSlevul04+zQYCNtQIpbpLrSiJY+c8ceuMvOg1INhNFpCRIr5y4xaaIN0NaYLlqG4K2eQoJeZ68UHcAJScebx2kPlnwK7KsAz7BhQFH7+IXQVjwqQfhwgTLpSoJFA3WRREheEr2wAOoBlLCxuxoIAJd1eUXS1VJ88cb5ihdg32AHYcro1JSnYBiTrD6ahZs+n2g0gwjd2nxUySZ54D6I69jyVZEN3GoiY5+cLecKYJBx7ONI3s3IIoD98O0BXCug9WMpKEuo+ISTxuewHuvPJmZjNT031AY9HrHrvCFwoX35kjmyjba7zs9ld9AbDpcANg3EyEAlJaHjH+d+I4Jgju9MCCpC0PjBDE9956mmMSE/cStQLRdgDmBeALL53JOCLbt1DAYvlNjJBvTqJBcDNRhRSx/92R4kgS0d2AnoOKmd7ocMmxFI2ynYqlyIgLXnTDy07CnVlYkKiadnjhlCduEBVxPxErePrfe9/2waF9oCjSm0sJHmvpSxcsJLYUEOwHLTSETV974Mh2GhekJ6UClcnNF/Yrl9O1bpAC+wGKFxJz+sB8H0yF2LZnfSkWKMTc/GK9ly+p1eNmtah9cW4LDSmmn4x3CV2hLmi5Wy0QYtD0nek2z7TuzjPxDhEBUWe972e/stvnKcaYQiDjvApYlIT3P2e2X0gMKQTVWucGsKAS+IDV/tEcQ9RAEqwzI8UWJLxYjfaXQzREVaWcYXEJVF2gyf4dVYUqlDpDiEABBvjLYkSKkgJZrDN0sQgFlCVzFROKCIi+FtCWLgBLA2O9kAIgKf11FLAA0SX1u0deLYDA/joPAub6bWjq3L6osIhcw0WvzJdtQ9IF8cIQscqVDGfGJz9nKFoXUYMEkOsAVGP1pSFoMdxt4nWvhvbyUkrZfjYAWmYh+lMCFlcza6ZG7epyDLNLOSIYlgj0emgzz9VL7XXP32mXs6ZDDEUG8ZFW2IQQQpQ0mLt3SFmap3k1/WiOzagGjRrYbLLDw8gef3bGrOLj1RJRUQnBct668uLQ0QmfeQXwo4kASaGqSEpIU/tWXuizoWFn9HtIgD6Uo9UiELOESJMHJg6i3ywwZRHOLBOMD5okBQIzJBCdc+ZeXUE/592BiRAjJoP4sGuZhhlkrND2yyafIaZlnq1hZUTI9CMLkCABEwRCQvUY33/ZqTuhdbxSF7B6BENHPnQBLVZo69Tz88zln55/7L5HgABgOvMs+TgHAT828KxgKZ1mZnxiWnfZJy4/ePftAgSkM8xExIxmJkAfGgiNxbJqmueXMdZAc+GnPvfm3Td/AFDIZ46ZZWekkwHGxy9YLbTsZWbElCIYafsnvzT2xHXPAhBgZ4RlRqVbhlyOYi1F86igCTkK01mXfH3XOXoRA6X3dpmLjDGlLgcQayFSRYgSlY1VMRUbLrti+tUW08o+m/LC6sGOXJpiF4ZFC1CUQkyW2ratdersa+f2RCvZV3dG9WAoBLw4QKCFgZBEI0GQMnfvtbU2L718zUFolz6665mICAZkAnRpAAKViLJEmapbfHHd/+Fvf/zP3//9HkAg6fRy1mKJF3WGo1yscp4UkgwNDXNLL7l+/9c/N/fd9hJAIJ9GlhE1nmdyEuhyAURwFckQKbMG12KeWAvXfm75fzc/DkCAnR6u8ZarSHH5rhBXdWNDWUaDt1hgsxd+8aIXJp/BQOGsbd/fdqt7jFVcxHEUGCgkGUMsA2rY+N615189//aH6FfO0iGdXluLu2YEL6NjAK5cRZLLpgyKlOjerT656+qdfdNSH6f2POCPldorNVySAF1IQBzFVcEUBxFBU3KWXuu2/NZthwlapTIA2585/OPPti3FI5RgXNhxFBgodEkRolRrCa/d9t7Hnn/t4ZMW0UrWwZbBKbv89ttff/TaWiOCFRd8REWSazCNYd3ojGbzZz87+/DNRwABSNKJMUEA9nzwVR/6rM/i09Pz8yiXv+CqYCqXZbqE7B5pzVVfOvDs9fcCIAAYdDwMAgQA37v66Ie/zWlW8vT8MqNefkcBo0iUTIlIFk6NHfjax9664+GX+4R+Mw1YFAChv/n41Us/ue69nLLM5OVlrIwuvgAEepUyFKUQDFYZefNnrtr83P0PvY3jvv2iy6b/c8NRbzosD8fMqFyNAQiuCqtoJCgiDEanxvdec+VC97WXD7/4Zvl/fluc27x1qfO/e25/VSl3aGY0o1N0NQBxFDAKkSDEgCSZyRloZrd0ctMBevVwusOXXn/+yHMrtNwYmBIyZnQSoSviGIBARwuIAkUKCrPEapE6TdOxbAedJ5hytgZURjZLMYyacZUGIGgSRFCiUaQRBJRyk7OlNCAdJFAGJEuGlCzhqCHoKlmvRCI1yzCraCn2gk2UyNghU0emAYlrV5AgIUZh6KIu14IwCUQMmqTMClquYgFcFZGtYrlYlleTrAiGCBqQe7UhUAVGBVk8AE1FFSIg93LBmwSCFrwkVBCbBuR+HkcBXCwLKwcBG1cAud/H60IF1uFYQf5fGP/3/2aBAQBWUDggxgAAAJAVAJ0BKiABLAE+bTaZSaQjIqEgKACADYlpbuF3YRtACewD32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych76wAA/v/o0AAAAAAAAAAAAAAAAA=="},
"terminal": {"body": "data:image/webp;base64,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", "halo": "data:image/webp;base64,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"},
"printer": {"body": "data:image/webp;base64,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", "halo": "data:image/webp;base64,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"},
"flip": {"body": "data:image/webp;base64,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", "halo": "data:image/webp;base64,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"},
"battery": {"body": "data:image/webp;base64,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", "halo": "data:image/webp;base64,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"}
};

function buildOrbitModules(THREE) {
var list = root.querySelector('[data-orb-ring]');
if (!list) return;
var items = list.querySelectorAll('li');
var n = items.length;
if (!n) return;
var loader = new THREE.TextureLoader();

for (var i = 0; i < n; i++) {
var img = items[i].querySelector('img');
if (!img) continue;
var modKey = items[i].getAttribute('data-mod');
var texPack = (typeof ORBIT_TEX !== 'undefined' && ORBIT_TEX[modKey]) || null;
var src = texPack ? texPack.body : img.getAttribute('src');
if (!src) continue;

var aspect = (parseFloat(img.getAttribute('width')) || 300) / (parseFloat(img.getAttribute('height')) || 300);
var tex = loader.load(src);
tex.colorSpace = THREE.SRGBColorSpace;
tex.minFilter = THREE.LinearFilter;
tex.magFilter = THREE.LinearFilter;
tex.generateMipmaps = false;

var bodyMat = new THREE.SpriteMaterial({
map: tex, color: 0x22252d, transparent: true, opacity: 0,
alphaTest: 0.01, depthWrite: false, depthTest: true, fog: false
});
var body = new THREE.Sprite(bodyMat);
body.renderOrder = 8;

var haloImg = texPack ? texPack.halo : items[i].getAttribute('data-halo');
var haloTex = haloImg ? loader.load(haloImg) : tex;
haloTex.colorSpace = THREE.SRGBColorSpace;
haloTex.minFilter = THREE.LinearFilter;
haloTex.magFilter = THREE.LinearFilter;
haloTex.generateMipmaps = false;

var haloMat = new THREE.SpriteMaterial({
map: haloTex, color: 0x88aaff, transparent: true, opacity: 0,
depthWrite: false, depthTest: true,
blending: THREE.AdditiveBlending, fog: false
});
var halo = new THREE.Sprite(haloMat);
halo.renderOrder = 7;

var g = new THREE.Group();
g.add(halo, body);
S.orbitSpin.add(g);

S.mods.push({
g: g, body: body, halo: halo, aspect: aspect,
base: -Math.PI / 2 + (i / n) * Math.PI * 2, appear: 0,
w: 0.2, h: 0.2
});
}
}

/* ---------- 空气尘埃 ---------- */
function buildParticles(THREE) {
var N = 140;
var geo = new THREE.BufferGeometry();
var pos = new Float32Array(N * 3);
for (var i = 0; i < N; i++) {
pos[i * 3] = (Math.random() - 0.5) * 5.6;
pos[i * 3 + 1] = (Math.random() - 0.5) * 4.0;
pos[i * 3 + 2] = (Math.random() - 0.5) * 2.4;
}
geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
var mat = additive(THREE, new THREE.PointsMaterial({
size: 0.016, map: S.glowTex, color: 0xdce6ff, opacity: 0.3,
sizeAttenuation: true, fog: false
}));
var pts = new THREE.Points(geo, mat);
S.world.add(pts);
S.particles = pts;
S.pPos = pos;
S.pN = N;
}

/* ---------- 背景：银河星野 + 星云雾气 ---------- */
function buildStars(THREE) {
var N = 1800;
var geo = new THREE.BufferGeometry();
var pos = new Float32Array(N * 3);
var aSize = new Float32Array(N);
var aAlpha = new Float32Array(N);
var aPhase = new Float32Array(N);

for (var i = 0; i < N; i++) {
var x, y, z;
if (Math.random() < 0.50) {
/* 银河带：沿一条斜线铺开的密集星野 */
var t = (Math.random() - 0.5) * 2;
var th = (Math.random() - 0.5) * 0.34 + (Math.random() - 0.5) * 0.34;
x = t * 7.2 + th * 2.0;
y = t * 1.45 + th * 4.4;
z = -3.4 - Math.random() * 3.6;
} else {
x = (Math.random() - 0.5) * 15.0;
y = (Math.random() - 0.5) * 9.0;
z = -2.6 - Math.random() * 4.6;
}
pos[i * 3] = x;
pos[i * 3 + 1] = y;
pos[i * 3 + 2] = z;
var r = Math.random();
var bright = Math.random() < 0.06;
aSize[i] = bright ? 0.030 + Math.random() * 0.028 : 0.006 + r * r * r * 0.024;
aAlpha[i] = bright ? 0.55 + Math.random() * 0.45 : 0.16 + Math.random() * 0.66;
aPhase[i] = Math.random() * 6.283;
}

geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
geo.setAttribute('aSize', new THREE.BufferAttribute(aSize, 1));
geo.setAttribute('aAlpha', new THREE.BufferAttribute(aAlpha, 1));
geo.setAttribute('aPhase', new THREE.BufferAttribute(aPhase, 1));

var mat = new THREE.ShaderMaterial({
uniforms: {
uMap: { value: S.glowTex },
uScale: { value: 1200 },
uTime: { value: 0 },
uIgnite: { value: 0 }
},
vertexShader: [
'attribute float aSize;',
'attribute float aAlpha;',
'attribute float aPhase;',
'uniform float uScale, uTime;',
'varying float vA;',
'void main(){',
'  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
'  float tw = 0.72 + 0.28 * sin(uTime * 1.3 + aPhase);',
'  vA = aAlpha * tw;',
'  gl_PointSize = clamp(aSize * uScale / max(1.0, -mv.z), 1.0, 4.5);',
'  gl_Position = projectionMatrix * mv;',
'}'
].join('\n'),
fragmentShader: [
'precision highp float;',
'uniform sampler2D uMap;',
'uniform float uIgnite;',
'varying float vA;',
'void main(){',
'  float m = texture2D(uMap, gl_PointCoord).a;',
'  vec3 col = mix(vec3(0.70, 0.80, 1.0), vec3(1.0, 0.97, 0.92), fract(vA * 7.3));',
'  gl_FragColor = vec4(col * m * vA * uIgnite, 1.0);',
'}'
].join('\n'),
depthWrite: false, depthTest: true, side: THREE.DoubleSide
});
additive(THREE, mat);

var stars = new THREE.Points(geo, mat);
stars.renderOrder = 0;
S.scene.add(stars);
S.stars = stars;
S.matStars = mat;

/* 星云雾气：几片极淡的辉光，沿银河带方向叠出光晕 */
var hazeTex = S.glowTex;
var hazeSpec = [
{ x: -2.6, y: 0.9, s: [7.2, 3.4], c: 0x6f7fff, o: 0.10, r: -0.36 },
{ x: 1.6, y: -0.5, s: [8.6, 3.8], c: 0x9b6cff, o: 0.075, r: -0.30 },
{ x: 3.4, y: 1.6, s: [6.4, 3.0], c: 0x7fe3ff, o: 0.06, r: -0.42 }
];
var haze = [];
for (var h = 0; h < hazeSpec.length; h++) {
var spec = hazeSpec[h];
var hm = additive(THREE, new THREE.MeshBasicMaterial({
map: hazeTex, color: spec.c, opacity: 0, depthTest: true, side: THREE.DoubleSide
}));
var mesh = new THREE.Mesh(new THREE.PlaneGeometry(spec.s[0], spec.s[1]), hm);
mesh.position.set(spec.x, spec.y, -5.6 - h * 0.5);
mesh.rotation.z = spec.r;
mesh.renderOrder = 0;
S.scene.add(mesh);
haze.push({ mat: hm, base: spec.o });
}
S.starHaze = haze;
}

/* ---------- 布局 ---------- */
function applyLayout(copyFrac) {
var camera = S.camera;
if (!camera) return;
var fov = camera.fov * Math.PI / 180;
var VH = 2 * Math.tan(fov / 2) * camera.position.z;
var VW = VH * camera.aspect;


var narrow = VW < 2.2;
/* 文案以上的可用高度（扣掉与文案的间距和顶部留白）→ 机身不能超出
   文案已经压到画面底部（.orb-copy 的 padding-bottom 收窄到 ~2.6vh），
   机身占比从 70% 提到 76%，与文案之间只留一道窄缝，
   让机身成为这一屏的主角；上限仍由 VW 与文案顶端双重约束，不会压到字上。 */
var avail = Math.max(0.34, copyFrac - 0.030 - 0.035);
var Hphone = Math.min(VH * 0.76, VW * 0.94, VH * avail);
if (S.modelSize) S.phoneRoot.scale.setScalar(Hphone / S.modelSize.y);
/* 机身下缘与文案之间留出明显间距，其余高度全部给产品 */
S.shift = (0.5 - (copyFrac - 0.030)) * VH + Hphone * 0.5;
/* 遮挡判定用的机身包围盒（手机中心在 world 原点）：
   半宽 / 半高 / 半厚，以及卡片从机身正面向背面穿过时的淡出过渡距离 */
S.halfW = Hphone * 0.29;
S.halfH = Hphone * 0.5;
S.halfZ = Hphone * 0.045;
S.fadeZ = Hphone * 0.10;
S.occlude = narrow;

S.world.position.y = S.shift;
S.phoneRoot.position.y = 0;
if (S.key) S.key.target.position.y = S.shift - 0.18;

S.flat = narrow ? 0.88 : 1.0;
var R = Math.min(VH * (narrow ? 0.40 : 0.53), VW * (narrow ? 0.46 : 0.34), Hphone * 0.92);
S.R = R;

if (S.orbitLine) {
S.orbitLine.scale.set(R, R * S.flat, 1);
S.orbitLine.material.opacity = 0.03;
}
if (S.ringBand) S.ringBand.scale.set(R, R * S.flat, 1);
if (S.ringDust) {
S.ringDust.scale.set(R, R * S.flat, 1);
S.matDust.uniforms.uScale.value = (S.h / (2 * Math.tan(fov / 2))) * 1.05;
}

var mh = Math.min(VH * 0.105, R * 0.26);
for (var i = 0; i < S.mods.length; i++) {
S.mods[i].h = mh;
S.mods[i].w = mh * S.mods[i].aspect;
}

if (S.particles) S.particles.position.y = S.shift;
if (S.matStars) S.matStars.uniforms.uScale.value = (S.h / (2 * Math.tan(fov / 2))) * 1.05;
}

/* ---------- 每帧 ---------- */
var _v = null, _l = null, _c = null;

function tick(now) {
if (!S || !S.running) return;
var dt = Math.min(0.05, Math.max(0.001, (now - S.last) / 1000));
S.last = now;
S.t += dt;
try {
update(dt);
S.renderer.render(S.scene, S.camera);
} catch (e) {
/* 出错即停帧，回到视口时再由 requestRender 重新拉起 */
S.running = false;
raf = 0;
if (window.console && console.error) console.error('[orbit] frame', e);
return;
}
raf = requestAnimationFrame(tick);
}

function update(dt) {
S.frames++;
var THREE = S.THREE;
if (!_v) { _v = new THREE.Vector3(); _l = new THREE.Vector3(); _c = new THREE.Color(); }

S.mx += (S.tx - S.mx) * Math.min(1, dt * 3.4);
S.my += (S.ty - S.my) * Math.min(1, dt * 3.4);
S.hue += (S.hueT - S.hue) * Math.min(1, dt * 2.6);
S.hot += (S.hotT - S.hot) * Math.min(1, dt * 7.0);
S.ignite += (S.igniteTarget - S.ignite) * Math.min(1, dt * 1.5);
var ig = S.ignite;

/* 视差：极轻微，始终保持「正对」；减弱动效时保持静止 */
var live = S.calm ? 0 : 1;
S.world.rotation.y = S.mx * 0.055 * live;
S.world.rotation.x = -S.my * 0.038 * live;

S.spin += dt * 0.085 * live;
if (S.orbitSpin) S.orbitSpin.rotation.z = S.spin;

var energy = 0.86 + 0.20 * (1 - Math.abs(S.my)) + 0.08 * Math.sin(S.t * 1.1) * live;
var clock = S.calm ? 0 : S.t;
if (S.matCore) {
var u = S.matCore.uniforms;
u.uTime.value = clock; u.uHue.value = S.hue; u.uHot.value = S.hot;
u.uIgnite.value = ig; u.uEnergy.value = energy;
}
if (S.matBloom) {
var ub = S.matBloom.uniforms;
ub.uTime.value = clock; ub.uHue.value = S.hue; ub.uHot.value = S.hot;
ub.uIgnite.value = ig; ub.uEnergy.value = energy;
}
if (S.matDust) {
var ud = S.matDust.uniforms;
ud.uTime.value = clock; ud.uHue.value = S.hue; ud.uIgnite.value = ig;
}
if (S.matBand) {
var un = S.matBand.uniforms;
un.uTime.value = clock; un.uHue.value = S.hue; un.uIgnite.value = ig;
}
if (S.matStars) {
S.matStars.uniforms.uTime.value = S.t;
S.matStars.uniforms.uIgnite.value = Math.min(1, ig * 1.25);
}
if (S.starHaze) {
for (var hs = 0; hs < S.starHaze.length; hs++) {
S.starHaze[hs].mat.opacity = S.starHaze[hs].base * Math.min(1, ig * 1.4);
}
}

for (var i = 0; i < S.glows.length; i++) {
var gl = S.glows[i];
var pl = 1 + gl.pulse * Math.sin(S.t * 2.0 + gl.phase);
gl.mat.opacity = gl.base * pl * Math.min(1, ig * 1.8);
}

var R = S.R, flat = S.flat;
S.orbitTilt.updateMatrixWorld(true);
for (var j = 0; j < S.mods.length; j++) {
var m = S.mods[j];
var ang = m.base + S.spin;
m.g.position.set(Math.cos(ang) * R, Math.sin(ang) * R * flat, 0);
m.g.getWorldPosition(_v);
var depth = clamp(_v.z / (R * 0.5), -1, 1);

m.appear += (Math.min(1, Math.max(0, (ig - 0.06) / 0.7)) - m.appear) * Math.min(1, dt * 1.8);
var face = 1;
if (S.occlude) {
/* 只让真正被机身挡住的卡片淡出：把机身看作以 world 原点为中心的长方体，
   卡片必须同时落在「机身背面之后」（z 小于机身正面）与「机身左右、上下轮廓内」才淡出。
   旧逻辑只按 |x| 判断，星环转到机身正前方（下半弧）时也会被误判成被遮挡，淡到几乎看不见。 */
_l.copy(_v);
S.world.worldToLocal(_l);
var coverX = 1 - clamp((Math.abs(_l.x) - S.halfW * 0.86) / (S.halfW * 0.5), 0, 1);
var coverY = 1 - clamp((Math.abs(_l.y) - S.halfH * 0.86) / (S.halfH * 0.5), 0, 1);
var behind = clamp((S.halfZ - _l.z) / S.fadeZ, 0, 1);
face = 1 - behind * coverX * coverY;
}
var vis = m.appear * face;
var sc = (0.86 + 0.22 * depth);
m.halo.scale.set(m.w * 1.16 * sc, m.h * 1.16 * sc, 1);
m.body.scale.set(m.w * sc, m.h * sc, 1);

var hue = (ang / (Math.PI * 2) + S.t * 0.03 + S.hue + 0.5) % 1;
if (hue < 0) hue += 1;
_c.setHSL(hue, 0.85, 0.52);
m.halo.material.color.copy(_c);
m.halo.material.opacity = (0.52 + 0.34 * depth) * vis;
m.body.material.opacity = vis;

var lum = 0.042 + 0.075 * Math.max(0, depth);
m.body.material.color.setRGB(lum, lum * 1.06, lum * 1.24);
}

if (S.particles) {
var p = S.pPos;
for (var q = 0; q < S.pN; q++) {
p[q * 3 + 1] += dt * 0.035 * (0.6 + (q % 7) / 7);
if (p[q * 3 + 1] > 2.0) p[q * 3 + 1] = -2.0;
}
S.particles.geometry.attributes.position.needsUpdate = true;
S.particles.material.opacity = 0.10 + 0.24 * ig;
}
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
})();

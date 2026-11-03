
/* ------------------------------------------------------------------
翻转屏 3D：机身 GLB + 模块几何（assets/flip-parts.js）
· 竖向铰链在机身右缘；>180 混合到「工作站」姿态，支架随角度张开
· 三个预设一键直达，角度/机位都在两者之间插值
------------------------------------------------------------------ */
(function () {
'use strict';

var root = document.getElementById('flip');
if (!root) return;

var stage = root.querySelector('[data-fl2-stage]');
var tabs = root.querySelectorAll('[data-fl2-pose]');
var calmer = false;
try { calmer = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
if (window.Legend && window.Legend.reduceMotion) calmer = true;

var S = null, raf = 0;

function b64buf(str) {
var bin = atob(str), n = bin.length, u = new Uint8Array(n);
for (var i = 0; i < n; i++) u[i] = bin.charCodeAt(i);
return u.buffer;
}
function smooth(x) { return x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x); }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

/* ---------------- 文案入场 ---------------- */
function initCopy() {
var items = root.querySelectorAll('[data-fl2-reveal]');
var gsap = window.gsap, ST = window.ScrollTrigger;
if (!items.length) return;
if (!gsap || !ST || calmer) {
for (var i = 0; i < items.length; i++) { items[i].style.opacity = '1'; items[i].style.transform = 'none'; }
return;
}
gsap.set(items, { y: 30, autoAlpha: 0 });
ST.create({
trigger: root.querySelector('.fl2-head'),
start: 'top 88%',
once: true,
onEnter: function () {
gsap.to(items, { y: 0, autoAlpha: 1, duration: 0.9, stagger: 0.11, ease: 'power3.out', overwrite: true, clearProps: 'transform' });
}
});
}

/* ---------------- 3D ---------------- */
function fail(err) {
if (window.console && console.warn) console.warn('[flip] 3D 不可用', err);
root.classList.add('is-fallback');
}

function start() {
var L3 = window.Legend3D;
var THREE = L3.THREE;
var parts = window.FLIP_PARTS;
if (!window.LEGEND_GLB_B64 || !parts || !parts.parts) { fail('缺少几何数据'); return; }

var RAD = Math.PI / 180;
var HUNIT = 1 / 0.152;                 /* 1 世界单位 = 机身高度 */
var HINGE = new THREE.Vector3(0.2616, 0, 0.0372);  /* 转轴轴心：滑轨A/滑轨B/轴心同一位置，翻转时不分家 */
var SCREEN_ALIGN_X = 0.0048;  /* 屏幕1 相对机身居中：整体右移 ~0.73mm */
var SCREEN_ALIGN_Y = 0;       /* 屏幕1 下缘基准上移 0.17mm（原 -0.0011 修正） */
var STAND_ALIGN_X = 0.0048;   /* 支架1/2 + 支架转轴同样右移 ~0.73mm */
var MODULE_PUSH_Z = 0.0066;   /* 整个模块装到机身上时向手机方向推进 1mm */
var MOD_T = [0.0135, -0.116, -0.058];  /* 模块原始坐标 → 机身居中坐标 */
/* 0~180° 只有屏幕总成绕铰链翻转：屏幕面板(0,1) + 滑轨B(2,3) + 屏幕1(19~22) */
var SCREEN_PARTS = [0, 1, 2, 3, 19, 20, 21, 22];
/* 滑轨A(6,7) + 转轴轴心(16) 随翻转同步向右滑出；滑轨B/屏幕1/屏幕面板挂在这个铰链原点上一起走 */
var SLIDE_PARTS = [6, 7, 16];
var RAILA_SLIDE_X = 0.043;   /* 180° 时滑轨A/轴心/屏幕总成向右滑出 ~6.5mm，屏幕1 与手机背面分离约 0.5mm */
var STAND_PARTS = [8, 9, 10, 11, 12, 13, 14, 15, 25];
var STAND_ALIGN_PARTS = [12, 13, 14, 15, 25];  /* 支架1/2 + 支架转轴，随装配基准右移 */
var STAND2_PARTS = [14, 15];                   /* 支架2：单独成组，270° 时可以整体离机身远一点 */
/* 支架1(12,13) 绕支架转轴(25) 向外翻开；支架2(14,15)、柔光灯、硅胶垫、转轴固定在机身上，始终与手机平行 */
var STAND1_PARTS = [12, 13];
var STAND_PIN = new THREE.Vector3(0.283, 0, 0.047);  /* 支架转轴中心（含装配基准右移） */

var renderer;
try {
renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
} catch (e) { fail(e); return; }
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.26;
renderer.setClearColor(0x000000, 0);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.appendChild(renderer.domElement);

var scene = new THREE.Scene();
var cam = new THREE.PerspectiveCamera(30, 1, 0.01, 40);

/* 灯光：顶部大柔光箱 + 冷调侧光 + 背后轮廓，暗场里打亮铝件与玻璃 */
scene.add(new THREE.HemisphereLight(0x9fb3d8, 0x05060a, 0.55));
var key = new THREE.DirectionalLight(0xfff3e4, 3.1);
key.position.set(-1.7, 2.1, 2.1);
key.castShadow = true;
key.shadow.mapSize.width = 1024; key.shadow.mapSize.height = 1024;
key.shadow.bias = -0.0015; key.shadow.normalBias = 0.012;
scene.add(key);
var rim = new THREE.DirectionalLight(0x9fc0ff, 1.9); rim.position.set(2.0, 0.9, -1.7); scene.add(rim);
var fill = new THREE.DirectionalLight(0xffffff, 0.34); fill.position.set(1.0, -1.5, 1.7); scene.add(fill);

var envScene = new THREE.Scene();
envScene.add(new THREE.Mesh(new THREE.BoxGeometry(22, 15, 22), new THREE.MeshBasicMaterial({ color: 0x0a0b10, side: THREE.BackSide })));
function panel(w, h, color, mul, pos) {
var m = new THREE.MeshBasicMaterial({ color: color });
m.color.multiplyScalar(mul);
var mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
mesh.position.set(pos[0], pos[1], pos[2]);
mesh.lookAt(0, 0, 0);
envScene.add(mesh);
}
panel(6.5, 4.2, 0xfff3e6, 3.0, [-5, 5, 6]);
panel(1.1, 6.5, 0xffffff, 3.9, [-3.2, 3.6, 6.4]);
panel(1.6, 7, 0x9db6ff, 0.75, [6, 1, 3]);
panel(4.0, 0.5, 0xffffff, 5.0, [-1.0, 3.4, 3.0]);
panel(0.8, 8, 0xffffff, 0.7, [0.4, 2, -8]);
var pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(envScene, 0.04).texture;
pmrem.dispose();

/* 组层级：机身 / 模块（模块直接受世界矩阵驱动） */
var device = new THREE.Group();
scene.add(device);
var phoneRoot = new THREE.Group();
device.add(phoneRoot);var moduleRoot = new THREE.Group();
scene.add(moduleRoot);

S = {
THREE: THREE, renderer: renderer, scene: scene, cam: cam,
device: device, phoneRoot: phoneRoot, moduleRoot: moduleRoot,
ready: false, live: false, visible: false, running: false, last: 0, frames: 0,
theta: 0, stand: 0,
target: { theta: 0, stand: 0, cam: [0, 0, 3], tgt: [0, 0, 0] },
cur: { theta: 0, stand: 0, cam: [0, 0, 3], tgt: [0, 0, 0] },
standPivot: null, modReady: false, phoneReady: false,
mx: 0, my: 0, tx: 0, ty: 0, w: 0, h: 0
};

/* 手机 */
var loader = new L3.GLTFLoader();
loader.parse(b64buf(window.LEGEND_GLB_B64), '', function (gltf) {
var model = gltf.scene;
var box = new THREE.Box3().setFromObject(model);
model.position.sub(box.getCenter(new THREE.Vector3()));
var maxAniso = renderer.capabilities.getMaxAnisotropy();
model.traverse(function (o) {
if (!o.isMesh) return;
o.castShadow = true; o.receiveShadow = true;
var m = o.material;
if (!m) return;
if (m.map) { m.map.anisotropy = maxAniso; m.map.needsUpdate = true; }
if (m.envMapIntensity !== undefined) m.envMapIntensity = 1.10;
m.needsUpdate = true;
});
phoneRoot.add(model);
phoneRoot.scale.setScalar(HUNIT);
S.phoneReady = true;
maybeReady();
}, function (e) { fail(e); });

/* 模块 */
(function buildModule() {
var screen = new THREE.Group(), display = new THREE.Group(), body = new THREE.Group(), stand1 = new THREE.Group(), stand2 = new THREE.Group(), slide = new THREE.Group();
parts.parts.forEach(function (p, i) {
var pos = new Float32Array(b64buf(p.p));
var nor = new Int8Array(b64buf(p.nn));
var idx = p.iw === 2 ? new Uint16Array(b64buf(p.i)) : new Uint32Array(b64buf(p.i));
var g = new THREE.BufferGeometry();
g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
g.setAttribute('normal', new THREE.BufferAttribute(nor, 3, true));
g.setIndex(new THREE.BufferAttribute(idx, 1));
g.translate(MOD_T[0], MOD_T[1], MOD_T[2]);
g.scale(HUNIT, HUNIT, HUNIT);
if (STAND_ALIGN_PARTS.indexOf(i) >= 0) g.translate(STAND_ALIGN_X, 0, 0);
var mat = new THREE.MeshStandardMaterial({
color: new THREE.Color(p.c[0], p.c[1], p.c[2]),
metalness: p.mt, roughness: Math.min(0.92, p.r * 0.86),
transparent: p.o < 1, opacity: p.o,
envMapIntensity: 1.45
});
mat.color.convertSRGBToLinear();
/* 屏幕1 底下的模块基板（白塑料）平时被屏幕盖住，滑动拉出后会露出来：压成深灰，避免露出一块白板 */
if (i === 17 || i === 18) {
mat.color.setRGB(0.045, 0.05, 0.058);
mat.metalness = 0.25; mat.roughness = 0.82;
}
var mesh = new THREE.Mesh(g, mat);
mesh.castShadow = true; mesh.receiveShadow = true;
if (SCREEN_PARTS.indexOf(i) >= 0) {
  if (i === 2 || i === 3) screen.add(mesh);
  else display.add(mesh);
}
else if (SLIDE_PARTS.indexOf(i) >= 0) slide.add(mesh);
else if (STAND1_PARTS.indexOf(i) >= 0) stand1.add(mesh);
else if (STAND2_PARTS.indexOf(i) >= 0) stand2.add(mesh);
else body.add(mesh);
});
S.standPivot = new THREE.Group();
S.standPivot.position.copy(STAND_PIN);
stand1.position.set(-STAND_PIN.x, 0, -STAND_PIN.z);
S.standPivot.add(stand1);
/* 除屏幕总成外的零件仍装在机身上：0~180° 保持原位，只随机身姿态 */
var fixed = new THREE.Group();
fixed.add(body);
fixed.add(slide);
fixed.add(stand2);
fixed.add(S.standPivot);
device.add(fixed);
/* 屏幕面板/屏幕1 在滑轨B 上做装配偏置，保证 0° 与机身左右下对齐 */
display.position.set(SCREEN_ALIGN_X, SCREEN_ALIGN_Y, 0);
screen.add(display);
/* 屏幕总成单独挂在铰链组下：moduleRoot 的矩阵只驱动这三个零件 */
moduleRoot.add(screen);
S.screenGroup = screen;
S.displayGroup = display;
S.slideGroup = slide;
S.stand2Group = stand2;
S.stand1Group = stand1;
S.fixedGroup = fixed;
S.modReady = true;
maybeReady();
})();

function maybeReady() {
if (!S.phoneReady || !S.modReady || S.ready) return;
S.ready = true;
resize();
applyPose();
requestRender();
}
S.maybeReady = maybeReady;

/* ---------- 屏幕内容：180°/270° 各一组，随角度淡入淡出 ---------- */
function fadeWin(t, a, b, c, d) {
if (t <= a || t >= d) return 0;
if (t < b) return smooth((t - a) / (b - a));
if (t > c) return 1 - smooth((t - c) / (d - c));
return 1;
}
function roundedRectGeo(w, h, r) {
var s = new THREE.Shape(), x = -w / 2, y = -h / 2;
r = Math.min(r, w / 2, h / 2);
s.moveTo(x + r, y);
s.lineTo(x + w - r, y);
s.quadraticCurveTo(x + w, y, x + w, y + r);
s.lineTo(x + w, y + h - r);
s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
s.lineTo(x + r, y + h);
s.quadraticCurveTo(x, y + h, x, y + h - r);
s.lineTo(x, y + r);
s.quadraticCurveTo(x, y, x + r, y);
var g = new THREE.ShapeGeometry(s, 10);
g.computeBoundingBox();
var bb = g.boundingBox, pos = g.attributes.position, uv = [];
for (var i = 0; i < pos.count; i++) {
uv.push((pos.getX(i) - bb.min.x) / (bb.max.x - bb.min.x), (pos.getY(i) - bb.min.y) / (bb.max.y - bb.min.y));
}
g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
return g;
}
function screenMesh(key, w, h, r) {var mat = new THREE.MeshBasicMaterial({
transparent: true, opacity: 0, depthWrite: false, toneMapped: false, side: THREE.FrontSide,
polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
});
var mesh = new THREE.Mesh(roundedRectGeo(w, h, r), mat);
mesh.visible = false;
mesh.renderOrder = 3;
var src = (window.FLIP_SCREENS || {})[key];
if (src) {
new THREE.TextureLoader().load(src, function (tex) {
tex.colorSpace = THREE.SRGBColorSpace;
tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
/* cover：按平面宽高比裁掉多余部分，不拉伸 */
var ia = tex.image.width / tex.image.height, pa = w / h;
if (ia >= pa) { tex.repeat.set(pa / ia, 1); tex.offset.set((1 - pa / ia) / 2, 0); }
else { tex.repeat.set(1, ia / pa); tex.offset.set(0, (1 - ia / pa) / 2); }
mat.map = tex; mat.needsUpdate = true;
requestRender();
});
}
return mesh;
}
function setScreen(mesh, a) {
if (!mesh) return;
var on = mesh.material.map ? a : 0;
mesh.material.opacity = on;
mesh.visible = on > 0.01;
}

/* 手机屏幕：贴在正面玻璃前 0.6mm 内缩处（留极窄黑边）
   离玻璃留 0.4mm 余量，避免和机模玻璃深度打架出现闪烁 */
var phoneVideo = screenMesh('video', 0.0846, 0.1506, 0.0046);
phoneVideo.position.set(0.0006, 0, -0.00663);
phoneVideo.rotation.y = Math.PI;
phoneRoot.add(phoneVideo);
var phoneEditor = screenMesh('editor', 0.0846, 0.1506, 0.0046);
phoneEditor.position.set(0.0006, 0, -0.00655);
phoneEditor.rotation.y = Math.PI;
phoneRoot.add(phoneEditor);
/* 模块屏幕面部：贴满整块屏幕面板，不留边（挂在面板组里，跟着面板一起滑） */
var modComments = screenMesh('comments', 0.5525, 0.6835, 0.022);
modComments.position.set(-0.0045, -0.15, 0.07085);
S.displayGroup.add(modComments);
var modKeyboard = screenMesh('keyboard', 0.5525, 0.6835, 0.022);
modKeyboard.position.set(-0.0045, -0.15, 0.07115);
S.displayGroup.add(modKeyboard);
S.screens = [
{ mesh: phoneVideo, on: function (t) { return fadeWin(t, 142, 160, 200, 216); } },
{ mesh: modComments, on: function (t) { return fadeWin(t, 142, 160, 200, 216); } },
{ mesh: phoneEditor, on: function (t) { return fadeWin(t, 232, 252, 271, 272); } },
{ mesh: modKeyboard, on: function (t) { return fadeWin(t, 232, 252, 271, 272); } }
];

/* ---------- 姿态 ---------- */
var PRESETS = {
0: { cam: [0.46, 0.28, 2.72], tgt: [-0.16, 0.0, 0] },
180: { cam: [1.40, 0.44, -4.10], tgt: [0.56, 0.0, 0] },
240: { cam: [0.34, 1.02, -2.58], tgt: [0, -0.20, -0.15] }
};
var MIN_CAM_DIST = 2.8;    /* 翻转过程中相机到模型的最小距离，避免 90° 附近贴脸/穿模 */

/* 180~270°「工作站」姿态：手机横过来立在模块上方，模块平放在手机底部 */
var WP = {
roll: 90,        /* 机身绕屏幕法线滚转 90° → 横屏 */
lean: 12,        /* 180~240° 机身后仰；240~270° 慢慢立直，270° 时机身竖直 */
slide: 0.030,    /* 180° 之后滑轨继续拉出 ~4.5mm，但不脱离 */
deckOut: 0.01,  /* 180° 之后整组再往外一点：A/B 保持搭接，屏幕1 不会露内部基板 */
deckOutEnd: 0.005, /* 270° 再多一点 */
x: 0, y: -0.05, z: 0.02,          /* 整体位置：手机在上、模块在下 */
yEnd: -0.015, zEnd: -0.015
};
S.pose = WP;

var _m = new THREE.Matrix4(), _inv = new THREE.Matrix4().makeTranslation(-HINGE.x, 0, -HINGE.z);
var _q = new THREE.Quaternion();
var _qx = new THREE.Quaternion(), _qz = new THREE.Quaternion();
var _ax = new THREE.Vector3(1, 0, 0), _az = new THREE.Vector3(0, 0, 1);
var _p = new THREE.Vector3(), _sc = new THREE.Vector3();

function applyPose() {
if (!S || !S.ready) return;
var t = S.cur.theta;
var p2 = smooth(clamp((t - 180) / 90, 0, 1));   /* 180→270° 逐步展开到位 */
var p3 = smooth(clamp((t - 240) / 30, 0, 1));   /* 收尾，机身立直 */
var W = S.pose;
var lean = W.lean * p2 * (1 - p3);              /* 270° 时仰角归零，机身竖直 */

/* 机身：横过来 + 后仰，并整体位移，让手机在上、模块在下 */
_qx.setFromAxisAngle(_ax, lean * RAD);
_qz.setFromAxisAngle(_az, -W.roll * p2 * RAD);
device.quaternion.copy(_qx).multiply(_qz);
device.position.set(W.x * p2, (W.y + W.yEnd * p3) * p2, (W.z + W.zEnd * p3) * p2);
device.updateMatrixWorld(true);

/* 滑轨 A/B：0~180° 滑出 6.5mm；180° 之后继续拉出但不分离 */
var railSlide = RAILA_SLIDE_X * smooth(clamp(t / 180, 0, 1)) + W.slide * p2;
/* 180° 之后整组再往外一点：A/B 保持搭接（轴向少量交叉可以接受），屏幕1 不会露内部基板 */
var deckOut = (W.deckOut + W.deckOutEnd * p3) * p2;
if (S.slideGroup) S.slideGroup.position.set(railSlide, 0, 0);
if (S.displayGroup) {
/* 屏幕1 拽出量：朝「手机屏幕面对的方向」拽（模块自身坐标 -x，270° 时正好朝镜头/桌面外）。
   只改下面这一行的 0.03：0.0066 ≈ 1mm，0.03 ≈ 4.5mm；p2 保证只在 180° 之后拽 */
var _pull1 = 0.04 * p2;
S.displayGroup.position.set(SCREEN_ALIGN_X - _pull1, SCREEN_ALIGN_Y, 0);
}

/* 屏幕总成的翻转角 = 滑杆角度本身（0~180 翻到机身右侧，180~270 折到与手机垂直），
进度条到哪、实际就转到哪，不做压缩 */
var modDeg = t;
_m.makeTranslation(HINGE.x + railSlide + deckOut, 0, HINGE.z - MODULE_PUSH_Z);
_m.multiply(new THREE.Matrix4().makeRotationY(modDeg * RAD));
_m.multiply(_inv);
_m.premultiply(device.matrixWorld);
_m.decompose(_p, _q, _sc);
/* 屏幕总成以外的零件（机身侧模块、滑轨A 组、支架）整体向手机推进，装配关系不变 */
if (S.fixedGroup) S.fixedGroup.position.z = -MODULE_PUSH_Z;
moduleRoot.position.copy(_p);
moduleRoot.quaternion.copy(_q);

/* 支架 1：绕支架转轴向外翻开（支架2 与手机平行不动） */
if (S.standPivot) S.standPivot.rotation.y = S.cur.stand * RAD;
/* 支架2 在 270° 收尾时朝机身背面方向让开一点（0.0066 ≈ 1mm），避免和手机穿模 */
if (S.stand2Group) S.stand2Group.position.z = 0.004 * p3;

/* 取景中心：机身 + 屏幕总成的世界包围盒中心，相机全程跟着它，姿态变化时不会在画面里乱跳
（支架/滑轨这些细长件不参与，免得把取景中心拽偏） */
if (!S.box) { S.box = new THREE.Box3(); S.box2 = new THREE.Box3(); S.focusV = new THREE.Vector3(); }
moduleRoot.updateMatrixWorld(true);
S.box.setFromObject(S.phoneRoot);
S.box.union(S.box2.setFromObject(moduleRoot));
S.box.getCenter(S.focusV);
S.focus = S.focusV;

/* 屏幕内容：180°（双屏）与 270°（工作站）两组，随角度淡入淡出 */
if (S.screens) {
for (var si = 0; si < S.screens.length; si++) setScreen(S.screens[si].mesh, S.screens[si].on(t));
}
}

/* 支架 1 的展开角度：180° 之前不动，180° 之后跟着屏幕总成一起翻开；
翻过 90° 后继续撑到桌面上，成为机身背后看得见的支撑脚 */
function standFor(deg) {
var x = clamp((deg - 195) / 75, 0, 1);
return 112 * x * x * x;
}
var MID_PULL = 0.32;   /* 180~270 过渡中段整体后拉，屏幕总成甩动时不会出画 */
function camFor(deg) {
var a = deg <= 180 ? PRESETS[0] : PRESETS[180];
var b = deg <= 180 ? PRESETS[180] : PRESETS[240];
var f = deg <= 180 ? clamp(deg / 180, 0, 1) : clamp((deg - 180) / 90, 0, 1);
f = smooth(f);
var mid = Math.sin(Math.PI * clamp((deg - 180) / 90, 0, 1));
var pull = 1 + MID_PULL * mid;
var cam = [0, 0, 0], tgt = [0, 0, 0];
for (var i = 0; i < 3; i++) {
tgt[i] = a.tgt[i] + (b.tgt[i] - a.tgt[i]) * f;
cam[i] = a.cam[i] + (b.cam[i] - a.cam[i]) * f;
}
for (var j = 0; j < 3; j++) cam[j] = tgt[j] + (cam[j] - tgt[j]) * pull;
return { cam: cam, tgt: tgt };
}

function setAngle(deg, instant) {
deg = clamp(deg, 0, 270);
var pr = camFor(deg);
S.target.theta = deg;
S.target.stand = standFor(deg);
S.target.cam = pr.cam;
S.target.tgt = pr.tgt;
root.classList.toggle('is-pose-240', deg >= 200);
if (S.range && Math.abs(parseFloat(S.range.value) - deg) > 0.5) S.range.value = deg;
if (instant) {
S.cur.theta = S.target.theta;
S.cur.stand = S.target.stand;
S.cur.cam = S.target.cam.slice();
S.cur.tgt = S.target.tgt.slice();
applyPose();
placeCamera();
}
requestRender();
}

/* 取景：模型包围盒中心锁在画面右半边，机位只按预设的方向/距离绕行，
这样 0~270° 全程模型都待在右半区，不会因为模块甩出去而左右乱跳 */
var FRAME_X = -0.40;  /* 模型中心在画面里的横向位置（NDC，0=正中，负值=往右半区挪） */
var FRAME_Y = -0.02;  /* 纵向位置，稍微上移，给下方控制条留空间 */
/* 移动端机身放大后整体下移，压到变动的介绍文案与按钮区域，但仍在其下层 */
var FRAME_Y_MOBILE = 0.30;
function placeCamera() {
var z = S.zoom || 1;
var fx = S.focus ? S.focus.x : 0, fy = S.focus ? S.focus.y : 0, fz = S.focus ? S.focus.z : 0;
var ox = (S.cur.cam[0] - S.cur.tgt[0]) * z;
var oy = (S.cur.cam[1] - S.cur.tgt[1]) * z;
var oz = (S.cur.cam[2] - S.cur.tgt[2]) * z;
var dist = Math.sqrt(ox * ox + oy * oy + oz * oz);
if (dist < MIN_CAM_DIST) {
  var k = MIN_CAM_DIST / Math.max(0.0001, dist);
  ox *= k; oy *= k; oz *= k;
  dist = MIN_CAM_DIST;
}
var half = Math.tan(cam.fov * RAD / 2) * dist;
var wide = S.w <= 900 ? 0 : clamp((S.w - 700) / 500, 0, 1);
/* 沿「相机右方向」平移取景点：0°（从背面看）和 180°+（从正面看）方向相反，用世界坐标会左右跳 */
var len = Math.sqrt(ox * ox + oy * oy + oz * oz) || 0.0001;
var rx = oz / len, rz = -ox / len;
var shift = FRAME_X * wide * half * cam.aspect;
var lookX = fx + rx * shift;
var frameY = S.w <= 900 ? FRAME_Y_MOBILE : FRAME_Y;
var lookY = fy + frameY * half;
var lookZ = fz + rz * shift;
cam.position.set(lookX + ox + S.mx * 0.06, lookY + oy + S.my * 0.05, lookZ + oz);
cam.lookAt(lookX, lookY, lookZ);
}

/* ---------- 尺寸 ---------- */
function resize() {
if (!renderer) return;
var w = stage.clientWidth || 1, h = stage.clientHeight || 1;
if (w === S.w && h === S.h) return;
S.w = w; S.h = h;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(w, h, false);
cam.aspect = w / h;
cam.updateProjectionMatrix();
S.zoom = clamp(1.18 / Math.max(0.5, w / h), 1, 2.6);
/* 移动端机身放大：可占用变动文案与按钮区域，3D 图层仍在它们下层 */
if (w <= 900) S.zoom *= 0.78;
applyPose();        /* 构图补偿跟视口宽度相关，先重算姿态再摆机位 */
placeCamera();
requestRender();
}
S.resize = resize;

/* ---------- 交互 ---------- */
S.range = root.querySelector('[data-fl2-range]');
var modeCopy = [
{ title: '换个角度，看见自己。', desc: '后摄自拍也能实时预览，让构图与表情尽在眼前。还可展示内容、查看通知，或面对面显示翻译。' },
{ title: '精彩与讨论，同时展开。', desc: '一屏播放视频，一屏浏览评论。或者同时打开不同应用，减少来回切换。' },
{ title: '展开，就是创作空间。', desc: '主屏专注画面，副屏承载键盘、触控板或编辑工具。从文字输入到照片编辑、视频剪辑，让操作各就其位。' }
];
var modeTitle = root.querySelector('[data-fl2-mode-title]');
var modeDesc = root.querySelector('[data-fl2-mode-desc]');
var modeCur = 0;
function updateModeCopy(deg) {
var i = deg < 90 ? 0 : deg < 225 ? 1 : 2;
if (i === modeCur) return;
modeCur = i;
var m = modeCopy[i];
var els = [];
if (modeTitle) els.push(modeTitle);
if (modeDesc) els.push(modeDesc);
if (!els.length) return;
function apply() {
if (modeTitle) modeTitle.textContent = m.title;
if (modeDesc) modeDesc.textContent = m.desc;
}
var g = window.gsap;
if (!g || calmer) { apply(); return; }
/* 淡出 → 换字 → 逐条淡入，快速连点时后触发的覆盖前者 */
g.to(els, {
autoAlpha: 0, y: 12, duration: 0.18, ease: 'power2.in', overwrite: true,
onComplete: function () {
apply();
g.fromTo(els, { autoAlpha: 0, y: -10 },
{ autoAlpha: 1, y: 0, duration: 0.34, ease: 'power3.out', stagger: 0.06, overwrite: true, clearProps: 'transform' });
}
});
}
function markTab(deg) {
for (var k = 0; k < tabs.length; k++) {
var on = Math.abs((parseInt(tabs[k].getAttribute('data-fl2-pose'), 10) || 0) - deg) < 0.6;
tabs[k].classList.toggle('is-on', on);
tabs[k].setAttribute('aria-selected', on ? 'true' : 'false');
}
}
for (var i = 0; i < tabs.length; i++) {
tabs[i].addEventListener('click', function () {
var deg = parseInt(this.getAttribute('data-fl2-pose'), 10) || 0;
S.slow = true;          /* 按钮切换：放慢过渡 */
setAngle(deg, false);
markTab(deg);
updateModeCopy(deg);
});
}
if (S.range) {
/* 进度条可以任意角度拖动，只有左下三个按钮是固定档位 */
S.range.addEventListener('input', function () {
var v = parseFloat(this.value) || 0;
S.slow = false;
setAngle(v, false);
markTab(v);
updateModeCopy(v);
});
}
root.addEventListener('pointermove', function (e) {
var r = stage.getBoundingClientRect();
S.tx = clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1);
S.ty = clamp(((e.clientY - r.top) / r.height) * 2 - 1, -1, 1);
}, { passive: true });
root.addEventListener('pointerleave', function () { S.tx = 0; S.ty = 0; }, { passive: true });

/* ---------- 可见性 ---------- */
if ('IntersectionObserver' in window) {
new IntersectionObserver(function (entries) {
for (var e = 0; e < entries.length; e++) {
S.visible = entries[e].isIntersecting;
if (!S.visible) { stopRender(); continue; }
requestRender();
if (entries[e].intersectionRatio >= 0.5) goLive();
}
}, { threshold: [0, 0.2, 0.5, 0.8, 1], rootMargin: '0px' }).observe(root);
} else { S.visible = true; }

function goLive() {
if (!S || S.live || !S.ready || !S.visible) return;
S.live = true;
root.classList.add('is-live');
setAngle(0, true);
/* 从稍远处推近，作为入场 */
S.cur.cam = [PRESETS[0].cam[0] * 1.4, PRESETS[0].cam[1] + 0.55, PRESETS[0].cam[2] * 1.4];
placeCamera();
requestRender();
}
S.goLive = goLive;

function tick(now) {
if (!S || !S.running) return;
var dt = Math.min(0.05, Math.max(0.001, (now - S.last) / 1000));
S.last = now;
S.frames++;
try { step(dt); renderer.render(scene, cam); }
catch (err) { S.running = false; raf = 0; if (window.console) console.error('[flip] frame', err); return; }
raf = requestAnimationFrame(tick);
}

function step(dt) {
/* 平滑追随：按钮切换时用更慢的系数，拖滑杆时保持跟手 */
var k = 1 - Math.pow(S.slow ? 0.10 : 0.0015, dt);
var dTheta = S.target.theta - S.cur.theta;
var dStand = S.target.stand - S.cur.stand;
var moving = Math.abs(dTheta) > 0.05 || Math.abs(dStand) > 0.05;
S.cur.theta += dTheta * k;
S.cur.stand += dStand * k;
if (!moving) { S.cur.theta = S.target.theta; S.cur.stand = S.target.stand; S.slow = false; }
for (var i = 0; i < 3; i++) {
S.cur.cam[i] += (S.target.cam[i] - S.cur.cam[i]) * k;
S.cur.tgt[i] += (S.target.tgt[i] - S.cur.tgt[i]) * k;
}
S.mx += (S.tx - S.mx) * Math.min(1, dt * 3);
S.my += (S.ty - S.my) * Math.min(1, dt * 3);
applyPose();
placeCamera();
}

function requestRender() {
if (!S || S.running || !S.ready || !S.visible) return;
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

S.applyPose = applyPose;
if (window.Legend) window.Legend.debugSet('flip', S);

if (window.ResizeObserver) new ResizeObserver(function () { resize(); }).observe(stage);
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);
}

/* ---------------- 启动 ---------------- */
/* 外链依赖（legend-3d-bundle / Legend.glb.b64 / flip-parts / screens）已改为 defer：
   解析阶段不再被几 MB 脚本挡住，但这里必须等到 DOMContentLoaded ——
   defer 脚本按文档顺序执行完才会触发，此时全局对象一定就绪。 */
initCopy();
function bootFlip() {
if (!window.Legend3D || !window.FLIP_PARTS || !window.LEGEND_GLB_B64) { fail('依赖未加载'); return; }
try { start(); } catch (e) { fail(e); }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootFlip, { once: true });
else bootFlip();
})();

/* ===== 子模块卡片：摄像头模块的实时 3D 展示 =====
 * 复用 window.Legend3D（THREE + GLTFLoader）与 window.S6DracoLoader（主线程 Draco 解码）
 */
(function (global) {
'use strict';

function b64ToArrayBuffer(b64) {
var bin = global.atob(b64);
var len = bin.length;
var buf = new ArrayBuffer(len);
var view = new Uint8Array(buf);
for (var i = 0; i < len; i++) view[i] = bin.charCodeAt(i);
return buf;
}

function envTexture(THREE) {
var c = document.createElement('canvas');
c.width = 1024; c.height = 512;
var g = c.getContext('2d');
var grad = g.createLinearGradient(0, 0, 0, 512);
grad.addColorStop(0, '#f2f6ff');
grad.addColorStop(0.3, '#a8b8d4');
grad.addColorStop(0.55, '#2c3444');
grad.addColorStop(1, '#080a10');
g.fillStyle = grad; g.fillRect(0, 0, 1024, 512);
function blob(x, y, r, col) {
var rad = g.createRadialGradient(x, y, 0, x, y, r);
rad.addColorStop(0, col);
rad.addColorStop(1, 'rgba(255,255,255,0)');
g.fillStyle = rad;
g.beginPath();
g.arc(x, y, r, 0, Math.PI * 2);
g.fill();
}
blob(280, 80, 190, 'rgba(255,255,255,1)');
blob(760, 120, 160, 'rgba(220,232,255,.9)');
var t = new THREE.CanvasTexture(c);
t.mapping = THREE.EquirectangularReflectionMapping;
t.colorSpace = THREE.SRGBColorSpace;
return t;
}

function CameraCard(canvas, opts) {
opts = opts || {};
this.canvas = canvas;
this.THREE = global.Legend3D.THREE;
this.reduceMotion = !!opts.reduceMotion;
this.ready = false;
this.t = 0;
this.running = false;
this.raf = 0;
this.visible = true;
this._init();
}

CameraCard.prototype._init = function () {
var THREE = this.THREE;
var self = this;

var renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
this.renderer = renderer;

this.scene = new THREE.Scene();
this.camera = new THREE.PerspectiveCamera(28, 1, 0.001, 20);

var pmrem = new THREE.PMREMGenerator(renderer);
this.envRT = pmrem.fromEquirectangular(envTexture(THREE));

var key = new THREE.DirectionalLight(0xfff4e8, 2.2);
key.position.set(0.6, 1, 0.6);
this.scene.add(key);
var rim = new THREE.DirectionalLight(0x9db9ff, 2.2);
rim.position.set(-0.3, 0.4, -1);
this.scene.add(rim);
var fill = new THREE.DirectionalLight(0xffffff, 0.5);
fill.position.set(-0.6, 0.2, 0.8);
this.scene.add(fill);

this.resize();
window.addEventListener('resize', function () { self.resize(); });
if (window.ResizeObserver) {
this.ro = new ResizeObserver(function () { self.resize(); });
this.ro.observe(self.canvas.parentNode || self.canvas);
}
};

CameraCard.prototype.resize = function () {
if (!this.renderer) return;
var el = this.canvas.parentNode || this.canvas;
var w = el.clientWidth || 360;
var h = el.clientHeight || 300;
var dpr = Math.min(window.devicePixelRatio || 1, 1.75);
this.renderer.setPixelRatio(dpr);
this.renderer.setSize(w, h, false);
this.camera.aspect = w / h;
this.camera.updateProjectionMatrix();
this.render(0);
};

CameraCard.prototype.load = function (b64) {
var THREE = this.THREE;
var self = this;
var loader = new global.Legend3D.GLTFLoader();
if (global.S6DracoLoader) loader.setDRACOLoader(global.S6DracoLoader);

return new Promise(function (resolve, reject) {
loader.parse(b64ToArrayBuffer(b64), '', function (gltf) {
var obj = gltf.scene;
var box = new THREE.Box3().setFromObject(obj);
var size = box.getSize(new THREE.Vector3());
var center = box.getCenter(new THREE.Vector3());
obj.position.sub(center);

obj.traverse(function (o) {
if (!o.isMesh) return;
var m = o.material;
if (!m) return;
if (m.map) m.map.anisotropy = self.renderer.capabilities.getMaxAnisotropy();
m.envMapIntensity = 0.6;
});

self.scene.add(obj);
var radius = Math.max(size.x, size.y, size.z) * 0.5;
self.dist = radius / Math.tan(THREE.MathUtils.degToRad(14)) * 1.18;
self.ready = true;
self.render(0);
resolve(self);
}, reject);
});
};

CameraCard.prototype.render = function (t) {
if (!this.renderer || !this.ready) return;
var THREE = this.THREE;
var az = THREE.MathUtils.degToRad(35 + Math.sin(t) * 13);
var el = THREE.MathUtils.degToRad(16);
var d = this.dist;
this.camera.position.set(
Math.sin(az) * Math.cos(el) * d,
Math.sin(el) * d,
Math.cos(az) * Math.cos(el) * d
);
this.camera.lookAt(0, 0, 0);
this.renderer.render(this.scene, this.camera);
};

CameraCard.prototype.start = function () {
if (this.running || this.reduceMotion) {
if (this.reduceMotion) this.render(0);
return;
}
var self = this;
this.running = true;
function tick() {
self.raf = window.requestAnimationFrame(tick);
if (!self.visible) return;
self.t += 0.006;
self.render(self.t);
}
this.raf = window.requestAnimationFrame(tick);
};

CameraCard.prototype.stop = function () {
this.running = false;
if (this.raf) window.cancelAnimationFrame(this.raf);
this.raf = 0;
};

global.S6CameraCard = CameraCard;

})(window);


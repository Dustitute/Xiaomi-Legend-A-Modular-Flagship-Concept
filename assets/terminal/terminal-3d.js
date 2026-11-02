/* ===== S6 智能终端：实时 three.js 装配演示（本地 file:// 可直接打开） =====
 * 依赖：
 *   - assets/vendor/legend-3d-bundle.js  （THREE + GLTFLoader）
 *   - assets/vendor/draco/draco_decoder.js（asm.js 解码器，无需 Worker）
 *   - assets/terminal/models.js          （两个 GLB 的 base64）
 * 说明：file:// 下无法 fetch 二进制、也无法创建 Worker，所以 GLB 以 base64 内联在
 *       JS 里，Draco 在主线程解码（模型几何只有 ~100KB，解码很快）。
 */
(function (global) {
'use strict';

/* ---------------------------------------------------------------- Draco */

var dracoPromise = null;

function dracoReady() {
if (dracoPromise) return dracoPromise;
dracoPromise = new Promise(function (resolve, reject) {
if (typeof global.DracoDecoderModule !== 'function') {
reject(new Error('Draco decoder missing'));
return;
}
var cfg = {};
cfg.onModuleLoaded = function (draco) { resolve(draco); };
try { global.DracoDecoderModule(cfg); } catch (e) { reject(e); }
});
return dracoPromise;
}

function dracoDataType(draco, T) {
switch (T) {
case Float32Array: return draco.DT_FLOAT32;
case Int8Array: return draco.DT_INT8;
case Int16Array: return draco.DT_INT16;
case Int32Array: return draco.DT_INT32;
case Uint8Array: return draco.DT_UINT8;
case Uint16Array: return draco.DT_UINT16;
case Uint32Array: return draco.DT_UINT32;
}
return draco.DT_FLOAT32;
}

function decodeAttribute(draco, decoder, geo, attributeName, AttributeType, attribute) {
var numComponents = attribute.num_components();
var numPoints = geo.num_points();
var numValues = numPoints * numComponents;
var byteLength = numValues * AttributeType.BYTES_PER_ELEMENT;
var ptr = draco._malloc(byteLength);
decoder.GetAttributeDataArrayForAllPoints(geo, attribute,
dracoDataType(draco, AttributeType), byteLength, ptr);
var array = new AttributeType(draco.HEAPF32.buffer, ptr, numValues).slice();
draco._free(ptr);
return { name: attributeName, array: array, itemSize: numComponents };
}

function decodeGeometry(draco, decoder, array, cfg) {
var type = decoder.GetEncodedGeometryType(array);
var geo;
var status;
if (type === draco.TRIANGULAR_MESH) {
geo = new draco.Mesh();
status = decoder.DecodeArrayToMesh(array, array.byteLength, geo);
} else if (type === draco.POINT_CLOUD) {
geo = new draco.PointCloud();
status = decoder.DecodeArrayToPointCloud(array, array.byteLength, geo);
} else {
throw new Error('Unexpected Draco geometry type');
}
if (!status.ok() || geo.ptr === 0) {
throw new Error('Draco decode failed: ' + status.error_msg());
}

var out = { index: null, attributes: [] };
for (var name in cfg.attributeIDs) {
var AttributeType = global[cfg.attributeTypes[name]] || Float32Array;
var attr;
if (cfg.useUniqueIDs) {
attr = decoder.GetAttributeByUniqueId(geo, cfg.attributeIDs[name]);
} else {
var id = decoder.GetAttributeId(geo, draco[cfg.attributeIDs[name]]);
if (id === -1) continue;
attr = decoder.GetAttribute(geo, id);
}
if (!attr || attr.ptr === 0) continue;
out.attributes.push(decodeAttribute(draco, decoder, geo, name, AttributeType, attr));
}

if (type === draco.TRIANGULAR_MESH) {
var numFaces = geo.num_faces();
var numIndices = numFaces * 3;
var bytes = numIndices * 4;
var ptr = draco._malloc(bytes);
decoder.GetTrianglesUInt32Array(geo, bytes, ptr);
out.index = { array: new Uint32Array(draco.HEAPF32.buffer, ptr, numIndices).slice(), itemSize: 1 };
draco._free(ptr);
}

draco.destroy(geo);
return out;
}

var DracoLoader = {
decodeDracoFile: function (buffer, callback, attributeIDs, attributeTypes, vertexColorSpace, onError) {
dracoReady().then(function (draco) {
var decoder = new draco.Decoder();
try {
var input;
if (buffer && buffer.buffer instanceof ArrayBuffer && !(buffer instanceof ArrayBuffer)) {
input = new Int8Array(buffer.length);
input.set(buffer);
} else {
input = new Int8Array(buffer);
}
var data = decodeGeometry(draco, decoder, input, {
attributeIDs: attributeIDs,
attributeTypes: attributeTypes,
useUniqueIDs: !!attributeIDs
});
var THREE = global.Legend3D.THREE;
var geometry = new THREE.BufferGeometry();
if (data.index) geometry.setIndex(new THREE.BufferAttribute(data.index.array, 1));
for (var i = 0; i < data.attributes.length; i++) {
var a = data.attributes[i];
geometry.setAttribute(a.name, new THREE.BufferAttribute(a.array, a.itemSize));
}
callback(geometry);
} catch (err) {
if (onError) onError(err);
} finally {
draco.destroy(decoder);
}
})['catch'](function (err) {
if (onError) onError(err);
});
},
preload: function () { dracoReady(); }
};

/* ---------------------------------------------------------------- utils */

function b64ToArrayBuffer(b64) {
var bin = global.atob(b64);
var len = bin.length;
var buf = new ArrayBuffer(len);
var view = new Uint8Array(buf);
for (var i = 0; i < len; i++) view[i] = bin.charCodeAt(i);
return buf;
}

function makeScreenTexture(THREE) {
var c = document.createElement('canvas');
c.width = 768; c.height = 512;
var g = c.getContext('2d');
var grad = g.createLinearGradient(0, 0, 0, 512);
grad.addColorStop(0, '#16345f');
grad.addColorStop(0.42, '#0a1830');
grad.addColorStop(0.78, '#060b15');
grad.addColorStop(1, '#05080f');
g.fillStyle = grad; g.fillRect(0, 0, 768, 512);
var rad = g.createRadialGradient(230, 150, 0, 230, 150, 340);
rad.addColorStop(0, 'rgba(140,185,255,.22)');
rad.addColorStop(1, 'rgba(150,195,255,0)');
g.fillStyle = rad; g.fillRect(0, 0, 768, 512);
var rad2 = g.createRadialGradient(640, 380, 0, 640, 380, 260);
rad2.addColorStop(0, 'rgba(90,120,220,.12)');
rad2.addColorStop(1, 'rgba(90,120,220,0)');
g.fillStyle = rad2; g.fillRect(0, 0, 768, 512);
var t = new THREE.CanvasTexture(c);
t.colorSpace = THREE.SRGBColorSpace;
return t;
}
function makeEnvTexture(THREE) {
var c = document.createElement('canvas');
c.width = 1024; c.height = 512;
var g = c.getContext('2d');
var grad = g.createLinearGradient(0, 0, 0, 512);
grad.addColorStop(0.00, '#f2f6ff');
grad.addColorStop(0.28, '#9fb0cc');
grad.addColorStop(0.52, '#2c3444');
grad.addColorStop(0.78, '#0c0e14');
grad.addColorStop(1.00, '#05060a');
g.fillStyle = grad; g.fillRect(0, 0, 1024, 512);
function blob(x, y, r, color) {
var rad = g.createRadialGradient(x, y, 0, x, y, r);
rad.addColorStop(0, color);
rad.addColorStop(1, 'rgba(255,255,255,0)');
g.fillStyle = rad; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
}
blob(280, 70, 165, 'rgba(255,255,255,1)');
blob(760, 110, 150, 'rgba(214,228,255,.9)');
blob(560, 330, 380, 'rgba(120,150,255,.12)');
var tex = new THREE.CanvasTexture(c);
tex.mapping = THREE.EquirectangularReflectionMapping;
tex.colorSpace = THREE.SRGBColorSpace;
return tex;
}



/* ---------------------------------------------------------------- Viewer */

var RING = { x: 0.0, y: 0.1160, z: -0.0417 };
var RING_AXIS = null;
var DOCK = { x: -0.00055, y: 0.12161, z: -0.04439, rx: 10.9 };

function Viewer(canvas, opts) {
opts = opts || {};
this.canvas = canvas;
this.THREE = global.Legend3D.THREE;
this.reduceMotion = !!opts.reduceMotion;
this.target = { dock: 1, spin: 0, appear: 1, remove: 0 };
this.current = { dock: 1, spin: 0, appear: 1, remove: 0 };
this.ready = false;
this.failed = false;
this.running = false;
this.dirty = true;
this.screenLevel = 0;    /* 智能家庭屏壁纸亮度，直接跟随 02→03 滚动进度（0..1） */
this.screenMat = null;
this._raf = 0;
this._resizeTimer = 0;
this._init();
}

Viewer.prototype._init = function () {
var THREE = this.THREE;
var self = this;

var renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
this.renderer = renderer;

var scene = new THREE.Scene();
this.scene = scene;

var camera = new THREE.PerspectiveCamera(26, 1, 0.005, 40);
this.camera = camera;
var target = new THREE.Vector3(0, 0.093, 0.004);
var az = THREE.MathUtils.degToRad(207);
var el = THREE.MathUtils.degToRad(5);
var dist = 0.6;
camera.position.set(
target.x + Math.sin(az) * Math.cos(el) * dist,
target.y + Math.sin(el) * dist,
target.z + Math.cos(az) * Math.cos(el) * dist
);
camera.lookAt(target);
this.camBase = camera.position.clone();
this.camFar = camera.position.clone().sub(target).multiplyScalar(1.13).add(target);
this.camTarget = target;

var pmrem = new THREE.PMREMGenerator(renderer);
this.envRT = pmrem.fromEquirectangular(makeEnvTexture(THREE));
scene.environment = this.envRT.texture;

var maxAniso = renderer.capabilities.getMaxAnisotropy();
this.maxAniso = maxAniso;

var key = new THREE.DirectionalLight(0xfff4e8, 2.0);
key.position.set(0.5, 0.95, 0.35);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.camera.left = -0.16;
key.shadow.camera.right = 0.16;
key.shadow.camera.top = 0.22;
key.shadow.camera.bottom = -0.02;
key.shadow.camera.near = 0.1;
key.shadow.camera.far = 2;
key.shadow.radius = 5;
key.shadow.bias = -0.0005;
scene.add(key);

var rim = new THREE.DirectionalLight(0x9db9ff, 1.9);
rim.position.set(-0.1, 0.5, -1.2);
scene.add(rim);

var rim2 = new THREE.DirectionalLight(0x8fb2ff, 1.8);
rim2.position.set(-1.2, 0.35, 0.15);
scene.add(rim2);

var fill = new THREE.DirectionalLight(0xffffff, 0.35);
fill.position.set(-0.55, 0.2, 0.8);
scene.add(fill);

var ground = new THREE.Mesh(
new THREE.PlaneGeometry(1.2, 1.2),
new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.42 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = 0.0006;
ground.receiveShadow = true;
scene.add(ground);

this.root = new THREE.Group();
scene.add(this.root);

RING_AXIS = new THREE.Vector3(0, Math.sin(THREE.MathUtils.degToRad(10.9)), -Math.cos(THREE.MathUtils.degToRad(10.9))).normalize();

this.resize();
window.addEventListener('resize', function () { self.resize(); });
if (window.ResizeObserver) {
this._ro = new ResizeObserver(function () { self.resize(); });
this._ro.observe(self.canvas.parentNode || self.canvas);
}
};

Viewer.prototype.resize = function () {
if (!this.renderer) return;
var el = this.canvas.parentNode || this.canvas;
var w = el.clientWidth || 600;
var h = el.clientHeight || 600;
var dpr = Math.min(window.devicePixelRatio || 1, 1.75);
this.renderer.setPixelRatio(dpr);
this.renderer.setSize(w, h, false);
this.camera.aspect = w / h;
this.camera.updateProjectionMatrix();
this.dirty = true;
};

Viewer.prototype.load = function (models) {
var THREE = this.THREE;
var self = this;
var loader = new global.Legend3D.GLTFLoader();
loader.setDRACOLoader(DracoLoader);

function parse(b64) {
return new Promise(function (resolve, reject) {
loader.parse(b64ToArrayBuffer(b64), '', resolve, reject);
});
}

return Promise.all([parse(models.terminal), parse(models.phone)])
.then(function (res) {
var terminal = res[0].scene;
var tb = new THREE.Box3().setFromObject(terminal);
var tc = tb.getCenter(new THREE.Vector3());
terminal.position.set(-tc.x, -tb.min.y, -tc.z);
terminal.traverse(function (o) {
if (!o.isMesh) return;
o.castShadow = true;
o.receiveShadow = false;
var m = o.material;
if (!m) return;
if (m.name === 'SCREEN_GLASS') {
m.roughness = 0.42;
m.metalness = 0.1;
m.color.setHex(0x0a0c12);
m.envMapIntensity = 0.35;
} else {
m.envMapIntensity = 0.55;
if (m.map && m.map.isTexture) { m.map.anisotropy = self.maxAniso; m.map.needsUpdate = true; }
}
});
self.root.add(terminal);
self.terminal = terminal;
self._setupScreen(terminal);

var phone = res[1].scene;
var pb = new THREE.Box3().setFromObject(phone);
var pc = pb.getCenter(new THREE.Vector3());
phone.position.sub(pc);

/* 屏幕材质原本没有 UV，补一组按屏幕包围盒展开的平面 UV，才能显示壁纸 */
var screenNode = phone.getObjectByName('屏幕-1');
var screenTex = null;
if (screenNode) {
phone.updateMatrixWorld(true);
var sb = new THREE.Box3().setFromObject(screenNode);
var sw = Math.max(1e-6, sb.max.x - sb.min.x);
var sh = Math.max(1e-6, sb.max.y - sb.min.y);
var v3 = new THREE.Vector3();
screenNode.traverse(function (m) {
if (!m.isMesh) return;
var pos = m.geometry.attributes.position;
var uvs = new Float32Array(pos.count * 2);
for (var i = 0; i < pos.count; i++) {
v3.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
uvs[i * 2] = (v3.x - sb.min.x) / sw;
uvs[i * 2 + 1] = (v3.y - sb.min.y) / sh;
}
m.geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
});
screenTex = makeScreenTexture(THREE);
}
phone.traverse(function (o) {
if (!o.isMesh) return;
o.castShadow = true;
var nm = (o.parent && o.parent.name) || '';
if (nm === 'FlashSticker') { o.visible = false; return; }
var m = o.material;
if (!m) return;
if (screenTex && (/^屏幕/.test(m.name || '') || nm === '屏幕-1')) {
var sm = new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false });
sm.name = 'S6_SCREEN';
o.material = sm;
return;
}
if (m.name === 'SCREEN_GLASS') m.envMapIntensity = 0.55;
if (m.map && m.map.isTexture) { m.map.anisotropy = self.maxAniso; m.map.needsUpdate = true; }
if (m.normalMap && m.normalMap.isTexture) { m.normalMap.anisotropy = self.maxAniso; m.normalMap.needsUpdate = true; }
});
/* 收集手机材质，统一开透明通道，用于渐入 / 移走淡出 */
self.phoneMats = [];
var seenMats = [];
phone.traverse(function (o) {
if (!o.isMesh || !o.material) return;
var mat = o.material;
if (seenMats.indexOf(mat) !== -1) return;
seenMats.push(mat);
mat.transparent = true;
mat.depthWrite = true;
mat.needsUpdate = true;
self.phoneMats.push(mat);
});

self.phoneRoot = phone;

self.phonePivot = new THREE.Group();
self.phonePivot.add(phone);
self.root.add(self.phonePivot);

self.ready = true;
self.applyPose();
self.render();
self.start();
return self;
});
};

/* 独立运行时，给终端底座的宽屏补一张壁纸。
   只有本页在 window.S6_SCREEN_WALLPAPER 里放了图，其他页面不会显示。 */
Viewer.prototype._setupScreen = function (terminal) {
var THREE = this.THREE;
var self = this;
var src = global.S6_SCREEN_WALLPAPER;
var node = terminal.getObjectByName('屏幕-3');
if (!src || !node || !node.geometry) return;
var uv = node.geometry.attributes && node.geometry.attributes.uv;
if (!uv || !uv.count) return;
var u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
for (var i = 0; i < uv.count; i++) {
var u = uv.getX(i), v = uv.getY(i);
if (u < u0) u0 = u;
if (u > u1) u1 = u;
if (v < v0) v0 = v;
if (v > v1) v1 = v;
}
if (!(u1 > u0) || !(v1 > v0)) return;
var ru = 1 / (u1 - u0), rv = 1 / (v1 - v0);
var ou = -u0 * ru, ov = -v0 * rv;
/* 壁纸 4:1，屏幕约 3.7:1：居中裁掉左右少量，避免拉伸 */
var screenAspect = (u1 - u0) / (v1 - v0);
var imgAspect = 2508 / 627;
if (imgAspect > screenAspect) {
var crop = screenAspect / imgAspect;
ru /= crop;
ou = (ou - (1 - crop) * 0.5) / crop;
}
var tex = new THREE.Texture();
tex.colorSpace = THREE.SRGBColorSpace;
tex.anisotropy = this.maxAniso;
tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
tex.flipY = false;             /* 屏 UV 的 v 轴朝上，取消默认翻转 */
tex.repeat.set(-ru, -rv);      /* 屏幕 UV 与贴图方向相差 180°，两轴同时翻转 */
tex.offset.set(1 - ou, 1 - ov);
var img = new Image();
img.onload = function () {
tex.image = img;
tex.needsUpdate = true;
self.dirty = true;
};
img.src = src;
var base = node.material;
var mat = (base && base.clone) ? base.clone() : new THREE.MeshStandardMaterial();
mat.emissiveMap = tex;
mat.emissive = new THREE.Color(0xffffff);
mat.emissiveIntensity = this.screenLevel * 1.35;
mat.color = new THREE.Color(0x05070c);
mat.roughness = 0.22;
mat.metalness = 0;
mat.envMapIntensity = 0.32;
mat.needsUpdate = true;
node.material = mat;
this.screenMat = mat;
};

/* 壁纸亮度直接跟 02→03 的滚动进度走：到 03 居中时已经全亮 */
Viewer.prototype.setScreenLevel = function (level) {
level = Math.max(0, Math.min(1, level));
if (this.screenLevel === level) return;
this.screenLevel = level;
if (this.screenMat) this.screenMat.emissiveIntensity = level * 1.35;
this.dirty = true;
if (!this.running && this.ready) this.render();
};

Viewer.prototype.setTarget = function (dock, spin, appear, remove) {
this.target.dock = Math.max(0, Math.min(1, dock));
this.target.spin = Math.max(0, Math.min(90, spin));
this.target.appear = appear === undefined ? 1 : Math.max(0, Math.min(1, appear));
this.target.remove = remove === undefined ? 0 : Math.max(0, Math.min(1, remove));
this.dirty = true;
};

Viewer.prototype._easeDock = function (p) {
if (p <= 0) return 0;
if (p >= 1) return 1;
/* 先悬停、后加速落下：贴合点正好落在第一段文字居中时 */
return Math.pow(p, 1.8);
};

Viewer.prototype.applyPose = function () {
if (!this.ready) return;
var THREE = this.THREE;
var e = this._easeDock(this.current.dock);
var y = DOCK.y + (1 - e) * 0.105;
var z = DOCK.z - (1 - e) * 0.02;
var rx = THREE.MathUtils.degToRad(DOCK.rx + (1 - e) * 6.5);
var ry = THREE.MathUtils.degToRad((1 - e) * 5.5);

var pos = new THREE.Vector3(DOCK.x, y, z);
var q0 = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, 0, 'XYZ'));
var qSpin = new THREE.Quaternion().setFromAxisAngle(RING_AXIS, THREE.MathUtils.degToRad(this.current.spin));
var centre = new THREE.Vector3(RING.x, RING.y, RING.z);

this.phonePivot.quaternion.copy(qSpin).multiply(q0);
this.phonePivot.position.copy(pos).sub(centre).applyQuaternion(qSpin).add(centre);

/* 第二段→第三段：手机直接移走（上移 + 淡出） */
var rm = this.current.remove;
if (rm > 0.0001) {
this.phonePivot.position.y += rm * 0.16;
this.phonePivot.position.z -= rm * 0.03;
}

/* 渐入 / 移走的透明度：出现在落座阶段的前 32%，移走时在前 70% 内淡出 */
var op = this.current.appear * (1 - Math.min(1, rm / 0.62));
this.phonePivot.visible = op > 0.015;
if (this.phoneMats) {
for (var i = 0; i < this.phoneMats.length; i++) this.phoneMats[i].opacity = op;
}

var k = this.current.spin / 90;
if (this.camBase) {
if (k > 0.001) this.camera.position.lerpVectors(this.camBase, this.camFar, k);
else this.camera.position.copy(this.camBase);
this.camera.lookAt(this.camTarget);
}
};

Viewer.prototype.render = function () {
if (!this.renderer || !this.ready) return;
this.applyPose();
this.renderer.render(this.scene, this.camera);
};

Viewer.prototype.step = function () {
var t = this.target;
var c = this.current;
/* 移动端把状态过渡放慢，桌面端保持原速度 */
var slow = window.innerWidth <= 768;
var k = slow ? 0.07 : 0.22;
var ks = slow ? 0.07 : 0.35;
c.dock += (t.dock - c.dock) * k;
c.spin += (t.spin - c.spin) * ks;
c.appear += (t.appear - c.appear) * k;
c.remove += (t.remove - c.remove) * k;
if (Math.abs(t.dock - c.dock) < 0.0005) c.dock = t.dock;
if (Math.abs(t.spin - c.spin) < 0.5) c.spin = t.spin;
if (Math.abs(t.appear - c.appear) < 0.004) c.appear = t.appear;
if (Math.abs(t.remove - c.remove) < 0.004) c.remove = t.remove;
if (this.dirty || c.dock !== t.dock || c.spin !== t.spin || c.appear !== t.appear || c.remove !== t.remove) {
this.render();
this.dirty = false;
}
};

Viewer.prototype.start = function () {
if (this.running || this.reduceMotion) {
if (this.reduceMotion) this.render();
return;
}
var self = this;
this.running = true;
function tick() {
self._raf = window.requestAnimationFrame(tick);
self.step();
}
this._raf = window.requestAnimationFrame(tick);
};

Viewer.prototype.stop = function () {
this.running = false;
if (this._raf) window.cancelAnimationFrame(this._raf);
this._raf = 0;
};

global.S6Terminal3D = Viewer;
global.S6DracoLoader = DracoLoader;

})(window);
























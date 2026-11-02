/* ===== S7 打印机模块 · 模块合体与磁吸贴合（Three.js 实时渲染，file:// 直接打开可用） =====
 * 依赖（页面里按需动态加载）：
 *   - assets/vendor/legend-3d-bundle.js    THREE + GLTFLoader
 *   - assets/vendor/draco/draco_decoder.js asm.js Draco 解码器（主线程，无需 Worker）
 *   - assets/print/models.js               四个 GLB 的 base64（机身 / 光学模块 / 摄影手柄 / 打印机）
 * 说明：file:// 下无法 fetch 二进制、也无法创建 Worker，所以模型以 base64 内联，
 *       Draco 在主线程解码（几何 ~40 万点，200ms 量级）。
 *
 * 时序：
 *   0.10–1.74  机身、光学模块、摄影手柄依次旋转进场并组装
 *   1.74–4.90  停顿 3 秒，展示组装成品
 *   4.90–6.10  光学模块、摄影手柄飞出；机身翻平，屏幕朝下
 *   6.35–7.55  打印机模块像磁吸充电宝一样贴上机身背面（触点 + 顶针定位）
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
    try { global.DracoDecoderModule({ onModuleLoaded: resolve }); } catch (e) { reject(e); }
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

var DracoLoader = {
  preload: function () { dracoReady(); },
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
        var type = decoder.GetEncodedGeometryType(input);
        var geo = type === draco.TRIANGULAR_MESH ? new draco.Mesh() : new draco.PointCloud();
        var status = type === draco.TRIANGULAR_MESH
          ? decoder.DecodeArrayToMesh(input, input.length, geo)
          : decoder.DecodeArrayToPointCloud(input, input.length, geo);
        if (!status.ok()) throw new Error('Draco decode failed: ' + status.error_msg());

        var THREE = global.Legend3D.THREE;
        var geometry = new THREE.BufferGeometry();
        for (var name in attributeIDs) {
          var attr = decoder.GetAttributeByUniqueId(geo, attributeIDs[name]);
          if (!attr || attr.ptr === 0) continue;
          var comps = attr.num_components();
          var count = geo.num_points();
          var total = comps * count;
          var Arr = global[attributeTypes[name]] || Float32Array;
          var ptr = draco._malloc(total * Arr.BYTES_PER_ELEMENT);
          decoder.GetAttributeDataArrayForAllPoints(geo, attr, dracoDataType(draco, Arr), total * Arr.BYTES_PER_ELEMENT, ptr);
          geometry.setAttribute(name, new THREE.BufferAttribute(new Arr(draco.HEAPF32.buffer, ptr, total).slice(), comps));
          draco._free(ptr);
        }
        if (type === draco.TRIANGULAR_MESH) {
          var indices = geo.num_faces() * 3;
          var iptr = draco._malloc(indices * 4);
          decoder.GetTrianglesUInt32Array(geo, indices * 4, iptr);
          geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(draco.HEAPF32.buffer, iptr, indices).slice(), 1));
          draco._free(iptr);
        }
        draco.destroy(geo);
        callback(geometry);
      } catch (err) {
        if (onError) onError(err);
      } finally {
        draco.destroy(decoder);
      }
    })['catch'](function (err) { if (onError) onError(err); });
  }
};

/* ------------------------------------------------------------ 装配基准 */
/* 坐标全部取自 GLB 世界坐标（米）：
 *   机身背板 z = -0.0319；LaserLink 圆环中心 (-0.0803, -0.0720)；
 *   尾插（USB-C）中心 x = -0.0803，z = -0.0360；触点焊盘中心 (-0.0803, -0.0875)
 *   光学模块轴心偏移 (+0.0249, -0.0170)，尾端面 z = -0.0564
 *   摄影手柄 +x 侧是夹口（槽内深 x≈-0.0091、槽宽 z≈0.0095），皮革面朝 +z
 *   打印机背面 z = 0.0408 是磁性贴合面：硅胶压圈中心 (-0.0353, 0.0236)、
 *   顶针中心 (-0.0353, 0.0081)。绕 y 转 180° 后与机身触点、圆环正好对上。
 * 三件先按“机身竖放”的基准装好，再整体绕 z 转 −90°，得到横置的成品姿态。 */

var MOUNT = {
  body: { pos: [0, 0, 0], rot: [0, 0, 0] },
  optics: { pos: [-0.0554, -0.0890, 0.0245], rot: [0, 0, 0] },
  grip: { pos: [-0.0813, -0.1340, -0.0399], rot: [0, 0, Math.PI / 2] },
  printer: { pos: [-0.1156, -0.0956, 0.0086], rot: [0, Math.PI, 0] }
};
var ROLL = -Math.PI / 2;

/* 进场 / 退场：offset 在装配坐标系里（整体转 −90° 后就是画面方向） */
var INTRO = {
  body: { from: [0.06, -0.30, 0.09], spin: [0.32, -0.22, 2.4], start: 0.10, dur: 1.05 },
  optics: { from: [-0.26, 0.06, 0.26], spin: [0.18, 0.0, -3.5], start: 0.42, dur: 1.00 },
  grip: { from: [0.33, -0.10, -0.14], spin: [0.0, 0.0, -3.2], start: 0.74, dur: 1.00 },
  printer: { from: [0.0, -0.25, 0.016], spin: [0.0, 0.0, -0.10], start: 4.55, dur: 1.05 }
};

var SEQ = {
  holdFrom: 1.90,
  holdTo: 3.30,        /* 组装完成后停顿约 1.4 秒 */
  out: 3.30,
  outDur: 0.80,
  flatFrom: 3.35,
  flatDur: 1.05,
  photo: 5.62,         /* 打印机贴合后，从 deco 那一侧的缝里把照片推出来 */
  photoDur: 0.95,
  end: 6.90
};

/* 打印出来的照片卡（米）：68 × 76 的方形拍立得，白边 + 厚底边 */
var PHOTO = {
  x: -0.0813,
  z: -0.0085,
  w: 0.068,
  h: 0.076,
  fromY: -0.076,       /* 起始：整张藏在打印机体内 */
  toY: -0.019           /* 结束：露出大半张，压在 deco 上方 */
};

var LOOK = {
  fov: 26,
  az: 13, el: 6,              /* 组装阶段的机位 */
  flatAz: 6, flatEl: 50,     /* 机身放平后的俯视机位 */
  fill: 0.66,                 /* 侧视时成品占画面的比例 */
  flatFill: 0.88,             /* 俯视时占画面的比例 */
  exposure: 1.05,
  dprMax: 1.6
};

/* ---------------------------------------------------------------- 工具 */

var DEG = Math.PI / 180;

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function smoothstep(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
function easeInCubic(t) { return t * t * t; }
function easeOutQuint(t) { return 1 - Math.pow(1 - t, 5); }
function easeOutBack(t) { var c = 1.16; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }

function b64ToArrayBuffer(b64) {
  var bin = global.atob(b64);
  var len = bin.length;
  var buf = new ArrayBuffer(len);
  var view = new Uint8Array(buf);
  for (var i = 0; i < len; i++) view[i] = bin.charCodeAt(i);
  return buf;
}

/* 棚拍环境：深色房间 + 柔光箱，矩形轮廓映在金属倒角和镜筒上 */
function makeEnvTexture(THREE) {
  var c = document.createElement('canvas');
  var W = 2048, H = 1024;
  c.width = W; c.height = H;
  var g = c.getContext('2d');

  var grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0.00, '#ffffff');
  grad.addColorStop(0.26, '#e8edf6');
  grad.addColorStop(0.42, '#b7bfcd');
  grad.addColorStop(0.50, '#7d838f');
  grad.addColorStop(0.56, '#3a3e47');
  grad.addColorStop(0.72, '#20232a');
  grad.addColorStop(1.00, '#0c0e12');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);

  function softbox(x, y, w, h, color, blur, round) {
    g.save();
    if (typeof g.filter === 'string') g.filter = 'blur(' + blur + 'px)';
    g.fillStyle = color;
    g.beginPath();
    if (g.roundRect) g.roundRect(x, y, w, h, round || Math.min(w, h) * 0.22);
    else g.rect(x, y, w, h);
    g.fill();
    g.restore();
  }

  softbox(W * 0.10, H * 0.05, W * 0.30, H * 0.30, 'rgba(255,252,247,1)', 46, 70);      /* 主光 */
  softbox(W * 0.655, H * 0.10, W * 0.055, H * 0.52, 'rgba(244,249,255,.98)', 26, 28);  /* 右侧灯条 */
  softbox(W * 0.845, H * 0.16, W * 0.042, H * 0.40, 'rgba(198,218,255,.92)', 22, 22);  /* 背部冷光 */
  softbox(W * 0.24, H * 0.78, W * 0.52, H * 0.14, 'rgba(120,128,140,.30)', 60, 60);    /* 地面反弹 */
  softbox(W * 0.30, H * 0.375, W * 0.40, H * 0.075, 'rgba(214,224,238,.34)', 60, 40);  /* 相机方向反光板 */

  var tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* 锁屏壁纸：机身屏幕原本没有贴图，这里按屏幕尺寸生成一张 */
function makeScreenTexture(THREE) {
  var W = 1080, H = 1920;
  var c = document.createElement('canvas');
  c.width = W; c.height = H;
  var g = c.getContext('2d');

  var bg = g.createLinearGradient(0, 0, W * 0.4, H);
  bg.addColorStop(0.00, '#0a1018');
  bg.addColorStop(0.32, '#122236');
  bg.addColorStop(0.62, '#233247');
  bg.addColorStop(0.86, '#4b3a33');
  bg.addColorStop(1.00, '#7a4a2c');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);

  /* 光斑：模拟夜里街灯的散景 */
  function bokeh(x, y, r, color) {
    var rad = g.createRadialGradient(x, y, 0, x, y, r);
    rad.addColorStop(0, color);
    rad.addColorStop(0.6, color.replace(/[\d.]+\)$/, '0.16)'));
    rad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rad;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  bokeh(W * 0.22, H * 0.62, 190, 'rgba(255,196,128,0.55)');
  bokeh(W * 0.74, H * 0.46, 150, 'rgba(150,200,255,0.42)');
  bokeh(W * 0.58, H * 0.74, 240, 'rgba(255,150,90,0.30)');
  bokeh(W * 0.30, H * 0.24, 210, 'rgba(120,170,255,0.22)');

  /* 顶部状态栏 */
  g.fillStyle = 'rgba(255,255,255,.88)';
  g.font = '600 34px Inter, "PingFang SC", sans-serif';
  g.textAlign = 'left';
  g.fillText('9:41', 74, 108);
  var bx = W - 74;
  g.fillRect(bx - 132, 82, 42, 26);              /* 电池 */
  g.strokeStyle = 'rgba(255,255,255,.6)';
  g.lineWidth = 2;
  g.strokeRect(bx - 132, 82, 42, 26);
  g.fillStyle = 'rgba(255,255,255,.4)';
  g.fillRect(bx - 128, 86, 26, 18);
  for (var i = 0; i < 3; i++) {                   /* 信号 */
    g.fillStyle = 'rgba(255,255,255,.85)';
    g.fillRect(bx - 78 + i * 10, 108 - (10 + i * 6), 5, 10 + i * 6);
  }

  /* 时间与日期 */
  g.textAlign = 'center';
  g.fillStyle = 'rgba(255,255,255,.96)';
  g.font = '200 300px Inter, "Helvetica Neue", sans-serif';
  g.fillText('9:41', W / 2, H * 0.36);
  g.fillStyle = 'rgba(255,255,255,.72)';
  g.font = '400 46px Inter, "PingFang SC", sans-serif';
  g.fillText('10月29日  星期五', W / 2, H * 0.36 + 92);

  /* 底部小字，点出机器身份 */
  g.fillStyle = 'rgba(255,255,255,.38)';
  g.font = '500 30px Inter, "PingFang SC", sans-serif';
  g.fillText('XIAOMI  LEGEND', W / 2, H - 150);

  var tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/* 打印照片：白边 + 厚底边的拍立得卡面，中间放传进来的那张图 */
function makePhotoTexture(THREE, img) {
  var W = 544, H = 608;                 /* 68 × 76 mm，8px/mm */
  var pad = 36, imgH = 468;
  var c = document.createElement('canvas');
  c.width = W; c.height = H;
  var g = c.getContext('2d');

  /* 相纸底色：极淡的暖白渐变，避免纯白死板 */
  var grad = g.createLinearGradient(0, 0, W * 0.3, H);
  grad.addColorStop(0, '#fffefb');
  grad.addColorStop(0.55, '#faf8f3');
  grad.addColorStop(1, '#f2efe8');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);

  var bw = W - pad * 2, bh = imgH;
  if (img && img.width) {
    var s = Math.max(bw / img.width, bh / img.height);
    var dw = img.width * s, dh = img.height * s;
    g.save();
    g.beginPath(); g.rect(pad, pad, bw, bh); g.clip();
    g.drawImage(img, pad + (bw - dw) / 2, pad + (bh - dh) / 2, dw, dh);
    g.restore();
  } else {
    g.fillStyle = '#d8d4cc';
    g.fillRect(pad, pad, bw, bh);
  }
  /* 照片与白边之间的细影，像真的印上去 */
  g.strokeStyle = 'rgba(0,0,0,.13)';
  g.lineWidth = 2;
  g.strokeRect(pad + 1, pad + 1, bw - 2, bh - 2);
  g.strokeStyle = 'rgba(255,255,255,.55)';
  g.lineWidth = 1;
  g.strokeRect(pad + 3.5, pad + 3.5, bw - 7, bh - 7);

  var tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function loadPhotoImage() {
  return new Promise(function (resolve) {
    if (!global.PRINT_PHOTO) { resolve(null); return; }
    var img = new global.Image();
    img.onload = function () { resolve(img); };
    img.onerror = function () { resolve(null); };
    img.src = global.PRINT_PHOTO;
  });
}

/* ---------------------------------------------------------------- Viewer */

function Assembly(canvas, opts) {
  opts = opts || {};
  this.canvas = canvas;
  this.THREE = global.Legend3D.THREE;
  this.reduceMotion = !!opts.reduceMotion;
  this.onEvent = opts.onEvent || null;
  this.ready = false;
  this.failed = false;
  this.running = false;
  this.visible = true;
  this.dirty = true;
  this.seq = { active: false, t: 0, done: false };
  this.flat = 0;
  this._aimK = 0;
  this.aimTarget = null;
  this.locks = { body: false, optics: false, grip: false, printer: false };
  this.pose = { az: LOOK.az * DEG, el: LOOK.el * DEG, azTarget: LOOK.az * DEG, elTarget: LOOK.el * DEG };
  this._raf = 0;
  this._last = 0;
  this._init();
}

Assembly.prototype._init = function () {
  var THREE = this.THREE;
  var self = this;
  var canvas = this.canvas;

  var renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance'
  });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = LOOK.exposure;
  this._exposure = LOOK.exposure;
  /* 三件互相投影：镜筒压在机身上的阴影、手柄夹住下缘的暗部，是“装得进去”的关键 */
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  this.renderer = renderer;

  var scene = this.scene = new THREE.Scene();

  var pmrem = new THREE.PMREMGenerator(renderer);
  this.envRT = pmrem.fromEquirectangular(makeEnvTexture(THREE));
  scene.environment = this.envRT.texture;

  scene.add(new THREE.HemisphereLight(0xffffff, 0xdfe5f0, 0.26));

  var key = new THREE.DirectionalLight(0xfff3e4, 3.15);
  key.position.set(0.46, 0.95, 0.62);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -0.18;
  key.shadow.camera.right = 0.18;
  key.shadow.camera.top = 0.18;
  key.shadow.camera.bottom = -0.18;
  key.shadow.camera.near = 0.05;
  key.shadow.camera.far = 1.4;
  key.shadow.bias = -0.00035;
  key.shadow.normalBias = 0.0016;
  key.shadow.radius = 3;
  scene.add(key);

  var rim = new THREE.DirectionalLight(0x8fb0ff, 2.2);
  rim.position.set(-0.80, 0.34, -0.72);
  scene.add(rim);

  var rim2 = new THREE.DirectionalLight(0xffffff, 1.45);
  rim2.position.set(0.92, 0.12, -0.52);
  scene.add(rim2);

  var fill = new THREE.DirectionalLight(0xfff6ec, 0.30);
  fill.position.set(0.05, -0.62, 0.85);
  scene.add(fill);

  var cam = this.camera = new THREE.PerspectiveCamera(LOOK.fov, 1, 0.01, 20);

  /* ui（拖动） → showcase → flat（机身放平） → roll（转 −90° 横置） → rig（居中） */
  var ui = this.ui = new THREE.Group();
  var showcase = this.showcase = new THREE.Group();
  var flat = this.flatG = new THREE.Group();
  var roll = this.roll = new THREE.Group();
  var rig = this.rig = new THREE.Group();
  scene.add(ui);
  ui.add(showcase);
  showcase.add(flat);
  flat.add(roll);
  roll.add(rig);
  roll.rotation.z = ROLL;

  this.parts = {};

  this.resize();
  window.addEventListener('resize', function () { self.resize(); });
  if (global.ResizeObserver) {
    this._ro = new ResizeObserver(function () { self.resize(); });
    this._ro.observe(canvas.parentNode || canvas);
  }
};

Assembly.prototype.resize = function () {
  if (!this.renderer) return;
  var box = this.canvas.parentNode || this.canvas;
  var w = box.clientWidth || 900;
  var h = box.clientHeight || 420;
  var dpr = Math.min(global.devicePixelRatio || 1, LOOK.dprMax);
  this.viewW = w;
  this.viewH = h;
  this.renderer.setPixelRatio(dpr);
  this.renderer.setSize(w, h, false);
  this.camera.aspect = w / h;
  this.camera.updateProjectionMatrix();
  this.dirty = true;
  this.render();
};

/* 相机：az/el 由「组装侧视 → 放平俯视」插值；距离按当前姿态的投影包围盒算，避免裁切。
 * 出纸后镜头缓缓把视点挪到相片上，最后成片居中。 */
Assembly.prototype._placeCamera = function () {
  var cam = this.camera;
  var f = this.flat;
  var az = lerp(LOOK.az, LOOK.flatAz, f) * DEG + (this.pose.az - LOOK.az * DEG);
  var el = lerp(LOOK.el, LOOK.flatEl, f) * DEG + (this.pose.el - LOOK.el * DEG);
  this.renderer.toneMappingExposure = LOOK.exposure * (1 - 0.10 * f);
  var d = this._fitDistance(f, az, el);
  var k = this._aimK || 0;
  var ax = 0, ay = 0, az0 = 0;
  if (this.aimTarget && k > 0) {
    ax = this.aimTarget.x * k;
    ay = this.aimTarget.y * k;
    az0 = this.aimTarget.z * k;
  }
  cam.position.set(
    ax + Math.sin(az) * Math.cos(el) * d,
    ay + Math.sin(el) * d,
    az0 + Math.cos(az) * Math.cos(el) * d
  );
  cam.lookAt(ax, ay, az0);
  cam.updateProjectionMatrix();
};

Assembly.prototype._fitDistance = function (f, az, el) {
  var s = this.size;
  if (!s) return 0.6;
  var half = [s.x / 2, s.y / 2, s.z / 2];
  var cf = Math.cos(ROLL), sf = Math.sin(ROLL);
  var cx = Math.cos(-Math.PI / 2 * f), sx = Math.sin(-Math.PI / 2 * f);
  var sinAz = Math.sin(az), cosAz = Math.cos(az);
  var sinEl = Math.sin(el), cosEl = Math.cos(el);
  var maxW = 0, maxH = 0;
  for (var i = 0; i < 8; i++) {
    var p = [half[0] * (i & 1 ? 1 : -1), half[1] * (i & 2 ? 1 : -1), half[2] * (i & 4 ? 1 : -1)];
    /* rig → roll(Rz) → flat(Rx) */
    var rx = p[0] * cf - p[1] * sf;
    var ry = p[0] * sf + p[1] * cf;
    var rz = p[2];
    var fy = ry * cx - rz * sx;
    var fz = ry * sx + rz * cx;
    /* 相机基向量 */
    var w = Math.abs(fx0(rx, fy, sinAz, cosAz));
    var h = Math.abs(rx * -sinAz * sinEl + fy * cosEl + fz * -cosAz * sinEl);
    if (w > maxW) maxW = w;
    if (h > maxH) maxH = h;
  }
  var t = Math.tan(LOOK.fov * DEG / 2);
  /* 视点朝相片偏移后，机身在画面里会往边上挤：把偏移量算进包围盒，保证两边都不出画 */
  var k = this._aimK || 0;
  if (this.aimTarget && k > 0) {
    var ax = this.aimTarget.x * k, ay = this.aimTarget.y * k, azz = this.aimTarget.z * k;
    maxW += Math.abs(ax * cosAz + azz * -sinAz);
    maxH += Math.abs(ax * -sinAz * sinEl + ay * cosEl + azz * -cosAz * sinEl);
  }
  var fill = lerp(LOOK.fill, LOOK.flatFill, f);
  var dW = maxW / (t * this.camera.aspect);
  var dH = maxH / t;
  return Math.max(dW, dH) / fill;
};

function fx0(x, y, sinAz, cosAz) { return x * cosAz - y * sinAz; }

Assembly.prototype.load = function () {
  var THREE = this.THREE;
  var self = this;
  if (!global.PRINT_MODELS) return Promise.reject(new Error('PRINT_MODELS missing'));
  if (!global.Legend3D) return Promise.reject(new Error('Legend3D missing'));

  var loader = new global.Legend3D.GLTFLoader();
  loader.setDRACOLoader(DracoLoader);
  var maxAniso = this.renderer.capabilities.getMaxAnisotropy();

  function parse(key) {
    return new Promise(function (resolve, reject) {
      loader.parse(b64ToArrayBuffer(global.PRINT_MODELS[key]), '', resolve, reject);
    });
  }

  var keys = ['body', 'optics', 'grip', 'printer'];
  return Promise.all(keys.map(parse).concat([loadPhotoImage()])).then(function (res) {
    var photoImg = res.pop();
    var box = new THREE.Box3();

    res.forEach(function (gltf, i) {
      var name = keys[i];
      var model = gltf.scene;

      model.traverse(function (o) {
        if (!o.isMesh) return;
        /* 闪光灯上的贴片（FlashSticker）正常显示，之前隐藏掉了会缺一块贴图 */
        var m = o.material;
        if (!m) return;
        o.castShadow = !m.transparent;
        o.receiveShadow = true;
        /* 材质分级：金属强反射、玻璃高光、皮革压低环境权重，深色机身靠柔光箱轮廓出层次 */
        var metal = (m.metalness || 0) > 0.5;
        var glass = !!m.transparent || /GLASS|LENS/i.test(m.name || '');
        var leather = !!(m.map && (m.roughness || 0) > 0.5) && !metal;
        if (glass) {
          m.envMapIntensity = 1.35;
          if (m.roughness !== undefined) m.roughness = Math.min(m.roughness, 0.08);
        } else if (metal) {
          m.envMapIntensity = name === 'grip' ? 1.3 : 1.2;
          if (m.roughness !== undefined) m.roughness = Math.max(0.06, Math.min(m.roughness, 0.2));
        } else if (leather) {
          m.envMapIntensity = 0.5;
        } else if (name === 'optics') {
          m.envMapIntensity = 0.72;
          if (m.roughness !== undefined) m.roughness = Math.max(0.22, m.roughness);
        } else if (name === 'printer') {
          /* 白色机身容易过曝：压环境权重、放宽粗糙度，让形体靠明暗过渡而不是高光撑着 */
          m.envMapIntensity = 0.46;
          if (m.roughness !== undefined) m.roughness = Math.max(0.40, m.roughness);
        } else {
          m.envMapIntensity = name === 'body' ? 1.05 : 0.62;
        }
        if (m.map && m.map.isTexture) { m.map.anisotropy = maxAniso; m.map.needsUpdate = true; }
        if (m.normalMap && m.normalMap.isTexture) { m.normalMap.anisotropy = maxAniso; m.normalMap.needsUpdate = true; }
        if (m.roughnessMap && m.roughnessMap.isTexture) { m.roughnessMap.anisotropy = maxAniso; m.roughnessMap.needsUpdate = true; }
      });

      if (name === 'body') self._addScreen(model);

      var mount = MOUNT[name];
      /* anim 在外、wrap 在内：进场偏移写在装配坐标系里，不会被零件自身的旋转（如手柄 90°、打印机 180°）带偏 */
      var anim = new THREE.Group();
      var wrap = new THREE.Group();        /* 最终装配位（不动） */
      wrap.position.set(mount.pos[0], mount.pos[1], mount.pos[2]);
      wrap.rotation.set(mount.rot[0], mount.rot[1], mount.rot[2]);
      anim.add(wrap);
      wrap.add(model);
      self.rig.add(anim);
      var mats = [];
      model.traverse(function (o) {
        if (!o.isMesh || !o.material) return;
        if (mats.indexOf(o.material) === -1) mats.push(o.material);
      });
      self.parts[name] = { anim: anim, wrap: wrap, model: model, mats: mats, fading: false };
      box.expandByObject(wrap);
    });

    /* 照片也参与构图：按它最终露出的位置扩展包围盒，避免出画 */
    self._addPhoto(photoImg);
    box.expandByPoint(new THREE.Vector3(PHOTO.x - PHOTO.w / 2, PHOTO.toY - PHOTO.h / 2, PHOTO.z));
    box.expandByPoint(new THREE.Vector3(PHOTO.x + PHOTO.w / 2, PHOTO.toY + PHOTO.h / 2, PHOTO.z));

    /* 装配体居中：rig 平移 −包围盒中心，相机就围绕成品中心转 */
    var ctr = box.getCenter(new THREE.Vector3());
    self.size = box.getSize(new THREE.Vector3());
    self.rig.position.set(-ctr.x, -ctr.y, -ctr.z);

    /* 预演一次「终态」，记下相片在世界里的位置：收尾时镜头要往它身上移 */
    self._applySequence(SEQ.end, false);
    self.scene.updateMatrixWorld(true);
    self.aimTarget = self.photoG.getWorldPosition(new THREE.Vector3());

    self._applySequence(0, true);
    self.ready = true;
    self.render();
    return self;
  });
};

/* 打印出来的相片：贴在机身背面法线方向的薄卡片，从打印机 deco 侧推出 */
Assembly.prototype._addPhoto = function (img) {
  var THREE = this.THREE;
  var geo = new THREE.PlaneGeometry(PHOTO.w, PHOTO.h);
  /* 相纸用不受光材质：保证打印出来的画面颜色准确、白边干净 */
  var mat = new THREE.MeshBasicMaterial({
    map: makePhotoTexture(THREE, img),
    toneMapped: false,
    side: THREE.DoubleSide
  });
  var mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  var g = new THREE.Group();
  g.position.set(PHOTO.x, PHOTO.fromY, PHOTO.z);
  g.add(mesh);
  g.visible = false;
  this.rig.add(g);
  this.photoG = g;
};

/* 机身屏幕原本没有贴图：找屏节点，按屏幕包围盒补平面 UV + 生成壁纸 */
Assembly.prototype._addScreen = function (body) {
  var THREE = this.THREE;
  var node = null;
  body.traverse(function (o) {
    if (node) return;
    var n = o.name || '';
    if (n.indexOf('屏幕') === 0) node = o;
  });
  if (!node) return;
  body.updateMatrixWorld(true);
  var box = new THREE.Box3().setFromObject(node);
  var w = box.max.x - box.min.x;
  var h = box.max.y - box.min.y;
  if (w <= 0 || h <= 0) return;

  var tex = makeScreenTexture(THREE);
  var mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  var v = new THREE.Vector3();
  var count = 0;

  /* 屏节点里叠了好几层共面的玻璃/面板，逐层铺同一张壁纸最稳（S6 也是这么处理的） */
  node.traverse(function (o) {
    if (!o.isMesh || !o.geometry) return;
    var pos = o.geometry.attributes.position;
    if (!pos) return;
    var uvs = new Float32Array(pos.count * 2);
    for (var i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      uvs[i * 2] = (v.x - box.min.x) / w;
      uvs[i * 2 + 1] = (v.y - box.min.y) / h;
    }
    o.geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    o.material = mat;
    o.renderOrder = 2;
    count++;
  });
  if (count) this.screenMats = [mat];
};

/* ---------------------------------------------------------- 时间轴 */

Assembly.prototype._applySequence = function (t, force) {
  var names = ['body', 'optics', 'grip', 'printer'];
  var self = this;
  for (var i = 0; i < names.length; i++) {
    var name = names[i];
    var part = this.parts[name];
    if (!part) continue;
    var cfg = INTRO[name];
    var p = force ? 0 : clamp((t - cfg.start) / cfg.dur, 0, 1);
    var ep, er;
    if (name === 'printer') {
      /* 磁吸：先加速靠近，最后 12% 做一点回弹 */
      ep = force ? 0 : (0.85 * easeOutCubic(p) + 0.15 * easeOutBack(clamp(p / 0.96, 0, 1)));
      er = force ? 0 : easeOutQuint(p);
    } else {
      ep = force ? 0 : easeOutBack(clamp(p / 0.88, 0, 1));
      er = force ? 0 : easeOutQuint(p);
    }
    var off = [cfg.from[0] * (1 - ep), cfg.from[1] * (1 - ep), cfg.from[2] * (1 - ep)];
    var spin = [cfg.spin[0] * (1 - er), cfg.spin[1] * (1 - er), cfg.spin[2] * (1 - er)];

    /* 打印机在自己那一拍之前完全隐藏，避免“一开始就在画面里” */
    if (name === 'printer' && !force && t < cfg.start) part.anim.visible = false;
    else part.anim.visible = true;

    /* 光学模块、摄影手柄：机身放平的同时“脱开并缩走”，避免透明淡出时的排序脏边 */
    var shrink = 1;
    if (!force && name !== 'body' && name !== 'printer') {
      var q = clamp((t - SEQ.out - (name === 'grip' ? 0.10 : 0)) / SEQ.outDur, 0, 1);
      if (q > 0) {
        var eo = easeInCubic(q);
        off[0] += cfg.from[0] * 0.30 * eo;
        off[1] += cfg.from[1] * 0.30 * eo;
        off[2] += cfg.from[2] * 0.10 * eo;
        spin[0] = -cfg.spin[0] * 0.5 * eo;
        spin[1] = -cfg.spin[1] * 0.5 * eo;
        spin[2] = -cfg.spin[2] * 0.5 * eo;
        shrink = Math.max(0.0001, 1 - easeInCubic(clamp((q - 0.05) / 0.8, 0, 1)));
        if (shrink < 0.02) part.anim.visible = false;
      }
    }
    part.anim.scale.setScalar(shrink);

    part.anim.position.set(off[0], off[1], off[2]);
    part.anim.rotation.set(spin[0], spin[1], spin[2]);
  }

  /* 机身放平：屏幕朝下 */
  var f = force ? 0 : smoothstep((t - SEQ.flatFrom) / SEQ.flatDur);
  this.flat = f;
  this.flatG.rotation.x = -Math.PI / 2 * f;

  /* 打印机贴好后，从 deco 一侧的缝里把照片推出来 */
  if (this.photoG) {
    var pp = force ? 0 : clamp((t - SEQ.photo) / SEQ.photoDur, 0, 1);
    var pe = pp <= 0 ? 0 : easeOutBack(clamp(pp / 0.9, 0, 1));
    this.photoG.position.y = lerp(PHOTO.fromY, PHOTO.toY, pe);
    this.photoG.visible = !force && pp > 0.001;
    /* 视点保持在成品中心：整组模型居中，不再偏向相片 */
    this._aimK = 0;
  }
};

Assembly.prototype._setFade = function (part, v) {
  if (!part || !part.mats) return;
  var fading = v < 0.999;
  if (part.fading !== fading) {
    part.fading = fading;
    for (var i = 0; i < part.mats.length; i++) {
      var m = part.mats[i];
      if (!m) continue;
      if (fading) {
        if (m.__wasTransparent === undefined) m.__wasTransparent = !!m.transparent;
        m.transparent = true;
      } else {
        m.transparent = m.__wasTransparent !== undefined ? m.__wasTransparent : m.transparent;
      }
      m.needsUpdate = true;
    }
  }
  for (var j = 0; j < part.mats.length; j++) {
    if (part.mats[j]) part.mats[j].opacity = v;
  }
  part.anim.visible = v > 0.02;
};

Assembly.prototype._checkEvents = function (t) {
  var names = ['body', 'optics', 'grip'];
  for (var i = 0; i < names.length; i++) {
    var n = names[i];
    if (this.locks[n]) continue;
    var cfg = INTRO[n];
    if (t >= cfg.start + cfg.dur * 0.92) {
      this.locks[n] = true;
      this._emit('lock', n);
    }
  }
  if (!this._cleared && t >= SEQ.out) {
    this._cleared = true;
    this._emit('clear');
  }
  if (!this.locks.printer && t >= INTRO.printer.start + INTRO.printer.dur * 0.9) {
    this.locks.printer = true;
    this._emit('lock', 'printer');
  }
};

Assembly.prototype._emit = function (type, name) {
  if (this.onEvent) this.onEvent(type, name);
};

Assembly.prototype._lockAll = function () {
  var names = ['body', 'optics', 'grip', 'printer'];
  for (var i = 0; i < names.length; i++) {
    if (this.locks[names[i]]) continue;
    this.locks[names[i]] = true;
    this._emit('lock', names[i]);
  }
  this._cleared = true;
};

Assembly.prototype.playIntro = function () {
  if (!this.ready) return;
  this._reset();
  if (this.reduceMotion) {
    this.seq.active = false;
    this.seq.done = true;
    this._applySequence(SEQ.end, false);
    this._lockAll();
    this.render();
    return;
  }
  this.seq.active = true;
  this.seq.done = false;
  this.seq.t = 0;
  this.start();
};

Assembly.prototype.replay = function () {
  if (!this.ready) return;
  this._reset();
  this.pose.az = LOOK.az * DEG;
  this.pose.el = LOOK.el * DEG;
  this.pose.azTarget = this.pose.az;
  this.pose.elTarget = this.pose.el;
  this.seq.active = true;
  this.seq.done = false;
  this.seq.t = 0;
  this.seq.t0 = global.performance ? performance.now() : Date.now();
  this.dirty = true;
  this.start();
};

Assembly.prototype._reset = function () {
  this.locks = { body: false, optics: false, grip: false, printer: false };
  this._cleared = false;
  this.flat = 0;
  this._applySequence(0, true);
};

Assembly.prototype.render = function () {
  if (!this.renderer || !this.ready) return;
  this._placeCamera();
  this.renderer.render(this.scene, this.camera);
};

Assembly.prototype.step = function (now) {
  var dt = this._last ? Math.min(0.05, (now - this._last) / 1000) : 0.016;
  this._last = now;
  var busy = false;

  if (this.seq.active) {
    /* 按帧累加（单帧最多 0.12s）：正常帧率下等于真实时间，
     * 偶发卡顿也不会一下把整段动画跳过去 */
    this.seq.t += Math.min(0.12, dt);
    var t = this.seq.t;
    this._applySequence(t, false);
    this._checkEvents(t);
    if (t >= SEQ.end) {
      this.seq.active = false;
      this.seq.done = true;
      this._applySequence(SEQ.end, false);
      this._lockAll();
    }
    busy = true;
  }

  /* 演示结束后画面完全静止：不再做静置巡游，避免成品位置缓慢漂移 */
  if (busy) this.render();
};

Assembly.prototype.start = function () {
  if (this.running) return;
  var self = this;
  this.running = true;
  this._last = 0;
  function tick(now) {
    if (!self.running) return;
    self._raf = global.requestAnimationFrame(tick);
    /* 演示进行中即使暂时滚出视口也继续推进，避免停在半截 */
    if (!self.visible && !self.seq.active) return;
    self.step(now);
  }
  this._raf = global.requestAnimationFrame(tick);
};

Assembly.prototype.stop = function () {
  this.running = false;
  if (this._raf) global.cancelAnimationFrame(this._raf);
  this._raf = 0;
};

Assembly.prototype.dispose = function () {
  this.stop();
  if (this._ro) this._ro.disconnect();
  if (this.renderer) this.renderer.dispose();
};

global.S7Assembly = Assembly;
/* 供调试/射线探针复用 */
global.PrintDracoLoader = DracoLoader;

})(window);


/* ------------------------------------------------------------------
尾声的“机身余像”：Legend_v2.glb 实时渲染，整体压暗到隐约可见，
LaserLink 传输环上有一小段沿环缓慢游走的微光。
- 依赖与首屏一致：assets/vendor/legend-3d-bundle.js（THREE + GLTFLoader）
- 模型走 assets/Legend_v2.glb.b64.js（file:// 直接双击也能加载）
- Draco：assets/vendor/draco/draco_decoder.js，主线程 asm.js 解码（无需 Worker）
- 懒加载：尾声进入视口前 1200px 才开始下载 4MB 模型；只在这一段可见时渲染
- 失败降级：无 WebGL / 依赖缺失时不留空白，直接把这一段收短
------------------------------------------------------------------ */
(function () {
'use strict';
var cinema = document.getElementById('ending-cinema');
if (!cinema) return;
/* 画框在粘性层里、位于结束语之前，所以从文档里取 */
var box = document.querySelector('[data-ending3d]');
var mount = box && box.querySelector('[data-ending3d-mount]');
if (!box || !mount) return;

var CFG = {
  fitW: .9,              /* 机身宽度占画框宽度的比例 */
  fitWSm: .97,           /* 手机端画框更窄，机身几乎占满，底部才落进渐隐区 */
  topPad: .045,          /* 顶边留白（画框高度比例），往下溢出裁切 */
  exposure: .92,
  envInt: .62,
  darken: .48,           /* 基础色整体压暗，让机身退到“隐约”那一档 */
  rough: .08,
  key: .65, fill: .4, rim: 2.6, rim2: 1.4, hemi: .8,
  ringAmp: .8,           /* 微光强度 */
  ringBase: .10,         /* 整环的极弱底光 */
  spread: .95,           /* 角向扩散（弧度） */
  hot: .32,              /* 亮核 */
  bandW: .07,            /* 环带宽度（半径比例） */
  ringSpeed: .018,       /* 每秒绕环圈数：约 55 秒一圈 */
  dprMax: 1.75
};

var reduce = false;
try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

var DEPS = {
  bundle: 'assets/vendor/legend-3d-bundle.js',
  draco: 'assets/vendor/draco/draco_decoder.js',
  model: 'assets/Legend_v2.glb.b64.js'
};

var depsPromise = null, started = false, failed = false;
var visible = false, rafId = 0, scene3d = null;

function loadScript(src) {
  return new Promise(function (resolve, reject) {
    var s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = function () { resolve(); };
    s.onerror = function () { reject(new Error('failed: ' + src)); };
    document.head.appendChild(s);
  });
}

function ensureDeps() {
  if (depsPromise) return depsPromise;
  var jobs = [];
  if (!window.Legend3D) jobs.push(loadScript(DEPS.bundle));
  if (typeof window.DracoDecoderModule !== 'function') jobs.push(loadScript(DEPS.draco));
  if (!window.LEGEND_V2_GLB_B64) jobs.push(loadScript(DEPS.model));
  depsPromise = Promise.all(jobs);
  return depsPromise;
}

function fail(err) {
  if (failed) return;
  failed = true;
  if (cinema.classList) cinema.classList.add('is-failed');
  if (window.console && console.warn) console.warn('[尾声 3D] 不可用，收短这一段', err);
}

/* ---------------- Draco：主线程 asm.js 解码（与打印模块同一套做法） ---------------- */
var dracoPromise = null;
function dracoReady() {
  if (dracoPromise) return dracoPromise;
  dracoPromise = new Promise(function (res, rej) {
    if (typeof window.DracoDecoderModule !== 'function') { rej(new Error('Draco decoder missing')); return; }
    try { window.DracoDecoderModule({ onModuleLoaded: res }); } catch (e) { rej(e); }
  });
  return dracoPromise;
}
function dracoDataType(d, T) {
  switch (T) {
  case Float32Array: return d.DT_FLOAT32;
  case Int8Array: return d.DT_INT8;
  case Int16Array: return d.DT_INT16;
  case Int32Array: return d.DT_INT32;
  case Uint8Array: return d.DT_UINT8;
  case Uint16Array: return d.DT_UINT16;
  case Uint32Array: return d.DT_UINT32;
  }
  return d.DT_FLOAT32;
}
var DracoLoader = {
  preload: function () { dracoReady(); },
  decodeDracoFile: function (buffer, callback, attributeIDs, attributeTypes, vertexColorSpace, onError) {
    dracoReady().then(function (draco) {
      var decoder = new draco.Decoder();
      try {
        var input = new Int8Array(buffer);
        var type = decoder.GetEncodedGeometryType(input);
        var geo = type === draco.TRIANGULAR_MESH ? new draco.Mesh() : new draco.PointCloud();
        var status = type === draco.TRIANGULAR_MESH
          ? decoder.DecodeArrayToMesh(input, input.length, geo)
          : decoder.DecodeArrayToPointCloud(input, input.length, geo);
        if (!status.ok()) throw new Error('Draco decode failed: ' + status.error_msg());

        var THREE = window.Legend3D.THREE;
        var geometry = new THREE.BufferGeometry();
        for (var name in attributeIDs) {
          var attr = decoder.GetAttributeByUniqueId(geo, attributeIDs[name]);
          if (!attr || attr.ptr === 0) continue;
          var comps = attr.num_components();
          var count = geo.num_points();
          var total = comps * count;
          var Arr = window[attributeTypes[name]] || Float32Array;
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

function b64ToArrayBuffer(b64) {
  var bin = window.atob(b64), len = bin.length, buf = new Uint8Array(len);
  for (var i = 0; i < len; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

/* ---------------- 环微光：贴着 LaserLink 环的一条加色光弧 ---------------- */
var GLOW_VS = [
  'varying vec3 vPos;',
  'void main() {',
  '  vPos = position;',
  '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
  '}'
].join('\n');

var GLOW_FS = [
  'varying vec3 vPos;',
  'uniform float uAngle;',
  'uniform float uAmt;',
  'uniform float uBase;',
  'uniform float uSpread;',
  'uniform float uHot;',
  'uniform float uRTarget;',
  'uniform float uBandW;',
  'void main() {',
  '  float r = length(vPos.xy);',
  '  float a = atan(vPos.y, vPos.x);',
  '  float d = mod(a - uAngle + 3.14159265, 6.2831853) - 3.14159265;',
  '  float lobe = exp(-pow(abs(d) / uSpread, 2.0));',
  '  float hot = exp(-pow(abs(d) / (uSpread * 0.34), 2.0));',
  '  float dr = (r - uRTarget) / uBandW;',
  '  float band = exp(-dr * dr);',
  '  float line = exp(-pow(dr / 0.36, 2.0));',
  '  float k = band * (uBase + uAmt * (lobe * 0.85 + uHot * hot * line * 1.6));',
  '  vec3 col = mix(vec3(0.46, 0.62, 1.0), vec3(1.0, 0.99, 0.96), clamp(hot * line * 1.3 + lobe * 0.35, 0.0, 1.0));',
  '  gl_FragColor = vec4(col, 1.0) * k;',
  '}'
].join('\n');

function makeRingGlow(THREE, R, center) {
  var geo = new THREE.RingGeometry(0.0001, R * 1.30, 240, 12);
  var uni = {
    uAngle: { value: 2.2 },
    uAmt: { value: CFG.ringAmp },
    uBase: { value: CFG.ringBase },
    uSpread: { value: CFG.spread },
    uHot: { value: CFG.hot },
    uRTarget: { value: R * 0.985 },
    uBandW: { value: R * CFG.bandW }
  };
  var mat = new THREE.ShaderMaterial({
    uniforms: uni, vertexShader: GLOW_VS, fragmentShader: GLOW_FS,
    transparent: true, depthTest: false, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false
  });
  var mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(center);
  mesh.renderOrder = 12;
  mesh.frustumCulled = false;
  return { mesh: mesh, uni: uni };
}

function makeSoftSprite(THREE) {
  var c = document.createElement('canvas');
  c.width = c.height = 128;
  var g = c.getContext('2d');
  var gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,.95)');
  gr.addColorStop(.22, 'rgba(200,222,255,.5)');
  gr.addColorStop(.55, 'rgba(130,170,255,.14)');
  gr.addColorStop(1, 'rgba(90,130,220,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  var tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, opacity: .12,
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false
  }));
}

/* ---------------- 场景 ---------------- */
function build() {
  var THREE = window.Legend3D.THREE;
  var L3 = window.Legend3D;

  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (e) { fail(e); return; }

  var W = box.clientWidth || 640, H = box.clientHeight || 520;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, CFG.dprMax));
  renderer.setSize(W, H, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = CFG.exposure;
  renderer.setClearColor(0x000000, 0);
  mount.appendChild(renderer.domElement);

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(26, W / H, .1, 60);
  camera.position.set(0, .06, 3.4);
  camera.lookAt(0, .01, 0);

  var pmrem = new THREE.PMREMGenerator(renderer);
  var envScene = new L3.RoomEnvironment();
  scene.environment = pmrem.fromScene(envScene, .03).texture;
  pmrem.dispose();
  if (envScene.dispose) envScene.dispose();

  var key = new THREE.DirectionalLight(0xfff0dc, CFG.key); key.position.set(2.8, 4.8, 3.0);
  var fill = new THREE.DirectionalLight(0xd0e0ff, CFG.fill); fill.position.set(-3.8, .4, -1.2);
  var rim = new THREE.DirectionalLight(0xffffff, CFG.rim); rim.position.set(-1.6, 3.0, -4.6);
  var rim2 = new THREE.DirectionalLight(0xa8c4ff, CFG.rim2); rim2.position.set(3.0, -1.8, -3.4);
  var top = new THREE.DirectionalLight(0xf8fbff, .18); top.position.set(.2, 6, .4);
  scene.add(key, fill, rim, rim2, top);
  scene.add(new THREE.HemisphereLight(0xb8c8ff, 0x1a2030, CFG.hemi));

  var world = new THREE.Group();
  scene.add(world);

  var ringGlowUni = null, halo = null, ringMesh = null;

  var loader = new L3.GLTFLoader();
  loader.setDRACOLoader(DracoLoader);

  var modelData;
  try { modelData = b64ToArrayBuffer(window.LEGEND_V2_GLB_B64); }
  catch (e) { fail(e); return; }

  loader.parse(modelData, '', function (gltf) {
    var model = gltf.scene || (gltf.scenes && gltf.scenes[0]);
    if (!model) { fail(new Error('GLTF has no scene')); return; }

    /* 按画框宽度定尺寸：机身约占九成宽，顶边留一点空气，底部自然裁掉 */
    var fitV = new THREE.Vector3();
    function fitModel() {
      model.scale.setScalar(1);
      model.position.set(0, 0, 0);
      model.updateMatrixWorld(true);
      var bb = new THREE.Box3().setFromObject(model);
      var c0 = bb.getCenter(new THREE.Vector3());
      var s0 = bb.getSize(fitV);
      var visH = 2 * camera.position.z * Math.tan(camera.fov * Math.PI / 360);
      var visW = visH * camera.aspect;
      var fitW = window.innerWidth <= 768 ? CFG.fitWSm : CFG.fitW;
      var k = s0.x > 0 ? (visW * fitW) / s0.x : 1;
      model.scale.setScalar(k);
      /* 顶边锚在画框上方 topPad 处，往下溢出 */
      var topY = visH * 0.5 - visH * CFG.topPad;
      model.position.set(-c0.x * k, topY - s0.y * k * 0.5 - c0.y * k, -c0.z * k);
      model.updateMatrixWorld(true);
    }
    fitModel();

    /* 整体压暗：低环境反射 + 略粗糙 + 深色，只留轮廓与金属高光 */
    model.traverse(function (o) {
      if (!o.isMesh) return;
      var mats = Array.isArray(o.material) ? o.material : [o.material];
      for (var i = 0; i < mats.length; i++) {
        var m = mats[i];
        if (!m) continue;
        if (m.envMapIntensity !== undefined) m.envMapIntensity = CFG.envInt;
        if (m.roughness !== undefined) m.roughness = Math.min(1, m.roughness + CFG.rough);
        if (m.color) m.color.multiplyScalar(CFG.darken);
        m.needsUpdate = true;
      }
    });

    world.add(model);

    /* 找 LaserLink 环：名字匹配 + 投影面积最大（另有一个同名的顶针小件） */
    var best = 0;
    model.traverse(function (o) {
      if (!o.isMesh || !o.geometry) return;
      var nm = (o.name || '') + '|' + ((o.parent && o.parent.name) || '');
      if (!/laserlink/i.test(nm)) return;
      var b = new THREE.Box3().setFromObject(o);
      var s = b.getSize(new THREE.Vector3());
      var area = s.x * s.y;
      if (area > best) { best = area; ringMesh = o; }
    });

    if (ringMesh && ringMesh.geometry) {
      ringMesh.geometry.computeBoundingBox();
      var gb = ringMesh.geometry.boundingBox;
      var gc = gb.getCenter(new THREE.Vector3());
      var gs = gb.getSize(new THREE.Vector3());
      var R = Math.max(gs.x, gs.y) * .5;
      if (R > 0) {
        var glow = makeRingGlow(THREE, R, gc);
        ringMesh.add(glow.mesh);
        ringGlowUni = glow.uni;

        var sc = new THREE.Vector3().setFromMatrixScale(ringMesh.matrixWorld);
        var rw = R * Math.max(sc.x, sc.y);
        halo = makeSoftSprite(THREE);
        halo.scale.setScalar(rw * 2.8);
        halo.position.copy(ringMesh.localToWorld(gc.clone()));
        scene.add(halo);
      }
    }

    world.rotation.set(0, 0, 0);
    box.classList.add('is-live');

    var t0 = performance.now();

    function frame(now) {
      rafId = 0;
      if (!visible) return;
      var t = (now - t0) / 1000;
      /* 正视不转，只留一点几乎察觉不到的上下浮动 */
      if (!reduce) world.position.y = Math.sin(t * .5) * .006;
      if (ringGlowUni) {
        ringGlowUni.uAngle.value = t * CFG.ringSpeed * Math.PI * 2 + 2.2;
        ringGlowUni.uAmt.value = CFG.ringAmp * (0.84 + Math.sin(t * 1.1) * 0.16);
        ringGlowUni.uBase.value = CFG.ringBase * (0.85 + Math.sin(t * .7 + 2) * 0.15);
        if (halo && !reduce) halo.material.opacity = .1 + .04 * (0.5 + 0.5 * Math.sin(t * 1.1));
      }
      renderer.render(scene, camera);
      if (!reduce && visible) rafId = requestAnimationFrame(frame);
    }

    scene3d = {
      render: function () { renderer.render(scene, camera); },
      start: function () {
        if (reduce) { renderer.render(scene, camera); return; }
        if (!rafId) rafId = requestAnimationFrame(frame);
      },
      stop: function () { if (rafId) { cancelAnimationFrame(rafId); rafId = 0; } },
      resize: function () {
        var w = box.clientWidth || W, h = box.clientHeight || H;
        if (!w || !h) return;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        fitModel();
        if (visible) renderer.render(scene, camera);
      }
    };

    if (visible) scene3d.start();
  }, function (err) { fail(err); });

  window.addEventListener('resize', function () { if (scene3d) scene3d.resize(); }, { passive: true });
  window.addEventListener('orientationchange', function () { if (scene3d) scene3d.resize(); }, { passive: true });
}

function start() {
  if (started || failed) return;
  started = true;
  ensureDeps().then(function () {
    if (!window.Legend3D || !window.LEGEND_V2_GLB_B64) throw new Error('3D deps missing');
    build();
  })['catch'](fail);
}

/* 何时开工：这一段离视口还有 1600px 时开始下载 4MB 模型（留出解码时间） */
if (window.IntersectionObserver) {
  var preloader = new IntersectionObserver(function (entries) {
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].isIntersecting) {
        preloader.disconnect();
        start();
      }
    }
  }, { rootMargin: '1200px 0px' });
  /* 观察机身画框本身（它现在贴在结束语下方，比长尾更早进入视口） */
  preloader.observe(box);

  var watcher = new IntersectionObserver(function (entries) {
    visible = entries[0].isIntersecting;
    if (scene3d) { if (visible) scene3d.start(); else scene3d.stop(); }
  }, { threshold: 0.01 });
  watcher.observe(box);
} else {
  start();
}

document.addEventListener('visibilitychange', function () {
  if (!scene3d) return;
  if (document.hidden) scene3d.stop();
  else if (visible) scene3d.start();
});
})();

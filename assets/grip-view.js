/* ==========================================================================
   Xiaomi Legend · 摄影手柄实时 3D
   - 依赖 assets/vendor/legend-3d-bundle.js（THREE + GLTFLoader）与
     assets/grip.glb.b64.js（window.GRIP_GLB_B64，Draco 已解压，file:// 直接可读）
   - 只暴露两个接口：LegendGripView.create(mount) / stage.setProgress(p)
     p = 0：模型停在摄影手柄那一屏的展示框里，皮革面朝外（与静态图一致）
     p = 1：模型被挪到下一屏（开放音频生态）的右侧，并绕 Y 轴转过 180°，露出正面
   - 位移由页面负责（跟着滚动一起往下挪），这里只管旋转；渲染按需触发，静止时不占帧
   ========================================================================== */
(function (global) {
  'use strict';

  var LOOK = {
    height: 1.0,        /* 模型统一高度（世界单位）——舞台是展示框的 1.32 倍，这里约合框高的 75% */
    fov: 30,
    camZ: 3.05,
    camX: 0.46,
    lift: 0.03,          /* 画面上抬一点，让机身视觉重心居中 */          /* 相机略微偏轴，静止时就是产品图的 3/4 视角 */
    exposure: 1.0,
    key: 1.72,
    rim: 1.72,
    fill: 0.55,
    hemi: 0.34,
    env: 0.72,
    normalScale: 0.82,
    leatherRough: 0.62
  };

  function easeInOut(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function b64ToArrayBuffer(str) {
    var bin = atob(str);
    var len = bin.length;
    var bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }

  function create(mount, opts) {
    opts = opts || {};
    var L3 = global.Legend3D;
    var b64 = global.GRIP_GLB_B64;
    if (!mount || !L3 || !b64) return null;

    var THREE = L3.THREE;
    var state = {
      renderer: null, scene: null, camera: null, pivot: null, model: null,
      width: 0, height: 0, running: false, lastT: 0, ready: false,
      progress: 0, target: 0, yaw: 0, lift: 0, scale: 1, dragging: false,
      manual: 0, dragId: null, dragX: 0, dragT: 0, dragV: 0, inertia: 0
    };

    var root = mount.parentNode && mount.parentNode.classList &&
      mount.parentNode.classList.contains('s8-grip3d') ? mount.parentNode : mount;

    function requestRender() {
      if (state.running || !state.renderer) return;
      state.running = true;
      state.lastT = performance.now();
      global.requestAnimationFrame(tick);    }

    function renderNow() {
      if (state.renderer && state.scene && state.camera) {
        state.renderer.render(state.scene, state.camera);
      }
    }

    function applyTransform(p) {
      if (!state.pivot) return;
      var e = easeInOut(Math.max(0, Math.min(1, p)));
      var yaw = Math.PI * e + state.manual;
      state.pivot.rotation.set(-0.05 * Math.sin(e * Math.PI), yaw, 0.012 * (1 - e) - 0.02 * e);
      state.pivot.position.y = LOOK.lift + 0.02 * Math.sin(e * Math.PI);   /* 翻到中途略微抬起，像被拎起来翻面 */
    }

    /* ---------- 光照 ---------- */
    function addLights() {
      var scene = state.scene;
      scene.add(new THREE.HemisphereLight(0xeef3ff, 0x232833, LOOK.hemi));

      var key = new THREE.DirectionalLight(0xfff3e6, LOOK.key);
      key.position.set(2.4, 3.4, 2.6);
      var rim = new THREE.DirectionalLight(0xcfe0ff, LOOK.rim);
      rim.position.set(-2.6, 1.5, -3.0);
      var rim2 = new THREE.DirectionalLight(0x9fb6ff, 1.05);
      rim2.position.set(2.2, -1.6, -2.4);
      var fill = new THREE.DirectionalLight(0xd7e4ff, LOOK.fill);
      fill.position.set(-3.2, 0.2, 1.8);
      var top = new THREE.DirectionalLight(0xffffff, 0.55);
      top.position.set(0.3, 5.0, 0.6);
      scene.add(key, rim, rim2, fill, top);
    }

    function setup() {
      state.width = root.clientWidth || 1;
      state.height = root.clientHeight || 1;

      var renderer;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
      } catch (err) {
        return false;
      }
      state.renderer = renderer;
      renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
      renderer.setSize(state.width, state.height, false);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = LOOK.exposure;
      renderer.setClearColor(0x000000, 0);
      mount.appendChild(renderer.domElement);

      state.scene = new THREE.Scene();
      var pmrem = new THREE.PMREMGenerator(renderer);
      state.scene.environment = pmrem.fromScene(new L3.RoomEnvironment(), 0.04).texture;
      pmrem.dispose();

      state.camera = new THREE.PerspectiveCamera(LOOK.fov, state.width / state.height, 0.1, 100);
      state.camera.position.set(LOOK.camX, 0.02, LOOK.camZ);
      state.camera.lookAt(0, 0, 0);

      addLights();

      if (global.ResizeObserver) new ResizeObserver(onResize).observe(root);
      global.addEventListener('resize', onResize);

      renderer.domElement.addEventListener('webglcontextlost', function (e) {
        e.preventDefault();
        root.classList.remove('is-live');
      }, false);
      renderer.domElement.addEventListener('webglcontextrestored', function () {
        root.classList.add('is-live');
        requestRender();
      }, false);

      return true;
    }

    /* ---------- 尺寸 ---------- */
    function onResize() {
      if (!state.renderer) return;
      var w = root.clientWidth;
      var h = root.clientHeight;
      if (!w || !h || (w === state.width && h === state.height)) return;
      state.width = w;
      state.height = h;
      state.renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
      state.renderer.setSize(w, h, false);
      state.camera.aspect = w / h;
      state.camera.updateProjectionMatrix();
      requestRender();
    }

    /* ---------- 材质微调 ---------- */
    function tune(model) {
      var maxAniso = state.renderer.capabilities.getMaxAnisotropy();
      model.traverse(function (o) {
        if (!o.isMesh) return;
        var mats = Array.isArray(o.material) ? o.material : [o.material];
        for (var i = 0; i < mats.length; i++) {
          var m = mats[i];
          if (!m) continue;
          var isLeather = /LEATHER/.test(m.name || '');
          m.envMapIntensity = LOOK.env;
          if (isLeather) {
            m.roughness = LOOK.leatherRough;
            m.metalness = 0;
            if (m.normalScale) m.normalScale.setScalar(LOOK.normalScale);
          } else if ((m.metalness || 0) > 0.6) {
            m.envMapIntensity = LOOK.env * 1.15;
          }
          if (m.map) { m.map.anisotropy = maxAniso; m.map.needsUpdate = true; }
          if (m.normalMap) { m.normalMap.anisotropy = maxAniso; m.normalMap.needsUpdate = true; }
          m.needsUpdate = true;
        }
      });
    }

    /* ------------------------------------------------------------------
       皮革包边：整张贴图只采样一次
       模型原本把每个小块（前脸 / 倒角 / 侧壁）各自铺满 0..1，
       倒角这类窄条就被压缩成极细的砂粒感，接缝还会露一条硬边。
       这里把前脸 + 两侧倒角 + 侧壁当作一条连续的包边：
         u = 沿横截面轮廓的弧长
         v = 竖直方向
       两者共用一个比例尺（不拉伸），长的一边铺满贴图、短的一边居中留白，
       接缝挪到背面敞开处，正面看过去就是一张完整的皮。
       ------------------------------------------------------------------ */
    function wrapLeatherUV(model) {
      var invBase = new THREE.Matrix4().copy(model.matrixWorld).invert();
      var mtx = new THREE.Matrix4();
      var vec = new THREE.Vector3();

      var groups = [];
      model.traverse(function (o) {
        if (!o.isMesh) return;
        var mats = Array.isArray(o.material) ? o.material : [o.material];
        for (var i = 0; i < mats.length; i++) {
          if (!mats[i] || !/LEATHER/.test(mats[i].name || '')) continue;
          var attr = o.geometry && o.geometry.attributes;
          if (!attr || !attr.position || !attr.uv) continue;
          var list = [];
          mtx.copy(o.matrixWorld).premultiply(invBase);
          for (var k = 0; k < attr.position.count; k++) {
            vec.fromBufferAttribute(attr.position, k).applyMatrix4(mtx);
            list.push({ x: vec.x, y: vec.y, z: vec.z });
          }
          groups.push({ mesh: o, list: list });
          return;
        }
      });
      if (!groups.length) return;

      /* 横截面轮廓 = 皮革顶点的凸包（内侧凹槽自动被排除） */
      var all = [];
      for (var g = 0; g < groups.length; g++) {
        for (var q = 0; q < groups[g].list.length; q++) all.push(groups[g].list[q]);
      }
      var hull = convexHullXZ(all);
      if (hull.length < 4) return;

      /* 接缝放在背面：皮革背后是敞开的，那条边没有面 */
      var gap = 0, gapScore = Infinity;
      for (var i = 0; i < hull.length; i++) {
        var s = hull[i].z + hull[(i + 1) % hull.length].z;
        if (s < gapScore) { gapScore = s; gap = i; }
      }
      hull = hull.slice(gap + 1).concat(hull.slice(0, gap + 1));

      /* 沿轮廓累计弧长（最后一条是背面缺口，不计入） */
      var cum = [0], arc = 0;
      for (var i = 1; i < hull.length; i++) {
        arc += Math.hypot(hull[i].x - hull[i - 1].x, hull[i].z - hull[i - 1].z);
        cum.push(arc);
      }
      if (!(arc > 0)) return;

      var yMin = Infinity, yMax = -Infinity;
      for (var i = 0; i < all.length; i++) {
        if (all[i].y < yMin) yMin = all[i].y;
        if (all[i].y > yMax) yMax = all[i].y;
      }
      var ySpan = (yMax - yMin) || 1;
      var yMid = (yMin + yMax) / 2;
      var MARGIN = 0.01;
      var scale = (1 - MARGIN * 2) / Math.max(arc, ySpan);   /* 统一比例尺，不拉伸 */

      function arcAt(x, z) {
        var best = 0, bestD = Infinity;
        for (var i = 0; i < hull.length - 1; i++) {
          var a = hull[i], b = hull[i + 1];
          var dx = b.x - a.x, dz = b.z - a.z;
          var len2 = dx * dx + dz * dz || 1e-12;
          var t = ((x - a.x) * dx + (z - a.z) * dz) / len2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          var px = a.x + dx * t, pz = a.z + dz * t;
          var d = (px - x) * (px - x) + (pz - z) * (pz - z);
          if (d < bestD) { bestD = d; best = cum[i] + Math.sqrt(len2) * t; }
        }
        return best;
      }

      for (var g = 0; g < groups.length; g++) {
        var mesh = groups[g].mesh;
        var uv = mesh.geometry.attributes.uv;
        var list = groups[g].list;
        for (var k = 0; k < list.length; k++) {
          var p = list[k];
          uv.setXY(k, 0.5 + (arcAt(p.x, p.z) - arc / 2) * scale, 0.5 + (p.y - yMid) * scale);
        }
        uv.needsUpdate = true;
        mesh.geometry.computeBoundingSphere();
      }
    }

    function convexHullXZ(points) {
      var pts = points.map(function (p) { return { x: p.x, z: p.z }; });
      pts.sort(function (a, b) { return a.x - b.x || a.z - b.z; });
      var uniq = [];
      for (var i = 0; i < pts.length; i++) {
        var p = pts[i], prev = uniq[uniq.length - 1];
        if (!prev || Math.abs(prev.x - p.x) > 1e-6 || Math.abs(prev.z - p.z) > 1e-6) uniq.push(p);
      }
      function cross(o, a, b) { return (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x); }
      var lower = [];
      for (var i = 0; i < uniq.length; i++) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], uniq[i]) <= 0) lower.pop();
        lower.push(uniq[i]);
      }
      var upper = [];
      for (var i = uniq.length - 1; i >= 0; i--) {
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], uniq[i]) <= 0) upper.pop();
        upper.push(uniq[i]);
      }
      lower.pop(); upper.pop();
      return lower.concat(upper);
    }

    function build(gltf) {
      var model = gltf.scene || (gltf.scenes && gltf.scenes[0]);
      if (!model) return;

      var bbox = new THREE.Box3().setFromObject(model);
      var size = bbox.getSize(new THREE.Vector3());
      var center = bbox.getCenter(new THREE.Vector3());
      model.position.sub(center);
      var maxDim = Math.max(size.x, size.y, size.z) || 1;
      model.scale.setScalar(LOOK.height / maxDim);
      bbox.setFromObject(model);
      bbox.getCenter(center);
      model.position.sub(center);

      model.updateWorldMatrix(true, true);
      wrapLeatherUV(model);
      tune(model);

      state.model = model;
      state.pivot = new THREE.Group();
      state.pivot.add(model);
      state.scene.add(state.pivot);

      state.ready = true;
      applyTransform(state.progress);
      onResize();
      renderNow();
      global.requestAnimationFrame(function () {
        root.classList.add('is-live');
        if (typeof opts.onLive === 'function') {
          try { opts.onLive(); } catch (e) {}
        }
      });
    }

    /* ---------- 逐帧：把 progress 平滑到目标值 ---------- */
    function tick(now) {
      var dt = Math.min(0.05, Math.max(0.001, (now - state.lastT) / 1000));
      state.lastT = now;
      var busy = false;

      if (state.ready) {
        var d = state.target - state.progress;
        if (Math.abs(d) > 0.0005) {
          state.progress += d * Math.min(1, dt * 12);
          if (Math.abs(state.target - state.progress) < 0.0005) state.progress = state.target;
          busy = true;
        }
        if (Math.abs(state.inertia) > 0.0008) {
          state.manual += state.inertia * dt;
          state.inertia *= Math.exp(-dt * 3.6);
          busy = true;
        }
        if (state.manual > Math.PI) state.manual -= Math.PI * 2;
        if (state.manual < -Math.PI) state.manual += Math.PI * 2;
        applyTransform(state.progress);
      }

      renderNow();
      if (busy) global.requestAnimationFrame(tick);
      else state.running = false;
    }

    /* ---------- 拖拽（翻到正面后可手动再转） ---------- */
    var SPEED = 0.0072;
    function onDown(e) {
      if (state.progress < 0.92) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      state.dragging = true;
      state.dragId = e.pointerId;
      state.dragX = e.clientX;
      state.dragT = performance.now();
      state.inertia = 0;
      try { root.setPointerCapture(e.pointerId); } catch (err) {}
      root.classList.add('is-dragging');
    }
    function onMove(e) {
      if (!state.dragging || e.pointerId !== state.dragId) return;
      var dx = e.clientX - state.dragX;
      if (!dx) return;
      state.dragX = e.clientX;
      state.manual += dx * SPEED;
      var now = performance.now();
      var dt = Math.max(8, now - state.dragT);
      state.dragV = state.dragV * 0.6 + (dx / dt * 1000 * SPEED) * 0.4;
      state.dragT = now;
      requestRender();
      if (e.cancelable) e.preventDefault();
    }
    function onUp(e) {
      if (!state.dragging) return;
      if (e && e.pointerId !== undefined && e.pointerId !== state.dragId) return;
      state.dragging = false;
      root.classList.remove('is-dragging');
      try { root.releasePointerCapture(state.dragId); } catch (err) {}
      if (!state.reduce && performance.now() - state.dragT < 90) {
        state.inertia = Math.max(-3.2, Math.min(3.2, state.dragV));
      }
      requestRender();
    }
    root.addEventListener('pointerdown', onDown);
    root.addEventListener('pointermove', onMove, { passive: false });
    root.addEventListener('pointerup', onUp);
    root.addEventListener('pointercancel', onUp);
    root.addEventListener('lostpointercapture', onUp);
    root.addEventListener('dragstart', function (e) { e.preventDefault(); });

    /* ---------- 启动 ---------- */
    if (!setup()) return null;

    var loader = new L3.GLTFLoader();
    try {
      loader.parse(b64ToArrayBuffer(b64), '', build, function (err) {
        if (global.console && console.warn) console.warn('[grip3d] 模型解析失败', err);
        root.classList.remove('is-live');
      });
    } catch (err) {
      if (global.console && console.warn) console.warn('[grip3d] 模型解析失败', err);
      return null;
    }

    return {
      setProgress: function (p) {
        state.target = Math.max(0, Math.min(1, p));
        requestRender();
      },
      /* 吸附到最近的一侧（松手后自动补全 0 / 1） */
      snap: function () {
        state.target = state.progress < 0.5 ? 0 : 1;
        requestRender();
      },
      resetManual: function () {
        state.manual = 0;
        requestRender();
      },
      progressNow: function () { return state.progress; },
      debug: function () {
        var maps = [];
        if (state.model) {
          state.model.traverse(function (o) {
            if (!o.isMesh) return;
            var mats = Array.isArray(o.material) ? o.material : [o.material];
            mats.forEach(function (m) {
              if (!m) return;
              maps.push(m.name + '|map:' + (m.map ? (m.map.image ? m.map.image.width + 'x' + m.map.image.height : 'noimg') : 'none') +
                '|nrm:' + (m.normalMap ? (m.normalMap.image ? m.normalMap.image.width + 'x' + m.normalMap.image.height : 'noimg') : 'none'));
            });
          });
        }
        return { progress: state.progress, target: state.target, ready: state.ready, maps: maps.slice(0, 8) };
      }
    };
  }

  global.LegendGripView = { create: create, LOOK: LOOK };
})(window);

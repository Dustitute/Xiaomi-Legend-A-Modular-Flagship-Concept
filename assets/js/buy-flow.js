
/* ==========================================================================
   Xiaomi Legend · 立即购买流程
   - 纯原生 JS，无依赖；四个页面在单文件内切换（hash 直达）
   - 价格 / 配置 / 套装配件来自 PRD 第五部分
   - 改价格、配置、模块：只改下面的 CONFIG
   ========================================================================== */
(function () {
  'use strict';

  /* ============================== 可配置数据（PRD 5.x） ============================== */
  var CONFIG = {
    colors: [
      {
        id: 'fiber', name: '龙鳞纤维版', available: true,
        swatch: 'linear-gradient(145deg,#3a3a44 0%,#15151c 46%,#08080c 100%)',
        note: '龙鳞纤维 · 氧化锆陶瓷 Deco'
      },
      {
        id: 'gray', name: '冷钛灰', available: false, soon: '敬请期待',
        swatch: 'linear-gradient(145deg,#e2e5ea 0%,#a8adb6 52%,#6d727b 100%)',
        note: '磨砂钛合金 · 冷灰玻璃'
      }
    ],

    /* 5.1 手机本体 + 5.3 套装 */
    configs: [
      { id: 'p512', name: '16GB+512GB', type: 'phone', storage: '16GB+512GB', price: 9999, note: '', includes: [] },
      { id: 'p1t', name: '16GB+1TB', type: 'phone', storage: '16GB+1TB', price: 11999, note: '', includes: [] },
      { id: 'family', name: '家庭秒享套装', type: 'bundle', storage: '16GB+1TB', price: 12799, note: '16+1TB 手机 & 智能终端', includes: ['terminal'] },
      { id: 'fashion', name: '时尚翻转套装', type: 'bundle', storage: '16GB+1TB', price: 12999, note: '16+1TB 手机 & 翻转屏 & 麦克风', includes: ['flip', 'mic'] },
      { id: 'creator', name: '创作者套装', type: 'bundle', storage: '16GB+1TB', price: 16999, note: '16+1TB 手机 & 摄影套装 & 翻转屏', includes: ['photokit', 'flip'] },
      { id: 'all', name: '全能套装', type: 'bundle', storage: '24GB+1TB', price: 19999, note: '24GB+1TB 手机 · 全部模块', includes: ['mic', 'cooling', 'battery', 'printer', 'terminal', 'flip', 'photokit'] }
    ],

    /* 5.2 模块售价 */
    modules: [
      { id: 'mic', name: '磁吸麦克风', price: 109, desc: '磁吸佩戴 · LE Audio 直连', img: 'mic' },
      { id: 'cooling', name: '散热模块', price: 199, desc: '半导体制冷 · 降温 6–10°C', img: 'cooling' },
      { id: 'battery', name: '外挂电池', price: 299, desc: '9000mAh · 45W 输出', img: 'battery' },
      { id: 'printer', name: '打印机模块', price: 699, desc: '热升华 · 2×3 英寸', img: 'printer' },
      { id: 'terminal', name: '智能终端模块', price: 999, desc: '桌面工作站 · 智能屏', img: 'terminal' },
      { id: 'flip', name: '翻转屏模块', price: 1499, desc: '0–270° 三形态副屏', img: 'flip' },
      { id: 'photokit', name: '摄影套装', price: 5299, desc: 'M4/3 光学系统 + 摄影手柄', img: 'photokit' }
    ],

    payMethods: [
      { id: 'wechat', name: '微信支付', desc: '使用微信支付' },
      { id: 'alipay', name: '支付宝', desc: '支持花呗分期' },
      { id: 'unionpay', name: '云闪付', desc: '银联卡快捷支付' },
      { id: 'mi', name: '小米分期', desc: '12 期免息 · 月付更低', badge: '免息' }
    ],

  };

  var IMAGES = window.LEGEND_BUY_IMAGES || {};
  var ICONS = window.LEGEND_PAY_ICONS || {};

  /* ============================== 状态 ============================== */
  var state = {
    step: 'select',
    config: 0,
    color: 0,
    qty: 1,
    modules: {},
    preview: 'phone',
    pay: 'wechat',
    order: null,
    address: {
      name: '',
      phone: '',
      province: '北京',
      city: '北京市',
      district: '海淀区',
      detail: ''
    }
  };

  var STEPS = ['select', 'confirm', 'pay', 'success'];
  var LABELS = { select: '选择配置', confirm: '确认订单', pay: '收银台', success: '完成' };
  var VIEWS = [
    { id: 'phone', label: '主机' },
    { id: 'photokit', label: '摄影套装', img: 'photokit' },
    { id: 'flip', label: '翻转屏模块', img: 'flip' },
    { id: 'terminal', label: '智能终端模块', img: 'terminal' },
    { id: 'printer', label: '打印机模块', img: 'printer' },
    { id: 'battery', label: '外挂电池模块', img: 'battery' },
    { id: 'cooling', label: '散热模块', img: 'cooling' },
    { id: 'mic', label: '磁吸麦克风', img: 'mic' }
  ];

  var overlay = document.getElementById('lgBuy');
  if (!overlay) return;

  var $ = function (sel, root) { return (root || overlay).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || overlay).querySelectorAll(sel)); };

  var scrollBox = $('[data-buy-scroll]');
  var toast = $('[data-buy-toastbox]');
  var toastText = $('[data-buy-toasttext]');
  var toastTimer = 0;
  var payBusy = false;
  var lastFocus = null;
  var heroSrc = null;
  var isOpen = false;
  var modal = $('[data-buy-modal]');
  var modalTitle = $('[data-buy-modal-title]');
  var modalBody = $('[data-buy-modal-body]');
  var modalReturnFocus = null;

  /* ============================== 工具 ============================== */
  function money(n) { return Number(n || 0).toLocaleString('en-US'); }
  function cfg() { return CONFIG.configs[state.config]; }
  function color() { return CONFIG.colors[state.color]; }
  function moduleById(id) {
    for (var i = 0; i < CONFIG.modules.length; i++) if (CONFIG.modules[i].id === id) return CONFIG.modules[i];
    return null;
  }
  function maskPhone(p) { return p ? p.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2') : ''; }
  function fullAddress() {
    var a = state.address;
    return [a.province, a.city, a.district, a.detail].filter(Boolean).join(' ').trim();
  }

  function giftIds() {
    var c = cfg();
    var gifts = [];
    if (c.includes.indexOf('cooling') === -1) gifts.push('cooling');
    if (c.type === 'bundle' && c.includes.indexOf('battery') === -1) gifts.push('battery');
    return gifts;
  }

  function selectedModuleIds() {
    return CONFIG.modules.filter(function (m) { return !!state.modules[m.id]; }).map(function (m) { return m.id; });
  }

  function paidModules() {
    var inc = cfg().includes;
    var gifts = giftIds();
    return CONFIG.modules.filter(function (m) {
      return state.modules[m.id] && inc.indexOf(m.id) === -1 && gifts.indexOf(m.id) === -1;
    });
  }

  function totals() {
    var c = cfg();
    var goods = c.price * state.qty;
    var modulesTotal = paidModules().reduce(function (s, m) { return s + m.price; }, 0);
    return {
      goods: goods,
      modules: modulesTotal,
      total: goods + modulesTotal,
      paidCount: paidModules().length,
      selectedCount: selectedModuleIds().length
    };
  }

  function showToast(message) {
    toastText.textContent = message;
    toast.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove('is-on'); }, 2600);
  }

  /* ============================== 产品图 ============================== */
  function resolveHeroImage() {
    var candidates = ['.hero-img--lit', '.hero-img--straight-dark', '.hero-img--flat', '.hero-img'];
    for (var i = 0; i < candidates.length; i++) {
      var img = document.querySelector(candidates[i]);
      var src = img && img.getAttribute('src');
      if (src) return src;
    }
    return null;
  }

  function previewSrc() {
    if (state.preview === 'phone') return heroSrc;
    var mod = moduleById(state.preview);
    return mod ? IMAGES[mod.img] : heroSrc;
  }

  function paintImages() {
    var src = previewSrc();
    var img = $('[data-buy-img]');
    if (img) {
      if (src) {
        if (img.getAttribute('src') !== src) img.src = src;
        img.hidden = false;
      } else {
        img.hidden = true;
      }
    }
    var fallback = $('[data-buy-fallback]');
    if (fallback) fallback.style.display = src ? 'none' : '';

    var itemImg = $('[data-buy-item-img]');
    if (itemImg) {
      if (heroSrc) {
        if (itemImg.getAttribute('src') !== heroSrc) itemImg.src = heroSrc;
        itemImg.hidden = false;
      } else {
        itemImg.hidden = true;
      }
    }

    var name = $('[data-buy-preview-name]');
    var note = $('[data-buy-preview-note]');
    if (state.preview === 'phone') {
      if (name) name.textContent = color().name;
      if (note) note.textContent = color().note;
    } else {
      var mod = moduleById(state.preview);
      if (name) name.textContent = mod ? mod.name : '';
      if (note) note.textContent = mod ? '可选模块 · ¥' + money(mod.price) : '';
    }
    $$('[data-buy-preview]').forEach(function (el) {
      el.classList.toggle('is-on', el.getAttribute('data-buy-preview') === state.preview);
      el.setAttribute('aria-pressed', el.getAttribute('data-buy-preview') === state.preview);
    });
  }

  /* ============================== 渲染 ============================== */
  function renderThumbs() {
    var box = $('[data-buy-thumbs]');
    if (!box) return;
    box.innerHTML = VIEWS.map(function (v) {
      var src = v.id === 'phone' ? (heroSrc || '') : (IMAGES[v.img] || '');
      return '<button type="button" class="buy-thumb' + (v.id === state.preview ? ' is-on' : '') + '" data-buy-preview="' + v.id + '" aria-pressed="' + (v.id === state.preview) + '" aria-label="' + v.label + '" title="' + v.label + '">' +
        (src ? '<img alt="" src="' + src + '">' : '') +
        '</button>';
    }).join('');
  }

  function renderConfigs() {
    var box = $('[data-buy-configs]');
    if (!box) return;
    box.innerHTML = CONFIG.configs.map(function (c, i) {
      var on = i === state.config;
      return '<button type="button" class="buy-config' + (on ? ' is-on' : '') + '" role="radio" aria-checked="' + on + '" data-buy-config="' + i + '">' +
        '<span class="buy-config__top">' +
        '<span class="buy-config__name">' + c.name + '</span>' +
        (c.type === 'bundle' ? '<span class="buy-config__tag">套装</span>' : '') +
        '</span>' +
        (c.note ? '<span class="buy-config__note">' + c.note + '</span>' : '') +
        '<span class="buy-config__price"><i>¥</i>' + money(c.price) + '</span>' +
        '</button>';
    }).join('');
  }

  function renderColors() {
    var box = $('[data-buy-colors]');
    if (!box) return;
    box.innerHTML = CONFIG.colors.map(function (c, i) {
      var on = i === state.color && c.available;
      if (!c.available) {
        return '<button type="button" class="buy-opt buy-opt--color is-soon" aria-disabled="true" data-buy-color="' + i + '">' +
          '<span class="buy-opt__label">' + c.name + '</span>' +
          '<span class="buy-soon">' + (c.soon || '敬请期待') + '</span>' +
          '</button>';
      }
      return '<button type="button" class="buy-opt buy-opt--color' + (on ? ' is-on' : '') + '" role="radio" aria-checked="' + on + '" data-buy-color="' + i + '">' +
        '<span class="buy-opt__label">' + c.name + '</span>' +
        '</button>';
    }).join('');
  }

  function moduleState(id) {
    if (cfg().includes.indexOf(id) > -1) return 'included';
    if (giftIds().indexOf(id) > -1) return 'gift';
    return state.modules[id] ? 'on' : 'off';
  }

  function renderModules() {
    var box = $('[data-buy-mods]');
    if (!box) return;
    box.innerHTML = CONFIG.modules.map(function (m) {
      var st = moduleState(m.id);
      var src = IMAGES[m.img] || '';
      var tag = st === 'included' ? '已包含' : st === 'gift' ? '赠品' : st === 'on' ? '已加购' : '加入';
      return '<button type="button" class="buy-mod is-' + st + '" data-buy-mod="' + m.id + '" aria-pressed="' + (st === 'on') + '"' +
        (st === 'included' || st === 'gift' ? ' aria-disabled="true"' : '') + '>' +
        '<span class="buy-mod__fig">' + (src ? '<img alt="' + m.name + '" src="' + src + '">' : '') + '</span>' +
        '<span class="buy-mod__body">' +
        '<span class="buy-mod__name">' + m.name + '</span>' +
        '<span class="buy-mod__desc">' + m.desc + '</span>' +
        '<span class="buy-mod__price"><i>¥</i>' + money(m.price) + '</span>' +
        '</span>' +
        '<span class="buy-mod__tag">' + tag + '</span>' +
        '</button>';
    }).join('');
  }

  function renderMethods() {
    var box = $('[data-buy-methods]');
    if (!box) return;
    box.innerHTML = CONFIG.payMethods.map(function (m) {
      var on = m.id === state.pay;
      return '<button type="button" class="b-method' + (on ? ' is-on' : '') + '" role="radio" aria-checked="' + on + '" data-buy-method="' + m.id + '">' +
        '<span class="b-method__radio"></span>' +
        '<span class="b-method__icon">' + (ICONS[m.id] ? '<img src="' + ICONS[m.id] + '" alt="">' : m.name.slice(0, 2)) + '</span>' +
        '<span class="b-method__name">' + m.name + '<em>' + m.desc + '</em></span>' +
        (m.badge ? '<span class="b-method__badge">' + m.badge + '</span>' : '') +
        '</button>';
    }).join('');
  }

  function benefitsFor() {
    var c = cfg();
    var list = [];
    if (c.includes.indexOf('cooling') === -1) list.push('首销三个月内赠散热模块');
    if (c.id === 'p1t') list.push('购机赠送模块盲盒，限量 20,000 份');
    if (c.type === 'bundle' && c.includes.indexOf('battery') === -1) list.push('首销三个月内赠外挂电池');
    if (c.id === 'all') {
      list.push('赠收藏证书');
      list.push('可加入官方模块交流群');
      list.push('赠钛合金定制铭牌');
      list.push('后续新模块终身赠送');
    }
    if (!list.length) list.push('7 天无理由退货 · 15 天免费换货');
    return list;
  }

  /* ============================== 同步 ============================== */
  function sync() {
    var t = totals();
    var c = cfg();
    var col = color();

    var totalEls = $$('[data-buy-total]');
    totalEls.forEach(function (el) { el.textContent = money(t.total); });
    $$('[data-buy-price]').forEach(function (el) { el.textContent = money(c.price); });
    $$('[data-buy-price-meta]').forEach(function (el) {
      el.textContent = c.name + ' · ' + (c.type === 'bundle' ? '含 ' + c.includes.length + ' 个模块' : '手机') +
        (giftIds().length ? ' · 赠' + giftIds().map(function (id) { var m = moduleById(id); return m ? m.name : id; }).join('、') : '');
    });

    var giftNames = giftIds().map(function (id) { var m = moduleById(id); return m ? m.name : id; });
    $$('[data-buy-gift]').forEach(function (el) {
      el.textContent = giftNames.length
        ? '首销三个月内，赠' + giftNames.join('、') + ' ×1'
        : '限量收藏证书+定制钛合金铭牌';
    });
    $$('[data-buy-right]').forEach(function (el) {
      el.textContent = c.id === 'p1t'
        ? '16GB+1TB 版本购机赠送模块盲盒，限量 20,000 份'
        : c.id === 'all'
          ? '可加入官方模块生态交流群，新模块终身免费赠送'
          : '购买任意配置均可享 7 天无理由退货与 15 天免费换货';
    });

    /* 地址（未填写时显示占位提示） */
    var a = state.address;
    var whoText = a.name
      ? a.name + (a.phone ? ' ' + maskPhone(a.phone) : '')
      : '请选择收货地址';
    var whereText = a.detail ? fullAddress() : '填写收货人、手机号与详细地址';
    $$('[data-buy-addr-who]').forEach(function (el) { el.textContent = whoText; });
    $$('[data-buy-addr-where]').forEach(function (el) { el.textContent = whereText; });
    $$('[data-buy-addr-name]').forEach(function (el) { el.textContent = a.name || '未填写收货人'; });
    $$('[data-buy-addr-phone]').forEach(function (el) { el.textContent = a.phone ? maskPhone(a.phone) : ''; });
    $$('[data-buy-addr-full]').forEach(function (el) { el.textContent = a.detail ? fullAddress() : '尚未填写详细收货地址'; });
    $$('[data-buy-addr-avatar]').forEach(function (el) { el.textContent = a.name ? a.name.slice(0, 1) : '+'; });
    $$('[data-buy-order-addr]').forEach(function (el) {
      el.innerHTML = a.name
        ? a.name + ' ' + maskPhone(a.phone) + '<br>' + [a.province, a.city, a.district].filter(Boolean).join(' ')
        : '未填写';
    });

    /* 选中态 */
    $$('[data-buy-config]').forEach(function (el) {
      var on = +el.getAttribute('data-buy-config') === state.config;
      el.classList.toggle('is-on', on);
      el.setAttribute('aria-checked', on);
    });
    $$('[data-buy-color]').forEach(function (el) {
      var on = +el.getAttribute('data-buy-color') === state.color;
      el.classList.toggle('is-on', on);
      if (!el.classList.contains('is-soon')) el.setAttribute('aria-checked', on);
    });
    $$('[data-buy-mod]').forEach(function (el) {
      var st = moduleState(el.getAttribute('data-buy-mod'));
      el.classList.remove('is-on', 'is-off', 'is-gift', 'is-included');
      el.classList.add('is-' + st);
      el.setAttribute('aria-pressed', st === 'on');
      var tag = el.querySelector('.buy-mod__tag');
      if (tag) tag.textContent = st === 'included' ? '已包含' : st === 'gift' ? '赠品' : st === 'on' ? '已加购' : '加入';
    });

    $$('[data-buy-method]').forEach(function (el) {
      var on = el.getAttribute('data-buy-method') === state.pay;
      el.classList.toggle('is-on', on);
      el.setAttribute('aria-checked', on);
    });

    /* 合计说明 */
    $$('[data-buy-total-note]').forEach(function (el) {
      var parts = [];
      if (c.includes.length) parts.push('套装含 ' + c.includes.length + ' 个模块');
      if (t.paidCount) parts.push('已加购 ' + t.paidCount + ' 个模块');
      if (!parts.length) parts.push('未加购模块');
      if (giftIds().length) parts.push('含赠品');
      parts.push('免运费');
      el.textContent = parts.join(' · ');
    });

    /* 确认订单 */
    var addressOk = addressReady();
    $$('[data-buy-action="submit"]').forEach(function (el) {
      el.disabled = !addressOk;
      el.setAttribute('aria-disabled', addressOk ? 'false' : 'true');
      el.title = addressOk ? '' : '请先填写完整的收货信息';
    });
    var modNames = paidModules().map(function (m) { return m.name; });
    var incNames = c.includes.map(function (id) { var m = moduleById(id); return m ? m.name : id; });
    var allModuleNames = incNames.concat(modNames);
    var giftNames2 = giftIds().map(function (id) { var m = moduleById(id); return m ? m.name : id; });
    $$('[data-buy-item-spec]').forEach(function (el) { el.textContent = col.name + ' · ' + c.storage; });
    $$('[data-buy-item-config]').forEach(function (el) {
      el.textContent = c.type === 'bundle' ? c.name + ' · ' + c.note : '手机（不含模块）';
    });
    $$('[data-buy-item-modules]').forEach(function (el) {
      el.textContent = allModuleNames.length
        ? (c.type === 'bundle' ? '含：' : '加购：') + allModuleNames.join('、')
        : '未加购模块';
    });
    $$('[data-buy-item-price]').forEach(function (el) { el.textContent = '¥' + money(c.price); });
    $$('[data-buy-item-qty]').forEach(function (el) { el.textContent = '× ' + state.qty; });
    $$('[data-buy-item-count]').forEach(function (el) { el.textContent = '共 ' + state.qty + ' 件'; });
    $$('[data-buy-item-gift]').forEach(function (el) {
      if (giftNames2.length) {
        el.innerHTML = '<span class="b-gift__tag">赠品</span> ' + giftNames2.map(function (n) { return n + ' ×1'; }).join('、');
        el.hidden = false;
      } else { el.hidden = true; }
    });
    $$('[data-buy-sum-goods]').forEach(function (el) { el.textContent = '¥' + money(t.goods); });
    $$('[data-buy-sum-goods-label]').forEach(function (el) { el.textContent = c.name + ' × ' + state.qty; });
    $$('[data-buy-sum-modules]').forEach(function (el) { el.textContent = '¥' + money(t.modules); });
    $$('[data-buy-sum-total]').forEach(function (el) { el.textContent = money(t.total); });

    var benefitBox = $('[data-buy-benefits]');
    if (benefitBox) {
      benefitBox.innerHTML = benefitsFor().map(function (b) {
        return '<li><svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12.5l5 5L20 6.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>' + b + '</li>';
      }).join('');
    }

    /* 订单提交 */
    $$('[data-buy-pay-amount]').forEach(function (el) { el.textContent = money(t.total); });
    $$('[data-buy-pay-amount-inline]').forEach(function (el) { el.textContent = '¥' + money(t.total); });

    /* 完成 */
    $$('[data-buy-order-amount]').forEach(function (el) { el.textContent = '¥' + money(t.total); });
    $$('[data-buy-order-spec]').forEach(function (el) { el.textContent = col.name + ' · ' + c.storage; });
    $$('[data-buy-order-modules]').forEach(function (el) {
      el.textContent = allModuleNames.length ? allModuleNames.join('、') : (giftNames2.length ? '无（含赠品）' : '无');
    });

    paintImages();
  }

  /* ============================== 流程 ============================== */
  function stepsBar() {
    var idx = STEPS.indexOf(state.step);
    var now = $('[data-buy-stepnow]');
    if (now) now.textContent = LABELS[state.step] + ' · ' + (idx + 1) + '/4';
  }

  function applyStep(step) {
    state.step = STEPS.indexOf(step) > -1 ? step : 'select';
    /* 收货信息不完整时不允许进入收银台 / 完成页（地址弹层未打开时退回确认页） */
    if ((state.step === 'pay' || state.step === 'success') && !addressReady() && !(modal && !modal.hidden)) {
      state.step = 'confirm';
      showToast('请先填写完整的收货信息');
    }
    $$('[data-buy-screen]').forEach(function (sec) {
      var on = sec.getAttribute('data-buy-screen') === state.step;
      sec.classList.toggle('is-active', on);
      sec.setAttribute('aria-hidden', on ? 'false' : 'true');
    });
    stepsBar();
    if (scrollBox) scrollBox.scrollTop = 0;
    if (state.step === 'success') startFinalSequence();
    else stopFinalSequence();
    sync();
  }

  function hashFor(step) { return step === 'select' ? '#buy' : '#buy/' + step; }

  function writeHash(step) {
    var hash = hashFor(step);
    if (location.hash === hash) return;
    try { history.pushState({ buy: step }, '', hash); }
    catch (e) { location.hash = hash.slice(1); }
  }

  function go(step, opts) {
    opts = opts || {};
    applyStep(step);
    if (!opts.silentHash) writeHash(state.step);
    if (!opts.keepFocus) {
      var active = $('.buy-screen.is-active h2, .buy-screen.is-active h1');
      if (active) { active.setAttribute('tabindex', '-1'); active.focus({ preventScroll: true }); }
    }
  }

  /* ============================== 打开 / 关闭 ============================== */
  function lockScroll(on) {
    if (on) {
      var gap = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.paddingRight = gap > 0 ? gap + 'px' : '';
      document.body.classList.add('lg-buy-lock');
    } else {
      document.body.classList.remove('lg-buy-lock');
      document.body.style.paddingRight = '';
    }
  }

  function setBackgroundInert(on) {
    ['site-header', 'main', 'site-footer'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      try { el.inert = on; } catch (e) {}
      if (on) el.setAttribute('aria-hidden', 'true');
      else el.removeAttribute('aria-hidden');
    });
  }

  function open(step) {
    if (!isOpen) {
      lastFocus = document.activeElement;
      isOpen = true;
      overlay.classList.add('is-open');
      overlay.setAttribute('aria-hidden', 'false');
      lockScroll(true);
      setBackgroundInert(true);
    }
    go(step || 'select');
  }

  function close() {
    if (!isOpen) return;
    closeModal(true);
    isOpen = false;
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    lockScroll(false);
    setBackgroundInert(false);
    stopFinalSequence();
    try { history.pushState({}, '', location.pathname + location.search); }
    catch (e) { location.hash = ''; }
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }

  function trapFocus(e) {
    if (e.key !== 'Tab' || !isOpen) return;
    var scope = (modal && !modal.hidden) ? modal : overlay;
    var nodes = $$('a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])', scope)
      .filter(function (el) { return el.offsetParent !== null; });
    if (!nodes.length) return;
    var first = nodes[0], last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  /* ============================== 弹层 ============================== */
  function openModal(title, bodyHtml) {
    if (!modal) return;
    modalReturnFocus = document.activeElement;
    modalTitle.textContent = title;
    modalBody.innerHTML = bodyHtml;
    modal.hidden = false;
    /* 打开流程时 rAF 被暂停，这里用 setTimeout 触发过渡 */
    setTimeout(function () { modal.classList.add('is-open'); }, 16);
    var focusable = modal.querySelector('input, button, a[href]');
    if (focusable) setTimeout(function () { focusable.focus({ preventScroll: true }); }, 30);
  }

  function closeModal(silent) {
    if (!modal || modal.hidden) return;
    modal.classList.remove('is-open');
    var done = function () {
      modal.hidden = true;
      modalBody.innerHTML = '';
      if (!silent && modalReturnFocus && modalReturnFocus.focus) modalReturnFocus.focus({ preventScroll: true });
    };
    setTimeout(done, 180);
  }

  function openAddressForm() {
    var a = state.address;
    var regions = window.LEGEND_ADDRESS_DATA || [];

    var pick = function (list, name) {
      var found = list.filter(function (x) { return x.n === name; })[0];
      return { item: found || list[0] || null, options: list };
    };
    var pSel = pick(regions, a.province);
    var pItem = pSel.item;
    var cList = (pItem && pItem.c) || [];
    var cSel = pick(cList, a.city);
    var cItem = cSel.item;
    var dList = (cItem && cItem.c) || [];
    var dSel = pick(dList, a.district);

    var opts = function (list, selected) {
      return list.map(function (x) {
        return '<option value="' + x.i + '"' + (selected && x.i === selected.i ? ' selected' : '') + '>' + x.n + '</option>';
      }).join('');
    };

    openModal('修改收货信息',
      '<form class="buy-form" data-buy-address-form>' +
      '<label class="buy-form__row"><span>收货人</span><input name="name" type="text" value="' + a.name + '" autocomplete="name" maxlength="20"></label>' +
      '<label class="buy-form__row"><span>手机号</span><input name="phone" type="tel" inputmode="numeric" value="' + a.phone + '" autocomplete="tel" maxlength="11"></label>' +
      '<div class="buy-form__row"><span>所在地区</span><div class="buy-form__region">' +
      '<select name="province" aria-label="省份">' + opts(pSel.options, pItem) + '</select>' +
      '<select name="city" aria-label="城市">' + opts(cList, cItem) + '</select>' +
      '<select name="district" aria-label="区县">' + opts(dList, dSel.item) + '</select>' +
      '</div></div>' +
      '<label class="buy-form__row"><span>详细地址</span><input name="detail" type="text" value="' + a.detail + '" placeholder="街道、楼栋、门牌号"></label>' +
      '<p class="buy-form__err" data-buy-form-err></p>' +
      '<div class="buy-form__actions">' +
      '<button type="button" class="buy-btn buy-btn--ghost" data-buy-modal-close>取消</button>' +
      '<button type="submit" class="buy-btn buy-btn--primary">保存</button>' +
      '</div></form>');

    var form = modal.querySelector('[data-buy-address-form]');
    var err = modal.querySelector('[data-buy-form-err]');
    var selP = form.querySelector('[name="province"]');
    var selC = form.querySelector('[name="city"]');
    var selD = form.querySelector('[name="district"]');

    var byId = function (list, id) {
      return list.filter(function (x) { return String(x.i) === String(id); })[0] || null;
    };

    var refreshCities = function () {
      var p = byId(regions, selP.value);
      var cities = (p && p.c) || [];
      selC.innerHTML = opts(cities, cities[0]);
      refreshDistricts();
    };
    var refreshDistricts = function () {
      var p = byId(regions, selP.value);
      var c = byId((p && p.c) || [], selC.value);
      var districts = (c && c.c) || [];
      selD.innerHTML = opts(districts, districts[0]);
    };

    selP.addEventListener('change', refreshCities);
    selC.addEventListener('change', refreshDistricts);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var fd = new FormData(form);
      var p = byId(regions, fd.get('province'));
      var c = byId((p && p.c) || [], fd.get('city'));
      var d = byId((c && c.c) || [], fd.get('district'));
      var next = {
        name: String(fd.get('name') || '').trim(),
        phone: String(fd.get('phone') || '').replace(/\D/g, ''),
        province: p ? p.n : '',
        city: c ? c.n : '',
        district: d ? d.n : '',
        detail: String(fd.get('detail') || '').trim()
      };
      if (!next.name) { err.textContent = '请填写收货人姓名'; return; }
      if (!/^1\d{10}$/.test(next.phone)) { err.textContent = '请填写 11 位手机号'; return; }
      if (!next.province || !next.city || !next.district) { err.textContent = '请选择所在地区'; return; }
      if (!next.detail) { err.textContent = '请填写详细地址'; return; }
      state.address = next;
      sync();
      closeModal();
      showToast('收货信息已更新');
    });
  }

  /* 订单号：完全随机生成（进入收银台时生成一次） */
  function makeOrderNo() {
    var digits = '';
    for (var i = 0; i < 14; i++) digits += Math.floor(Math.random() * 10);
    return 'LG' + digits;
  }

  /* 收货信息是否完整（收货人 / 手机号 / 省市区 / 详细地址） */
  function addressReady() {
    var a = state.address;
    return !!(a.name && /^1\d{10}$/.test(a.phone) && a.province && a.city && a.district && a.detail);
  }

  function submitOrder() {
    if (!addressReady()) {
      showToast('请先填写完整的收货信息');
      return;
    }
    state.order = makeOrderNo();
    $$('[data-buy-order-no]').forEach(function (el) { el.textContent = state.order; });
    go('pay');
  }

  /* ============================== 视频 ==============================
     本地 30 秒影片：进入视频页从 0 开始自动播放，播完自动返回主页；
     文案在每次进入时固定等待 3 秒后向上渐显。 */
  var finalTimer = 0;
  var videoActive = false;
  var videoBound = false;

  function videoEl() { return $('[data-buy-video]'); }

  function bindVideo() {
    var v = videoEl();
    if (!v || videoBound) return;
    videoBound = true;
    /* 30 秒播完 -> 自动返回主页（等价于点“返回主页”） */
    v.addEventListener('ended', function () {
      if (videoActive) close();
    });
    /* 影片解码失败时给个提示，不至于只剩一块黑屏 */
    v.addEventListener('error', function () {
      showToast('影片加载失败，请刷新页面重试');
    });
  }

  function playVideo() {
    var v = videoEl();
    if (!v) return;
    try { v.currentTime = 0; } catch (e) {}
    v.muted = false;
    var p = v.play();
    if (p && typeof p.catch === 'function') {
      /* 浏览器拦截带声音的自动播放时改为静音续播，用户可用控制栏打开声音 */
      p.catch(function () {
        v.muted = true;
        var q = v.play();
        if (q && typeof q.catch === 'function') q.catch(function () {});
      });
    }
  }

  function startFinalSequence() {
    var screen = $('[data-buy-final]');
    if (!screen) return;
    clearTimeout(finalTimer);
    videoActive = true;
    bindVideo();

    /* 瞬时复位到“未抬升”初始态：不加过渡，重进时就不会先向下滑落 / 渐隐 */
    screen.classList.add('no-anim');
    screen.classList.remove('is-raised');
    void screen.offsetWidth; /* 强制回流，让复位这一帧不参与过渡 */
    screen.classList.remove('no-anim');

    /* 每次进入都固定等 3 秒，再把整块上移、文案向上渐显 */
    finalTimer = setTimeout(function () {
      finalTimer = 0;
      if (videoActive) screen.classList.add('is-raised');
    }, 3000);

    playVideo();
  }

  /* 离开视频页：停止计时，暂停并回到片头，声音立即停止 */
  function stopFinalSequence() {
    clearTimeout(finalTimer);
    finalTimer = 0;
    videoActive = false;
    var v = videoEl();
    if (!v) return;
    v.pause();
    try { v.currentTime = 0; } catch (e) {}
  }

  /* 离开 / 隐藏 / 关闭时兜底：只要视频页不再展示就停下 */
  function guardVideoPause() {
    if (!videoActive) return;
    var screen = document.querySelector('[data-buy-screen="success"]');
    var visible = isOpen && screen && screen.classList.contains('is-active') && !document.hidden;
    /* 购买流程整体不可见（关闭 / 被移除）时也算离开 */
    var shown = getComputedStyle(overlay).visibility !== 'hidden' && overlay.getBoundingClientRect().width > 0;
    if (!visible || !shown) stopFinalSequence();
  }

  /* 支付：半秒转圈后进入视频页 */
  var payLoading = $('[data-buy-loading]');

  function startPayLoading() {
    if (!payLoading) return;
    payLoading.hidden = false;
    setTimeout(function () { payLoading.classList.add('is-on'); }, 16);
    setTimeout(function () {
      payLoading.classList.remove('is-on');
      setTimeout(function () { payLoading.hidden = true; }, 200);
      payBusy = false;
      var btn = $('[data-buy-action="pay"]');
      if (btn) btn.disabled = false;
      go('success');
    }, 500);
  }

  function confirmPay() {
    if (payBusy) return;
    payBusy = true;
    var btn = $('[data-buy-action="pay"]');
    if (btn) btn.disabled = true;
    startPayLoading();
  }

  function resetOrder() {
    state.qty = 1;
    state.modules = {};
    state.order = null;
    state.preview = 'phone';
    renderModules();
    renderThumbs();
    sync();
  }

  /* ============================== 事件 ============================== */
  overlay.addEventListener('click', function (e) {
    var el;

    if ((el = e.target.closest('[data-buy-modal-close]'))) { e.preventDefault(); closeModal(); return; }

    if (modal && !modal.hidden) {
      /* 弹层打开时，只处理弹层内的关闭/提交 */
      return;
    }

    if ((el = e.target.closest('[data-buy-close]'))) { e.preventDefault(); close(); return; }
    if ((el = e.target.closest('[data-buy-go]'))) { go(el.getAttribute('data-buy-go')); return; }
    if ((el = e.target.closest('[data-buy-edit-address]'))) { e.preventDefault(); openAddressForm(); return; }

    if ((el = e.target.closest('[data-buy-preview]'))) {
      state.preview = el.getAttribute('data-buy-preview');
      paintImages();
      return;
    }
    if ((el = e.target.closest('[data-buy-config]'))) {
      state.config = +el.getAttribute('data-buy-config');
      renderModules();
      sync();
      return;
    }
    if ((el = e.target.closest('[data-buy-color]'))) {
      var idx = +el.getAttribute('data-buy-color');
      if (!CONFIG.colors[idx].available) { return; }
      state.color = idx;
      sync();
      return;
    }
    if ((el = e.target.closest('[data-buy-mod]'))) {
      var id = el.getAttribute('data-buy-mod');
      var st = moduleState(id);
      if (st === 'included' || st === 'gift') return;
      if (state.modules[id]) delete state.modules[id];
      else state.modules[id] = true;
      sync();
      return;
    }
    if ((el = e.target.closest('[data-buy-method]'))) {
      state.pay = el.getAttribute('data-buy-method');
      renderMethods();
      sync();
      return;
    }
    if ((el = e.target.closest('[data-buy-action]'))) {
      e.preventDefault();
      var action = el.getAttribute('data-buy-action');
      if (action === 'next') go('confirm');
      else if (action === 'cart') showToast('已加入购物车');
      else if (action === 'submit') submitOrder();
      else if (action === 'pay') confirmPay();
      else if (action === 'again') { resetOrder(); go('select'); }
      return;
    }
  });

  document.addEventListener('keydown', function (e) {
    if (!isOpen) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      if (modal && !modal.hidden) closeModal();
      else close();
      return;
    }
    trapFocus(e);
  });

  /* 购买流程不显示时（关闭 / 被覆盖），立刻停止播放 */


  /* 页面被切到后台时也停止播放 */
  document.addEventListener('visibilitychange', guardVideoPause);

  /* 视频页元素本身也兜一层：一旦被隐藏就停 */
  (function () {
    var frame = $('[data-buy-video]');
    if (frame && 'IntersectionObserver' in window) {
      new IntersectionObserver(function () {
        guardVideoPause();
      }, { threshold: 0 }).observe(frame);
    }
  })();

  window.addEventListener('popstate', function () {
    var m = /^#buy(?:\/([a-z]+))?$/.exec(location.hash || '');
    if (m) open(m[1] || 'select');
    else close();
  });

  window.addEventListener('hashchange', function () {
    var m = /^#buy(?:\/([a-z]+))?$/.exec(location.hash || '');
    if (m && (!isOpen || state.step !== (m[1] || 'select'))) open(m[1] || 'select');
    else if (!m && isOpen) close();
  });

  function bindEntry() {
    var entry = document.querySelector('.subnav-buy');
    if (entry) entry.addEventListener('click', function (e) { e.preventDefault(); open('select'); });
    $$('[data-buy-open]').forEach(function (el) {
      el.addEventListener('click', function (e) { e.preventDefault(); open(el.getAttribute('data-buy-open') || 'select'); });
    });
  }

  /* ============================== 启动 ============================== */
  function init() {
    heroSrc = resolveHeroImage();
    renderThumbs();
    renderConfigs();
    renderColors();
    renderModules();
    renderMethods();
    sync();
    bindEntry();

    var m = /^#buy(?:\/([a-z]+))?$/.exec(location.hash || '');
    if (m) setTimeout(function () { open(m[1] || 'select'); }, 60);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

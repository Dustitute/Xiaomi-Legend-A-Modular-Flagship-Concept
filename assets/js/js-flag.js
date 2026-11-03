
/* 标记 JS 可用：入场元素初始隐藏（无 JS 时保持可见，避免白屏） */
document.documentElement.classList.add('js');
if (!window.gsap) document.documentElement.classList.add('no-gsap');
/* 兜底：首屏入场脚本若始终没跑起来（脚本报错 / 被拦截），3s 后强制显示首屏，
   避免 CSS 预设的 opacity:0 让大标题一直空着 */
setTimeout(function () {
  if (window.Legend && window.Legend.entranceStarted) return;
  var root = document.documentElement;
  root.classList.add('no-gsap');
  var els = document.querySelectorAll('.hero-title-word,[data-hero-fade],[data-hero-phone]');
  for (var i = 0; i < els.length; i++) {
    els[i].style.opacity = '1';
    els[i].style.visibility = 'visible';
  }
}, 3000);

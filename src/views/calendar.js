/* ======== ④ 校历作息（v1.3） ========
   图片来自教务部官网 2026-2027 学年校历发布页（jwc.zuel.edu.cn/5822/list.htm，2026-06-03 发布），
   随包内置、离线可看；学校发布新校历后点「查看原文」核对最新版。 */
function renderCalendar(){
  $('mainArea').innerHTML = `
  <div class="page-head">
    <div><div class="u-title">校历作息</div>
    <div class="u-sub">中南财经政法大学 2026-2027 学年校历 · 课堂时间表 · 来源：教务部官网（2026-06-03 发布）</div></div>
    <button class="btn" onclick="openLinkExternal('https://jwc.zuel.edu.cn/5822/list.htm')">查看原文 ↗</button>
  </div>
  <div class="cal-grid">
  <div class="u-card"><div class="u-card-body">
    <div style="font-weight:660;font-size:14.5px;margin-bottom:10px">📅 2026-2027 学年校历（上下两学期）</div>
    <img class="cal-img" src="${CAL_IMG_YEAR}" alt="中南财经政法大学2026-2027学年校历"
      onclick="openCalZoom('year')" title="点击放大查看原图">
    <div style="font-size:12px;color:var(--text-3);margin-top:8px;text-align:center">
      图片已按页面宽度适配 · 点击图片可放大滚动查看原图 · 如学校发布新校历，以官网最新版为准</div>
  </div></div>
  <div class="u-card"><div class="u-card-body">
    <div style="font-weight:660;font-size:14.5px;margin-bottom:10px">⏰ 课堂时间表（作息）</div>
    <img class="cal-img" src="${CAL_IMG_CLASS}" alt="课堂时间表"
      onclick="openCalZoom('class')" title="点击放大查看原图">
    <div style="font-size:12px;color:var(--text-3);margin-top:8px;text-align:center">
      含预备铃、五大节课时间、行政上班时间与熄灯时间 · 下查寝、排谈话可参照 · 点击图片放大</div>
  </div></div>
  </div>`;
}

/* 校历大图查看（v1.4）：全屏遮罩 + 可滚动原图，点任意处关闭 */
const CAL_SRC = { year: ()=>CAL_IMG_YEAR, class: ()=>CAL_IMG_CLASS };
const CAL_TITLE = { year: '2026-2027 学年校历', class: '课堂时间表（作息）' };
function openCalZoom(which){
  const old = document.getElementById('calMask');
  if(old) old.remove();
  const mask = document.createElement('div');
  mask.id = 'calMask';
  mask.className = 'cal-mask';
  mask.innerHTML = `<div style="max-width:1080px;margin:0 auto">
    <div class="cal-mask-tip" onclick="closeCalZoom()">「${CAL_TITLE[which]}」原图 · 点击任意空白处或此行关闭 ✕</div>
    <img src="${CAL_SRC[which]()}" alt="${CAL_TITLE[which]}"></div>`;
  mask.onclick = e => { if(e.target === mask) closeCalZoom(); };
  document.body.appendChild(mask);
}
function closeCalZoom(){
  const m = document.getElementById('calMask');
  if(m && typeof m.remove === 'function') m.remove();
}

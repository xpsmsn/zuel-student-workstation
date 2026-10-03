/* ════════════════════════════════════════════════════════════════════════
   modules/app-shell.js —— 外壳：响应式 · 侧栏 · 批次条（L3 shell）
   ────────────────────────────────────────────────────────────────────────
   「外壳」指围着内容转的那些东西：断点、侧栏、批次切换。不含任何业务。

   ── 这个文件是"顺序无关"的直接证据 ────────────────────────────────────
   重构前它被切成三个碎片：shell.js / shell-2.js / shell-3.js。
   切开的唯一原因是 shell-4.js 里那行 `$('quoteBar').onclick = nextQuote` ——
   它在加载那一刻就要抓 DOM，只能排在最后，于是整个外壳层都得陪着它分段。

   把那行改成 K.ready(...) 之后（见 modules/topbar.js），
   三个碎片可以直接拼回一个文件 —— **不是因为我们敢了，是因为不再需要**。
   这就是「顺序由依赖图算出」与「顺序由人手排」的本质区别。
   ════════════════════════════════════════════════════════════════════════ */

/* ---------- 响应式：统一在这里判断断点 ----------
   三档断点：1180（平板横）/ 760（平板竖、手机横）/ 560（手机竖）
   侧栏抽屉断点单独用 1024。 */
function mqHit(q){
  return typeof matchMedia === 'function' ? matchMedia(q).matches : false;
}
function isNarrow(){ return mqHit('(max-width:760px)'); }

/* 视口跨断点时重绘：表格要在「表格 ↔ 卡片」间切换，图表要按新宽度重画。
   加了防抖，拖动窗口时不会疯狂重绘。 */
let _vpTimer = null;
function onViewportChange(){
  clearTimeout(_vpTimer);
  _vpTimer = setTimeout(()=>{ if($('mainArea')) renderMain(); }, 140);
}
function initResponsive(){
  if(typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
  window.addEventListener('resize', onViewportChange);
  /* v2.2（升级清单 ①）：关标签页 / 刷新时也拦一道 —— 详情页编辑中误关 = 整页编辑丢失。
     浏览器只允许"要不要留下"的提示，文案不可定制；有未保存修改时才触发。 */
  window.addEventListener('beforeunload', e=>{
    if(detailDraft && detailDraft.dirty){ e.preventDefault(); e.returnValue = ''; return ''; }
  });
  // matchMedia 的 change 事件在部分老浏览器上不存在，失败就退化为 resize
  if(typeof matchMedia === 'function'){
    [ '(max-width:760px)', '(max-width:1180px)', '(max-width:1024px)' ].forEach(q=>{
      try{
        const m = matchMedia(q);
        if(m && typeof m.addEventListener === 'function') m.addEventListener('change', onViewportChange);
      }catch(e){ /* 忽略 */ }
    });
  }
}
/* fmtDate() 已移入 src/kernel/00-kernel.js —— core 层的 makeBatch 也要用它，
   它却住在 feature 层，会造成「core 反向依赖 feature」。 */


/* ---------- 侧栏：图标与折叠 ---------- */
/* ---------- 侧栏 ---------- */
/* 侧栏图标（线性 SVG，stroke 走 currentColor，三主题自动适配） */
const SIDE_ICONS = {
  dashboard:'<rect x="3" y="12" width="4" height="9" rx="1"/><rect x="10" y="7" width="4" height="14" rx="1"/><rect x="17" y="3" width="4" height="18" rx="1"/>',
  students:'<circle cx="9" cy="8" r="3.5"/><path d="M3.5 20c0-3 2.5-5 5.5-5s5.5 2 5.5 5"/><circle cx="17" cy="9" r="2.5"/><path d="M16 15c2.8.2 4.5 2 4.5 4.5"/>',
  dorm:'<path d="M3 7v11"/><path d="M3 14h18v4"/><path d="M3 18v3"/><path d="M21 18v3"/><circle cx="7" cy="10.5" r="2"/><path d="M12 14v-3.5h5.5a3.5 3.5 0 0 1 3.5 3.5"/>',
  book:'<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M20 17v4H6.5A2.5 2.5 0 0 1 4 19.5"/>',
  eye:'<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="2.5"/>',
  warn:'<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>',
  trend:'<path d="M3 7l6 6 4-4 8 8"/><path d="M15 17h6v-6"/>',
  doc:'<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/>',
  chat:'<path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  pencil:'<path d="M17 3l4 4L8 20l-5 1 1-5z"/>',
  flag:'<path d="M5 21V4"/><path d="M5 4h12l-2.5 4L17 12H5"/>',
  star:'<path d="M12 3l2.7 5.7 6.3.8-4.6 4.3 1.2 6.2-5.6-3.1-5.6 3.1 1.2-6.2L3 9.5l6.3-.8z"/>',
  compass:'<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
  download:'<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M4 21h16"/>',
  gradelist:'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 2h6v4H9z"/><path d="M9 14l2 2 4-4"/>',
  db:'<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  sliders:'<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="8" cy="18" r="2"/>',
  nav:'<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
  filetext:'<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/><path d="M9 13h7M9 17h7"/>',
  collapse:'<path d="M11 17l-5-5 5-5M18 17l-5-5 5-5"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/>',
  /* v2.x：奖学金评选 —— 奖杯 + 五角星（线稿） */
  award:'<path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0V4z"/><path d="M7 6H4v3a3 3 0 0 0 3 3"/><path d="M17 6h3v3a3 3 0 0 1-3 3"/>'
};
const sideIco = k => `<span class="s-ico"><svg viewBox="0 0 24 24">${SIDE_ICONS[k]||SIDE_ICONS.students}</svg></span>`;
function toggleSideCollapse(){
  S.sideCollapsed = !S.sideCollapsed;
  save(); renderSidebar();
}

/* ---------- 侧栏分组折叠 ---------- */
/* 侧栏整体收缩（58px 图标模式）时忽略折叠，保证图标始终可点。 */
function toggleSideFold(k) {
  S.sideFold = S.sideFold || {};
  S.sideFold[k] = !S.sideFold[k];
  save(); renderSidebar();
}

/** 旧的固定三组（我的班级 / 关注视图）用它；页面分组走 views/list.js 的 navGroupOpen。 */
function sideGroupOpen(k) { return S.sideCollapsed || !(S.sideFold && S.sideFold[k]); }

/**
 * 分组标题。
 * @param k          折叠状态的键
 * @param label      标题文字
 * @param tour       页面导览锚点（可选）
 * @param cls        额外类名。传 ' plain' 表示「这一组不可折」——
 *                   条目本来就放得下，画个折叠箭头是假提示。
 */
function sideLabel(k, label, tour, cls) {
  const folded = !!(S.sideFold && S.sideFold[k]);
  const plain = /\bplain\b/.test(cls || '');
  const open = plain ? true : sideGroupOpen(k);
  return `<div class="side-label fold${folded && !plain ? ' folded' : ''}${plain ? ' plain' : ''}"`
    + `${tour ? ` data-tour="${tour}"` : ''}`
    + (plain ? '' : ` onclick="toggleSideFold('${k}')" title="${open ? '折叠' : '展开'}${esc(label)}"`)
    + `><span>${label}</span>${plain ? '' : '<span class="fold-chev">▾</span>'}</div>`;
}

/* ---------- 侧栏抽屉（窄屏专用，宽屏下这组函数无副作用） ---------- */
function openSidebar(){
  const sb = $('sidebar'), mk = $('sideMask');
  if(sb) sb.classList.add('open');
  if(mk) mk.classList.remove('hidden');
}
function closeSidebar(){
  const sb = $('sidebar'), mk = $('sideMask');
  if(sb) sb.classList.remove('open');
  if(mk) mk.classList.add('hidden');
}
function toggleSidebar(){
  const sb = $('sidebar');
  if(!sb) return;
  if(sb.classList.contains('open')) closeSidebar(); else openSidebar();
}

/* ---------- 批次 Tab 条（顶栏下方常驻） ---------- */
function renderBatchBar(){
  const el = $('batchBar');
  if(!el) return;
  if(!S.batches.length){
    el.innerHTML = `
      <div class="batch-scroll"><span class="batch-none">暂无数据批次</span></div>
      <button class="tb-btn" onclick="openImport()">+ 新建批次</button>`;
    return;
  }
  el.innerHTML = `
    <div class="batch-scroll">
      ${S.batches.map(b=>`
        <button class="btab ${b.id===S.activeBatchId?'active':''}" onclick="switchBatch('${b.id}')"
                title="${esc(b.name)} · ${esc(b.importedAt||'')}${b.sourceFile?' · 来源 '+esc(b.sourceFile):''}">
          <span class="btab-name">${esc(b.name)}</span>
          <span class="btab-n">${b.students.length}</span>
        </button>`).join('')}
    </div>
    <button class="tb-btn" onclick="openBatchManager()" title="批次管理">
      <span class="btab-gear">⚙</span><span class="tb-text">批次管理</span>
    </button>`;
}

function switchBatch(id){
  if(id === S.activeBatchId) { closeSidebar(); return; }
  if(!attachBatch(id)) return;
  // 批次是独立快照，班级与字段可能完全不同
  // → 清空筛选，否则留着上一批的条件会得到一个空列表，让人以为数据丢了
  S.filters = {}; S.quickView = 'all'; S.classFilter = 'all'; S._search = '';
  save();
  renderBatchBar(); renderSidebar(); renderMain(); closeSidebar();
  toast(`已切换到「${activeBatch().name}」`);
}

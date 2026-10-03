/* ---------- 搜索：防抖 + 键盘唤起（v2.2 升级清单 ②③） ---------- */
const SEARCH_DEBOUNCE_MS = 150;
let _dashSearchTimer = null;
/* ② 仪表盘搜索**防抖**：原先每敲一个字就 renderDashBody()（重画所有图表），打 3 个字 = 3 次重绘。
   列表页的 quickSearch 本来就只重绘 tbody（注释写明"避免整页重绘导致输入框失焦"），仪表盘没跟上。
   ⚠️ 具体渲染抽成 runPendingDashSearch()，是为了**可测** —— 定时器在同步测试里跑不到。 */
function dashSearch(v){
  S._search = v.trim();                       // 筛选状态立刻记，不滞后
  clearTimeout(_dashSearchTimer);
  _dashSearchTimer = setTimeout(runPendingDashSearch, SEARCH_DEBOUNCE_MS);
}
function runPendingDashSearch(){
  _dashSearchTimer = null;
  if(S.view === 'dashboard') renderDashBody();   // 切了页就别再去画总览
}
/* 当前视图的搜索框（③ 键盘唤起用） */
function currentSearchBox(){
  if(S.view === 'dashboard'){ const el = $('dashSearchInput'); if(el) return el; }
  if(S.view === 'list'){ const el = $('listSearchInput'); if(el) return el; }
  return null;
}
/* ③ 全局搜索快捷键：⌘/Ctrl+K 唤起、/ 唤起（不在输入框里时）、Esc 清空。
   返回 true 表示已接管。抽成具名函数是为了可测（document 监听在沙盒里触发不了）。 */
function handleSearchShortcut(e){
  if(!e || !e.key) return false;
  const t = e.target || {};
  const tag = String(t.tagName || '').toLowerCase();
  const typing = tag === 'input' || tag === 'textarea' || t.isContentEditable === true;
  const box = currentSearchBox();
  if((e.metaKey || e.ctrlKey) && String(e.key).toLowerCase() === 'k'){
    if(topOpenModal() || !box) return false;    // 弹窗盖着时不抢（否则焦点会在弹窗里乱跳）
    if(e.preventDefault) e.preventDefault();
    if(box.focus) box.focus();
    if(box.select) box.select();
    return true;
  }
  if(e.key === '/' && !typing && !topOpenModal() && box){
    if(e.preventDefault) e.preventDefault();
    if(box.focus) box.focus();
    return true;
  }
  if(e.key === 'Escape' && !topOpenModal() && box && typeof document !== 'undefined' && document.activeElement === box){
    if(e.preventDefault) e.preventDefault();
    box.value = '';
    if(S.view === 'list') quickSearch('');       // 列表页只重绘 tbody
    else runPendingDashSearch();                 // 仪表盘立刻重绘（清空不必等防抖）
    return true;
  }
  return false;
}
function initShortcuts(){
  if(typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;
  document.addEventListener('keydown', e => { handleSearchShortcut(e); });
}
function dashPreset(id){ S.quickView = id; S.classFilter='all'; renderSidebar(); renderMain(); }

/* renderDashboard（总览页主体）已移入 views/dashboard.js —— 它是页面渲染，
   不该住在「搜索」这个功能模块里。 */

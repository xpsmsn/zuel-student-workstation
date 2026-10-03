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
  /* v3：⌘K 与 / 已由 features/quick-find.js 的 handleFindShortcut 接管
     （任何页面都能唤起、且搜全字段）。这里只留 Esc 清空页内搜索框，
     免得两个快捷键打架 —— 一个弹面板、一个聚焦输入框，同时存在很怪。 */
  if(e.key === 'Escape' && !topOpenModal() && box && typeof document !== 'undefined' && document.activeElement === box){
    if(e.preventDefault) e.preventDefault();
    box.value = '';
    if(S.view === 'list') quickSearch('');       // 列表页只重绘 tbody
    else runPendingDashSearch();                 // 仪表盘立刻重绘（清空不必等防抖）
    return true;
  }
  return false;
}
/* v3（2026-10-03）：全局「快速查找」独立成一个面板，⌘K / / 由它接管。
   原因：辅导员日常第一件事是「学生出事了要最快查到他所有信息」，
   而这里的 searchList() 只匹配 5 个字段（姓名/学号/考生号/电话），
   恰好漏掉了出事时最要紧的家长电话、宿舍、证件号、生源地。
   详见 features/quick-find.js。

   原来的 ⌘K 只在「当前页面有搜索框」时才生效 —— 也就是说在总览页、
   宿舍看板、校历这些页面按 ⌘K 什么都不会发生。现在任何位置都能唤起。 */
function initShortcuts(){
  if(typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;
  document.addEventListener('keydown', e => {
    if (handleFindShortcut(e)) return;   // 快速查找优先
    handleSearchShortcut(e);             // 页内搜索（列表/总览的输入框）
  });
}
function dashPreset(id){ S.quickView = id; S.classFilter='all'; renderSidebar(); renderMain(); }

/* renderDashboard（总览页主体）已移入 views/dashboard.js —— 它是页面渲染，
   不该住在「搜索」这个功能模块里。 */

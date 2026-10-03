/* ════════════════════════════════════════════════════════════════════════
   core/ui-kit.js —— 通用界面零件（L1 core）
   ────────────────────────────────────────────────────────────────────────
   只放**不认识业务**的界面零件：提示条、确认框、弹层键盘。

   住在这层的硬标准：不依赖任何 feature 模块，也不碰业务概念。
   所以它们能被所有页面复用 —— 这正是它们该住 core 的理由。

   ── 一次真实的职责清理 ────────────────────────────────────────────────
   重构前这个文件叫 core/04-kit.js，里面混着三类职责：
     · 界面零件（toast / askConfirm / 弹层键盘）  → 留在本文件
     · 学生数据操作（deleteStudent / 批量删除）   → 已移入 modules/roster-ops.js
     · 列表选择态（selRows / toggleSel / bulkTag）→ 同样已移入 roster-ops
   一个文件三种职责，等于谁都能改它 —— 并行开发时它就是冲突的战场。
   现在按职责拆开，文件名第一次真正对应职责。

   $ / esc / studentName / fmtDate / todayStr 已移入 src/kernel/00-kernel.js
   （它们不碰 S、不碰业务，谁都能用；而 makeBatch 在 core 层也要用 fmtDate，
   它原先住在 feature 层，会造成「core 反向依赖 feature」）。
   ════════════════════════════════════════════════════════════════════════ */

function toast(msg){
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(()=>t.classList.remove('show'), 2200);
}

/* ============================================================
   删除保护三件套：应用内确认框 · 撤销快照 · 备份与恢复
   为什么不用系统 confirm()/prompt()：打包后的 WebView 预览窗口
   不支持系统弹窗（见批次重命名的注释）——弹不出来就等于"删不掉"。
   所有危险操作统一走这里的 askConfirm。
   ============================================================ */

/* ---------- 应用内确认框（独立于 modalRoot，不互相顶掉） ---------- */
let _confirmCb = null;
function askConfirm(opts){
  _confirmCb = opts.onOk || null;
  $('confirmRoot').innerHTML = `
  <div class="mask" style="z-index:600" onclick="if(event.target===this)closeConfirm()">
    <div class="modal" onclick="event.stopPropagation()" style="max-width:440px">
      <div class="modal-head"><div class="modal-title">${esc(opts.title||'确认操作')}</div>
        <div class="modal-close" onclick="closeConfirm()">×</div></div>
      <div class="modal-body" style="font-size:13.5px;line-height:1.8">${opts.html||''}</div>
      <div class="modal-foot">
        <button class="btn" onclick="closeConfirm()">取消</button>
        <button class="btn ${opts.danger?'':'pri'}" ${opts.danger?'style="color:var(--danger);border-color:var(--danger-line)"':''}
                onclick="confirmYes()">${esc(opts.okText||'确认')}</button>
      </div>
    </div>
  </div>`;
}
function closeConfirm(){ $('confirmRoot').innerHTML = ''; _confirmCb = null; }
function confirmYes(){ const cb = _confirmCb; closeConfirm(); if(cb) cb(); }

/* v1.9.2：只告知、不给"取消"的对话框。
   用在"这件事没做成，得说清楚为什么"的场合 —— 例如文件读不了。
   （打包后的 WebView 会吞掉系统 alert()，所以不能用 alert。） */
function showNotice(title, html, okText){
  $('confirmRoot').innerHTML = `
  <div class="mask" style="z-index:600" onclick="if(event.target===this)closeConfirm()">
    <div class="modal" onclick="event.stopPropagation()" style="max-width:470px">
      <div class="modal-head"><div class="modal-title">${esc(title||'提示')}</div>
        <div class="modal-close" onclick="closeConfirm()">×</div></div>
      <div class="modal-body" style="font-size:13.5px;line-height:1.85">${html||''}</div>
      <div class="modal-foot"><button class="btn pri" onclick="closeConfirm()">${esc(okText||'我知道了')}</button></div>
    </div>
  </div>`;
}

/* ---------- 弹窗的键盘可用性（v2.2 升级清单 A） ----------
   现状：全文 17 个弹窗里**只有「新手引导」**支持 Esc 与焦点陷阱（写死在 bindOnboardingControls 里），
   其余（详情页 / 列设置 / 字段设置 / 导入向导 / 确认框…）鼠标能关、**键盘关不掉**，
   且 Tab 会穿透到底层主界面。这里改成**全局一处处理**，对全部弹窗生效（含以后新增的），
   不必每个弹窗各写一遍。
   ⚠️ 抽成具名函数 modalKeydown(e) 是为了**可测** —— document 级监听在测试沙盒里触发不了。
   层级：确认框 / 「只告知」框共用 #confirmRoot 且 z-index:600，盖在 #modalRoot 之上，
   所以 Esc 一律先关最上面那一层。 */
/* 弹层栈：声明有哪些层、每层怎么关。
   ⚠️ close 回调**在调用时才去找**，不是在这里写死 —— 写死的话
   core 就会 import 到 closeModal（住在 feature 层），于是 core → feature 反向依赖。

   现在 core 只说「modalRoot 这一层的关闭动作叫 ui.closeModal」，
   具体怎么关由提供方决定。加一层新弹层只改这张表，不碰 core 其它部分。 */
const MODAL_STACK = [
  { id:'modalRoot',   cap:'ui.closeModal' },
  { id:'confirmRoot', cap:'ui.closeConfirm' }
];
/* 确认框的关闭动作由本文件自己提供，直接注册 */
K.provide('ui.closeConfirm', closeConfirm);
K.provide('ui.modalRoots', () => MODAL_STACK);

/** 取某层的关闭动作；提供方还没注册就返回 null（安全降级，不抛错）。 */
function modalCloser(id) {
  const layer = MODAL_STACK.find(l => l.id === id);
  if (!layer) return null;
  if (typeof layer.close === 'function') return layer.close;
  return K.has(layer.cap) ? K.use(layer.cap) : null;
}
const FOCUSABLE_SEL = 'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
/* 当前最上层打开的弹窗（数组顺序 = 由下到上，所以倒着找） */
function topOpenModal(){
  for(let i = MODAL_STACK.length - 1; i >= 0; i--){
    const el = $(MODAL_STACK[i].id);
    if(el && el.innerHTML && String(el.innerHTML).length) return { el, close: modalCloser(MODAL_STACK[i].id) };
  }
  return null;
}
/* 弹窗内可聚焦的元素（隐藏的不算） */
function modalFocusables(el){
  if(!el) return [];
  const box = (typeof el.querySelector === 'function' ? el.querySelector('.modal') : null) || el;
  const list = (box && typeof box.querySelectorAll === 'function') ? box.querySelectorAll(FOCUSABLE_SEL) : null;
  return list ? [...list].filter(x => x && (x.offsetParent === undefined || x.offsetParent !== null)) : [];
}
/* 算 Tab 之后该聚焦谁 —— 返回下标，-1 表示"不接管，交给浏览器"。
   抽成**纯函数**（完全不碰 DOM）是为了可测：`$` 是顶层 const，测试里伪造不了它，
   所以判断逻辑必须与 DOM 查询分开，否则核心规则根本测不到。 */
function nextTabIndex(count, idx, shift){
  if(!count || count < 1) return -1;
  if(idx < 0) return shift ? count - 1 : 0;        // 焦点在弹窗外 → 拉进来
  if(!shift && idx === count - 1) return 0;        // 末尾 → 回到开头
  if(shift && idx === 0) return count - 1;         // 开头 → 跳到末尾
  return -1;                                       // 中间态交给浏览器
}
/* 全局键盘处理：Esc 关最上层；Tab 限制在最上层内（焦点若在弹窗外则先拉进来）。
   返回 true 表示"已接管"。抽出来是为了可测。 */
function modalKeydown(e){
  if(!e || !e.key) return false;
  const top = topOpenModal();
  if(!top) return false;                       // 没弹窗就别接管页面上的正常按键
  if(e.key === 'Escape'){
    if(e.preventDefault) e.preventDefault();
    top.close();
    return true;
  }
  if(e.key !== 'Tab') return false;
  const f = modalFocusables(top.el);
  if(!f.length) return false;                  // 量不到可聚焦元素 → 不误吞 Tab
  const act = (typeof document !== 'undefined' && document.activeElement) || null;
  const ti = nextTabIndex(f.length, f.indexOf(act), !!e.shiftKey);
  if(ti < 0) return false;                     // 中间态交给浏览器
  if(e.preventDefault) e.preventDefault();
  if(typeof f[ti].focus === 'function') f[ti].focus();
  return true;
}
function initModalKeyboard(){
  if(typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;
  document.addEventListener('keydown', e => { modalKeydown(e); });
}

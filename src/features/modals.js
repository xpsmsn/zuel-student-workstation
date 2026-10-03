/* ════════════════════════════════════════════════════════════════════════
   features/modals.js —— 弹层关闭
   ────────────────────────────────────────────────────────────────────────
   closeModal 看起来像「关闭弹窗」，其实它要处理三件有业务含义的事：
     · 详情页有未保存改动 → 先问一句再关（否则一整页编辑丢失）
     · 导入结果页 → 关闭时补一次刷新（否则主区还停在导入前的数据）
     · 详情页的编辑态与草稿要清干净
   所以它不认识「弹窗」这个概念，只认识「关掉当前这层」。

   它原先住在 features/custom-filter.js（自定义筛选），只是因为当年按位置切分
   把它落在了那儿 —— 文件名与职责不符，会让人以为改筛选要动它。

   通过内核注册，让 core/ui-kit.js 的弹层栈能关掉这一层：
   core 只知道「ui.closeModal」这个名字，不 import 本文件 —— 依赖方向反了。
   ════════════════════════════════════════════════════════════════════════ */

function closeModal(){
  /* v2.2（升级清单 ①）：详情页编辑中直接点 × / 遮罩 → 先问一句再关，否则一整页编辑丢失。 */
  confirmLeaveDirty(closeModalReally);
}
/* 通过内核注册，让 core 的弹层栈能关掉这一层。
   core 只知道「ui.closeModal」这个名字，不 import 本文件 —— 依赖方向反了。 */
K.provide('ui.closeModal', closeModal);
function closeModalReally(){
  $('modalRoot').innerHTML = '';
  curStudent = null;
  detailEdit = false; detailDraft = null;
  // 导入完成后若直接点 × 或遮罩关闭，主区还停在导入前的数据 —— 这里补一次刷新
  if(importState && importState.step === 3 && importState.result){
    importState.result = null;
    renderBatchBar(); renderSidebar(); renderMain();
  }
}

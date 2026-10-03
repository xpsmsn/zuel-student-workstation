/* ════════════════════════════════════════════════════════════════════════
   modules/router.js —— 路由与空状态（L3 shell）
   ────────────────────────────────────────────────────────────────────────
   「现在显示哪个页面」的全部逻辑。这个文件原先叫 modules/award-2.js ——
   名字里的 "2" 是当年按物理位置切碎留下的编号，跟奖学金毫无关系。
   文件名第一次对应职责，是在这次重构里完成的。

   ── 从 13 分支 if 链，到一张注册表 ────────────────────────────────────
   重构前：
       function renderMain(){
         if(S.view === 'guide'){ renderGuide(); return; }
         if(S.view === 'nav'){ renderNav(); return; }
         ... 13 个分支 ...
         renderList();
       }
   每加一个页面要改两处（这条链 + 侧栏），而且**顺序有意义** ——
   前面那些页面要在批次检查之前 return，少写一个 return 就会白屏。

   现在页面自己注册（见 kernel 的 K.registerPage），router 只是查表：
       K.page(S.view)
   加页面 = 加一个模块文件，**router 一行都不用改**。

   页面顺序不再有语义 ——「没有数据也能开的页面」由 needsData 表达，
   而不是靠它在 if 链里排得够靠前。这是把隐式约定变成显式声明。
   ════════════════════════════════════════════════════════════════════════ */

/* 默认落点：S.view 指向一个没注册过的 id 时（老存档、旧链接）
   退到学生列表，而不是白屏。 */
const DEFAULT_VIEW = 'list';

/* 主区域渲染入口 —— 全项目只有这一处决定「显示哪个页面」 */
function renderMain() {
  /* 没注册过的 view：退到默认页。这里必须兜底 ——
     页面被删/改名后，用户的存档里还留着旧的 S.view，
     没有兜底就是一个永久白屏，且很难定位。 */
  let page = K.page(S.view);
  if (!page) {
    page = K.page(DEFAULT_VIEW);
    if (!page) { console.error('[router] 默认页也没注册：', DEFAULT_VIEW); return; }
    S.view = DEFAULT_VIEW;
  }

  /* 需要数据的页面而一个批次都没有 → 空状态引导页。
     注意 page.needsData 是个**声明**，不是 if 链里的位置。 */
  if (page.needsData && !S.batches.length) { renderEmpty(); return; }

  page.render();
}

/* 空状态：一个批次都没有。引导导入，同时保留「恢复演示数据」的出口。
   注意这里绝不能自动灌演示数据 —— 那正是「清空后又冒出 80 条假数据」的根源。 */
function renderEmpty() {
  $('mainArea').innerHTML = `<div class="u-card"><div class="u-card-body">
    <div class="empty-state" style="padding:52px 20px">
      <div class="ico">📋</div>
      <div style="font-size:16.5px;font-weight:650;color:var(--text);margin-bottom:6px">还没有学生数据</div>
      <div style="font-size:13px">导入一份 Excel 名册即可开始使用。数据只存本机，全程不联网。<br>
        还不知道从哪导？先看「导入指引」，三步就能拿到文件。</div>
      <div style="display:flex;gap:10px;justify-content:center;margin-top:18px;flex-wrap:wrap">
        <button class="btn pri" onclick="openImport()">+ 导入学生数据</button>
        <button class="btn" onclick="gotoGuide()">导入指引</button>
        <button class="btn" onclick="restoreDemo()">恢复演示数据</button>
      </div>
    </div>
  </div></div>`;
}

/* 恢复演示数据：明确由用户点击触发，不再自动灌 */
function restoreDemo() {
  if (S.batches.length >= MAX_BATCHES) { toast(`批次数量已达上限（${MAX_BATCHES}），请先删除历史批次`); return; }
  const students = decorateDemo(demoDorms(SEED_DATA.map(d => ({ ...d }))));
  const b = makeBatch('演示数据', 'demo', students, '', demoGrades(students));
  S.batches.push(b);
  attachBatch(b.id);
  save(); renderBatchBar(); renderSidebar(); renderMain();
  toast('已恢复演示数据');
}
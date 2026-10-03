/* ════════════════════════════════════════════════════════════════════════
   shell/app-start.js —— 启动：进入工作台并画好首屏（L3 shell）
   ────────────────────────────────────────────────────────────────────────
   原先这些代码住在 features/lock.js 里，和「锁屏 / 解锁」缠在一起。
   既然锁屏已经整体取消（2026-10-03 用户要求），启动逻辑就该独立成文件 ——
   否则下次有人看到文件名带 "lock" 就会以为还有锁。

   ⚠️ 这里不做任何「弹窗式引导」。以前首启会延时 420ms 自动弹一次导入向导，
      那个遮罩盖住全屏，只要用户没意识到它是弹窗（比如点了别处以为没反应），
      **整页就点不动了** —— 而且没有任何症状提示。
      现在改成：引导只在用户主动点「导入指引」时出现，界面永远先给内容。
   ════════════════════════════════════════════════════════════════════════ */

function enterApp() {
  $('appPage').classList.remove('hidden');

  /* 每次进入应用：筛选回到「全部学生」，搜索清空。
     为什么在这里重置：上一批的筛选条件对这一批没有意义，
     留着会得到一个空列表，让人以为数据丢了。 */
  S.classFilter = 'all'; S.filters = {}; S.quickView = 'all'; S._search = '';

  S.quote = pickQuote();        // 每次进入只随机一次，绝不放 renderMain（否则每次重绘都换）
  applyTheme(S.theme || 'light');

  S.view = 'list';
  renderBatchBar(); renderSidebar(); renderMain(); renderQuote();

  /* 顶栏日期 + 周次。每分钟刷一次：跨零点、跨周要能自动更新。 */
  renderTopbarWeek();
  if (!renderTopbarWeek._timer) {
    renderTopbarWeek._timer = setInterval(renderTopbarWeek, 60000);
  }

  startQuoteRotation();      // 顶栏金句轮换
  applyDesktopPrefs();       // 托盘常驻 / 开机启动偏好同步给外壳

  /* 首启**不再**自动弹任何东西。要看导入流程，侧栏「导入指引」一直都在。
     理由很实在：自动弹窗一旦被忽略，用户就会面对一个「点不动」的页面，
     而且完全不知道原因。给内容比给弹窗重要。 */
}

/** 启动入口：开箱即进工作台，没有密码页。 */
function initLogin() { enterApp(); }

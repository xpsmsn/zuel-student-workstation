/* ════════════════════════════════════════════════════════════════════════
   shell/page-registry.js —— 页面注册表（L3 shell）
   ────────────────────────────────────────────────────────────────────────
   全应用有哪些页面、每页归哪个导航组、要不要有数据才能看，
   全部在这一个文件里声明完毕。

   ── 为什么单独一个文件，而不是让每个页面自己注册 ──────────────────────
   两种做法都可行，各有取舍，这里选了集中声明：

     A. 分散注册：每个页面模块自己 K.registerPage(...)
        好处：加页面不用碰这个文件。
        代价：要读遍所有模块文件才知道应用有哪些页面；
              而「应用有哪些页面」恰恰是最常被问的问题。

     B. 集中声明（选它）：一张表看全所有页面。
        代价是加页面要在这里加一行 —— 但换来的是：
          · 一眼看到全部页面、导航结构、以及**谁没数据就不能看**
          · 能写出断言（tests/test-pages.js）防止页面被误删
          · 页面多起来时，按钮/快捷键/搜索都能直接遍历这张表

   对一个「页面清单本身就是产品说明书」的工具来说，B 更值。
   真要拆成大系统，改成 A 只是一次局部替换。

   ── 字段 ──────────────────────────────────────────────────────────────
     id        路由标识 = S.view 的取值。**一旦有用户用过就永久冻结**
     title     页面标题（面包屑 / 页面导览 / 无障碍标签）
     icon      侧栏图标 key，对应 app-shell.js 的 SIDE_ICONS
     nav       导航分组，对应 K.NAV_GROUPS
     order     同组内排序，小的在前
     needsData 是否需要先导入学生数据。
               false 的页面（导入指引、内容库、校历…）在零数据时也要能打开 ——
               这在重构前是靠「在 if 链里排得够靠前」实现的，
               而那是一种谁也看不出意图的隐式约定。
     badge     () => number|null    侧栏右侧徽标（人数等），不提供就不显示
     disabled  () => string|null    返回原因字符串则置灰并提示；不提供就永远可点
     isActive  () => bool            自定义高亮判定（用于「其实是同一个页」的视图）
     hideNav   true = 不在侧栏出现（只从别处跳进来的二级页）
   ════════════════════════════════════════════════════════════════════════ */

/* ── 总览 ── */
K.registerPage({ id:'dashboard', title:'数据总览', icon:'dashboard', nav:'main', order:10,
  needsData:true, render: renderDashboard, goto: gotoDashboard });

K.registerPage({ id:'list', title:'全部学生', icon:'students', nav:'main', order:20,
  needsData:true, render: renderList, goto: gotoList,
  /* 「全部学生」的高亮条件比「S.view==='list'」严：
     选了某个班级、或用了某个关注视图时，高亮的应该是那一条，不是这一条。
     这个判定属于「这个条目是谁」，所以跟它放在一起，而不是留在侧栏里。 */
  isActive: () => S.view==='list' && S.classFilter==='all' && S.quickView==='all',
  badge: () => S.students.length });

K.registerPage({ id:'dorm', title:'宿舍看板', icon:'dorm', nav:'main', order:30,
  needsData:true, render: renderDorm, goto: gotoDorm,
  badge: () => dormRoomCount(),
  /* 本批没有宿舍字段时置灰。不能点进去看一片空，
     更不能显示 0 —— 0 会被读成「这批学生都没宿舍」，那是错的。 */
  disabled: () => dormRoomCount() ? null : '本批数据未包含宿舍信息' });

/* ── 引导（常驻单条，不带分组标题）── */
K.registerPage({ id:'guide', title:'导入指引', icon:'compass', nav:'guide', order:0,
  needsData:false, render: renderGuide, goto: gotoGuide });

/* ── 常用工具 ── */
K.registerPage({ id:'nav', title:'校务导航', icon:'nav', nav:'work', order:10,
  needsData:false, render: renderNav, goto: gotoNav, tour:'nav' });

K.registerPage({ id:'tpl', title:'常用模板', icon:'filetext', nav:'work', order:20,
  needsData:false, render: renderTpl, goto: gotoTpl, tour:'tpl',
  badge: () => (S.templates||[]).length || '' });

K.registerPage({ id:'pol', title:'AI 助理', icon:'chat', nav:'work', order:30,
  needsData:false, render: renderAssistant, goto: gotoPol, tour:'pol' });

K.registerPage({ id:'cal', title:'校历作息', icon:'calendar', nav:'work', order:40,
  needsData:false, render: renderCalendar, goto: gotoCal, tour:'cal' });

K.registerPage({ id:'award', title:'奖学金评选', icon:'award', nav:'work', order:50,
  needsData:true, render: renderAward, goto: gotoAward, tour:'award',
  badge: () => (S.awards && Array.isArray(S.awards.students) && S.awards.students.length) || '' });

/* ── 系统 ── */
K.registerPage({ id:'settings', title:'系统设置', icon:'sliders', nav:'system', order:10,
  needsData:false, render: renderSettings, goto: gotoSettings });

K.registerPage({ id:'profile', title:'个人中心', icon:'user', nav:'system', order:20,
  needsData:false, render: renderProfile, goto: gotoProfile });

/* ── 二级页：不在侧栏出现，只从别处跳进来 ── */
K.registerPage({ id:'importlog', title:'导入历史', icon:'doc', nav:'system', order:90,
  needsData:false, render: renderImportLog, goto: gotoImportLog, hideNav:true });

K.registerPage({ id:'backuphistory', title:'备份历史', icon:'doc', nav:'system', order:91,
  needsData:false, render: renderBackupHistory, goto: gotoBackupHistory, hideNav:true });

/* ── 启动即校验：注册表本身有问题要立刻发现，不能等到某个页面点不开 ── */
K.selfCheck().forEach(p => console.error('[pages] ' + p));
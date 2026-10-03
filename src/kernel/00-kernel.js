/* ════════════════════════════════════════════════════════════════════════
   kernel/00-kernel.js —— 内核（Kernel）
   ────────────────────────────────────────────────────────────────────────
   全仓库**第一个**执行的模块，**不依赖任何其他模块**。

   它只提供四样东西，都是基础设施，不含任何业务：

     1. Registry  能力注册表：模块声明「我提供什么」，别人「按名字取用」
     2. Bus       事件总线：模块之间不互相调用，只发事件
     3. Pages    页面注册表：页面是**注册**出来的，不是 if 链分派的
     4. Lifecycle 生命周期：boot / ready / teardown 三个阶段钩子

   ── 为什么要有这一层 ───────────────────────────────────────────────────
   重构前的架构把「代码在文件里的物理位置」当成了依赖：
   `.module-order.json` 里的顺序 = 执行顺序，动一下就可能改坏时序。
   于是 `students` 被切成 6 个文件、`list` 切成 5 个，
   「移动 / 合并 / 分解一个模块」变成了一件危险的事。

   有了内核之后：
     · 顺序由 manifest.json 的依赖图**算**出来（拓扑排序），不由人排
     · 页面自己注册自己，router 变成查表 —— 加页面 = 加一个文件
     · 模块之间靠「取能力」和「发事件」说话，不靠「谁写在谁前面」

   这一层永远不变。业务怎么长，它就怎么承载。
   ════════════════════════════════════════════════════════════════════════ */

'use strict';

/* 冻结标记：产品内不改动存储键（ADR-0004） */
const STORE_KEY    = 'counselor_workstation_v2';
const STORE_KEY_V1 = 'counselor_workstation_v1';
/* 批次数量上限：超限时提示用户先删历史批次 */
const MAX_BATCHES = 20;

/* ── 内核命名空间 ──────────────────────────────────────────────────────
   所有内核能力挂在 K 上，业务代码一律通过 K.xxx 访问。
   好处：任何人都能 grep 出「内核提供了什么」，不用通读。 */
const K = {};

/* ══════════════════════════════════════════════════════════════════════
   1. Registry —— 能力注册表
   ──────────────────────────────────────────────────────────────────────
   用法：
     K.provide('store.save', save);          // 我提供「持久化保存」
     const fn = K.use('store.save');        // 别人按名字取用
     K.use('store.save');                    // 没提供就抛错（写错名字立刻发现）

   为什么不用「直接调函数」：直接调就得知道对方是谁、住在哪。
   按名字取用把「谁提供」和「谁使用」解耦 —— 这正是并行开发能成立的前提。
   ══════════════════════════════════════════════════════════════════════ */
K._caps = new Map();

/** 声明一个能力。同名重复注册 = 立刻报错（绝不允许静默覆盖）。 */
K.provide = function (name, value) {
  if (K._caps.has(name)) {
    throw new Error('[kernel] 能力被重复注册：' + name +
      '\n  两个模块都提供了同名能力。这在 JS 里会被静默覆盖，是并行开发最难查的坑。');
  }
  K._caps.set(name, value);
  return value;
};

/** 取一个能力。没提供就抛错并说明已知有哪些 —— 写错名字时能立刻定位。 */
K.use = function (name) {
  if (!K._caps.has(name)) {
    const known = [...K._caps.keys()].sort().join(', ');
    throw new Error('[kernel] 取不到能力：' + name +
      '\n  已注册的能力：' + (known || '（还没有）'));
  }
  return K._caps.get(name);
};

/** 有没有这个能力（可选依赖的探测用，不抛错）。 */
K.has = function (name) { return K._caps.has(name); };

/** 列出全部能力（调试与契约核对用）。 */
K.caps = function () { return [...K._caps.keys()].sort(); };

/* ══════════════════════════════════════════════════════════════════════
   2. Bus —— 事件总线
   ──────────────────────────────────────────────────────────────────────
   模块之间**不互相调用**。需要别的模块做事时发事件，让对方自己决定要不要响应。

   为什么这是重点：直接调用 A→B，A 的文件里看不出它依赖 B，
   改 A 会炸 B，而 A 的文件本身毫无线索 —— 这正是并行开发失控的原因。
   发事件则把「我要什么」和「谁来做」彻底分开。

   命名前缀约定（避免撞车）：
     data:     数据变化      data:students  data:batches  data:grades
     ui:       界面刷新      ui:rerender  ui:sidebar
     action:   用户动作      action:import-done
   ══════════════════════════════════════════════════════════════════════ */
K._handlers = new Map();

/** 订阅。返回取消订阅的函数（比要求调用方自己存 off 更难用错）。 */
K.on = function (evt, fn) {
  if (typeof fn !== 'function') throw new Error('[kernel] K.on 需要一个函数：' + evt);
  if (!K._handlers.has(evt)) K._handlers.set(evt, []);
  K._handlers.get(evt).push(fn);
  return function off() {
    const a = K._handlers.get(evt) || [];
    const i = a.indexOf(fn);
    if (i >= 0) a.splice(i, 1);
  };
};

/**
 * 发事件。某个订阅者抛错**不会**影响其他订阅者，也不会中断发事件方 ——
 * 一个页面出错不该让整个界面卡住。错误照样报到控制台。
 */
K.emit = function (evt, payload) {
  const a = K._handlers.get(evt);
  if (!a || !a.length) return 0;
  // 复制一份：订阅者在回调里退订时不会打乱正在进行的这一轮
  [...a].forEach(fn => {
    try { fn(payload); }
    catch (e) { console.error('[kernel] 事件处理者出错：' + evt, e); }
  });
  return a.length;
};

/** 某事件当前的订阅数（测试断言用）。 */
K.listenerCount = function (evt) { return (K._handlers.get(evt) || []).length; };

/* ══════════════════════════════════════════════════════════════════════
   3. Pages —— 页面注册表
   ──────────────────────────────────────────────────────────────────────
   重构前 renderMain() 是一条 13 分支的 if 链：
       if(S.view==='guide'){ renderGuide(); return; }
       if(S.view==='nav'){ renderTpl(); return; }      ← 加页面就得改这里
   每加一个页面要动两处（if 链 + 侧栏），且越加越乱。

   现在页面自己注册：
       K.registerPage({
         id: 'dorm', title: '宿舍看板', icon: 'dorm',
         nav: 'work', order: 30, render: renderDorm
       });
   router 只是查表。加页面 = 加一个模块文件，router 一行都不用动。

   字段说明：
     id      路由标识，也是 S.view 的取值
     title   页面标题（面包屑、页面导览、无障碍标签）
     render  渲染函数
     icon    侧栏图标 key（见 sideIco）
     nav     归属哪个导航分组，见 K.NAV_GROUPS
     order   同组内的排序，小的在前
     needsData 是否需要先有学生数据（false = 没数据也能打开）
     tur     页面导览的定位锚点（可选）
   ══════════════════════════════════════════════════════════════════════ */
K._pages = new Map();

/** 导航分组。侧栏按这个顺序渲染各组。
    v2.3（2026-10-03）重排：分组按「使用时手在哪儿」而不是「功能属于哪类」。

    改前：总览 / 常用工具（导航·模板·助理·校历·奖学金）/ 我的班级 / 关注视图 / 系统
    问题：
      · 「常用工具」是五类东西混在一起 —— 参考资料（导航、模板）、
        日常查询（校历）、业务功能（奖学金评选）性质完全不同
      · 名字叫「常用」，可奖学金评选一年只用几次，反而不常用
      · 每天真正点得最多的是「导入数据」，却只在顶栏

    改后：
      总览       看数据：总览 / 全部学生 / 宿舍看板
      日常       每天会用：导入指引 / 校历作息 / AI 助理
      业务       一学期几次：奖学金评选
      资料       偶尔查：校务导航 / 常用模板
      我的班级   按班找人
      关注视图   按情况找人
      系统       设置 / 个人中心
*/
K.NAV_GROUPS = [
  { id: 'main',     label: '总览' },
  { id: 'daily',    label: '日常' },
  { id: 'business', label: '业务' },
  { id: 'ref',      label: '资料' },
  { id: 'system',   label: '系统' },
];

K.registerPage = function (def) {
  if (!def || !def.id) throw new Error('[kernel] 注册页面必须给 id');
  if (typeof def.render !== 'function') throw new Error('[kernel] 页面 ' + def.id + ' 缺 render 函数');
  if (K._pages.has(def.id)) throw new Error('[kernel] 页面 id 重复：' + def.id);
  K._pages.set(def.id, Object.assign({
    title: def.id, icon: 'doc', nav: 'main', order: 50, needsData: true, hideNav: false, goto: null, tur: null
  }, def));
  return def.id;
};

K.page = function (id) { return K._pages.get(id) || null; };
K.pages = function () { return [...K._pages.values()]; };

/** 某导航分组下的页面（已按 order 排好，且已滤掉 hideNav 的二级页） */
K.pagesIn = function (group) {
  return K.pages()
    .filter(p => p.nav === group && !p.hideNav)
    .sort((a, b) => a.order - b.order);
};

/** 全部页面 id（契约断言用：防止页面被误删） */
K.pageIds = function () { return K.pages().map(p => p.id).sort(); };
/* ══════════════════════════════════════════════════════════════════════
   4. Lifecycle —— 生命周期
   ──────────────────────────────────────────────────────────────────────
   三个阶段，各自独立、互不依赖：

     def      声明期：模块被加载时同步执行（建表、挂能力）
     ready    就绪期：DOM 就绪后执行（首屏渲染、绑事件）
     teardown 拆卸期：清缓存、停定时器

   为什么分阶段：以前的启动逻辑散在 3 个 boot-*.js 文件里，
   「谁负责首屏渲染」要翻源码才知道。分阶段后顺序有明确契约。
   ══════════════════════════════════════════════════════════════════════ */
K._phases = { def: [], ready: [], teardown: [] };

K.onPhase = function (phase, fn) {
  if (!K._phases[phase]) throw new Error('[kernel] 未知阶段：' + phase);
  K._phases[phase].push(fn);
  return fn;
};
K.def    = fn => K.onPhase('def', fn);
K.ready  = fn => K.onPhase('ready', fn);
K.teardown = fn => K.onPhase('teardown', fn);

/** 跑一个阶段的全部钩子。单个钩子出错只记账，不中断（首屏宁可少画一块也不能白屏）。 */
K.runPhase = function (phase) {
  const list = K._phases[phase] || [];
  const errors = [];
  for (const fn of list) {
    try { fn(); }
    catch (e) { errors.push(e); console.error('[kernel] ' + phase + ' 阶段出错：', e); }
  }
  return { ran: list.length, errors };
};

/* ══════════════════════════════════════════════════════════════════════
   5. 内核自检
   ──────────────────────────────────────────────────────────────────────
   每次启动都跑一次。目的是：**内核坏了要在第一屏就炸出来**，
   而不是让某个页面莫名其妙空白、然后排查半小时。
   ══════════════════════════════════════════════════════════════════════ */
K.selfCheck = function () {
  const problems = [];
  if (STORE_KEY !== 'counselor_workstation_v2') problems.push('存储键被改了 —— 老用户数据会静默全丢');
  if (K.NAV_GROUPS.some(g => !g.id)) problems.push('导航分组缺 id');
  for (const p of K.pages()) {
    if (!K.NAV_GROUPS.some(g => g.id === p.nav)) problems.push('页面 ' + p.id + ' 归属了不存在的分组：' + p.nav);
    if (typeof p.render !== 'function') problems.push('页面 ' + p.id + ' 的 render 不是函数');
  }
  return problems;
};

/* 内核对外只暴露一个 K。业务模块不要各自往 window 上挂东西 ——
   挂到 window 的东西互相覆盖，是最难查的一类 bug。 */
if (typeof window !== 'undefined') window.K = K;

/* ══════════════════════════════════════════════════════════════════════
   6. 纯工具（无状态、无依赖）
   ────────────────────────────────────────────────────────────────────────
   只有真正**谁都能用、且谁都不依赖**的函数才配住在这里。
   判断标准：它是不是不碰 S、不碰 DOM、不碰任何业务概念？
     是 → 进内核（比如格式化时间）
     否 → 属于它所在的层，别往上塞

   之前 fmtDate 住在 modules/shell.js 里，可 core 层的 makeBatch 要用它 ——
   于是状态层反过来依赖了功能层，依赖图上凭空多出一条环。
   这类「放错位置」靠读代码很难发现，靠依赖图一眼就看见。
   ══════════════════════════════════════════════════════════════════════ */

/** 2026-10-03 14:25 —— 批次与导入历史的时间戳 */
function fmtDate() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 20261003 —— 拼「紧凑时间戳」文件名用
    ⚠️ 别和 modules/export.js 里那个 todayStr()（2026-10-03，带横杠）混用：
       两个函数历史上曾同名不同义，是最危险的一类「同名不同义」。
       这里刻意改名为 stampCompact，让编译器能查出来。 */
function stampCompact() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

/** 2026-10-03 —— 导出文件名用（带横杠，可读性好） */
function todayStr() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** HTML 转义。所有拼进 innerHTML 的用户数据都必须过这里。 */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** 按 id 取元素。全项目统一走这里，别处散着写 document.getElementById。 */
const $ = id => document.getElementById(id);

/**
 * 姓名统一入口。迎新系统（32 列）用的是「姓名1」，新系统（12 列）只有「姓名」——
 * 单一来源的批次里必然有一列为空，所以显示层统一取第一个非空值，
 * 否则从新系统导入的新学生会显示成空白姓名。
 */
function studentName(s) {
  if (!s) return '';
  return String(s['姓名1'] || s['姓名'] || '').trim();
}
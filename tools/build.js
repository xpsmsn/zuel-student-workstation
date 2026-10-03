// build.js —— 零依赖构建器：src/ → 中南大学生工作台.html
//
// 它同时是**架构门禁**。构建失败 = 架构被破坏，这是本项目最重要的一条性质：
// 架构规则不靠文档劝导，靠机器拦。
//
// ════════════════════════════════════════════════════════════════════════
// 职责（按顺序）
//   1. 读 manifest.json —— 模块的唯一真相源
//   2. 拓扑排序 —— **顺序由依赖图算出，不由人排**
//   3. 门禁：循环依赖 / 跨层越界 / 重复符号 / 悬空依赖 / 未声明依赖
//   4. 拼接 + 注入设计系统 + 注入版本号
//   5. 产物自检（script 块配对、模板占位、语法编译）
//   6. --verify：与 baseline 逐字节比对，不一致退出码 1
//
// 用法：
//   node tools/build.js            构建
//   node tools/build.js --verify   构建并与基线逐字节比对
//   node tools/build.js --quiet    只报结果，不列模块清单
// ════════════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, '中南大学生工作台.html');
const BASE = path.join(ROOT, 'baseline', '中南大学生工作台.baseline.html');
const VERIFY = process.argv.includes('--verify');
const QUIET = process.argv.includes('--quiet');
/* --fix-deps：用构建器自己的分析逻辑把实测依赖写回 manifest。
   为什么要有这个模式：deps 若靠人手维护，早晚会漏；而 deps 一漏，
   门禁 3 就开始喊，而「忽略它」比「补上它」更容易发生 ——
   那正是门禁失效的开始。所以让机器来写。
   ⚠️ 它只写 deps / routeDeps，不碰 id / layer / file —— 那些是人的判断。 */
const FIX_DEPS = process.argv.includes('--fix-deps');

const rd = p => fs.readFileSync(p, 'utf8');
const kb = n => (n / 1024).toFixed(0) + ' KB';
const fail = (title, lines) => {
  console.error(`\n[build] ✗ ${title}`);
  lines.slice(0, 25).forEach(l => console.error('       ' + l));
  if (lines.length > 25) console.error(`       … 另有 ${lines.length - 25} 行`);
  process.exit(1);
};

// ── 1. 读 manifest ────────────────────────────────────────────────────
const manifestPath = path.join(SRC, 'manifest.json');
if (!fs.existsSync(manifestPath)) fail('缺少 src/manifest.json', ['它是模块的唯一真相源（依赖、层级、页面）']);
const manifest = JSON.parse(rd(manifestPath));
const LAYERS = manifest.layers || {};         // { "L1 core": { rank: 1, desc: "…" } }
const mods = manifest.modules || [];
if (!mods.length) fail('manifest.json 里没有模块');

// 按 id 建索引，重复即报错
const byId = new Map();
for (const m of mods) {
  if (byId.has(m.id)) fail('manifest.json 里模块 id 重复', [m.id]);
  byId.set(m.id, m);
}
const rankOf = id => (LAYERS[(byId.get(id) || {}).layer] || {}).rank ?? 99;

/* 内核是**隐式全局**，任何模块都能直接用（就像 document / window 一样），
   所以不必写进每个模块的 deps —— 那样 manifest 会噪音爆炸。
   但它必须排第一，这是唯一的硬要求。
   ⚠️ 谁想改成"每个模块显式依赖内核"，只需删掉这个常量并把它加进 deps；
      两种做法都成立，这里选噪音小的那个。 */
const IMPLICIT = new Set(['kernel']);

/* 语言内建与浏览器全局：不参与依赖分析 */
const BUILTIN = new Set(['window','document','console','Object','Array','String','Number','Boolean','Math','JSON',
  'Date','Map','Set','WeakMap','Promise','RegExp','Error','Symbol','Proxy','Reflect','parseInt','parseFloat',
  'isNaN','isFinite','undefined','null','true','false','this','typeof','instanceof','new','function','return',
  'if','else','for','while','do','switch','case','break','continue','var','let','const','class','extends','super',
  'try','catch','finally','throw','void','delete','in','of','yield','async','await','static','get','set',
  'Intl','Uint8Array','ArrayBuffer','Blob','File','FileReader','localStorage','sessionStorage','navigator',
  'location','history','setTimeout','clearTimeout','setInterval','clearInterval','requestAnimationFrame',
  'cancelAnimationFrame','fetch','URL','URLSearchParams','TextEncoder','TextDecoder','atob','btoa',
  'alert','confirm','prompt','globalThis','arguments','eval','require','module','exports','XLSX','ResizeObserver',
  'matchMedia','Element','HTMLElement','Node','CSS','CustomEvent','Event','structuredClone','queueMicrotask',
  'AbortController','DOMParser','ClipboardItem','Option','FormData','Infinity','NaN','DOMRect','Image','CloseEvent']);

// ── 2. 拓扑排序：顺序由**加载期**依赖算出 ─────────────────────────────
//
//  这取代了重构前那份「.module-order.json 手工顺序」。差别是本质的：
//  手工顺序里「为什么 A 必须在 B 前面」没人说得清，一动就可能改坏时序。
//
//  ★ 关键：只对 orderDeps 做拓扑排序，不用全部 deps ──────────────────────
//    deps 是**运行时依赖**（A 的函数里调了 B 的函数）。JS 会给 function
//    声明提升，所以这类依赖与拼接顺序**完全无关** —— 排在前后都能跑。
//    实测：全仓库 633 个顶层符号里，真顺序约束只有十几条（见门禁 4）。
//
//    这就是「顺序无关」的全部秘密：不是代码变干净了，而是**排序只看
//    真正需要排序的那部分依赖**。于是模块可以自由移动、拆分、合并，
//    机器自己算出正确顺序 —— 不用人再小心翼翼地排列了。
function topoSort() {
  const state = new Map();                       // id → 0未访问 1访问中 2已完成
  const order = [];
  const problems = [];

  const visit = (id, stack) => {
    const st = state.get(id) || 0;
    if (st === 2) return;
    if (st === 1) {                               // 回边 → 加载期循环依赖
      const cyc = stack.slice(stack.indexOf(id)).concat(id);
      problems.push('加载期循环依赖: ' + cyc.join(' → '));
      return;
    }
    state.set(id, 1);
    const m = byId.get(id);
    for (const d of (m.orderDeps || [])) {
      if (!byId.has(d)) { problems.push(`悬空依赖: ${id} → ${d}（manifest 里没有这个模块）`); continue; }
      visit(d, stack.concat(id));
    }
    state.set(id, 2);
    order.push(id);
  };

  // 稳定起手：先按层级 rank，同层按 id 字典序 —— 保证同样输入产出同样产物
  [...mods].sort((a, b) => rankOf(a.id) - rankOf(b.id) || a.id.localeCompare(b.id)).forEach(m => visit(m.id, []));

  /* ── 入口模块排最后 ──────────────────────────────────────────────────
     boot() 会在加载期调用 renderSidebar / renderMain / startQuoteRotation…
     也就是**任何模块**的函数。所以它不是「依赖某个模块」，
     而是「依赖除自己之外的所有模块」—— 写成显式 deps 既啰嗦又会漏。

     manifest 里给它 `entry: true`，构建器就把它钉在最后一位。
     这比让人手写一条几十项的 orderDeps 可靠得多。 */
  const entries = mods.filter(m => m.entry).map(m => m.id);
  if (entries.length > 1) fail('只能有一个 entry 模块', entries);
  entries.forEach(eid => {
    const at = order.indexOf(eid);
    if (at >= 0) order.splice(at, 1);
    order.push(eid);
  });

  if (problems.length) fail('依赖图不合法', problems);
  return order;
}
const order = topoSort();

// ── 3. 门禁 ───────────────────────────────────────────────────────────
/** 顶层符号定义 */
function topLevelSymbols(code) {
  const out = [];
  const re = /^(?:function\s+([A-Za-z_$][\w$]*)|(?:const|let|var)\s+([A-Za-z_$][\w$]*)|class\s+([A-Za-z_$][\w$]*))/gm;
  let m;
  while ((m = re.exec(code)) !== null) out.push({ name: m[1] || m[2] || m[3], kind: m[1] ? 'function' : (m[3] ? 'class' : 'var') });
  return out;
}

const sources = {};
order.forEach(id => { sources[id] = rd(path.join(SRC, byId.get(id).file)); });

/** 剥掉注释与字符串字面量，避免注释里提到的词被当成引用 */
function stripNonCode(code) {
  // 行注释：不在字符串里的 // 之后一律丢掉
  //（先做注释，再做字符串 —— 反过来的话 URL 里的 // 会把后半行吃掉）
  let out = '', inStr = null;
  for (let i = 0; i < code.length; i++) {
    const c = code[i];
    if (inStr) {
      out += c;
      if (c === '\\') { out += code[++i] || ''; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { inStr = c; out += c; continue; }
    if (c === '/' && code[i + 1] === '/') { while (i < code.length && code[i] !== '\n') i++; out += '\n'; continue; }
    if (c === '/' && code[i + 1] === '*') { i += 2; while (i < code.length && !(code[i] === '*' && code[i + 1] === '/')) i++; i++; out += ' '; continue; }
    out += c;
  }
  return out;
}

/** 全部裸引用（去掉属性访问 a.b 里的 b），集合形式 */
function bareRefs(code) {
  const out = new Set();
  const re = /(?<![.\w$])([A-Za-z_$][\w$]*)/g;
  const s = stripNonCode(code);
  let m;
  while ((m = re.exec(s)) !== null) out.add(m[1]);
  return out;
}

/**
 * 同上，但额外排除「对象字面量的键」—— `focusTags: null` 里的 focusTags
 * 是 S 的一个属性名，不是对某个变量的引用。这类误报如果不排除，
 * 门禁就会一直喊「core 依赖了 students」，而实际并��有。
 */
function bareRefsNoKeys(code) {
  const s = stripNonCode(code);
  // 先把 `键:` 形式（前面是 { 或 , 且后面是 :）标记掉
  const masked = s.replace(/([{,\s])([A-Za-z_$][\w$]*)\s*:(?!:)/g, (m, p1, p2) => p1 + ' '.repeat(p2.length));
  const out = new Set();
  const re = /(?<![.\w$])([A-Za-z_$][\w$]*)/g;
  let m;
  while ((m = re.exec(masked)) !== null) out.add(m[1]);
  return out;
}

/**
 * 只扫**顶层**（不在任何函数体内）的 const/let 声明，找出初始化式里
 * 引用了别处顶层符号的那些 —— 这些是唯一真正的加载期顺序约束。
 *
 * 为什么要区分：函数声明会提升，A 调用 B 与顺序无关；
 * 但 const X = f() 里的 f() 会在加载那一刻执行，f 还没定义就是 TDZ 崩溃。
 *
 * ⚠️ 箭头函数体里的引用**不算**：
 *     const CAL_SRC = { year: () => CAL_IMG_YEAR };
 * 这里的 CAL_IMG_YEAR 要等到 CAL_SRC.year() 被调用才求值，
 * 加载期根本不读它 —— 早前的版本把它误报成顺序依赖，白修了一次。
 */
function loadTimeRefs(code) {
  const out = [];
  const lines = code.split('\n');
  let depth = 0, inBlock = false;
  for (const L of lines) {
    const t = L.trim();
    // 块注释
    if (!inBlock && t.startsWith('/*') && !t.includes('*/')) { inBlock = true; continue; }
    if (inBlock) { if (t.includes('*/')) inBlock = false; continue; }
    if (t.startsWith('//') || t.startsWith('*')) continue;

    if (depth === 0) {
      const m = t.match(/^(const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(.+?);?\s*$/);
      if (m) {
        const [, kind, name, init] = m;
        /* ── 只保留「加载期确定会求值」的部分 ──
           判据：顶层的括号里（数组/对象/函数调用的实参）在加载时就会求值；
           而**任何函数/箭头函数体内部**都要去掉 —— 它们是延迟执行的。

           为什么必须这么小心：以下三种都**不是**顺序约束，但都含别的符号
             const sideIco = k => `...${SIDE_ICONS[k]}...`   箭头，调用才求值
             let _dashAnimDone = false;   // renderDashboard 会重置   注释
             const CAL_SRC = { year: ()=>CAL_IMG_YEAR };        箭头，调用才求值
           早前的版本把这三条都误报成加载期依赖，白修了两次 ——
           门禁一旦喊狼来了，狼就真的来了。 */
        const eager = init
          .replace(/=>\s*(?:\{[\s\S]*?\}|[^,})\]]*)/g, '()=>{}')   // 箭头函数
          .replace(/function\s*\([^)]*\)\s*\{[\s\S]*?\}/g, 'function(){}');
        // ⚠️ 顺序要紧：先剥正则，再剥注释字符串。
        //    否则 /^\d{4}$/ 里的 d 会被当成对符号 d 的引用。
        const s = stripNonCode(stripRegexLiterals(eager));
        const re = /(?<![.\w$])([A-Za-z_$][\w$]*)/g;
        let r;
        while ((r = re.exec(s)) !== null) if (r[1] !== name) out.push({ kind, name, ref: r[1] });
      }
    }
    // 粗括号计数（够用：只关心"当前行是否在顶层"）
    depth += (L.match(/[{(\[]/g) || []).length - (L.match(/[}\)\]]/g) || []).length;
    if (depth < 0) depth = 0;
  }
  return out;
}

/**
 * 剥掉正则字面量。
 * `/^\d{4}-\d{2}$/` 里的 d 不是变量引用 —— 不剥的话门禁会报
 * 「引用了一个叫 d 的符号」，而 d 根本不存在。
 * 判定「这个 / 是正则还是除号」：看它前面是不是运算符/括号/逗号等；
 * 前面是标识符、数字或右括号的，那是除法。
 */
function stripRegexLiterals(code) {
  let out = '', inStr = null;
  for (let i = 0; i < code.length; i++) {
    const c = code[i];
    if (inStr) {
      out += c;
      if (c === '\\') { out += code[++i] || ''; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { inStr = c; out += c; continue; }
    if (c === '/' && !/[A-Za-z0-9_$)\]]\s*$/.test(code.slice(0, i))) {
      let j = i + 1, inClass = false;
      while (j < code.length) {
        const d = code[j];
        if (d === '\\') { j += 2; continue; }
        if (d === '[') inClass = true;
        else if (d === ']') inClass = false;
        else if (d === '/' && !inClass) break;
        j++;
      }
      i = j;                       // 内容整体跳过；末尾那个 / 留给下一轮
      continue;
    }
    out += c;
  }
  return out;
}

/** 位置 pos 是否落在正则字面量 /x../y 里 */
function gate1DuplicateSymbols() {
  const seen = new Map(), dup = [];
  order.forEach(id => {
    for (const s of topLevelSymbols(sources[id])) {
      if (seen.has(s.name)) dup.push(`${s.name.padEnd(26)} ${s.kind.padEnd(8)} ${seen.get(s.name)}  ↔  ${id}`);
      else seen.set(s.name, id);
    }
  });
  if (dup.length) fail(`边界校验失败：跨模块重复定义 ${dup.length} 处`, dup);
  return seen.size;
}

/* 门禁 2：分层方向
   ────────────────────────────────────────────────────────────────────────
   只允许「上层依赖下层」。反过来依赖会把地基和墙皮搅在一起 ——
   这正是重构前 core 反向依赖 17 个 feature 模块的病根：
 状态层要去调页面函数，于是「改一个勾选框」可能炸掉持久化层。

   例外只有一个，且必须显式声明：
     L3 路由层调用 L5 页面的 render 函数，是**设计如此**，不是违规。
     这类边要写在 routeDeps 里 —— 声明了就合法，不声明就报错。
     为什么要显式：路由确实该知道有哪些页面，但「碰巧用了某个
     feature 的内部函数」和「这是我要路由的页面」必须能区分开。
     前者是架构腐化，后者是设计。 */
function gate2LayerDirection() {
  const bad = [];
  const stale = [];        // manifest 里指向已删除模块的边
  order.forEach(id => {
    const r = rankOf(id), layer = byId.get(id).layer;
    const routeOk = new Set(byId.get(id).routeDeps || []);
    for (const d of (byId.get(id).deps || [])) {
      if (!byId.has(d)) { stale.push(`${id} → ${d}（deps）`); continue; }
      const dr = rankOf(d);
      if (dr <= r) continue;                        // 向下或同层：OK
      if (routeOk.has(d)) continue;                // 路由边：显式声明过，OK
      bad.push(`${id} (${layer}, rank ${r}) 依赖了更高层的 ${d} (${byId.get(d).layer}, rank ${dr})` +
        (routeOk.size ? ` — 若确为路由调用，请把它从 deps 移到 routeDeps` : ''));
    }
    for (const d of routeOk) if (!byId.has(d)) stale.push(`${id} → ${d}（routeDeps）`);
  });
  if (stale.length) {
    // 删模块忘了清引用 —— 报得很直白，但**不算分层违规**，可以一起修
    console.error(`\n[build] ⚠ manifest 里有 ${stale.length} 条边指向已不存在的模块：`);
    stale.slice(0, 10).forEach(l => console.error('       ' + l));
    console.error('       跑 node tools/build.js --fix-deps 清掉。\n');
  }
  if (bad.length) fail(`分层违规：${bad.length} 处反向依赖`, bad);
  return stale;
}

/* 门禁 3：未声明的**跨模块**依赖
   ────────────────────────────────────────────────────────────────────────
   模块实际用了别处的符号却没在 manifest 里声明 —— 构建期就能发现，
   不必等到「合并时被静默覆盖」。

   为什么只查跨层 / 跨域，不查全部：
     同层互相调用（core.02-persist 调 core.01-state 的 save 之类）
     在单文件产物里是**必然**的全局可见，声明它们只会制造噪音，
     让人对真正的告警脱敏。真正要拦的是「我以为不依赖，其实依赖了别的域」。

   判定规则：
     · 目标属于**同一个逻辑域**（同层）→ 放行
     · 目标是 kernel（IMPLICIT）→ 放行
     · 跨层 → 必须声明
   跨层的那些一旦漏了声明，就是分层腐化的开始，必须响。 */
function gate3UndeclaredDeps() {
  const owner = new Map();
  order.forEach(id => {
    for (const s of topLevelSymbols(sources[id])) if (!owner.has(s.name)) owner.set(s.name, id);
  });

  const problems = [];
  order.forEach(id => {
    const m = byId.get(id);
    const own = new Set(topLevelSymbols(sources[id]).map(s => s.name));
    // deps / routeDeps 存的是**模块 id**，符号名要先经 owner 才比得了
    const declared = new Set([...(m.deps || []), ...(m.routeDeps || []), ...IMPLICIT]);
    const myRank = rankOf(id);
    for (const n of bareRefsNoKeys(sources[id])) {
      if (own.has(n) || BUILTIN.has(n)) continue;
      const o = owner.get(n);                   // 这个符号属于哪个模块
      if (!o || o === id) continue;
      if (declared.has(o)) continue;             // ← 比模块 id，不是比符号名
      if (IMPLICIT.has(o)) continue;             // 内核是隐式全局
      if (rankOf(o) === myRank) continue;        // 同层放行
      problems.push(`${id}(${m.layer}) 用了 ${n}（属于 ${o}/${byId.get(o).layer}），但没在 deps 里声明`);
    }
  });
  if (problems.length) fail(`未声明的跨模块依赖 ${problems.length} 处：跑 node tools/analyze.js 看完整依赖图`, problems);
}

/* 门禁 4：加载期依赖（这条才是「顺序无关」的关键）
   ────────────────────────────────────────────────────────────────────────
   重构前的认知是「模块顺序 = 依赖」。实测把真相拆开看：

     · 633 个顶层符号里，**绝大多数是 function 声明**。JS 会给函数声明
       提升（hoisting），所以「A 调用 B」与拼接顺序**完全无关** ——
       这是运行时依赖，加载期不做任何解析。
     · 真正受顺序影响的只有 **const/let 的初始化式**：它在加载那一刻就求值，
       引用了还没初始化的符号会直接抛 TDZ 错误。

   所以正确做法不是「小心翼翼地排顺序」，而是：
     · 运行时依赖写进 deps，只用于**文档与门禁3**
     · 加载期依赖写进 orderDeps，它**才参与拓扑排序**

   这样一来，绝大多数模块在依赖图上是自由的 ——
   可以移动、可以拆分、可以合并，构建器会自己算出正确顺序。
   ──────────────────────────────────────────────────────────────────────── */
function gate4LoadTimeDeps() {
  const owner = new Map();
  order.forEach(id => {
    for (const s of topLevelSymbols(sources[id])) if (!owner.has(s.name)) owner.set(s.name, id);
  });
  const problems = [];
  const found = [];
  order.forEach(id => {
    for (const t of loadTimeRefs(sources[id])) {
      const o = owner.get(t.ref);
      if (!o || o === id) continue;
      // 内核恒排第一，声明它没有意义（它就是「第一」本身）
      if (IMPLICIT.has(o)) continue;
      const line = `${id} 的顶层 ${t.kind} ${t.name} 在加载期就引用了 ${t.ref}（属于 ${o}）`;
      found.push(line);
      const declared = new Set(byId.get(id).orderDeps || []);
      if (!declared.has(o)) problems.push(line + ` —— 缺 orderDeps 声明`);
    }
  });
  if (problems.length) fail(`加载期依赖未声明 ${problems.length} 处：把这些依赖写进 orderDeps（或跑 node tools/build.js --fix-deps）`, problems);
  return found;
}

const symbolCount = gate1DuplicateSymbols();
gate2LayerDirection();

/* --fix-deps：把实测依赖写回 manifest，然后重跑（此时应该全绿）。
   放在门禁 2 之后、门禁 3 之前 —— 门禁 2 是分层方向，那要人判断；
   deps 只是「谁用了谁」的事实陈述，机器自己说了算。 */
if (FIX_DEPS) {
  const owner0 = new Map();
  order.forEach(id => {
    for (const s of topLevelSymbols(sources[id])) if (!owner0.has(s.name)) owner0.set(s.name, id);
  });
  let changed = 0;
  order.forEach(id => {
    const m = byId.get(id);
    const own = new Set(topLevelSymbols(sources[id]).map(s => s.name));
    const found = new Set();
    for (const n of bareRefsNoKeys(sources[id])) {
      if (own.has(n) || BUILTIN.has(n)) continue;
      const o = owner0.get(n);
      if (o && o !== id) found.add(o);
    }
    found.delete('kernel');
    // 分层：向上的边属于 routeDeps（路由边），向下/同层属于 deps
    const all = [...found].sort();
    const up = all.filter(d => rankOf(d) > rankOf(id));
    const down = all.filter(d => rankOf(d) <= rankOf(id));
    if (JSON.stringify(m.deps || []) !== JSON.stringify(down) ||
        JSON.stringify(m.routeDeps || []) !== JSON.stringify(up)) changed++;
    m.deps = down;
    if (up.length) m.routeDeps = up; else delete m.routeDeps;
    /* orderDeps（加载期依赖）同样自动回填：它是「实测」而非判断。
       ⚠️ 只在 --fix-deps 时写，因为正常构建里这是门禁 4 要抓的违规。 */
    if (Array.isArray(m.orderDeps)) {
      const lt = new Set();
      const o2 = new Map();
      order.forEach(x => { for (const s of topLevelSymbols(sources[x])) if (!o2.has(s.name)) o2.set(s.name, x); });
      for (const t of loadTimeRefs(sources[id])) {
        const o = o2.get(t.ref);
        if (o && o !== id) lt.add(o);
      }
      lt.delete('kernel');                        // 内核永远排第一
      m.orderDeps = [...lt].sort();
    }
  });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`[build] --fix-deps：已回填 ${changed} 个模块的依赖（共 ${mods.length} 个）`);
  console.log('[build] 现在重跑一次不带 --fix-deps 的构建来确认全绿。\n');
}

gate3UndeclaredDeps();
const loadTimeDeps = gate4LoadTimeDeps();

// ── 4. 拼接 ───────────────────────────────────────────────────────────
const head = rd(path.join(SRC, 'shell.head.html'));
const tail = rd(path.join(SRC, 'shell.tail.html'));

const styleDir = path.join(SRC, 'styles');
let designCss = '';
if (fs.existsSync(styleDir)) {
  const cssFiles = fs.readdirSync(styleDir).filter(f => f.endsWith('.css')).sort();
  if (cssFiles.length) {
    designCss = '\n<style>\n/* ==== design system (src/styles) ==== */\n' +
      cssFiles.map(f => rd(path.join(styleDir, f))).join('\n') + '\n</style>\n';
  }
}
let headOut = head;
if (designCss) {
  const at = head.lastIndexOf('</style>');
  if (at < 0) fail('head 里找不到 </style>', ['无法注入设计系统']);
  headOut = head.slice(0, at + 8) + designCss + head.slice(at + 8);
}

// 带上模块边界标记：产物里能一眼看出某个函数属于哪个模块 —— 排查线上问题时非常有用
const bodies = order.map(id => {
  const m = byId.get(id);
  return `\n/* ═══ module: ${id}  [${m.layer}] ═══ */\n` + sources[id];
}).join('\n');

const ver = JSON.parse(rd(path.join(ROOT, 'app', 'src-tauri', 'tauri.conf.json'))).version;
const _d = new Date();
const today = `${_d.getFullYear()}-${String(_d.getMonth() + 1).padStart(2, '0')}-${String(_d.getDate()).padStart(2, '0')}`;
const bodyJoined = bodies.replace(/const APP_VER = '[^']*';/, `const APP_VER = 'v${ver} · ${today}';`);

let out = headOut + "\n" + bodyJoined + "\n" + tail;

// ── 5. 产物自检 ────────────────────────────────────────────────────────
const problems = [];
const openScripts = (out.match(/<script\b/g) || []).length;
const closeScripts = (out.match(/<\/script>/g) || []).length;
if (openScripts !== closeScripts) problems.push(`<script> 不配对：开 ${openScripts} / 闭 ${closeScripts}`);
if (/\{\{[^}]+\}\}/.test(out)) problems.push('存在未替换的模板占位 {{...}}');
if (!/APP_VER = 'v\d+\.\d+\.\d+/.test(out)) problems.push('APP_VER 未注入');
problems.forEach(p => console.error('[build] ✗ ' + p));
if (problems.length) process.exit(1);

const blocks = [...out.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)];
let bad = 0;
blocks.forEach((m, i) => {
  try { new vm.Script(m[1]); }
  catch (e) { bad++; console.error(`[build] ✗ script#${i} 语法错误：${e.message}`); }
});
if (bad) process.exit(1);

fs.writeFileSync(OUT, out, 'utf8');

// ── 6. 与基线逐字节比对 ────────────────────────────────────────────────
let verdict = '';
if (VERIFY && fs.existsSync(BASE)) {
  const base = fs.readFileSync(BASE);
  const now = Buffer.from(out, 'utf8');
  if (base.equals(now)) {
    verdict = `  ✓ 与基线逐字节一致（${kb(now.length)}）`;
  } else {
    const bl = base.toString('utf8').split(/\r\n|\n/), nl = out.split(/\r\n|\n/);
    let first = -1;
    for (let i = 0; i < Math.max(bl.length, nl.length); i++) if (bl[i] !== nl[i]) { first = i; break; }
    console.error(`\n[build] ✗ 与基线不一致：基线 ${bl.length} 行 / 产物 ${nl.length} 行`);
    if (first >= 0) {
      console.error(`     首个差异在第 ${first + 1} 行`);
      console.error(`     基线：${String(bl[first]).slice(0, 100)}`);
      console.error(`     产物：${String(nl[first]).slice(0, 100)}`);
    }
    process.exit(1);
  }
}

console.log(`[build] ${mods.length} 个模块 · ${symbolCount} 个顶层符号 · 拓扑排序通过`);
console.log(`[build] 四道门禁通过：无重复符号 · 分层方向正确 · 依赖全部声明 · ${loadTimeDeps.length} 条加载期依赖已声明`);
if (!QUIET) {
  const byLayer = {};
  order.forEach(id => { const l = byId.get(id).layer; (byLayer[l] = byLayer[l] || []).push(id); });
  Object.keys(byLayer).sort((a, b) => (LAYERS[a] || {}).rank - (LAYERS[b] || {}).rank).forEach(l => {
    console.log(`\n  ${l}  ${LAYERS[l] ? LAYERS[l].desc : ''}`);
    byLayer[l].forEach(id => {
      const n = sources[id].split('\n').length;
      const d = (byId.get(id).deps || []).length;
      const o = (byId.get(id).orderDeps || []).length;
      console.log(`    ${String(n).padStart(5)} 行  ${id.padEnd(24)} ${d ? 'deps ' + d : ''}${o ? '  order ' + o : ''}`);
    });
  });
  console.log('');
}
console.log(`[build] → ${path.basename(OUT)}  ${kb(out.length)}${verdict}`);
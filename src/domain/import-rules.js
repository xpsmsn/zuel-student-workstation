/* ════════════════════════════════════════════════════════════════════════
   domain/import-rules.js —— 导入铁律（纯函数，零 DOM 零全局依赖）
   ────────────────────────────────────────────────────────────────────────
   这一层是整个产品**最不该出错**的地方：它决定「合并导入会不会弄丢
   辅导员的备注、会不会把没导的列抹平、会不会静默删人」。

   为什么单独抽出来：这些规则原本埋在 doImport() 里，和界面代码缠在一起，
   只能靠端到端测试间接覆盖 —— 而端到端覆盖不到「CSV 内部合并」这种路径
   （v2.1.x 就是这样漏掉了：勾选排除在「新建批次」下完全无效，没人发现）。

   现在它是**纯函数**：不碰 DOM、不读全局、不写状态。
   于是 tests/test-domain.js 可以在 node 里直接逐条断言（见该文件）。

   ── 四条铁律 ──────────────────────────────────────────────────────────
     ① 备注永不覆盖      「备注（保密）」是辅导员写的，任何导入都不动它
     ② 空值不覆盖        新表某列空 ≠ 该生该列为空 —— 空只清不填，方向安全
     ③ 未出现的列保留    只覆盖本次表真实有的列
                         （★ 12 列新表按整行覆盖会一次抹掉旧表 22 个字段，
                            这是最容易丢数据的地方）
     ④ 不静默删除 + 可回溯  本次表没出现的学生保留并点名

   ── 为什么写在最前面 ───────────────────────────────────────────────────
   这个文件是全仓库业务逻辑里「最像数学」的部分：纯、确定、可穷举。
   它值得拥有最好的可读性。
   ════════════════════════════════════════════════════════════════════════ */

/* 辅导员备注的列名（铁律①的唯一权威定义，别处一律引用这里） */
const REMARK_COL = '备注（保密）';

/**
 * 按列合并一行到已有记录 —— 铁律①②③的**唯一实现处**。
 *
 * 三条导入路径（新建批次内的 CSV 内去重 / 新增合并 / 覆盖当前批次）
 * 全部走这一个函数。这不是洁癖：v2.1.x 由 code review 发现这形状
 * 曾被复制成两份并**已经漂移** —— 其中一份少了铁律③，于是某条路径上
 * 「不在本次列清单里的列」会被悄悄改写。复制体一旦漂移，铁律就会在
 * 其中一条路上静默失效，而测试还全绿。
 *
 * @param {object} old    已有学生记录（**原地修改**，返回同一引用）
 * @param {object} r      本次表里的一行（已归一）
 * @param {string[]|null} cols 本次表真实出现的列；null/空 = 不知道列清单，不按③过滤
 * @returns {object} old
 */
function mergeRowIntoImpl(old, r, cols) {
  Object.entries(r).forEach(([k, v]) => {
    if (k === REMARK_COL) return;                  // 铁律①：备注永不覆盖
    if (v == null || v === '') return;             // 铁律②：空值不覆盖
    if (cols && cols.indexOf(k) === -1) return;    // 铁律③：不在本次表里的列不动
    old[k] = v;
  });
  return old;
}

/**
 * 按学号把一批行并进已有记录（CSV 内部同学号去重也走这里）。
 * 同一学号出现多次时，**首次出现**的那条为准，后面的行按铁律补空缺。
 *
 * @param {object[]} oldList 已有学生记录
 * @param {object[]} rows    本次表的行
 * @param {string[]|null} cols
 * @returns { list, matched, added }  —— list 是合并后的完整数组
 *          matched = 命中已有记录的��；added = 新学号追加的条数
 */
function mergeRowsByIdImpl(oldList, rows, cols) {
  const byId = new Map();
  const list = [];
  for (const s of oldList || []) {
    const id = String(s['学号'] == null ? '' : s['学号']).trim();
    list.push(s);
    if (id && !byId.has(id)) byId.set(id, s);
  }
  let matched = 0, added = 0;
  for (const r of rows || []) {
    const id = String(r['学号'] == null ? '' : r['学号']).trim();
    if (id && byId.has(id)) { mergeRowIntoImpl(byId.get(id), r, cols); matched++; }
    else {
      // 新学生：先按铁律起一份骨架，再按列补全
      const rec = {};
      mergeRowIntoImpl(rec, r, cols);
      rec['学号'] = r['学号'];
      list.push(rec);
      if (id) byId.set(id, rec);
      added++;
    }
  }
  return { list, matched, added };
}

/**
 * 剔除勾选排除的字段。「学号」是合并主键，**永远保留** ——
 * 防止有人把学号也勾进排除集，那样导入出来的人全都并不到旧档上。
 *
 * ⚠️ 每条导入路径都必须走到它。原实现里只有 doImportMerge 调，
 * 而「新建批次」分支在它之前就 return 了 —— 于是同一个勾选框在
 * 「新建批次」下完全无效，而当时的测试恰好没走过那条真实路径。
 *
 * @param {object[]} rows
 * @param {string[]} cols
 * @param {Set<string>|string[]} skip 用户取消勾选的字段
 */
function filterSkippedColsImpl(rows, cols, skip) {
  const set = skip instanceof Set ? new Set(skip) : new Set(skip || []);
  set.delete('学号');                             // 主键强制保留：不能被排除掉
  if (!set.size) {
    // 没有任何排除项（或排除的只有学号）→ 原样返回，但列清单要确保含学号
    return { rows, cols: (cols || []).includes('学号') ? cols : (cols || []).concat(['学号']) };
  }
  return {
    rows: rows.map(r => {
      const o = {};
      Object.entries(r).forEach(([k, v]) => { if (!set.has(k)) o[k] = v; });
      // 铁律：学号必须回到行里，否则下游按学号匹配会全线失配
      if (!('学号' in o) && ('学号' in r)) o['学号'] = r['学号'];
      return o;
    }),
    cols: (cols || []).filter(c => !set.has(c))
  };
}

/**
 * 铁律④的支撑：算出「本次表里没出现、但批次里已有」的学生。
 * 这些人不删除，只是点名 —— 界面必须能列出他们。
 */
function unmatchedStudentsImpl(oldList, rows) {
  const inThis = new Set((rows || [])
    .map(r => String(r['学号'] == null ? '' : r['学号']).trim())
    .filter(Boolean));
  return (oldList || [])
    .filter(s => {
      const id = String(s['学号'] == null ? '' : s['学号']).trim();
      return id && !inThis.has(id);
    })
    .map(s => ({ 学号: s['学号'], 姓名: studentName(s) }));
}

/**
 * 导出行去重：同一学号只留一条。
 * 新建批次与覆盖模式都会用到 —— 源表本身可能有重复行（同一学号两行）。
 */
function dedupeByIdImpl(list) {
  const seen = new Set(), out = [];
  let dropped = 0;
  for (const s of list || []) {
    const id = String(s['学号'] == null ? '' : s['学号']).trim();
    if (!id) { out.push(s); continue; }           // 没学号的行保留（异常行会另外点名）
    if (seen.has(id)) { dropped++; continue; }
    seen.add(id);
    out.push(s);
  }
  return { list: out, dropped };
}
/* ══════════════════════════════════════════════════════════════════════
   对外别名
   ────────────────────────────────────────────────────────────────────────
   这一层是纯函数，**不依赖内核**（内核是给有状态的东西用的）。
   代价是它会进入全局作用域，所以导出名统一带 domain 前缀 ——
   既保证唯一（构建器会查重复），又保留可读性。

   放在文件末尾：上面的 const 别名会踩 TDZ（声明必须在函数之后）。
   ══════════════════════════════════════════════════════════════════════ */
const domainMergeRowInto  = mergeRowIntoImpl;
const domainFilterSkipped = filterSkippedColsImpl;
const domainMergeRowsById = mergeRowsByIdImpl;
const domainUnmatched     = unmatchedStudentsImpl;
const domainDedupeById    = dedupeByIdImpl;

/* ══════════════════════════════════════════════════════════════════════
   数据聚合（纯函数）
   ────────────────────────────────────────────────────────────────────────
   同样住进 domain 层：它不认识界面，只认识「一组记录 + 一个字段名」。
   原先住在 core/04-kit-2.js（一个只有 14 行、名字叫「-2」的碎片）。
   ══════════════════════════════════════════════════════════════════════ */

/**
 * 按某字段分组计数，降序返回 [{label, value}]。
 * @param {object[]} list
 * @param {string} key
 * @param {object} [opts]  skipEmpty / emptyLabel 见下方说明
 *        skipEmpty=true 时**直接跳过**空值（而不是归到「未填写」）——
 *        这个区别很重要：看板要「有值的人分布」时，空值不该占一格。
 */
function groupCountImpl(list, key, opts = {}) {
  const m = new Map();
  (list || []).forEach(s => {
    let v = s[key];
    if (v == null || v === '') { if (opts.skipEmpty) return; v = opts.emptyLabel || '未填写'; }
    else v = String(v);
    m.set(v, (m.get(v) || 0) + 1);
  });
  const arr = [...m.entries()].map(([label, value]) => ({ label, value }));
  arr.sort((a, b) => b.value - a.value);
  return arr;
}

/* ⚠️ 例外：groupCount 是看板到处都在用的通用纯函数，改名要动几十个调用点，
   收益抵不上成本。它在 core/04-kit-2.js 里住了很久，且门禁 1 守着「只有一处定义」，
   所以直接以原名导出 —— 命名上的小妥协，换来几十处调用点不必动。 */
const groupCount = groupCountImpl;

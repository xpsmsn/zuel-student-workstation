/* v2.4.6 · 多级排序回归测试
   背景（用户 2026-10-11）：「我先按成绩排序，然后再点专业，成绩的排序依然保留吗？」
   → 期望「新排序叠加到旧排序上」：新点的列变主键，之前的列自动降为次级键；
     每一级可以单独放弃（点掉那一级），两个页面行为一致。

   覆盖：
   ① 学生列表页 —— sortStack/sortSync/setSort/sortList/sortInd/sortLabel/clearSort
      · 多级叠加、同列再点只翻自己方向且不动位置、最多 3 级、清空、旧 {key,dir} 兼容
   ② 奖学金页 —— awardSortBy/awardSortDrop + awardFiltered 内联的多级比较
      · 多级叠加、逐级放弃、放弃光了回到不排序

   用法: node .build/test/test-multisort.js 中南大学生工作台.html */
const fs = require('fs'), vm = require('vm'), path = require('path');
const html = fs.readFileSync(process.argv[2], 'utf8');

let failN = 0;
const fail = m => { console.error('  ✗ ' + m); failN++; };
const pass = m => console.log('  ✓ ' + m);
const eq = (a, b, label) => {
  if (JSON.stringify(a) === JSON.stringify(b)) pass(`${label} = ${JSON.stringify(a)}`);
  else fail(`${label}：期望 ${JSON.stringify(b)}，实得 ${JSON.stringify(a)}`);
};
const ok = (c, label) => c ? pass(label) : fail(label);
const has = (hay, needle, label) => ok(String(hay).indexOf(needle) >= 0, `${label}（应含 ${needle}）`);

/* ── 1. 静态门禁 ── */
const gates = [
  [/function\s+sortStack\s*\(/, '存在 sortStack() 排序链读取'],
  [/function\s+sortSync\s*\(/, '存在 sortSync() 主键镜像'],
  [/const\s+SORT_MAX\s*=\s*\d+/, '存在 SORT_MAX 级数上限'],
  [/S\.sort\s*=\s*\{\s*key\s*:'',\s*dir\s*:'desc',\s*stack:\s*\[\s*\]\s*\}/, '启动时排序状态带 stack:[]'],
  [/function\s+awardSortDrop\s*\(/, '存在 awardSortDrop() 逐级放弃'],
  [/function\s+awardSortClear\s*\(/, '存在 awardSortClear() 恢复默认'],
  [/class="aw-sort-lv"/, '排序链标签渲染出来了'],
  [/\.aw-sort-lv\{/, '排序链标签有 CSS 定义（防死类名）'],
  [/aw-sort-no/, '多级时显示第几级'],
];
for (const [re, name] of gates) { if (re.test(html)) pass(name); else fail(name); }

/* ── 2. 沙盒骨架 ── */
function el() {
  return {
    innerHTML: '', textContent: '', value: '', placeholder: '', checked: false,
    offsetWidth: 0, clientWidth: 0, style: {}, dataset: {}, result: '',
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    setAttribute() {}, removeAttribute() {}, getAttribute() { return null; },
    appendChild() {}, click() {}, scrollTo() {}, focus() {}, select() {}, closest() { return null; },
    querySelector() { return null; }, querySelectorAll() { return []; },
    addEventListener() {}, removeEventListener() {},
  };
}
const store = new Map();
const sandbox = {
  console, setTimeout, clearTimeout,
  setInterval: () => 0, clearInterval: () => {},
  document: {
    getElementById: (id) => { const e = el(); e.id = id; return e; },
    querySelector: () => el(), querySelectorAll: () => [],
    createElement: () => el(), addEventListener() {},
    documentElement: { setAttribute() {}, removeAttribute() {}, getAttribute() { return null; } },
  },
  localStorage: {
    getItem: k => store.has(k) ? store.get(k) : null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  },
  location: { reload() {} },
  confirm: () => true, prompt: () => null, alert: () => {},
  FileReader: function () {}, Blob: function () {},
  URL: { createObjectURL: () => '' },
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }),
  ResizeObserver: function () { this.observe = () => {}; this.disconnect = () => {}; },
  navigator: { userAgent: 'node' },
  TextEncoder, TextDecoder,
};
sandbox.window = sandbox;
vm.createContext(sandbox);

/* ── 3. 载入主逻辑 + 抽函数 ── */
const blocks = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
const appSrc = blocks.filter(s => s.includes('function doImport')).sort((a, b) => b.length - a.length)[0];
if (!appSrc) { console.error('找不到主逻辑 script 块'); process.exit(1); }

/* 花括号/方括号配平抽取（跳过字符串里的括号） */
function pickBlock(src, re) {
  const m = re.exec(src);
  if (!m) throw new Error('找不到 ' + re);
  let depth = 0, i = m.index + m[0].length - 1, opened = false;
  const open = src[i];
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      const q = ch; i++;
      while (i < src.length && src[i] !== q) { if (src[i] === '\\') i += 2; else i++; }
      continue;
    }
    if (ch === open) { depth++; opened = true; }
    else if (ch === (open === '{' ? '}' : ']')) { depth--; if (opened && depth === 0) break; }
  }
  return src.slice(m.index, i + 1);
}
const pickFn = (name) => pickBlock(appSrc, new RegExp('function\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{'));
const pickObj = (name) => pickBlock(appSrc, new RegExp('const\\s+' + name + '\\s*=\\s*\\{'));

/* (A) 学生列表页 */
const listFns = ['sortStack', 'sortSync', 'sortValue', 'sortList', 'setSort', 'sortInd', 'sortLabel', 'clearSort', 'studentName'];
const listSrc = `
var S = { sort:{ key:'', dir:'desc', stack:[] }, students:[] };
function renderMain(){}
function toast(){}
var GRADE_MAP = {
  '2024001': { '加权平均成绩': 88 },
  '2024002': { '加权平均成绩': 90 },
  '2024003': { '加权平均成绩': 70 },
  '2024004': { '加权平均成绩': 80 }
};
function gradeOf(s){ return GRADE_MAP[String(s && s['学号'])] || null; }
function gNum(rec, key){ const n = parseFloat(rec && rec[key]); return isNaN(n) ? NaN : n; }
var COL_LABELS = { '成绩':'成绩', '班级':'班级', '姓名':'姓名', '学号':'学号', '专业':'专业' };
function colMeta(k){ return { key:k, label: COL_LABELS[k] || String(k) }; }
const SORT_MAX = ${(appSrc.match(/const\s+SORT_MAX\s*=\s*(\d+)/) || [])[1] || 3};
${pickObj('NUM_SORT_KEYS')}
${listFns.map(pickFn).join('\n')}
__listExports = { sortStack, sortSync, sortValue, sortList, setSort, sortInd, sortLabel, clearSort, S, SORT_MAX };
`;
try { vm.runInContext(listSrc, sandbox); }
catch (e) { console.error('  ⚠ 列表页沙盒启动失败: ' + e.message); process.exit(1); }
const L = sandbox.__listExports;

const students = [
  { '学号': '2024001', '姓名': '甲', '班级': '金融2401' },
  { '学号': '2024002', '姓名': '乙', '班级': '会计2401' },
  { '学号': '2024003', '姓名': '丙', '班级': '会计2401' },
  { '学号': '2024004', '姓名': '丁', '班级': '金融2401' },
  { '学号': '2024005', '姓名': '戊', '班级': '金融2401' },   // 没成绩 —— 必须恒沉底
];
const names = (arr) => arr.map(s => s['姓名']).join(',');
const resetList = () => { L.S.sort = { key: '', dir: 'desc', stack: [] }; };

console.log('\n[1] 学生列表页 · 单级排序（基线行为不变）');
resetList();
L.setSort('成绩');
eq(names(L.sortList(students)), '乙,甲,丁,丙,戊', '成绩降序，没成绩的沉底');
eq(L.S.sort.key, '成绩', 'S.sort.key 镜像主键（旧代码仍读它）');
eq(L.S.sort.dir, 'desc', '成绩默认降序');

console.log('\n[2] 学生列表页 · 新排序叠加在旧排序上（本次核心需求）');
L.setSort('班级');
eq(L.S.sort.stack.map(x => x.key + x.dir), ['班级asc', '成绩desc'], '点班级 → 班级主键，成绩降为次级键仍保留');
eq(names(L.sortList(students)), '乙,丙,甲,丁,戊', '先按班级分组，组内仍按成绩降序');
eq(L.S.sort.key, '班级', '主键镜像是班级（次级键没被顶掉）');
has(L.sortInd('班级'), '↑①', '表头班级显示「↑①」');
has(L.sortInd('成绩'), '↓②', '表头成绩显示「↓②」（第 2 级）');
eq(L.sortLabel(), '班级↑ › 成绩↓', '排序链文案');

console.log('\n[3] 学生列表页 · 点已在链上的列只翻方向、不动位置');
L.setSort('班级');
eq(L.S.sort.stack.map(x => x.key + x.dir), ['班级desc', '成绩desc'], '班级翻成降序，仍在第 1 级');
eq(names(L.sortList(students)), '甲,丁,戊,乙,丙', '班级降序：金融组在前，组内成绩降序');
L.setSort('成绩');
eq(L.S.sort.stack.map(x => x.key + x.dir), ['班级desc', '成绩asc'], '成绩翻成升序，仍在第 2 级');
eq(names(L.sortList(students)), '丁,甲,戊,丙,乙', '组内成绩升序，没成绩的仍沉底');

console.log('\n[4] 学生列表页 · 最多 3 级 + 清空');
resetList();
L.setSort('成绩'); L.setSort('班级'); L.setSort('姓名'); L.setSort('学号');
eq(L.S.sort.stack.length, L.SORT_MAX, `叠到上限只保留 ${L.SORT_MAX} 级`);
eq(L.S.sort.stack.map(x => x.key), ['学号', '姓名', '班级'], '最旧的「成绩」被挤出去，新的顶在最前');
L.clearSort();
eq(L.S.sort.stack.length, 0, 'clearSort 清空排序链');
eq(names(L.sortList(students)), '甲,乙,丙,丁,戊', '清空后回到导入顺序');

console.log('\n[5] 学生列表页 · 旧存档 / 旧测试的 {key,dir} 形态仍兼容');
L.S.sort = { key: '成绩', dir: 'asc' };      // 没有 stack 字段
eq(L.sortStack().map(x => x.key + x.dir), ['成绩asc'], 'sortStack 兜底成单级');
eq(names(L.sortList(students)), '丙,丁,甲,乙,戊', '单级升序照常生效（空值恒沉底）');
L.setSort('班级');
eq(L.S.sort.stack.map(x => x.key + x.dir), ['班级asc', '成绩asc'], '从旧形态继续叠级也正常');

/* (B) 奖学金页 —— 复用 test-award-filter 的沙盒形态 */
console.log('\n[6] 奖学金页 · awardFiltered 内联多级排序');
const awardFns = ['passesExclusion', 'activeAwardCols', 'awardFiltered', 'awardRows',
  'unscientificNum', 'parseWishes', 'awardOf', 'awardLocked',
  'awardSortBy', 'awardSortDrop', 'awardSortClear'];
const awardSrc = `
var _awFilter = '';
var _awSel = new Set();
var _awSort = { key:'总成绩', dir:'desc', stack:[{ key:'总成绩', dir:'desc' }] };
function renderAward(){}
const AWARD_LIST = [{ key:'国家奖学金', name:'国家奖学金', exclusive:true, single:false, re:/国家奖学金/g }];
${pickBlock(appSrc, /const\s+AWARD_COLS\s*=\s*\[/)}
${awardFns.map(pickFn).join('\n')}
__awExports = { awardFiltered, awardSortBy, awardSortDrop, awardSortClear, _awSort: () => _awSort };
`;
try { vm.runInContext(awardSrc, sandbox); }
catch (e) { console.error('  ⚠ 奖学金页沙盒启动失败: ' + e.message); process.exit(1); }
const A = sandbox.__awExports;

const rawAward = [
  { '学号': '202425400001', '姓名1': '演示 01', '专业': '金融学', '总成绩': 88, '知识水平评价': 90, '志愿顺序': '1.国家奖学金' },
  { '学号': '202425400004', '姓名1': '演示 04', '专业': '第二学位经济学', '总成绩': 90, '知识水平评价': 92, '志愿顺序': '1.国家奖学金' },
  { '学号': '202425400005', '姓名1': '演示 05', '专业': '金融学', '总成绩': 76, '知识水平评价': 78, '志愿顺序': '1.国家奖学金' },
];
sandbox.S = {
  awardExclusion: { noTotal: true, manualSids: [] },
  awardColumns: { order: ['name', 'major', '总成绩'], hidden: [] },
  awardRows: rawAward,
  awardList: [{ key: '国家奖学金', name: '国家奖学金', exclusive: true, single: false }],
  AWARD_LIST: [{ key: '国家奖学金', name: '国家奖学金', exclusive: true, single: false }],
  students: [], awardExclusions: {}, awardQuota: {}, awardStatus: {}, batches: [],
};
const majors = (rows) => rows.map(r => r.major).join(',');
const scores = (rows) => rows.map(r => (r.总成绩 === '' ? '-' : String(r.总成绩))).join(',');

let rows = A.awardFiltered();
eq(scores(rows), '90,88,76', '出厂排序：总成绩降序');

A.awardSortBy('major');
eq(A._awSort().stack.map(x => x.key + x.dir), ['majordesc', '总成绩desc'], '点专业 → 专业主键，总成绩降为次级键仍保留');
rows = A.awardFiltered();
eq(majors(rows), '金融学,金融学,第二学位经济学', '先按专业分组');
eq(scores(rows), '88,76,90', '组内仍按总成绩降序（次级键生效）');

A.awardSortDrop('major');
eq(A._awSort().stack.map(x => x.key), ['总成绩'], '放弃「专业」这一级，只剩总成绩');
eq(scores(A.awardFiltered()), '90,88,76', '回到总成绩降序');

A.awardSortDrop('总成绩');
eq(A._awSort().stack.length, 0, '放弃光了 → 不排序');
eq(A._awSort().key, '', '不排序时主键镜像为空（表头不再显示箭头）');
eq(A.awardFiltered().length, 3, '不排序也照常出名单（只是按导入顺序）');

A.awardSortBy('总成绩');
eq(A._awSort().stack.map(x => x.key + x.dir), ['总成绩desc'], '从空链点一列 → 单级降序');
A.awardSortBy('总成绩');
eq(A._awSort().stack.map(x => x.key + x.dir), ['总成绩asc'], '同列再点 → 翻成升序');
A.awardSortClear();
eq(A._awSort().stack.map(x => x.key + x.dir), ['总成绩desc'], 'awardSortClear 恢复出厂')

/* ── 4. 结果 ── */
console.log('');
if (failN) { console.error(`❌ ${failN} 项失败`); process.exit(1); }
console.log('✅ 全部通过（多级排序）');

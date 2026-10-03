// extract.js — 一次性机械切分：把基线 HTML 拆成 shell.html + JS 模块
// ★ 铁律：只搬运，不改写。切出来的文件拼回去必须与基线逐字节一致（由 verify-identical.js 把关）
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BASE = path.join(ROOT, 'baseline', '中南大学生工作台.baseline.html');
const SRC = path.join(ROOT, 'src');

const html = fs.readFileSync(BASE, 'utf8');
const lines = html.split(/\r\n|\n/);   // 保持原始换行风格

// ── 1. 定位所有 script 块 ──
const blocks = [];
let inS = false, s0 = 0;
lines.forEach((ln, i) => {
  if (!inS && /<script\b[^>]*>/.test(ln)) { inS = true; s0 = i; }
  else if (inS && /<\/script>/.test(ln)) { inS = false; blocks.push({ s: s0, e: i }); }
});
console.log('[extract] script 块:', blocks.map(b => `${b.s + 1}..${b.e + 1}`).join('  '));

const main = blocks.slice().sort((a, b) => (b.e - b.s) - (a.e - a.s))[0];
const mainBody = lines.slice(main.s + 1, main.e);   // 主逻辑 JS（不含 <script> 标签）
console.log(`[extract] 主逻辑块 #${blocks.indexOf(main)}  行 ${main.s + 2}..${main.e}  (${mainBody.length} 行)`);

// 切点识别：顶层块注释里含分隔线（===== 或 -----）的，**标题可能在注释的第一行，
// 也可能在中间某一行**（多行注释形式：`/* =====\n   标题\n   ===== */`）。
// 所以：以 `/*` 开头的行起，向下最多看 5 行，取第一条"像标题"的行（不含分隔线、不太长）。
function cutTitleAt(mainBody, i) {
  if (!/^\/\*\s*[-=]{4,}/.test(mainBody[i])) return null;
  for (let k = i; k < Math.min(i + 5, mainBody.length); k++) {
    const ln = mainBody[k];
    if (ln.length > 160) break;
    if (/\*\/\s*$/.test(ln) && k > i) break;          // 注释已结束
    if (/^[^/*]*[★☆✓✗]|^[^/*]*[一二三四五六七八九十]、/.test(ln)) continue;  // 说明行，跳过
    const t = ln.replace(/^[/*\s]*/, '').replace(/[*=\-\s]*$/, '').trim();
    if (t && !/^[-=*\s]+$/.test(t) && t.length >= 2) return t.slice(0, 60);
  }
  return null;
}
const cuts = [];   // {i, title}  i = 段起始行号（0-based，指向注释行）
for (let i = 0; i < mainBody.length; i++) {
  const t = cutTitleAt(mainBody, i);
  if (t) cuts.push({ i, title: t });
}
console.log(`[extract] 发现 ${cuts.length} 个候选切点`);

// ── 3. 定义模块 → 段落映射（人工确认的边界）──
// key: 目标文件；match: 标题关键词（任一命中即归入）
const MODULES = [
  { key: 'core/01-state',       match: ['状态', '页面个性化', '新手引导', '内容库（v1.2）', '系统设置（v1.5）：', '个人中心（v1.3）', '运行偏好（v1.8）：', '批次助手'] },
  { key: 'core/02-persist',     match: ['持久化', '数据本地固化'] },
  { key: 'core/03-theme',       match: ['主题'] },
  { key: 'core/04-kit',         match: ['工具', '应用内确认框', '弹窗的键盘可用性', '撤销快照', '删除 ·', 'Toast', '数据聚合工具'] },
  { key: 'core/05-boot',        match: ['演示数据', '内容库预置', '内置图片资源', '演示成绩', '启动'] },
  { key: 'core/06-auth',        match: ['登录', '锁定'] },
  { key: 'modules/backup',      match: ['备份与恢复', '导入历史与复原', '备份历史'] },
  { key: 'modules/library',     match: ['内容库三页', '① 校务导航', '② 常用模板', '③ AI 助理', 'v1.9.6：常用模板', 'v1.9.8：表单模板', '备忘清单'] },
  { key: 'modules/settings',    match: ['数据安全提醒', '系统设置 · 学期与周次', 'v1.8 · 运行偏好', '设置 / 导出'] },
  { key: 'modules/calendar',    match: ['④ 校历作息'] },
  { key: 'modules/award',       match: ['⑥ 奖学金评选', '评选批次', '拟定 / 复核确认', '批量拟定', '渲染', '主区域'] },
  { key: 'modules/students',    match: ['导入', '字段分组', '字段别名表', '空值哨兵', 'v1.9.8：学生', 'v2.2（升级清单 C）', '导入指引', '积极分子名册', '从「整张表'] },
  { key: 'modules/import-detect', match: ['v1.9.2：找到', 'v1.9.2：认出'] },
  { key: 'modules/list',        match: ['列表视图', '列表列定义', '列设置', '筛选操作', '筛选', '批次管理', '视图路由', '数据计算', '视图', '排序', '自定义筛选'] },
  { key: 'modules/detail',      match: ['详情', '详情页编辑'] },
  { key: 'modules/multisheet',  match: ['多工作表'] },
  { key: 'modules/profile',     match: ['⑤ 辅导员个人中心'] },
  { key: 'modules/shell',       match: ['响应式', '侧栏', '我的班级', '侧栏抽屉', '顶栏'] },
  { key: 'modules/dashboard',   match: ['搜索：防抖', '总览页主体', '总览页', '筛选器', '卡片尺寸', '指标卡', '图表', '卡片包装器'] },
  { key: 'modules/charts',      match: ['图表：'] },
  { key: 'modules/onboarding',  match: ['分步实操向导', '金句库'] },
  { key: 'modules/dorm',        match: ['宿舍', '床位', 'dorm'] },
  { key: 'modules/export',      match: ['导出（公共部分', '导出 Excel', '自定义筛选'] },
];
const UNASSIGNED = 'misc/zz-unassigned';

function pickModule(title) {
  for (const m of MODULES) {
    if (m.match.some(k => title.includes(k))) return m.key;
  }
  return UNASSIGNED;
}

// 段 0：从行 0 到第一个切点
const bounds = [0, ...cuts.map(c => c.i), mainBody.length];
const segs = [];
for (let k = 0; k < bounds.length - 1; k++) {
  const from = bounds[k], to = bounds[k + 1];
  const title = k === 0 ? '启动入口' : cuts[k - 1].title;   // 段 k 的切点 = cuts[k-1]
  segs.push({ from, to, title, key: pickModule(title) });
}

/* ★ 关键：**只能合并相邻的同模块段**。
   若按模块名聚合全部段落，会把「A(X) B(Y) C(X)」重排成「A C | B」——
   而 JS 顶层代码有执行顺序依赖（const 初始化、IIFE、事件绑定…），重排就是灾难。
   所以这里走一遍「相邻同键合并」，保证输出顺序与原文**逐行一致**。 */
const merged = [];
for (const s of segs) {
  const last = merged[merged.length - 1];
  if (last && last.key === s.key) { last.to = s.to; last.titles.push(s.title); }
  else merged.push({ key: s.key, from: s.from, to: s.to, titles: [s.title] });
}

// ── 4. 写文件 ──
// 注意：只合并**相邻**同模块段，所以同一模块可能在原文里出现多次（中间夹着别的模块）。
// 这时必须另起文件名（key-2 / key-3），否则后写的会覆盖前面的 —— 拼接时同一份代码会被引用两次。
const written = [];
const used = new Map();
for (const b of merged) {
  const arr = mainBody.slice(b.from, b.to);
  if (!arr.length) continue;                       // 空块不产出文件（`''.split('\n').length===1` 会多出一个换行）
  const n = (used.get(b.key) || 0) + 1;
  used.set(b.key, n);
  const file = n === 1 ? b.key : b.key + '-' + n;
  const p = path.join(SRC, file + '.js');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, arr.join('\n'), 'utf8');
  written.push({ file, key: b.key, lines: arr.length, titles: b.titles });
}

// 头部（第一个 <script> 之前的一切，含开标签）与尾部（从 </script> 起）
const head = lines.slice(0, main.s + 1);
const tail = lines.slice(main.e);
fs.writeFileSync(path.join(SRC, 'shell.head.html'), head.join('\n'), 'utf8');
fs.writeFileSync(path.join(SRC, 'shell.tail.html'), tail.join('\n'), 'utf8');

console.log('\n[extract] 产出：');
written.forEach(w => console.log(`  ${String(w.lines).padStart(6)} 行  ${w.file}.js  ← ${w.titles.join(' / ').slice(0, 46)}`));
console.log(`  ${String(head.length).padStart(6)} 行  shell.head.html`);
console.log(`  ${String(tail.length).padStart(6)} 行  shell.tail.html`);

const total = written.reduce((a, w) => a + w.lines, 0);
console.log(`\n[extract] JS 合计 ${total} 行（主逻辑块 ${mainBody.length} 行）${total === mainBody.length ? '  ✓ 行数对得上' : '  ✗ 行数不符！'}`);

// 导出拼接顺序（= 模块在原文中的出现顺序）
fs.writeFileSync(path.join(SRC, '.module-order.json'),
  JSON.stringify(written.map(w => w.file), null, 2), 'utf8');
console.log('[extract] 拼接顺序已写入 src/.module-order.json（' + written.length + ' 个文件）');

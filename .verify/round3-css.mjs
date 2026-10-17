/* 第三轮 · 设计系统收敛（字号 / 字重 / 圆角 / 字体栈）
   用法:
     node .verify/round3-css.mjs            # 干跑：只统计与抽样，不写文件
     node .verify/round3-css.mjs --write    # 应用到原型
   目标（docs/design/视觉设计规范.md 第 5/6 条 + 评审 P2-1）：
     字号  13 / 15 / 18 / 24（四档字阶）+ 32（图标字形档）
     字重  400 / 600
     圆角  0 / 6 / 12（保留 50% 与 var() 令牌）
     字体栈 一份、不再包含永远加载不到的 Inter
*/
import fs from 'node:fs';

const FILE = '中南大学生工作台.html';
const WRITE = process.argv.includes('--write');
const before = fs.readFileSync(FILE, 'utf8');
let src = before;

const FS = { xs: 13, sm: 15, lg: 18, xl: 24, ico: 32 };
const tok = (n) => `var(--fs-${n === 13 ? 'xs' : n === 15 ? 'sm' : n === 18 ? 'lg' : n === 24 ? 'xl' : 'ico'})`;
const mapSize = (n) => (n < 14.2 ? FS.xs : n < 15.9 ? FS.sm : n < 20.9 ? FS.lg : FS.xl);

const stat = { size: new Map(), weight: new Map(), radius: new Map() };
const bump = (k, v) => { stat[k].set(v, (stat[k].get(v) || 0) + 1); };

/* ---- 1. 字号 → 四档令牌（>25px 先归一 24，字形档下面单独提回 32） ---- */
src = src.replace(/font-size\s*:\s*([0-9.]+)px/gi, (m0, v) => {
  const n = parseFloat(v);
  bump('size', v);
  return `font-size:${tok(mapSize(n))}`;
});

/* ---- 2. 字形档：图标 / 表情 / 头像字 —— 这是"图标多大"，不是字阶 ---- */
const iconTargets = [
  '.drop-ico{font-size:', '.empty-state .ico{font-size:', '.avatar-big',
];
const iconHits = [];
for (const needle of iconTargets) {
  const i = src.indexOf(needle);
  if (i < 0) { console.log(`  ! 找不到 ${needle}`); continue; }
  const seg = src.slice(i, i + 400).replace(/font-size:var\(--fs-(xs|sm|lg|xl)\)/, 'font-size:var(--fs-ico)');
  if (seg !== src.slice(i, i + 400)) iconHits.push(needle);
  src = src.slice(0, i) + seg + src.slice(i + 400);
}
const emojiBefore = src;
src = src.replace(/style="font-size:var\(--fs-xl\)"([^>]*)>🎉/g, 'style="font-size:var(--fs-ico)"$1>🎉')
  .replace(/style="font-size:var\(--fs-xl\);margin-bottom:8px"([^>]*)>✅/g, 'style="font-size:var(--fs-ico);margin-bottom:8px"$1>✅');
if (src !== emojiBefore) iconHits.push('表情 🎉/✅');

/* ---- 3. 字重 → 400 / 600 ---- */
src = src.replace(/font-weight\s*:\s*([0-9]+)(\s*!important)?/gi, (m0, v, imp) => {
  const from = parseInt(v, 10);
  const to = from <= 500 ? 400 : 600;
  if (from !== to) bump('weight', String(from));
  return `font-weight:${to}${imp ? ' !important' : ''}`;
});

/* ---- 4. 圆角 → 0 / 6 / 12（保留 50% / var()；四值分量逐个映射） ---- */
const mapR = (n) => (n === 0 ? 0 : n <= 9 ? 6 : n <= 20 ? 12 : 6);
const pad = '([0-9.]+)px';
src = src.replace(
  new RegExp(`border-radius\\s*:\\s*${pad}(?:\\s+${pad})?(?:\\s+${pad})?(?:\\s+${pad})?(\\s*!important)?`, 'gi'),
  (m0, a, b, c, d, imp) => {
    const parts = [a, b, c, d].filter((x) => x !== undefined);
    for (const p of parts) bump('radius', p);
    return `border-radius:${parts.map((p) => `${mapR(parseFloat(p))}px`).join(' ')}${imp || ''}`;
  });
// 「0 8px 8px 0」这类首值为无单位 0 的写法：分量映射漏掉第一个 0，单独收
src = src.replace(/border-radius:0 8px 8px 0/g, 'border-radius:0 var(--radius-btn) var(--radius-btn) 0');

/* ---- 5. 字体栈：一处定义，删掉永远加载不到的 Inter ---- */
const STACK = 'system-ui,-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif';
let stackFixes = 0;
src = src.replace(/--font-stack\s*:\s*[^;}]+/gi, () => { stackFixes++; return `--font-stack:${STACK}`; });
// body 与 notion 层各自的字面栈 → 统一引用令牌（多行的两条按行首特征定位）
src = src.replace(/font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;/g,
  () => { stackFixes++; return 'font-family:var(--font-stack);'; });
src = src.replace(/font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","HarmonyOS Sans SC","MiSans",\r?\n[^;]+;/g,
  () => { stackFixes++; return 'font-family:var(--font-stack);'; });
// 学号/电话这类「看着像号码的字段」恢复等宽（评审 P2-8）
src = src.replace(/table \.mono\{font-family:var\(--font-stack\);font-size:15px\}/,
  () => { stackFixes++; return 'table .mono{font-family:ui-monospace,Consolas,"Courier New",monospace;font-size:15px}'; });

/* ---- 6. 注入字号令牌（幂等） ---- */
if (!/--fs-xs\s*:/.test(src)) {
  const i = src.indexOf(':root{');
  if (i < 0) throw new Error('找不到 :root{');
  const at = src.indexOf('{', i) + 1;
  src = src.slice(0, at)
    + `\n  /* 第三轮字阶：只用这五档（四档字阶 + 一档图标字形） */\n  --fs-xs:${FS.xs}px; --fs-sm:${FS.sm}px; --fs-lg:${FS.lg}px; --fs-xl:${FS.xl}px; --fs-ico:${FS.ico}px;\n`
    + src.slice(at);
}

/* ---- 报告 ---- */
const count = (s, re) => {
  const m = new Map();
  for (const x of s.matchAll(re)) m.set(x[1], (m.get(x[1]) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
};
const sizeRe = /font-size\s*:\s*([^;"'}]+)/gi, weightRe = /font-weight\s*:\s*([^;"'}\s]+)/gi, radiusRe = /border-radius\s*:\s*([^;"'}]+)/gi;
const show = (name, b, a) => {
  console.log(`\n[${name}] ${b.length} 档 → ${a.length} 档`);
  console.log('  改前: ' + b.map(([k, n]) => `${k}×${n}`).join(' '));
  console.log('  改后: ' + a.map(([k, n]) => `${k}×${n}`).join(' '));
};
show('font-size', count(before, sizeRe), count(src, sizeRe));
show('font-weight', count(before, weightRe), count(src, weightRe));
show('border-radius', count(before, radiusRe), count(src, radiusRe));
console.log(`\n[字形档 32] ${iconHits.join(' / ') || '（未命中）'}`);
console.log(`[字体栈] 改写 ${stackFixes} 处`);
console.log(`\n明细·字号: ${[...stat.size].map(([k, n]) => `${k}×${n}`).join(' ')}`);
console.log(`明细·字重: ${[...stat.weight].map(([k, n]) => `${k}×${n}`).join(' ')}`);
console.log(`明细·圆角: ${[...stat.radius].map(([k, n]) => `${k}px×${n}`).join(' ')}`);

if (WRITE) { fs.writeFileSync(FILE, src); console.log(`\n已写入 ${FILE}：${before.length} → ${src.length} 字符`); }
else console.log('\n（干跑，未写文件；加 --write 应用）');

/* 设计系统普查：字号 / 字重 / 圆角 / 字体栈 / style 块
   用法: node .verify/survey-css.mjs [file]
   基线口径（评审 P2-1 / P2-3）：字号声明档数、字重取值种数、圆角取值种数、style 块数 */
import fs from 'node:fs';

const file = process.argv[2] || 'app/src/index.html';
const src = fs.readFileSync(file, 'utf8');

const tally = (re) => {
  const m = new Map();
  for (const x of src.matchAll(re)) m.set(x[1], (m.get(x[1]) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
};

const sizes = tally(/font-size\s*:\s*([0-9.]+)px/gi);
const weights = tally(/font-weight\s*:\s*([^;"'}\s]+)/gi);
const radii = tally(/border-radius\s*:\s*([^;"'}]+)/gi);
const fams = tally(/font-family\s*:\s*([^;"'}]+)/gi);
const svgSizes = tally(/font-size="([0-9.]+)"/g);
const blocks = [...src.matchAll(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi)]
  .map((m, i) => ({ i: i + 1, attr: m[1].trim(), lines: m[2].split('\n').length, chars: m[2].length }));
const scripts = [...src.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];

console.log(`对象: ${file}  ${src.length} 字节`);
console.log(`\n[style 块] ${blocks.length} 个`);
for (const b of blocks) console.log(`  #${b.i} ${String(b.lines).padStart(5)} 行 ${String(b.chars).padStart(7)} 字符  ${b.attr}`);
console.log(`\n[script 块] ${scripts.length} 个`);

const report = (name, list, unit = '') => {
  const nums = list.filter(([k]) => /^[0-9.]+/.test(k)).map(([k]) => parseFloat(k));
  console.log(`\n[${name}] ${list.length} 档（数值型 ${nums.length}）`);
  for (const [k, n] of list) console.log(`  ${String(k).padEnd(28)} ${String(n).padStart(4)}${unit}`);
};

report('font-size', sizes, ' 处');
console.log(`  → 数值档: ${[...new Set(sizes.filter(([k]) => /^[0-9.]+$/.test(k)).map(([k]) => k))].sort((a, b) => a - b).join(' / ')}`);
report('font-weight', weights, ' 处');
report('border-radius', radii, ' 处');
console.log(`\n[font-family] ${fams.length} 种`);
for (const [k, n] of fams) console.log(`  ${n} 处  ${k.slice(0, 110)}`);
if (svgSizes.length) {
  console.log(`\n[SVG 属性 font-size="N"] ${svgSizes.length} 档`);
  for (const [k, n] of svgSizes) console.log(`  ${k} ${n} 处`);
}
console.log(`\n[内联 font-size 在 style 属性里] ${(src.match(/style="[^"]*font-size\s*:/gi) || []).length} 处`);
console.log(`[内联 font-weight 在 style 属性里] ${(src.match(/style="[^"]*font-weight\s*:/gi) || []).length} 处`);
console.log(`[内联 border-radius 在 style 属性里] ${(src.match(/style="[^"]*border-radius\s*:/gi) || []).length} 处`);

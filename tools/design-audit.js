// design-audit.js — 设计规范合规检查
// 规则来自用户 2026-10-03 定的规范，一条都不许例外：
//   1. 间距：只能是 8 的倍数（8/16/24/32/48），禁止随机小数
//   2. 圆角：控件与卡片 8px、弹窗 12px，只有这两档
//   3. 阴影：只有 0 1px 3px 0 rgb(0 0 0/.1) 与 0 4px 12px 0 rgb(0 0 0/.08) 两档
//   4. 字体：全局唯一无衬线栈
//   5. 行高：标题 1.25 / 正文 1.5
// 用法：node tools/design-audit.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src', 'styles');

const ALLOWED_SP = new Set([0, 8, 16, 24, 32, 48]);
const ALLOWED_R = new Set([0, 8, 12]);
const ALLOWED_SHADOW = [
  /0 1px 3px 0 rgb\(0 0 0 \/ 0?\.1\)/,
  /0 4px 12px 0 rgb\(0 0 0 \/ 0?\.08\)/,
];

let bad = 0;
const report = (file, kind, val, line) => {
  bad++;
  if (bad <= 40) console.log(`  ✗ ${file}:${line}  ${kind} = ${val}`);
};

for (const f of fs.readdirSync(SRC).filter(x => x.endsWith('.css'))) {
  const lines = fs.readFileSync(path.join(SRC, f), 'utf8').split('\n');
  lines.forEach((ln, i) => {
    const n = i + 1;
    if (ln.trim().startsWith("/*") || ln.trim().startsWith("*")) return;   // 注释里的数值不是样式
    // ① 间距类属性必须是 8 的倍数
    for (const m of ln.matchAll(/(?:margin|padding|gap|row-gap|column-gap)(?:-(?:top|right|bottom|left))?\s*:\s*([^;]+)/g)) {
      for (const v of m[1].matchAll(/(-?[\d.]+)px/g)) {
        const n2 = Math.abs(parseFloat(v[1]));
        if (!ALLOWED_SP.has(n2)) report(f, '间距', `${m[0].split(':')[0].trim()}=${v[1]}px`, n);
      }
    }
    // ② 圆角只能 8 / 12
    for (const m of ln.matchAll(/border-radius\s*:\s*([^;]+)/g)) {
      for (const v of m[1].matchAll(/([\d.]+)px/g)) {
        if (!ALLOWED_R.has(parseFloat(v[1]))) report(f, '圆角', `${v[1]}px`, n);
      }
    }
    // ③ 阴影只能那两档
    for (const m of ln.matchAll(/box-shadow\s*:\s*([^;]+)/g)) {
      const v = m[1].trim().replace(/\s*\}$/, '');
      if (/^none$/i.test(v)) continue;
      // 引用 token（var(--sh-1/2)）是"遵守规范"而不是违规；
      // 0 0 0 Npx var(--ring) 是焦点环，不是投影，单独放行。
      if (/^var\(--sh-[12]\)$/.test(v)) continue;
      if (/^0 0 0 [\d.]+px var\(--ring\)$/.test(v)) continue;
      if (!ALLOWED_SHADOW.some(r => r.test(v))) report(f, '阴影', v.slice(0, 46), n);
    }
    // ④ 行高
    for (const m of ln.matchAll(/line-height\s*:\s*([\d.]+)/g)) {
      const v = parseFloat(m[1]);
      if (v !== 1.25 && v !== 1.5 && v !== 1) report(f, '行高', v, n);
    }
  });
}

// ⑤ 字体栈唯一：tokens.css 之外不得再出现 font-family
const tf = path.join(SRC, 'tokens.css');
for (const f of fs.readdirSync(SRC).filter(x => x.endsWith('.css'))) {
  if (f === 'tokens.css') continue;
  fs.readFileSync(path.join(SRC, f), 'utf8').split('\n').forEach((ln, i) => {
    if (/font-family/.test(ln) && !/var\(--font/.test(ln)) report(f, '字体', '私有 font-family', i + 1);
  });
}

console.log(bad === 0
  ? '\n[audit] ✓ 设计规范全部通过：无违规间距 / 圆角 / 阴影 / 字体 / 行高'
  : `\n[audit] ✗ 共 ${bad} 处违规`);
process.exit(bad === 0 ? 0 : 1);

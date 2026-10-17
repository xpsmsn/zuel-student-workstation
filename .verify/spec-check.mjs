// 第一轮整改「静态核验」：不需要浏览器，直接证明
// ① 新的 :focus-visible 规则优先级压过历史 12 处 outline:none
// ② 各主题令牌的 WCAG 对比度是否全部 >= 4.5
import { readFileSync, writeFileSync } from 'node:fs';

const html = readFileSync('app/src/index.html', 'utf8');

// ---------- ① 特异性核对 ----------
function stripComments(s) { return s.replace(/\/\*[\s\S]*?\*\//g, ''); }

function styleBlocks(src) {
  const out = [];
  const re = /<style([^>]*)>([\s\S]*?)<\/style>/g;
  let m;
  while ((m = re.exec(src))) {
    const idm = /id="([^"]+)"/.exec(m[1]);
    out.push({ id: idm ? idm[1] : '(anonymous)', css: stripComments(m[2]) });
  }
  return out;
}

function specificity(sel) {
  let s = sel;
  const groups = [];
  const take = (inner) => inner.split(',').map(t => specificity(t.trim()))
    .sort((a, b) => (b[0] - a[0]) || (b[1] - a[1]) || (b[2] - a[2]))[0];
  s = s.replace(/:not\(([^()]*)\)/g, (_, inner) => { groups.push(take(inner)); return ' '; });
  s = s.replace(/:is\(([^()]*)\)/g, (_, inner) => { groups.push(take(inner)); return ' '; });
  let a = 0, b = 0, c = 0;
  for (const g of groups) { a += g[0]; b += g[1]; c += g[2]; }
  const ids = (s.match(/#[\w-]+/g) || []).length;
  const classes = (s.match(/\.[\w-]+/g) || []).length;
  const attrs = (s.match(/\[[^\]]+\]/g) || []).length;
  const pseudos = (s.match(/(?<!:):[\w-]+(\([^)]*\))?/g) || []).length;
  const pseudoElems = (s.match(/::[\w-]+/g) || []).length;
  const elems = (s.replace(/#[\w-]+|\.[\w-]+|\[[^\]]+\]|(?<!:):[\w-]+(\([^)]*\))?|::[\w-]+/g, ' ')
    .match(/\b[a-zA-Z][\w-]*\b/g) || []).length;
  return [a + ids, b + classes + attrs + pseudos, c + elems + pseudoElems];
}
const cmp = (x, y) => (x[0] - y[0]) || (x[1] - y[1]) || (x[2] - y[2]);
const fmtSpec = (s) => `(${s.join(',')})`;

const offenderRules = [];
/* 白名单：自己人写的「outline:none 但用内阴影代替焦点环」的规则（tr/th/td），
   它们本来就是要压掉全局 outline 的，不算 offender。 */
const isInsetRingReplacement = (decl) => /box-shadow\s*:[^;]*inset[^;]*var\(--accent\)/i.test(decl)
  || /box-shadow\s*:[^;]*inset[^;]*#6cb0f2/i.test(decl);
const selfRules = [];
for (const blk of styleBlocks(html)) {
  const re = /([^{}@]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(blk.css))) {
    const sel = m[1].trim();
    const decl = m[2];
    if (/\boutline\s*:\s*(none|0)/.test(decl)) {
      const important = /outline\s*:\s*(none|0)[^;]*!important/.test(decl);
      const allowed = isInsetRingReplacement(decl);
      for (const one of sel.split(',')) {
        const t = one.trim();
        if (!t || t.startsWith('@') || t.includes('{')) continue;
        if (allowed) { selfRules.push({ styleId: blk.id, sel: t, spec: specificity(t), important }); continue; }
        offenderRules.push({ styleId: blk.id, sel: t, spec: specificity(t), important });
      }
    }
  }
}

const MINE = ':focus-visible:not(#dsh-a11y-guard)';
const mineSpec = specificity(MINE);
const beats = (r) => cmp(mineSpec, r.spec) > 0;
const worst = offenderRules.slice().sort((x, y) => cmp(y.spec, x.spec))[0];

const rows = [];
rows.push('| 历史规则（关掉了焦点环） | 来源 style 块 | 特异性 | !important | 新规则是否压过 |');
rows.push('|---|---|---|---|---|');
for (const r of offenderRules) {
  rows.push(`| \`${r.sel}\` | ${r.styleId} | ${fmtSpec(r.spec)} | ${r.important ? '有' : '无'} | ${beats(r) ? '✅ 压过' : '❌ 被压过'} |`);
}
const losers = offenderRules.filter(r => !beats(r));

// ---------- ② 对比度 ----------
const lum = (hex) => {
  const h = hex.replace('#', '');
  const ch = [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16) / 255);
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const [r, g, b] = ch.map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const cr = (a, b) => {
  const la = lum(a), lb = lum(b);
  const hi = Math.max(la, lb), lo = Math.min(la, lb);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
};

const NR = (() => {
  const blk = styleBlocks(html).find(b => b.id === 'notion-system');
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(blk.css))) {
    out.push({ sel: m[1].trim().replace(/\s+/g, ' '), body: m[2] });
  }
  return out;
})();

const tok = (name, theme) => {
  const sel = theme === 'light' ? ':root'
    : theme === 'dark' ? 'html[data-theme="dark"]'
      : 'html[data-theme="eye"]';
  let body = null;
  for (const r of NR) {
    if (r.sel !== sel) continue;
    if (theme === 'light' && !/--bg-page\s*:\s*#ffffff/.test(r.body)) continue;
    body = r.body; // 同名选择器取最后一次（与层叠一致）
  }
  if (!body) return null;
  /* 同一个令牌可能在同一块里被声明两次（第三轮在块尾追加了 --accent 覆盖），
     层叠取最后一次 —— 所以这里也要取最后一次匹配。 */
  const re = new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+);`, 'g');
  let v = null, m;
  while ((m = re.exec(body))) v = m[1].trim();
  return v;
};

const themes = {
  light: { card: '#ffffff', page: '#ffffff', thead: '#f1f1ef', hover: '#f7f6f3' },
  dark: { card: '#373c3f', page: '#2f3437', thead: '#3d4245', hover: '#42474a' },
  eye: { card: '#eaefdd', page: '#dfe6d5', thead: '#dde3d0', hover: '#d3dcc6' },
};
const checks = [];
for (const [theme, bgs] of Object.entries(themes)) {
  for (const [name, label] of [['--text-secondary', '二级文字'], ['--text-muted', '三级/辅助文字']]) {
    const color = tok(name, theme);
    if (!color) { checks.push({ theme, label, color: '(未取到)', bg: '-', ratio: 0 }); continue; }
    for (const [bgName, bg] of Object.entries(bgs)) {
      checks.push({ theme, label, color, bg: `${bgName} ${bg}`, ratio: cr(color, bg) });
    }
  }
  for (const [name, label] of [
    ['--danger-text', '危险色文字'],
    ['--warn-text', '警告色文字'],
    ['--success-text', '成功色文字'],
  ]) {
    const color = tok(name, theme);
    const bg = tok(name.replace('-text', '-bg'), theme);
    if (color && bg) checks.push({ theme, label, color, bg: `${label.slice(0, 2)}浅底 ${bg}`, ratio: cr(color, bg) });
  }
  if (theme !== 'eye') {
    /* 第三轮：实心按钮底改用 --accent-solid（暗色下 --accent 提亮成文字色，当底只有 3.19）。
       浅色主题里它是 var(--accent)，所以要解一层引用。 */
    let solid = tok('--accent-solid', theme) || tok('--accent', theme);
    const alias = /^var\((--[\w-]+)\)$/.exec(solid || '');
    if (alias) solid = tok(alias[1], theme);
    checks.push({ theme, label: '主按钮白字', color: '#ffffff', bg: `accent-solid ${solid}`, ratio: cr('#ffffff', solid) });
  }
  /* 第三轮：新增「链接/强调文字 = --accent on 卡片底」——拆令牌后这个才是 --accent 的正职 */
  {
    const accent = tok('--accent', theme);
    if (accent) checks.push({ theme, label: '强调文字（链接）', color: accent, bg: `card ${bgs.card}`, ratio: cr(accent, bgs.card) });
  }
}

// ---------- 输出 ----------
const md = [];
md.push('# 第一轮整改 · 核验记录（静态）\n');
md.push(`对象：\`app/src/index.html\`（构建产物；源文件为 \`中南大学生工作台.html\`）\n`);
md.push('## ① 焦点环：新规则能否压过历史那些 `outline:none`\n');
md.push(`新规则选择器：\`${MINE}\`　特异性 **${fmtSpec(mineSpec)}**\n`);
md.push(rows.join('\n'));
md.push('');
md.push(losers.length === 0
  ? `**结论：全部压过。** 历史规则里特异性最高的是 ${worst ? `\`${worst.sel}\` ${fmtSpec(worst.spec)}` : '—'}，\n仍低于新规则 ${fmtSpec(mineSpec)}；两边都是作者样式时，层叠按「特异性 → 源序」判定，而 \`round1-a11y\` 又是文档里最后一个 style 块。`
  : `**结论：有 ${losers.length} 条历史规则仍更强势，新规则需要再提优先级：** ${losers.map(l => `\`${l.sel}\` ${fmtSpec(l.spec)}`).join('、')}`);
md.push('\n## ② 对比度（WCAG 2.1 AA，正文与辅助文字 ≥ 4.5:1）\n');
md.push('| 主题 | 用途 | 前景 | 背景 | 对比度 | 判定 |');
md.push('|---|---|---|---|---|---|');
for (const c of checks) {
  if (c.ratio === 0) { md.push(`| ${c.theme} | ${c.label} | ${c.color} | ${c.bg} | - | ⚠️ 取值失败 |`); continue; }
  md.push(`| ${c.theme} | ${c.label} | ${c.color} | ${c.bg} | ${c.ratio} | ${c.ratio >= 4.5 ? '✅' : '❌'} |`);
}
const fails = checks.filter(c => c.ratio > 0 && c.ratio < 4.5);
md.push('');
md.push(fails.length
  ? `**仍有 ${fails.length} 项不达标**：\n` + fails.map(f => `- ${f.theme} / ${f.label}：${f.ratio}（${f.color} on ${f.bg}）`).join('\n')
  : '**全部达标（≥4.5:1）。**');
md.push('');
md.push('## ③ 本机没做成的两项验收\n');
md.push('沙箱禁止子进程打开命名管道（`mojo platform_channel: 拒绝访问`），Edge/Chromium 无法在本会话启动，');
md.push('所以「真实截图」和「axe 自动扫描」需要人在浏览器里跑一次。可直接粘贴到 DevTools Console：\n');
md.push('```js');
md.push('// 1) 焦点环是否真的画出来：自动聚焦每个可聚焦元素并读 outline');
md.push('[...document.querySelectorAll("input,select,textarea,button,a[href],[tabindex]")].forEach((el,i)=>{');
md.push('  el.focus({focusVisible:true});');
md.push('  const cs=getComputedStyle(el);');
md.push('  if(cs.outlineStyle==="none"||parseFloat(cs.outlineWidth)<2) console.warn("焦点不可见 #"+i, el, cs.outlineStyle, cs.outlineWidth);');
md.push('});');
md.push('console.log("焦点检查完成：没有 warn 即全部可见");');
md.push('```');
md.push('```js');
md.push('// 2) 窄屏统计条：把窗口调到 412px 宽后执行，期望两列');
md.push('getComputedStyle(document.querySelector(".stats-4")).gridTemplateColumns');
md.push('```');
md.push('```js');
md.push('// 3) 全站对比度：需要 axe-core（把 axe.min.js 内容粘进来后）');
md.push('axe.run(document,{runOnly:["color-contrast"]}).then(r=>console.log(r.violations))');
md.push('```');

writeFileSync('.verify/round1-check.md', md.join('\n'), 'utf8');
console.log('offenders:', offenderRules.length, '| worst:', worst && fmtSpec(worst.spec), '| mine:', fmtSpec(mineSpec), '| losers:', losers.length);
console.log('checks:', checks.length, '| fails:', fails.length, fails.map(f => `${f.theme}/${f.label}/${f.ratio}`).join(' '));

// 语法检查：把 HTML 中的 <script> 块逐个编译，不做执行
// 另附一条静态检查：.btn 的修饰类必须真的在 CSS 里定义过。
//   （v1.9.3 踩过：把主按钮写成 class="btn primary"，而这套 CSS 里是 .btn.pri，
//     结果按钮静默退化成白按钮 —— 不报错、不崩，纯粹是丑，很难被自动化测试抓到。）
const fs = require('fs');
const vm = require('vm');

const file = process.argv[2];
const html = fs.readFileSync(file, 'utf8');
const re = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
let m, i = 0, bad = 0;
while ((m = re.exec(html)) !== null) {
  i++;
  const src = m[1];
  if (!src.trim()) continue;
  try {
    new vm.Script(src, { filename: `script#${i}` });
    console.log(`script#${i} OK  (${src.length} chars)`);
  } catch (e) {
    bad++;
    const line = html.slice(0, m.index).split('\n').length;
    console.log(`script#${i} FAIL (${src.length} chars, 起始行 ~${line}): ${e.message}`);
  }
}
console.log(bad ? `\n==> ${bad} 个 script 块有语法错误` : `\n==> 全部 ${i} 个 script 块语法通过`);

/* ---- 静态检查：按钮上的类名是否有 CSS 定义 ----
   判定规则：`.btn.X` 或独立 `.X` 任一存在即算合法。
   （`.btn.memo-add` 那种辅助类是独立定义的，不能要求必须是 .btn 前缀。） */
const cssSrc = html.slice(0, html.indexOf('</style>'));
const defined = new Set();
for (const mm of cssSrc.matchAll(/\.([A-Za-z_][\w-]*)/g)) defined.add(mm[1]);
let badBtn = 0;
const seen = new Set();
for (const mm of html.matchAll(/class="btn(?: ([a-z0-9 -]+))?"/g)) {
  for (const tok of String(mm[1] || '').trim().split(/\s+/).filter(Boolean)) {
    if (seen.has(tok)) continue;
    seen.add(tok);
    if (!defined.has(tok)) {
      badBtn++;
      const line = html.slice(0, mm.index).split('\n').length;
      console.log(`  ✗ 第 ~${line} 行：class="btn ${tok}" —— CSS 里没有.${tok} 的定义，按钮会退化成默认样子`);
    }
  }
}
console.log(badBtn
  ? `==> ${badBtn} 处按钮类名没有对应样式`
  : `==> 按钮类名全部有定义（本题涉及：${[...seen].map(x => '.' + x).join(' ')}）`);
process.exit(bad || badBtn ? 1 : 0);

// 语法检查：把 HTML 中的 <script> 块逐个编译，不做执行
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
process.exit(bad ? 1 : 0);

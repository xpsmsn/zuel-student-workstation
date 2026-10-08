/* 用原型内联的 SheetJS 读真实表格（与导入功能同一解析器，看到的表头就是程序看到的）。
   用途：设计导入模板时核对真实表头。
   用法: node .build/read-real-tables.js <文件1> <文件2> ... */
const path = require('path');
const fs = require('fs');
const NODE_WS = 'C:/Users/xpsms/.workbuddy/binaries/node/workspace/node_modules';
const { chromium } = require(path.join(NODE_WS, 'playwright'));

const BASE = 'http://127.0.0.1:8899/中南大学生工作台.html';
const files = process.argv.slice(2);

(async () => {
  const browser = await chromium.launch({ channel: 'msedge' });
  const page = await browser.newPage();
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForTimeout(500);

  for (const f of files) {
    const buf = fs.readFileSync(f).toString('base64');
    const out = await page.evaluate(async (b64) => {
      const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const wb = XLSX.read(bin, { type: 'array', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const arr = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false });
      return { sheets: wb.SheetNames, rows: arr.slice(0, 8) };
    }, buf);
    console.log('\n==================== ' + path.basename(f));
    console.log('工作表:', out.sheets.join(' | '));
    out.rows.forEach((r, i) => {
      const cells = (r || []).map(c => (c == null ? '' : String(c).trim())).slice(0, 30);
      console.log(`  行${i + 1}: ` + cells.join(' | '));
    });
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });

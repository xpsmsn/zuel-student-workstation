// .build/import-test2.js —— 两种学号写法的导入流程
// ① 文本学号（正常）→ 应该直接能点「下一步」
// ② 数字学号（Excel 中毒）→ 应该拦住 + 给「仍然导入」兜底
'use strict';
const { chromium } = require('C:/Users/xpsms/.workbuddy/binaries/node/workspace/node_modules/playwright');
const F = 'file:///D:/Develop/辅导员工作台/中南大学生工作台.html';

async function makeXlsx(p, asNumber) {
  await p.evaluate((num) => {
    const s0 = S.students[0], s1 = S.students[1];
    const sid = (x) => (num ? Number(x) : String(x));
    const arr = [
      ['学号', '姓名', '班级', '家长电话', '团费收缴'],
      [sid(s0['学号']), s0['姓名'] || s0['姓名1'], s0['班级'], '13900000001', '已缴'],
      [sid(s1['学号']), s1['姓名'] || s1['姓名1'], s1['班级'], '13900000002', '欠缴'],
      ['9999999999', '新同学', '金融2401', '13900000003', '已缴'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(arr);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    window.__xlsx = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  }, asNumber);
  return p.evaluate(() => Array.from(new Uint8Array(window.__xlsx)));
}

(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });

  for (const [label, asNumber] of [['文本学号（正常）', false], ['数字学号（Excel 中毒）', true]]) {
    const p = await b.newPage({ viewport: { width: 1280, height: 940 } });
    const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    await p.goto(F);
    await p.waitForTimeout(1800);

    const buf = await makeXlsx(p, asNumber);
    await p.evaluate(() => openImport());
    await p.waitForTimeout(300);
    const input = await p.$('#uiFileInput');
    await input.setInputFiles({
      name: asNumber ? '数字学号表.xlsx' : '文本学号表.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.from(buf),
    });
    await p.waitForTimeout(1400);

    const st = await p.evaluate(() => {
      const btn = document.getElementById('uiOk');
      const nums = [...document.querySelectorAll('.result-box')].map(e => e.innerText.replace(/\n/g, ' '));
      return {
        按钮显示: btn ? getComputedStyle(btn).display : '(无)',
        有兜底按钮: !!document.querySelector('[data-force]'),
        统计: nums.join(' | '),
        警告: (document.querySelector('[style*="danger"]') || {}).innerText?.split('\n')[0] || '(无警告)',
      };
    });
    console.log('── ' + label + ' ──');
    console.log('  统计:', st.统计);
    console.log('  「下一步」:', st.按钮显示, '| 兜底按钮:', st.有兜底按钮 ? '有' : '无');
    console.log('  警告:', st.警告);
    if (errs.length) console.log('  报错:', errs.slice(0, 2));
    await p.close();
  }

  await b.close();
})();

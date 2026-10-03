// .build/import-test.js —— 导入全流程真实点击测试
// 走真实路径：openImport → 选真 xlsx → 看提示 → 点「下一步」→ 走完向导
'use strict';
const { chromium } = require('C:/Users/xpsms/.workbuddy/binaries/node/workspace/node_modules/playwright');
const F = 'file:///D:/Develop/辅导员工作台/中南大学生工作台.html';

(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const p = await b.newPage({ viewport: { width: 1280, height: 940 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });

  await p.goto(F);
  await p.waitForTimeout(2000);

  /* 造一份真的 xlsx：2 个已存在 + 1 个新学生（考验「对上 / 新增」两条路） */
  await p.evaluate(() => {
    const s0 = S.students[0], s1 = S.students[1];
    const arr = [
      ['学号', '姓名', '班级', '家长电话', '团费收缴'],
      [s0['学号'], s0['姓名'] || s0['姓名1'], s0['班级'], '13900000001', '已缴'],
      [s1['学号'], s1['姓名'] || s1['姓名1'], s1['班级'], '13900000002', '欠缴'],
      ['9999999999', '新同学', '金融2401', '13900000003', '已缴'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(arr);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    window.__xlsx = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  });
  const buf = await p.evaluate(() => Array.from(new Uint8Array(window.__xlsx)));

  await p.evaluate(() => openImport());
  await p.waitForTimeout(300);

  const input = await p.$('#uiFileInput');
  await input.setInputFiles({
    name: '党团发展表.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: Buffer.from(buf),
  });
  await p.waitForTimeout(1500);

  const s1 = await p.evaluate(() => {
    const btn = document.getElementById('uiOk');
    return {
      按钮: !!btn,
      显示: btn ? getComputedStyle(btn).display : '(无)',
      文案: btn ? btn.textContent : '(无)',
      提示: (document.getElementById('uiBody') || {}).innerText?.replace(/\n+/g, ' / '),
    };
  });
  console.log('── 选完文件 ──');
  console.log('  按钮:', s1.按钮 ? s1.显示 + ' · ' + s1.文案 : '(无)');
  console.log('  提示:', s1.提示);
  if (!s1.按钮) { console.log('★ 按钮不存在，流程断了'); await b.close(); return; }
  await p.screenshot({ path: '.build/import-step1.png' });

  /* 点「下一步」 */
  const e0 = errs.length;
  await p.click('#uiOk');
  await p.waitForTimeout(900);

  const s2 = await p.evaluate(() => ({
    标题: (document.querySelector('.modal-title') || {}).textContent,
    步骤: window.importState && importState.step,
    行数: window.importState && importState.rows && importState.rows.length,
    正文: (document.getElementById('modalRoot') || {}).innerText?.replace(/\n+/g, ' / ').slice(0, 220),
  }));
  console.log('\n── 点「下一步」──');
  console.log('  标题:', s2.标题, '| step:', s2.步骤, '| 行数:', s2.行数);
  console.log('  正文:', s2.正文);
  if (errs.length > e0) console.log('  ★ 报错:', errs.slice(e0).slice(0, 3));

  await p.screenshot({ path: '.build/import-step2.png' });
  if (errs.length) { console.log('\n全部报错:'); errs.slice(0, 5).forEach(e => console.log('  ' + e)); }
  await b.close();
})();

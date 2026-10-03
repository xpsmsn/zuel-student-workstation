'use strict';
const { chromium } = require('C:/Users/xpsms/.workbuddy/binaries/node/workspace/node_modules/playwright');
const fs = require('fs');
const F = 'file:///D:/Develop/辅导员工作台/中南大学生工作台.html';
const FILES = [
  ['名册',   'C:/Users/xpsms/Desktop/xsjbxxModel_xsjbxxbgdz_display.xlsx'],
  ['成绩',   'C:/Users/xpsms/Desktop/成绩信息.xlsx'],
  ['申报',   'C:/Users/xpsms/Desktop/申报情况.xlsx'],
  ['评选表', 'C:/Users/xpsms/Desktop/ZHCP_CPSH_SHTABLE.xlsx'],
];
(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(F); await p.waitForTimeout(2400);
  await p.evaluate(() => { S.batches=[]; S.activeBatchId=null; S.students=[]; S.grades=[]; S.awardStatus={}; invalidateGradeMap(); save(); });
  for (const [tag, path] of FILES) {
    const buf = fs.readFileSync(path);
    await p.evaluate(async ({b64,name}) => {
      const bin=atob(b64); const buf=new Uint8Array(bin.length);
      for(let i=0;i<bin.length;i++) buf[i]=bin.charCodeAt(i);
      handleFile({target:{files:[new File([buf],name)],value:''}});
      await new Promise(r=>setTimeout(r,700));
      if(document.querySelector('#modalRoot .mask')) closeModal();
      doImport(); await new Promise(r=>setTimeout(r,400));
      if(document.querySelector('#modalRoot .mask')) closeModal();
    }, {b64: buf.toString('base64'), name: path.split('/').pop()});
  }
  await p.evaluate(()=>gotoAward());
  await p.waitForTimeout(600);
  const r = await p.evaluate(() => {
    const ths = [...document.querySelectorAll('.award-table thead th')].map(t=>t.textContent.trim().replace(/[↓↑]\s*$/,''));
    const chips = [...document.querySelectorAll('.aw-chip')].map(c=>c.textContent.trim());
    const first = document.querySelector('.award-table tbody tr');
    return {
      列顺序: ths,
      筛选按钮: chips,
      行数: document.querySelectorAll('.award-table tbody tr').length,
      首行: first ? [...first.children].map(td=>td.textContent.trim().slice(0,22)) : [],
      志愿标签数: document.querySelectorAll('.aw-tag').length,
    };
  });
  console.log('列顺序:', JSON.stringify(r.列顺序));
  console.log('筛选:', JSON.stringify(r.筛选按钮));
  console.log('行数:', r.行数, '| 首行:', JSON.stringify(r.首行));
  await p.screenshot({path:'.build/award-new.png'});

  // 筛选国家奖学金
  const f1 = await p.evaluate(()=>{ awardFilter('国家奖学金');
    return { 行: document.querySelectorAll('.award-table tbody tr').length,
             全是报该奖: [...document.querySelectorAll('.aw-tag')].every(t=>t.textContent.includes('国家奖学金')) }; });
  console.log('筛选「国家奖学金」:', JSON.stringify(f1));
  await p.screenshot({path:'.build/award-filter.png'});

  // 多选 + 批量拟定
  const f2 = await p.evaluate(()=>{ awardFilter('');
    const boxes=[...document.querySelectorAll('.award-table tbody input[type=checkbox]')];
    boxes[0].click(); boxes[1].click(); boxes[2].click();
    return { 选中: _awSel.size, 批量条: !!document.querySelector('.aw-bulk') }; });
  await p.waitForTimeout(300);
  const f3 = await p.evaluate(()=>{ awardSetStatusBulk('推荐');
    return { 已存: Object.keys(S.awardStatus).length, 批量条还在: !!document.querySelector('.aw-bulk'),
             首个状态: document.querySelector('.award-table tbody .aw-select').value }; });
  console.log('多选:', JSON.stringify(f2), '→ 批量拟定:', JSON.stringify(f3));
  await p.waitForTimeout(300);
  await p.screenshot({path:'.build/award-bulk.png'});
  console.log('报错:', errs.length?errs.slice(0,3):'无');
  await b.close();
})();

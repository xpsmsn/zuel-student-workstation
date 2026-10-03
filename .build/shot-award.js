'use strict';
const { chromium } = require('C:/Users/xpsms/.workbuddy/binaries/node/workspace/node_modules/playwright');
const fs = require('fs');
const F = 'file:///D:/Develop/辅导员工作台/中南大学生工作台.html';
const FILES = ['C:/Users/xpsms/Desktop/xsjbxxModel_xsjbxxbgdz_display.xlsx','C:/Users/xpsms/Desktop/成绩信息.xlsx','C:/Users/xpsms/Desktop/申报情况.xlsx','C:/Users/xpsms/Desktop/ZHCP_CPSH_SHTABLE.xlsx'];
(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const p = await b.newPage({ viewport: { width: 1500, height: 940 } });
  await p.goto(F); await p.waitForTimeout(2400);
  await p.evaluate(() => { S.batches=[]; S.activeBatchId=null; S.students=[]; S.grades=[]; S.awardStatus={}; invalidateGradeMap(); save(); });
  for (const path of FILES) {
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
  await p.evaluate(()=>{ gotoAward(); });
  await p.waitForTimeout(700);
  await p.screenshot({path:'.build/aw-1.png'});
  // 筛国家奖学金 + 勾选几个
  await p.evaluate(()=>{ awardFilter('国家奖学金'); });
  await p.waitForTimeout(400);
  await p.evaluate(()=>{ const bs=[...document.querySelectorAll('.award-table tbody input[type=checkbox]')]; bs[0].click(); bs[1].click(); });
  await p.waitForTimeout(400);
  await p.screenshot({path:'.build/aw-2.png'});
  await b.close(); console.log('ok');
})();

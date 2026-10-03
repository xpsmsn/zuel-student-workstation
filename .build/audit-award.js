// .build/audit-award.js —— 奖学金区块 CSS 合规审计（逐条比对 12 条铁律）
'use strict';
const { chromium } = require('C:/Users/xpsms/.workbuddy/binaries/node/workspace/node_modules/playwright');
const F = 'file:///D:/Develop/辅导员工作台/中南大学生工作台.html';

const GRID = [8, 16, 24, 32, 40];
const FONT = { '页面大标题': 24, '区块/卡片标题': 18, '正文': 15, '辅助小字': 13 };

(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  await p.goto(F); await p.waitForTimeout(2400);
  await p.evaluate(() => {
    S.students = [{学号:'1',姓名:'a',专业:'英语'},{学号:'2',姓名:'b',专业:'法语'},{学号:'3',姓名:'c',专业:'英语'}];
    S.awardRows = [
      {学号:'1',姓名:'a',专业:'英语',知识水平评价:'90',总成绩:'88',志愿顺序:'1.国家奖学金(不分等级) 2.比亚迪奖学金(不分等级) 文体佳绩奖学金(不分等级)'},
      {学号:'2',姓名:'b',专业:'法语',知识水平评价:'80',总成绩:'79',志愿顺序:'1.国家奖学金(不分等级)'}];
    S.awardQuota = {'国家奖学金':2}; S.awardStatus = {}; S.awardSplit = {};
    gotoAward();
  });
  await p.waitForTimeout(500);

  const report = await p.evaluate((GRID) => {
    const px = v => Math.round(parseFloat(v) * 100) / 100;
    const inGrid = v => GRID.includes(px(v));
    const rows = [];
    const push = (sel, label, v) => rows.push({ sel, label, ...v });

    // 1) 间距（padding / margin / gap）是否在 8px 栅格
    const sp = [];
    /* Tag 类（.aw-tag / .aw-award-tag / .aw-badge / .aw-warn）的 padding:3px 8px
       是铁律⑨里逐字写明的规格，属规则②栅格的特例，审计时豁免。 */
    document.querySelectorAll('.award-head,.aw-switch,.aw-switch .aw-chip,.aw-summary,.aw-prog,.aw-prog-t,.aw-prog-h,.aw-prog-n,.aw-prog-v,.aw-prog-f,.aw-bar,.aw-split-btn,.aw-bulk,.aw-bulk .btn,.award-table th,.award-table td,.aw-chip,.aw-filter-t,.aw-x,.aw-num,.aw-quota,.aw-q-num').forEach(function(el){
      const c = getComputedStyle(el);
      ['paddingTop','paddingBottom','paddingLeft','paddingRight','marginTop','marginBottom','marginLeft','marginRight','rowGap','columnGap'].forEach(function(k){
        const v = c[k];
        if(!v || v === 'auto' || v === '0px') return;
        const n = px(v);
        if(n > 0 && !GRID.includes(n)) sp.push({ el: el.className.split(' ')[0], 属: k, 值: n });
      });
    });

    // 2) 圆角
    const rad = [];
    document.querySelectorAll('.award-head,.aw-switch .aw-chip,.aw-prog,.aw-bar,.aw-split-btn,.aw-bulk,.award-table th,.award-table td,.aw-tag,.aw-award-tag,.aw-x,.aw-chip,.aw-q-num').forEach(function(el){
      const r = px(getComputedStyle(el).borderTopLeftRadius);
      if(r !== 0 && r !== 6 && r !== 12) rad.push({ el: el.className.split(' ')[0], 圆角: r });
    });

    // 3) 阴影
    const sh = [];
    document.querySelectorAll('.card,.u-card,.aw-prog,.aw-summary,.aw-switch,.aw-bulk,.award-table,.aw-switch .aw-chip').forEach(function(el){
      const s = getComputedStyle(el).boxShadow;
      if(s && s !== 'none') sh.push({ el: el.className.split(' ')[0], 阴影: s.slice(0, 40) });
    });

    // 4) 字号 / 字重 / 行高
    const typo = [];
    const want = { 'award-title': '区块标题', 'page-title': '页面大标题', 'card-title': '卡片标题' };
    document.querySelectorAll('.award-title,.page-title,.card-title,.aw-prog-n,.aw-prog-v,.aw-prog-f,.aw-split-n,.aw-split-c,.aw-summary,.aw-bulk,.aw-tag,.aw-award-tag,.aw-switch .aw-chip,.award-table td,.award-table th,.aw-filter-t,.u-hint-quiet').forEach(function(el){
      const c = getComputedStyle(el);
      const fs = px(c.fontSize), fw = c.fontWeight;
      const bad = [];
      if([24,18,15,13].indexOf(fs) < 0) bad.push('字号'+fs);
      const isTitle = /title/.test(el.className);
      if(isTitle && fs !== 24 && fs !== 18) bad.push('标题应24/18');
      if(!isTitle && fw !== '400' && fw !== '600') bad.push('字重'+fw);
      if(bad.length) typo.push({ el: el.className.split(' ')[0] || el.tagName, 问题: bad.join(','), 实际: fs + 'px/' + fw });
    });

    // 5) 表格边框
    const tb = [];
    const th0 = document.querySelector('.award-table thead th');
    const td0 = document.querySelector('.award-table tbody td');
    if(th0){ const c = getComputedStyle(th0);
      tb.push({ 项:'表头', 左右边框: c.borderLeftWidth + '/' + c.borderRightWidth, 圆角: c.borderTopLeftRadius, 底色: c.backgroundColor }); }
    if(td0){ const c = getComputedStyle(td0);
      tb.push({ 项:'单元格', 左右边框: c.borderLeftWidth + '/' + c.borderRightWidth, 圆角: c.borderTopLeftRadius, 下边框: c.borderBottomWidth }); }

    // 6) 深底白字的 Tag（规则⑦禁止）
    const darkTag = [];
    document.querySelectorAll('.aw-chip.picked,.aw-award-tag,.aw-tag,.aw-badge,.aw-split-btn.on').forEach(function(el){
      const c = getComputedStyle(el);
      const m = /rgba?\((\d+), (\d+), (\d+)/.exec(c.backgroundColor);
      if(m){
        const lum = (0.299*+m[1] + 0.587*+m[2] + 0.114*+m[3]) / 255;
        if(lum < 0.5) darkTag.push({ el: el.className.split(' ').slice(0,2).join('.'), 底色: c.backgroundColor, 字色: c.color });
      }
    });

    // 7) hover 是否有位移/发光
    const hov = [];
    document.querySelectorAll('.aw-prog,.aw-split-btn,.aw-chip,.aw-bulk .btn,.aw-tag,.award-table tbody tr').forEach(function(el){
      const base = getComputedStyle(el);
      hov.push({ el: el.className.split(' ').slice(0,2).join('.'), transform: base.transform, shadow: base.boxShadow.slice(0,20) });
    });

    return { sp, rad, sh, typo, tb, darkTag, hov: hov.filter(x=>x.transform !== 'none' || (x.shadow && x.shadow !== 'none')) };
  }, GRID);

  const L = (t) => console.log('\n' + t);
  L('① 间距不在 8px 栅格（' + report.sp.length + '）');
  report.sp.slice(0, 10).forEach(x => console.log('   ' + x.el + ' ' + x.属 + ': ' + x.值));
  L('② 圆角违规（允许 0/6/12）：' + report.rad.length);
  report.rad.slice(0, 8).forEach(x => console.log('   ' + x.el + ': ' + x.圆角));
  L('③ 卡片类有阴影：' + report.sh.length);
  report.sh.slice(0, 6).forEach(x => console.log('   ' + x.el + ': ' + x.阴影));
  L('④ 字号/字重违规：' + report.typo.length);
  report.typo.slice(0, 10).forEach(x => console.log('   ' + x.el + ' → ' + x.问题 + '  [' + x.实际 + ']'));
  L('⑤ 表格边框');
  report.tb.forEach(x => console.log('   ' + JSON.stringify(x)));
  L('⑥ 深底白字 Tag（规则⑦禁止）：' + report.darkTag.length);
  report.darkTag.forEach(x => console.log('   ' + x.el + ' 底' + x.底色 + ' 字' + x.字色));
  L('⑦ hover 位移/发光：' + report.hov.length);
  report.hov.slice(0, 6).forEach(x => console.log('   ' + x.el + ' ' + x.transform + ' ' + x.shadow));
  await p.setViewportSize({width:1600, height:1000});
  await p.evaluate(()=>{
    S.awardRows=[
      {学号:'202421110035',姓名:'王珍珠',专业:'英语',知识水平评价:'93.99',总成绩:'69.8',志愿顺序:'1.国家奖学金(不分等级) 2.比亚迪奖学金(不分等级) 4.优秀学生奖学金二等奖(不分等级) 文体佳绩奖学金(不分等级)'},
      {学号:'202421110273',姓名:'刘翘慧',专业:'商务英语',知识水平评价:'93.01',总成绩:'68.98',志愿顺序:'1.国家奖学金(不分等级) 2.比亚迪奖学金(不分等级) 4.优秀学生奖学金二等奖(不分等级) 文体佳绩奖学金(不分等级) 科研创新奖学金(不分等级)'},
      {学号:'202421110107',姓名:'曾祉妤',专业:'英语',知识水平评价:'94.60',总成绩:'76.9',志愿顺序:'1.国家奖学金(不分等级) 2.比亚迪奖学金(不分等级) 4.优秀学生奖学金二等奖(不分等级) 文体佳绩奖学金(不分等级)'},
      {学号:'202421110188',姓名:'李惠芸',专业:'英语(翻译)',知识水平评价:'94.11',总成绩:'68.29',志愿顺序:'1.国家奖学金(不分等级) 2.比亚迪奖学金(不分等级) 4.优秀学生奖学金三等奖(不分等级) 文体佳绩奖学金(不分等级) 科研创新奖学金(不分等级) 社会工作奖学金(不分等级)'},
      {学号:'202421110078',姓名:'雷子阳',专业:'英语',知识水平评价:'94.67',总成绩:'67.92',志愿顺序:'1.国家奖学金(不分等级) 2.比亚迪奖学金(不分等级) 4.优秀学生奖学金二等奖(不分等级) 文体佳绩奖学金(不分等级) 科研创新奖学金(不分等级)'}];
    S.awardStatus = {'202421110035':'国家奖学金','202421110273':'国家奖学金'};
    S.awardQuota = {'国家奖学金':3,'国家励志奖学金':2,'比亚迪奖学金':5};
    S.awardSplit = {};
    awardFilter('国家奖学金');
  });
  await p.waitForTimeout(600);
  await p.screenshot({path:'.build/award-final.png'});
  await b.close();
})();

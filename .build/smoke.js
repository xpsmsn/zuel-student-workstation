// .build/smoke.js —— 真实浏览器冒烟：验证重构后的运行时行为
//
// 为什么需要它：tests/*.js 把产物灌进 vm 沙盒跑，DOM 是**假的**。
// 沙盒全绿不代表真浏览器里能起来 —— 内核自检、页面注册表、
// K.ready 时序这些都必须在真实环境验一遍。
//
// 用法：node .build/smoke.js
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
const HTML = path.join(ROOT, '中南大学生工作台.html');

const PW = 'C:/Users/xpsms/.workbuddy/binaries/node/workspace/node_modules/playwright';
const { chromium } = require(PW);

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });

  await page.goto('file:///' + HTML.replace(/\\/g, '/'));
  await page.waitForTimeout(2500);

  const r = await page.evaluate(() => {
    const K = window.K;
    return {
      hasKernel: !!K,
      // 内核能力
      caps: K ? K.caps() : [],
      // 页面注册表
      pageIds: K ? K.pageIds() : [],
      selfCheck: K ? K.selfCheck() : ['no kernel'],
      // 实际状态
      view: typeof S !== 'undefined' ? S.view : null,
      students: typeof S !== 'undefined' ? S.students.length : 0,
      grades: typeof S !== 'undefined' ? S.grades.length : 0,
      batches: typeof S !== 'undefined' ? S.batches.length : 0,
      // DOM
      sidebarItems: document.querySelectorAll('.side-item').length,
      mainHtmlLen: (document.getElementById('mainArea') || {}).innerHTML?.length || 0,
      theme: typeof S !== 'undefined' ? S.theme : null,
    };
  });

  const ok = [];
  const bad = [];
  const check = (c, label, extra) => (c ? ok : bad).push(label + (c ? '' : ' = ' + JSON.stringify(extra)));

  check(r.hasKernel, '内核 K 已挂到 window');
  check(r.selfCheck.length === 0, '内核自检无问题', r.selfCheck);
  check(r.pageIds.length >= 13, `页面注册表有 ${r.pageIds.length} 个页面（应 ≥13）`, r.pageIds);
  check(r.batches === 1, `批次 1 个`, r.batches);
  check(r.students === 80, `演示学生 80 人`, r.students);
  check(r.grades === 80, `演示成绩 80 条`, r.grades);
  check(r.sidebarItems >= 10, `侧栏渲染 ${r.sidebarItems} 个条目`, r.sidebarItems);
  check(r.mainHtmlLen > 500, `主区域已渲染（${r.mainHtmlLen} 字符）`, r.mainHtmlLen);
  check(errors.length === 0, '无 JS 报错', errors.slice(0, 5));

  // 逐页切换，确认每个页面都能渲染（页面注册表的核心价值）
  console.log('\n— 逐页渲染 —');
  for (const id of r.pageIds) {
    const before = errors.length;
    const len = await page.evaluate((pid) => {
      S.view = pid;
      renderSidebar(); renderMain();
      return (document.getElementById('mainArea') || {}).innerHTML?.length || 0;
    }, id);
    const newErr = errors.length - before;
    const good = len > 200 && newErr === 0;
    (good ? ok : bad).push(`页面 ${id} 渲染 ${len} 字符${newErr ? '（' + newErr + ' 个报错）' : ''}`);
    console.log(`  ${good ? '✓' : '✗'} ${id.padEnd(16)} ${String(len).padStart(6)} 字符`);
  }

  await browser.close();

  console.log('\n══════ 结果 ══════');
  ok.forEach(o => console.log('  ✓ ' + o));
  if (bad.length) { console.log('\n  失败：'); bad.forEach(b => console.log('  ✗ ' + b)); }
  if (errors.length) { console.log('\n  报错原文：'); errors.slice(0, 8).forEach(e => console.log('   ' + e)); }
  console.log(`\n[smoke] ${ok.length} 通过 / ${bad.length} 失败`);
  process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error('[smoke] 崩溃：', e); process.exit(1); });
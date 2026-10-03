// .build/click-test.js —— 真实点击测试：定位「页面点不进去」
'use strict';
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const HTML = path.join(ROOT, '中南大学生工作台.html');
const { chromium } = require('C:/Users/xpsms/.workbuddy/binaries/node/workspace/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

  await page.goto('file:///' + HTML.replace(/\\/g, '/'));
  await page.waitForTimeout(2000);

  // 1. 当前视图 & 侧栏条目
  const before = await page.evaluate(() => ({
    view: S.view,
    items: [...document.querySelectorAll('.side-item')].slice(0, 12).map(el => ({
      txt: (el.textContent || '').trim().slice(0, 14),
      onclick: el.getAttribute('onclick') || null,
      hasProp: typeof el.onclick === 'function',
      disabled: el.classList.contains('disabled'),
    })),
  }));
  console.log('当前视图:', before.view);
  console.log('\n侧栏前 12 条:');
  before.items.forEach(i => console.log('  ' + i.txt.padEnd(16) +
    ' attr=' + String(i.onclick).slice(0, 34).padEnd(36) +
    ' prop=' + (i.hasProp ? '有' : '无') + (i.disabled ? ' [置灰]' : '')));

  // 2. 真点第一条（数据总览）
  console.log('\n— 真点「数据总览」 —');
  const el = await page.$('.side-item');
  await el.click();
  await page.waitForTimeout(600);
  const after = await page.evaluate(() => ({ view: S.view, len: (document.getElementById('mainArea') || {}).innerHTML.length }));
  console.log('  点击后 view =', after.view, '| 主区', after.len, '字符');

  // 3. 挨个点全部可点条目
  console.log('\n— 挨个点击 —');
  const n = await page.evaluate(() => document.querySelectorAll('.side-item').length);
  for (let i = 0; i < n; i++) {
    const e0 = errs.length;
    /* ⚠️ 判据不能只看 S.view：班级条目与关注视图都是**列表页的筛选**，
       点它们 view 本来就不变。真正该看的是「筛选条件或视图有没有变」。 */
    const info = await page.evaluate(idx => {
      const el = document.querySelectorAll('.side-item')[idx];
      const p = el;
      if (!el) return null;
      const txt = (el.textContent || '').trim().slice(0, 12);
      if (el.classList.contains('disabled')) return { txt, skipped: true };
      const snap = () => JSON.stringify({
        v: S.view, c: S.classFilter, q: S.quickView,
        rows: document.querySelectorAll('tbody tr').length,
      });
      const before = snap();
      el.click();
      return { txt, txt2: (p.getAttribute('onclick')||'').match(/'([a-z]+)'/) ? (p.getAttribute('onclick')||'').match(/'([a-z]+)'/)[1] : '', before, after: snap() };
    }, i);
    if (!info) continue;
    await page.waitForTimeout(120);
    if (info.skipped) { console.log(`  ${info.txt.padEnd(14)} 置灰跳过`); continue; }
    /* 点「当前已经在的这一页」状态本来就不变 —— 那不是没反应。
       判据：只要这个条目不是当前页，点它就必须有变化。 */
    const wasCurrent = info.before.includes('"v":"' + info.txt2 + '"');
    const moved = wasCurrent || info.before !== info.after;
    const e1 = errs.length;
    console.log(`  ${info.txt.padEnd(14)} ${moved ? '✓' : '✗ 没反应'}${e1 > e0 ? '  报错' + (e1 - e0) : ''}`);
  }

  if (errs.length) { console.log('\n报错:'); errs.slice(0, 8).forEach(e => console.log('  ' + e)); }
  await browser.close();
})();

/* v2.1.0 真机核对：AI 助理页三卡并列 / 三张二维码都能扫 / 金句框定宽不再跳 */
const fs = require('fs');
const { chromium } = require('C:/Users/xpsms/.workbuddy/binaries/node/workspace/node_modules/playwright');
const jsQR = require('C:/Users/xpsms/.workbuddy/binaries/node/workspace/node_modules/jsqr/dist/jsQR.js');
const { PNG } = require('C:/Users/xpsms/.workbuddy/binaries/node/workspace/node_modules/pngjs');

(async () => {
  const b = await chromium.launch({ channel: 'msedge' });
  let bad = 0;
  const ok = (c, m) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); if (!c) bad++; };

  for (const [k, w, h] of [['desktop', 1440, 900], ['pad', 1000, 900], ['phone', 412, 915]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: k === 'phone', hasTouch: k === 'phone' });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(String(e)));
    await p.goto('http://127.0.0.1:8899/中南大学生工作台.html', { waitUntil: 'load' });
    await p.waitForTimeout(600);
    await p.evaluate(() => {
      if (typeof enterApp === 'function') enterApp();
      S.guideSeen = true; S.tourSeen = true; S.backupRemindSnoozeUntil = Date.now() + 7 * 86400000;
      if (!S.batches.length) S.batches.push(makeBatch('法语2401', 'demo', SEED_DATA.map(d => ({ ...d }))));
      attachBatch(S.batches[0].id); save(); gotoPol();
    });
    await p.waitForTimeout(600);
    const info = await p.evaluate(() => {
      const grid = document.querySelector('.asst-cards');
      const cards = [...grid.children].map(c => { const r = c.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width) }; });
      return {
        n: cards.length,
        cols: new Set(cards.map(c => c.x)).size,
        rows: new Set(cards.map(c => c.y)).size,
        cardW: cards[0].w,
        titles: [...document.querySelectorAll('.bot-h')].map(e => e.innerText.trim()),
        tags: [...document.querySelectorAll('.bot-tag')].map(e => e.innerText.trim()),
        imgs: [...document.querySelectorAll('.qr-box img')].map(e => e.getAttribute('src')),
        sidebar: (document.querySelector('.side-item[data-tour="pol"] .s-txt') || {}).innerText,
        overflow: document.documentElement.scrollWidth > window.innerWidth + 2,
      };
    });
    console.log(`\n[${k} ${w}px] 卡片 ${info.n} 张 → ${info.cols} 列 × ${info.rows} 行（每张 ${info.cardW}px）| 溢出:${info.overflow ? '✗' : '✓'} | 报错:${errs.length || '无'}`);
    info.titles.forEach((t, i) => console.log(`     ${i + 1}. ${t}   « ${info.tags[i]} »`));
    if (k === 'desktop') {
      ok(info.n === 3 && info.cols === 3, '桌面宽度下三张卡并列同一行');
      ok(info.sidebar === 'AI 助理', `侧栏叫「${info.sidebar}」`);
      ok(info.imgs.length === 3 && info.imgs.every(s => s && s.startsWith('data:image/png;base64,')), '三张码都是内联 PNG');
      // 逐张解码页面里真实的 img（截图后交给 jsQR）
      for (let i = 0; i < info.imgs.length; i++) {
        const dataUrl = await p.evaluate(idx => {
          const img = document.querySelectorAll('.qr-box img')[idx];
          const c = document.createElement('canvas');
          c.width = img.naturalWidth; c.height = img.naturalHeight;
          c.getContext('2d').drawImage(img, 0, 0);
          return c.toDataURL('image/png');
        }, i);
        const png = PNG.sync.read(Buffer.from(dataUrl.split(',')[1], 'base64'));
        const r = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
        ok(!!r, `第 ${i + 1} 张码（${info.titles[i]}）能解出链接${r ? '：' + r.data.slice(-14) : ''}`);
      }
    }
    // 金句框：连续换 6 句，宽度必须一模一样
    const widths = [];
    for (let i = 0; i < 6; i++) {
      widths.push(await p.evaluate(() => Math.round(document.getElementById('quoteBar').getBoundingClientRect().width)));
      await p.evaluate(() => nextQuote());
      await p.waitForTimeout(120);
    }
    const uniq = [...new Set(widths)];
    console.log(`    金句框宽度（连换 6 句）: ${widths.join(' / ')} → ${uniq.length === 1 ? '✓ 定宽不再跳' : '✗ 仍在变'}`);
    if (k === 'desktop') ok(uniq.length === 1, '金句框宽度固定不变');
    await p.screenshot({ path: `.build/v210-ai-${k}.png` });
    await ctx.close();
  }
  await b.close();
  console.log(bad ? `\n共 ${bad} 项问题` : '\n全部通过 ✅');
  process.exit(bad ? 1 : 0);
})();

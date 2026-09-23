/* 手机尺寸下的可用性核对：用 Playwright 驱动系统 Edge，按真机视口跑一遍。
   目的：回答"网页版在手机上到底能不能用、长什么样"——不靠猜。
   检查项：① 运行期 JS 报错  ② 横向溢出（手机最怕的就是表格把页面撑宽）
           ③ 关键页面逐个截图（总览 / 全部学生 / 校务导航 / 常用模板 / AI 辅导员 / 校历）
   用法: node .build/shot-mobile.js http://127.0.0.1:8899/中南大学生工作台.html .build */
const path = require('path');
const NODE_WS = 'C:/Users/xpsms/.workbuddy/binaries/node/workspace/node_modules';
const { chromium } = require(path.join(NODE_WS, 'playwright'));

const BASE = process.argv[2] || 'http://127.0.0.1:8899/中南大学生工作台.html';
const OUT = process.argv[3] || '.build';

let failN = 0;
const fail = m => { console.error('  ✗ ' + m); failN++; };
const pass = m => console.log('  ✓ ' + m);

// 真机视口：iPhone 15 / 典型安卓机
const DEVICES = [
  { key: 'iphone', name: 'iPhone 15（Safari/WKWebView 视口）', w: 393, h: 852, ua:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' },
  { key: 'android', name: '安卓（Chrome 视口）', w: 412, h: 915, ua:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36' },
];

const PAGES = [
  ['dashboard', '数据总览', () => (typeof gotoDashboard === 'function' ? gotoDashboard() : null)],
  ['list',      '全部学生', () => (typeof pickClass === 'function' ? pickClass('all') : null)],
  ['nav',       '校务导航', () => (typeof gotoNav === 'function' ? gotoNav() : null)],
  ['tpl',       '常用模板', () => (typeof gotoTpl === 'function' ? gotoTpl() : null)],
  ['pol',       'AI 辅导员', () => (typeof gotoPol === 'function' ? gotoPol() : null)],
  ['cal',       '校历作息', () => (typeof gotoCal === 'function' ? gotoCal() : null)],
];

(async () => {
  const browser = await chromium.launch({ channel: 'msedge' });

  for (const d of DEVICES) {
    console.log(`\n[${d.name}]  ${d.w}×${d.h}`);
    const ctx = await browser.newContext({
      viewport: { width: d.w, height: d.h },
      deviceScaleFactor: 2,
      userAgent: d.ua,
      hasTouch: true,
      isMobile: true,
    });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForTimeout(700);
    await page.evaluate(() => {
      if (typeof enterApp === 'function') enterApp();
      S.guideSeen = true; S.tourSeen = true;
      if (typeof save === 'function') save();
    });
    await page.waitForTimeout(700);

    // 首屏（登录后）是否溢出
    const first = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      iw: window.innerWidth,
      hasHScroll: document.documentElement.scrollWidth > window.innerWidth + 2,
    }));
    first.hasHScroll
      ? fail(`首屏横向溢出：内容宽 ${first.sw} > 视口 ${first.iw}`)
      : pass(`首屏无横向溢出（内容宽 ${first.sw} / 视口 ${first.iw}）`);

    for (const [key, label, fn] of PAGES) {
      await page.evaluate(fn).catch(() => {});
      await page.waitForTimeout(420);
      const m = await page.evaluate(() => ({
        sw: document.documentElement.scrollWidth,
        iw: window.innerWidth,
        // 找出把页面撑宽的元素，便于定位
        worst: (() => {
          let w = null;
          document.querySelectorAll('#mainArea *').forEach(el => {
            const r = el.getBoundingClientRect();
            if (r.right > window.innerWidth + 2) {
              if (!w || r.right > w.right) w = { right: Math.round(r.right), cls: (el.className || el.tagName) + '' };
            }
          });
          return w;
        })(),
      }));
      const over = m.sw > m.iw + 2;
      over
        ? fail(`${label}：横向溢出（${m.sw} > ${m.iw}）${m.worst ? ' ← ' + m.worst.cls.slice(0, 40) + ' 右边缘 ' + m.worst.right : ''}`)
        : pass(`${label}：不溢出`);
      await page.screenshot({ path: path.join(OUT, `m-${d.key}-${key}.png`) });
    }

    if (errs.length) { errs.slice(0, 6).forEach(e => fail('运行期报错: ' + e)); }
    else pass('运行期无 JS 报错');

    await ctx.close();
  }

  await browser.close();
  console.log(failN ? `\n共 ${failN} 项问题` : '\n全部通过 ✅');
  process.exit(failN ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

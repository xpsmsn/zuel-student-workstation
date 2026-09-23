/* v1.9.3 真机核对：AI 辅导员页重排 + 关于页去掉二维码 + 筛选改复选框面板
   用法: node .build/shot-v193.js [页面URL] [截图输出目录] */
const fs = require('fs'), path = require('path');
const NODE_WS = 'C:/Users/xpsms/.workbuddy/binaries/node/workspace/node_modules';
const { chromium } = require(path.join(NODE_WS, 'playwright'));

const BASE = process.argv[2] || 'http://127.0.0.1:8899/中南大学生工作台.html';
const OUT  = process.argv[3] || '.build';

let failN = 0;
const fail = m => { console.error('  ✗ ' + m); failN++; };
const pass = m => console.log('  ✓ ' + m);

(async () => {
  const b = await chromium.launch({ channel: 'msedge' });
  const page = await b.newPage({ viewport: { width: 1440, height: 980 } });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForTimeout(700);
  await page.evaluate(() => { enterApp(); S.guideSeen = true; S.tourSeen = true; save(); });
  await page.waitForTimeout(300);

  /* ---------- [1] AI 辅导员页 ---------- */
  console.log('\n[1] AI 辅导员页（重排后）');
  await page.evaluate(() => { S.view = 'pol'; renderSidebar(); renderMain(); });
  await page.waitForTimeout(500);

  const asst = await page.evaluate(() => {
    const qs = sel => Array.from(document.querySelectorAll(sel));
    const boxes = qs('.qr-box');
    const cards = qs('.asst-2col > .card');
    const imgs  = boxes.map(b => {
      const im = b.querySelector('img');
      return { w: im ? im.naturalWidth : 0, h: im ? im.naturalHeight : 0,
               bw: Math.round(b.getBoundingClientRect().width),
               bh: Math.round(b.getBoundingClientRect().height), src: im ? im.src : '' };
    });
    const btns = qs('.bot-act button').map(x => x.textContent.trim());
    // 主按钮必须真的拿到 .btn.pri 的牌子色（曾把类名误写成 .btn.primary，静默退化成白按钮）
    const pri = qs('.bot-act .btn.pri')[0];
    const priBg = pri ? getComputedStyle(pri).backgroundColor : '';
    const priColor = pri ? getComputedStyle(pri).color : '';
    // 两卡是否左右并排（同一行、等高）
    const r0 = cards[0] && cards[0].getBoundingClientRect();
    const r1 = cards[1] && cards[1].getBoundingClientRect();
    return {
      nBox: boxes.length, nCard: cards.length, imgs, btns, priBg, priColor,
      sideBySide: !!(r0 && r1 && Math.abs(r0.top - r1.top) < 6 && r1.left > r0.right - 4),
      sameTop: r0 && r1 ? Math.round(Math.abs(r0.top - r1.top)) : -1,
      // 只看渲染区。绝不能用 document.body.innerHTML —— 它会把 <script> 里的注释也扫进来，
      // 而 renderAssistant 的注释正好引用了被删卡片的名字（曾误报一次）。
      hasOldCard: document.getElementById('mainArea').innerHTML.includes('什么问题适合问鹿晓南'),
      merged: (() => {
        const c = cards[0] && cards[0].querySelector('.bot-desc');
        const t = c ? c.textContent : '';
        return t.includes('请假') && t.includes('奖助学金') && t.includes('缓考');
      })()
    };
  });
  console.log('  两张二维码外框:', JSON.stringify(asst.imgs.map(i => `${i.bw}x${i.bh} 图${i.w}x${i.h}`)));
  console.log('  按钮文案:', JSON.stringify(asst.btns));

  asst.nCard === 2 && asst.sideBySide
    ? pass(`两张卡左右并排（卡片 ${asst.nCard} 张，顶差 ${asst.sameTop}px）`)
    : fail(`不是左右并排：卡片 ${asst.nCard} 张，顶差 ${asst.sameTop}px`);
  asst.nBox === 2 && asst.imgs.every(i => i.w > 0)
    ? pass('两张二维码都渲染出来了')
    : fail('二维码渲染异常：' + JSON.stringify(asst.imgs.map(i => i.w)));
  const fw = asst.imgs[0] && asst.imgs[0].bw, fh = asst.imgs[0].bh;
  asst.imgs.every(i => i.bw === fw && i.bh === fh)
    ? pass(`两张码外框尺寸一致（${fw}×${fh}）—— 图片格式统一了`)
    : fail('两张码外框尺寸不一致：' + JSON.stringify(asst.imgs.map(i => `${i.bw}x${i.bh}`)));
  !asst.hasOldCard ? pass('「什么问题适合问鹿晓南」那张说明卡已删') : fail('旧说明卡还在');
  asst.merged
    ? pass('旧说明卡的三条内容已并进左卡（请假 / 奖助学金 / 缓考）')
    : fail('左卡没看到并进来的三条内容');
  asst.btns.filter(t => t === '复制链接').length === 2
    ? pass('两张二维码下面各有「复制链接」')
    : fail('复制链接按钮数量不对：' + JSON.stringify(asst.btns));
  // .btn.pri 才有品牌底色；写成不存在的 .btn.primary 会静默变成白按钮
  /rgb\(\s*\d+,\s*\d+,\s*\d+\s*\)/.test(asst.priBg) && !/255,\s*255,\s*255/.test(asst.priBg)
    ? pass(`「复制链接」是实心主按钮（底色 ${asst.priBg}）`)
    : fail(`「复制链接」没吃到主按钮样式，退化成了白按钮（底色 ${asst.priBg}）`);

  // 把两张二维码的图落盘，交给 qr-check.js 真解一次
  const qrFiles = [];
  for (let i = 0; i < asst.imgs.length; i++) {
    const m = /^data:image\/png;base64,(.+)$/.exec(asst.imgs[i].src);
    if (!m) { fail('二维码不是内联 png：' + String(asst.imgs[i].src).slice(0, 40)); continue; }
    const p = path.join(OUT, `v193-qr-${i}.png`);
    fs.writeFileSync(p, Buffer.from(m[1], 'base64'));
    qrFiles.push(p);
  }
  console.log('  二维码已落盘:', qrFiles.join(', '));

  await page.screenshot({ path: path.join(OUT, 'v193-assistant.png'), fullPage: false });

  /* 深色主题再看一眼（二维码必须还是白底才扫得出来） */
  await page.evaluate(() => { document.documentElement.setAttribute('data-theme', 'dark'); });
  await page.waitForTimeout(300);
  const darkBox = await page.evaluate(() => {
    const b = document.querySelector('.qr-box');
    return b ? getComputedStyle(b).backgroundColor : '';
  });
  await page.screenshot({ path: path.join(OUT, 'v193-assistant-dark.png') });
  /255,\s*255,\s*255/.test(darkBox)
    ? pass('深色主题下二维码外框仍是白底（保证可扫）')
    : fail('深色主题下二维码底色变了：' + darkBox);
  await page.evaluate(() => { document.documentElement.removeAttribute('data-theme'); });
  await page.waitForTimeout(200);

  /* 窄屏：两卡应落成上下两栏（文档里承诺过，得验） */
  await page.setViewportSize({ width: 900, height: 980 });
  await page.waitForTimeout(350);
  const narrow = await page.evaluate(() => {
    const c = Array.from(document.querySelectorAll('.asst-2col > .card'));
    if (c.length !== 2) return null;
    const a = c[0].getBoundingClientRect(), b = c[1].getBoundingClientRect();
    return { stacked: b.top >= a.bottom - 2, sameLeft: Math.abs(a.left - b.left) < 3 };
  });
  narrow && narrow.stacked && narrow.sameLeft
    ? pass('窄屏（900px）自动落成上下两栏')
    : fail('窄屏没有落成上下两栏：' + JSON.stringify(narrow));
  await page.setViewportSize({ width: 1440, height: 980 });
  await page.waitForTimeout(200);

  /* ---------- [2] 系统设置 · 关于：二维码应已移除 ---------- */
  console.log('\n[2] 系统设置 · 关于');
  await page.evaluate(() => { S.view = 'settings'; renderSidebar(); renderMain(); });
  await page.waitForTimeout(400);
  const about = await page.evaluate(() => {
    const main = document.getElementById('mainArea').innerHTML;
    return {
      hasQr: main.includes('data:image/png;base64'),
      hasAuthor: main.includes('wuzhangfan110@163.com'),
      hasVer: main.includes(APP_VER)
    };
  });
  !about.hasQr ? pass('关于里的二维码已删掉') : fail('关于里还有二维码');
  about.hasAuthor && about.hasVer ? pass('软件 / 存储 / 作者 / 版本号仍在') : fail('关于信息缺失');
  // 单独把「关于」那张卡拍下来，确认删掉二维码后没有留下怪空档
  const aboutEl = await page.evaluateHandle(() => {
    const box = document.querySelector('#mainArea .about-box');
    return box ? box.closest('.card') : null;
  });
  const ae = aboutEl.asElement();
  if (ae) {
    await ae.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await ae.screenshot({ path: path.join(OUT, 'v193-about.png') });
    pass('「关于」卡片已单独截图（.build/v193-about.png）');
  } else {
    fail('没定位到「关于」卡片');
  }
  await page.screenshot({ path: path.join(OUT, 'v193-settings.png') });

  /* ---------- [3] 筛选：复选框面板 ---------- */
  console.log('\n[3] 筛选改复选框面板');
  await page.evaluate(() => { S.view = 'list'; S.classFilter='all'; S.quickView='all'; renderSidebar(); renderMain(); });
  await page.waitForTimeout(400);

  const btnSel = '.fdrop[data-field="性别"] .fdrop-btn';
  // 未选任何值时按钮显示「全部」（别写成「＋ 性别」—— 左侧已经有「性别」标签，会重复）
  const idleTxt = await page.$eval('.fdrop[data-field="班级"] .fd-txt', el => el.textContent.trim());
  idleTxt === '全部'
    ? pass('没选任何值时按钮显示「全部」')
    : fail(`未选值时按钮文案不对：${idleTxt}`);
  await page.click(btnSel);
  await page.waitForTimeout(250);
  const opened = await page.$eval('.fdrop[data-field="性别"] .fdrop-panel',
                                  el => el.classList.contains('open'));
  const panelRect = await page.$eval('.fdrop[data-field="性别"] .fdrop-panel', el => {
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), bottom: Math.round(r.bottom) };
  });
  opened ? pass(`点一下展开面板（${panelRect.w}×${panelRect.h}）`) : fail('面板没展开');

  // 连勾两个值，中间不重新点按钮
  await page.click('.fdrop[data-field="性别"] .fd-item:nth-child(1)');
  await page.waitForTimeout(250);
  const stillOpen1 = await page.$eval('.fdrop[data-field="性别"] .fdrop-panel',
                                      el => el.classList.contains('open'));
  await page.click('.fdrop[data-field="性别"] .fd-item:nth-child(2)');
  await page.waitForTimeout(250);
  const after = await page.evaluate(() => {
    const d = document.querySelector('.fdrop[data-field="性别"]');
    return {
      open: d.querySelector('.fdrop-panel').classList.contains('open'),
      txt: d.querySelector('.fd-txt').textContent.trim(),
      n: d.querySelector('.fd-n').textContent.trim(),
      checked: d.querySelectorAll('.fd-item input:checked').length,
      filters: JSON.stringify(S.filters['性别'] || []),
      people: S.students.length,
      doneBg: (() => { const b = d.querySelector('.fd-foot .btn.pri'); return b ? getComputedStyle(b).backgroundColor : ''; })()
    };
  });
  stillOpen1 && after.open
    ? pass('连勾两个值，面板全程保持展开（不用反复点开）')
    : fail(`勾选后面板被关掉了（第一次后 ${stillOpen1} / 第二次后 ${after.open}）`);
  after.checked === 2 && after.n === '2'
    ? pass('两个复选框都保持勾选状态')
    : fail(`勾选状态不对：checked=${after.checked} 角标=${after.n}`);
  after.txt.includes('男') && after.txt.includes('女')
    ? pass(`按钮上直接显示已选值（${after.txt}）`)
    : fail('按钮没显示已选值：' + after.txt);
  console.log('  当前筛选:', after.filters, '| 学生总数', after.people);
  after.doneBg && !/255,\s*255,\s*255/.test(after.doneBg)
    ? pass(`面板里的「完成」也是实心主按钮（底色 ${after.doneBg}）`)
    : fail(`面板里「完成」没吃到主按钮样式（底色 ${after.doneBg}）`);
  await page.screenshot({ path: path.join(OUT, 'v193-filter-open.png') });

  // 点面板外面应收起
  await page.mouse.click(20, 20);
  await page.waitForTimeout(250);
  const closed = await page.$eval('.fdrop[data-field="性别"] .fdrop-panel',
                                  el => el.classList.contains('open'));
  !closed ? pass('点面板外面自动收起') : fail('点外面没收起');
  const chipOk = await page.evaluate(() => document.getElementById('mainArea').innerHTML.includes('性别：男'));
  chipOk ? pass('已选值同步出现在「已启用条件」的 chip 里') : fail('chip 里没同步');

  /* ---------- [4] 运行期报错 ---------- */
  console.log('\n[4] 运行期');
  errs.length ? errs.slice(0, 5).forEach(e => fail('页面报错：' + e)) : pass('全程无 JS 报错');

  await b.close();
  console.log('\n二维码文件（用 qr-check.js 验可扫）:');
  qrFiles.forEach(f => console.log('  ' + f));
  console.log(failN ? `\n共 ${failN} 项问题` : '\n全部通过 ✅');
  process.exit(failN ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

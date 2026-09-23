/* 真机（真实 Edge）核对脚本 —— 主要守「页面浮窗批注导览」：
   1) 逐步核对：每一步都在视口内、洞套在目标上、气泡不越界，并逐步截图
   2) 逐步核对：**每一步都真的被走到**（锚点找不到时导览会静默跳过，必须断言）
   3) 二维码 —— 图片真的解码成功（naturalWidth>0，不是破图），并确认「关于」里已无码

   用法: node .build/shot-v192.js http://127.0.0.1:8899/中南大学生工作台.html .build
   依赖: C:/Users/xpsms/.workbuddy/binaries/node/workspace 下的 playwright（用系统 Edge） */
const path = require('path');
const NODE_WS = 'C:/Users/xpsms/.workbuddy/binaries/node/workspace/node_modules';
const { chromium } = require(path.join(NODE_WS, 'playwright'));

const BASE = process.argv[2] || 'http://127.0.0.1:8899/中南大学生工作台.html';
const OUT  = process.argv[3] || '.build';

let failN = 0;
const fail = m => { console.error('  ✗ ' + m); failN++; };
const pass = m => console.log('  ✓ ' + m);

(async () => {
  const browser = await chromium.launch({ channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  page.on('console', m => { if(m.type() === 'error') errs.push('console: ' + m.text()); });

  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForTimeout(600);

  /* 跳过登录，直接进主界面（S.password 为空时 loginPage 是「设置密码」，不走 UI 了） */
  await page.evaluate(() => {
    if(typeof enterApp === 'function') enterApp();
    S.guideSeen = true; S.tourSeen = false; save();
  });
  await page.waitForTimeout(600);

  console.log('\n[1] 页面浮窗批注导览');
  const steps = await page.evaluate(() => TOUR_STEPS.length);
  await page.evaluate(() => startTour());
  await page.waitForTimeout(450);

  let visited = 0;
  const seenSels = [];            // 实际走到的步骤（顺序）
  for(let i = 0; i < steps; i++){
    const info = await page.evaluate(() => {
      const layer = document.getElementById('tourLayer');
      if(!layer) return null;
      const hole = layer.querySelector('.tour-hole');
      const tip  = layer.querySelector('.tour-tip');
      const step = TOUR_STEPS[tourIdx];
      const tgt  = document.querySelector(step.sel);
      const hr = hole.getBoundingClientRect(), tr = tip.getBoundingClientRect(), gr = tgt.getBoundingClientRect();
      return {
        idx: tourIdx, sel: step.sel, title: step.title,
        hole: { l:hr.left, t:hr.top, r:hr.right, b:hr.bottom },
        tip:  { l:tr.left, t:tr.top, r:tr.right, b:tr.bottom },
        target: { l:gr.left, t:gr.top, r:gr.right, b:gr.bottom },
        vw: innerWidth, vh: innerHeight,
        arrows: (layer.querySelectorAll('.tour-foot button').length)
      };
    });
    if(!info){ fail(`第 ${i+1} 步：浮层没渲染出来`); break; }
    visited++;
    seenSels.push(info.sel);
    const okTarget = info.hole.l <= info.target.l + 0.5 && info.hole.t <= info.target.t + 0.5 &&
                     info.hole.r >= info.target.r - 0.5 && info.hole.b >= info.target.b - 0.5;
    const okTip = info.tip.l >= 0 && info.tip.t >= 0 && info.tip.r <= info.vw && info.tip.b <= info.vh;
    console.log(`  · 第${info.idx+1}步 ${info.sel}  洞[${info.hole.l.toFixed(0)},${info.hole.t.toFixed(0)},${info.hole.r.toFixed(0)},${info.hole.b.toFixed(0)}] 气泡[${info.tip.l.toFixed(0)},${info.tip.t.toFixed(0)} → ${info.tip.r.toFixed(0)},${info.tip.b.toFixed(0)}]`);
    if(okTarget) pass(`  ${info.title}：高亮框套住了目标元素`); else fail(`${info.title}：高亮框没套住目标`);
    if(okTip) pass(`  ${info.title}：气泡完整在视口内`); else fail(`${info.title}：气泡越界`);
    await page.screenshot({ path: path.join(OUT, `tour-${String(info.idx+1).padStart(2,'0')}.png`) });
    if(info.idx === steps - 1){ await page.evaluate(() => tourGo(1)); await page.waitForTimeout(250); break; }
    await page.evaluate(() => tourGo(1));
    await page.waitForTimeout(260);
  }
  const closed = await page.evaluate(() => ({ layer: !!document.getElementById('tourLayer'), seen: !!S.tourSeen }));
  if(!closed.layer) pass(`走完 ${visited} 步后浮层已关闭`); else fail('导览结束后浮层还在');
  if(closed.seen) pass('S.tourSeen 已置位（不会下次再弹）'); else fail('S.tourSeen 没置位');

  /* 每一步都要真的被走到。锚点找不到时导览会「静默跳过」——
     对「常用功能」那四步来说，跳过就等于没讲，所以必须断言走过。 */
  const allSels = await page.evaluate(() => TOUR_STEPS.map(s => s.sel));
  const missed = allSels.filter(s => !seenSels.includes(s));
  missed.length === 0
    ? pass(`全部 ${allSels.length} 步都被走到了（没有静默跳过）`)
    : fail(`有 ${missed.length} 步被跳过了：${missed.join(', ')}`);

  /* 「常用工具」四个入口是 v1.9.4 新增的重点内容 —— 单独点一次名 */
  for(const [sel, name] of [['[data-tour="nav"]','校务导航'], ['[data-tour="tpl"]','常用模板'],
                            ['[data-tour="pol"]','AI 辅导员'], ['[data-tour="cal"]','校历作息']]){
    seenSels.includes(sel) ? pass(`常用功能导览：${name} 讲到了`) : fail(`常用功能导览漏了：${name}`);
  }

  /* ---------- [1b] 「常用工具」被折叠时，导览要临时展开、结束后还原 ---------- */
  console.log('\n[1b] 「常用工具」折叠时的行为');
  await page.evaluate(() => { S.sideFold = { tools: true }; renderSidebar(); save(); });
  await page.waitForTimeout(250);
  const anchorGone = await page.evaluate(() => !document.querySelector('.side-item[data-tour="nav"]'));
  anchorGone ? pass('折叠后四个「常用功能」锚点确实不存在（所以不做处理就会被跳过）')
             : fail('前置条件不成立：折叠了锚点还在');

  await page.evaluate(() => startTour());
  await page.waitForTimeout(350);
  const anchorBack = await page.evaluate(() => !!document.querySelector('.side-item[data-tour="nav"]'));
  anchorBack ? pass('开始导览后自动临时展开，锚点出现（这 4 步不会被跳过）')
             : fail('导览没能展开分组，四个常用功能步骤会被静默跳过');

  await page.evaluate(() => { tourIdx = TOUR_STEPS.length - 1; renderTour(); });
  await page.waitForTimeout(200);
  await page.evaluate(() => tourGo(1));            // 越过最后一步 → 收尾
  await page.waitForTimeout(350);
  const restored = await page.evaluate(() => ({ fold: !!(S.sideFold && S.sideFold.tools), layer: !!document.getElementById('tourLayer') }));
  restored.fold && !restored.layer
    ? pass('导览结束后「常用工具」还原成折叠状态（不擅自改用户偏好）')
    : fail(`没还原：fold=${restored.fold} 浮层在=${restored.layer}`);

  // 还原"没动过"的场景：键不存在时，收尾应把临时写的键删掉，不留脏数据
  const cleanState = await page.evaluate(() => {
    delete S.sideFold.tools; renderSidebar();
    startTour();
    tourIdx = TOUR_STEPS.length - 1; renderTour(); tourGo(1);
    return { hasKey: Object.prototype.hasOwnProperty.call(S.sideFold, 'tools') };
  });
  !cleanState.hasKey
    ? pass('原本没动过折叠设置时，收尾不留脏键（S.sideFold 里没有 tools）')
    : fail('收尾在用户数据里留了 tools 脏键');
  await page.evaluate(() => { S.sideFold = {}; renderSidebar(); S.tourSeen = true; save(); });
  await page.waitForTimeout(200);

  console.log('\n[2] 二维码能不能显示');
  const qr = await page.evaluate(async () => {
    const load = src => new Promise(res => { const i = new Image(); i.onload = ()=>res([i.naturalWidth, i.naturalHeight]); i.onerror = ()=>res([0,0]); i.src = src; });
    return { robot: await load(window.QR_ROBOT || QR_ROBOT),
             lulu:  await load(window.QR_XIAOLUNAN || QR_XIAOLUNAN),
             botUrl: BOT_URL };
  });
  qr.robot[0] > 0 ? pass(`机器人二维码可解码 ${qr.robot[0]}×${qr.robot[1]}`) : fail('机器人二维码是破图');
  qr.lulu[0]  > 0 ? pass(`鹿晓南二维码可解码 ${qr.lulu[0]}×${qr.lulu[1]}`)   : fail('鹿晓南二维码是破图');
  console.log('  · 机器人链接 =', qr.botUrl);

  console.log('\n[3] 页面截图（人工过一眼）');
  await page.evaluate(() => { if(typeof gotoPol === 'function') gotoPol(); });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, 'v192-assistant.png'), fullPage: true });
  pass('AI 辅导员页已截图');
  await page.evaluate(() => { if(typeof gotoSettings === 'function') gotoSettings(); });
  await page.waitForTimeout(400);
  await page.evaluate(() => { if(typeof renderSettings === 'function') renderSettings(); });
  await page.waitForTimeout(300);
  /* v1.9.3 起「关于」里的二维码已删掉（挪到 AI 辅导员页，并各配「复制链接」）。
     这条断言因此翻转：现在要断的是"没有"。页面细节由 shot-v193.js 负责，这里只留一处哨兵。 */
  const aboutHasQr = await page.evaluate(() =>
    [...document.querySelectorAll('.about-box img')].some(i => i.naturalWidth > 0));
  !aboutHasQr ? pass('系统设置·关于 里已无二维码（v1.9.3 起）') : fail('关于里又冒出二维码了');
  await page.screenshot({ path: path.join(OUT, 'v192-settings.png'), fullPage: true });
  pass('系统设置页已截图');

  if(errs.length){ console.log('\n页面运行期报错：'); errs.slice(0,10).forEach(e=>console.log('  ! ' + e)); failN += errs.length; }
  else pass('\n运行期无 JS 报错');

  await browser.close();
  console.log(failN ? `\n共 ${failN} 项问题` : '\n全部通过 ✅');
  process.exit(failN ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

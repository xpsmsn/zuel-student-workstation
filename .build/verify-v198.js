/* v1.9.8 四项改动的真机核对（含真实下载一份内置模板验证字节） */
const fs = require('fs');
const { chromium } = require('C:/Users/xpsms/.workbuddy/binaries/node/workspace/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ channel: 'msedge' });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2, acceptDownloads: true });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('http://127.0.0.1:8899/中南大学生工作台.html', { waitUntil: 'load' });
  await p.waitForTimeout(600);
  await p.evaluate(() => {
    if (typeof enterApp === 'function') enterApp();
    S.guideSeen = true; S.tourSeen = true; S.backupRemindSnoozeUntil = Date.now() + 7 * 86400000;
    if (!S.batches.length) S.batches.push(makeBatch('法语2401', 'demo', SEED_DATA.map(d => ({ ...d }))));
    attachBatch(S.batches[0].id); save();
  });

  await p.evaluate(() => { S.view = 'pol'; renderMain(); });
  await p.waitForTimeout(300);
  const ai = await p.evaluate(() => document.getElementById('mainArea').innerText);
  console.log('[AI页]  在浏览器打开:', ai.includes('在浏览器打开') ? '✗ 还在' : '✓ 已去掉', '| 复制链接:', ai.includes('复制链接') ? '✓' : '✗');
  await p.screenshot({ path: '.build/v198-ai.png' });

  await p.evaluate(() => gotoGuide());
  await p.waitForTimeout(300);
  const gd = await p.evaluate(() => ({ t: document.getElementById('mainArea').innerText, h: Math.round(document.querySelector('.guide-head').getBoundingClientRect().height) }));
  console.log('[指引页] 标题:', (gd.t.split('\n')[0] || '').trim(), '| 头部高', gd.h + 'px', '| 第④步:', gd.t.includes('第 ④ 步') ? '✗ 还在' : '✓ 无');
  await p.screenshot({ path: '.build/v198-guide.png' });

  await p.evaluate(() => {
    S.students[0]['关注标签'] = '🎭'; S.students[1]['关注标签'] = '👩‍👦⛄'; save();
    S.view = 'list'; S.classFilter = 'all'; S.quickView = 'all'; renderMain();
  });
  await p.waitForTimeout(300);
  const rows = await p.evaluate(() => [...document.querySelectorAll('#mainArea tbody tr')].slice(0, 2).map(r => r.innerText.replace(/\s+/g, ' ').trim().slice(0, 26)));
  console.log('[列表]  前两行:', JSON.stringify(rows));
  await p.screenshot({ path: '.build/v198-tags-list.png' });

  await p.evaluate(() => openDetail(String(S.students[0]['学号'])));
  await p.waitForTimeout(300);
  const dt = await p.evaluate(() => document.getElementById('modalRoot').innerText);
  console.log('[详情]  标签行:', dt.includes('关注标签') ? '✓' : '✗', '| 自定义入口:', dt.includes('自定义标签') ? '✓' : '✗');
  await p.screenshot({ path: '.build/v198-tags-detail.png' });
  await p.evaluate(() => closeModal());

  await p.evaluate(() => { S.view = 'tpl'; renderLibPage('templates'); });
  await p.waitForTimeout(400);
  const sect = await p.evaluate(() => {
    const c = [...document.querySelectorAll('.card')].find(x => x.innerText.includes('表单模板'));
    return c ? c.innerText.replace(/\s+/g, ' ').slice(0, 130) : '(没找到)';
  });
  console.log('[模板区]', sect);
  await p.screenshot({ path: '.build/v198-templates.png' });

  const dlp = p.waitForEvent('download');
  await p.evaluate(() => saveBuiltinTemplate(0));
  const d = await dlp;
  const buf = fs.readFileSync(await d.path());
  console.log('[真下载]', d.suggestedFilename(), '|', buf.length, '字节 | 头4字节', JSON.stringify(buf.slice(0, 4).toString('latin1')));
  console.log('JS 报错:', errs.length ? errs.slice(0, 3) : '无');
  await b.close();
})();

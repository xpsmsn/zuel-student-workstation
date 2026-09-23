/* 截图核对 v1.9.6 的导入弹窗：方式三卡一行排布 + 字段勾选列。
   用法: node .build/shot-import.js <页面URL> <输出目录> */
const path = require('path');
const NODE_WS = 'C:/Users/xpsms/.workbuddy/binaries/node/workspace/node_modules';
const { chromium } = require(path.join(NODE_WS, 'playwright'));

const BASE = process.argv[2] || 'http://127.0.0.1:8899/中南大学生工作台.html';
const OUT = process.argv[3] || '.build';

(async () => {
  const browser = await chromium.launch({ channel: 'msedge' });
  const errs = [];

  for (const [key, w, h, mobile] of [['desktop', 1280, 860, false], ['phone', 412, 915, true]]) {
    const ctx = await browser.newContext({
      viewport: { width: w, height: h }, deviceScaleFactor: 2,
      isMobile: mobile, hasTouch: mobile,
      userAgent: mobile
        ? 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
        : undefined,
    });
    const page = await ctx.newPage();
    page.on('pageerror', e => errs.push(`${key}: ${e}`));
    page.on('console', m => { if (m.type() === 'error') errs.push(`${key} console: ${m.text()}`); });

    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      if (typeof enterApp === 'function') enterApp();
      S.guideSeen = true; S.tourSeen = true; S.backupRemindSnoozeUntil = Date.now() + 7 * 86400000;
      if (!S.batches.length) { S.batches.push(makeBatch('示例批次', 'demo', SEED_DATA.map(d => ({ ...d })))); }
      attachBatch(S.batches[0].id);
      save();
    });
    await page.waitForTimeout(400);

    // 打开导入弹窗（step 1：三张方式卡）
    await page.evaluate(() => openImport());
    await page.waitForTimeout(400);
    const cards = await page.evaluate(() => {
      const box = document.querySelector('.modes');
      if (!box) return null;
      const rs = [...box.querySelectorAll('.mode-card')].map(c => {
        const r = c.getBoundingClientRect(); return { t: c.innerText.replace(/\s+/g, ' ').trim(), top: Math.round(r.top), h: Math.round(r.height) };
      });
      return { count: rs.length, sameRow: rs.length === 3 && rs[0].top === rs[1].top && rs[1].top === rs[2].top,
               compact: rs.every(c => c.h < 70), cards: rs, boxW: Math.round(box.getBoundingClientRect().width) };
    });
    if (!cards || cards.count !== 3) { console.error(`  ✗ [${key}] 方式卡数量异常`); }
    else if (mobile) {
      // 窄屏（≤560px）设计上落成单列：断言"三张都是单行紧凑卡"而不是"同一行"
      cards.compact && cards.cards.every((c, i) => i === 0 || c.top > cards.cards[i - 1].top)
        ? console.log(`  ✓ [${key}] 窄屏落成单列，三张都是单行紧凑卡（各高 ${cards.cards.map(c => c.h).join('/')}px，"新建批次"不再被挤出）`)
        : console.error(`  ✗ [${key}] 窄屏卡片过高或顺序异常：${JSON.stringify(cards.cards)}`);
    }
    else if (!cards.sameRow) console.error(`  ✗ [${key}] 三张卡不在同一行：${JSON.stringify(cards.cards.map(c => c.t))}`);
    else console.log(`  ✓ [${key}] 三张方式卡同一行（宽 ${cards.boxW}px，各高 ${cards.cards[0].h}px）`);
    await page.screenshot({ path: path.join(OUT, `imp-${key}-step1.png`) });

    // step 2：塞一份解析结果，看字段勾选列
    await page.evaluate(() => {
      const rawHeader = ['姓名', '学号', '性别', '民族', '政治面貌', '手机号', '住宿地址', '备注（保密）'];
      const rawRows = [
        ['张三', '2026001', '男', '汉族', '共青团员', '13800000001', '滨湖1栋101-01', ''],
        ['李四', '2026002', '女', '回族', '群众', '13800000002', '滨湖1栋101-02', '家里有事，多关注'],
      ];
      buildImportState(rawHeader, rawRows, '示例_学生信息.xlsx', 0, [1, 2]);
      importState.skipCols = new Set(['民族']);
      renderImport();          // ⚠️ 手动改状态后必须重渲染，否则看到的是旧界面
    });
    await page.waitForTimeout(400);
    const chk = await page.evaluate(() => {
      const boxes = [...document.querySelectorAll('.map-tbl input[type=checkbox]')];
      const summary = (document.querySelector('.modal-body .hint') || {}).innerText || '';
      return { boxes: boxes.length, unchecked: boxes.filter(b => !b.checked).length, summary };
    });
    if (chk.boxes < 5) console.error(`  ✗ [${key}] 勾选框数量异常：${chk.boxes}`);
    else if (chk.unchecked !== 1) console.error(`  ✗ [${key}] 应只有 1 个取消勾选（民族），实为 ${chk.unchecked}`);
    else console.log(`  ✓ [${key}] 字段勾选列正常（${chk.boxes} 个可勾，1 个已取消）`);
    await page.screenshot({ path: path.join(OUT, `imp-${key}-step2.png`) });
    await ctx.close();
  }

  await browser.close();
  if (errs.length) { console.log('\n运行期报错：'); errs.slice(0, 6).forEach(e => console.log('  ! ' + e)); process.exit(1); }
  console.log('\n无 JS 报错 ✅');
})().catch(e => { console.error(e); process.exit(1); });

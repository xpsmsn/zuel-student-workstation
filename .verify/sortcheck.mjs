/**
 * 第三轮回归：多级排序逐级取消（P1-5）+ 窄屏卡片工具条（P1-4）+ 筛选后焦点还原（P1-8）
 *                + 表格首列粘住（P2-4）
 *
 * 用法：node .verify/sortcheck.mjs [--shots]
 * 断言失败即 exit 1。
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = 'D:/Develop/辅导员工作台';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PAGE = pathToFileURL(path.join(ROOT, 'app/src/index.html')).href;
const PORT = 9333;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function waitForTarget() {
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await r.json();
      const t = list.find(x => x.type === 'page' && x.webSocketDebuggerUrl);
      if (t) return t;
    } catch {}
    await sleep(200);
  }
  throw new Error('CDP target 未就绪');
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) {
        const { res, rej } = pending.get(m.id);
        pending.delete(m.id);
        m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
      }
    };
    ws.onerror = e => reject(e);
    ws.onopen = () => resolve({
      send(method, params = {}) {
        const mid = ++id;
        return new Promise((res, rej) => { pending.set(mid, { res, rej }); ws.send(JSON.stringify({ id: mid, method, params })); });
      },
      close: () => ws.close(),
    });
  });
}
const evalJS = async (cdp, expr) => {
  const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''));
  return r.result.value;
};

const results = [];
const check = (name, ok, detail) => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail ?? ''}`); };

const SCRIPT = `(() => {
  const stack = () => sortStack().map(x => x.key + ':' + x.dir);
  const chain = () => document.getElementById('sortChain');
  const chips = () => [...document.querySelectorAll('#sortChain .sort-chip')];
  const out = {};
  const reset = () => { S.sort = { key:'', dir:'desc', stack:[] }; S.listCols = null; selRows.clear(); renderMain(); };

  reset();

  /* --- 1. 单级：一枚 chip，没有级别数字 --- */
  setSort('成绩');
  out.singleCount = chips().length;
  out.singleAria = chips()[0] ? chips()[0].getAttribute('aria-label') : null;
  out.singleHasLv = !!document.querySelector('#sortChain .sort-chip .lv');
  out.stack1 = stack();

  /* --- 2. 叠加到两级：chip 顺序 = 优先级顺序，带 1/2 --- */
  setSort('班级');
  out.twoCount = chips().length;
  out.stack2 = stack();
  out.twoAria = chips().map(c => c.getAttribute('aria-label'));
  out.lvTexts = [...document.querySelectorAll('#sortChain .sort-chip .lv')].map(e => e.textContent);

  /* --- 3. 撤掉第 2 级，第 1 级必须还在（P1-5 的核心）。焦点断言要等一帧，见 main() --- */
  out.beforeRemoveStack = stack();
  out.beforeRemoveKeys = chips().map(c => c.textContent.trim());
  out.removeTargetKey = stack()[1].split(':')[0];

  /* --- 4. 首列粘住 --- */
  setSort('成绩');
  const td = document.querySelector('.tbl-wrap:not(.as-cards) tbody td:first-child');
  const th = document.querySelector('.tbl-wrap:not(.as-cards) thead th:first-child');
  out.stickyTd = td ? getComputedStyle(td).position + '/' + getComputedStyle(td).left : null;
  out.stickyTh = th ? getComputedStyle(th).position + '/' + getComputedStyle(th).left : null;

  /* --- 5. P1-8：页面没滚动时，整块重绘也必须把焦点还原 --- */
  const f = document.querySelector('#mainArea .fsearch');
  f.focus();
  const before = document.activeElement === f;
  renderMain();                                  // 不滚动、直接重绘（老代码在这里跳过还原）
  const af = document.activeElement;
  out.focusRestore = { before, after: af && af.className, tag: af && af.tagName,
                       insideMain: !!(af && af.closest && af.closest('#mainArea')) };
  return out;
})()`;

/* 撤级 → 等一帧 → 看焦点；再全部清除 → 看链与按钮是否消失 */
const REMOVE = `(() => {
  const chips = [...document.querySelectorAll('#sortChain .sort-chip')];
  chips[1].click();
  return { stack: sortStack().map(x => x.key + ':' + x.dir), count: document.querySelectorAll('#sortChain .sort-chip').length };
})()`;
const FOCUS_NOW = `(() => {
  const a = document.activeElement;
  return { cls: (a && a.className) || '', tag: a && a.tagName, inChain: !!(a && a.closest && a.closest('#sortChain')) };
})()`;
const CLEAR = `(() => {
  const btn = document.querySelector('#sortChain .sort-clear');
  if(btn) btn.click();
  return { chain: !!document.getElementById('sortChain'), stack: sortStack().length,
           cardBtn: [...document.querySelectorAll('.card-head .tb-btn')].some(b => b.textContent.trim() === '取消排序') };
})()`;

const NARROW = `(() => {
  const out = {};
  out.isNarrow = isNarrow();
  const bar = document.querySelector('.card-toolbar');
  out.toolbar = !!bar;
  if(!bar) return out;
  out.cb = !!bar.querySelector('input[type=checkbox]');
  out.selOptions = [...bar.querySelectorAll('option')].map(o => o.value);
  out.selValue = bar.querySelector('select').value;
  out.dirBtn = !!document.getElementById('cardDir');

  /* 选一列 → 链出现、方向按钮出现 */
  const select = bar.querySelector('select');
  cardSort('成绩');
  out.afterPickStack = sortStack().map(x => x.key + ':' + x.dir);
  out.afterPickDir = (document.getElementById('cardDir') || {}).textContent?.trim();
  out.afterPickSel = document.querySelector('.card-toolbar select')?.value;

  /* 切方向 */
  flipSortTop();
  out.afterFlipStack = sortStack().map(x => x.key + ':' + x.dir);
  out.afterFlipDir = (document.getElementById('cardDir') || {}).textContent?.trim();

  /* 全选 */
  const cb = document.querySelector('.card-toolbar input[type=checkbox]');
  cb.click();
  out.selAll = selRows.size === curList.length && curList.length > 0;
  out.selCount = selRows.size + '/' + curList.length;
  document.querySelector('.card-toolbar input[type=checkbox]').click();
  out.selCleared = selRows.size === 0;

  /* 回到默认顺序 */
  cardSort('');
  out.afterReset = sortStack().length;
  out.afterResetDir = !!document.getElementById('cardDir');
  return out;
})()`;

async function main() {
  const edge = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--hide-scrollbars', '--window-size=1440,900',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(ROOT, '.verify/prof-sort')}`,
    PAGE,
  ], { stdio: 'ignore' });

  let cdp;
  try {
    const target = await waitForTarget();
    cdp = await connect(target.webSocketDebuggerUrl);
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

    for (let i = 0; i < 120; i++) {
      if (await evalJS(cdp, `document.readyState === 'complete' && typeof setSort === 'function' && !!document.querySelector('#mainArea .fsearch')`)) break;
      await sleep(200);
    }
    await sleep(500);

    const w = await evalJS(cdp, SCRIPT);
    console.log('\n--- 1440px ---');
    console.log(JSON.stringify(w, null, 1));

    check('单级排序只有 1 枚 chip', w.singleCount === 1, `count=${w.singleCount}`);
    check('单级 chip 的可访问名不含级别', w.singleAria && !/第 \d+ 级/.test(w.singleAria) && /点击取消这一级排序/.test(w.singleAria), w.singleAria);
    check('单级 chip 不显示级别数字', w.singleHasLv === false, `hasLv=${w.singleHasLv}`);
    check('两级排序 = 2 枚 chip，顺序即优先级', w.twoCount === 2 && w.stack2.join(',') === '班级:asc,成绩:desc', w.stack2.join(','));
    check('两级 chip 的可访问名带「第 N 级」', w.twoAria.every((a, i) => a.includes(`第 ${i + 1} 级`)), JSON.stringify(w.twoAria));
    check('chip 上的级别标记 = ①②', w.lvTexts.join('') === '①②', w.lvTexts.join(','));
    check('首列表头粘住', w.stickyTh === 'sticky/0px', `th=${w.stickyTh}`);
    check('首列单元格粘住', w.stickyTd === 'sticky/0px', `td=${w.stickyTd}`);
    check('未滚动时重绘也还原焦点', w.focusRestore.before === true && w.focusRestore.insideMain === true, JSON.stringify(w.focusRestore));

    /* --- 撤级（点后要等一帧，rAF 里才把焦点挪回链上） --- */
    await evalJS(cdp, `S.sort = { stack:[{key:'班级',dir:'asc'},{key:'成绩',dir:'desc'}] }; renderMain(); true`);
    await sleep(250);
    const r = await evalJS(cdp, REMOVE);
    await sleep(300);
    const focusNow = await evalJS(cdp, FOCUS_NOW);
    console.log(`撤级：${w.beforeRemoveKeys.join(' | ')} → 撤「${w.removeTargetKey}」→ ${r.stack.join(',')} focus=${JSON.stringify(focusNow)}`);
    check('撤掉第 2 级后第 1 级仍在', r.count === 1 && r.stack.join(',') === '班级:asc', `count=${r.count} stack=${r.stack.join(',')}`);
    check('撤级后焦点留在排序链上', focusNow.inChain === true, `focus=${focusNow.tag}.${focusNow.cls}`);

    const c = await evalJS(cdp, CLEAR);
    await sleep(200);
    check('全部清除后链与按钮都消失', c.chain === false && c.stack === 0 && c.cardBtn === false, `chain=${c.chain} btn=${c.cardBtn}`);

    // 窄屏：卡片工具条
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 420, height: 740, deviceScaleFactor: 1, mobile: false });
    await sleep(300);
    await evalJS(cdp, `renderMain()`);
    await sleep(300);
    const n = await evalJS(cdp, NARROW);
    console.log('\n--- 420px ---');
    console.log(JSON.stringify(n, null, 1));

    check('窄屏进入卡片模式', n.isNarrow === true, `isNarrow=${n.isNarrow}`);
    check('卡片模式有工具条', n.toolbar === true, `toolbar=${n.toolbar}`);
    check('工具条带全选 checkbox', n.cb === true, `cb=${n.cb}`);
    check('排序下拉含「默认顺序」+ 可排序列', n.selOptions[0] === '' && n.selOptions.length >= 3, n.selOptions.join(','));
    check('选列后排序生效且方向按钮出现', n.afterPickStack[0] === '成绩:desc' && !!n.afterPickDir, `${n.afterPickStack} dir=${n.afterPickDir}`);
    check('下拉回显当前排序列', n.afterPickSel === '成绩', `sel=${n.afterPickSel}`);
    check('切方向后链与按钮同步', n.afterFlipStack[0] === '成绩:asc' && /升序/.test(n.afterFlipDir || ''), `${n.afterFlipStack} dir=${n.afterFlipDir}`);
    check('工具条全选选中当前列表', n.selAll === true, `sel=${n.selCount}`);
    check('再点取消全选', n.selCleared === true, `size=${n.selCleared}`);
    check('回默认顺序后链与方向按钮消失', n.afterReset === 0 && n.afterResetDir === false, `stack=${n.afterReset} dirBtn=${n.afterResetDir}`);

    const bad = results.filter(r => !r.ok);
    console.log(`\n${bad.length ? '❌' : '✅'} ${results.length - bad.length}/${results.length} 通过`);
    process.exit(bad.length ? 1 : 0);
  } finally {
    try { cdp && cdp.close(); } catch {}
    edge.kill();
  }
}
main().catch(e => { console.error(e); process.exit(1); });

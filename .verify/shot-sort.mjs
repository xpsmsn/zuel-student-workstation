/**
 * 第三轮证据截图：多级排序链（1440）+ 卡片工具条（420）
 * 用法：node .verify/shot-sort.mjs
 */
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = 'D:/Develop/辅导员工作台';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PAGE = pathToFileURL(path.join(ROOT, 'app/src/index.html')).href;
const PORT = 9338;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function waitForTarget() {
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const l = await r.json();
      const t = l.find(x => x.type === 'page' && x.webSocketDebuggerUrl);
      if (t) return t;
    } catch {}
    await sleep(200);
  }
  throw new Error('no target');
}
function connect(u) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(u); let id = 0; const p = new Map();
    ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && p.has(m.id)) { const { r, j } = p.get(m.id); p.delete(m.id); m.error ? j(new Error(JSON.stringify(m.error))) : r(m.result); } };
    ws.onerror = rej;
    ws.onopen = () => res({ send(method, params = {}) { const i = ++id; return new Promise((r, j) => { p.set(i, { r, j }); ws.send(JSON.stringify({ id: i, method, params })); }); }, close: () => ws.close() });
  });
}
const ev = async (cdp, x) => {
  const r = await cdp.send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result.value;
};

const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
  '--window-size=1440,900', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${path.join(ROOT, '.verify/prof-shot')}`, PAGE], { stdio: 'ignore' });
let cdp;
try {
  const t = await waitForTarget();
  cdp = await connect(t.webSocketDebuggerUrl);
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  for (let i = 0; i < 120; i++) {
    if (await ev(cdp, `document.readyState==='complete' && typeof setSort==='function' && !!document.querySelector('#mainArea .fsearch')`)) break;
    await sleep(200);
  }
  await sleep(700);

  // 两级排序：先成绩、再班级（班级提到第 1 级）
  await ev(cdp, `S.sort={key:'',dir:'desc',stack:[]}; setSort('成绩'); setSort('班级'); true`);
  await sleep(500);
  let shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  await writeFile(path.join(ROOT, '.verify/shot-sort-chain.png'), Buffer.from(shot.data, 'base64'));
  console.log('✓ shot-sort-chain.png', JSON.stringify(await ev(cdp, `sortStack()`)));

  // 撤掉第 1 级 → 只剩成绩（证明逐级取消）
  await ev(cdp, `document.querySelectorAll('#sortChain .sort-chip')[0].click(); true`);
  await sleep(400);
  shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  await writeFile(path.join(ROOT, '.verify/shot-sort-chain-1.png'), Buffer.from(shot.data, 'base64'));
  console.log('✓ shot-sort-chain-1.png', JSON.stringify(await ev(cdp, `sortStack()`)));

  // 窄屏卡片工具条
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 420, height: 740, deviceScaleFactor: 1, mobile: false });
  await sleep(300);
  await ev(cdp, `renderMain()`);
  await sleep(500);
  shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  await writeFile(path.join(ROOT, '.verify/shot-card-toolbar.png'), Buffer.from(shot.data, 'base64'));
  console.log('✓ shot-card-toolbar.png toolbar=', await ev(cdp, `!!document.querySelector('.card-toolbar')`));
} finally {
  try { cdp && cdp.close(); } catch {}
  edge.kill();
}

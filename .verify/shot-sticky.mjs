/**
 * 证据图：表格横向滚动时首列（勾选列）粘住
 * 用法：node .verify/shot-sticky.mjs
 */
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = 'D:/Develop/辅导员工作台';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PAGE = pathToFileURL(path.join(ROOT, 'app/src/index.html')).href;
const PORT = 9340;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function waitForTarget() {
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/list`); const l = await r.json();
      const t = l.find(x => x.type === 'page' && x.webSocketDebuggerUrl); if (t) return t; } catch {}
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
  '--window-size=1280,900', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${path.join(ROOT, '.verify/prof-shot3')}`, PAGE], { stdio: 'ignore' });
let cdp;
try {
  const t = await waitForTarget();
  cdp = await connect(t.webSocketDebuggerUrl);
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  for (let i = 0; i < 120; i++) {
    if (await ev(cdp, `document.readyState==='complete' && typeof renderMain==='function'`)) break;
    await sleep(200);
  }
  await sleep(700);
  const info = await ev(cdp, `(() => {
    const w = document.querySelector('.tbl-wrap');
    if(!w) return {err:'no .tbl-wrap'};
    w.scrollLeft = 520;
    const th = w.querySelector('thead th');
    const td = w.querySelector('tbody td');
    const cs = getComputedStyle(td);
    return { scrollLeft: w.scrollLeft, scrollW: w.scrollWidth, clientW: w.clientWidth,
             thPos: getComputedStyle(th).position, tdPos: cs.position, tdLeft: cs.left, tdBg: cs.backgroundColor };
  })()`);
  console.log(JSON.stringify(info));
  await sleep(300);
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  await writeFile(path.join(ROOT, '.verify/shot-sticky-col.png'), Buffer.from(shot.data, 'base64'));
  console.log('✓ shot-sticky-col.png');
} finally {
  try { cdp && cdp.close(); } catch {}
  edge.kill();
}

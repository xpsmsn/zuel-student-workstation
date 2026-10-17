/**
 * 证据图：窄屏卡片工具条（把 mainArea 滚到工具条位置再截）
 * 用法：node .verify/shot-card-tb.mjs
 */
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = 'D:/Develop/辅导员工作台';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PAGE = pathToFileURL(path.join(ROOT, 'app/src/index.html')).href;
const PORT = 9339;
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
  '--window-size=420,740', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${path.join(ROOT, '.verify/prof-shot2')}`, PAGE], { stdio: 'ignore' });
let cdp;
try {
  const t = await waitForTarget();
  cdp = await connect(t.webSocketDebuggerUrl);
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 420, height: 740, deviceScaleFactor: 1, mobile: false });
  for (let i = 0; i < 120; i++) {
    if (await ev(cdp, `document.readyState==='complete' && typeof renderMain==='function'`)) break;
    await sleep(200);
  }
  await sleep(600);
  await ev(cdp, `S.sort={key:'',dir:'desc',stack:[]}; renderMain(); true`);
  await sleep(400);
  // 滚到工具条上方一点，让「全选 + 排序下拉」和下面的学生卡片同框
  const y = await ev(cdp, `(() => {
    const bar = document.querySelector('.card-toolbar');
    const host = document.getElementById('mainArea');
    host.scrollTop = bar.getBoundingClientRect().top + host.scrollTop - 150;
    return host.scrollTop;
  })()`);
  await sleep(400);
  console.log('scrollTop=', y, 'toolbar=', await ev(cdp, `!!document.querySelector('.card-toolbar')`));
  // 轻点一下排序下拉，让它展开 —— 截图里能看到可选项
  await ev(cdp, `(() => { const s = document.querySelector('.card-toolbar select');
    s.focus(); s.size = 4; s.style.height = 'auto'; return true; })()`);
  await sleep(300);
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  await writeFile(path.join(ROOT, '.verify/shot-card-toolbar-420.png'), Buffer.from(shot.data, 'base64'));
  console.log('✓ shot-card-toolbar-420.png');
} finally {
  try { cdp && cdp.close(); } catch {}
  edge.kill();
}

/* 截图基线：按模块抓 1440×900 与 420×740 两张，用于改前/改后像素对比
   用法: node .verify/shot-pages.mjs <前缀>       例: node .verify/shot-pages.mjs b3
   产物: .verify/shot-<前缀>-<模块>.png */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PREFIX = process.argv[2] || 'x';
const FILE = path.resolve('app/src/index.html');
const PROFILE = path.resolve('.verify/prof-shot');
const PORT = 9345;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.rmSync(PROFILE, { recursive: true, force: true });

const edge = spawn('msedge', [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
  '--window-size=1440,900', '--hide-scrollbars', pathToFileURL(FILE).href,
], { stdio: 'ignore' });

let ws, id = 0;
const pending = new Map();
async function connect() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page' && t.url.startsWith('file:'));
      if (page) {
        ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
        ws.onmessage = (e) => {
          const m = JSON.parse(e.data);
          if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
        };
        return;
      }
    } catch { /* 还没起来 */ }
    await sleep(250);
  }
  throw new Error('连不上 Edge CDP');
}
const send = (method, params = {}) => new Promise((res) => {
  const mid = ++id;
  pending.set(mid, res);
  ws.send(JSON.stringify({ id: mid, method, params }));
});
const evalJs = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  return r.result && r.result.result ? r.result.result.value : undefined;
};
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  const out = `.verify/shot-${PREFIX}-${name}.png`;
  fs.writeFileSync(out, Buffer.from(r.result.data, 'base64'));
  console.log(`  ✓ ${out}`);
};

await connect();
await send('Page.enable');
await send('Runtime.enable');
await send('DOM.enable');
await sleep(2500);

const MODULES = [
  ['students', '全部学生'],
  ['dorm', '宿舍看板'],
  ['award', '奖学金评选'],
  ['overview', '数据总览'],
];

async function setViewport(width, height) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
  await send('Emulation.setTouchEmulationEnabled', { enabled: width < 600, maxTouchPoints: width < 600 ? 5 : 0 });
  await sleep(300);
}

await setViewport(1440, 900);
for (const [name, label] of MODULES) {
  const ok = await evalJs(`(() => {
    const it=[...document.querySelectorAll('.side-item')].find(x=>x.textContent.includes(${JSON.stringify(label)}));
    if(!it) return false; it.click(); return true; })()`);
  if (!ok) { console.log(`  ! 点不到「${label}」`); continue; }
  await sleep(700);
  await shot(name);
}

/* 窄屏：验证统计卡列数（P1-3 的回归面） */
await setViewport(420, 740);
const okStu = await evalJs(`(() => { const it=[...document.querySelectorAll('.side-item')].find(x=>x.textContent.includes('全部学生')); if(!it) return false; it.click(); return true; })()`);
await sleep(700);
if (okStu) await shot('students-420');
const gridInfo = await evalJs(`(() => {
  const g = document.querySelector('.stats-4') || document.querySelector('.stats');
  if(!g) return null;
  const cs = getComputedStyle(g);
  return { cols: cs.gridTemplateColumns.split(' ').length, template: cs.gridTemplateColumns, w: Math.round(g.getBoundingClientRect().width) };
})()`);
console.log('  窄屏统计条: ' + JSON.stringify(gridInfo));

/* 字号实测：落地后到底几个值 */
const fsInfo = await evalJs(`(() => {
  const m = new Map();
  const walk = (n) => { if (n.nodeType === 1) { const s = getComputedStyle(n).fontSize; m.set(s, (m.get(s)||0)+1); }
    for (const c of n.childNodes) walk(c); };
  walk(document.body);
  return [...m.entries()].sort((a,b)=>parseFloat(a[0])-parseFloat(b[0]));
})()`);
console.log('  实测字号档: ' + JSON.stringify(fsInfo));

ws.close();
edge.kill();
console.log('完成');

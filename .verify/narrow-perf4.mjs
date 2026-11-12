/**
 * 窄屏卡顿排查 v4：模拟「拖动窗口从宽到最窄」这个过程本身的代价。
 * 70ms 一步、1400 → 360（穿过 760 断点，会切到卡片模式），同时记录：
 *   · 每帧间隔（用户在拖动时看到的流畅度）
 *   · renderMain 真实调用次数（140ms 防抖应当只触发 1 次）
 *   · 拖动结束后那次整页重绘的耗时
 * 用法：node .verify/narrow-perf4.mjs
 */
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = 'D:/Develop/辅导员工作台';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PAGE = pathToFileURL(path.join(ROOT, '中南大学生工作台.html')).href;
const PORT = 9344;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function waitForTarget() {
  for (let i = 0; i < 150; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const t = (await r.json()).find(x => x.type === 'page' && x.webSocketDebuggerUrl);
      if (t) return t;
    } catch {}
    await sleep(200);
  }
  throw new Error('CDP target 未就绪');
}
function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0; const pending = new Map();
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
    };
    ws.onerror = e => reject(e);
    ws.onopen = () => resolve({
      send(method, params = {}) {
        const mid = ++id;
        return new Promise((res, rej) => { pending.set(mid, { res, rej }); ws.send(JSON.stringify({ id: mid, method, params })); });
      }, close: () => ws.close(),
    });
  });
}
const evalJS = async (cdp, expr) => {
  const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + JSON.stringify(r.exceptionDetails.exception?.description || ''));
  return r.result.value;
};

const SEED = n => `(() => {
  if (!S.batches || !S.batches.length) restoreDemo();
  const base = S.students.slice(); if (!base.length) return 0;
  const out = []; let i = 0;
  while (out.length < ${n}) { const s = JSON.parse(JSON.stringify(base[out.length % base.length]));
    i++; s['学号']='2024'+String(100000+i); s['姓名']='测试学生 '+String(i).padStart(4,'0'); s['姓名1']=s['姓名']; out.push(s); }
  S.students.length = 0; out.forEach(s => S.students.push(s));
  S.view='list'; renderSidebar(); renderMain();
  // 埋点：统计 renderMain 调用与每次耗时
  window.__storm = { calls: 0, ms: [] };
  const orig = window.renderMain;
  window.renderMain = function(){
    const t0 = performance.now();
    const r = orig.apply(this, arguments);
    document.getElementById('mainArea').scrollHeight;
    window.__storm.calls++; window.__storm.ms.push(+(performance.now()-t0).toFixed(1));
    return r;
  };
  return S.students.length;
})()`;

const edge = spawn(EDGE, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
  '--window-size=1500,1000', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${path.join(ROOT, '.verify/prof-narrow4')}`, PAGE], { stdio: 'ignore' });
let cdp;
try {
  const target = await waitForTarget();
  cdp = await connect(target.webSocketDebuggerUrl);
  await cdp.send('Runtime.enable'); await cdp.send('Page.enable');
  for (let i = 0; i < 150; i++) {
    if (await evalJS(cdp, `document.readyState==='complete' && typeof S==='object' && Array.isArray(S.batches)`)) break;
    await sleep(200);
  }
  await sleep(600);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  for (const n of [300, 1000]) {
    const seeded = await evalJS(cdp, SEED(n));
    await sleep(1200);
    // 在页面里挂一个帧间隔探针（不阻塞拖动）
    await evalJS(cdp, `window.__frames = []; (function loop(){ let last = performance.now();
      (function tick(){ const now = performance.now(); window.__frames.push(+(now-last).toFixed(1)); last = now;
        if (window.__frames.length < 400) requestAnimationFrame(tick); })();
    })(); true`);

    for (let w = 1400; w >= 360; w -= 40) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: false });
      await sleep(70);
    }
    await sleep(700); // 等防抖 + 落位
    const r = await evalJS(cdp, `(() => {
      const f = window.__frames.slice(2).sort((a,b)=>b-a);
      const s = window.__storm;
      return { fw: innerWidth, renderCalls: s.calls, renderMs: s.ms,
        frames: f.length, worst: +f[0].toFixed(1), p95: +f[Math.floor(f.length*0.05)].toFixed(1),
        over33: f.filter(x=>x>33).length, over100: f.filter(x=>x>100).length,
        innerH: document.getElementById('mainArea').scrollHeight };
    })()`);
    console.log(`[${seeded}人] 1400→360 拖动全过程：renderMain 调用 ${r.renderCalls} 次 ${JSON.stringify(r.renderMs)}ms`);
    console.log(`         结束宽度 ${r.fw}  内容高 ${r.innerH}  帧数 ${r.frames} p95=${r.p95}ms 最差=${r.worst}ms  >33ms:${r.over33}  >100ms:${r.over100}`);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await sleep(600);
  }
} finally {
  try { cdp?.close(); } catch {}
  edge.kill();
}

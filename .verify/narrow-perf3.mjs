/**
 * 窄屏卡顿排查 v3：无头（软件光栅，偏严苛）+ 逐步加人，找「卡」的拐点。
 * 每组量：列表重绘耗时 / 滚动帧率 / 空闲 CPU / 搜索逐字重绘耗时。
 * 用法：node .verify/narrow-perf3.mjs
 */
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = 'D:/Develop/辅导员工作台';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PAGE = pathToFileURL(path.join(ROOT, '中南大学生工作台.html')).href;
const PORT = 9343;
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
const met = async cdp => { const o = {}; for (const m of (await cdp.send('Performance.getMetrics')).metrics) o[m.name] = m.value; return o; };
const dms = (a, b, k) => +(((b[k] || 0) - (a[k] || 0)) * 1000).toFixed(0);

const SEED = n => `(() => {
  if (!S.batches || !S.batches.length) restoreDemo();
  const base = S.students.slice(); if (!base.length) return 0;
  const out = []; let i = 0;
  while (out.length < ${n}) {
    const s = JSON.parse(JSON.stringify(base[out.length % base.length]));
    i++; s['学号'] = '2024' + String(100000 + i); s['姓名'] = '测试学生 ' + String(i).padStart(4,'0'); s['姓名1'] = s['姓名'];
    out.push(s);
  }
  S.students.length = 0; out.forEach(s => S.students.push(s));
  try { S.grades = S.students.map(s => ({ '学号': s['学号'], items: [
    { name:'高等数学', credit:5, score: 60 + (Math.random()*40|0) },
    { name:'大学英语', credit:4, score: 60 + (Math.random()*40|0) } ] })); invalidateGradeMap(); } catch(e) {}
  S.view='list'; S.filters={}; S.quickView='all'; S._search='';
  renderSidebar(); renderMain();
  return S.students.length;
})()`;

const SCROLL = `new Promise(res => {
  const area = document.getElementById('mainArea');
  const gaps = []; let last = performance.now(), t0 = last;
  area.scrollTop = 0;
  (function tick(){
    const now = performance.now(); gaps.push(now - last); last = now;
    area.scrollTop += 300;
    if (now - t0 < 2000) requestAnimationFrame(tick);
    else { const s = gaps.slice(1).sort((a,b)=>b-a);
      res({ frames: s.length, fps: +(s.length/((performance.now()-t0)/1000)).toFixed(1),
            p95: +s[Math.floor(s.length*0.05)].toFixed(1), worst: +s[0].toFixed(1) }); }
  })();
})`;

const TYPE = `(() => {
  // 模拟搜索框连打 5 个字：每次输入都整页重绘
  const t = [];
  for (let i = 0; i < 5; i++) {
    const t0 = performance.now();
    S._search = '测试学生 ' + (i + 1);
    renderMain();
    document.getElementById('mainArea').scrollHeight; // 强制布局
    t.push(+(performance.now() - t0).toFixed(1));
  }
  S._search = '';
  return { perChar: t, total: +t.reduce((a,b)=>a+b,0).toFixed(1) };
})()`;

async function runAt(cdp, n, width, height, dsf, label) {
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dsf, mobile: false });
  await sleep(300);
  const seeded = await evalJS(cdp, SEED(n));
  await sleep(1500);
  const info = await evalJS(cdp, `({ nodes: document.getElementsByTagName('*').length,
    h: document.getElementById('mainArea').scrollHeight, cards: !!document.querySelector('.tbl-wrap.as-cards') })`);
  const a = await met(cdp); await sleep(3000); const b = await met(cdp);
  const scroll = await evalJS(cdp, SCROLL);
  await sleep(300);
  const type = await evalJS(cdp, TYPE);
  console.log(`\n[${label}] ${seeded}人 ${width}x${height}@${dsf}x nodes=${info.nodes} 内容高=${info.h}px 卡片模式=${info.cards}`);
  console.log(`  空闲3s  Task=${dms(a,b,'TaskDuration')}ms Script=${dms(a,b,'ScriptDuration')}ms Layout=${dms(a,b,'LayoutDuration')}ms 堆=${(b.JSHeapUsedSize/1048576).toFixed(0)}MB`);
  console.log(`  滚动2s  ${JSON.stringify(scroll)}`);
  console.log(`  搜索逐字重绘 ${JSON.stringify(type)}`);
  return { n, w: width, dsf, nodes: info.nodes, h: info.h, scroll, type, idle: dms(a,b,'TaskDuration') };
}

const edge = spawn(EDGE, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
  '--window-size=1500,1000', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${path.join(ROOT, '.verify/prof-narrow3')}`, PAGE], { stdio: 'ignore' });
let cdp;
try {
  const target = await waitForTarget();
  cdp = await connect(target.webSocketDebuggerUrl);
  await cdp.send('Runtime.enable'); await cdp.send('Page.enable'); await cdp.send('Performance.enable');
  for (let i = 0; i < 150; i++) {
    if (await evalJS(cdp, `document.readyState==='complete' && typeof S==='object' && Array.isArray(S.batches)`)) break;
    await sleep(200);
  }
  await sleep(600);
  await runAt(cdp, 300, 1440, 900, 1, '对照-宽屏');
  await runAt(cdp, 300, 390, 844, 1, '窄屏');
  await runAt(cdp, 300, 390, 844, 2, '窄屏-200%屏');
  await runAt(cdp, 1000, 390, 844, 1, '窄屏-1000人');
  await runAt(cdp, 1000, 1440, 900, 1, '宽屏-1000人');
  await runAt(cdp, 2000, 390, 844, 1, '窄屏-2000人');
} finally {
  try { cdp?.close(); } catch {}
  edge.kill();
}

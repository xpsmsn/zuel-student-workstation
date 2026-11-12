/**
 * 窄屏卡顿排查 v2：真实 GPU + 真实合成器（非无头），窗口放到屏幕外。
 * 量三件事，每组数据 × 视口宽度：
 *   1. 空闲 3s 的主线程占用（应接近 0 —— 若不为 0 说明有东西在空转）
 *   2. 滚动 2s 的帧间隔（p95 / 最差帧）—— 用户感受到的「卡」
 *   3. 模拟拖动窗口连续变窄（30 步）：重绘次数与总耗时
 * 用法：node .verify/narrow-perf2.mjs
 */
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = 'D:/Develop/辅导员工作台';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PAGE = pathToFileURL(path.join(ROOT, '中南大学生工作台.html')).href;
const PORT = 9342;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function waitForTarget() {
  for (let i = 0; i < 150; i++) {
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
    let id = 0; const pending = new Map();
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) {
        const { res, rej } = pending.get(m.id); pending.delete(m.id);
        m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
      }
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
const met = async cdp => { const r = await cdp.send('Performance.getMetrics'); const o = {}; for (const m of r.metrics) o[m.name] = m.value; return o; };
const deltaMs = (a, b, k) => +(((b[k] || 0) - (a[k] || 0)) * 1000).toFixed(0);

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
  S.view = 'list'; renderSidebar(); renderMain();
  return S.students.length;
})()`;

const SCROLL = `new Promise(res => {
  const area = document.getElementById('mainArea');
  const gaps = []; let last = performance.now(), t0 = last;
  area.scrollTop = 0;
  function tick(){
    const now = performance.now(); gaps.push(now - last); last = now;
    area.scrollTop += 300;
    if (now - t0 < 2000) requestAnimationFrame(tick);
    else {
      const s = gaps.slice(1).sort((a,b)=>b-a);
      const sum = s.reduce((x,y)=>x+y,0);
      res({ frames: s.length, fps: +(s.length / ((performance.now()-t0)/1000)).toFixed(1),
            p95: +s[Math.floor(s.length*0.05)].toFixed(1), worst: +s[0].toFixed(1),
            avg: +(sum/s.length).toFixed(2), scrollH: area.scrollHeight });
    }
  }
  requestAnimationFrame(tick);
})`;

async function runAt(cdp, n, width, height, dsf, label) {
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dsf, mobile: false });
  await sleep(400);
  await evalJS(cdp, SEED(n));
  await sleep(1500);
  const info = await evalJS(cdp, `({ nodes: document.getElementsByTagName('*').length,
      innerH: document.getElementById('mainArea').scrollHeight, cards: !!document.querySelector('.tbl-wrap.as-cards'),
      vw: innerWidth, dpr: devicePixelRatio })`);
  const a = await met(cdp); await sleep(3000); const b = await met(cdp);
  const scroll = await evalJS(cdp, SCROLL);
  console.log(`[${label}] ${n}人 ${width}x${height}@${dsf}x  nodes=${info.nodes} 内容高=${info.innerH}px cards=${info.cards} dpr=${info.dpr}`);
  console.log(`         空闲3s: Task=${deltaMs(a,b,'TaskDuration')}ms Script=${deltaMs(a,b,'ScriptDuration')}ms Layout=${deltaMs(a,b,'LayoutDuration')}ms/heap=${(b.JSHeapUsedSize/1048576).toFixed(0)}MB`);
  console.log(`         滚动2s: ${JSON.stringify(scroll)}`);
  return { n, width, info, scroll };
}

const edge = spawn(EDGE, [
  '--no-first-run', '--no-default-browser-check', '--window-position=-32000,-32000',
  '--window-size=1500,1000', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${path.join(ROOT, '.verify/prof-narrow2')}`, PAGE,
], { stdio: 'ignore' });

let cdp;
try {
  const target = await waitForTarget();
  cdp = await connect(target.webSocketDebuggerUrl);
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await cdp.send('Performance.enable');
  for (let i = 0; i < 150; i++) {
    if (await evalJS(cdp, `document.readyState === 'complete' && typeof S === 'object' && Array.isArray(S.batches)`)) break;
    await sleep(200);
  }
  await sleep(600);
  console.log('GPU 合成状态：', JSON.stringify(await evalJS(cdp, `(() => {
    const c = document.createElement('canvas'); const gl = c.getContext('webgl');
    const dbg = gl && gl.getExtension('WEBGL_debug_renderer_info');
    return { webgl: !!gl, renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'n/a' };
  })()`)));

  const out = [];
  out.push(await runAt(cdp, 300, 1440, 900, 1, '宽屏'));
  out.push(await runAt(cdp, 300, 390, 844, 1, '窄屏'));
  out.push(await runAt(cdp, 300, 390, 844, 1.5, '窄屏-150%缩放'));
  out.push(await runAt(cdp, 1000, 1440, 900, 1, '宽屏-千人'));
  out.push(await runAt(cdp, 1000, 390, 844, 1, '窄屏-千人'));
  out.push(await runAt(cdp, 2000, 390, 844, 1, '窄屏-两千人'));

  // 拖动窗口连续变窄：从 1400 每 70ms 缩 40px 到 360
  await evalJS(cdp, SEED(300));
  await sleep(1200);
  const storm = await evalJS(cdp, `new Promise(res => {
    let w = 1400, renders = 0, t0 = performance.now();
    const orig = window.renderMain;
    window.renderMain = function(){ renders++; return orig.apply(this, arguments); };
    const timer = setInterval(() => {
      w -= 40;
      // 真窗口拖动时是【窗口尺寸】变，这里用 CSS 变量近似不足以复现；
      // 交给外部 CDP 改 metrics，本计时器只记录重绘次数
      if (w <= 360) { clearInterval(timer); }
    }, 70);
    setTimeout(() => { window.renderMain = orig; res({ renders, ms: +(performance.now()-t0).toFixed(0) }); }, 2100);
  })`);
  console.log('\n拖动窗口（2100ms 内 renderMain 调用次数，宽度由外部 CDP 逐步改变）：', JSON.stringify(storm));

  for (let i = 0; i < 28; i++) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1400 - i * 37, height: 900, deviceScaleFactor: 1, mobile: false });
    await sleep(70);
  }
  await sleep(800);
  console.log('窄化结束后一次空闲 1.5s 检查：', JSON.stringify(await (async () => {
    const a = await met(cdp); await sleep(1500); const b = await met(cdp);
    return { task: deltaMs(a, b, 'TaskDuration'), script: deltaMs(a, b, 'ScriptDuration') };
  })()));
} finally {
  try { cdp?.close(); } catch {}
  edge.kill();
}

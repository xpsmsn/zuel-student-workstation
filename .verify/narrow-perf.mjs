/**
 * 窄屏卡顿排查探针：同一份数据，分别在「宽」和「窄」视口下量：
 *   1. 渲染一屏的同步耗时（renderMain 自报 + 真实布局时间）
 *   2. DOM 节点数 / 文档高度 / 横向溢出（scrollWidth vs clientWidth）
 *   3. 空闲 2s 的主线程占用（TaskDuration / ScriptDuration / LayoutDuration）
 *   4. 滚动 1.2s 的掉帧情况
 * 目的是拿数字定位「窄屏为什么卡」，不靠猜。
 * 用法：node .verify/narrow-perf.mjs [学生数]
 */
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = 'D:/Develop/辅导员工作台';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PAGE = pathToFileURL(path.join(ROOT, '中南大学生工作台.html')).href;
const PORT = 9341;
const N = Number(process.argv[2] || 300);
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
        return new Promise((res, rej) => {
          pending.set(mid, { res, rej });
          ws.send(JSON.stringify({ id: mid, method, params }));
        });
      },
      close: () => ws.close(),
    });
  });
}

const evalJS = async (cdp, expr) => {
  const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + JSON.stringify(r.exceptionDetails.exception?.description || ''));
  return r.result.value;
};

// 在页面里装一个「渲染耗时」计时器：包住 $('mainArea').innerHTML 赋值的真实代价
const INSTRUMENT = `(() => {
  if (window.__perfHook) return true;
  window.__perfHook = { renders: [], last: 0 };
  const area = document.getElementById('mainArea');
  const proto = Object.getPrototypeOf(area);
  window.__measureRender = function(fn){
    const t0 = performance.now();
    fn();
    // 强制同步布局 = 浏览器在赋值后必须做完的那部分工作
    const h = document.getElementById('mainArea').scrollHeight;
    const t1 = performance.now();
    return { ms: +(t1 - t0).toFixed(1), h };
  };
  return true;
})()`;

const SEED = n => `(() => {
  // 没有批次就先恢复演示数据，再复制到 n 人，模拟真实名册体量
  if (!S.batches || !S.batches.length) restoreDemo();
  const base = S.students.slice();
  if (!base.length) return 'no-seed';
  const out = [];
  let i = 0;
  while (out.length < ${n}) {
    const s = JSON.parse(JSON.stringify(base[out.length % base.length]));
    i++;
    s['学号'] = '2024' + String(100000 + i);
    s['姓名'] = '测试学生 ' + String(i).padStart(3, '0');
    s['姓名1'] = s['姓名'];
    out.push(s);
  }
  S.students.length = 0;
  out.forEach(s => S.students.push(s));
  // 成绩层跟着放大，否则成绩视图还是空
  try {
    S.grades = S.students.map(s => ({ '学号': s['学号'], items: [
      { name: '高等数学', credit: 5, score: 60 + (Math.random() * 40 | 0) },
      { name: '大学英语', credit: 4, score: 60 + (Math.random() * 40 | 0) }
    ] }));
    invalidateGradeMap();
  } catch (e) {}
  renderSidebar(); renderMain();
  return S.students.length;
})()`;

const MEASURE = `(() => {
  const area = document.getElementById('mainArea');
  const de = document.documentElement;
  const tbl = document.querySelector('.tbl-wrap');
  const cs = tbl ? getComputedStyle(tbl) : null;
  return {
    nodes: document.getElementsByTagName('*').length,
    innerH: area ? area.scrollHeight : 0,
    docH: de.scrollHeight,
    overX: Math.max(0, de.scrollWidth - de.clientWidth),
    view: (typeof S === 'object' ? S.view : '?'),
    cards: !!(cs && cs.overflowX === 'visible' && document.querySelector('.tbl-wrap.as-cards')),
    anims: document.getAnimations().filter(a => a.playState === 'running').length,
  };
})()`;

async function metrics(cdp) {
  const r = await cdp.send('Performance.getMetrics');
  const o = {};
  for (const m of r.metrics) o[m.name] = m.value;
  return o;
}
const d = (a, b, k) => +(((b[k] || 0) - (a[k] || 0)) * 1000).toFixed(0); // ms

async function runAt(width, height, tag) {
  const edge = spawn(EDGE, [
    '--headless=new', '--no-first-run', '--no-default-browser-check',
    '--hide-scrollbars', `--window-size=${width},${height}`,
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${path.join(ROOT, '.verify/prof-narrow')}`,
    PAGE,
  ], { stdio: 'ignore' });
  let cdp;
  try {
    const target = await waitForTarget();
    cdp = await connect(target.webSocketDebuggerUrl);
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Performance.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });

    for (let i = 0; i < 150; i++) {
      const ok = await evalJS(cdp, `document.readyState === 'complete' && typeof S === 'object' && Array.isArray(S.batches)`);
      if (ok) break;
      await sleep(200);
    }
    await sleep(500);
    const seeded = await evalJS(cdp, SEED(N));
    await sleep(1200);
    await evalJS(cdp, INSTRUMENT);
    await sleep(200);

    const rows = [];
    const views = ['dashboard', 'list', 'dorm', 'award'];
    for (const v of views) {
      // 切视图 + 量这一屏的渲染代价
      const r = await evalJS(cdp, `(() => {
        const set = { dashboard: () => { S.view='dashboard'; }, list: () => { S.view='list'; },
                      dorm: () => { S.view='dorm'; }, award: () => { S.view='award'; } };
        set['${v}']();
        const m = window.__measureRender(renderMain);
        return m;
      })()`);
      await sleep(900);

      const before = await metrics(cdp);
      await sleep(2000);
      const after = await metrics(cdp);

      const s = await evalJS(cdp, MEASURE);
      rows.push({
        view: v,
        renderMs: r.ms,
        nodes: s.nodes,
        innerH: s.innerH,
        docH: s.docH,
        overX: s.overX,
        cards: s.cards,
        cpu: d(before, after, 'TaskDuration'),
        script: d(before, after, 'ScriptDuration'),
        layout: d(before, after, 'LayoutDuration'),
        anims: s.anims,
        heapMB: +((after.JSHeapUsedSize || 0) / 1048576).toFixed(1),
      });
    }

    // 滚动掉帧：在 list 视图滚 1.2s，数 rAF 帧与最大帧间隔
    await evalJS(cdp, `S.view='list'; renderMain(); true`);
    await sleep(800);
    const scroll = await evalJS(cdp, `new Promise(res => {
      const area = document.getElementById('mainArea');
      const gaps = [];
      let last = performance.now(), frames = 0, t0 = last;
      area.scrollTop = 0;
      function tick(){
        const now = performance.now();
        gaps.push(now - last); last = now; frames++;
        area.scrollTop = area.scrollTop + 400;
        if (now - t0 < 1200) requestAnimationFrame(tick);
        else {
          gaps.sort((a,b)=>b-a);
          res({ frames: frames, worst: +gaps[0].toFixed(1), p95: +gaps[Math.floor(gaps.length*0.05)].toFixed(1),
                maxScroll: area.scrollTop, scrollH: area.scrollHeight });
        }
      }
      requestAnimationFrame(tick);
    })`);

    console.log(`\n=== ${tag}  ${width}x${height}  学生 ${seeded} 人 ===`);
    console.table(rows);
    console.log('list 视图滚动 1.2s：', JSON.stringify(scroll));
    return { tag, rows, scroll };
  } finally {
    try { cdp?.close(); } catch {}
    edge.kill();
    await sleep(500);
  }
}

await runAt(1440, 900, '宽屏');
await runAt(390, 844, '窄屏-手机竖');
await runAt(320, 700, '最窄-320');

/**
 * 撤销条 / toast 底部浮层回归：真实 hover（CDP Input 事件）+ 遮挡几何 + 截图。
 *
 * 为什么不用 --screenshot 就算了：CSS :hover 只对真实指针事件生效，
 * 而 --screenshot 模式没法注入鼠标。这里用 --remote-debugging-port + CDP，
 * 先 Input.dispatchMouseEvent 移进撤销条，再比 hover 前后的 getBoundingClientRect。
 *
 * 断言（任一失败即 exit 1）：
 *   1. hover 前后撤销条 left/top/width 完全不变（老版本会右移半个身位）
 *   2. hover 时撤销条的 computed transform 里没有 X 位移
 *   3. 撤销条与 toast 的矩形不相交（同一次删除里两条提示都在的时候）
 *   4. 窄屏（420px）下两条提示也不相交
 * 用法：node .verify/hover-check.mjs [--shots]
 */
import { spawn } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = 'D:/Develop/辅导员工作台';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PAGE = pathToFileURL(path.join(ROOT, 'app/src/index.html')).href;
const PORT = 9331;
const SHOTS = process.argv.includes('--shots');

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function waitForTarget() {
  for (let i = 0; i < 100; i++) {
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

const MEASURE = `(() => {
  const g = id => document.getElementById(id);
  const rect = el => { if (!el) return null; const r = el.getBoundingClientRect();
    return { x: Math.round(r.x*100)/100, y: Math.round(r.y*100)/100, w: Math.round(r.width*100)/100, h: Math.round(r.height*100)/100, right: Math.round(r.right*100)/100, bottom: Math.round(r.bottom*100)/100 }; };
  const bar = g('undoBar'), tost = g('toast'), stack = g('toastStack');
  const cs = el => { const s = getComputedStyle(el); return { transform: s.transform, position: s.position, left: s.left, bottom: s.bottom, marginLeft: s.marginLeft }; };
  const a = rect(bar), b = rect(tost);
  const overlap = (a && b) ? !(a.right <= b.x || b.right <= a.x || a.bottom <= b.y || b.bottom <= a.y) : null;
  return { bar: a, toast: b, stack: rect(stack), overlap,
    barCS: bar ? cs(bar) : null, stackCS: stack ? cs(stack) : null,
    vw: innerWidth, vh: innerHeight,
    barShow: bar && bar.className.includes('show'), toastShow: tost && tost.className.includes('show') };
})()`;

const SHOW_BOTH = `(() => {
  const bar = document.getElementById('undoBar'), tost = document.getElementById('toast');
  document.getElementById('undoMsg').textContent = '已删除学生：演示学生 01 · 30 秒内可撤销';
  bar.classList.add('show');
  tost.textContent = '已删除 演示学生 01';
  tost.classList.add('show');
  return true;
})()`;

const results = [];
const check = (name, ok, detail) => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail ?? ''}`); };

async function runAt(width, height, tag) {
  const edge = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--hide-scrollbars', `--window-size=${width},${height}`,
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(ROOT, '.verify/prof-hover')}`,
    PAGE,
  ], { stdio: 'ignore' });

  let cdp;
  try {
    const target = await waitForTarget();
    cdp = await connect(target.webSocketDebuggerUrl);
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    // Windows 下 headless 窗口有最小宽度，--window-size 压不到 420 以下；用设备模拟拿真实窄视口
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });

    // 等应用首屏渲染完（登录页/主界面都无所谓，浮层是全局的）
    for (let i = 0; i < 100; i++) {
      const ready = await evalJS(cdp, `document.readyState === 'complete' && !!document.getElementById('undoBar') && !!document.getElementById('toastStack')`);
      if (ready) break;
      await sleep(150);
    }
    await sleep(600);

    await evalJS(cdp, SHOW_BOTH);
    await sleep(420); // 等 .28s 过渡结束

    const before = await evalJS(cdp, MEASURE);
    console.log(`\n[${tag}] 显示两条提示：bar=${JSON.stringify(before.bar)} toast=${JSON.stringify(before.toast)}`);
    console.log(`[${tag}] stack=${JSON.stringify(before.stack)} stackCS=${JSON.stringify(before.stackCS)}`);

    check(`[${tag}] 撤销条与提示条不相交`, before.overlap === false,
      `overlap=${before.overlap} bar.bottom=${before.bar?.bottom} toast.y=${before.toast?.y}`);
    check(`[${tag}] 撤销条在提示条之上（同一次删除的语义顺序）`, before.bar && before.toast && before.bar.bottom <= before.toast.y + 0.5,
      `bar.bottom=${before.bar?.bottom} toast.y=${before.toast?.y}`);
    check(`[${tag}] 堆叠容器不含 transform 居中`, !before.stackCS?.transform || before.stackCS.transform === 'none',
      `transform=${before.stackCS?.transform}`);

    // 真实 hover：指针移到撤销条中心
    const cx = Math.round(before.bar.x + before.bar.w / 2);
    const cy = Math.round(before.bar.y + before.bar.h / 2);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cx, y: cy, button: 'none', buttons: 0 });
    await sleep(120);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cx + 2, y: cy, button: 'none', buttons: 0 });
    await sleep(380);

    const after = await evalJS(cdp, MEASURE);
    const hovered = await evalJS(cdp, `(() => { const b = document.getElementById('undoBar'); return b.matches(':hover'); })()`);
    console.log(`[${tag}] hover 后：bar=${JSON.stringify(after.bar)} barCS.transform=${after.barCS?.transform} hovered=${hovered}`);

    check(`[${tag}] 指针确实在撤销条上`, hovered === true, `matches(':hover')=${hovered}`);
    const same = before.bar && after.bar &&
      before.bar.x === after.bar.x && before.bar.y === after.bar.y && before.bar.w === after.bar.w;
    check(`[${tag}] hover 前后位置尺寸不变`, same,
      `before x=${before.bar?.x} y=${before.bar?.y} w=${before.bar?.w} → after x=${after.bar?.x} y=${after.bar?.y} w=${after.bar?.w}`);
    check(`[${tag}] hover 时无 X 位移`, !/matrix\([^)]*,\s*[1-9-]/.test(after.barCS?.transform || '') &&
      (after.barCS?.transform === 'none' || after.barCS?.transform === 'matrix(1, 0, 0, 1, 0, 0)'),
      `transform=${after.barCS?.transform}`);
    check(`[${tag}] 撤销条水平居中`, Math.abs((before.bar.x + before.bar.w / 2) - before.vw / 2) <= 1,
      `center=${before.bar ? before.bar.x + before.bar.w / 2 : 'n/a'} vw/2=${before.vw / 2}`);
    check(`[${tag}] 两支浮层都不出视口`, before.bar.x >= 0 && before.bar.right <= before.vw &&
      before.toast.x >= 0 && before.toast.right <= before.vw,
      `vw=${before.vw} bar=${before.bar.x}..${before.bar.right} toast=${before.toast.x}..${before.toast.right}`);

    if (SHOTS) {
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
      await mkdir(path.join(ROOT, '.verify'), { recursive: true });
      const out = path.join(ROOT, `.verify/shot-toast-stack-${tag}.png`);
      await writeFile(out, Buffer.from(shot.data, 'base64'));
      console.log(`[${tag}] 截图 → ${out}`);
    }
  } finally {
    try { cdp?.close(); } catch {}
    edge.kill();
    await sleep(400);
  }
}

/* 真删除流程：走 deleteStudent → askConfirm → confirmYes → snapshotForUndo，
   验证「一次删除只出一条提示」，再点撤销验证回到 toast。 */
async function runDeleteFlow() {
  const width = 1440, height = 900, tag = 'delete-flow';
  const edge = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--hide-scrollbars', '--window-size=1440,900',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(ROOT, '.verify/prof-flow')}`,
    PAGE,
  ], { stdio: 'ignore' });
  let cdp;
  try {
    const target = await waitForTarget();
    cdp = await connect(target.webSocketDebuggerUrl);
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    for (let i = 0; i < 120; i++) {
      const ok = await evalJS(cdp, `document.readyState === 'complete' && typeof S === 'object' && Array.isArray(S.students)`);
      if (ok) break;
      await sleep(150);
    }
    await sleep(900);

    const info = await evalJS(cdp, `(() => ({ sid: String((S.students[0]||{})['学号']||''), n: S.students.length }))()`);
    if (!info.sid) throw new Error('演示数据没加载出来（S.students 为空）');

    await evalJS(cdp, `deleteStudent(${JSON.stringify(info.sid)})`);
    await sleep(350);
    const confirmShown = await evalJS(cdp, `(() => { const r = document.getElementById('confirmRoot'); const b = r.querySelector('.modal-foot button:last-child'); return { shown: !!b, label: b ? b.textContent.trim() : '', title: (r.querySelector('.modal-title')||{}).textContent }; })()`);
    check(`[${tag}] 删除弹确认框`, confirmShown.shown === true, `title=${confirmShown.title} ok=${confirmShown.label}`);

    await evalJS(cdp, `document.querySelector('#confirmRoot .modal-foot button:last-child').click()`);
    await sleep(700);

    const after = await evalJS(cdp, MEASURE);
    const msg = await evalJS(cdp, `document.getElementById('undoMsg').textContent`);
    const nAfterDel = await evalJS(cdp, `S.students.length`);
    check(`[${tag}] 删除后只出一条提示（撤销条）`, after.barShow === true && after.toastShow === false,
      `bar.show=${after.barShow} toast.show=${after.toastShow} msg="${msg}"`);
    check(`[${tag}] 撤销条文案含对象与时限`, /已删除学生/.test(msg) && /30 秒内可撤销/.test(msg), `msg="${msg}"`);
    check(`[${tag}] 名单确实少了一个`, nAfterDel === info.n - 1, `${info.n} → ${nAfterDel}`);
    check(`[${tag}] 撤销条水平居中且不出视口`, Math.abs((after.bar.x + after.bar.w / 2) - after.vw / 2) <= 1 &&
      after.bar.x >= 0 && after.bar.right <= after.vw,
      `center=${after.bar.x + after.bar.w / 2} vw/2=${after.vw / 2} x=${after.bar.x} right=${after.bar.right}`);

    if (SHOTS) {
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
      const out = path.join(ROOT, '.verify/shot-delete-flow.png');
      await writeFile(out, Buffer.from(shot.data, 'base64'));
      console.log(`[${tag}] 截图 → ${out}`);
    }

    await evalJS(cdp, `document.querySelector('#undoBar .undo-btn').click()`);
    await sleep(700);
    const afterUndo = await evalJS(cdp, MEASURE);
    const toastMsg = await evalJS(cdp, `document.getElementById('toast').textContent`);
    const nAfterUndo = await evalJS(cdp, `S.students.length`);
    check(`[${tag}] 点撤销后撤销条隐藏、提示条接管`, afterUndo.barShow === false && afterUndo.toastShow === true,
      `bar.show=${afterUndo.barShow} toast.show=${afterUndo.toastShow} toast="${toastMsg}"`);
    check(`[${tag}] 撤销真的把学生放回来了`, nAfterUndo === info.n, `${nAfterDel} → ${nAfterUndo}`);
  } finally {
    try { cdp?.close(); } catch {}
    edge.kill();
    await sleep(400);
  }
}

/* 根因复现（仅供参考，不计入 PASS/FAIL）：把旧写法 left:50%+translateX(-50%) 注入当前页面，
   测 hover 是否真的右移 —— 用来证明右移确实是 [class]:hover{transform:none} 抹掉居中位移造成的。 */
async function runRootCause(tag = 'rootcause') {
  const edge = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--hide-scrollbars', '--window-size=1440,900',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(ROOT, '.verify/prof-hover')}`,
    PAGE,
  ], { stdio: 'ignore' });
  let cdp;
  try {
    const target = await waitForTarget();
    cdp = await connect(target.webSocketDebuggerUrl);
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    for (let i = 0; i < 100; i++) {
      if (await evalJS(cdp, `document.readyState === 'complete'`)) break;
      await sleep(150);
    }
    await evalJS(cdp, `(() => {
      // 故意复刻旧结构：规则放在 head 最前面的 style 块里、特异性 (0,2,0)，
      // 与文档 1859 行那条 [class]:hover 打平 —— 后者在文件更后面，所以它会赢。
      const st = document.createElement('style'); st.id = 'legacy-demo';
      st.textContent = '.legacy-probe.show{position:fixed;bottom:200px;left:50%;transform:translateX(-50%) translateY(0);background:#2f3437;color:#fff;padding:8px 16px;border-radius:8px;z-index:999;font-size:13px}';
      document.head.insertBefore(st, document.head.firstChild);
      const d = document.createElement('div'); d.id = 'legacyProbe'; d.className = 'legacy-probe show';
      d.textContent = '旧写法：left:50% + translateX(-50%)';
      document.body.appendChild(d);
      return true;
    })()`);
    await sleep(300);
    const r0 = await evalJS(cdp, `(() => { const r = document.getElementById('legacyProbe').getBoundingClientRect(); return { x: Math.round(r.x*100)/100, y: Math.round(r.y*100)/100, w: Math.round(r.width*100)/100, h: Math.round(r.height*100)/100 }; })()`);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(r0.x + r0.w / 2), y: Math.round(r0.y + r0.h / 2), button: 'none', buttons: 0 });
    await sleep(250);
    const r1 = await evalJS(cdp, `(() => { const el = document.getElementById('legacyProbe'); const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return { x: Math.round(r.x*100)/100, w: Math.round(r.width*100)/100, transform: s.transform, hovered: el.matches(':hover') }; })()`);
    console.log(`\n[${tag}] INFO 旧写法 hover 前 x=${r0.x} → hover 后 x=${r1.x}（位移 ${Math.round((r1.x - r0.x) * 100) / 100}px，transform=${r1.transform}，hovered=${r1.hovered}）`);
  } finally {
    try { cdp?.close(); } catch {}
    edge.kill();
    await sleep(400);
  }
}

await runAt(1440, 900, 'wide');
await runAt(420, 740, 'narrow');
await runDeleteFlow();
await runRootCause();

const failed = results.filter(r => !r.ok);
console.log(`\n合计 ${results.length} 项，失败 ${failed.length} 项`);
if (failed.length) { failed.forEach(f => console.log(`  × ${f.name}`)); process.exit(1); }

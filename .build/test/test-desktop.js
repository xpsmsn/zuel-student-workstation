#!/usr/bin/env node
/**
 * 桌面适配层回归测试。
 *
 * 打包进 Windows 后，原型里有三件事必须改由 Rust 外壳接手：
 *   ① 导出（原型走 a[download] + blob，WebView 下不落地）
 *   ② 外链 / mailto（在应用窗口里点会白屏）
 *   ③ 右键菜单（会露出"刷新 / 另存为 / 检查"）
 *
 * 这里把 app/src/index.html 里注入的那段适配层单独抽出来跑，
 * 用假的 __TAURI__ 断言它确实调到了对应的 Rust 命令 —— 不用真开窗口。
 *
 * 用法：node .build/test-desktop.js [app/src/index.html]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FILE = process.argv[2] || path.join(__dirname, '..', '..', 'app', 'src', 'index.html');
const MARKER = '适配层已就绪';

let pass = 0, fail = 0;
const bad = [];
function t(name, cond, extra) {
  if (cond) { pass++; console.log('  \u2713 ' + name); }
  else { fail++; bad.push(name); console.log('  \u2717 ' + name + (extra ? '  → ' + extra : '')); }
}

/* ---------------- 从 HTML 里抽出适配层 ---------------- */
const html = fs.readFileSync(FILE, 'utf8');
const blocks = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
const shim = blocks.find(s => s.includes(MARKER));

console.log('=== 桌面适配层 ===');
if (!shim) {
  console.error('  ✗ ' + FILE + ' 里没有找到适配层 —— 请先跑 node .build/build-desktop.js');
  process.exit(1);
}
t('适配层已注入到 app/src/index.html', !!shim);
// 适配层必须排在 SheetJS 之后（否则 downloadCsv / XLSX 都还没定义）。
// 用「相对位置」而不是「必须是最后一块」—— --selftest 的自检块会接在它后面。
const xlsxIdx = blocks.findIndex(s => s.includes('make_xlsx_lib'));
t('适配层排在 SheetJS 之后', xlsxIdx >= 0 && blocks.indexOf(shim) > xlsxIdx);

/* ---------------- 沙箱：可切换「桌面 / 非桌面」 ---------------- */
function run(opts = {}) {
  const listeners = { click: [], contextmenu: [], dragover: [], drop: [] };
  const calls = [];
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    TextEncoder,
    fetch: opts.fetch || (() => Promise.reject(new Error('no fetch'))),
    Promise, Array, Object, JSON, String, Number, Boolean, Date, Math, RegExp, Error, Uint8Array,
  };
  sandbox.window = {
    addEventListener(type, fn, cap) { (listeners[type] = listeners[type] || []).push({ fn, cap }); },
  };
  sandbox.document = {
    addEventListener(type, fn, cap) { (listeners[type] = listeners[type] || []).push({ fn, cap }); },
  };
  if (opts.originalDownloadCsv) sandbox.window.downloadCsv = opts.originalDownloadCsv;
  if (opts.toast) sandbox.window.toast = opts.toast;
  if (opts.tauri !== false) {
    sandbox.window.__TAURI__ = {
      core: {
        invoke(name, args) {
          calls.push({ name, args });
          if (name === 'save_to_downloads') return Promise.resolve('C:\\Users\\x\\Downloads\\' + (args && args.name));
          return Promise.resolve(null);
        },
      },
    };
  }
  vm.createContext(sandbox);
  new vm.Script(shim, { filename: 'desktop-shim' }).runInContext(sandbox);

  const fire = (type, ev) => listeners[type].forEach(l => l.fn(ev));
  const clickEv = (anchor) => {
    let prevented = 0, stopped = 0;
    const ev = {
      target: { closest: (sel) => (sel === 'a[href]' ? anchor : null) },
      preventDefault() { prevented++; },
      stopPropagation() { stopped++; },
    };
    fire('click', ev);
    return { prevented, stopped };
  };
  return { sandbox, listeners, calls, fire, clickEv };
}

/* ---------------- 1. 非桌面环境必须零副作用 ---------------- */
{
  const orig = function (csv, filename) { orig.calledWith = [csv, filename]; };
  const env = run({ tauri: false, originalDownloadCsv: orig });
  t('非桌面环境：不注册 click 监听', env.listeners.click.length === 0);
  t('非桌面环境：不注册 contextmenu 监听', env.listeners.contextmenu.length === 0);
  t('非桌面环境：不碰 downloadCsv', env.sandbox.window.downloadCsv === orig);
  t('非桌面环境：不产生任何外壳调用', env.calls.length === 0);
}

/* ---------------- 2. 导出改走 Rust 外壳 ---------------- */
{
  const orig = function () {};
  const env = run({ originalDownloadCsv: orig });
  t('桌面环境：downloadCsv 已被替换', env.sandbox.window.downloadCsv !== orig);

  const csv = '\uFEFF姓名,学号\n张三,2023010101\n李四,2023010102';
  env.sandbox.window.downloadCsv(csv, '学生数据_测试批次_20260919.csv');

  const call = env.calls.find(c => c.name === 'save_to_downloads');
  t('导出：调到了 save_to_downloads', !!call);
  t('导出：文件名原样传下去', call && call.args.name === '学生数据_测试批次_20260919.csv', call && call.args.name);
  t('导出：内容是字节数组', call && Array.isArray(call.args.data));
  t(
    '导出：中文按 UTF-8 编码、内容无损',
    call && Buffer.from(call.args.data).toString('utf8') === csv
  );
  t('导出：BOM 保留（Excel 打开不乱码）',
    call && call.args.data[0] === 0xEF && call.args.data[1] === 0xBB && call.args.data[2] === 0xBF);
}

/* ---------------- 3. 外链 / 邮件交给系统默认程序 ---------------- */
{
  const env = run({ originalDownloadCsv: function () {} });
  const anchor = (href, download) => ({
    getAttribute: (k) => (k === 'href' ? href : null),
    hasAttribute: (k) => (k === 'download' ? !!download : false),
  });

  let r = env.clickEv(anchor('https://ids.zuel.edu.cn/authserver/login?service=x'));
  let c = env.calls.find(x => x.name === 'open_external');
  t('外链：调到了 open_external', !!c);
  t('外链：URL 原样传下去（含查询串）',
    c && c.args.url === 'https://ids.zuel.edu.cn/authserver/login?service=x');
  t('外链：已阻止应用窗口自己导航', r.prevented === 1 && r.stopped === 1);

  env.calls.length = 0;
  env.clickEv(anchor('mailto:wuzhangfan110@163.com'));
  t('邮件：调到了 open_external',
    env.calls.some(x => x.name === 'open_external' && x.args.url === 'mailto:wuzhangfan110@163.com'));

  env.calls.length = 0;
  env.clickEv(anchor('#/student/123'));
  t('页内锚点：不打扰外壳', env.calls.length === 0);
  env.clickEv(anchor('javascript:void(0)'));
  t('javascript: 伪协议：不打扰外壳', env.calls.length === 0);
}

/* ---------------- 4. 兜底：还有别的 blob 导出也不该丢 ---------------- */
async function testBlobFallback() {
  const bytes = new TextEncoder().encode('a,b\n1,2');
  const env = run({
    originalDownloadCsv: function () {},
    fetch: async () => ({ arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }),
  });
  const anchor = {
    getAttribute: (k) => (k === 'href' ? 'blob:http://tauri.localhost/abc' : k === 'download' ? '兜底.csv' : null),
    hasAttribute: (k) => k === 'download',
  };
  env.clickEv(anchor);
  await new Promise(r => setTimeout(r, 20));          // 这一段是 Promise 链，要等它跑完
  const call = env.calls.find(x => x.name === 'save_to_downloads');
  t('兜底：blob 导出也被接管', !!call);
  t('兜底：内容一致', call && Buffer.from(call.args.data).toString('utf8') === 'a,b\n1,2');
}

/* ---------------- 5. 右键菜单：输入框里留着，别处关掉 ---------------- */
function testContextMenu() {
  const env = run({ originalDownloadCsv: function () {} });
  const fireCtx = (target) => {
    let prevented = 0;
    env.fire('contextmenu', { target, preventDefault() { prevented++; } });
    return prevented;
  };
  t('右键：输入框里保留原生菜单（要粘贴）', fireCtx({ tagName: 'INPUT' }) === 0);
  t('右键：文本框里保留原生菜单', fireCtx({ tagName: 'TEXTAREA' }) === 0);
  t('右键：可编辑区保留原生菜单', fireCtx({ tagName: 'DIV', isContentEditable: true }) === 0);
  t('右键：页面上其它地方关掉', fireCtx({ tagName: 'DIV' }) === 1);
  t('右键：表格上也关掉', fireCtx({ tagName: 'TD' }) === 1);

  t('拖拽：注册了 dragover / drop 拦截（防止拖进文件把应用导航走）',
    env.listeners.dragover.length === 1 && env.listeners.drop.length === 1);
}

/* ---------------- 6. 原型本体的契约：可双击 + 适配层不影响主逻辑 ----------------
 * 早期约定"原型不含适配层"是为了让原型保持纯净，便于开发期手测。
 * 但 v2.3.3 起原型会**手抄**适配层 IIFE（这样原型双击 HTML 打开也能用桌面下载
 * /外链拦截，绿色版场景）。这种"手抄的"适配层和"build-desktop 注入的"在
 * 功能上等价，对主逻辑都是零侵入（仅替换 window.downloadCsv 一个全局引用），
 * 所以契约应当改为"原型主逻辑的 downloadCsv 实现不能被改写"。
 *
 * 检测方法：
 *   - 原型 main 逻辑（2527–11858 那块主 script 块）必须还有 `function downloadCsv(`
 *   - 适配层 IIFE 必须在主 script 块**之后**追加（不污染主逻辑）
 */
function testPrototypePurity() {
  const proto = path.join(__dirname, '..', '..', '中南大学生工作台.html');
  const p = fs.readFileSync(proto, 'utf8');
  // 抓出所有 script 块，按出现顺序
  const blocks = [...p.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
  // 找到"最大块"（主逻辑，必含 downloadCsv）；其余脚本里都不应该出现 downloadCsv 的定义
  const main = blocks.reduce((a, b) => b.length > a.length ? b : a, '');
  t('原型主逻辑块仍保留原始 downloadCsv 实现', /function\s+downloadCsv\s*\(/.test(main));
  // 原型末尾允许含适配层（手抄或 build-desktop 注入都行）；但适配层必须在主块**之后**
  const hasAdapter = p.includes(MARKER);
  let adapterAfterMain = true;
  if (hasAdapter) {
    const mainEnd = p.indexOf('</script>', p.indexOf('function downloadCsv(') + 50);
    const adapterStart = p.indexOf('function desktopDownloadCsv');
    adapterAfterMain = adapterStart > mainEnd;
  }
  t('若原型含适配层 IIFE，必须在主逻辑之后追加（不污染主逻辑）', !hasAdapter || adapterAfterMain);
}

(async () => {
  await testBlobFallback();
  testContextMenu();
  testPrototypePurity();

  console.log(`\n==> ${pass}/${pass + fail} 项通过`);
  if (bad.length) { console.log('失败项：'); bad.forEach(b => console.log('  - ' + b)); }
  process.exit(fail ? 1 : 0);
})();

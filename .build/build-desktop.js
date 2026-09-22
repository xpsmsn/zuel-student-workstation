#!/usr/bin/env node
/**
 * 把单文件原型同步成桌面版前端。
 *
 *   中南大学生工作台.html   →   app/src/index.html
 *
 * 两边只差**一处**：桌面版在 </body> 前多注入一段「桌面适配层」脚本。
 * 原型文件本身保持不变，双击仍可用浏览器直接打开（数据一样存在浏览器里）。
 *
 * 用法：node .build/build-desktop.js [--selftest]
 *
 *   --selftest  额外注入一段开机自检脚本：应用一启动就把「外链白名单 / 导出落地」两条
 *               链路各打一遍，结果显示在窗口左上角的黑底绿字浮层里，并把文件写进「下载」。
 *               只用于打包后实机验证，**正式出包不要带**。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SELFTEST = process.argv.includes('--selftest');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, '中南大学生工作台.html');
const OUT_DIR = path.join(ROOT, 'app', 'src');
const OUT = path.join(OUT_DIR, 'index.html');

/** 适配层的"指纹"，用于防止重复注入、并校验注入是否真的发生了 */
const MARKER = '适配层已就绪';

/* ------------------------------------------------------------------ *
 * 开机自检（仅 --selftest 时注入）
 * 目的：打包成 exe 之后，把「JS → IPC → Rust → 磁盘」整条链路真跑一遍，
 *       结果直接画在窗口上，截图即可留证。正式出包不带这一段。
 * ------------------------------------------------------------------ */
const SELFTEST_SNIPPET = `
<script>
(function(){
  var T = window.__TAURI__;
  var lines = [], pending = 0;

  function msg(e){ return (e && (e.message || e)) || '未知'; }

  function paint(){
    var el = document.getElementById('__selftest__');
    if(!el){
      el = document.createElement('div'); el.id = '__selftest__';
      el.setAttribute('style','position:fixed;left:10px;top:10px;z-index:999999;background:#111;color:#4ade80;font:12px/1.7 Consolas,monospace;padding:12px 16px;border-radius:8px;max-width:900px;white-space:pre-wrap');
      (document.body || document.documentElement).appendChild(el);
    }
    el.textContent = '【桌面自检】' + String.fromCharCode(10) + lines.join(String.fromCharCode(10));
  }
  function rec(s){ lines.push(s); paint(); }

  /* ===== DOM 诊断（不依赖截图，直接看页面到底加载/渲染成什么样） ===== */
  var errs = [];
  window.addEventListener('error', function(e){ errs.push('window.onerror: ' + (e.message || e)); });
  window.addEventListener('unhandledrejection', function(e){ errs.push('rejection: ' + ((e.reason && e.reason.message) || e.reason)); });

  rec('document.readyState   : ' + document.readyState);
  rec('document.title        : ' + document.title);
  rec('body 子元素数          : ' + (document.body ? document.body.childElementCount : '无 body'));
  rec('body 可见文本长度       : ' + (document.body ? (document.body.innerText || '').length : -1));
  rec('#loginPage 存在        : ' + !!document.getElementById('loginPage'));
  rec('#loginBtn 存在         : ' + !!document.getElementById('loginBtn'));
  rec('body 文本前 60 字       : ' + (document.body ? (document.body.innerText || '').slice(0, 60).replace(/\s+/g, ' ') : ''));
  rec('typeof window.S        : ' + typeof window.S);
  rec('typeof downloadCsv     : ' + typeof window.downloadCsv);
  rec('typeof window.XLSX     : ' + typeof window.XLSX);
  rec('typeof window.boot     : ' + typeof window.boot);
  rec('typeof window.toast    : ' + typeof window.toast);

  rec('__TAURI__ 存在        : ' + (!!T));

  /* ⚠️ 先把 DOM 诊断立刻落盘（不等后面的异步步骤）——
     就算某条 IPC 卡死 / 页面半路崩了，第一阶段报告也已经躺在「下载」里 */
  if(T && T.core){
    var snap1 = '中南大学生工作台 · 桌面自检报告（第一阶段 · DOM）' + String.fromCharCode(13, 10) +
                '时间：' + new Date().toLocaleString() + String.fromCharCode(13, 10) +
                '窗口：' + (document.title || '') + String.fromCharCode(13, 10) + String.fromCharCode(13, 10) +
                lines.join(String.fromCharCode(13, 10));
    T.core.invoke('save_to_downloads', { name: '桌面自检_报告.txt',
      data: Array.from(new TextEncoder().encode(snap1)) })
      .catch(function(e){ rec('报告落盘失败: ' + msg(e)); paint(); });
  }

  if(!T || !T.core){ rec('结论: 不是桌面壳，自检无法进行'); return; }
  rec('downloadCsv 已接管     : ' + (/createObjectURL/.test(String(window.downloadCsv)) ? '否（还是网页版）' : '是'));

  // 剩下的检查都要写文件，靠计数等全部落地后把报告也写出去
  function step(label, p, ok, err){
    pending++;
    p.then(function(v){ rec(label + ' ' + ok + (v === undefined ? '' : ' -> ' + v)); },
           function(e){ rec(label + ' ' + err + ' -> ' + msg(e)); });
    p.then(fin, fin, fin);
  }
  function fin(){ pending--; if(pending === 0) writeReport(); }

  function writeReport(){
    var txt = '中南大学生工作台 · 桌面自检报告' + String.fromCharCode(13, 10) +
              '时间：' + new Date().toLocaleString() + String.fromCharCode(13, 10) +
              '窗口：' + (document.title || '') + String.fromCharCode(13, 10) + String.fromCharCode(13, 10) +
              lines.join(String.fromCharCode(13, 10)) + String.fromCharCode(13, 10) +
              (errs.length ? (String.fromCharCode(13, 10) + '== 页面错误 ==' + String.fromCharCode(13, 10) + errs.join(String.fromCharCode(13, 10))) : '');
    T.core.invoke('save_to_downloads', { name: '桌面自检_报告_最终.txt',
      data: Array.from(new TextEncoder().encode(txt)) });
  }

  step('[1] 外链白名单 ftp://  ', T.core.invoke('open_external', { url: 'ftp://应当被拦下' }), '✗ 竟然放行了', '✓ 已拦下');
  step('[2] 外链白名单 裸字符串 ', T.core.invoke('open_external', { url: 'not-a-url' }),    '✗ 竟然放行了', '✓ 已拦下');

  // 真·打开系统浏览器（会弹出一个浏览器标签页，这是预期行为）
  step('[3] 外链真打开（校主页）', T.core.invoke('open_external', { url: 'https://www.zuel.edu.cn/' }), '✓ OK', '✗ 失败');

  var csvA = '\\uFEFF姓名,学号\\n张自检,2026001\\n李自检,2026002';
  step('[4] 导出-直接命令       ', T.core.invoke('save_to_downloads', { name: '桌面自检_A_直接命令.csv',
        data: Array.from(new TextEncoder().encode(csvA)) }), '✓ OK', '✗ 失败');

  try {
    window.downloadCsv('\\uFEFF姓名\\n王自检', '桌面自检_B_真实入口.csv');
    rec('[5] 导出-真实入口       : 已触发 downloadCsv()，结果见 B 文件');
  } catch(e) {
    rec('[5] 导出-真实入口       : 抛错 -> ' + msg(e));
  }
})();
</script>
`;

/* ------------------------------------------------------------------ *
 * 桌面适配层：只在打包进 Windows 程序时注入。
 * 浏览器能做的事，桌面 WebView 里有三样做不到，这里全转交给 Rust 外壳：
 *   1. <a target="_blank"> 不会开系统浏览器，而是在应用窗口里白屏；
 *   2. a[download] + blob 导出在 WebView 下不落地 —— 不报错、也不出文件；
 *   3. 右键会露出"刷新 / 另存为 / 检查"，不像个正经软件。
 * 非桌面环境（直接双击 HTML 打开）时整段立刻退出，零副作用。
 * ------------------------------------------------------------------ */
const SHIM = `
<script>
(function(){
  var T = window.__TAURI__;
  if(!T || !T.core || typeof T.core.invoke !== 'function') return;   // 不是桌面壳，什么都不做
  var invoke = T.core.invoke;

  function tip(msg){
    if(typeof window.toast === 'function'){ try{ window.toast(msg); return; }catch(e){} }
    try{ console.log('[桌面版] ' + msg); }catch(e){}
  }
  function errText(e){ return (e && (e.message || e)) || '未知错误'; }

  /* 1) 导出：写进「下载」文件夹 ------------------------------------------
     原型里所有导出最后都汇总到 downloadCsv()，这里整个换掉。
     不用 a[download]，是因为它在 WebView 下经常静默失效。 */
  function desktopDownloadCsv(csv, filename){
    var name = filename || ('导出_' + Date.now() + '.csv');
    var bytes = new TextEncoder().encode(csv == null ? '' : String(csv));
    invoke('save_to_downloads', { name: name, data: Array.from(bytes) })
      .then(function(p){ tip('已导出：' + p); })
      .catch(function(e){ tip('导出失败：' + errText(e)); });
  }

  if(typeof window.downloadCsv === 'function'){
    window.downloadCsv = desktopDownloadCsv;
  }else{
    console.warn('[桌面版] 没找到 downloadCsv，导出将走通用拦截兜底');
  }

  /* 2) 外链与邮件：交给系统默认程序 -------------------------------------- */
  document.addEventListener('click', function(ev){
    var el = ev.target;
    var a = el && el.closest ? el.closest('a[href]') : null;
    if(!a) return;
    var href = a.getAttribute('href') || '';

    if(/^(https?:|mailto:)/i.test(href)){
      ev.preventDefault(); ev.stopPropagation();
      invoke('open_external', { url: href })
        .catch(function(e){ tip('打不开链接：' + errText(e)); });
      return;
    }

    // 兜底：将来若有别的导出走 blob + a[download]，也从这里落地
    if(a.hasAttribute('download') || /^blob:/i.test(href)){
      ev.preventDefault(); ev.stopPropagation();
      fetch(href).then(function(r){ return r.arrayBuffer(); }).then(function(buf){
        return invoke('save_to_downloads', {
          name: a.getAttribute('download') || '导出.csv',
          data: Array.from(new Uint8Array(buf))
        });
      }).then(function(p){ tip('已导出：' + p); })
        .catch(function(e){ tip('导出失败：' + errText(e)); });
    }
  }, true);

  /* 3) 收尾：桌面端不该有的浏览器痕迹 ------------------------------------ */
  // 右键：输入框里保留（要粘贴），其他地方关掉
  document.addEventListener('contextmenu', function(ev){
    var t = ev.target, tag = ((t && t.tagName) || '').toLowerCase();
    if(tag === 'input' || tag === 'textarea' || (t && t.isContentEditable)) return;
    ev.preventDefault();
  }, false);

  // 把文件拖进窗口，不应该把整个应用"导航"成那个文件
  window.addEventListener('dragover', function(e){ e.preventDefault(); }, false);
  window.addEventListener('drop', function(e){ e.preventDefault(); }, false);

  console.log('[桌面版] 适配层已就绪');
})();
</script>
`;

function fail(msg) {
  console.error('[build-desktop] ' + msg);
  process.exit(1);
}

if (!fs.existsSync(SRC)) fail('找不到原型文件：' + SRC);
const html = fs.readFileSync(SRC, 'utf8');

// 结构守卫：注入点与要被替换的导出入口都必须在
if (!/function\s+downloadCsv\s*\(/.test(html)) fail('原型里找不到 downloadCsv()，导出入口变了（请同步更新适配层）');
if (html.includes(MARKER)) fail('原型里已经含适配层了，别重复注入');

/* ⚠️ 不能用 `html.replace(/<\/body>/, ...)`：SheetJS 的 HTML 导出模板里也有一个字面量
 *    `"</body></html>"`（在文件中部），replace 会命中那一个，把适配层注进脚本内部、
 *    顺手把 SheetJS 劈成两半。所以必须从**文件末尾**锚定。 */
const idx = html.lastIndexOf('</body>');
if (idx < 0) fail('原型里找不到 </body>，注入点变了');
if (idx < html.length - 200) {
  fail(`</body> 竟然不在文件末尾（位置 ${idx} / 总长 ${html.length}），注入点可疑，已中止`);
}

// 保持与原文件一致的换行风格（原型是 CRLF）
const eol = html.includes('\r\n') ? '\r\n' : '\n';
const toEol = (s) => s.replace(/\n/g, eol);

const inject = toEol(SHIM) + (SELFTEST ? toEol(SELFTEST_SNIPPET) : '');
const out = html.slice(0, idx) + inject + html.slice(idx);
if (!/<\/body>\s*<\/html>\s*$/.test(out)) fail('注入后文件结尾结构不对，已中止');
if (!out.includes(MARKER)) fail('注入后找不到适配层，已中止');

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT, out, 'utf8');

const kb = n => (n / 1024).toFixed(1) + ' KB';
console.log('[build-desktop] 原型   ' + kb(Buffer.byteLength(html)) + '  →  app/src/index.html  ' + kb(Buffer.byteLength(out)));
console.log('[build-desktop] 已注入桌面适配层（导出落地 / 外链走系统浏览器 / 关右键菜单）');
if (SELFTEST) console.log('[build-desktop] ⚠ 已附带开机自检（--selftest），正式出包请去掉该参数');

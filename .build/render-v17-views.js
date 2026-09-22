/* 渲染 v1.7 页面（时段问候 / 金句轮换 / 手机端适配）成静态页供无头截图 */
const fs = require('fs'), vm = require('vm');
const html = fs.readFileSync(process.argv[2], 'utf8');
function el(){ return { innerHTML:'', textContent:'', value:'', checked:false, files:null,
  style:{}, dataset:{}, classList:{ add(){}, remove(){}, contains(){ return false; }, toggle(){} },
  setAttribute(){}, getAttribute(){ return null; }, appendChild(){}, removeChild(){}, click(){}, focus(){}, select(){},
  querySelector(){ return null; }, querySelectorAll(){ return []; } }; }
const store = new Map();
const cache = new Map();
const mk = id => { const e = el(); e.id = id; cache.set(id, e); return e; };
const sandbox = { console, setTimeout, clearTimeout,
  document:{ getElementById:id=>cache.has(id)?cache.get(id):mk(id), querySelector:()=>el(), querySelectorAll:()=>[],
    createElement:()=>el(), addEventListener(){}, execCommand:()=>true, body: mk('__body'),
    documentElement:{ setAttribute(){}, removeAttribute(){}, getAttribute(){ return null; } } },
  localStorage:{ getItem:k=>store.get(k)||null, setItem:(k,v)=>store.set(k,String(v)), removeItem:k=>store.delete(k) },
  location:{ reload(){} }, alert(){}, open(){},
  FileReader:function(){}, Blob:function(){}, URL:{ createObjectURL:()=>'' },
  matchMedia:()=>({ matches:false, addEventListener(){}, removeEventListener(){} }),
  ResizeObserver:function(){ this.observe=()=>{}; this.disconnect=()=>{}; } };
sandbox.window = sandbox;
/* DESKTOP=1：假装成桌面壳，用于截"桌面版才看得到"的那几行（托盘/开机启动提示会消失） */
if(process.env.DESKTOP === '1'){
  sandbox.window.__TAURI__ = { core: { invoke: () => Promise.resolve(null) } };
}
const blocks = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
const appSrc = blocks.filter(s=>s.includes('function doImport')).sort((a,b)=>b.length-a.length)[0];
vm.createContext(sandbox);
vm.runInContext(appSrc, sandbox, { filename:'app.js' });
const R = k => vm.runInContext(k, sandbox);

const parts = {};
{
  const e = el();
  const old = sandbox.document.getElementById;
  sandbox.document.getElementById = i => (i==='sidebar' ? e : old(i));
  R('renderSidebar()');
  sandbox.document.getElementById = old;
  parts.sidebar = e.innerHTML;
}
R(`S.profile = { name:'吴章凡', dept:'经济学院', phone:'13800000000', avatar:'' };
   S.semester = { name:'2026-2027 学年第一学期', start:'2026-09-07', weeks:18 };
   S.lastBackupAt = '2026/09/20 21:40:05';
   S.batchId = (S.batches[0] && S.batches[0].id) || S.batchId;
   S.view = 'dashboard'; renderMain();`);
parts.dash = cache.get('mainArea').innerHTML;
R(`S.view='list'; renderMain()`);
parts.list = cache.get('mainArea').innerHTML;
R(`gotoSettings()`);
parts.settings = cache.get('mainArea').innerHTML;
R(`gotoGuide()`);
parts.guide = cache.get('mainArea').innerHTML;
R(`gotoDorm()`);
parts.dorm = cache.get('mainArea').innerHTML;
R(`renderTopbarWeek()`);
const weekChip = cache.get('weekChip').innerHTML;
R(`syncThemeUI('light'); S.quote = pickQuote(); renderQuote();`);
const themeIcon = cache.get('themeCycle').textContent;
const quoteText = cache.get('quoteText').textContent;

let out = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');
out = out.replace(/<div id="appPage" class="hidden">/, '<div id="appPage">');
out = out.replace(/<div class="sidebar" id="sidebar"><\/div>/, `<div class="sidebar" id="sidebar">${parts.sidebar}</div>`);
out = out.replace(/(<div class="week-chip" id="weekChip"[^>]*>)/, `$1${weekChip}`);
out = out.replace(/(<button class="icon-btn" id="themeCycle"[^>]*>)/, `$1${themeIcon}`);
out = out.replace(/(<span class="quote-text" id="quoteText"[^>]*>)/, `$1${quoteText}`);
out = out.replace(/<div class="main" id="mainArea"><\/div>/,
  parts[process.env.ONLY]
    ? `<div class="main" id="mainArea">${parts[process.env.ONLY]}</div>`
    : `<div class="main" id="mainArea">${parts.dash}<div style="height:34px"></div>${parts.list}<div style="height:34px"></div>${parts.settings}</div>`);
out = out.replace('<div id="loginPage" class="login-wrap">', '<div id="loginPage" class="login-wrap" style="display:none">');
/* --narrow：沙盒里 matchMedia 恒为 false（isNarrow() 走不到），手工补上窄屏该有的 as-cards */
if(process.argv.includes('--narrow')){
  out = out.replace(/class="tbl-wrap"/g, 'class="tbl-wrap as-cards"');
}
const suffix = process.argv.includes('--narrow') ? '-narrow' : '';
/* WIZ=0..5：把新手引导某一页塞进 #modalRoot，用于截向导图 */
if(process.env.WIZ !== undefined){
  const step = Number(process.env.WIZ) || 0;
  R(`openOnboarding(${step});` + (step === 1 ? `wizGot('student');` : '') + (step === 2 ? `wizGot('student'); wizGot('grade');` : ''));
  const wiz = cache.get('modalRoot').innerHTML;
  /* 用副本替换，别污染 out —— 否则后面那份 light/dark 渲染会带着引导弹窗 */
  const outWiz = out.replace('<div id="modalRoot"></div>', `<div id="modalRoot">${wiz}</div>`);
  fs.writeFileSync(__dirname + `/ui-v19-wiz${step}.html`, outWiz);
  console.log('written wiz' + step);
}
fs.writeFileSync(__dirname + '/ui-v17-app-light' + suffix + '.html', out);
fs.writeFileSync(__dirname + '/ui-v17-app-dark' + suffix + '.html', out.replace('<html lang="zh-CN">', '<html lang="zh-CN" data-theme="dark">'));
const topOnly = out.replace(/<div class="shell">[\s\S]*?<\/div>\s*<\/div>/, '<div class="shell"></div>');
fs.writeFileSync(__dirname + '/ui-v17-top' + suffix + '.html', topOnly);
console.log('written' + suffix + ',', out.length, 'chars');

/* v1.9.6 三处修改的回归测试（对应辅导员 2026-09-23 提的 1 / 2 / 5）
   用法: node .build/test-v196.js 中南大学生工作台.html

   [1] 备份提醒降频：总开关 / 7 天频率闸 / 30 天必要性闸，三层都要各自生效
       （旧版只要导入过且没备份就每次导入都弹，点"稍后再说"也没用 —— 用户反馈"太频繁"）
   [2] 无批次导入不再丢数据：批次被删光后选「新增/合并」，
       旧版把名单只写进内存（save 存的是批次）→ 重开「全部学生」为空。
       新版自动建批次并挂上去，结果页明说。
   [3] 导入时勾选排除字段：取消勾选的列不参与合并，学号永远保留；
       名册排除「政治面貌」时小结里要有醒目提醒。
   [4] 导入方式三卡紧凑化（静态断言）：一行三卡 + 窄屏落一列，防止"新建批次"被挤出可视区。

   沙盒沿用 test-import.js 的骨架。 */
const fs = require('fs'), vm = require('vm');
const html = fs.readFileSync(process.argv[2] || '中南大学生工作台.html', 'utf8');

let failN = 0;
const fail = m => { console.error('  ✗ ' + m); failN++; };
const pass = m => console.log('  ✓ ' + m);
const eq = (got, want, label) =>
  got === want ? pass(`${label} = ${JSON.stringify(got)}`) : fail(`${label} = ${JSON.stringify(got)}，应为 ${JSON.stringify(want)}`);
const ok = (cond, label) => cond ? pass(label) : fail(label);

/* ── 沙盒骨架（同 test-import.js） ── */
function el(){ return {
  innerHTML:'', textContent:'', value:'', placeholder:'', checked:false, files:null,
  offsetWidth:0, clientWidth:0, style:{}, dataset:{}, result:'', _h:null,
  classList:{ add(){}, remove(){}, toggle(){}, contains(){ return false; } },
  setAttribute(){}, removeAttribute(){}, getAttribute(){ return null; },
  addEventListener(){}, removeEventListener(){},
  appendChild(){}, removeChild(){}, click(){}, scrollTo(){}, focus(){}, select(){}, closest(){ return null; },
  querySelector(){ return null; }, querySelectorAll(){ return []; }
};}
function fresh(){
  const store = new Map();
  const cache = new Map();
  let confirmCb = null;
  const mk = id => { const e = el(); e.id = id; cache.set(id, e); return e; };
  const opened = [];
  const sandbox = {
    console, setTimeout, clearTimeout,
    setInterval:(fn, ms)=>1, clearInterval(){},
    document: {
      getElementById: id => cache.has(id) ? cache.get(id) : mk(id),
      querySelector: () => el(), querySelectorAll: () => [],
      createElement: () => el(), addEventListener(){}, execCommand: () => true,
      body: mk('__body'),
      documentElement:{ setAttribute(){}, removeAttribute(){}, getAttribute(){ return null; } }
    },
    localStorage:{
      getItem:k=>store.has(k)?store.get(k):null,
      setItem:(k,v)=>store.set(k,String(v)),
      removeItem:k=>store.delete(k)
    },
    location:{ reload(){} },
    Blob:function(parts, opts){ this.parts = parts; this.type = (opts && opts.type) || ''; },
    URL:{ createObjectURL:()=> 'blob:test', revokeObjectURL(){} },
    /* ⚠️ 浏览器天然有、vm 沙盒没有的全局对象要按需补齐（TextEncoder / atob / btoa …）。
       缺了不会"报错给测试看"：函数内部若包了 try/catch，报错会被吞掉，
       测试只看到"文件头不对 / 字节为 0"这类与真因无关的现象。 */
    atob: s => Buffer.from(String(s), 'base64').toString('binary'),
    btoa: s => Buffer.from(String(s), 'binary').toString('base64'),
    confirm:()=>{ throw new Error('系统 confirm() 被调用 —— 应使用 askConfirm'); },
    prompt:()=>{ throw new Error('系统 prompt() 被调用'); },
    alert:()=>{},
    open:(u)=>{ opened.push(u); return null; },
    matchMedia:()=>({ matches:false, addEventListener(){}, removeEventListener(){}, addListener(){} }),
    ResizeObserver:function(){ this.observe=()=>{}; this.disconnect=()=>{}; },
    navigator:{ userAgent:'node' },
    __confirmYes(){ const cb = confirmCb; confirmCb = null; if(cb) cb(); },
    __setConfirmCb(cb){ confirmCb = cb; },
    __opened: opened,
    __store: store
  };
  sandbox.window = sandbox;
  return { sandbox, store, opened };
}

const blocks = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
const appSrc = blocks.filter(s => s.includes('function doImport')).sort((a,b)=>b.length-a.length)[0];
if(!appSrc){ console.error('找不到应用脚本块'); process.exit(1); }

const { sandbox } = fresh();
vm.createContext(sandbox);
try{
  vm.runInContext(appSrc, sandbox, { filename:'app.js' });
  pass('应用脚本编译通过');
}catch(e){ fail('应用脚本编译失败：' + e.message); process.exit(1); }

const R = k => vm.runInContext(k, sandbox);
const DAY = 86400000;

/* ════════ [1] 备份提醒降频 ════════ */
console.log('\n[1] 备份提醒：三层闸门');
R(`
  S.backupRemindEnabled = true;
  S.backupRemindSnoozeUntil = 0;
  S.lastBackupAt = '';
`);
eq(R('backupRemindDue()'), true, '从没备份过 → 该提醒');

R('showBackupRemind();');
ok(R('S.backupRemindSnoozeUntil') > Date.now(), '弹出后进入 7 天静默期');
eq(R('backupRemindDue()'), false, '静默期内不再提醒');

R(`S.backupRemindSnoozeUntil = Date.now() - 8 * ${DAY};`);   // 8 天前弹过
eq(R('backupRemindDue()'), true, '静默期过了 8 天 → 又该提醒（但最多每 7 天一次）');

R(`S.lastBackupAt = new Date(Date.now() - 10 * ${DAY}).toLocaleString('zh-CN', {hour12:false});
   S.backupRemindSnoozeUntil = 0;`);
eq(R('backupRemindDue()'), false, '10 天前备份过 → 不提醒（30 天内都算新鲜）');

R(`S.lastBackupAt = new Date(Date.now() - 40 * ${DAY}).toLocaleString('zh-CN', {hour12:false});`);
eq(R('backupRemindDue()'), true, '40 天没备份 → 该提醒了');

R('S.backupRemindEnabled = false;');
eq(R('backupRemindDue()'), false, '总开关关掉 → 永不提醒');
R('S.backupRemindEnabled = true;');
eq(R('backupRemindDue()'), true, '总开关再打开 → 恢复判断');

R(`S.lastBackupAt=''; S.backupRemindSnoozeUntil=0;`);
R('toggleBackupRemind();');      // 开 → 关
eq(R('S.backupRemindEnabled'), false, '设置页开关：第一次点 = 关');
eq(R('backupRemindDue()'), false, '关掉后 due() 恒为 false');
R('toggleBackupRemind();');      // 关 → 开
eq(R('S.backupRemindEnabled'), true, '再点一次 = 开');

/* ════════ [2] 无批次导入自动建批次（丢数据 bug） ════════ */
console.log('\n[2] 无批次导入：自动建批次，数据必须落进批次');
R(`
  S.batches = []; S.activeBatchId = null; S.students = []; S.grades = [];
  importState = { step:2, fileName:'2026级新生名册.xlsx', header:[], cols:[], emptyCols:[],
    rows:[], mode:'append', headerIdx:0, rowNos:null, kind:'student', skipCols:new Set() };
`);
const rows2 = [
  { '学号':'2026001', '姓名':'张三', '民族':'汉族', '政治面貌':'共青团员' },
  { '学号':'2026002', '姓名':'李四', '民族':'回族', '政治面貌':'群众' }
];
sandbox.__rows2 = rows2;
R(`doImportMerge(window.__rows2, ['学号','姓名','民族','政治面貌'], 'append', null, '', 0, null);`);

eq(R('S.batches.length'), 1, '导入后自动建了 1 个批次');
eq(R('activeBatch().students.length'), 2, '2 人都写进了批次');
eq(R('S.students.length'), 2, '内存镜像同步');
eq(R('importState.result.autoBatchName'), '2026级新生名册', '结果页标明自动新建的批次名（用文件名）');
ok(R('buildSavePayload().batches[0].students.length') === 2,
   '★ 关键回归：save 载荷里批次真的带着这 2 人（旧版这里是 0，重开即丢）');
eq(R('buildSavePayload().activeBatchId'), R('S.activeBatchId'), '当前批次也一并持久化');

/* ════════ [3] 勾选排除字段 ════════ */
console.log('\n[3] 导入时勾选排除字段');
R(`
  S.batches = []; S.activeBatchId = null; S.students = [];
  S.batches.push(makeBatch('已有批次','demo',[
    { '学号':'2026001', '姓名':'张三', '民族':'汉族', '政治面貌':'共青团员' }
  ]));
  attachBatch(S.batches[0].id);
  importState = { step:2, fileName:'补充表.xlsx', header:[], cols:[], emptyCols:[],
    rows:[], mode:'append', headerIdx:0, rowNos:null, kind:'student', skipCols:new Set(['民族']) };
`);
sandbox.__rows3 = [
  { '学号':'2026001', '姓名':'张三改', '民族':'回族', '政治面貌':'中共预备党员' },
  { '学号':'2026003', '姓名':'王五', '民族':'壮族', '政治面貌':'群众' }
];
R(`doImportMerge(window.__rows3, ['学号','姓名','民族','政治面貌'], 'append', null, '', 0, null);`);
eq(R(`S.students.find(s=>String(s['学号'])==='2026001')['民族']`), '汉族',
   '被排除的「民族」列没有进来：张三原有民族原样保留');
eq(R(`S.students.find(s=>String(s['学号'])==='2026001')['政治面貌']`), '中共预备党员',
   '未排除的「政治面貌」正常更新');
const w5 = R(`S.students.find(s=>String(s['学号'])==='2026003')`);
ok(w5 && (w5['民族'] == null || w5['民族'] === ''), '新进的王五也没有民族（该列被排除）');
ok(w5 && w5['姓名'] === '王五', '新进的王五其他字段正常');

R(`S.batches=[]; S.activeBatchId=null; S.students=[];
   importState.skipCols = new Set(['学号']);`);      // 直接把学号塞进排除集（模拟乱来）
sandbox.__rows4 = [{ '学号':'2026009', '姓名':'赵六' }];
R(`doImportMerge(window.__rows4, ['学号','姓名'], 'append', null, '', 0, null);`);
eq(R('S.students.length'), 1, '即使有人把「学号」塞进排除集，导入仍按学号正常落库（代码里强制保留）');

R(`
  S.batches = []; S.activeBatchId = null; S.students = [];
  importState = { step:2, fileName:'名册.xlsx', header:[], cols:['学号','姓名','政治面貌','民族'],
    emptyCols:[], rows:[], mode:'append', headerIdx:0, rowNos:null, kind:'roster',
    skipCols:new Set(['政治面貌']) };
`);
const sum = R('importFieldSummary()');
ok(sum.includes('3 / 4 个字段'), '小结正确显示"将导入 3 / 4 个字段"');
ok(sum.indexOf('政治面貌') >= 0, '小结列出被排除的字段');
ok(sum.indexOf('不会把任何人同步为') >= 0, '★ 名册排除「政治面貌」时给出醒目警告');

R(`importState.skipCols = new Set();`);
const sum2 = R('importFieldSummary()');
ok(sum2.indexOf('默认全部导入') >= 0, '全部勾选时显示"默认全部导入"');

/* ════════ [4] 导入方式三卡紧凑化（静态断言） ════════ */
console.log('\n[4] 导入方式三卡紧凑化');
ok(html.includes('.modes{display:grid;grid-template-columns:repeat(3,1fr)'), '三卡一行排布（grid 三列）');
ok(html.includes('@media (max-width:560px)'), '窄屏媒体查询存在');
ok(/@media \(max-width:560px\)\{[^}]*\.modes\{grid-template-columns:1fr\}/.test(html.replace(/\n/g,'')),
   '窄屏时落成单列（不再挤出可视区）');
ok(html.includes('<div class="mode-tag">${tag}</div>'), '卡片改为"标题+短标签"结构');
ok(!/modeCard\('append'[\s\S]{0,80}<b>/.test(html), '卡片里不再塞长说明（长说明由 modeHint 承担）');
const mHint = R(`modeHint('append')`);
ok(mHint.indexOf('备注') >= 0 && mHint.indexOf('不会被删除') >= 0, '旧卡片里的关键规则在 modeHint 里都还在');

/* ════════ [5][6] 需要内联 SheetJS 与 tauriInvoke 桩，放异步段 ════════ */
(async () => {
  /* ── [5] 导出 Excel（维护用）：真解析回读，验证两张表与"学号是文本" ── */
  console.log('\n[5] 导出 Excel（维护用）');
  const libSrc = blocks.filter(s => s.length > 100000 && !s.includes('function doImport'))
                       .sort((a,b)=>b.length-a.length)[0];
  if(!libSrc){ fail('找不到内联 SheetJS 块'); finish(); return; }
  try{ vm.runInContext(libSrc, sandbox, { filename:'xlsx.js' }); pass('内联 SheetJS 在沙盒里加载成功'); }
  catch(e){ fail('SheetJS 加载失败：' + e.message); finish(); return; }

  R(`
    window.__saved = null;
    saveExportFile = (file, bytes) => { window.__saved = { file, bytes }; };
    S.batches = []; S.activeBatchId = null; S.students = [];
    S.batches.push(makeBatch('维护测试批次', 'demo', [
      { '学号':'2026001', '姓名':'张三', '性别':'男', '班级':'法语2401', '宿舍':'滨湖1栋101-01', '民族':'汉族' },
      { '学号':'2026002', '姓名':'李四', '性别':'女', '班级':'法语2401', '宿舍':'滨湖1栋101-02', '民族':'回族' }
    ], 'test.xlsx', [
      { '学号':'2026001', '姓名':'张三', '加权平均成绩':'88.5', '不及格门数':'0' }
    ]));
    attachBatch(S.batches[0].id);
  `);
  R(`exportBatchXlsx(activeBatch());`);
  const saved = R('window.__saved');
  ok(saved && /\.xlsx$/.test(saved.file), '导出文件名以 .xlsx 结尾：' + (saved && saved.file));
  const blen = saved && saved.bytes ? (saved.bytes.length ?? saved.bytes.byteLength) : 0;
  ok(blen > 1000, `字节非空（${blen} B，类型 ${saved && saved.bytes && saved.bytes.constructor.name}）`);
  ok(R(`new Uint8Array(window.__saved.bytes).length`) > 1000,
     '★ 落盘字节非空（ArrayBuffer 会被包成 Uint8Array，不会写出 0 字节文件）');
  R(`window.__wb = XLSX.read(window.__saved.bytes, { type:'array' });`);
  eq(R('window.__wb.SheetNames.join(",")'), '学生信息,成绩', '两个工作表：学生信息 / 成绩');
  const first = R(`XLSX.utils.sheet_to_json(window.__wb.Sheets['学生信息'])[0]`);
  ok(first && first['学号'] === '2026001', '回读第一行学号正确');
  eq(R(`typeof XLSX.utils.sheet_to_json(window.__wb.Sheets['学生信息'])[0]['学号']`), 'string',
     '★ 学号导出为文本（不会变 2.02E+11）');
  ok(first && first['宿舍'] === '滨湖1栋101-01', '宿舍列完整');
  ok(R(`Object.keys(window.__wb.Sheets['成绩']).length`) > 5, '成绩表有内容');
  ok(R(`XLSX.utils.sheet_to_json(window.__wb.Sheets['成绩'])[0]['加权平均成绩']`) === '88.5',
     '成绩表数值正确');

  /* ── [6] 常用模板 · 我的模板文件 ── */
  console.log('\n[6] 常用模板 · 我的模板文件');
  sandbox.__stubFiles = [
    { name:'a.pdf', rel:'a.pdf', path:'C:\\tpl\\a.pdf' },
    { name:'证明.docx', rel:'子\\证明.docx', path:'C:\\tpl\\子\\证明.docx' },
  ];
  R(`window.__invoked = [];
     window.__TAURI__ = { core: { invoke: (cmd, args) => {
        window.__invoked.push({ cmd, args });
        if(cmd === 'list_doc_files') return Promise.resolve(window.__stubFiles);
        return Promise.resolve('/fake/path');
     } } };`);
  eq(R('isDesktopApp()'), true, '打桩后按桌面版工作');

  R(`S.view='tpl'; renderLibPage('templates');`);
  ok(R(`document.getElementById('mainArea').innerHTML`).indexOf('我的模板文件') >= 0,
     '常用模板页出现「我的模板文件」区块');

  R(`openTplFolderModal();`);
  ok(R(`document.getElementById('modalRoot').innerHTML`).indexOf('tplDir') >= 0, '登记弹窗已打开');

  R(`document.getElementById('tplDir').value = 'C:\\tpl';`);   // 沙盒不解析 HTML，输入框得手动赋值
  R(`listTplDir();`);
  await new Promise(r => setImmediate(r));    // 冲掉微任务，让桩的 Promise 落地
  ok(R(`document.getElementById('tplDirList').innerHTML`).indexOf('证明') >= 0,
     '列出文件夹里的文档文件（含子文件夹）');

  sandbox.document.querySelectorAll = sel => sel === '.tpl-cand'
    ? [ { checked:true, dataset:{ i:'0' } }, { checked:true, dataset:{ i:'1' } } ]
    : [];
  R(`registerTplFiles();`);
  eq(R('tplFiles().length'), 2, '勾选后登记 2 个文件');
  ok(R(`tplFiles()[1].relText`) === '子\\证明.docx', '登记了相对路径（用于展示）');

  R(`openTplFile(tplFiles()[0].id);`);
  await new Promise(r => setImmediate(r));
  const inv = R('window.__invoked').filter(x => x.cmd === 'open_local_file');
  ok(inv.length >= 1 && inv[inv.length-1].args.path === 'C:\\tpl\\a.pdf', '打开时传的是登记的路径');
  ok(inv.length >= 1 && Array.isArray(inv[inv.length-1].args.extraAllowed)
     && inv[inv.length-1].args.extraAllowed.length === 2,
     '同时把整份登记清单传给白名单（extraAllowed）');

  R(`removeTplFile(tplFiles()[0].id);`);
  eq(R('tplFiles().length'), 1, '移除登记后剩 1 个');
  ok(R('buildSavePayload().templateFiles.length') === 1, '登记清单进了存档载荷');

  /* ── [7] 数据管理收敛 + 快照自动清理（v1.9.7.1） ── */
  console.log('\n[7] 数据管理收敛 & 快照自动清理');
  ok(html.includes('把数据取进来') && html.includes('备份与搬运') && html.includes('出问题回退'),
     '数据管理分三组（取数 / 备份搬运 / 出问题回退）');
  ok(html.includes('🛡 自动保护'), '「数据固化」降级为一行「自动保护」状态');
  ok(!html.includes('🔒 数据固化（防清缓存丢失）'), '不再有并列的「数据固化」卡片（消除重复观感）');
  ok(!/class="op"[^>]*gotoBackupHistory\(\)/.test(html), '「备份历史」不再作为平铺入口（已并入备份弹窗）');
  ok(!/class="op"[^>]*exportBackupFile\(\)/.test(html), '「完整备份」不再平铺（并入备份与恢复弹窗）');
  ok(html.includes('我导出的备份文件') && html.includes('打开备份文件夹'), '备份弹窗里补了「打开备份文件夹」与备份清单');

  // 快照清理：造 25 条历史，prune 后应只剩 20，且超出的 5 份被要求从磁盘删除
  R(`
    window.__deleted = [];
    window.__TAURI__ = { core: { invoke: (cmd, args) => {
      window.__invoked.push({ cmd, args });
      if(cmd === 'delete_data_file'){ window.__deleted.push(args.name); }
      return Promise.resolve(null);
    } } };
    S.importHistory = [];
    for(let i = 0; i < 25; i++){
      importState.kind = 'student';
      // 直接构造历史记录，模拟 recordImport 的产物（快照名带序号便于断言）
      S.importHistory.push({ id:'h'+i, ts:'2026-09-01 10:0'+i, type:'学生数据·合并',
        file:'f'+i+'.xlsx', batch:'', batchId:'', added:1, updated:0, skipped:0,
        snap:'disk:snap-h'+i+'.json' });
    }
    pruneOldSnapshots();
  `);
  eq(R('S.importHistory.length'), 20, '超过上限的快照记录被裁到 20 条');
  const deleted = R('window.__deleted');
  eq(deleted.length, 5, '★ 超出的 5 份快照文件被要求从磁盘删除（旧版永不清理，会无限堆积）');
  ok(deleted.every(n => /^snap-h\d+\.json$/.test(n)), '删的是快照文件名（不是别的数据文件）');
  ok(!deleted.includes('workstation-data.json'), '★ 绝不会误删磁盘镜像本身');
  ok(R('S.importHistory.every(r=>r.snap)') === true, '保留下来的记录快照引用完好（仍可回退）');

  // 宿舍卡片：静态断言（走响应式网格 + 窄屏两列 + 图标）
  ok(html.includes('class="stats stats-4 stats-dorm"'), '宿舍指标卡套了响应式网格（不再是单列满宽）');
  ok(html.includes('.stats-dorm .stat-lab'), '宿舍卡片标签在上、数字在下');
  ok(/@media \(max-width:640px\)\{ ?\.stats\.stats-dorm\{grid-template-columns:repeat\(2/.test(html),
     '★ 窄屏两列用的是 .stats.stats-dorm（更高优先级，压得住后段给总览页写死的 4 列）');
  ok(html.includes('stat-unit') && html.includes('stat-ico'), '数字带单位、标签带图标');

  /* ── [8] AI 辅导员页：去掉「在浏览器打开」 ── */
  console.log('\n[8] AI 辅导员页（企微专用链接）');
  R(`S.view='pol'; renderMain();`);
  const polHtml = R(`$('mainArea').innerHTML`);
  ok(polHtml.indexOf('在浏览器打开') < 0, '★ 不再出现「在浏览器打开」（这些链接只能在企微里打开）');
  ok(polHtml.indexOf('复制链接') >= 0, '保留「复制链接」（粘进班级群这条路径仍然在）');
  ok(polHtml.indexOf('qr-box') >= 0 && polHtml.indexOf('二维码') >= 0, '两张二维码仍在');
  ok(!/openLinkExternal\(\s*(LU_URL|BOT_URL)/.test(html.replace(/\s+/g, ' ')),
     '源码里不再用 openLinkExternal 打开这两个企微链接');

  /* ── [9] 导入指引页：改名 + 去冗余 + 修「第 ④ 步」── */
  console.log('\n[9] 导入指引页');
  /* ⚠️ 断言"某段文案不存在"只能看渲染结果：整份 HTML 里连注释都算，
     而注释里恰好会写"原先把「取数 · 导入指引」…"（自我指涉）。 */
  R(`S.sideCollapsed=false; renderSidebar(); S.batches=[]; S.activeBatchId=null; gotoGuide();`);
  const rendered9 = R(`$('sidebar').innerHTML + $('mainArea').innerHTML`);
  ok(rendered9.indexOf('取数') < 0, '渲染出来的界面上不再有"取数"字样（侧栏 + 指引页）');
  ok(rendered9.indexOf('导入指引') >= 0, '界面上叫「导入指引」');
  ok(html.indexOf('<span class="s-txt">导入指引</span>') >= 0, '侧栏条目叫「导入指引」');
  R(`S.batches=[]; S.activeBatchId=null; S.students=[]; S.grades=[]; gotoGuide();`);
  const gEmpty = R(`$('mainArea').innerHTML`);
  ok(gEmpty.indexOf('导入指引') >= 0, '页面标题是「导入指引」');
  ok(gEmpty.indexOf('class="flow"') < 0, '去掉了与编号卡片重复的流程条');
  ok(gEmpty.indexOf('about-box') < 0, '去掉了与系统设置重复的「关于」块');
  ok(gEmpty.indexOf('继续：导入成绩单') < 0, '没数据时不显示续看按钮');
  ok(gEmpty.indexOf('新手引导') >= 0 && gEmpty.indexOf('startTour()') >= 0, '保留「新手引导」「页面导览」两个短按钮');

  /* ── [10] 关注标签（可自定义） ── */
  console.log('\n[10] 关注标签');
  R(`S.focusTags = null;`);                     // 回到预置三枚
  eq(R('focusTags().length'), 3, '预置 3 个标签');
  eq(R(`focusTags().map(t=>t.emoji).join('')`), '🎭👩‍👦⛄', '★ 预置就是用户给的 🎭心理 / 👩‍👦单亲 / ⛄人际');
  ok(R(`focusTags().every(t=>t.label)`) === true, '每个标签都带名称（悬停时显示）');
  // ZWJ 组合字符不能逐字符拆 —— 用单亲（👩‍👦 由 👩+ZWJ+👦 组成）验证
  ok(R(`tagsOf({'关注标签':'👩‍👦'}).length`) === 1, '★ 👩‍👦 被当成一个标签（ZWJ 组合字符没被拆开）');
  // 顺序按"标签表顺序"输出（不随标记先后变化），所以比集合而不是比字符串顺序
  eq(R(`tagsOf({'关注标签':'👩‍👦🎭'}).slice().sort().join('')`), R(`['👩‍👦','🎭'].sort().join('')`),
     '多个标签都能还原（顺序固定按标签表排，不随标记先后变）');
  ok(R(`tagsOf({'关注标签':''}).length`) === 0 && R(`tagsOf({}).length`) === 0, '没标签时返回空');
  eq(R(`tagTitleOf({'关注标签':'🎭⛄'})`), '🎭心理 ⛄人际', '悬停提示把 emoji 翻成名称');
  // 关注逻辑：原来只认挂科/军训备注，现在自己标的标签也算
  ok(R(`hasFocus({'关注标签':'🎭'})`) === true, '★ 打了标签的学生进「需重点关注」');
  ok(R(`hasFocus({})`) === false, '没有任何信号的学生不算重点关注');
  ok(R(`hasFocus({'军训备注':'需留意'})`) === true, '原来的军训备注规则没被改坏');
  R(`S.batches=[]; S.activeBatchId=null; S.students=[];
     S.batches.push(makeBatch('标签测试','demo',[])); attachBatch(S.batches[0].id);
     setStudents([{'学号':'2026001','姓名':'张三'},{'学号':'2026002','姓名':'李四'}]);`);
  R(`toggleStudentTag('2026001','🎭');`);
  eq(R(`S.students[0]['关注标签']`), '🎭', '点一下给学生打上标签');
  R(`toggleStudentTag('2026001','⛄');`);
  eq(R(`S.students[0]['关注标签']`), '🎭⛄', '再点一个 → 两个标签');
  R(`toggleStudentTag('2026001','🎭');`);
  eq(R(`S.students[0]['关注标签']`), '⛄', '★ 再点同一个 → 取消该标签（不会把另一个也清掉）');
  R(`toggleStudentTag('2026001','⛄');`);
  ok(R(`S.students[0]['关注标签'] == null`) === true, '全部取消后存 null（不留空字符串）');
  // 列表显示 + 筛选
  R(`S.students[0]['关注标签']='🎭'; S.students[1]['关注标签']='👩‍👦⛄';`);
  ok(R(`tagBadge(S.students[0])`).indexOf('🎭') >= 0, '列表姓名后带标签图标');
  ok(R(`tagBadge(S.students[1])`).indexOf('title=') >= 0, '图标带悬停提示（名称）');
  R(`S.quickView='all'; S.filters={'关注标签':['🎭']};`);
  eq(R(`viewList().length`), 1, '★ 按 🎭 筛选只出 1 人（一串 emoji 也能"包含"匹配）');
  R(`S.filters={'关注标签':['⛄']};`);
  eq(R(`viewList().length`), 1, '按 ⛄ 筛选出的还是 1 人（含在 👩‍👦⛄ 里）');
  R(`S.filters={}; S.quickView='tagged';`);
  eq(R(`viewList().length`), 2, '「带标签学生」视图列出全部带标签的人');
  R(`S.quickView='focus';`);
  ok(R(`viewList().length`) >= 2, '「需重点关注」也把带标签的人算进去了');
  R(`S.quickView='all'; S.filters={};`);
  ok(R(`detailTagBlock('2026001')`).indexOf('toggleStudentTag') >= 0, '学生详情里有可点的标签行');
  ok(R(`detailTagBlock('2026001')`).indexOf('自定义标签') >= 0, '详情里能进「自定义标签」');
  R(`openTagManager();`);
  ok(R(`$('modalRoot').innerHTML`).indexOf('addFocusTag') >= 0, '标签管理弹窗（增删改）可打开');
  ok(R(`buildSavePayload().focusTags`) !== undefined, '标签表进了存档载荷（持久化）');

  /* ── [11] 内置表单模板 ── */
  console.log('\n[11] 内置表单模板（随程序打包）');
  // 模板数据在独立的 <script> 块里（与应用块分开），沙盒里要单独加载一次
  const tplSrc = blocks.filter(x=>x.includes('BUILTIN_TEMPLATES') && !x.includes('function doImport'))
                       .sort((a,b)=>b.length-a.length)[0];
  if(!tplSrc){ fail('找不到内联模板数据块'); }
  else { vm.runInContext(tplSrc, sandbox, { filename:'templates.js' }); pass('内联模板数据块已载入沙盒'); }
  const tplList = R('builtinTemplates()');
  eq(tplList.length, 8, '★ 8 份模板都已内联进程序');
  const groups11 = [...new Set(tplList.map(t=>t.group))].sort();
  ok(groups11.length >= 3, `按 ${groups11.length} 个分组展示：${groups11.join(' / ')}`);
  // 解码抽查：PDF 应以 %PDF 开头，docx/xlsx 是 zip（PK）
  let magicOk = 0, sizeOk = 0;
  for(const t of tplList){
    const head = R(`(function(){ var u=b64ToBytes(builtinTemplates().find(x=>x.name===${JSON.stringify(t.name)}).b64);
      return String.fromCharCode(u[0],u[1],u[2],u[3]); })()`);
    const expectZip = /^(docx|xlsx)$/.test(t.ext);
    if(expectZip ? head.startsWith('PK') : head.startsWith('%PDF')) magicOk++;
    const realLen = R(`b64ToBytes(builtinTemplates().find(x=>x.name===${JSON.stringify(t.name)}).b64).length`);
    if(realLen === t.size) sizeOk++;
  }
  eq(magicOk, 8, '★ 8 份解码后文件头都对（PDF=%PDF / Office=PK zip）');
  eq(sizeOk, 8, '★ 解码后字节数与源文件完全一致（没有截断）');
  ok(tplList.every(t=>/\.(pdf|docx|xlsx)$/.test(t.name)), '文件名都带正确扩展名（另存后能直接双击打开）');
  R(`S.view='tpl'; renderLibPage('templates');`);
  const tplPage = R(`$('mainArea').innerHTML`);
  ok(tplPage.indexOf('表单模板（内置 8 份）') >= 0, '常用模板页出现「表单模板（内置 8 份）」区块');
  ok(tplPage.indexOf('saveBuiltinTemplate(0)') >= 0, '每份都有「另存到下载」按钮');
  ok(tplPage.indexOf('报销') >= 0, '报销那三份按分组归好');
  /* 桌面版走的是外壳落盘命令（不是浏览器下载），所以断言的是"发出的 invoke 调用"。
     ⚠️ 别去钩 saveExportFile —— 那条路径压根不走它（钩错了会看到 null 还以为是产品坏了）。 */
  R(`window.__invoked = []; saveBuiltinTemplate(0);`);
  await new Promise(r => setImmediate(r));
  const inv11 = R('window.__invoked').filter(x=>x.cmd === 'save_to_downloads');
  ok(inv11.length === 1, '「另存到下载」发出了一次落盘调用');
  ok(inv11.length && inv11[0].args.name === tplList[0].name, '文件名与模板显示名一致：' + (inv11[0] && inv11[0].args.name));
  ok(inv11.length && Array.isArray(inv11[0].args.data) && inv11[0].args.data.length > 1000,
     `落盘字节数 ${inv11.length ? inv11[0].args.data.length : 0}（不是 0 字节文件）`);

  /* ── [12] 关键不变量：内存数据必须与批次是「同一份」 ──
     v1.9.6 丢数据的根因就是这条被破坏（数据写进内存、没进批次 → 重开即丢）。
     现在除了 setStudents/setGrades 的约定，还有 save() 里的 console.warn 兜底，
     但那句警告用户看不见，所以这里用断言把它钉死：
       ① 正常路径下 S.students / S.grades 必须与当前批次是同一个数组（比 ===，不是比长度）
       ② 万一真的脱钩了（旧数据迁移等场景会造出孤儿数组），在详情页录的成绩仍必须落进批次 */
  console.log('\n[12] 不变量：内存数据与批次必须同一份');
  R(`S.batches = []; S.activeBatchId = null; S.students = []; S.grades = [];
     S.batches.push(makeBatch('不变量测试', 'demo', [{'学号':'2026001','姓名':'张三'}]));
     attachBatch(S.batches[0].id);`);
  ok(R('S.students === activeBatch().students') === true, '正常路径：S.students 与批次是同一份（身份相等）');
  ok(R('S.grades === activeBatch().grades') === true, '正常路径：S.grades 与批次是同一份（身份相等）');
  ok(R('buildSavePayload().batches[0].students === S.students') === true, '存档载荷里用的就是这一份');

  // ② 故意制造脱钩（S.grades 指向新建的空数组，不再指向 b.grades），再录一条成绩
  R(`S.grades = [];
     curStudent = S.students[0];
     detailDraft = { fields:{'学号':'2026001'}, grade:{'加权平均成绩':'88.5'} };
     saveDetailEditApply();`);
  ok(R('(activeBatch().grades||[]).length') === 1,
     '★ 脱钩状态下录的成绩仍然落进批次（不会重开就没了）');

  /* ── [13] AI 助理页三入口 + 金句框定宽（v2.1.0）── */
  console.log('\n[13] AI 助理页三入口 & 金句框定宽');
  ok(html.includes("class=\"asst-cards\""), '布局类改名为 .asst-cards（原来是 .asst-2col，两栏）');
  ok(/\.asst-cards\{display:grid;grid-template-columns:repeat\(3/.test(html), '★ 三栏并排（repeat(3,minmax(0,1fr))）');
  ok(html.includes('@media (max-width:1180px){ .asst-cards{grid-template-columns:repeat(2'), '窄屏退 2 栏');
  ok(html.includes('@media (max-width:720px){ .asst-cards{grid-template-columns:1fr'), '手机退 1 栏');
  ok(!html.includes('asst-2col'), '旧类名 .asst-2col 已无残留');
  ok(html.includes('const XSGZZL_URL') && html.includes('const QR_XSGZZL'), '新增学工工作助理的链接与二维码常量');
  const _u = R('XSGZZL_URL');
  ok(_u.indexOf('https') === 0 && _u.indexOf('/wework_admin/common/openBotProfile/') > 0
     && /^[0-9a-f]{32}$/.test(_u.slice(-32)),
     '链接与另外两个同一种格式（openBotProfile + 32 位 hash）：' + _u.slice(-12) + '…');
  ok(R('XSGZZL_URL').slice(-32) !== R('LU_URL').slice(-32) && R('XSGZZL_URL').slice(-32) !== R('BOT_URL').slice(-32),
     '★ 和另外两个不是同一个机器人（hash 不同）');
  // 金句框：定宽 + 允许收缩（两者缺一不可）
  ok(/\.quote-bar\{[\s\S]{0,420}width:min\(46vw,556px\);min-width:0;/.test(html), '★ 金句框按最长语录定宽（40 字 → 556px）');
  ok(html.includes('.topbar .quote-bar{flex:0 1 auto}'), '★ 用两个类的选择器压过 .topbar>*{flex-shrink:0}（否则撑破顶栏）');
  ok(html.indexOf('max-width:min(46vw,560px)') < 0, '旧的 max-width 写法已移除（那正是"换句就跳"的原因）');

  finish();
})().catch(e => { console.error('测试执行出错：' + (e && e.stack || e)); process.exit(1); });

function finish(){
  console.log(failN ? `\n共 ${failN} 项问题` : '\n全部通过 ✅');
  process.exit(failN ? 1 : 0);
}

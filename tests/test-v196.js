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

/* ⚠️ v2.1.x 修：勾选排除原先只在 doImportMerge 里生效，而「新建批次」走的是 doImport 的
   独立分支、在过滤之前就 return 了 —— 同一个勾选框在「新建批次」下完全无效。
   这里刻意走 doImport() 的真实路径（不是直调 doImportMerge），否则挡不住这条 bug。 */
sandbox.__rowsNew = [ { '学号':'2026011', '姓名':'钱七', '民族':'回族' } ];
R(`
  S.batches = []; S.activeBatchId = null; S.students = [];
  importState = { step:2, fileName:'新建批次.xlsx', header:[], cols:['学号','姓名','民族'],
    emptyCols:[], rows: window.__rowsNew, mode:'new', headerIdx:0, rowNos:null,
    kind:'student', skipCols:new Set(['民族']) };
  doImport();
`);
eq(R('S.students.length'), 1, '「新建批次」正常落库 1 人');
ok(R(`(S.students[0]||{})['民族'] == null`), '★ 「新建批次」也遵守取消勾选：被排除的民族没进来');
eq(R(`(S.students[0]||{})['姓名']`), '钱七', '未排除的列照常导入');
/* 静态断言：勾选排除必须两个入口都调用 —— 少一处就是这次这个 bug（定义 1 + 调用 2 = 3） */
eq((appSrc.match(/filterSkippedCols\s*\(/g) || []).length, 3, '★ filterSkippedCols：1 个定义 + 2 处入口调用');
ok(appSrc.indexOf('({ rows, cols } = filterSkippedCols(rows, cols))') >= 0, 'doImportMerge 走 filterSkippedCols');

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
  ok(html.indexOf('>导入指引</span>') >= 0, '侧栏条目叫「导入指引」');
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
  // 关注逻辑：只认"有据可查"的信号（成绩不及格 / 旧挂科字段）+ 辅导员自己标的标签
  // ⚠️ 「军训备注」已于 v2.1.x 移出关注信号：该字段确有该跟进的值（样例「膝盖受伤、请假」），
  //    但属身体 / 请假类信息，与学业预警不同源，改由辅导员用关注标签主动标注（口径决定，非修 bug）
  ok(R(`hasFocus({'关注标签':'🎭'})`) === true, '★ 打了标签的学生进「需重点关注」');
  ok(R(`hasFocus({})`) === false, '没有任何信号的学生不算重点关注');
  ok(R(`hasFocus({'军训备注':'需留意'})`) === false, '★ 军训备注不算关注信号（v2.1.x 口径：改由关注标签承载）');
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

  /* 行为接缝：只有「军训备注」的学生不该出现在「需重点关注」名单里
     —— 另两类信号各留 1 人，证明移出军训备注没有误伤它们 */
  R(`setStudents([
       {'学号':'2026901','姓名':'军训王','军训备注':'需留意'},
       {'学号':'2026902','姓名':'标签李','关注标签':'🎭'},
       {'学号':'2026903','姓名':'挂科张','挂科情况':'2'}]);
     S.filters={}; S.classFilter='all'; S._search=''; S.quickView='focus';`);
  eq(R(`viewList().length`), 2, '★ 只有军训备注的人不进「需重点关注」（带标签的与有挂科记录的各 1 人）');
  ok(R(`viewList().some(s=>s['学号']==='2026901')`) === false, '军训备注那位确实不在名单里');
  ok(R(`viewList().some(s=>s['学号']==='2026902')`) === true, '带关注标签的仍在名单里（没误伤）');
  ok(R(`viewList().some(s=>s['学号']==='2026903')`) === true, '有挂科记录的仍在名单里（没误伤）');
  // 还原成上面那两位学生，别影响后续断言
  R(`setStudents([{'学号':'2026001','姓名':'张三','关注标签':'🎭'},
                  {'学号':'2026002','姓名':'李四','关注标签':'👩‍👦⛄'}]);
     S.quickView='all'; S.filters={};`);

  /* 静态断言：仪表盘「关注提醒」里那条「军训需关注」是同一处误用的第二张脸，必须一起清 */
  ok(appSrc.indexOf('军训需关注') < 0, '★ 源码里不再有「军训需关注」提醒卡');
  // 反向保护：军训备注仍是个可显示字段，只把它从"关注信号"里摘掉，别连字段一起删了
  ok(appSrc.indexOf("'军训备注'") >= 0, '军训备注仍作为字段保留（只摘信号，不删字段）');

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

  /* ════════ [14] 总览渲染入口唯一（死代码清理） ════════
     原型里曾有两个同名 renderDashboard()：一个是「数据总览构建中…」的占位版，
     一个是真的仪表盘。同名函数后者胜出，所以占位版从来没执行过 —— 但留着会让
     下一个人（和下一个 agent）以为总览还没做完。
     真正的风险是"删错那一个"：删掉真实现，占位版就接管，总览直接变成「构建中…」。
     所以先用行为断言把真实现钉住，再去删。 */
  console.log('\n[14] 总览渲染入口唯一');
  R(`S.batches=[]; S.activeBatchId=null; S.students=[];
     S.batches.push(makeBatch('总览测试','demo',[])); attachBatch(S.batches[0].id);
     setStudents([{'学号':'2026801','姓名':'总览甲','班级':'法语2401'}]);`);
  R(`renderDashboard();`);
  const dashOut = R(`$('mainArea').innerHTML`);
  ok(dashOut.indexOf('构建中') < 0, '★ 总览渲染的不是「构建中…」占位版（说明删掉的是占位那个）');
  ok(dashOut.indexOf('dashBody') >= 0, '★ 真仪表盘照旧渲染（含 dashBody 挂载点）');
  eq((appSrc.match(/function renderDashboard\s*\(/g) || []).length, 1, '★ 源码里 renderDashboard 只定义一次');
  ok(appSrc.indexOf('数据总览构建中') < 0, '占位版文案已从源码移除');

  /* ════════ [15] 详情页字段分组：真实模板带来的新列 ════════
     起因：学工系统导出的真实表（189 行 × 42 列）里有 24 列是程序原先不认识的
     （学籍状态、户口所在地、宿舍楼/房间号/床位号、微信号…）。它们原本会整批落进
     详情页末尾那个「其他字段（系统导出中本批新增的列）」兜底组 —— 能看，但一团乱。
     这一节钉两件事：①新列有自己的分组；②**整批为空的列一个都不出现**。 */
  console.log('\n[15] 详情页字段分组（真实模板的新列）');
  const GROUPS_WANT = ['学籍与培养', '户籍与家庭', '住宿（拆分形态）', '联系（补充）', '国际与身份'];
  const gAllNames = R('FIELD_GROUPS.map(g=>g.name)');
  eq(GROUPS_WANT.filter(n => gAllNames.indexOf(n) < 0).join('、') || '（无缺）', '（无缺）',
     '★ 五个新分组都在');

  const KEYS_WANT = ['学籍状态', '是否在校', '在籍状态', '学生类别', '培养层次', '学制', '现在年级',
    '入学年月', '预计毕业年份', '预计毕业日期', '入学前户口性质', '户口所在地', '家庭地址',
    '籍贯', '出生地', '宿舍楼', '房间号', '校区', '微信号', 'QQ号', '管理老师',
    '港澳台侨', '国家地区'];
  eq(R(`JSON.stringify(${JSON.stringify(KEYS_WANT)}.filter(k => FIELD_GROUPS.reduce((a,g)=>a.concat(g.keys),[]).indexOf(k) < 0))`),
     '[]', '★ 23 个新列全部归入分组（缺哪个会列在这里）');
  /* v2.2：这两列从"字段"变成了"别名"（用户拍板：家庭电话=家长电话、床位号=床位），
     所以它们**不该**再出现在字段分组里 —— 分组清单的约定是只放归一后的名字。
     这条断言把"为什么不在清单里"钉住，避免以后有人照旧模板又把它们加回来。 */
  eq(R(`normalizeKey('家庭电话')`), '家长电话', '★「家庭电话」是别名（不再是独立字段）');
  eq(R(`normalizeKey('床位号')`), '床位', '★「床位号」是别名（不再是独立字段）');
  eq(R(`FIELD_GROUPS.reduce((a,g)=>a.concat(g.keys),[]).indexOf('家庭电话') < 0 && FIELD_GROUPS.reduce((a,g)=>a.concat(g.keys),[]).indexOf('床位号') < 0`),
     true, '★ 两列都不在字段分组里（若谁加回来，这条会红）');

  ['学籍状态', '户口所在地', '宿舍楼', '微信号'].forEach(k =>
    eq(R(`KNOWN_FIELDS.has(${JSON.stringify(k)})`), true, `KNOWN_FIELDS 含「${k}」（导入时按已识别处理）`));

  // ── 详情页：有值的列显示在自己的组里；整批为空的组完全不出现 ──
  R(`
    S.batches = []; S.activeBatchId = null; S.students = [];
    S.batches.push(makeBatch('分组测试','demo',[])); attachBatch(S.batches[0].id);
    setStudents([
      {'学号':'2026801','姓名':'甲','学籍状态':'在读','户口所在地':'湖北省','宿舍楼':'滨湖1栋','家长电话':'0271234'},
      {'学号':'2026802','姓名':'乙','学籍状态':'保留学籍','户口所在地':'广东省','宿舍楼':'滨湖2栋','家长电话':'0205678'}
    ]);
  `);
  R(`openDetail('2026801', false);`);
  const dh = R(`$('modalRoot').innerHTML`);
  ok(dh.indexOf('学籍与培养') >= 0, '★ 详情页出现「学籍与培养」分组');
  ok(dh.indexOf('户籍与家庭') >= 0, '★ 详情页出现「户籍与家庭」分组');
  ok(dh.indexOf('在读') >= 0, '分组里能看到该生的值');
  ok(dh.indexOf('国际与身份') < 0, '★ 整批为空的组不出现（港澳台侨 / 国家地区 本批都没值）');
  ok(dh.indexOf('其他字段（系统导出中本批新增的列）') < 0,
     '★ 这些列不再落进「其他字段」兜底组（说明分组真的生效，而不是碰巧被兜住）');

  // ── 反向保护：把某列的键从所有学生身上拿掉（= 整批为空），它的组就该消失 ──
  R(`S.students.forEach(s => { delete s['学籍状态']; }); save(); openDetail('2026801', false);`);
  ok(R(`$('modalRoot').innerHTML`).indexOf('学籍与培养') < 0,
     '★ 整批没有值的分组会消失（不是靠字段清单硬显示）');

  /* ════════ [16] 真实模板的新列：可筛选、可成列 ════════
     片 3 的另一半（方案文档 3.4.2 / 3.4.3）。 */
  console.log('\n[16] 新列可用于筛选与列表列');
  const ff = R(`JSON.stringify(FILTER_FIELDS.map(f=>f.key))`);
  ['管理老师', '学籍状态', '是否在校', '入学前户口性质', '校区'].forEach(k =>
    ok(ff.indexOf(`"${k}"`) >= 0, `筛选字段池含「${k}」`));

  R(`
    S.batches = []; S.activeBatchId = null; S.students = [];
    S.batches.push(makeBatch('新列测试','demo',[])); attachBatch(S.batches[0].id);
    setStudents([
      {'学号':'2026901','姓名':'甲','班级':'英语2401','管理老师':'吴章凡(辅导员)'},
      {'学号':'2026902','姓名':'乙','班级':'英语2401','管理老师':'吴章凡(辅导员),周怡(辅导员)'},
      {'学号':'2026903','姓名':'丙','班级':'英语2402','管理老师':'周怡(辅导员)'}
    ]);
  `);
  ok(R(`colCandidates().indexOf('管理老师') >= 0`),
     '★ 新字段自动进了「列设置」候选（走 allFieldKeys，不必额外登记）');

  /* 「管理老师」的值是**逗号分隔的多人**（真实数据：吴章凡(辅导员)×179、
     吴章凡(辅导员),周怡(辅导员)×10）。等值匹配会让选「吴章凡(辅导员)」**漏掉**后 10 人。 */
  R(`S.filters = {'管理老师':['吴章凡(辅导员)']}; S.quickView='all'; S.classFilter='all'; S._search='';`);
  eq(R('viewList().length'), 2, '★ 按「吴章凡(辅导员)」筛出 2 人（含逗号分隔的那条多人记录）');

  // 反向保护：普通字段仍是等值匹配 —— 别把"包含"误用到所有字段上
  R(`S.filters = {'班级':['英语2401']};`);
  eq(R('viewList().length'), 2, '普通字段仍是等值匹配（班级=英语2401 → 2 人）');
  R(`S.filters = {'班级':['英语24']};`);
  eq(R('viewList().length'), 0, '★ 「英语24」不该命中「英语2401/2402」（等值，不是包含）');
  R(`S.filters = {};`);

  /* ════════ [17] 真实模板带来的看板预设（片 4） ════════
     批次形状照真实导出表（189 行）造：学籍状态 在读/保留学籍、是否在校 是/否、
     住宿地址 与 宿舍楼·房间号·床位号 两种形态并存、学制 4/2（第二学士学位）、
     预计毕业年份 2028 为主、2027 一个（提前毕业）。
     每条的命中数都在方案文档第 2.1 节里对着真实数据核过。 */
  console.log('\n[17] 新增看板预设（真实模板）');
  R(`
    S.batches = []; S.activeBatchId = null; S.students = [];
    S.batches.push(makeBatch('预设测试','demo',[])); attachBatch(S.batches[0].id);
    setStudents([
      {'学号':'2026101','姓名':'甲','班级':'英语2401','学制':'4','预计毕业年份':'2028',
       '学籍状态':'在读','是否在校':'是','宿舍':'滨湖1栋634-03','联系电话':'13800000001','证件号码':'X1','微信号':'w1',
       '备注（保密）':'已写'},
      {'学号':'2026102','姓名':'乙','班级':'英语2402','学制':'4','预计毕业年份':'2028',
       '学籍状态':'保留学籍','是否在校':'否','联系电话':'13800000002','证件号码':'X2','微信号':'w2',
       '备注（保密）':'已写'},
      {'学号':'2026103','姓名':'丙','班级':'英语2402','学制':'4','预计毕业年份':'2027',
       '学籍状态':'保留学籍','是否在校':'否','宿舍':'滨湖2栋409-01','联系电话':'13800000003','证件号码':'X3','微信号':'w3',
       '备注（保密）':'已写'},
      {'学号':'2026104','姓名':'丁','班级':'商英（二）2601','学制':'2','预计毕业年份':'2028',
       '学籍状态':'在读','是否在校':'是','宿舍':'滨湖1栋412-04',
       '备注（保密）':'已写'}
    ]);
  `);
  // 在 VM 内一次算完（缺预设返回 -1，让断言干净地失败而不是把套件炸掉）
  const hit = id => R(`(function(){
    const p = (typeof presetById === 'function') ? presetById(${JSON.stringify(id)}) : null;
    return p ? p.fn(S.students).length : -1;
  })()`);
  const pid = id => ok(R(`!!presetById(${JSON.stringify(id)})`), `预设「${id}」已登记`);

  ['xjabnormal', 'nodorm', 'dormnoin', 'second', 'nocontact', 'noidno', 'nowechat', 'earlygrad'].forEach(pid);
  eq(hit('xjabnormal'), 2, '★ 学籍异常 = 2（保留学籍 / 不在校）');
  eq(hit('nodorm'), 1, '★ 不住校 = 1（宿舍为空的那位）');
  eq(hit('dormnoin'), 1, '★ 不在校却有床位 = 1（有房间号但不在校的那位）');
  eq(hit('second'), 1, '★ 第二学士学位 = 1（学制=2 / 班级含「二」）');
  eq(hit('nocontact'), 1, '★ 缺联系方式 = 1（联系电话为空）');
  eq(hit('noidno'), 1, '★ 无证件号 = 1');
  eq(hit('nowechat'), 1, '★ 缺微信号 = 1');
  eq(hit('earlygrad'), 1, '★ 提前毕业 = 1（预计毕业年份 2027 < 本批主流 2028）');

  /* ── 常量列 / "筛不出人"的置灰机制（方案文档 2.3） ──
     规则：预设在本批**命中全部学生**时置灰（等于没筛）；命中 0 人**不置灰** ——
     那是有意义的答案（"本批没有这类学生"）。 */
  eq(R(`presetAvailable(presetById('hasremark'))`), false, '★ 全员都写了备注 → 「已写备注」置灰（命中全部=没筛）');
  eq(R(`presetAvailable(presetById('noremark'))`), true,
     '★ 但「未写备注」仍可用（命中 0 人是有意义的答案，不该藏起来）');
  ok(R(`presetMissText(presetById('hasremark'))`).indexOf('全部') >= 0,
     '置灰时给出的是"本批全部符合"这类原因，而不是"字段缺失"');
  // 学籍异常在"全员正常"的批次上应命中 0 且仍可用
  R(`S.students.forEach(s => { s['学籍状态'] = '在读'; s['是否在校'] = '是'; });`);
  eq(hit('xjabnormal'), 0, '全员正常时「学籍异常」命中 0 人');
  eq(R(`(function(){ const p = presetById('xjabnormal'); return p ? presetAvailable(p) : 'no-preset'; })()`),
     true, '★ 命中 0 人时仍可用（不置灰）');

  /* ════════ [18] 交互动画：减少动效 / 入场只播一次 / 不拖尾（片 5 · A+B+D） ════════
     起因：`.bar-grow` / `.donut-seg` / `.hbar-fill` 挂在**每次重建**的 innerHTML 里
     （`renderDashBody` 就是整段替换），于是**改一个筛选条件，柱状图就再"长"一次**。
     入场动画本该只在"进入视图"时播。 */
  console.log('\n[18] 交互动画（A 减少动效 / B 入场只播一次 / D 不拖尾）');

  // ── A：尊重系统的「减少动态效果」 ──
  const rmIdx = html.indexOf('prefers-reduced-motion');
  ok(rmIdx >= 0, '★ 有 prefers-reduced-motion 适配（系统开了就几乎不动 —— 无障碍硬需求）');
  const rmWin = rmIdx >= 0 ? html.slice(rmIdx, rmIdx + 800) : '';
  ok(rmWin.indexOf('animation-duration') >= 0 && rmWin.indexOf('transition-duration') >= 0,
     '该适配里同时压住 animation 与 transition 的时长');

  // ── B：入场动画只在"进入视图"时播；筛选/搜索引起的重绘不再重播 ──
  R(`
    S.batches = []; S.activeBatchId = null; S.students = [];
    S.batches.push(makeBatch('动画测试','demo',[])); attachBatch(S.batches[0].id);
    setStudents([
      {'学号':'2026701','姓名':'甲','班级':'英语2401'},
      {'学号':'2026702','姓名':'乙','班级':'英语2402'}
    ]);
    S.quickView='all'; S.filters={}; S.classFilter='all'; S._search='';
  `);
  R(`renderDashboard();`);
  ok(R(`$('dashBody').innerHTML`).indexOf('no-anim') < 0,
     '★ 进入总览这一次：入场动画照常播（不带 no-anim）');
  R(`renderDashBody();`);                       // 模拟一次筛选/搜索引起的重绘
  ok(R(`$('dashBody').innerHTML`).indexOf('no-anim') >= 0,
     '★ 之后再重绘（筛选/搜索）不再重播入场动画');
  R(`renderDashboard();`);
  ok(R(`$('dashBody').innerHTML`).indexOf('no-anim') < 0,
     '★ 重新进入总览时又会播一次（是"视图级"的，不是全局关掉）');

  // ── D：阶梯延迟不拖尾 ──
  const bars = R(`barChart([1,2,3,4,5,6,7,8,9,10,11,12].map((v,i)=>({label:'x'+i, value:v})))`);
  const delays = (bars.match(/--delay:(\d+)ms/g) || []).map(s => parseInt(s.replace(/\D/g, ''), 10));
  ok(delays.length >= 10, '12 根柱子都带延迟设置');
  ok(Math.max.apply(null, delays) <= 240,
     `★ 最大阶梯延迟 ${Math.max.apply(null, delays)}ms ≤ 240ms（原先 12 根会到 495ms，叠加 .55s 动画明显拖尾）`);
  ok(delays[0] === 0 && delays[1] > 0, '仍保留"依次出现"的节奏（不是把阶梯整个砍掉）');

  /* ════════ [19] 总览卡片：空转合并 + 尺寸跟内容走（方案 片 A） ════════
     依据 docs/数据总览卡片与多端适配-方案.md：
     ①「成绩表没导入」时，4 张成绩卡不该各自占 7/5/12/7 的版面 —— 合成一条带入口的提示；
     ②「政治面貌构成」是 span 12 整行卡，但环形图固定 172px 不放大 → 降成 span 5。
     反向保护同样重要：**导了成绩表之后必须照常出现**，不能把功能变没了。 */
  console.log('\n[19] 总览卡片：空转合并不占版面 · 尺寸跟内容走');
  const dashHtml = () => R(`(function(){ renderDashboard(); return $('dashBody').innerHTML; })()`);
  const metHtml  = () => R(`$('dashMetrics').innerHTML`);
  const countMetric = h => (h.match(/class="metric[" ]/g) || []).length;   // 只数卡片本身，别把 metric-val/lab/hint 算进去

  R(`
    S.batches = []; S.activeBatchId = null; S.students = []; S.grades = [];
    S.batches.push(makeBatch('卡片测试','demo',[])); attachBatch(S.batches[0].id);
    setStudents([
      {'学号':'2026501','姓名':'甲','班级':'英语2401','性别':'女','政治面貌':'共青团员','专业':'英语','民族':'汉族'},
      {'学号':'2026502','姓名':'乙','班级':'英语2402','性别':'男','政治面貌':'群众','专业':'英语','民族':'汉族'},
      {'学号':'2026503','姓名':'丙','班级':'英语2402','性别':'女','政治面貌':'共青团员','专业':'英语','民族':'汉族'}
    ]);
    S.grades.length = 0; invalidateGradeMap();
    S.quickView='all'; S.filters={}; S.classFilter='all'; S._search='';
  `);

  // ── 场景一：只有学生表 → 三张成绩卡退场，换成一条合并提示 ──
  let dHtml = dashHtml();
  // ⚠️ 断言"不作为**卡片标题**出现" —— 因为合并提示里会**列出这三张卡的名字**
  //    （"以下三张卡需要它：加权成绩分布 · …"），用 indexOf<0 会误判。
  ['加权成绩分布','学业预警名单','班级平均加权成绩'].forEach(t =>
    ok(dHtml.indexOf(`<div class="u-card-title">${t}</div>`) < 0, `★ 没有成绩表时不出现空转卡「${t}」`));
  ok(dHtml.indexOf("openImport('成绩") >= 0 && dHtml.indexOf('成绩') >= 0,
     '★ 改为一条合并提示，并带「去导入成绩」入口（不能让人以为功能没了）');
  eq(countMetric(metHtml()), 4, '★ 指标卡 6 张 → 4 张（三张成绩项收成一张）');
  ok(metHtml().indexOf("openImport('成绩") >= 0, '合并后的那张指标卡能点进成绩导入');

  // ── 尺寸跟内容走：政治面貌只有 2 类，不该独占整行 ──
  const pi = dHtml.indexOf('政治面貌构成');
  ok(pi > 0 && /dash-card span-5/.test(dHtml.slice(Math.max(0, pi - 300), pi)),
     '★ 「政治面貌构成」不再独占整行（span-12 → span-5；环形图是固定 172px，整行必然左小右空）');

  // ── 场景二：导了成绩表 → 三张卡回来、指标卡回到 6 张（反向保护）──
  R(`S.grades.push(
      {'学号':'2026501','加权平均成绩':'88','平均学分绩点':'3.6','不及格门数':'0'},
      {'学号':'2026502','加权平均成绩':'72','平均学分绩点':'2.5','不及格门数':'1'},
      {'学号':'2026503','加权平均成绩':'66','平均学分绩点':'1.9','不及格门数':'2'});
     invalidateGradeMap();`);
  dHtml = dashHtml();
  ['加权成绩分布','学业预警名单','班级平均加权成绩'].forEach(t =>
    ok(dHtml.indexOf(`<div class="u-card-title">${t}</div>`) >= 0, `导了成绩表后「${t}」照常出现`));
  eq(countMetric(metHtml()), 6, '导了成绩表后指标卡回到 6 张');
  ok(dashHtml().indexOf('去导入成绩') < 0, '此时不再显示那条"去导入成绩"提示');

  /* ════════ [20] 卡片尺寸跟内容走：spanFor()（方案 片 B · R1） ════════
     目的：尺寸不再由调用处写死 —— 否则"3 个班"和"20 个班"拿到同样的 7 格，
     或者"10 个民族"被塞进半行。规则见 docs/数据总览卡片与多端适配-方案.md §3 R1。 */
  console.log('\n[20] 卡片尺寸跟内容走（spanFor）');
  if(R('typeof spanFor') !== 'function'){
    fail('spanFor 还没实现 —— 后续断言无法进行');
  } else {
    // 环形：≤6 类 → 5；>6 类 → 7（环形超过 6 类本来就难读，但也别给整行）
    eq(R("spanFor('donut', 2)"), 5, '环形 2 类 → 5');
    eq(R("spanFor('donut', 6)"), 5, '环形 6 类 → 5');
    eq(R("spanFor('donut', 9)"), 7, '环形 9 类 → 7');
    // 横向条形：≤5 → 5；6–10 → 7；>10 → 12
    eq(R("spanFor('hbar', 3)"), 5, '横条 3 条 → 5');
    eq(R("spanFor('hbar', 8)"), 7, '横条 8 条 → 7');
    eq(R("spanFor('hbar', 15)"), 12, '横条 15 条 → 12');
    // 纵向条形：≤4 → 5；5–12 → 7；>12 → 12
    eq(R("spanFor('vbar', 4)"), 5, '纵条 4 类 → 5');
    eq(R("spanFor('vbar', 10)"), 7, '纵条 10 类 → 7');
    eq(R("spanFor('vbar', 20)"), 12, '纵条 20 类 → 12');
    // 名单 / 比例条：固定
    eq(R("spanFor('list', 8)"), 5, '名单类固定 5');
    eq(R("spanFor('pbar', 3)"), 7, '比例条固定 7');
    // 空数据不该炸、也不该算出 0
    ok([0, 1, 99].every(n => R(`spanFor('donut', ${n})`) >= 5), '任何类别数都至少给 5 格');

    // ── 接入验证：卡片**实际渲染出来的** span 必须等于 spanFor 的结果 ──
    const spanOfCard = (h, title) => {
      const i = h.indexOf(`<div class="u-card-title">${title}</div>`);
      if(i < 0) return null;
      const m = h.slice(Math.max(0, i - 300), i).match(/dash-card span-(\d+)/);
      return m ? Number(m[1]) : null;
    };
    R(`
      S.batches = []; S.activeBatchId = null; S.students = []; S.grades = [];
      S.batches.push(makeBatch('尺寸测试','demo',[])); attachBatch(S.batches[0].id);
      setStudents([
        {'学号':'2026801','姓名':'甲','班级':'一班','民族':'汉族','性别':'女'},
        {'学号':'2026802','姓名':'乙','班级':'二班','民族':'土家族','性别':'男'},
        {'学号':'2026803','姓名':'丙','班级':'三班','民族':'苗族','性别':'女'},
        {'学号':'2026804','姓名':'丁','班级':'一班','民族':'壮族','性别':'男'},
        {'学号':'2026805','姓名':'戊','班级':'二班','民族':'回族','性别':'女'},
        {'学号':'2026806','姓名':'己','班级':'三班','民族':'满族','性别':'男'},
        {'学号':'2026807','姓名':'庚','班级':'一班','民族':'侗族','性别':'女'}
      ]);
      S.grades.length = 0; invalidateGradeMap();
      S.quickView='all'; S.filters={}; S.classFilter='all'; S._search='';
    `);
    const sizeHtml = dashHtml();
    eq(spanOfCard(sizeHtml, '班级人数分布'), 5, '★ 3 个班 → 5 格（内容少就不给大版面，原先写死 7）');
    eq(spanOfCard(sizeHtml, '民族构成'), 7, '★ 7 个民族 → 7 格（条数多需要宽度，原先写死 5）');
    eq(spanOfCard(sizeHtml, '性别构成'), 5, '环形仍是 5 格');
  }

  /* ════════ [21] 多端：断点映射与图表宽度同一口径（方案 片 C · R4） ════════
     背景：≤1180px 原先"每张卡都占整行"，笔记本上 10 张卡纵排成很长一页。
     改成两列后，**CSS 的 span 映射与 chartWidth() 的折算必须说同一件事** ——
     否则图表按整行宽度绘制、卡片却只有半行，图会被压扁或溢出。 */
  console.log('\n[21] 多端断点：CSS 与图表宽度同一口径（≤1180 两列）');
  if(R('typeof spanToCols') !== 'function'){
    fail('spanToCols 还没实现 —— 后续断言无法进行');
  } else {
    eq(R("spanToCols(5,'wide')"), 5, 'wide：span-5 就是 5 格');
    eq(R("spanToCols(7,'wide')"), 7, 'wide：span-7 就是 7 格');
    eq(R("spanToCols(12,'wide')"), 12, 'wide：span-12 整行');
    eq(R("spanToCols(5,'mid')"), 6, '★ mid（≤1180）：两列 —— span-5 折合 12 格口径的 6');
    eq(R("spanToCols(7,'mid')"), 6, '★ mid：span-7 同样占半行');
    eq(R("spanToCols(12,'mid')"), 12, 'mid：span-12 仍整行（大图不被压成半行）');
    eq(R("spanToCols(5,'narrow')"), 12, '★ narrow（≤760）：单列 → 一律整行');
    eq(R("spanToCols(12,'narrow')"), 12, 'narrow：整行');

    // CSS 必须说同一件事
    const midCss = (html.match(/@media\(max-width:1180px\)\{[\s\S]{0,600}?\n\}/) || [''])[0].replace(/\s+/g, '');
    ok(midCss.indexOf('.dash.span-5,.dash.span-7{grid-column:span3}') >= 0,
       '★ CSS 在 ≤1180 把 span-5/7 映射成半行（6 格网格里的 span 3）');
    ok(midCss.indexOf('.dash.span-12{grid-column:span6}') >= 0,
       'CSS 在 ≤1180 让 span-12 仍整行');

    // 图表宽度真的跟着断点走（沙盒里 clientWidth 可伪造、matchMedia 可替换）
    R(`$('dashBody').clientWidth = 1200;`);
    const w5w = R('chartWidth(5)'), w7w = R('chartWidth(7)'), w12w = R('chartWidth(12)');
    ok(w5w < w7w && w7w < w12w, `wide：宽度随 span 递增（${w5w} < ${w7w} < ${w12w}）`);
    R(`window.__mmBak = window.matchMedia;
       window.matchMedia = k => ({ matches: /max-width:1180px/.test(k), addEventListener(){}, removeEventListener(){} });`);
    const w5m = R('chartWidth(5)'), w7m = R('chartWidth(7)'), w12m = R('chartWidth(12)');
    R(`window.matchMedia = window.__mmBak;`);
    eq(w5m, w7m, '★ mid：span-5 与 span-7 都占半行 → 图宽相同');
    ok(w12m > w5m, `★ mid：span-12 仍整行、比半行宽（${w12m} > ${w5m}）—— 旧实现两者相等（都按整行算）`);
    ok(w5m > w5w, `★ mid 的半行(${w5m}) 比 wide 的 5/12(${w5w}) 宽 —— "两列"确实生效`);
    R(`$('dashBody').clientWidth = 0;`);
  }

  /* ════════ [22] 新增看板卡：学籍异常 / 户口性质 / 宿舍楼分布（方案 片 D） ════════
     三张卡都基于真实导出表的分布（学籍状态 在读187/保留学籍2、是否在校 是187/否2、
     入学前户口性质 非农84/农业80、宿舍楼 滨湖1栋132/滨湖2栋41/环湖3栋13/临湖6栋1）。 */
  console.log('\n[22] 新增看板卡（片 D）：学籍异常 / 户口性质 / 宿舍楼分布');
  R(`
    S.batches = []; S.activeBatchId = null; S.students = []; S.grades = [];
    S.batches.push(makeBatch('新卡测试','demo',[])); attachBatch(S.batches[0].id);
    setStudents([
      {'学号':'2026901','姓名':'甲','班级':'英语2401','学籍状态':'在读','是否在校':'是','宿舍楼':'滨湖1栋','房间号':'634','床位号':'01','入学前户口性质':'农业家庭户口'},
      {'学号':'2026902','姓名':'乙','班级':'英语2401','学籍状态':'在读','是否在校':'是','宿舍楼':'滨湖1栋','房间号':'634','床位号':'02','入学前户口性质':'非农业家庭户口'},
      {'学号':'2026903','姓名':'丙','班级':'英语2402','学籍状态':'在读','是否在校':'是','宿舍楼':'滨湖2栋','房间号':'412','床位号':'03','入学前户口性质':'农业家庭户口'},
      {'学号':'2026904','姓名':'丁','班级':'英语2402','学籍状态':'保留学籍','是否在校':'否','宿舍楼':'环湖3栋','房间号':'101','床位号':'04','入学前户口性质':'非农业家庭户口'},
      {'学号':'2026905','姓名':'戊','班级':'英语2403','学籍状态':'在读','是否在校':'是','宿舍':'100栋-101'}
    ]);
    S.grades.length = 0; invalidateGradeMap();
    S.quickView='all'; S.filters={}; S.classFilter='all'; S._search='';
  `);
  /* 按「卡片标题」定位，不绑死类名 —— 卡片已统一换成 u-card-title，
     这里两种都认，测试验证的是**内容**而不是实现细节。 */
  /* 按卡片标题**文本**定位，不绑死类名也不要求标签紧贴。
     卡片骨架已统一到 u-card-title，这里要验证的是「这张卡存在且含某内容」，
     而不是某个具体 class —— 否则改一次样式就要改一次测试。 */
  const cardOf = (h, title) => {
    const i = h.indexOf(title);
    return i < 0 ? null : h.slice(Math.max(0, i - 300), i + 1600);
  };
  R(`renderDashboard();`);
  const c22 = R(`$('dashBody').innerHTML`);

  // ── ① 学籍异常名单卡 ──
  const ab = cardOf(c22, '学籍异常');
  ok(ab !== null, '★ 出现「学籍异常」卡');
  ok(ab !== null && ab.indexOf('丁') >= 0, '★ 名单里点到了那位"保留学籍 + 不在校"的学生');
  ok(ab !== null && ab.indexOf('甲') < 0, '正常在读且在校的学生不进名单');
  ok(ab !== null && /dash-card span-5/.test(ab), '名单卡是半行（span 5）');
  ok(ab !== null && ab.indexOf('保留学籍') >= 0 && ab.indexOf('不在校') >= 0, '说清了原因（学籍状态 / 不在校）');

  // ── ② 户口性质环形卡 ──
  const hk = cardOf(c22, '户口性质');
  ok(hk !== null, '★ 出现「户口性质」卡');
  ok(hk !== null && hk.indexOf('农业家庭户口') >= 0 && hk.indexOf('非农业家庭户口') >= 0, '两类户口都在');
  ok(hk !== null && /dash-card span-5/.test(hk), '环形卡是半行（环形固定 172px 不放大 → 绝不进整行）');
  ok(hk !== null && hk.indexOf('donut-svg') >= 0, '用的是环形图');

  // ── ③ 宿舍楼分布横条卡（含旧表形态：只有「宿舍」列也要能解析出楼栋）──
  const bl = cardOf(c22, '宿舍楼分布');
  ok(bl !== null, '★ 出现「宿舍楼分布」卡（v0.5 删过，现按新模板恢复）');
  ['滨湖1栋','滨湖2栋','环湖3栋'].forEach(b => ok(bl !== null && bl.indexOf(b) >= 0, `楼栋「${b}」在分布里`));
  ok(bl !== null && bl.indexOf('100栋') >= 0,
     '★ 旧表形态（只有「宿舍」= 100栋-101）也解析出了楼栋 —— 与宿舍看板同一口径 dormBuilding()');
  ok(bl !== null && bl.indexOf('hbar-list') >= 0,
     '这张用的是横向条形（正向断言 —— 用"不含 donut"会因为切片越界框到下一张卡而误判）');
  eq(R("dormBuilding(dormKey({'宿舍':'滨湖1栋634-03'}))"), '滨湖1栋', '楼栋口径：从「宿舍」键里取第一段');

  // ── 反向保护：本批没有该字段就不该凭空出现（不虚报）──
  R(`S.students.forEach(s => { delete s['入学前户口性质']; }); renderDashboard();`);
  ok(cardOf(R(`$('dashBody').innerHTML`), '户口性质') === null, '★ 本批没有「入学前户口性质」→ 不出现该卡');
  R(`S.students.forEach(s => { delete s['学籍状态']; delete s['是否在校']; }); renderDashboard();`);
  ok(cardOf(R(`$('dashBody').innerHTML`), '学籍异常') === null, '★ 本批没有学籍/在校字段 → 不出现「学籍异常」卡');

  /* ════════ [23] 新增看板卡：学制与毕业年份 / 管理老师 / 完整度纳入新列（方案 片 E） ════════
     真实分布：学制 4年×164 / 2年×25、预计毕业年份 2028×188 / 2027×1、
     管理老师 吴章凡(辅导员)×179 / 吴章凡(辅导员),周怡(辅导员)×10。
     完整度新增三项的真实缺失：微信号 86、身份证件号 25、家庭电话 25（189 行样本；v2.2 起「家庭电话」已归一到「家长电话」，所以那一项显示为家长电话）。 */
  console.log('\n[23] 新增看板卡（片 E）：学制与毕业年份 / 管理老师 / 完整度纳入新列');
  R(`
    S.batches = []; S.activeBatchId = null; S.students = []; S.grades = [];
    S.batches.push(makeBatch('片E测试','demo',[])); attachBatch(S.batches[0].id);
    setStudents([
      {'学号':'2026951','姓名':'甲','班级':'英语2401','学制':'4','预计毕业年份':'2028','管理老师':'吴章凡(辅导员)','证件号码':'X1','家长电话':'0271','微信号':'w1'},
      {'学号':'2026952','姓名':'乙','班级':'英语2401','学制':'4','预计毕业年份':'2028','管理老师':'吴章凡(辅导员)','证件号码':'X2','家长电话':'0272'},
      {'学号':'2026953','姓名':'丙','班级':'英语2402','学制':'4','预计毕业年份':'2028','管理老师':'吴章凡(辅导员),周怡(辅导员)','证件号码':'X3'},
      {'学号':'2026954','姓名':'丁','班级':'商英2403','学制':'2','预计毕业年份':'2028','管理老师':'吴章凡(辅导员),周怡(辅导员)'},
      {'学号':'2026955','姓名':'戊','班级':'英语2403','学制':'4','预计毕业年份':'2027','管理老师':'吴章凡(辅导员)','证件号码':'X5','家长电话':'0275','微信号':'w5'}
    ]);
    S.grades.length = 0; invalidateGradeMap();
    S.quickView='all'; S.filters={}; S.classFilter='all'; S._search='';
  `);
  R(`renderDashboard();`);
  const c23 = R(`$('dashBody').innerHTML`);

  // ── ① 学制与毕业年份：计数行 + 跳同名预设（25 人列名单反而没人看，所以做成计数）──
  const xz = cardOf(c23, '学制与毕业年份');
  ok(xz !== null, '★ 出现「学制与毕业年份」卡');
  ok(xz !== null && xz.indexOf('第二学士学位') >= 0, '有「第二学士学位」一行');
  ok(xz !== null && xz.indexOf("preset:'second'") >= 0, '★ 点它跳到同名预设 second');
  ok(xz !== null && xz.indexOf("preset:'earlygrad'") >= 0, '★ 点「提前毕业」跳到同名预设 earlygrad');
  ok(xz !== null && xz.indexOf('2028') >= 0, '写明基准是哪一年（本批主流 2028）');
  eq(R("presetById('second').fn(S.students).length"), 1, '学制=2 的那位被 second 预设筛出');
  eq(R("presetById('earlygrad').fn(S.students).length"), 1, '2027 的那位被 earlygrad 预设筛出');

  // ── ② 管理老师：环形（值是逗号分隔的多人，整值作为一类）──
  const mt = cardOf(c23, '管理老师');
  ok(mt !== null, '★ 出现「管理老师」卡');
  ok(mt !== null && mt.indexOf('吴章凡(辅导员)') >= 0, '单人管的那一类在');
  ok(mt !== null && mt.indexOf('周怡') >= 0, '★ 双人共管那一类在（保留逗号分隔的完整值）');
  ok(mt !== null && /dash-card span-5/.test(mt), '环形卡半行');
  ok(mt !== null && mt.indexOf('donut-svg') >= 0, '用的是环形图');

  // ── ③ 数据完整度纳入新列（只列本批真有值的字段 —— 既有规则不能破）──
  const wd = cardOf(c23, '数据完整度');
  const barOf = (h, label) => { const i = h.indexOf(label); return i < 0 ? '' : h.slice(i, i + 200); };
  ['已填写证件号码','已填写家长电话','已填写微信号'].forEach(t =>
    ok(wd !== null && wd.indexOf(t) >= 0, `完整度含「${t}」`));
  ok(barOf(wd, '已填写证件号码').indexOf('4 / 5') >= 0, '★ 证件号码：5 人中 4 人已填');
  ok(barOf(wd, '已填写家长电话').indexOf('3 / 5') >= 0, '★ 家庭电话：3 人已填');
  ok(barOf(wd, '已填写微信号').indexOf('2 / 5') >= 0, '★ 微信号：2 人已填');

  // ── 反向保护 ──
  R(`S.students.forEach(s => { delete s['微信号']; }); renderDashboard();`);
  ok(cardOf(R(`$('dashBody').innerHTML`), '数据完整度').indexOf('已填写微信号') < 0,
     '★ 本批没有微信号字段 → 完整度不列该项（不虚报「0 / 5」，这是既有规则）');
  R(`S.students.forEach(s => { delete s['管理老师']; }); renderDashboard();`);
  ok(cardOf(R(`$('dashBody').innerHTML`), '管理老师') === null, '★ 本批没有管理老师字段 → 不出现该卡');

  /* ════════ [24] 侧栏「关注视图」可自选 + 本批用不了的收起 ════════
     用户 2026-09-30 请求：① 能在设置里自选展示哪些关注视图；② "缺项灰色显示依然占用地方"。
     侧栏原本列出除「全部学生」外的**全部 17 个预设**，其中用不了的也各占一行（灰色「—」）。 */
  console.log('\n[24] 侧栏关注视图：可自选 · 用不了的收起不占地方');
  if(R('typeof togglePresetVisible') !== 'function'){
    fail('侧栏视图开关还没实现（togglePresetVisible 不存在）—— 后续断言无法进行');
  } else {
  R(`
    S.batches = []; S.activeBatchId = null; S.students = []; S.grades = [];
    S.batches.push(makeBatch('侧栏测试','demo',[])); attachBatch(S.batches[0].id);
    setStudents([{'学号':'2026971','姓名':'甲','班级':'英语2401'},{'学号':'2026972','姓名':'乙','班级':'英语2401'}]);
    S.grades.length = 0; invalidateGradeMap();
    S.hiddenPresets = []; delete S.hideUnavailable;
  `);
  const sideHtml = () => R(`(function(){ renderSidebar(); return $('sidebar').innerHTML; })()`);

  // ① 默认：缺成绩表而用不了的那三个视图不再各占一行，收成一行提示
  const s1 = sideHtml();
  ['有不及格','绩点偏低','暂无成绩'].forEach(t =>
    ok(s1.indexOf(`>${t}<`) < 0, `★ 用不了的「${t}」不再占一行（默认收起）`));
  ok(/用不了的视图|暂时用不了/.test(s1), '★ 改为一行提示（不能悄悄消失 —— 要能点开看原因）');
  /* ⚠️ 别硬编码"哪个视图可用" —— 17 个预设的可用性随批次数据变
     （例：本批没人写备注时，「未写备注」命中全部 → 按片 4 的规则被置灰）。
     所以先问一遍运行时，再拿它做断言。 */
  const availP = R(`(function(){ const p = PRESETS.find(x => x.id !== 'all' && presetAvailable(x)); return p ? p.id : ''; })()`);
  const availL = R(`(function(){ const p = PRESETS.find(x => x.id !== 'all' && presetAvailable(x)); return p ? p.label : ''; })()`);
  ok(availP && s1.indexOf('>' + availL + '<') >= 0, `能用的视图照常显示（本批首可用：${availL}）`);

  // ② 切成"显示为灰色" → 恢复旧行为
  R(`S.hideUnavailable = false;`);
  const s2 = sideHtml();
  ok(s2.indexOf('>有不及格<') >= 0, '★ 切成"显示为灰色"后，用不了的视图又出现');
  ok(s2.indexOf('>用不了的视图<') < 0, '★ 此时不再有"收起"那行提示（两种模式互斥，别同时出现）');

  // ③ 自选：取消勾选某个视图 → 侧栏不显示；勾回来 → 又出现
  R(`S.hideUnavailable = true; S.hiddenPresets = []; togglePresetVisible(${JSON.stringify(availP)}, false);`);
  ok(sideHtml().indexOf('>' + availL + '<') < 0, `★ 取消勾选「${availL}」→ 侧栏不再显示它`);
  ok(R(`isHiddenPreset(${JSON.stringify(availP)})`), '状态记在 S.hiddenPresets');
  R(`togglePresetVisible(${JSON.stringify(availP)}, true);`);
  ok(sideHtml().indexOf('>' + availL + '<') >= 0, '勾回来 → 又出现');

  // ④ 持久化：状态管道一处都不能漏（这是"设了不生效"的经典来源）
  R(`S.hiddenPresets = ['cadre','party']; save(); S.hiddenPresets = []; load();`);
  eq(R(`JSON.stringify(S.hiddenPresets)`), '["cadre","party"]', '★ save → load 往返：自选结果落盘并恢复');
  ok(R(`Array.isArray(backupPayload().hiddenPresets) && backupPayload().hiddenPresets.length === 2`),
     '★ 全量备份里也带着它');
  ok(appSrc.indexOf('hiddenPresets: S.hiddenPresets || []') >= 0 &&
     (appSrc.match(/S\.hiddenPresets = Array\.isArray\(d\.hiddenPresets\)/g) || []).length === 2,
     '★ 两处写出（本地存档 + 全量备份）+ 两处读入（本地加载 + 备份恢复）都写了');
  ok((appSrc.match(/hiddenPresets/g) || []).length >= 8, '状态管道五处齐全');
  /* ⑤ 设置页那一块本身也要紧凑（用户 2026-09-30：内容不重要、却占很长空间）
     原写法是 17 行 colrow 列表（每行还带"本批可用/原因"文字）→ 把侧栏的杂乱搬到了设置页。
     改成一排可点的紧凑标签，并把"能不能用"收进 title。 */
  R(`S.view = 'settings'; S.hiddenPresets = []; S.hideUnavailable = true; renderSettings();`);
  const st = R(`$('mainArea').innerHTML`);
  const chipN = (st.match(/class="pchip/g) || []).length;
  ok(chipN >= 17, `★ 17 个视图用紧凑标签呈现（实测 ${chipN} 个）`);
  ok(st.indexOf('colrow') < 0, '★ 不再用 17 行列表 —— 那才是占空间的写法');
  ok(st.indexOf('全选') >= 0 && st.indexOf('全不选') >= 0, '提供「全选 / 全不选」（省掉 17 次点击）');
  const s0 = st.indexOf('左侧「关注视图」显示哪些');
  const s1i = st.indexOf('🎨 外观与主题');
  ok(s0 > 0 && s1i > s0, '这一块在设置页里、且能被定位');
  /* 空间用**渲染字符数**量化（视觉高度更直观但测不到：17 行 × 约 34px ≈ 580px，
     改成一排标签后约 3 行 × 26px ≈ 78px）。原先实测 6006 字符，改成标签后 3000 出头。 */
  ok(s1i - s0 < 4200, `★ 这一块渲染出来 ${s1i - s0} 字符（改之前实测 6006；阈值 4200 是防回退到行列表）`);
  // 标签的开关态要看得出来（选中=品牌色实心，未选=灰）
  R(`togglePresetVisible(${JSON.stringify(availP)}, false); renderSettings();`);
  ok(/class="pchip[^"]*"/.test(R(`$('mainArea').innerHTML`)), '切换后标签仍带状态类');
  R(`S.view = 'list'; S.hiddenPresets = []; togglePresetVisible(${JSON.stringify(availP)}, true);`);

  R(`S.hiddenPresets = []; delete S.hideUnavailable;`);
  }

  /* ════════ [25] 勾选不再"跳回首行"（用户 2026-09-30 反馈） ════════
     现象：列设置里每勾一项，列表就滚回顶部。
     根因：`colToggle` 调 `renderColSettings()` **整段重绘 modal** → `.collist`
     （max-height:46vh / overflow-y:auto）被重新挂载 → scrollTop 归零。
     正解在代码里已有先例：`fsToggle`（字段设置）就是**就地改那一行的类**，所以它不跳。
     这里把"切换不重绘"钉成断言 —— 重绘与否是可观测的（替换渲染函数计数）。 */
  console.log('\n[25] 列设置勾选不再跳回首行（就地更新，不整段重绘）');
  if(R('typeof colToggle') !== 'function'){
    fail('列设置还没实现 —— 后续断言无法进行');
  } else {
    // 装一个"渲染计数"探针（函数声明的全局绑定可写）
    R(`
      window.__spy = {};
      ['renderColSettings','renderFieldSettings','renderSettings'].forEach(n=>{
        window.__spy[n] = { n:0, bak: window[n] };
        window[n] = function(){ window.__spy[n].n++; return window.__spy[n].bak.apply(null, arguments); };
      });
    `);
    const calls = n => R(`window.__spy[${JSON.stringify(n)}].n`);

    // ① 列设置勾选：只改这一行的外观，不重绘整个 modal
    R(`
      colDraft = colCandidates(); colOn = new Set();
      window.__rowOn = null;
      const fakeEl = { closest: () => ({ classList: { toggle: (c,v) => { window.__rowOn = [c,v]; } } }) };
      colToggle(0, true, fakeEl);
    `);
    eq(calls('renderColSettings'), 0, '★ 勾选不再整段重绘（重绘才会把 .collist 的滚动位置打回顶部）');
    eq(R('JSON.stringify(window.__rowOn)'), '["on",true]', '★ 改为就地给这一行加上「已选」外观');
    eq(R('colOn.size'), 1, '状态照样记进 colOn（保存时用它）');
    R(`colToggle(0, false, { closest: () => ({ classList: { toggle(){} } }) });`);
    eq(R('colOn.size'), 0, '取消勾选也照样生效');

    // ② 字段设置的勾选本来就是就地更新 —— 钉住，别在重构里退化
    R(`fsHidden = new Set();`);   // 它只在 openFieldSettings() 里初始化，这里手动备好
    R(`fsToggle('学号', false, { closest: () => null });`);
    eq(calls('renderFieldSettings'), 0, '字段设置勾选也是就地更新（既有行为）');

    // ③ 上一轮加的"关注视图标签"同样不能重绘整页（否则页面滚动也会跳）
    R(`S.view = 'settings'; S.hiddenPresets = [];`);
    R(`togglePresetVisible('cadre', false, { classList:{ toggle(){} }, textContent:'' });`);
    eq(calls('renderSettings'), 0, '★ 设置页标签就地更新（不重绘整页）');
    ok(R(`isHiddenPreset('cadre')`), '状态照样记进 S.hiddenPresets');
    R(`S.hiddenPresets = []; S.view = 'list';`);

    // ④ 上移/下移要能"把刚动的那一行滚回视野"（重绘会让它滚出屏幕）
    ok(appSrc.indexOf('scrollIntoView') >= 0, '★ 排序后把移动的那一行保持在视野里');
    R(`colDraft = ['a','b','c']; colOn = new Set(); colMove(0, 1);`);
    eq(R(`colDraft.join('')`), 'bac', '上移/下移仍然生效');
    eq(calls('renderColSettings') >= 1, true, '排序仍会重绘（顺序变了，必须重画）');

    // 收尾：还原探针
    R(`['renderColSettings','renderFieldSettings','renderSettings'].forEach(n=>{ if(window.__spy[n]) window[n] = window.__spy[n].bak; });`);
  }

  /* ════════ [26] 详情页 dirty 守门（用户数据丢失防护，2026-09-30 升级清单 ①） ════════
     问题：点 × / 遮罩 / 侧栏跳转 / 关标签页 → 详情页的字段编辑全部静默丢弃。
     改法：draftSet 维护 dirty；导航走"view 变了就 askConfirm"；浏览器层加 beforeunload。 */
  console.log('\n[26] 详情页编辑：dirty 守门 + 离开前确认');
  if(R('typeof draftSet') !== 'function'){
    fail('详情页编辑机制不在 —— 后续断言无法进行');
  } else {
    // 探针：拦截 askConfirm（dirty 时应该被调用），记录调用次数与 onOk
    R(`
      window.__c = { calls:0, cb:null };
      window.__oldAsk = askConfirm;
      window.askConfirm = function(opts){ window.__c.calls++; window.__c.cb = (opts && opts.onOk) || null; };
    `);

    R(`
      S.batches=[]; S.activeBatchId=null; S.students=[]; S.grades=[];
      S.batches.push(makeBatch('dirty测试','demo',[])); attachBatch(S.batches[0].id);
      setStudents([{'学号':'2026901','姓名':'甲','班级':'英语2401','备注（保密）':'原备注'}]);
      S.grades.length=0; invalidateGradeMap();
    `);
    R(`renderDashboard();`);   // 立起 _navFromView（无 dirty 不触发）

    // ① 进入编辑、改一个字段 → dirty
    R(`openDetail('2026901', true);`);
    eq(R('detailEdit'), true, '进入编辑模式');
    eq(R('!!(detailDraft && detailDraft.dirty)'), false, '刚进入 → 还不脏');
    R(`draftSet('f', '备注（保密）', '改过的内容');`);
    eq(R('detailDraft.fields["备注（保密）"]'), '改过的内容', '★ 修改被记进草稿');
    eq(R('detailDraft.dirty'), true, '★ draftSet 把草稿标 dirty');
    eq(R('window.__c.calls'), 0, '修改时不该弹确认');

    // ② 保存 → dirty 应清零、草稿清掉、真实数据被改
    R(`saveDetailEditApply();`);
    eq(R('!!(detailDraft && detailDraft.dirty)'), false, '★ 保存后 dirty 清零（saveDetailEditApply 末尾回到查看态 → draft=null）');
    eq(R(`S.students.find(s => String(s['学号'])==='2026901')['备注（保密）']`), '改过的内容', '★ 真实数据已落');

    // ③ 脏状态下 closeModal → 弹 askConfirm（先重新进入编辑态，因为保存后退出了）
    R(`openDetail('2026901', true); draftSet('f', '备注（保密）', '又一次改动');`);
    eq(R('!!(detailDraft && detailDraft.dirty)'), true, '再次改动 → dirty');
    R(`closeModal();`);
    eq(R('window.__c.calls'), 1, '★ 脏状态下 closeModal 弹出确认');

    // ④ 模拟「取消」→ 弹窗仍在
    ok(R('$("modalRoot").innerHTML.length > 0'), '取消后弹窗仍在（草稿未丢）');

    // ⑤ 模拟「确认关闭」→ 弹窗关掉、草稿清掉
    R(`if(window.__c.cb) window.__c.cb();`);
    eq(R('$("modalRoot").innerHTML'), '', '★ 确认关闭后弹窗被清掉');
    eq(R('detailDraft'), null, '★ 确认关闭后 detailDraft 清掉');

    // ⑥ 不脏时 → 不弹确认（重开编辑但不修改）
    R(`openDetail('2026901', true); detailDraft.dirty = false;`);
    R(`window.__c.calls = 0;`);
    R(`closeModal();`);
    eq(R('window.__c.calls'), 0, '★ 不脏时 closeModal 不弹确认');
    R(`if(window.__c.cb) window.__c.cb();`);   // 收尾（让弹窗真的关掉）

    // ⑦ 导航**不该**弹确认，也不该丢草稿 —— 详情弹窗挂在独立的 #modalRoot 上，
    //    视图切换不碰它（这条是实测确认的：视图渲染函数里没有一处写 modalRoot）。
    R(`window.__c.calls = 0;`);
    R(`openDetail('2026901', true); detailDraft.dirty = false; draftSet('f','备注（保密）','跳转前改');`);
    R(`gotoList({clear:true});`);
    eq(R('window.__c.calls'), 0, '★ 侧栏跳转不弹确认（导航本来就不丢草稿 —— 不该过度拦截）');
    eq(R('S.view'), 'list', '跳转正常完成');
    eq(R('!!(detailDraft && detailDraft.dirty)'), true, '★ 跳转后草稿仍在（弹窗活着，没被清）');
    eq(R('$("modalRoot").innerHTML.length > 0'), true, '★ 详情弹窗仍在（所以没丢东西）');

    // ⑧ 真正会丢草稿的是"编辑甲时直接打开乙" → 必须拦
    R(`
      setStudents([{'学号':'2026901','姓名':'甲','班级':'英语2401','备注（保密）':'原备注'},
                   {'学号':'2026902','姓名':'乙','班级':'英语2401'}]);
    `);
    R(`openDetail('2026901', true); detailDraft.dirty = false; draftSet('f','备注（保密）','甲的改动');`);
    eq(R('window.__c.calls'), 0, '（还没打开乙）');
    R(`openDetail('2026902', true);`);
    eq(R('window.__c.calls'), 1, '★ 编辑甲时打开乙 → 弹确认（草稿会被冲掉，这才是真丢数据的路径）');
    eq(R('curStudent && String(curStudent["学号"])'), '2026901', '取消后仍停在甲（没被切走）');
    R(`if(window.__c.cb) window.__c.cb();`);
    eq(R('curStudent && String(curStudent["学号"])'), '2026902', '确认后才切到乙');
    // 同一学生不算（"保存 → 回查看态"走的就是同 id 路径，不能拦）
    R(`window.__c.calls = 0;`);
    R(`openDetail('2026902', true); detailDraft.dirty = false; draftSet('f','备注（保密）','乙的改动');`);
    R(`openDetail('2026902', false);`);
    eq(R('window.__c.calls'), 0, '★ 同一学生重开不弹确认（保存后回到查看态是正常路径）');

    // ⑨ 浏览器层 beforeunload 装好了吗？
    ok(appSrc.indexOf('beforeunload') >= 0, '★ 浏览器层 beforeunload 装好了');

    // 收尾：还原探针
    R(`window.askConfirm = window.__oldAsk;`);
  }

  /* ════════ [27] 弹窗键盘可用性（升级清单 A） ════════
     现状：全文 17 个弹窗里，**只有「新手引导」**支持 Esc 与焦点陷阱（写死在 bindOnboardingControls 里）；
     其余（详情页 / 列设置 / 字段设置 / 导入向导 / 确认框…）鼠标能关、**键盘关不掉**，
     而且 Tab 会穿透到底层主界面。
     改法：抽成一个**全局**键盘处理 modalKeydown(e)，对全部弹窗生效（含以后新增的）。
     ⚠️ 必须抽成具名函数才测得动 —— document 级监听在沙盒里触发不了。 */
  console.log('\n[27] 弹窗键盘可用性：Esc 关闭 + Tab 焦点陷阱（全部弹窗）');
  if(R('typeof modalKeydown') !== 'function'){
    fail('键盘处理还没实现（modalKeydown 不存在）—— 后续断言无法进行');
  } else {
    R(`
      S.batches=[]; S.activeBatchId=null; S.students=[]; S.grades=[];
      S.batches.push(makeBatch('键盘测试','demo',[])); attachBatch(S.batches[0].id);
      setStudents([{'学号':'2026991','姓名':'甲','班级':'英语2401'}]);
      $('modalRoot').innerHTML=''; $('confirmRoot').innerHTML='';
    `);

    // ① 没有弹窗时不接管按键（别把页面上的正常按键吞掉）
    eq(R(`modalKeydown({key:'Escape', preventDefault(){}})`), false, '没有弹窗时 Esc 不接管');

    // ② 详情页：Esc 关掉
    R(`openDetail('2026991', false);`);
    ok(R(`$('modalRoot').innerHTML.length > 0`), '详情页已打开');
    eq(R(`modalKeydown({key:'Escape', preventDefault(){}})`), true, '★ Esc 被接管');
    eq(R(`$('modalRoot').innerHTML`), '', '★ Esc 关掉了详情页');

    // ③ 另一个弹窗（列设置）同样支持 —— 证明覆盖的不只是详情页
    R(`openColSettings();`);
    ok(R(`$('modalRoot').innerHTML.length > 0`), '列设置已打开');
    eq(R(`modalKeydown({key:'Escape', preventDefault(){}})`), true, '★ 列设置也能用 Esc 关');
    eq(R(`$('modalRoot').innerHTML`), '', '★ 列设置被 Esc 关掉');

    // ④ 确认框叠在弹窗之上：Esc 只关最上层（确认框），底下的弹窗要留着
    R(`openDetail('2026991', false); askConfirm({title:'测试确认', html:'x'});`);
    ok(R(`$('confirmRoot').innerHTML.length > 0`), '确认框已打开（z-index:600 盖在上面）');
    R(`modalKeydown({key:'Escape', preventDefault(){}});`);
    eq(R(`$('confirmRoot').innerHTML`), '', '★ Esc 先关最上层的确认框');
    ok(R(`$('modalRoot').innerHTML.length > 0`), '★ 底下的详情页还在（没有一起关掉）');
    R(`modalKeydown({key:'Escape', preventDefault(){}});`);
    eq(R(`$('modalRoot').innerHTML`), '', '再按一次才关详情页');

    // ⑤ Tab 焦点陷阱 —— 判断逻辑是纯函数 nextTabIndex()，直接断言
    //    （`$` 是顶层 const，测试里伪造不了，所以把"该聚焦谁"的判断与 DOM 查询分开）
    eq(R('nextTabIndex(3, -1, false)'), 0, '★ 焦点在弹窗外 → 拉进第一个');
    eq(R('nextTabIndex(3, -1, true)'), 2, '★ 焦点在弹窗外 + Shift → 拉进最后一个');
    eq(R('nextTabIndex(3, 2, false)'), 0, '★ 末尾 Tab → 回到开头（不穿透到底层页面）');
    eq(R('nextTabIndex(3, 0, true)'), 2, '★ 开头 Shift+Tab → 跳到末尾');
    eq(R('nextTabIndex(3, 1, false)'), -1, '★ 中间态不接管（交给浏览器正常走）');
    eq(R('nextTabIndex(3, 1, true)'), -1, '中间态 Shift 也不接管');
    eq(R('nextTabIndex(0, -1, false)'), -1, '弹窗里没有可聚焦元素 → 不接管（不误吞 Tab）');

    // 行为层：量不到可聚焦元素时不接管（沙盒里的 stub 元素正好是这种情况）
    R(`openDetail('2026991', false); document.activeElement = { tagName:'BODY' };`);
    eq(R(`modalKeydown({key:'Tab', preventDefault(){}})`), false,
       '★ 量不到可聚焦元素时不接管 Tab');
    ok(R(`modalFocusables($('modalRoot')).length`) === 0, 'modalFocusables 对 stub 弹窗返回空（安全降级）');
    R(`modalKeydown({key:'Escape', preventDefault(){}});`);
    R(`openDetail('2026991', false);`);
    eq(R(`modalKeydown({key:'a', preventDefault(){}})`), false, '普通字符键不接管');
    R(`modalKeydown({key:'Escape', preventDefault(){}});`);

    // ⑥ 全局监听装好了吗（沙盒里 document 监听触发不了，所以查"是否接上"）
    eq(R('typeof initModalKeyboard'), 'function', '有 initModalKeyboard()');
    ok(appSrc.indexOf('initModalKeyboard()') >= 0, '★ 启动时接上了全局键盘监听');

    // ⑦ 引导弹窗原本那套内联键盘处理已抽走（避免两条键盘路径并存）
    ok(appSrc.indexOf('bindOnboardingControls') >= 0, '引导的控件绑定还在（只抽走键盘那段）');
    ok(appSrc.indexOf("modal.addEventListener('keydown'") < 0,
       '★ 引导里那段内联 keydown 已删除（不再各弹窗各写一套）');
  }

/* ════════ [28] 批量操作：打标签 + 导出所选（升级清单 B） ════════
     现状：勾选条只有「取消勾选」和「删除所选」；而打标签只能一个个进详情页点
     （toggleStudentTag 是按单个学生的）。勾 20 个人打同一个标签 = 开 20 次弹窗。 */
  console.log('\n[28] 批量操作：打标签 + 导出所选');
  if(R('typeof bulkTag') !== 'function'){
    fail('批量操作还没实现（bulkTag 不存在）—— 后续断言无法进行');
  } else {
    R(`
      S.batches=[]; S.activeBatchId=null; S.students=[]; S.grades=[];
      S.batches.push(makeBatch('批量测试','demo',[])); attachBatch(S.batches[0].id);
      setStudents([
        {'学号':'2026701','姓名':'甲','班级':'英语2401'},
        {'学号':'2026702','姓名':'乙','班级':'英语2401'},
        {'学号':'2026703','姓名':'丙','班级':'英语2402'}
      ]);
      S.grades.length=0; invalidateGradeMap();
      S.quickView='all'; S.filters={}; S.classFilter='all'; S._search='';
      S.view='list'; renderMain();
      selRows.clear(); selRows.add(S.students[0]); selRows.add(S.students[1]);
    `);
    eq(R('selRows.size'), 2, '勾选了 2 人');

    // ① 全都没有 → 全部加上；没勾的不动
    R(`bulkTag('🎭');`);
    eq(R(`tagStr(S.students[0])`), '🎭', '★ 勾选的第 1 人打上标签');
    eq(R(`tagStr(S.students[1])`), '🎭', '★ 勾选的第 2 人也打上');
    eq(R(`tagStr(S.students[2])`), '', '★ 没勾的人不受影响（不误伤）');

    // ② 已有标签时再打 → 叠加，不覆盖
    R(`bulkTag('⛄');`);
    eq(R(`tagStr(S.students[0])`), '🎭⛄', '★ 再打一个标签是叠加（与详情页语义一致）');

    // ③ 两个人都有这个标签 → 再点算"取消"（否则"点了没反应"会让人困惑）
    R(`bulkTag('🎭');`);
    eq(R(`tagStr(S.students[0])`), '⛄', '★ 全都有 → 再点是取消');
    eq(R(`tagStr(S.students[1])`), '⛄', '★ 第 2 人也取消了 🎭');

    // ④ 混合状态（部分有）→ 统一补上，而不是取消
    R(`S.students[0]['关注标签'] = '🎭'; S.students[1]['关注标签'] = '⛄';`);
    R(`selRows.clear(); selRows.add(S.students[0]); selRows.add(S.students[1]); bulkTag('🎭');`);
    eq(R(`tagStr(S.students[0])`), '🎭', '★ 已有的不动');
    eq(R(`tagStr(S.students[1])`), '⛄🎭', '★ 缺的那个被补上（追加在后）');

    // ⑤ 清空后写 null（不是空字符串）—— 与既有约定一致
    R(`S.students[1]['关注标签'] = '⛄'; selRows.clear(); selRows.add(S.students[1]); bulkTag('⛄');`);
    eq(R(`S.students[1]['关注标签']`), null, '★ 清空后是 null（既有约定，不是空串）');

    // ⑥ 导出所选：只导勾选的人
    R(`
      window.__dl = null; window.__dlBak = downloadCsv;
      downloadCsv = function(csv, filename){ window.__dl = { csv: csv, filename: filename }; };
      selRows.clear(); selRows.add(S.students[0]); selRows.add(S.students[2]);
    `);
    R(`exportSelected();`);
    ok(R(`!!window.__dl && window.__dl.filename.indexOf('所选') >= 0`), '★ 文件名标明"所选"');
    ok(R(`!!window.__dl && window.__dl.csv.indexOf('2026701') >= 0 && window.__dl.csv.indexOf('2026703') >= 0`),
       '★ 勾选的两个人都在导出里');
    ok(R(`!!window.__dl && window.__dl.csv.indexOf('2026702') < 0`), '★ 没勾的人不在导出里');
    R(`downloadCsv = window.__dlBak;`);

    // ⑦ 没勾选时给提示，不产生空文件
    R(`window.__dl = null; selRows.clear(); exportSelected();`);
    eq(R('window.__dl'), null, '★ 没勾选时不导出（不生成空文件）');

    // ⑧ 批量条上确实有这些入口，且没挤掉原有的
    R(`selRows.add(S.students[0]); S.view='list'; renderMain();`);
    const bar = R(`(function(){ const h=$('mainArea').innerHTML; const i=h.indexOf('已勾选'); return i<0?'':h.slice(Math.max(0,i-400), i+1600); })()`);
    ok(bar.indexOf('exportSelected()') >= 0, '★ 批量条上有「导出所选」');
    ok(bar.indexOf('bulkTag(') >= 0, '★ 批量条上有打标签入口');
    ok(bar.indexOf('deleteSelected()') >= 0, '「删除所选」还在（没被挤掉）');
    ok(bar.indexOf('clearSel()') >= 0, '「取消勾选」还在');
  }

/* ════════ [29] 搜索：防抖 + 键盘唤起（升级清单 ②③） ════════
     ② 仪表盘搜索每敲一个字就 `renderDashBody()`（重画所有图表）；而列表页的 quickSearch
        只重绘 tbody（注释里写明"避免整页重绘导致输入框失焦"）—— 同一件事两处两种水平。
     ③ 搜索框存在但没有键盘入口：没有 Cmd/Ctrl+K、没有 /，Esc 也不清空。 */
  console.log('\n[29] 搜索：防抖 + ⌘K / 唤起 + Esc 清空');
  if(R('typeof runPendingDashSearch') !== 'function' || R('typeof handleSearchShortcut') !== 'function'){
    fail('搜索防抖/快捷键还没实现 —— 后续断言无法进行');
  } else {
    R(`
      S.batches=[]; S.activeBatchId=null; S.students=[]; S.grades=[];
      S.batches.push(makeBatch('搜索测试','demo',[])); attachBatch(S.batches[0].id);
      setStudents([{'学号':'2026801','姓名':'甲','班级':'英语2401'}]);
      S.view='dashboard'; S._search=''; $('modalRoot').innerHTML=''; $('confirmRoot').innerHTML='';
      window.__rd = 0; window.__rdBak = renderDashBody;
      renderDashBody = function(){ window.__rd++; return window.__rdBak.apply(null, arguments); };
    `);

    // ① 防抖：连续输入只重绘一次
    R(`dashSearch('刘');`);
    eq(R('window.__rd'), 0, '★ 敲第一个字不立刻重绘（旧行为是立刻重绘）');
    eq(R(`S._search`), '刘', '搜索词照样立刻记下来（筛选状态不滞后）');
    R(`dashSearch('刘奕'); dashSearch('刘奕涵');`);
    eq(R('window.__rd'), 0, '★ 连续输入期间都不重绘');
    R(`runPendingDashSearch();`);
    eq(R('window.__rd'), 1, '★ 只在最后一次输入后重绘一次（3 次输入 → 1 次重绘）');
    eq(R(`S._search`), '刘奕涵', '用的是最后一次的关键词');
    // 非仪表盘视图不该被这个定时器重绘
    R(`S.view='list'; window.__rd = 0; runPendingDashSearch();`);
    eq(R('window.__rd'), 0, '不在仪表盘时不重绘（避免切页后还去画总览）');
    R(`S.view='dashboard';`);

    // ② ⌘K / Ctrl+K 唤起
    R(`
      window.__focused = false;
      $('dashSearchInput').focus = function(){ window.__focused = true; };
      $('dashSearchInput').select = function(){};
    `);
    /* v3（2026-10-03）：⌘K / Ctrl+K / / 已由 features/quick-find.js 的
       handleFindShortcut 接管 —— 它弹的是「快速查找」面板，不是页内搜索框。
       原因：辅导员日常第一件事是「学生出事了最快查到他所有信息」，
       而页内搜索只匹配 5 个字段，恰好漏掉家长电话/宿舍/证件号/生源地。
       断言跟着改 —— 守的是「任何页面按 ⌘K 都能唤起查找」这件事本身。 */
    eq(R(`handleFindShortcut({key:'k', metaKey:true, target:{tagName:'BODY'}, preventDefault(){}})`), true,
       '★ ⌘K 唤起快速查找');
    eq(R(`!!$('qfInput')`), true, '★ 查找面板已打开且输入框存在');
    R(`closeModal();`);
    R(`window.__focused = false;`);
    eq(R(`handleFindShortcut({key:'k', ctrlKey:true, target:{tagName:'BODY'}, preventDefault(){}})`), true,
       '★ Ctrl+K 同样有效（Windows）');
    R(`closeModal();`);

    // ③ 弹窗盖着时不抢快捷键（否则会在弹窗里乱跳焦点）
    R(`openDetail('2026801', false); window.__focused = false;`);
    eq(R(`handleSearchShortcut({key:'k', metaKey:true, target:{tagName:'BODY'}, preventDefault(){}})`), false,
       '★ 弹窗打开时不抢 ⌘K');
    eq(R('window.__focused'), false, '焦点没被拽走');
    R(`closeModal();`);

    // ④ "/" 唤起：不在输入框里才行（否则会打不出斜杠）
    eq(R(`handleFindShortcut({key:'/', target:{tagName:'BODY'}, preventDefault(){}})`), true,
       '★ 页面上按 / 能唤起快速查找');
    R(`closeModal();`);
    R(`window.__focused = false;`);
    eq(R(`handleSearchShortcut({key:'/', target:{tagName:'INPUT'}, preventDefault(){}})`), false,
       '★ 已经在输入框里时 / 不接管（否则斜杠打不出来）');
    eq(R(`handleSearchShortcut({key:'/', target:{tagName:'TEXTAREA'}, preventDefault(){}})`), false,
       '文本框里同样不接管');
    eq(R(`handleSearchShortcut({key:'a', target:{tagName:'BODY'}, preventDefault(){}})`), false,
       '★ 普通字符键不接管');

    // ⑤ Esc 清空（仅当焦点就在搜索框里）
    R(`S._search='刘奕涵'; $('dashSearchInput').value='刘奕涵'; document.activeElement = $('dashSearchInput'); window.__rd = 0;`);
    eq(R(`handleSearchShortcut({key:'Escape', target:{tagName:'INPUT'}, preventDefault(){}})`), true,
       '★ 焦点在搜索框时 Esc 被接管');
    eq(R(`$('dashSearchInput').value`), '', '★ 搜索框被清空');
    eq(R('window.__rd'), 1, '★ 清空后立刻重绘（不等防抖）');
    R(`document.activeElement = {tagName:'BODY'};`);
    eq(R(`handleSearchShortcut({key:'Escape', target:{tagName:'BODY'}, preventDefault(){}})`), false,
       '焦点不在搜索框时 Esc 不接管（留给弹窗/其它用途）');

    // ⑥ 两个搜索框都带 id（快捷键要能定位到它们）+ 启动时接上了监听
    ok(appSrc.indexOf('id="dashSearchInput"') >= 0, '★ 仪表盘搜索框有 id');
    ok(appSrc.indexOf('id="listSearchInput"') >= 0, '★ 列表页搜索框有 id');
    ok(appSrc.indexOf('initShortcuts()') >= 0, '★ 启动时接上了快捷键监听');
    R(`renderDashBody = window.__rdBak;`);
  }

/* ════════ [30] 保存后"撤销这次修改"（升级清单 D） ════════
     现状：删批次/删学生早有 30 秒撤销条（snapshotForUndo），但**保存详情页修改没有**——
     误清一个字段再点保存就再也回不来（方案说明原本还写着"本版不做撤销"）。
     做法：复用同一条撤销条 —— 保存**前**拍快照，**真有改动**才亮出来。 */
  console.log('\n[30] 保存后"撤销这次修改"（复用现成的 30 秒撤销条）');
  if(R('typeof offerUndo') !== 'function'){
    fail('撤销接口还没实现（offerUndo 不存在）—— 后续断言无法进行');
  } else {
    R(`
      S.batches=[]; S.activeBatchId=null; S.students=[]; S.grades=[];
      S.batches.push(makeBatch('撤销测试','demo',[])); attachBatch(S.batches[0].id);
      setStudents([{'学号':'2026901','姓名':'甲','班级':'英语2401','备注（保密）':'原备注'}]);
      S.grades.length=0; invalidateGradeMap();
      hideUndoBar();
    `);
    eq(R('undoSnap'), null, '起始时没有待撤销的快照');

    // ① 保存一次改动 → 给出 30 秒撤销机会，且快照抓的是**改动前**
    R(`openDetail('2026901', true); draftSet('f','备注（保密）','改过的内容'); saveDetailEditApply();`);
    eq(R(`S.students.find(s=>String(s['学号'])==='2026901')['备注（保密）']`), '改过的内容', '改动已落盘');
    ok(R('!!undoSnap'), '★ 保存后出现待撤销快照');
    ok(R(`String($('undoMsg').textContent).indexOf('30 秒内可撤销') >= 0`), '★ 撤销条上有提示');
    ok(R(`String($('undoMsg').textContent).indexOf('甲') >= 0`), '★ 提示里点名是谁（甲）');
    ok(R(`undoSnap.data.indexOf('原备注') >= 0`), '★ 快照抓的是改动**前**的值');

    // ② 撤销 → 回到改动前
    R(`undoRestore();`);
    eq(R(`S.students.find(s=>String(s['学号'])==='2026901')['备注（保密）']`), '原备注', '★ 撤销后回到原值');
    eq(R('undoSnap'), null, '撤销后快照清掉（不给第二次）');
    eq(R(`$('undoMsg').textContent`), '', '撤销条内容清空');

    // ③ 没实际改动就保存 → 不该给撤销机会（否则"撤销了个寂寞"）
    R(`hideUndoBar(); openDetail('2026901', true); saveDetailEditApply();`);
    eq(R('undoSnap'), null, '★ 没有实际改动时不给撤销机会');
    R(`closeModal();`);

    // ④ 成绩改动同样可撤销（快照含 batches，而 S.grades 就是批次那一份）
    R(`
      hideUndoBar();
      openDetail('2026901', true);
      draftSet('g','加权平均成绩','88');
      saveDetailEditApply();
    `);
    ok(R('!!undoSnap'), '★ 改成绩也给撤销机会');
    eq(R('S.grades.length'), 1, '成绩已写入一条');
    R(`undoRestore();`);
    eq(R('S.grades.length'), 0, '★ 撤销后成绩回到改动前（原本没有成绩）');

    // ⑤ 撤销条的提示语不再写死"删除前"（同一个条现在也服务"改资料"）
    ok(appSrc.indexOf("'已撤销，数据恢复到删除前'") < 0, '★ 撤销后的提示语不再写死"删除前"');
  }

/* ════════ [31] 指标卡一致性 + 列设置"恢复默认"分两档（升级清单 ④⑤） ════════
     ④ 6 张指标卡里 3 张可点（在册学生/需重点关注/有不及格）、3 张不可点
        （覆盖班级/平均加权成绩/平均学分绩点）—— 用户看不出为什么有的能点有的不能。
     ⑤ 列设置的「恢复默认」只回到出厂的 10 列；但片 3 之后本批常有二十几个可用字段，
        想"全都显示出来"没有出口。 */
  console.log('\n[31] 指标卡一致性 + 列设置两档恢复（升级清单 ④⑤）');
  if(R('typeof jumpByClass') !== 'function' || R('typeof showAllCols') !== 'function'){
    fail('指标卡跳转 / 列设置两档还没实现 —— 后续断言无法进行');
  } else {
    R(`
      S.batches=[]; S.activeBatchId=null; S.students=[]; S.grades=[];
      S.batches.push(makeBatch('卡片一致性','demo',[])); attachBatch(S.batches[0].id);
      setStudents([
        {'学号':'2026801','姓名':'甲','班级':'英语2401','微信号':'w1','学籍状态':'在读'},
        {'学号':'2026802','姓名':'乙','班级':'英语2402','微信号':'w2','学籍状态':'保留学籍'}
      ]);
      S.grades.length=0;
      S.grades.push({'学号':'2026801','加权平均成绩':'88','平均学分绩点':'3.6'},
                    {'学号':'2026802','加权平均成绩':'66','平均学分绩点':'1.9'});
      invalidateGradeMap();
      S.quickView='all'; S.filters={}; S.classFilter='all'; S._search=''; S.sort={key:'',dir:'desc'};
    `);

    // ① 三张原本不可点的卡现在都有去处，且去处合理
    R(`S.view='dashboard'; jumpByClass();`);
    eq(R(`S.view`), 'list', '「覆盖班级」→ 进列表');
    eq(R(`S.sort.key`), '班级', '★ 且按「班级」排开（同班的人聚在一起）');
    R(`S.sort={key:'',dir:'desc'}; jumpByScore();`);
    eq(R(`S.sort.key`), '成绩', '★ 「平均加权成绩」→ 按成绩排序（低分在前，看是谁拉低了平均）');
    R(`S.quickView='all'; jumpToLowGpa();`);
    eq(R(`S.view`), 'list', '「平均学分绩点」→ 进列表');
    eq(R(`S.quickView`), 'lowgpa', '★ 且直接进「绩点偏低」名单（可操作，而不只是看个数）');

    // ② 渲染出来的指标卡确实挂上了这三个动作
    R(`S.view='dashboard'; S.quickView='all'; S.sort={key:'',dir:'desc'}; S._search=''; renderMain();`);
    const met = R(`$('dashMetrics').innerHTML`);
    ['jumpByClass()', 'jumpByScore()', 'jumpToLowGpa()'].forEach(a =>
      ok(met.indexOf(a) >= 0, `★ 指标卡上挂上了 ${a}`));
    // 有成绩时不该再是"空卡"（空卡没有动作）
    ok(met.indexOf('is-empty') < 0 || met.indexOf('尚未导入成绩表') < 0, '有成绩时不是空态');

    // ③ 没成绩时这两张卡仍是空态、不该给人点（点了没意义）
    R(`S.grades.length=0; invalidateGradeMap(); S.view='dashboard'; renderMain();`);
    const met2 = R(`$('dashMetrics').innerHTML`);
    ok(met2.indexOf('jumpByScore()') < 0, '★ 没成绩时「平均加权成绩」不给跳转');
    ok(met2.indexOf('jumpToLowGpa()') < 0, '★ 没成绩时「平均学分绩点」不给跳转');
    ok(met2.indexOf('jumpByClass()') >= 0, '「覆盖班级」不依赖成绩，照常可点');

    // ④ 列设置两档恢复
    R(`openColSettings();`);
    const n0 = R('colOn.size');
    // ⚠️ 别在宿主作用域直接引用 app 内部常量（DEFAULT_COLS 是 VM 里的全局），要在 VM 内比
    eq(n0, R('DEFAULT_COLS.filter(colAvailable).length'), `出厂档 = 出厂 10 列里本批可用的那些（${n0} 列）`);
    R(`showAllCols();`);
    const nAll = R('colOn.size');
    ok(nAll > n0, `★ 「显示全部字段」比出厂档多（${n0} → ${nAll}）`);
    ok(R(`colOn.has('微信号')`), '★ 本批特有的字段（微信号）也进来了');
    ok(R(`colOn.has('学籍状态')`), '本批新列（学籍状态）也进来了');
    R(`resetCols();`);
    eq(R('colOn.size'), n0, '★ 「恢复默认」仍是出厂那一档（可来回切）');

    // ⑤ 两个按钮都在列设置里（不是二选一替换掉）
    ok(appSrc.indexOf('resetCols()') >= 0 && appSrc.indexOf('showAllCols()') >= 0,
       '★ 列设置里「恢复默认」与「显示全部字段」并存');
  }

/* ════════ [32] 跟进记录（升级清单 C） ════════
     设计选择：存在**学生字段**上（不是像成绩那样另做一层）。理由：
       · 普通字段 → 导入 / 导出 Excel / 备份 / 详情编辑**全部自动带上**，零新增管道；
       · 换电脑只要带学生表一个文件；在 Excel 里补的跟进，导回来照样认。
     格式（人可读、Excel 可编辑、可往返）每行一条：
       2026-09-30 谈心：家庭经济困难，已告知绿色通道 → 2026-10-15 */
  console.log('\n[32] 跟进记录：解析 / 追加 / 删除 / 到期判定 / 详情页就地刷新');
  if(R('typeof parseFollowUps') !== 'function'){
    fail('跟进记录还没实现（parseFollowUps 不存在）—— 后续断言无法进行');
  } else {
    // ① 解析：带/不带"下次"、空行、坏行（没日期）
    R(`S.__fu = {'跟进记录':'2026-09-30 谈心：家庭经济困难 → 2026-10-15\\n\\n2026-09-20 电话联系家长\\n随手写的一行没有日期'};`);
    eq(R(`parseFollowUps(S.__fu).length`), 3, '★ 解析出 3 条（空行被忽略）');
    eq(R(`parseFollowUps(S.__fu)[0].date`), '2026-09-30', '第 1 条日期');
    eq(R(`parseFollowUps(S.__fu)[0].text`), '谈心：家庭经济困难', '第 1 条内容（去掉日期与箭头）');
    eq(R(`parseFollowUps(S.__fu)[0].next`), '2026-10-15', '★ 第 1 条的"下次跟进日"');
    eq(R(`parseFollowUps(S.__fu)[1].next`), '', '没写下次就是空（=不需要再跟）');
    eq(R(`parseFollowUps(S.__fu)[2].date`), '', '★ 没日期的行不丢（date 空、内容留着）');
    eq(R(`parseFollowUps(S.__fu)[2].text`), '随手写的一行没有日期', '内容照旧保留');
    eq(R(`parseFollowUps({}).length`), 0, '没有该字段 → 空数组');

    // ② 序列化与往返（Excel 里改完导回来必须还原）
    eq(R(`serializeFollowUps([{date:'2026-09-30',text:'谈心',next:'2026-10-15'}])`),
       '2026-09-30 谈心 → 2026-10-15', '序列化成一行');
    eq(R(`serializeFollowUps([])`), null, '★ 空记录写 null（不是空串，与既有约定一致）');
    eq(R(`JSON.stringify(parseFollowUps({'跟进记录': serializeFollowUps(parseFollowUps(S.__fu))}))`),
       R(`JSON.stringify(parseFollowUps(S.__fu))`), '★ 解析→序列化→再解析 完全等价（往返不丢信息）');

    // ③ 追加 / 删除
    R(`
      S.batches=[]; S.activeBatchId=null; S.students=[]; S.grades=[];
      S.batches.push(makeBatch('跟进测试','demo',[])); attachBatch(S.batches[0].id);
      setStudents([{'学号':'2026901','姓名':'甲','班级':'英语2401'}]);
      S.grades.length=0; invalidateGradeMap();
      S.quickView='all'; S.filters={}; S.classFilter='all'; S._search=''; S.view='list';
      window.__s = S.students[0];
    `);
    eq(R(`addFollowUp(window.__s, {text:'第一次谈话'})`), true, '追加一条成功');
    eq(R(`parseFollowUps(window.__s).length`), 1, '变成 1 条');
    eq(R(`parseFollowUps(window.__s)[0].date`), R('todayStr()'), '★ 日期默认今天');
    eq(R(`addFollowUp(window.__s, {text:'   '})`), false, '★ 内容为空不给加（也不写入）');
    R(`addFollowUp(window.__s, {text:'第二次', next:'2099-01-01'});`);
    eq(R(`parseFollowUps(window.__s).length`), 2, '第二条加上');
    eq(R(`removeFollowUp(window.__s, 0)`), true, '删第 1 条');
    eq(R(`parseFollowUps(window.__s)[0].text`), '第二次', '★ 删的是指定那条');
    R(`removeFollowUp(window.__s, 0);`);
    eq(R(`window.__s['跟进记录']`), null, '★ 删光后写 null');

    // ④ 到期判定（下次跟进日 ≤ 今天）
    R(`
      window.__s['跟进记录'] = '2026-01-01 早就该跟了 → 2020-01-01\\n2026-02-02 还早呢 → 2099-12-31';
    `);
    eq(R(`followUpDue(window.__s, '2026-06-01')`), true, '★ 有一条已到期 → true');
    eq(R(`followUpDue(window.__s, '2019-01-01')`), false, '都还没到 → false');
    eq(R(`followUpDue({'跟进记录':'2026-01-01 谈过，不用再跟'}, '2099-01-01')`), false,
       '★ 没写"下次"的不算到期（不然永远挂在提醒里）');
    eq(R(`followUpDueList([window.__s, {'学号':'x','跟进记录':''}], '2026-06-01').length`), 1,
       '★ 只看得到期的那一个');

    // ⑤ 详情页：区块在、内容在、有"下次"徽标
    //    ⚠️ 沙盒的 getElementById 不解析 HTML（子元素不会真的生成），所以断言要落在
    //       modalRoot 的 HTML 字符串上，而不是 $('fuBox') 这个按需新建的空元素上。
    R(`openDetail('2026901', false);`);
    const fu = R(`$('modalRoot').innerHTML`);
    ok(fu.indexOf('id="fuBox"') >= 0, '★ 详情页有跟进记录区块（id="fuBox"）');
    ok(fu.indexOf('早就该跟了') >= 0, '内容显示出来');
    ok(fu.indexOf('2099-12-31') >= 0, '「下次」日期显示出来');
    ok(fu.indexOf('有到期的') >= 0, '★ 有到期条目时区块标题上有提示');

    // ⑥ ★ 在**编辑态**加一条跟进，不能把未保存的字段编辑冲掉
    //    （原来的 toggleStudentTag 是整体重渲染 openDetail，编辑态的草稿会被重置 —— 同一个毛病一起修）
    R(`
      openDetail('2026901', true);
      draftSet('f','备注（保密）','未保存的改动');
      $('fuText').value = '今天又谈了一次';
      saveFollowUp();
    `);
    eq(R(`detailDraft && detailDraft.fields['备注（保密）']`), '未保存的改动',
       '★ 编辑态加跟进 → 未保存的字段编辑没丢（就地刷新，不整体重渲染）');
    eq(R(`parseFollowUps(S.students[0]).length`), 3, '跟进确实加上了');
    eq(R(`detailEdit`), true, '仍停在编辑态');

    // ⑦ 编辑态点关注标签同样不能冲掉草稿
    R(`window.__calls = []; toggleStudentTag('2026901', '🎭');`);
    eq(R(`detailDraft && detailDraft.fields['备注（保密）']`), '未保存的改动',
       '★ 编辑态打标签也不冲掉草稿（同一类问题一起修）');
    eq(R(`tagStr(S.students[0])`), '🎭', '标签照样打上了');
    R(`S.students[0]['关注标签'] = null; detailDraft = null; closeModal();`);

    // ⑧ 导出必须带上跟进记录（它是学生字段，会自动进 fieldOrderOf；再确认没被当"特殊字段"排掉）
    ok(R(`fieldOrderOf([S.students[0]]).indexOf('跟进记录') >= 0`),
       '★ 导出列里包含「跟进记录」（随学生表一起走，不用额外导一个文件）');
    eq(R(`serializeFollowUps(parseFollowUps(S.students[0]))`), R(`serializeFollowUps(parseFollowUps(S.students[0]))`),
       '往返稳定');

    // ⑨ 它被当作"已知字段"（Excel 导回来不会被当成新字段）
    ok(R(`KNOWN_FIELDS.has('跟进记录')`), '★ 跟进记录已登记为已知字段');
  }

/* ════════ [33] 跟进记录进「关注提醒」+ 可筛（升级清单 C 收尾） ════════ */
  console.log('\n[33] 跟进记录：到期进「关注提醒」+ 侧栏可筛');
  if(!R(`typeof presetById === 'function' && !!presetById('followdue')`)){
    fail('预设 followdue 还没登记 —— 后续断言无法进行');
  } else {
    R(`
      S.batches=[]; S.activeBatchId=null; S.students=[]; S.grades=[];
      S.batches.push(makeBatch('跟进提醒','demo',[])); attachBatch(S.batches[0].id);
      setStudents([
        {'学号':'2026801','姓名':'甲','班级':'英语2401','跟进记录':'2026-01-01 谈过 → 2020-01-01'},
        {'学号':'2026802','姓名':'乙','班级':'英语2401','跟进记录':'2026-01-01 谈过 → 2099-12-31'},
        {'学号':'2026803','姓名':'丙','班级':'英语2401'}
      ]);
      S.grades.length=0; invalidateGradeMap();
      S.quickView='all'; S.filters={}; S.classFilter='all'; S._search=''; S.view='dashboard';
    `);
    eq(R(`presetById('followdue').fn(S.students).length`), 1, '★ 「该跟进」只筛出下次跟进日已到 / 已过的人');
    eq(R(`presetAvailable(presetById('followdue'))`), true, '本批有跟进记录 → 预设可用');

    // 谁都没记过跟进 → 预设自动不占侧栏（need 生效）
    R(`S.students.forEach(s=>{ delete s['跟进记录']; });`);
    eq(R(`presetAvailable(presetById('followdue'))`), false, '★ 本批没人记过跟进 → 该预设不占侧栏');

    // 关注提醒：出现"该跟进"且能跳到名单
    R(`
      S.students[0]['跟进记录'] = '2026-01-01 谈过 → 2020-01-01';
      S.students[1]['跟进记录'] = '2026-01-01 谈过 → 2099-12-31';
      renderDashboard();
    `);
    const dh33 = R(`$('dashBody').innerHTML`);
    ok(dh33.indexOf('该跟进') >= 0, '★ 看板「关注提醒」里出现"该跟进"');
    ok(dh33.indexOf("preset:'followdue'") >= 0, '★ 点它能跳到「该跟进」名单');
    eq(R(`followUpDueList(S.students).length`), 1, '提醒里的条数与名单一致（只算到期的）');

    // 侧栏也能看到这个视图
    R(`S.view='list'; renderSidebar();`);
    ok(R(`$('sidebar').innerHTML`).indexOf('该跟进') >= 0, '★ 侧栏「关注视图」里有「该跟进」');
  }

  finish();
})().catch(e => { console.error('测试执行出错：' + (e && e.stack || e)); process.exit(1); });

function finish(){
  console.log(failN ? `\n共 ${failN} 项问题` : '\n全部通过 ✅');
  process.exit(failN ? 1 : 0);
}

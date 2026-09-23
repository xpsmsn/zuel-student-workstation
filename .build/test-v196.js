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

  finish();
})().catch(e => { console.error('测试执行出错：' + (e && e.stack || e)); process.exit(1); });

function finish(){
  console.log(failN ? `\n共 ${failN} 项问题` : '\n全部通过 ✅');
  process.exit(failN ? 1 : 0);
}

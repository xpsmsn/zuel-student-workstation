/* v1.9.2 导入增强回归测试
   用法: node .build/test-import.js 中南大学生工作台.html

   覆盖的四件事（对应辅导员提的 1 / 2 / 5）：
     [1] 表头不在第 1 行的表（「入党积极分子名册」真实结构：前 3 行是标题带/盖章/填报日期）
         能被正确解析 —— 老代码写死 arr[0] 当表头，这类表全部错位，辅导员看到的是「导入 0 人」
     [2] 名册导入 → 政治面貌自动同步为「入党积极分子」，且不降级已是党员/发展对象的人
     [3] 班委的同义词（班干部 / 班级委员 / 班级职务 / 职务 / 担任职务）都归一到「班委」
     [4] 老样式的表（表头就在第 1 行）行为完全不变，不会因为新逻辑被改坏
     [7] 铁律①②③ 在「新增/合并」与「新建批次」两条路径下结果一致
         （v2.1.x：这两条路径原先各写一份「按列合并」，已漂移 —— 本节的验收条件）

   桩设计沿用 test-library.js：DOM 元素按 id 缓存，localStorage 用 Map 顶替。 */
const fs = require('fs'), vm = require('vm');
const html = fs.readFileSync(process.argv[2] || '中南大学生工作台.html', 'utf8');

let failN = 0;
const fail = m => { console.error('  ✗ ' + m); failN++; };
const pass = m => console.log('  ✓ ' + m);
const eq = (got, want, label) =>
  got === want ? pass(`${label} = ${JSON.stringify(got)}`) : fail(`${label} = ${JSON.stringify(got)}，应为 ${JSON.stringify(want)}`);

/* ── 沙盒骨架（同 test-library.js，保持两套测试行为一致） ── */
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
  const timers = [];
  const sandbox = {
    console, setTimeout, clearTimeout,
    setInterval:(fn, ms)=>{ timers.push({ fn, ms }); return timers.length; },
    clearInterval(){},
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
    __timers: timers,
    __store: store
  };
  sandbox.window = sandbox;
  return { sandbox, store, opened };
}

const blocks = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
const appSrc = blocks.filter(s=>s.includes('function doImport')).sort((a,b)=>b.length-a.length)[0];
if(!appSrc){ console.error('找不到应用脚本块'); process.exit(1); }

const hooked = appSrc
  .replace('function askConfirm(opts){',
    'function askConfirm(opts){ __setConfirmCb(opts.onOk||null); if(window.__lastAsk) window.__lastAsk(opts);');

const { sandbox, store } = fresh();
vm.createContext(sandbox);
try{
  vm.runInContext(hooked, sandbox, { filename:'app.js' });
  pass('应用脚本编译通过');
}catch(e){ fail('应用脚本编译失败：' + e.message); process.exit(1); }

const R = k => vm.runInContext(k, sandbox);

/* ── 夹具：照抄真实文件《20260706附件6 入党积极分子名册》的结构 ──
   第 1 行「附件6：」/ 第 2 行标题 / 第 3 行盖章+填报日期 / 第 4 行才是真表头 /
   第 5 行是「培养联系人 1 | 2」子表头 / 第 6 行起是数据。
   日期列确认在 Excel 里是 yyyy/m/d 格式（已核对原文件 number_format），所以这里直接写日期串。 */
const ROSTER_HEADER = ['序号','所在党支部','姓名','学号/\n职工号','性别','民族','籍贯','出生日期',
  '递交入党申请书时间','团组织推优时间','确定为入党积极分子时间','培养联系人',null,'已取得学历',
  '学生类别/人员类别','年级','学制','担任职务','党支部书记姓名','二级党委备案情况'];

/* 拿真实底库前 5 人的学号/姓名来造名册，这样"二次导入"才能真的匹配上 */
R(`if(!S.batches.length){ S.batches.push(makeBatch('测试批次','demo',SEED_DATA.map(d=>({...d})))); attachBatch(S.batches[0].id); }`);
const seeds = R(`SEED_DATA.slice(0,5).map(s=>({id:String(s['学号']), name:s['姓名']}))`);
R(`setStudents(SEED_DATA.map(d=>({...d})));`);

const rosterArr = [
  ['附件6：'],
  ['中南财经政法大学                  党委入党积极分子名册\n（截止时间：2026年6月30日）'],
  ['二级党委（盖章）：', null,null,null,null,null,null,null,null,null,null,null,null,null,null,'填报日期：',null,'     年     月    日'],
  ROSTER_HEADER,
  [null,null,null,null,null,null,null,null,null,null,null,'1','2'],      // 子表头行（不是人）
  ...seeds.map((s,i)=>[
    i+1, '外国语学院本科生第一党支部', s.name, s.id, '女', '汉族', '福建武平',
    '2025/1/5', '2025/10/9', '2026/1/8', '2026/1/13', '李怡奕', '李涛',
    '高中', '大学本科生', '2025级', 4, i===2 ? '组织委员' : '无', '李涛', '同意'
  ]),
  // 一行真正的"烂行"：有姓名没学号 —— 必须被点名报出来，且行号是 Excel 真实行号
  [999, '外国语学院本科生第一党支部', '缺学号的同学', null, '男', '汉族', '湖北武汉',
   '2025/1/5', '2025/10/9', '2026/1/8', '2026/1/13', '李怡奕', '李涛',
   '高中', '大学本科生', '2025级', 4, '无', '李涛', '同意']
];
/* 预期 Excel 行号：#1~#4 前四行，表头 = 第 4 行，子表头 = 第 5 行，数据从第 6 行起，
   5 条正常数据 → 第 6~10 行，最后那行烂行 → 第 11 行。 */

/* 用应用自己的三个函数走一遍「解析一张表」的全过程（与 handleFile 完全同路），
   这样测的就是真代码，而不是测试里另写一套。 */
function parseSheet(arr, fileName){
  const hIdx = R(`locateHeaderRow(${JSON.stringify(arr)})`);
  const hdr = (arr[hIdx] || []).map(h => h == null ? '' : String(h));
  R(`(function(){
    const arr = ${JSON.stringify(arr)};
    const hdr = ${JSON.stringify(hdr)};
    const p = buildRawRows(arr, ${hIdx}, hdr);
    buildImportState(hdr, p.rows, ${JSON.stringify(fileName)}, ${hIdx}, p.rowNos);
  })()`);
  return hIdx;
}

console.log('\n[1] 表头不在第 1 行：名册能被正确定位与解析');
const hIdx = parseSheet(rosterArr, '20260706附件6 入党积极分子名册.xls');
eq(hIdx, 3, 'locateHeaderRow 找到的表头下标');
eq(R('importState.kind'), 'roster', '识别为「入党积极分子名册」(kind)');
eq(R(`importState.cols.indexOf('学号') >= 0`), true, '「学号/职工号」已归一为「学号」主键');
eq(R(`importState.cols.indexOf('姓名') >= 0`), true, '姓名列已识别');
eq(R('importState.rows.length'), 6, '有效数据行数（5 条正常 + 1 条烂行；子表头行被剔掉）');
eq(R(`importState.rows.every(r=>r['学号']===undefined || String(r['学号']).length>0)`), true, '没有整行空学号的噪声行');

console.log('\n[2] Excel 行号：报错要指向原表的真实行');
eq(R('excelRowNo(5)'), 11, '第 6 条数据（烂行）对应的 Excel 行号');
eq(R('excelRowNo(0)'), 6, '第 1 条数据对应的 Excel 行号');

console.log('\n[3] 名册导入 → 政治面貌自动同步，且不降级');
/* 把第 4 个人预设成「中共预备党员」，验证闸门①不降级 */
const guard = seeds[3];
R(`S.students.find(s=>String(s['学号'])==='${guard.id}')['政治面貌'] = '中共预备党员';`);
const beforeN = R('S.students.length');
R(`importState.mode = 'append'; doImport();`);
const res = R('importState.result');
eq(R('S.students.length'), beforeN, '没有新增学生（全部按学号匹配上了）');
eq(res.rosterSynced, 4, '同步为「入党积极分子」的人数');
eq(res.rosterKept, 1, '因已是党员/预备党员而保住的 人数');
eq(res.skipped, 1, '异常行（学号为空）行数');
eq(JSON.stringify(res.badRows), JSON.stringify([11]), '异常行的 Excel 行号');
for(let i = 0; i < 5; i++){
  const s = seeds[i];
  const pol = R(`(S.students.find(x=>String(x['学号'])==='${s.id}')||{})['政治面貌']`);
  if(i === 3) eq(pol, '中共预备党员', `${s.name} 的党员身份未被降级`);
  else eq(pol, '入党积极分子', `${s.name} 的政治面貌已同步`);
}
eq(R(`(S.students.find(x=>String(x['学号'])==='${seeds[0].id}')||{})['所在党支部']`),
   '外国语学院本科生第一党支部', '名册的党支部信息写入学生档案');
eq(R(`(S.students.find(x=>String(x['学号'])==='${seeds[0].id}')||{})['确定为入党积极分子时间']`),
   '2026/1/13', '确定为积极分子的时间写入学生档案');

console.log('\n[4] 政治面貌下拉已含「入党积极分子」「发展对象」');
const presets = R(`JSON.stringify(SELECT_PRESETS['政治面貌'])`);
if(presets.includes('入党积极分子')) pass('选项含「入党积极分子」'); else fail('选项缺「入党积极分子」：' + presets);
if(presets.includes('发展对象')) pass('选项含「发展对象」'); else fail('选项缺「发展对象」');
eq(R(`isSelectField('政治面貌')`), true, '政治面貌仍走下拉选择');

console.log('\n[5] 班委同义词归一');
[['班干部','班委'], ['班级委员','班委'], ['班级职务','班委'], ['职务','班委'], ['担任职务','班委'], ['班委','班委']]
  .forEach(([raw, want])=>{
    const got = R(`normalizeKey(${JSON.stringify(raw)})`);
    got === want ? pass(`「${raw}」→「${want}」`) : fail(`「${raw}」→「${got}」，应为「${want}」`);
  });
/* 端到端：一张只写「班干部」的表，导入后应落进「班委」列，并能被「班委成员」视图筛出来 */
parseSheet([['学号','姓名','班干部'], [seeds[0].id, seeds[0].name, '班长']], '班干部表.xlsx');
eq(R(`importState.cols.indexOf('班委') >= 0`), true, '「班干部」列归一为「班委」');
eq(R('importState.kind'), 'student', '普通学生表不会被误判为名册');
R(`importState.mode='append'; doImport();`);
eq(R(`(S.students.find(x=>String(x['学号'])==='${seeds[0].id}')||{})['班委']`), '班长', '班干部值落进班委列');
eq(R(`S.students.filter(s=>s['班委']).length > 0`), true, '「班委成员」视图有数据可筛');

console.log('\n[6] 老样式的表（表头第 1 行）行为不变');
const legacy = [['学号','姓名','政治面貌','备注（保密）'], [seeds[1].id, seeds[1].name, '共青团员', '这是辅导员备注']];
const lIdx = parseSheet(legacy, '老表.xlsx');
eq(lIdx, 0, '表头就在第 1 行 → 仍取第 1 行');
eq(R('importState.kind'), 'student', '老表不会被误判为名册');
eq(R('excelRowNo(0)'), 2, '老表行号仍从第 2 行起');
R(`S.students.find(x=>String(x['学号'])==='${seeds[1].id}')['备注（保密）'] = '原来的备注';`);
R(`importState.mode='append'; doImport();`);
eq(R(`(S.students.find(x=>String(x['学号'])==='${seeds[1].id}')||{})['备注（保密）']`),
   '原来的备注', '铁律①：备注仍不被覆盖');

const ok = (cond, label) => cond ? pass(label) : fail(label);

console.log('\n[7] 铁律①②③：「新增/合并」与「新建批次」必须给出同一套结果');
/* 背景：doImport 的 new 分支与 doImportMerge 原先各写一份「按列合并」，而且**已经漂移**
   （new 那份少了铁律③）。这一节用**同一张表**走两条路径，逐条断言三条铁律 ——
   它同时是「把合并逻辑收到一处」这个重构的验收条件。
   注意接缝：两条路径都从 doImport() 进（不直调内部函数），避免把测试绑死在实现上。 */
const IRON_ID = String(seeds[2].id);
sandbox.__ironRows = [
  { '学号':IRON_ID, '姓名':'甲', '民族':'汉族', '班委':'班长',   '备注（保密）':'CSV 第一行备注' },
  { '学号':IRON_ID, '姓名':'乙', '民族':'',     '班委':'副班长', '备注（保密）':'CSV 第二行备注' }
];
const ironResult = {};
['append', 'new'].forEach(mode=>{
  R(`
    S.batches = []; S.activeBatchId = null; S.students = [];
    S.batches.push(makeBatch('铁律测试','demo',[
      {'学号':'${IRON_ID}','姓名':'原始','备注（保密）':'辅导员原备注','民族':'汉族','班委':'班长'}
    ]));
    attachBatch(S.batches[0].id);
    importState = { step:2, fileName:'铁律表.xlsx', header:[], emptyCols:[],
      cols:['学号','姓名','民族'], rows: window.__ironRows,
      mode:'${mode}', headerIdx:0, rowNos:null, kind:'student', skipCols:new Set() };
    doImport();
  `);
  ironResult[mode] = R(`(function(){
    const s = S.students.find(x=>String(x['学号'])==='${IRON_ID}') || {};
    return { remark:s['备注（保密）'], nation:s['民族'], committe:s['班委'], n:S.students.length };
  })()`);
});

/* ── 与路径无关的三条不变量：第二行独有的值，一个都不许进来 ── */
[['append','新增/合并'], ['new','新建批次']].forEach(([mode, tag])=>{
  const r = ironResult[mode] || {};
  ok(r.remark !== 'CSV 第二行备注', `[${tag}] 铁律①：备注不被后一行覆盖`);
  ok(r.nation === '汉族',            `[${tag}] 铁律②：空值不覆盖（民族仍为「汉族」）`);
  ok(r.committe !== '副班长',         `[${tag}] 铁律③：不在本次列清单里的列不动（班委没被改成副班长）`);
});
/* ── 逐路径的具体期望 ── */
eq(ironResult.append && ironResult.append.remark, '辅导员原备注', '[新增/合并] 备注恒为辅导员原有的那条');
eq(ironResult.new && ironResult.new.remark, 'CSV 第一行备注',   '[新建批次] 备注取本表首次出现的值');
eq(ironResult.append && ironResult.append.n, 1, '[新增/合并] 同一学号只留一条记录');
eq(ironResult.new && ironResult.new.n, 1,       '[新建批次] CSV 内部同学号合并为一条记录');

/* ── 静态断言：铁律①②③ 的合并循环只允许存在一份实现 ──
   重构前它是两份，注释「铁律①：备注永不覆盖」在 :8078 与 :8206 各写一次，
   其中一份少了铁律③ —— 那正是本次修掉的漂移。这条断言防的是它再被复制回来。 */
eq((appSrc.match(/function mergeRowInto/g) || []).length, 1, '★ mergeRowInto 只有一个定义');
eq((appSrc.match(/铁律①：备注永不覆盖/g) || []).length, 1, '★ 铁律①的合并循环全仓库只写一处（防再复制）');
ok(appSrc.indexOf('mergeRowInto(recMap.get(id)') >= 0, 'doImport 的 CSV 内合并走 mergeRowInto');
ok(appSrc.indexOf('mergeRowInto(old, r, cols)') >= 0, 'doImportMerge 的合并走 mergeRowInto');

console.log('\n[8] 空值哨兵：看着有值、其实是占位符（真实数据实证）');
/* 学工系统导出的真实模板（189 行）里，住宿地址出现过 "-"（2 行，走读/不住校）。
   若把它当真值：宿舍看板会出现一个叫「-」的房间，查寝打分表也会带上它。 */
if(R('typeof sentinelToEmpty') !== 'function'){
  fail('sentinelToEmpty 还没实现 —— 后续哨兵断言无法进行');
} else {
  const sent = v => R(`JSON.stringify(sentinelToEmpty(${JSON.stringify(v)}))`);
  [['-', 'null'], ['—', 'null'], ['--', 'null'], ['/', 'null'], ['无', 'null'],
   ['暂无', 'null'], ['N/A', 'null'], ['', 'null']].forEach(([v, w]) =>
    eq(sent(v), w, `哨兵 ${JSON.stringify(v)} → 空`));
  // ── 反向保护：这些看着"像空"其实是有效取值，绝不能被清掉 ──
  [['否', '"否"'], ['0', '"0"'], ['A-1', '"A-1"'], ['-3', '"-3"'], ['滨湖1栋634-03', '"滨湖1栋634-03"']]
    .forEach(([v, w]) => eq(sent(v), w, `★ 合法值不被误清：${JSON.stringify(v)}`));
  eq(sent(null), 'null', 'null 仍是 null');

  /* 走真实路径：一张住宿地址写 "-" 的表 → 归一后「宿舍」必须是空 → 落库后也得是空 */
  parseSheet([['学号', '姓名', '住宿地址'], ['2026999', '走读生', '-']], '走读表.xlsx');
  eq(R(`importState.rows[0]['宿舍'] === undefined || importState.rows[0]['宿舍'] === null`), true,
     '★ 归一后「宿舍」为空（不再是 "-"，否则宿舍看板会多出一个叫「-」的房间）');
  R(`importState.mode='new'; doImport();`);
  eq(R(`(S.students.find(x=>String(x['学号'])==='2026999')||{})['宿舍'] == null`), true,
     '★ 落库后仍是空');

  ok(appSrc.indexOf('EMPTY_SENTINEL_WORDS') >= 0 && appSrc.indexOf('EMPTY_SENTINEL_SYMBOLS') >= 0,
     '哨兵词表/符号表是具名常量（.build/read-xlsx.py 会读它们做一致性核对）');
}

console.log('\n[9] 多工作表：多于一张有数据的表时，让用户选');
/* 真实文件实证：主表 189 行，第二张 Sheet1 是 90 行班委名册（俄语专业）。
   程序原先硬取 `wb.SheetNames[0]`：第二张静默丢掉；更危险的是——若某次导出的数据在第二张表，
   程序会**静默读到空表**。现在多于一张「有数据」的表时先让用户选；只有一张时行为与以前一致。 */
if(R('typeof sheetChoices') !== 'function'){
  fail('多表选表还没实现（sheetChoices 不存在）—— 后续断言无法进行');
} else {
  /* 内置的 SheetJS 在**独立的 script 块**里（与应用块分开）——沙盒只加载了应用块，
     所以这里要单独加载一次，才能在测试里用 XLSX.utils 现造 workbook。
     （test-v196 §[11] 加载「内置表单模板」数据块时是同一手法。） */
  if(R('typeof XLSX') === 'undefined'){
    const xlsxSrc = blocks.filter(x => x.includes('sheet_to_json') && !x.includes('function doImport'))
                          .sort((a, b) => b.length - a.length)[0];
    if(!xlsxSrc) fail('找不到内联的 SheetJS 块');
    else {
      vm.runInContext(xlsxSrc, sandbox, { filename:'xlsx.js' });
      pass('内联 SheetJS 块已载入沙盒（多表测试要用它现造 workbook）');
    }
  }
  // 在沙盒里现造 workbook（用原型内联的同一份 SheetJS），不依赖真文件
  const mkBook = sheets => R(`(function(){
    const wb = XLSX.utils.book_new();
${sheets.map(([n, aoa]) => `    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(${JSON.stringify(aoa)}), ${JSON.stringify(n)});`).join('\n')}
    window.__wb = wb; return true;
  })()`);

  // ── 只有一张有数据的表：不该弹选择（旧行为不变）──
  mkBook([['主表', [['学号', '姓名'], ['2026001', '甲'], ['2026002', '乙']]]]);
  eq(R('sheetsNeedingPick(window.__wb).length'), 1, '单表 → 候选只有 1 张（不会弹选择）');
  eq(R('defaultSheetName(sheetChoices(window.__wb))'), '主表', '单表 → 默认就是它');

  // ── 两张都有数据：候选 2 张，概览要准 ──
  mkBook([
    ['主表', [['学号', '姓名', '班级'], ['2026001', '甲', '英语2401'], ['2026002', '乙', '英语2402']]],
    ['班委名册', [['姓名', '专业', '职务'], ['丙', '俄语', '班长'], ['丁', '俄语', '团支书'], ['戊', '俄语', '学委']]]
  ]);
  eq(R('sheetsNeedingPick(window.__wb).length'), 2, '两张都有数据 → 候选 2 张（会弹选择）');
  const ch = R('sheetChoices(window.__wb)');
  eq(ch[0].name, '主表', '第 1 张的名字');
  eq(ch[0].rows, 2, '第 1 张的数据行数（扣掉表头）');
  eq(ch[0].header.join('/'), '学号/姓名/班级', '第 1 张的表头预览');
  eq(ch[1].name, '班委名册', '第 2 张的名字');
  eq(ch[1].rows, 3, '第 2 张的数据行数');
  eq(ch[1].header.join('/'), '姓名/专业/职务', '第 2 张的表头预览');
  eq(R('defaultSheetName(sheetChoices(window.__wb))'), '主表', '默认选第一张有数据的');

  // ── 第一张是空表、第二张才有数据：不该硬取空的，且候选只有 1 张 ──
  mkBook([
    ['封面', [['学籍信息导出'], [null], [null]]],
    ['数据', [['学号', '姓名'], ['2026001', '甲'], ['2026002', '乙']]]
  ]);
  eq(R('sheetsNeedingPick(window.__wb).length'), 1, '空封面 + 一张数据表 → 候选 1 张（封面不算）');
  eq(R('defaultSheetName(sheetChoices(window.__wb))'), '数据', '★ 不会硬取那张空封面');

  // ── 用户选了第二张：importState 必须来自第二张（这就是"让我选"的意义）──
  R(`
    S.batches = []; S.activeBatchId = null; S.students = [];
    S.batches.push(makeBatch('选表测试','demo',[])); attachBatch(S.batches[0].id);
  `);
  R(`window.__ok = useSheet(window.__wb, '数据', '选表.xlsx');`);
  eq(R('window.__ok'), true, 'useSheet 读第二张成功');
  eq(R('importState.cols.join("/")'), '学号/姓名', '★ importState 用的是**第二张**的列');
  eq(R('importState.rows.length'), 2, '★ importState 用的是第二张的行数');
  R(`importState.mode='new'; doImport();`);
  eq(R('S.students.length'), 2, '★ 落库的也是第二张那 2 个人（不是空封面的 0 人）');

  /* ── 第一行是空的表（真实文件里第二张就是这样）：预览退到第一行有内容的行，
        且**没有表头就不该扣掉一行**（否则 90 行的名册会报成 89 行）。
        注意：这条放最后 —— 它会替换 window.__wb，别影响上面的断言。 ── */
  mkBook([['名册', [[null, null, null], ['丙', '俄语', '班长'], ['丁', '俄语', '团支书']]]]);
  const ch2 = R('sheetChoices(window.__wb)');
  eq(ch2[0].header.join('/'), '丙/俄语/班长', '★ 表头行没有列名时，预览退到第一行有内容的行（否则用户认不出这是哪张表）');
  eq(ch2[0].rows, 2, '★ 没认出表头就不扣那一行（这张表 2 行都是有内容的）');
  eq(ch2[0].hasData, true, '该表算"有数据"（候选会带上它，用户能选）');

  // ── 静态断言：两个入口都走同一套函数，别再造第二份 ──
  ok((appSrc.match(/sheetsNeedingPick\s*\(/g) || []).length >= 3,
     '★ sheetsNeedingPick：1 定义 + 至少 2 处入口调用（学生导入 / 成绩导入）');
  eq((appSrc.match(/function useSheet\s*\(/g) || []).length, 1, '★ useSheet 只有一个定义');
  ok(appSrc.indexOf('m.step===0') >= 0 && appSrc.indexOf('chooseSheet(') >= 0,
     '选择工作表那一步的界面已接上（step 0 + chooseSheet）');
}

console.log('\n[10] 同义列互补：家庭电话→家长电话 · 床位号→床位');
/* 用户口径（2026-09-30 拍板）：家庭电话其实就是家长电话，只是不同来源的表写法不同；
   **某一列为空时要用另一列补上** —— 这正是归一四原则的第 3 条「同行多别名优先取非空」。
   床位号同理（主要决定宿舍看板里的床位位次）。
   所以这一节不只测"改了个名"，而是测**互补**：三种组合（只有A / 只有B / 都有）都要对。 */
eq(R(`normalizeKey('家庭电话')`), '家长电话', '家庭电话 → 归一到「家长电话」');
eq(R(`normalizeKey('床位号')`), '床位', '床位号 → 归一到「床位」');
eq(R(`normalizeKey('家长电话')`), '家长电话', '原有叫法不受影响');
eq(R(`normalizeKey('床位')`), '床位', '原有叫法不受影响');

R(`
  S.batches = []; S.activeBatchId = null; S.students = []; S.grades = [];
  S.batches.push(makeBatch('别名互补','demo',[])); attachBatch(S.batches[0].id);
  setStudents([{'学号':'2026801','姓名':'甲'},{'学号':'2026802','姓名':'乙'},{'学号':'2026803','姓名':'丙'}]);
`);
parseSheet([
  ['学号','姓名','家长电话','家庭电话','床位','床位号'],
  ['2026801','甲', null,      '0271-111', null,  '01'],
  ['2026802','乙', '138-222', null,       '02床', null],
  ['2026803','丙', '139-333', '0273-333', '03床', '04']
], '两列并存.xlsx');
R(`importState.mode='append'; doImport();`);
const val = (id, k) => R(`(function(){
  const s = S.students.find(x => String(x['学号']) === ${JSON.stringify(id)});
  return s ? String(s[${JSON.stringify(k)}] == null ? '' : s[${JSON.stringify(k)}]) : 'NO-STUDENT';
})()`);
eq(val('2026801', '家长电话'), '0271-111', '★ 家长电话为空 → 用家庭电话补上（互补，不是丢弃）');
eq(val('2026802', '家长电话'), '138-222', '★ 家庭电话为空 → 用家长电话');
eq(val('2026803', '家长电话'), '139-333', '两列都有 → 取靠前的列（原则 3）');
eq(val('2026801', '家庭电话'), '', '★ 合并成一个内部字段，不会同时留两个键');
eq(val('2026801', '床位'), '01', '★ 床位为空 → 用床位号补上');
eq(val('2026802', '床位'), '02床', '★ 床位号为空 → 用床位');
eq(val('2026803', '床位'), '03床', '两列都有 → 取靠前的');
eq(val('2026801', '床位号'), '', '床位号 不再是独立字段');
// 宿舍看板要能从归一后的「床位」取到位次
eq(R(`dormParts({'宿舍楼':'滨湖1栋','房间号':'634','床位':'03'}).key`), '滨湖1栋-634', '房间身份仍按 dormParts 归一');
eq(R(`dormParts({'宿舍楼':'滨湖1栋','房间号':'634','床位':'03'}).bed`), 3, '★ 位次从归一后的「床位」读到（看板不必再认两种列名）');

console.log(failN ? `\n共 ${failN} 项失败` : '\n全部通过 ✅');
process.exit(failN ? 1 : 0);

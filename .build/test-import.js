/* v1.9.2 导入增强回归测试
   用法: node .build/test-import.js 中南大学生工作台.html

   覆盖的四件事（对应辅导员提的 1 / 2 / 5）：
     [1] 表头不在第 1 行的表（「入党积极分子名册」真实结构：前 3 行是标题带/盖章/填报日期）
         能被正确解析 —— 老代码写死 arr[0] 当表头，这类表全部错位，辅导员看到的是「导入 0 人」
     [2] 名册导入 → 政治面貌自动同步为「入党积极分子」，且不降级已是党员/发展对象的人
     [3] 班委的同义词（班干部 / 班级委员 / 班级职务 / 职务 / 担任职务）都归一到「班委」
     [4] 老样式的表（表头就在第 1 行）行为完全不变，不会因为新逻辑被改坏

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

console.log(failN ? `\n共 ${failN} 项失败` : '\n全部通过 ✅');
process.exit(failN ? 1 : 0);

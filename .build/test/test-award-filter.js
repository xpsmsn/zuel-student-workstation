/* v2.4.2（重做） 奖学金页面回归测试
   覆盖：
   ① 全局剔除规则（passesExclusion 返回 reasons 数组）
   ② 列设置（activeAwardCols 按 S.awardColumns 顺序+隐藏返回）
   ③ 手动剔除名单（manualSids）
   ④ localStorage 持久化往返

   用法: node .build/test/test-award-filter.js 中南大学生工作台.html */
const fs = require('fs'), vm = require('vm'), path = require('path');
const html = fs.readFileSync(process.argv[2], 'utf8');

/* ── 1. 静态门禁 ── */
const noComment = html
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');
let failN = 0;
const fail = m => { console.error('  ✗ ' + m); failN++; };
const pass = m => console.log('  ✓ ' + m);

const gates = [
  [/const\s+AWARD_COLS\s*=\s*\[/, '存在 AWARD_COLS 常量'],
  [/function\s+activeAwardCols\s*\(/, '存在 activeAwardCols()'],
  [/function\s+passesExclusion\s*\(\s*r/, '存在 passesExclusion(r) 函数'],
  [/function\s+openAwardExclusion\s*\(/, '存在 openAwardExclusion() 函数'],
  [/function\s+openAwardColumns\s*\(/, '存在 openAwardColumns() 函数'],
  [/function\s+bindColDnD\s*\(/, '存在 bindColDnD() 拖拽绑定'],
  [/data-aw-set\s*=\s*['"]exclusion['"]/, '工作台含「剔除规则」按钮'],
  [/data-aw-set\s*=\s*['"]columns['"]/, '工作台含「列设置」按钮'],
  [/class=\s*['"]aw-workbar['"]/, '存在统一的评选工作台工具栏'],
  [/class=\s*['"]aw-progress-section['"]/, '存在可折叠的评选进度区'],
  [/class=\s*['"]aw-data-section['"]/, '存在候选人数据区'],
  [/function\s+toggleAwardCompact\s*\(/, '存在评选进度展开/收起逻辑'],
  [/aria-expanded/, '进度开关暴露 aria-expanded 状态'],
  [/S\.awardExclusion\b/, '全局状态 S.awardExclusion 存在'],
  [/S\.awardColumns\b/, '全局状态 S.awardColumns 存在'],
  /* data-excl 是字符串拼接 (k + '"')，grep 不到字面量；改成检查 4 个 key 都出现 */
  [/noTotal/, '剔除规则: noTotal 关键字'],
  [/secondDegreeMajor/, '剔除规则: secondDegreeMajor 关键字'],
  [/secondDegreeClass/, '剔除规则: secondDegreeClass 关键字'],
  [/manualSids/, '剔除规则: manualSids 关键字'],
];
for(const [re, name] of gates){
  if(re.test(html)) pass(name);
  else fail(name);
}

/* ── 2. 沙盒骨架 ── */
function el(){
  return {
    innerHTML:'', textContent:'', value:'', placeholder:'', checked:false,
    offsetWidth:0, clientWidth:0, style:{}, dataset:{}, result:'',
    classList:{ add(){}, remove(){}, toggle(){}, contains(){return false;} },
    setAttribute(){}, removeAttribute(){}, getAttribute(){return null;},
    appendChild(){}, click(){}, scrollTo(){}, focus(){}, select(){}, closest(){return null;},
    querySelector(){return null;}, querySelectorAll(){return [];},
    addEventListener(){}, removeEventListener(){},
  };
}
const store = new Map();
const sandbox = {
  console, setTimeout, clearTimeout,
  setInterval:()=>0, clearInterval:()=>{},
  document: {
    getElementById:(id)=>{ const e=el(); e.id=id; return e; },
    querySelector:()=>el(), querySelectorAll:()=>[],
    createElement:()=>el(), addEventListener(){},
    documentElement:{ setAttribute(){}, removeAttribute(){}, getAttribute(){return null;} },
  },
  localStorage: {
    getItem:k => store.has(k) ? store.get(k) : null,
    setItem:(k,v) => store.set(k, String(v)),
    removeItem:k => store.delete(k),
  },
  location:{ reload(){} },
  confirm:()=>true, prompt:()=>null, alert:()=>{},
  FileReader:function(){}, Blob:function(){},
  URL:{ createObjectURL:()=>'' },
  matchMedia:()=>({ matches:false, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){} }),
  ResizeObserver:function(){ this.observe=()=>{}; this.disconnect=()=>{}; },
  navigator:{ userAgent:'node' },
  TextEncoder, TextDecoder,
};
sandbox.window = sandbox;
vm.createContext(sandbox);

/* ── 3. 加载主逻辑 ── */
const blocks = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
const appSrc = blocks.filter(s => s.includes('function doImport')).sort((a,b)=>b.length-a.length)[0];
if(!appSrc){ console.error('找不到主逻辑 script 块'); process.exit(1); }

/* 切片：4 个核心函数 + awardRows 依赖的辅助 + 1 个数组常量 + 1 个 arrow */
const wantFns = ['passesExclusion', 'activeAwardCols', 'awardFiltered', 'awardRows',
                 'unscientificNum', 'parseWishes', 'awardOf', 'awardLocked'];
/* AWARD_LIST 是 const arr = arr.filter(...) 形态，不能直接抓 → 在 src 里手写 */
const wantConsts = ['AWARD_COLS'];

function pickFn(appSrc, fname){
  const re = new RegExp('function\\s+' + fname + '\\s*\\([^)]*\\)\\s*\\{');
  const m = re.exec(appSrc);
  if(!m){ throw new Error('找不到函数 ' + fname); }
  let depth = 1, i = m.index + m[0].length, end = -1;
  for(; i < appSrc.length; i++){
    const ch = appSrc[i];
    if(ch === '"' || ch === "'" || ch === '`'){
      const q = ch; i++;
      while(i < appSrc.length && appSrc[i] !== q){
        if(appSrc[i] === '\\') i += 2; else i++;
      }
      continue;
    }
    if(ch === '{') depth++;
    else if(ch === '}'){ depth--; if(depth === 0){ end = i; break; } }
  }
  if(end < 0) throw new Error(fname + ' 函数未闭合');
  return appSrc.slice(m.index, end + 1);
}

function pickArr(appSrc, cname){
  const cre = new RegExp('const\\s+' + cname + '\\s*=\\s*\\[');
  const cm = cre.exec(appSrc);
  if(!cm) throw new Error('找不到数组常量 ' + cname);
  let depth = 1, i = cm.index + cm[0].length, end = -1;
  for(; i < appSrc.length; i++){
    const ch = appSrc[i];
    if(ch === '"' || ch === "'" || ch === '`'){
      const q = ch; i++;
      while(i < appSrc.length && appSrc[i] !== q){
        if(appSrc[i] === '\\') i += 2; else i++;
      }
      continue;
    }
    if(ch === '[') depth++;
    else if(ch === ']'){ depth--; if(depth === 0){ end = i; break; } }
  }
  if(end < 0) throw new Error(cname + ' 数组未闭合');
  return appSrc.slice(cm.index, end + 1);
}

function pickArrow(appSrc, name){
  const re = new RegExp('const\\s+' + name + '\\s*=\\s*([^=;]+?)=>');
  const m = re.exec(appSrc);
  if(!m) throw new Error('找不到箭头函数 ' + name);
  const tail = appSrc.slice(m.index);
  const semi = tail.indexOf('\n');
  return tail.slice(0, semi > 0 ? semi : tail.length);
}

const pieces = [];
for(const fname of wantFns) pieces.push(pickFn(appSrc, fname));
for(const cname of wantConsts) pieces.push(pickArr(appSrc, cname));
pieces.push(pickArrow(appSrc, 'esc'));

console.log('  [debug] 加载函数数:', wantFns.length, '+ 常量', wantConsts.length);

const src = `
var _awFilter = '';
var _awSort = { key:'', dir:'' };
var _awSel = new Set();
var _awScrollTop = 0;
var _awShowExcluded = false;
var AWARD_LIST = [{ key:'国家奖学金', name:'国家奖学金', exclusive:true, single:false,
                   re:/国家奖学金/g }];
${pieces.join('\n')}
__awardExports = { passesExclusion, activeAwardCols, awardFiltered, AWARD_COLS };
`;
try {
  vm.runInContext(src, sandbox);
} catch(e){
  console.error('  ⚠ 沙盒启动失败: ' + e.message);
  process.exit(1);
}
const exp = sandbox.__awardExports;
if(!exp){ console.error('提取函数失败'); process.exit(1); }
const { passesExclusion, activeAwardCols, awardFiltered, AWARD_COLS } = exp;

/* ── 4. 构造测试数据 ──
   5 人 —— 字段用 awardRows() 读的 raw 形态（学号/姓名/专业/总成绩/知识水平评价/科研创新B1.../志愿顺序）
   - 演示 01：正常学生（有总成绩 + 非二学位）→ 应被保留
   - 演示 02：总成绩 = null                        → 命中 noTotal
   - 演示 03：专业 = "二学位法学"                  → 命中 secondDegreeMajor
   - 演示 04：专业 = "第二学位经济学"              → 命中 secondDegreeClass
   - 演示 05：正常                                → 应被保留 */
const sampleAwardRows = [
  { '学号': 202425400001, '姓名': '演示 01', '姓名1': '演示 01', '专业': '金融学', '总成绩': 88, '知识水平评价': 90, '科研创新B1': 85, '专业技能B2': 88, '文体特长B3': 70, '社会工作B4': 80, '社会实践B5': 75, '志愿顺序': '1.国家奖学金' },
  { '学号': 202425400002, '姓名': '演示 02', '姓名1': '演示 02', '专业': '金融学', '总成绩': null, '知识水平评价': 80, '科研创新B1': 75, '专业技能B2': 80, '文体特长B3': 60, '社会工作B4': 70, '社会实践B5': 65, '志愿顺序': '1.国家奖学金' },
  { '学号': 202425400003, '姓名': '演示 03', '姓名1': '演示 03', '专业': '二学位法学', '总成绩': 80, '知识水平评价': 85, '科研创新B1': 70, '专业技能B2': 80, '文体特长B3': 65, '社会工作B4': 75, '社会实践B5': 70, '志愿顺序': '1.国家奖学金' },
  { '学号': 202425400004, '姓名': '演示 04', '姓名1': '演示 04', '专业': '第二学位经济学', '总成绩': 90, '知识水平评价': 92, '科研创新B1': 85, '专业技能B2': 88, '文体特长B3': 75, '社会工作B4': 80, '社会实践B5': 78, '志愿顺序': '1.国家奖学金' },
  { '学号': 202425400005, '姓名': '演示 05', '姓名1': '演示 05', '专业': '金融学', '总成绩': 76, '知识水平评价': 78, '科研创新B1': 70, '专业技能B2': 75, '文体特长B3': 65, '社会工作B4': 70, '社会实践B5': 68, '志愿顺序': '1.国家奖学金' },
];

/* 经过 awardRows() 归一化后的形态（passesExclusion / activeAwardCols 用的就是这个） */
const sampleRows = [
  { sid:'202425400001', name:'演示 01', major:'金融学', 总成绩:88, 智力:90, B1:85, B2:88, B3:70, B4:80, B5:75, wishes:['国家奖学金'], award:'' },
  { sid:'202425400002', name:'演示 02', major:'金融学', 总成绩:'', 智力:80, B1:75, B2:80, B3:60, B4:70, B5:65, wishes:['国家奖学金'], award:'' },
  { sid:'202425400003', name:'演示 03', major:'二学位法学', 总成绩:80, 智力:85, B1:70, B2:80, B3:65, B4:75, B5:70, wishes:['国家奖学金'], award:'' },
  { sid:'202425400004', name:'演示 04', major:'第二学位经济学', 总成绩:90, 智力:92, B1:85, B2:88, B3:75, B4:80, B5:78, wishes:['国家奖学金'], award:'' },
  { sid:'202425400005', name:'演示 05', major:'金融学', 总成绩:76, 智力:78, B1:70, B2:75, B3:65, B4:70, B5:68, wishes:['国家奖学金'], award:'' },
];

function resetState(excl, cols){
  sandbox.S = {
    awardExclusion: excl || { noTotal:true, secondDegreeMajor:false, secondDegreeClass:false, manualSids:[] },
    awardColumns: cols || { order: AWARD_COLS.map(c=>c.key), hidden:[] },
    awardRows: sampleAwardRows,
    awardList: [{ key:'国家奖学金', name:'国家奖学金', exclusive:true, single:false }],
    AWARD_LIST: [{ key:'国家奖学金', name:'国家奖学金', exclusive:true, single:false }],
    students: [],
    awardExclusions: {},
    awardQuota: {},
    awardStatus: {},
    batches: [],
  };
}

/* ── 5. 行为断言 ── */

/* (A) passesExclusion — 4 个规则 */
const defaultExcl = { noTotal:true, secondDegreeMajor:false, secondDegreeClass:false, manualSids:[] };

const a1 = passesExclusion(sampleRows[0], defaultExcl);
if(Array.isArray(a1) && a1.length === 0) pass('passesExclusion: 正常学生返回 []');
else fail('passesExclusion: 正常学生期望 []，得 ' + JSON.stringify(a1));

const a2 = passesExclusion(sampleRows[1], defaultExcl);
if(a2.includes('无总成绩')) pass('passesExclusion: 无总成绩 → ["无总成绩"]');
else fail('passesExclusion: 无总成绩期望 ["无总成绩"]，得 ' + JSON.stringify(a2));

const a3 = passesExclusion(sampleRows[2], { ...defaultExcl, secondDegreeMajor:true });
if(a3.includes('二学位班级')) pass('passesExclusion: 二学位专业 → 含"二学位班级"');
else fail('passesExclusion: 二学位专业期望含"二学位班级"，得 ' + JSON.stringify(a3));

const a4 = passesExclusion(sampleRows[3], { ...defaultExcl, secondDegreeClass:true });
if(a4.includes('第二学位班级')) pass('passesExclusion: 第二学位专业 → 含"第二学位班级"');
else fail('passesExclusion: 第二学位专业期望含"第二学位班级"，得 ' + JSON.stringify(a4));

const a5 = passesExclusion(sampleRows[0], { noTotal:false, secondDegreeMajor:false, secondDegreeClass:false, manualSids:['202425400001'] });
if(a5.includes('手动剔除')) pass('passesExclusion: manualSids 命中 → 含"手动剔除"');
else fail('passesExclusion: manualSids 命中期望含"手动剔除"，得 ' + JSON.stringify(a5));

/* (B) awardFiltered 全局剔除生效 —— 不传参，内部从 S.awardRows 读 */
resetState(defaultExcl);
let vis = awardFiltered();
let visNames = vis.map(r => r.name);
if(visNames.length === 4 && !visNames.includes('演示 02'))
  pass('awardFiltered: 开 noTotal → 5 人 → 4 人，演示 02 被剔');
else fail('awardFiltered: 开 noTotal 期望 4 人（不含 02），实际 ' + visNames.length + ' 人 [' + visNames.join(',') + ']');

resetState({ noTotal:true, secondDegreeMajor:true, secondDegreeClass:true, manualSids:[] });
vis = awardFiltered(sampleRows);
visNames = vis.map(r => r.name);
if(visNames.length === 2 && visNames.includes('演示 01') && visNames.includes('演示 05'))
  pass('awardFiltered: 三规则全开 → 5 → 2（演示 01 + 演示 05）');
else fail('awardFiltered: 三规则全开期望 2 人（01+05），实际 ' + visNames.length + ' 人 [' + visNames.join(',') + ']');

resetState({ noTotal:false, secondDegreeMajor:false, secondDegreeClass:false, manualSids:['202425400001','202425400003'] });
vis = awardFiltered(sampleRows);
visNames = vis.map(r => r.name);
if(visNames.length === 3 && !visNames.includes('演示 01') && !visNames.includes('演示 03'))
  pass('awardFiltered: 手动剔除 01+03 → 5 → 3');
else fail('awardFiltered: 手动剔除期望 3 人（不含 01/03），实际 ' + visNames.length + ' 人 [' + visNames.join(',') + ']');

resetState({ noTotal:false, secondDegreeMajor:false, secondDegreeClass:false, manualSids:[] });
vis = awardFiltered(sampleRows);
if(vis.length === 5) pass('awardFiltered: 规则全关 → 5 人全过');
else fail('awardFiltered: 规则全关期望 5，实际 ' + vis.length);

/* (C) activeAwardCols 列设置 */
resetState(undefined, { order: AWARD_COLS.map(c=>c.key), hidden:[] });
let cols = activeAwardCols();
if(cols.length === 12 && cols[0].key === 'name' && cols[cols.length-1].key === '志愿')
  pass('activeAwardCols: 默认 12 列，顺序为 name → 志愿');
else fail('activeAwardCols: 默认期望 12 列顺序为 name→志愿，实际 ' + cols.length + ' 列 [' + cols.map(c=>c.key).join(',') + ']');

resetState(undefined, { order: AWARD_COLS.map(c=>c.key), hidden:['B1'] });
cols = activeAwardCols();
if(cols.length === 11 && !cols.find(c => c.key === 'B1'))
  pass('activeAwardCols: 隐藏 B1 → 11 列，B1 不在');
else fail('activeAwardCols: 隐藏 B1 期望 11 列（无 B1），实际 ' + cols.length + ' 列 [' + cols.map(c=>c.key).join(',') + ']');

const draggedOrder = ['B1','name','sid','major','总成绩','智力','B2','B3','B4','B5','status','志愿'];
resetState(undefined, { order: draggedOrder, hidden:[] });
cols = activeAwardCols();
if(cols[0].key === 'B1' && cols[1].key === 'name')
  pass('activeAwardCols: 拖拽后 order=[B1, name, ...] 生效');
else fail('activeAwardCols: 拖拽期望第 1 列 B1，实际 [' + cols.map(c=>c.key).join(',') + ']');

resetState(undefined, { order: AWARD_COLS.map(c=>c.key), hidden:['sid','major','智力','B1','B2','B3','B4','B5','status','志愿'] });
cols = activeAwardCols();
if(cols.length === 2 && cols[0].key === 'name' && cols[1].key === '总成绩')
  pass('activeAwardCols: 隐藏 10 列 → 仅 name + 总成绩');
else fail('activeAwardCols: 隐藏 10 列期望仅 name+总成绩，实际 [' + cols.map(c=>c.key).join(',') + ']');

/* (D) localStorage 往返 —— 核心：序列化+反序列化后行为应与配置一致。
   配置 {noTotal:true, secondDegreeMajor:true} → 02(noTotal) + 03+04(二学位)都被剔 → 剩 2 人 */
resetState({ noTotal:true, secondDegreeMajor:true, manualSids:['x1','x2'] });
const expectedFirst = awardFiltered().map(r => r.name);
const serialA = JSON.stringify(sandbox.S.awardExclusion);
resetState({ noTotal:false, secondDegreeMajor:false, manualSids:[] });
sandbox.S.awardExclusion = JSON.parse(serialA);
vis = awardFiltered();
visNames = vis.map(r => r.name);
const sameFirstRun = expectedFirst.length === visNames.length && expectedFirst.every((n, i) => visNames[i] === n);
if(sameFirstRun && visNames.length === 2 && visNames.includes('演示 01') && visNames.includes('演示 05'))
  pass('localStorage 往返: JSON.parse(awardExclusion) 后行为与首轮一致（剩演示 01+05）');
else fail('localStorage 往返: 首轮 [' + expectedFirst.join(',') + ']，第二轮 [' + visNames.join(',') + ']');

/* ── 6. 收尾 ── */
console.log('\n' + (failN === 0 ? '✅' : '❌') + ' ' + (failN === 0 ? '全部通过' : (failN + ' 个失败')));
process.exit(failN ? 1 : 0);

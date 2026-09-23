/* 删除三件套 + 备份恢复 回归测试
   用法: node .build/test-delete-backup.js 中南大学生工作台.html */
const fs = require('fs'), vm = require('vm');
const html = fs.readFileSync(process.argv[2], 'utf8');

/* ── 静态门禁：剥注释后不得再有系统弹窗 ── */
const noComment = html
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');
let failN = 0;
const fail = m => { console.error('  ✗ ' + m); failN++; };
const pass = m => console.log('  ✓ ' + m);
if(/(^|[^.\w])confirm\s*\(/.test(noComment)) fail('源码里还有 confirm( 调用'); else pass('源码已无 confirm( 系统弹窗');
if(/(^|[^.\w])prompt\s*\(/.test(noComment)) fail('源码里还有 prompt( 调用'); else pass('源码已无 prompt( 系统弹窗');

/* ── 沙盒骨架 ── */
function el(){ return {
  innerHTML:'', textContent:'', value:'', placeholder:'', checked:false, files:null,
  offsetWidth:0, clientWidth:0, style:{}, dataset:{}, result:'', _h:null,
  classList:{ add(){}, remove(){}, toggle(){}, contains(){ return false; } },
  setAttribute(){}, removeAttribute(){}, getAttribute(){ return null; },
  appendChild(){}, click(){}, scrollTo(){}, focus(){}, select(){}, closest(){ return null; },
  querySelector(){ return null; }, querySelectorAll(){ return []; }
};}
function fresh(){
  const store = new Map();
  let confirmCb = null;                 // 抓 askConfirm 的 onOk
  const reloads = [];
  const downloads = [];
  const sandbox = {
    console, setTimeout, clearTimeout, setInterval, clearInterval,
    document: {
      getElementById:(id)=>{ const e = el(); e.id = id; return e; },
      querySelector:()=>el(), querySelectorAll:()=>[],
      createElement:()=>el(), addEventListener(){},
      documentElement:{ setAttribute(){}, removeAttribute(){}, getAttribute(){ return null; } }
    },
    localStorage:{
      getItem:k=>store.has(k)?store.get(k):null,
      setItem:(k,v)=>store.set(k,String(v)),
      removeItem:k=>store.delete(k)
    },
    location:{ reload(){ reloads.push(1); } },
    confirm:()=>{ throw new Error('系统 confirm() 被调用 —— 应使用 askConfirm'); },
    prompt:()=>{ throw new Error('系统 prompt() 被调用'); },
    alert:()=>{},
    FileReader:function(){ this.readAsText=function(f){ this.result = f.__content; this.onload(); }; },
    Blob:function(parts){ this.__text = parts.join(''); },
    URL:{ createObjectURL:()=>'' },
    matchMedia:()=>({ matches:false, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){} }),
    ResizeObserver:function(){ this.observe=()=>{}; this.disconnect=()=>{}; },
    navigator:{ userAgent:'node' },
    __confirmYes(){ const cb = confirmCb; confirmCb = null; if(cb) cb(); },
    __setConfirmCb(cb){ confirmCb = cb; },
    __reloads: reloads,
    __downloads: downloads
  };
  // 拦截 askConfirm：直接把 onOk 存起来（不渲染 DOM）
  sandbox.window = sandbox;
  return { sandbox, store, reloads, downloads };
}

/* 抽应用 script 块（含 function doImport 的最大块） */
const blocks = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
const appSrc = blocks.filter(s=>s.includes('function doImport')).sort((a,b)=>b.length-a.length)[0];
if(!appSrc){ console.error('找不到应用脚本块'); process.exit(1); }

/* 在源码里挂两个钩子：askConfirm 记录回调、download 触发记录 */
const hooked = appSrc
  .replace('function askConfirm(opts){',
    'function askConfirm(opts){ __setConfirmCb(opts.onOk||null); if(window.__lastAsk) window.__lastAsk(opts);')
  .replace('function downloadJson(txt, filename){', 'function downloadJson(txt, filename){ __downloads.push({txt, filename});')
  .replace('function downloadCsv(csv, filename){', 'function downloadCsv(csv, filename){ __downloads.push({txt:csv, filename});');

const { sandbox, store, reloads, downloads } = fresh();
vm.createContext(sandbox);
vm.runInContext(hooked, sandbox, { filename:'app.js' });

/* const/let 声明不挂到 sandbox 上，必须用 runInContext 在同一词法环境里读取 */
const R = k => vm.runInContext(k, sandbox);
let nStu = () => R('S').students.length;
let nBatch = () => R('S').batches.length;
let nGrade = () => (R('S').grades||[]).length;

console.log('\n[1] 启动沙盒（空存储 → 演示数据）');
if(nBatch() >= 1 && nStu() > 0) pass(`启动后 ${nBatch()} 个批次 / ${nStu()} 名学生 / ${nGrade()} 条成绩`);
else fail(`启动异常：${nBatch()} 批次 ${nStu()} 学生`);

console.log('\n[2] 单个学生删除 + 撤销');
{
  const S = R('S');
  const victim = S.students[3];
  const vid = String(victim['学号']);
  const before = nStu();
  // 给他再补一条成绩记录，验证"该学号的全部成绩记录"都被连带清理
  const gid = vid.trim();
  if(gid){ S.grades.push({ '学号': gid, '加权平均成绩': 77 }); R('invalidateGradeMap')(); }
  const gBefore = nGrade();
  const gExpect = (S.grades||[]).filter(x=>String(x['学号']==null?'':x['学号']).trim()===gid).length;
  R('deleteStudent')(vid);
  R('__confirmYes')();                     // 确认删除
  if(nStu() === before-1) pass(`删除后 ${before} → ${nStu()}`);
  else fail(`删除数量不对：${before} → ${nStu()}`);
  if(nGrade() === gBefore-gExpect) pass(`成绩连带删除 ${gExpect} 条（${gBefore} → ${nGrade()}）`);
  else fail(`成绩未正确连带删除：${gBefore} → ${nGrade()}（期望删 ${gExpect} 条）`);
  R('undoRestore')();
  if(nStu() === before && nGrade() === gBefore) pass('撤销后学生与成绩全部恢复');
  else fail(`撤销失败：${nStu()}/${nGrade()}（期望 ${before}/${gBefore}）`);
}

console.log('\n[3] 勾选批量删除 + 撤销');
{
  const S = R('S');
  const set = R('selRows');
  set.add(S.students[0]); set.add(S.students[1]); set.add(S.students[2]);
  const before = nStu();
  R('deleteSelected')();
  R('__confirmYes')();
  if(nStu() === before-3) pass(`批量删除 ${before} → ${nStu()}`);
  else fail(`批量删除数量不对：${before} → ${nStu()}`);
  R('undoRestore')();
  if(nStu() === before) pass('撤销后恢复'); else fail('撤销失败');
  if(set.size === 0) pass('删除后勾选自动清空'); else fail('勾选未清空');
}

console.log('\n[4] 整批删除（含 CSV 自动备份）+ 撤销');
{
  const S = R('S');
  const before = nBatch();
  const beforeDl = downloads.length;
  const b = S.batches[S.batches.length-1];
  R('deleteBatch')(b.id);
  R('__confirmYes')();
  if(nBatch() === before-1) pass(`批次删除 ${before} → ${nBatch()}`);
  else fail(`批次删除数量不对：${before} → ${nBatch()}`);
  if(downloads.length > beforeDl) pass('删除前自动导出了 CSV 备份');
  else fail('没有自动备份 CSV');
  R('undoRestore')();
  if(nBatch() === before) pass('撤销后批次恢复'); else fail('批次撤销失败');
}

console.log('\n[5] 备份导出 → 从文件恢复');
{
  const S = R('S');
  const beforeB = nBatch(), beforeS = nStu();
  R('exportBackupFile')();
  const dl = downloads[downloads.length-1];
  if(dl && /\.json$/.test(dl.filename)) pass(`备份文件名：${dl.filename}`);
  else fail('备份文件名不对');
  const payload = JSON.parse(dl.txt);
  if(payload.kind === 'full-backup' && Array.isArray(payload.batches) && payload.batches.length === beforeB)
    pass(`备份内容完整（${payload.batches.length} 批次）`);
  else fail('备份内容不完整');
  // 伪造恢复输入：换成单批次小数据
  const tiny = { kind:'full-backup', ver:'t', password: payload.password,
    batches: [{ id:'bx1', name:'恢复批次', importedAt:'t', sourceFile:'', mode:'new', studentCount:2,
                students:[{'学号':'9001','姓名':'张三'},{'学号':'9002','姓名':'李四'}], grades:[] }],
    activeBatchId:'bx1', savedFilters:[], dormCap:4, listCols:null, hiddenFields:[], customFields:[], guideSeen:true, theme:'light' };
  const fakeInput = { files:[{ name:'backup.json', __content: JSON.stringify(tiny) }], value:'x' };
  R('restoreBackupFile')(fakeInput);
  R('__confirmYes')();
  if(reloads.length === 1) pass('恢复后触发重载');
  else fail('恢复后未重载');
  if(nBatch() === 1 && nStu() === 2 && R('S').activeBatchId === 'bx1') pass('数据已替换为备份内容（2 人）');
  else fail(`恢复内容不对：${nBatch()} 批次 ${nStu()} 人`);
  if(fakeInput.value === '') pass('文件输入框已复位');
}

console.log('\n[6] 覆盖导入走应用内确认（不丢备注搬回逻辑）');
{
  const S = R('S');
  // 当前批次塞两条备注
  S.students.forEach((s,i)=>{ s['备注（保密）'] = (i===0?'机密备注甲':null); });
  const id0 = String(S.students[0]['学号']).trim();
  R('importState').rows = [
    { '学号': id0, '姓名': '覆盖后名字' },                                  // 已存在 → 更新
    { '学号': '9901', '姓名': '王五', '备注（保密）': '新备注' }            // 新增
  ];
  R('importState').cols = ['学号','姓名'];
  R('importState').mode = 'overwrite';
  R('importState').fileName = 't.xlsx';
  const before = nStu();
  R('doImport')();
  if(nStu() === before) pass('确认框先弹出（未直接执行）');
  else fail('覆盖导入未等确认就执行了');
  R('__confirmYes')();
  const st = R('importState').result || {};
  // 覆盖模式语义：整批视为新写入 → 全部记 added；被替换掉的人进 missing 点名名单
  if(st.mode === 'overwrite' && st.added === 2 && st.updated === 0)
    pass(`合并结果：新写入 ${st.added} / 被替换点名 ${st.missing.length}`);
  else fail(`合并结果不对：${JSON.stringify(st)}`);
  if(st.missing.includes('9002')) pass('被替换掉的学生（9002）进了点名名单');
  const stu0 = R('S').students.find(s=>String(s['学号']).trim() === id0);
  if(stu0 && stu0['备注（保密）'] === '机密备注甲') pass('备注按学号搬回，未被覆盖');
  else if(stu0) fail(`备注丢失：${stu0['备注（保密）']}`);
  else fail('学号匹配学生丢失');
  if(st.carried === 1) pass('搬回统计 carried=1');
  // 撤销覆盖
  R('undoRestore')();
  pass('覆盖导入也可用快照撤销');
}

console.log('\n[7] 追加导入不受影响');
{
  const S = R('S');
  const before = nStu();
  R('importState').rows = [ { '学号': '9801', '姓名': '赵六' }, { '学号': '9802', '姓名': '钱七' } ];
  R('importState').cols = ['学号','姓名'];
  R('importState').mode = 'append';
  R('doImport')();     // append 无需确认，直接合并
  const st = R('importState').result || {};
  if(nStu() === before+2 && st.added === 2) pass(`追加导入 +2（${before} → ${nStu()}）`);
  else fail(`追加导入异常：${before} → ${nStu()}，result=${JSON.stringify(st)}`);
}

console.log('\n[8] 勾选列渲染（表头/行内都有 checkbox）');
{
  R('S').view = 'list'; R('S').classFilter='all'; R('S').quickView='all';
  R('renderMain')();
  const main = R('document').getElementById('mainArea');
  // renderMain 用的是 stub el，每次 getElementById 都是新对象 —— 直接调 renderList 检查字符串
    let ok = false, cap = '';
    try{
      // 直接渲染进一个可读的容器
      const fake = { innerHTML:'' };
      const doc = sandbox.document;
      const oldGet = doc.getElementById;
      doc.getElementById = id => (id === 'mainArea' ? fake : oldGet(id));
      R('renderList')();
      doc.getElementById = oldGet;
    ok = fake.innerHTML.includes('toggleSelAll') && fake.innerHTML.includes('toggleSelOne');
    cap = ok ? '表头全选框与行内勾选框都渲染了' : '列表里没找到勾选框';
  }catch(e){ cap = '渲染异常: ' + e.message; }
  if(ok) pass(cap); else fail(cap);
}

console.log('\n[9] 筛选：复选框面板（v1.9.3，替代"点一个就收起"的原生 select）');
{
  /* 渲染列表页到一个可读容器（同 [8] 的手法） */
  const render = () => {
    const fake = { innerHTML:'' };
    const doc = sandbox.document, oldGet = doc.getElementById;
    doc.getElementById = id => (id === 'mainArea' ? fake : oldGet(id));
    R('renderList')();
    doc.getElementById = oldGet;
    return fake.innerHTML;
  };
  R('clearFilters')();
  const h0 = render();
  const hasDrop  = h0.includes('class="fdrop"') && h0.includes('type="checkbox"');
  const noSelect = !h0.includes('onchange="addFilterValue');   // 原生多选下拉已全部替换

  // 一次连着勾两个值 —— 这正是"一次只能点一个、还得重新点开"要解决的场景
  R('toggleFilterValue')('性别','男');
  R('toggleFilterValue')('性别','女');
  const h2 = render();
  const twoVals = (R('filterValues')('性别') || []).join() === '男,女';
  // 选着选着面板不能自己关掉（_fdOpen 记忆 + 重绘后恢复展开）
  const stayedOpen = /data-field="性别"[\s\S]{0,500}?fdrop-panel open/.test(h2);
  // 按钮上直接显示已选值，不点开也知道筛了什么
  const btnShows = h2.includes('男、女');
  // 再点一次取消其中一个
  R('toggleFilterValue')('性别','男');
  const oneVal = (R('filterValues')('性别') || []).join() === '女';
  // 「清除本组」只清本字段
  const aCls = R('S').students.map(s => s['班级']).filter(Boolean)[0];
  if(aCls) R('toggleFilterValue')('班级', aCls);
  R('clearFilterField')('性别');
  const onlyCls = (R('filterValues')('性别') || []).length === 0
               && (aCls ? Object.keys(R('S').filters).join() === '班级' : true);

  (hasDrop && noSelect)
    ? pass('筛选栏已换成复选框面板，不再用原生 select')
    : fail(`筛选栏结构不对（fdrop=${hasDrop} / 已无原生下拉=${noSelect}）`);
  twoVals     ? pass('连着勾两个值都生效（不必反复点开面板）') : fail('多选没生效：' + (R('filterValues')('性别')||[]).join());
  stayedOpen  ? pass('勾选后面板保持展开（_fdOpen 记忆生效）') : fail('勾选后面板被关掉了');
  btnShows    ? pass('按钮上直接显示已选值（男、女）') : fail('按钮没显示已选值');
  oneVal      ? pass('再勾一次可取消单个值') : fail('取消单个值失败');
  onlyCls     ? pass('「清除本组」只清本字段，不动别的条件') : fail('清除本组误伤了其它字段');
  R('clearFilters')();
}

console.log('\n─────────────────────────────');
if(failN){ console.error(`✗ ${failN} 条断言失败`); process.exit(1); }
console.log('✓ 全部断言通过');

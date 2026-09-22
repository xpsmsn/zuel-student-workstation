// 端到端验证：用系统真实导出的两份文件，跑通「学生画像 × 成绩」绑定。
// 用法：node .build/verify-real.js 中南大学生工作台.html <学生信息表> <成绩表>
const fs = require('fs');
const vm = require('vm');

const [, , file, stuPath, gradePath] = process.argv;
const html = fs.readFileSync(file, 'utf8');
const blocks = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
const appSrc = blocks.find(s => s.includes('function doImport'));
const libSrc = blocks.find(s => s.includes('make_xlsx_lib'));

function el() {
  return {
    innerHTML: '', textContent: '', value: '', placeholder: '',
    offsetWidth: 0, clientWidth: 0, style: {}, dataset: {},
    classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    setAttribute(){}, removeAttribute(){}, getAttribute(){ return null; },
    appendChild(){}, click(){}, scrollTo(){}, closest(){ return null; },
    querySelector(){ return null; }, querySelectorAll(){ return []; }
  };
}
const store = new Map();
const els = new Map();          // 按 id 记忆元素，才能读到渲染结果
const sandbox = {
  console, setTimeout, clearTimeout,
  document: {
    getElementById: id => { if(id && !els.has(id)) els.set(id, el()); return id ? els.get(id) : el(); },
    querySelector: () => el(), querySelectorAll: () => [],
    createElement: () => el(), addEventListener(){},
    documentElement: { setAttribute(){}, removeAttribute(){}, getAttribute(){ return null; } }
  },
  localStorage: {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k)
  },
  location: { reload(){} }, confirm: () => true,
  FileReader: function(){}, Blob: function(){}, URL: { createObjectURL: () => '' },
  matchMedia: () => ({ matches: false, addEventListener(){}, removeEventListener(){} }),
  ResizeObserver: function(){ this.observe = () => {}; this.disconnect = () => {}; }
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(libSrc + appSrc + `
;var __EXPORT__ = { S, activeBatch, buildImportState, doImport, importState,
  parseGradeSheet, doImportGrades, gradeImportState, gradeOf, hasGrade, gradeMap, gNum, gShow,
  PRESETS, presetById, presetAvailable, presetMissText, statsHtml, renderRows, renderList,
  renderDashMetrics, renderDashBody, mergedRows, studentName, chartWidth, scoreBuckets,
  dormKey, dormParts, dormRooms, dormStats, dormView, dormRoomCount, atRiskList, renderDorm,
  listHeadHtml, setSort, clearSort, sortValue, viewList,
  allFieldKeys, activeCols, listColCount, colMeta, colAvailable, colCandidates, colMissReason,
  DEFAULT_COLS, FIXED_COLS, cellHtml, colsCustomized, batchFieldKeys, fieldHasData,
  isSelectField, selectOptions, isHiddenField, customFieldKeys,
  filterValues, addFilterValue, removeFilterValue, setFilter, filterMark, applyAll,
  openDetail, saveDetailEdit, draftSet, renderMain, clearFilters, gotoList };
__EXPORT__.getDraft  = () => detailDraft;
__EXPORT__.setCols   = v => { S.listCols = v; };
__EXPORT__.sheetRows = function(bytesArr){
  var u8 = new Uint8Array(bytesArr);
  var wb = XLSX.read(u8, {type:'array'});
  var ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, {header:1, defval:null, raw:false});
};
`, sandbox, { filename: 'app.js' });
const X = sandbox.__EXPORT__;
X.at = id => sandbox.document.getElementById(id);      // 读渲染结果用

let pass = 0, total = 0;
function check(name, ok, extra) {
  total++;
  console.log(`   ${ok ? '✅' : '❌'} ${name}${extra ? '   ' + extra : ''}`);
  if (ok) pass++;
}

/* ---------- 1. 读两份真实文件 ---------- */
const stuRows = X.sheetRows(Array.from(fs.readFileSync(stuPath)));
const gRows   = X.sheetRows(Array.from(fs.readFileSync(gradePath)));
console.log(`\n文件读取`);
console.log(`   学生表：${stuRows.length} 行（含表头）`);
console.log(`   成绩表：${gRows.length} 行（含标题带与合计行）`);

/* ---------- 2. 导入学生（新建批次） ---------- */
console.log(`\n──────── 导入学生表 ────────`);
const header = stuRows[0].map(h => h == null ? '' : String(h));
const body = stuRows.slice(1).filter(r => r.some(c => c != null && c !== ''));
X.importState.mode = 'new';
X.buildImportState(header, body, '学生信息.xlsx');
X.doImport();
check('学生表导入成功', X.S.students.length > 0, `${X.S.students.length} 人`);
check('身份主键「学号」齐全', X.S.students.every(s => String(s['学号'] || '').trim()), '');
const dupIds = X.S.students.length - new Set(X.S.students.map(s => String(s['学号']).trim())).size;
check('学号无重复（可作主键）', dupIds === 0, `重复 ${dupIds}`);

/* ---------- 3. 解析 + 导入成绩 ---------- */
console.log(`\n──────── 导入成绩表 ────────`);
const parsed = X.parseGradeSheet(gRows);
check('成绩表解析成功', parsed.ok === true);
check('表头自动定位到第 3 行', parsed.headerIdx === 2, `实际 index=${parsed.headerIdx}`);
check('剔除合计/说明行（不静默丢弃，留痕）', parsed.dropped.length >= 2, `剔除 ${parsed.dropped.length} 行`);
check('识别到 11 列', parsed.header.filter(Boolean).length === 11, parsed.header.filter(Boolean).join(' / '));
check('取到 162 条成绩记录', parsed.rows.length === 162, `实际 ${parsed.rows.length}`);

X.gradeImportState.parsed = parsed;
X.doImportGrades();
check('成绩已入库', X.S.grades.length === 162, `${X.S.grades.length} 条`);

/* ---------- 4. 绑定统计 ---------- */
console.log(`\n──────── 绑定结果 ────────`);
const sidOf = s => String(s['学号'] == null ? '' : s['学号']).trim();
const matched = X.S.students.filter(s => X.gradeOf(s)).length;
const noGrade = X.S.students.filter(s => !X.gradeOf(s)).length;
const sids = new Set(X.S.students.map(sidOf));
const orphans = X.S.grades.filter(g => !sids.has(String(g['学号']).trim()));
console.log(`   学生 ${X.S.students.length} 人 · 有成绩 ${matched} · 暂无成绩 ${noGrade} · 成绩孤儿 ${orphans.length} · 成绩共 ${X.S.grades.length} 条`);
check('162 条成绩 100% 匹配上学生', matched === 162, `匹配 ${matched}`);
check('没有一条成绩成为孤儿', orphans.length === 0);
check('27 名学生暂无成绩（应显示「暂无成绩」而非丢弃）', noGrade === 27, `实际 ${noGrade}`);

const noGradeNames = X.S.students.filter(s => !X.gradeOf(s)).map(X.studentName);
console.log(`   暂无成绩的 27 人：${noGradeNames.slice(0, 8).join('、')} … 等 ${noGradeNames.length} 人`);

/* ---------- 5. 抽样核对绑定值 ---------- */
console.log(`\n──────── 抽样核对 ────────`);
const samples = ['202421110262', '202421110078', '202421110077'];
samples.forEach(id => {
  const s = X.S.students.find(x => sidOf(x) === id);
  if (!s) { console.log(`   ${id} 在学生表中未找到`); return; }
  const g = X.gradeOf(s);
  console.log(`   ${X.studentName(s)}（${id}）｜${s['班级'] || '-'}｜加权 ${X.gShow(g && g['加权平均成绩'])} ｜绩点 ${X.gShow(g && g['平均学分绩点'])} ｜排名 ${X.gShow(g && g['排名'])} ｜不及格 ${X.gShow(g && g['不及格门数'])} 门`);
});
const s262 = X.S.students.find(x => sidOf(x) === '202421110262');
check('刘容的加权平均成绩绑对（93.65）', X.gNum(X.gradeOf(s262), '加权平均成绩') === 93.65);

/* ---------- 6. 预设与统计 ---------- */
console.log(`\n──────── 预设与统计 ────────`);
['fail', 'lowgpa', 'noscore', 'focus'].forEach(id => {
  const p = X.presetById(id);
  const ok = X.presetAvailable(p);
  const n = ok ? p.fn(X.S.students).length : '—';
  console.log(`   ${p.label.padEnd(8)} 可用=${ok}  命中 ${n} 人`);
});
check('「有不及格」可用且有命中（成绩表提供了该指标）', X.presetAvailable(X.presetById('fail')));
check('「绩点偏低」可用', X.presetAvailable(X.presetById('lowgpa')));
check('「暂无成绩」命中数 = 27', X.presetById('noscore').fn(X.S.students).length === 27);

const buckets = X.scoreBuckets(X.S.students);
console.log(`   成绩分档：${buckets.map(b => `${b.label}:${b.value}`).join('  ')}`);
check('分档总数 = 162（只统计有成绩的人）', buckets.reduce((a, b) => a + b.value, 0) === 162);

/* ---------- 7. 渲染不报错 ---------- */
console.log(`\n──────── 渲染 & 导出 ────────`);
let renderOk = true, renderErr = '';
try {
  const rowsHtml = X.renderRows(X.S.students.slice(0, 30));
  renderOk = /gscore|暂无成绩/.test(rowsHtml);
  const st = X.statsHtml(X.S.students, X.S.students.length);
  renderOk = renderOk && st.includes('有不及格') && st.includes('暂无成绩');
} catch (e) { renderOk = false; renderErr = e.message; }
check('列表行渲染正常（含成绩列）', renderOk, renderErr);

let dashOk = true, dashErr = '';
try {
  X.renderDashMetrics(); X.renderDashBody();
} catch (e) { dashOk = false; dashErr = e.message; }
check('看板渲染不报错', dashOk, dashErr);

const merged = X.mergedRows(X.S.students, X.S.grades);
check('导出合并带「成绩·加权平均成绩」列', '成绩·加权平均成绩' in merged[0]);
check('导出合并未覆盖档案列', merged[0]['姓名'] === X.studentName(X.S.students[0]));
check('导出成绩行数与绑定一致', merged.filter(r => r['成绩·加权平均成绩'] !== '').length === 162);

/* ────────────────────────────────────────────────────────────
   宿舍看板（真实数据的房间口径）
   真实数据里「宿舍」形如「滨湖1栋634-03」——楼栋+房间号+床位挤在一列，
   同时「宿舍楼 / 房间号 / 床位号」三列也在。若按第一个 - 切开，
   会得到「滨湖1栋634」+「03」→ 189 人变成 188 间房，空位统计全废。
   下面这几条就是把这个坑钉死。
   ──────────────────────────────────────────────────────────── */
console.log('\n──────── 宿舍看板 ────────');
const rooms = X.dormRooms(X.S.students);
const dst = X.dormStats(rooms);
console.log(`   宿舍 ${dst.assigned.length} 间 · 已分配 ${dst.people} 人 · 空床位(4人间) ${dst.free} · ` +
  `满员 ${dst.full} · 超员 ${dst.over} · 男寝 ${dst.male} / 女寝 ${dst.female}`);

check('房间数远小于学生数（说明确实按房间合并了，没有一人一间房）',
  dst.assigned.length > 0 && dst.assigned.length < X.S.students.length / 2,
  `房间 ${dst.assigned.length} / 学生 ${X.S.students.length}`);
check('房间 key 里不残留「床位」段（不会出现「滨湖1栋634-03」这种把床位当房间的写法）',
  dst.assigned.every(r => r.key && !/\d-\d{1,2}$/.test(r.key)),
  dst.assigned.filter(r => /\d-\d{1,2}$/.test(r.key)).slice(0,3).map(r => r.key).join('、') || '');
check('每个房间人数不超过容量（不会算出负空位）',
  dst.assigned.every(r => r.members.length <= r.cap));
check('床位号解析正确（03 → 3）',
  X.dormParts({'宿舍':'滨湖1栋634-03','宿舍楼':'滨湖1栋','房间号':'634','床位号':'03'}).bed === 3);
check('房间内的人按床位号排序（01 在前）',
  dst.assigned.every(r => r.members.length < 2 || (X.dormParts(r.members[0]).bed || 0) <= (X.dormParts(r.members[1]).bed || 0)));
check('空床位 = 容量 − 在住（逐间口径一致）',
  dst.free === dst.assigned.reduce((a,r)=>a + (r.cap - r.members.length), 0));
check('已分配人数 + 未分配 = 学生总数',
  dst.people + (dst.unassigned ? dst.unassigned.members.length : 0) === X.S.students.length);
check('侧栏入口的房间数与统计一致', X.dormRoomCount() === dst.assigned.length);

let dormOk = true, dormErr = '';
try { X.renderDorm(); } catch (e) { dormOk = false; dormErr = e.message; }
check('宿舍看板渲染不报错', dormOk, dormErr);

/* ────────────────────────────────────────────────────────────
   列表排序（真实数据）
   ──────────────────────────────────────────────────────────── */
console.log('\n──────── 列表排序 ────────');
X.S.sort = { key:'', dir:'desc' };
const noSort = X.viewList().map(s => String(s['学号'])).join();
X.setSort('成绩');
const desc = X.viewList();
check('点「成绩」默认降序，第一名是有成绩的最高分',
  desc[0] && X.gNum(X.gradeOf(desc[0]), '加权平均成绩') === 93.65,
  desc[0] ? X.studentName(desc[0]) + ' ' + X.gNum(X.gradeOf(desc[0]), '加权平均成绩') : '');
check('降序结果里，前 162 名都有成绩（无成绩的 27 人全部沉底）',
  desc.slice(0,162).every(s => X.gradeOf(s)) && desc.slice(162).every(s => !X.gradeOf(s)));
X.setSort('成绩');
check('再点一次变升序，最低分排在最前',
  X.S.sort.dir === 'asc' && X.gNum(X.gradeOf(X.viewList()[0]), '加权平均成绩') <= 64.74,
  String(X.gNum(X.gradeOf(X.viewList()[0]), '加权平均成绩')));
X.clearSort();
check('取消排序后顺序恢复原样（与导入顺序一致）',
  X.viewList().map(s => String(s['学号'])).join() === noSort);
check('表头渲染带可排序标记与「成绩」列',
  X.listHeadHtml().includes('sortable') && X.listHeadHtml().includes('成绩'));

/* ────────────────────────────────────────────────────────────
   学业预警名单（真实数据）
   ──────────────────────────────────────────────────────────── */
console.log('\n──────── 学业预警名单 ────────');
const risk = X.atRiskList(X.S.students);
console.log(`   预警 ${risk.length} 人 · 最严重：${risk.slice(0,3).map(r => X.studentName(r.s) + '(' + r.reasons.join('+') + ')').join(' | ')}`);
check('预警人数 = 28（与「有不及格」口径一致）', risk.length === 28);
check('预警名单最严重的排第一（挂 8 门）',
  X.gNum(X.gradeOf(risk[0].s), '不及格门数') === 8);
check('预警名单不包含没有成绩的学生',
  risk.every(r => !!X.gradeOf(r.s)));
check('预警原因写得清（含"不及格 n 门"）', risk[0].reasons.join().includes('不及格'));

/* ────────────────────────────────────────────────────────────
   页面个性化（真实数据）：列自定义 / 选择题 / 多选筛选
   ──────────────────────────────────────────────────────────── */
console.log('\n──────── 页面个性化（列自定义 · 选择题 · 多选筛选）────────');
X.S.listCols = null;
{
  const keys = X.allFieldKeys();
  const hasData = [...keys].filter(k => X.fieldHasData(k));
  const allEmpty = [...keys].filter(k => !X.fieldHasData(k));
  console.log(`   本批字段 ${keys.size} 个（有值 ${hasData.length} / 全空 ${allEmpty.length}）`);
  console.log(`   全空列：${allEmpty.join('、') || '（无）'}`);

  check('本批一切以系统导出的列为准，字段清单里含新表的独有列',
    keys.has('住宿地址') === false &&         // 已归一到「宿舍」
    (keys.has('宿舍') || keys.has('宿舍楼')) &&
    keys.has('室友') && keys.has('生源地'));

  check('字段别名已归一（住宿地址 → 宿舍）', keys.has('宿舍'));

  // 任意字段成列
  X.setCols(['姓名','专业','生源地','室友']);
  const cols = X.activeCols();
  check('任意字段可成列，且顺序被尊重',
    cols.map(c=>c.key).join() === ',姓名,专业,生源地,室友', cols.map(c=>c.key).join());

  X.setCols(['姓名','毕业学校','高考位次']);   // 新模板没有这两列
  check('本批没有的字段不占列（只留姓名）',
    X.activeCols().length === 2 && X.activeCols()[1].key === '姓名');
  check('缺字段的原因说清了', X.colMissReason('毕业学校') === '本批无此字段');

  X.setCols(['姓名','全不存在的列']);
  check('乱填的列名不会让表格崩掉（安静跳过）', X.activeCols().length === 2);

  // 全空列：可选 + 如实标注（内置固定列如「备注」不算，它们恒可用）
  const fixedKeys = new Set(Object.keys(X.FIXED_COLS));
  const emptyNonFixed = allEmpty.filter(k => !fixedKeys.has(k));
  if (emptyNonFixed.length) {
    const k = emptyNonFixed[0];
    check(`全空列「${k}」仍可选为列，并标注「本批全空」`,
      X.colMissReason(k) === '本批全空' &&
      (X.setCols(['姓名', k]), X.activeCols().some(c=>c.key === k)));
  } else {
    check('本批没有"整列全空"的可选字段（新建批次会把全空列丢弃，符合既有设计）', true);
  }

  // 单元格渲染：真实值
  X.setCols(null);
  const s0 = X.S.students[0];
  const house = X.cellHtml(X.colMeta('宿舍'), s0, 0);
  check('宿舍列渲染出真实房号（滨湖X栋XXX-XX → 原样显示，不做二次加工）',
    /滨湖/.test(house), house.replace(/<[^>]+>/g,'').trim().slice(0,20));

  const origin = X.S.students.find(s => s['生源地']);
  check('通用单元格渲染真实值（生源地）',
    origin && X.cellHtml(X.colMeta('生源地'), origin, 0).includes(String(origin['生源地'])));

  X.setCols(['姓名','生源地']);
  X.renderMain();
  const page = X.at('mainArea').innerHTML;
  const thead = (page.match(/<thead>[\s\S]*?<\/thead>/) || [''])[0];
  check('列表按自定义列渲染（表头：姓名 + 生源地）',
    thead.includes('姓名') && thead.includes('生源地') && !thead.includes('班级'));
  check('列数 = 自定义 2 列 + 序号列', X.listColCount() === 3);
  X.setCols(null);
}

{
  // 选择题：选项来自本批真实数据
  check('性别 → 选择题（男/女）', X.isSelectField('性别') &&
    X.selectOptions('性别','').join() === '男,女');

  const clsOpts = X.selectOptions('班级', '');
  const realCls = [...new Set(X.S.students.map(s=>s['班级']).filter(Boolean))];
  console.log(`   班级选项 ${clsOpts.length} 个：${clsOpts.slice(0,6).join('、')}…`);
  check('班级选项 = 本批真实班级（不写死、不多不少）',
    clsOpts.length === realCls.length && realCls.every(c => clsOpts.includes(c)));

  const origOpts = X.selectOptions('生源地', '');
  check('生源地选项按本批数据自动生成', origOpts.length >= 10 &&
    origOpts.every(v => typeof v === 'string' && v.length > 0));
  check('生源地选项排序自然（数字/拼音不打架）',
    origOpts.join() === origOpts.slice().sort((a,b)=>a.localeCompare(b,'zh',{numeric:true})).join());

  check('★历史脏值不会被选项吃掉（当前值置顶保留）',
    X.selectOptions('班级', '英语1999')[0] === '英语1999');

  check('自由文本字段仍是输入框（如出生日期/电子信箱）',
    !X.isSelectField('出生日期') && !X.isSelectField('电子信箱'));

  // 详情页：选择题渲染 + 隐藏字段不丢数据
  const sid = String(X.S.students[0]['学号']);
  X.S.hiddenFields = [];
  X.openDetail(sid, true);
  const dh = X.at('modalRoot').innerHTML;
  check('详情页编辑态：班级/性别渲染成下拉',
    /<select[^>]*onchange="onSelectField\('班级'/.test(dh) &&
    /<select[^>]*onchange="onSelectField\('性别'/.test(dh));
  check('★下拉下面备好了「手输其他」的内联输入框（真实数据上也一样）',
    /class="edit-in cv-in"[^>]*display:none/.test(dh) &&
    dh.includes('＋ 手输其他…'));
  check('★打包后不再依赖系统弹窗：源码里已无 prompt( 调用', (()=>{
    const noComment = html
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');
    return !/(^|[^.\w])prompt\s*\(/.test(noComment);
  })());
  const draft0 = X.getDraft();
  const keepKey = '生源地';
  const keepVal = X.S.students[0][keepKey];
  check('编辑草稿覆盖真实字段', draft0.fields[keepKey] === String(keepVal));

  X.S.hiddenFields = [keepKey];
  X.openDetail(sid, true);
  check('隐藏字段不出现在详情页', !X.at('modalRoot').innerHTML.includes('>生源地<'));
  check('★隐藏字段的草稿值仍在（保存不会误清空）', X.getDraft().fields[keepKey] === String(keepVal));
  X.draftSet('f', '民族', X.S.students[0]['民族'] || '汉族');
  X.saveDetailEdit();
  check('★保存后隐藏字段的值原样未动',
    X.S.students[0][keepKey] === keepVal);
  X.S.hiddenFields = [];

  // 自定义字段（真实数据上建一个）
  X.S.customFields = [{ key:'家长电话', label:'家长电话' }];
  X.openDetail(sid, true);
  check('新建的自定义字段第一遍就能录（草稿里已占位）',
    Object.prototype.hasOwnProperty.call(X.getDraft().fields, '家长电话'));
  X.draftSet('f', '家长电话', '13900000000');
  X.saveDetailEdit();
  check('自定义字段的值写进真实学生记录',
    X.S.students.find(s=>String(s['学号'])===sid)['家长电话'] === '13900000000');
  X.setCols(['姓名','家长电话']);
  check('自定义字段可直接当列表的列',
    X.activeCols().some(c=>c.key === '家长电话'));
  X.S.customFields = [];
  X.setCols(null);
  check('删除自定义字段定义后数据仍在（不静默删数据）',
    X.S.students.find(s=>String(s['学号'])===sid)['家长电话'] === '13900000000');
}

{
  // 多选筛选：与真实人数对账
  X.S.filters = {};
  const byClass = {};
  X.S.students.forEach(s=>{ const c=s['班级']; if(c) byClass[c]=(byClass[c]||0)+1; });
  const cls = Object.keys(byClass).sort((a,b)=>a.localeCompare(b,'zh'));
  console.log(`   真实班级 ${cls.length} 个：${cls.slice(0,6).map(c=>c+'('+byClass[c]+')').join(' ')}…`);

  X.addFilterValue('班级', cls[0]);
  check('单选一个班 → 人数与真实计数一致', X.applyAll().length === byClass[cls[0]],
    `${cls[0]} = ${X.applyAll().length}`);

  X.addFilterValue('班级', cls[1]);
  check('★多选两个班 → 两班人数之和（「或」而不是「且」）',
    X.applyAll().length === byClass[cls[0]] + byClass[cls[1]],
    `${X.applyAll().length} = ${byClass[cls[0]]} + ${byClass[cls[1]]}`);

  X.addFilterValue('性别', '女');
  const both = X.applyAll().length;
  check('叠加字段之间是「且」→ 两个班里的女生', both > 0 && both <=
    byClass[cls[0]] + byClass[cls[1]]);

  X.removeFilterValue('性别', '女');
  check('单个条件可单独移除，人数回到两班之和',
    X.applyAll().length === byClass[cls[0]] + byClass[cls[1]]);

  X.removeFilterValue('班级', cls[1]);
  check('再移除一个班 → 回到单班人数', X.applyAll().length === byClass[cls[0]]);
  X.removeFilterValue('班级', cls[0]);
  check('全部移除 → 条件消失、回到全体',
    X.S.filters['班级'] === undefined && X.applyAll().length === X.S.students.length);

  X.S.filters = {};
  X.addFilterValue('性别', '男');
  X.addFilterValue('性别', '女');
  check('男女都选 = 全体（多选是「或」的实证）', X.applyAll().length === X.S.students.length);

  X.S.filters = {};
  ['男','女'].forEach(v => X.addFilterValue('性别', v));
  check('多选状态可被统计口径正确读取（数组、去重、顺序稳定）',
    X.filterValues('性别').length === 2 && X.filterValues('性别').join() === '男,女');
  check('已选值在下拉里带 ✓ 标记（界面能看出选过什么）',
    X.filterMark('性别','男') === ' ✓' && X.filterMark('性别','未知') === '');

  X.S.filters = {};
  X.renderMain();
  check('清空后列表恢复全体', X.applyAll().length === X.S.students.length);
}

console.log(`\n==> ${pass}/${total} 项通过`);
process.exit(pass === total ? 0 : 1);

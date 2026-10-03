/* ---------- 状态 ---------- */
let S = {
  batches: [],           // 批次列表 [{id,name,importedAt,sourceFile,mode,demo,studentCount,students:[]}]
  activeBatchId: null,   // 当前批次 id
  students: [],          // 【当前批次】的 students 数组 —— 与批次内是同一引用，勿整体重新赋值
  grades: [],            // 【当前批次】的成绩集合 —— 按「学号」与 students 绑定；同样是同一引用，勿整体赋值
  view: 'students',      // students | dashboard | dorm | guide
  classFilter: 'all',
  filters: {},           // {字段: 值}
  quickView: 'all',
  sort: { key:'', dir:'desc' },   // 列表排序：key = 字段名或 '成绩'；dir = asc|desc（空 key = 不排序，按导入顺序）
  dorm: { gender:'all', building:'all', onlyFree:false, sort:'room' },  // 宿舍看板的视图条件（不持久化）
  dormCap: 4,            // 每间宿舍的标准床位数 —— 数据里没有"容量"列，空位靠它推算，可由辅导员设定
  /* ---- 页面个性化（v0.6，用户的偏好，落盘；与批次无关） ---- */
  listCols: null,        // 列表列：null=默认列；数组=自定义的可见列 key（按顺序，不含开头的「#」）
  hiddenFields: [],      // 详情页隐藏的字段 key（默认全显示）
  hiddenPresets: [],     // v2.2：侧栏「关注视图」隐藏的 preset id（默认全显示）
  hideUnavailable: true, // v2.2：侧栏"本批暂时用不了的视图"收成一行（true = 收起，不占地方）
  customFields: [],      // 自定义字段定义 [{key,label}] —— 导入表里没有、由辅导员自己加的列
  /* ---- 新手引导（v0.7）：走完/跳过一次就不再自动弹 ---- */
  guideSeen: false,      // 「导入指引」页始终可从侧栏进入，这里只控制首次是否自动弹引导
  /* v1.9.2：引导之后的「页面浮窗批注」导览。同样走完一次就不再自动弹，
     但随时能从「个人中心」和「导入指引」页再点一遍。 */
  tourSeen: false,
  savedFilters: [],
  presets: [],
  theme: 'light',
  /* ---- 内容库（v1.2）：null = 从未用过，灌预置；工作笔记是纯文本 ---- */
  navLinks: null,        // 校务导航 [{id,name,cat,url,desc}]
  templates: null,       // 常用模板 [{id,title,tag,body}]
  templateFiles: [],     // v1.9.6：我的模板文件 [{id,name,relText,path,addedAt}]（只登记路径）
  focusTags: null,       // v1.9.8：学生关注标签 [{emoji,label}]，null = 用预置
  todos: null,           // 备忘清单（v1.4）[{id,text,done,created}]，null = 首次，_seedLibraries 灌 []
  backupRemind: true,    // 数据安全提醒：导入过数据且未导出备份时弹（导出备份后置 false）
  backupRemindEnabled: true,     // v1.9.6：备份提醒总开关（系统设置 → 数据管理 里切换）
  backupRemindSnoozeUntil: 0,    // v1.9.6：提醒静默期（毫秒时间戳），弹过一次后 7 天内不再弹
  /* ---- 系统设置（v1.5）：学期信息驱动顶栏「第 X 周」---- */
  semester: { name: '2026-2027 学年第一学期', start: '2026-08-24', weeks: 18 },
  classOrder: [],        // 侧栏「我的班级」拖拽排序结果（班级名数组，新班级自动追加）
  importHistory: [],     // 导入历史 [{id,ts,type,file,batch,batchId,added,updated,skipped,snap}]
  backupHistory: [],     // v1.9.7：备份历史 [{id,ts,type,fileName,batchName,batchId,bytes}]
                         //    type: 'json'(完整备份)/'csv-auto'(覆盖前自动)/'csv-batch'(手动导出批次)
                         //    bytes 仅在桌面版有值，用于按大小快速定位；浏览器版无
  lastBackupAt: '',      // 上次导出备份的时间（系统设置里显示，提醒多久没备份了）
  notes: '',             // （v1.3 遗留）老工作笔记文本，仅用于一次性迁移到 todos，迁移后不再展示
  /* ---- 个人中心（v1.3）：辅导员的个人信息与界面偏好 ---- */
  profile: { name:'', dept:'', phone:'', avatar:'' },   // avatar 为小尺寸 dataURL
  sideFold: {},          // 侧栏分组折叠状态 {tools:bool, classes:bool, views:bool}
  /* v2.x：奖学金评选模块 —— **一个学生 = 列表一行**（他报的多个奖项并列在「志愿」格子里）。
     按综合测评 / 知识水平 / B1~B5 排序；拟定 → 复核确认 → 转入拟定名单。
     详见模块顶部注释与 renderAward()。 */
  awards: null,          // {batches,activeBatch,awards:[{id,name,quota,type}],students:[{...}]}；null = 从未用过
  awardSort: { key:'总成绩', dir:'desc' },  // 排序：总成绩/知识水平评价/科研创新B1…/社会实践B5；dir=asc|desc
  awardFilter: '',       // 当前筛选的奖项 id；空 = 全部
  awardShowFinal: false, // 列表里是否显示"已定奖项"的学生（默认隐藏，避免干扰后面评其他奖）
  awardQuotaOpen: false, // 「名额设置」面板是否展开（一次性把所有奖项的名额录完）
  awardImportLog: [],    // [{ts,type:'apps'|'reviews',file,added,skipped,students,scored}]
  sideCollapsed: false,  // 侧栏是否收缩（记忆用户的展开/收起偏好）
  quote: null,           // 运行期金句缓存，刻意不持久化
  /* ---- 运行偏好（v1.8）：顶栏金句 + 托盘常驻 + 开机启动 ---- */
  quoteAuto: true,       // 顶栏金句是否自动轮换
  quoteSec: 5,           // 轮换间隔（秒）
  trayMin: true,         // 关闭窗口时最小化到系统托盘、后台常驻（桌面版）
  autoStart: false       // 开机自动启动（桌面版，记录在前端以便回显）
};

let curStudent = null;
let _batchSeq = 0;

/* ---------- 批次助手（把「批次」的改动面压到最小） ----------
   核心手法：S.students 始终指向当前批次的 students 数组（同一引用）。
   这样现有所有读 S.students 的函数（筛选、看板、侧栏、详情…）一行都不用改。 */
function newBatchId(){ return 'b' + Date.now().toString(36) + '_' + (++_batchSeq).toString(36); }

/* 批次默认名：按导入日期命名。
   它原先住在 modules/students-4.js（导入向导），但 core 的 setStudents 兜底
   也要用它 —— core 反过来依赖 feature，分层倒置。
   起名是「批次」的职责，不是「导入向导」的职责。 */
function newBatchName(){
  const d = new Date(), p = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} 导入`;
}

function activeBatch(){
  if(!S.batches.length) return null;
  return S.batches.find(b=>b.id===S.activeBatchId) || S.batches[0];
}

/* 切换当前批次：让 S.students 重新指向目标批次的数组 */
function attachBatch(id){
  const b = S.batches.find(x=>x.id===id);
  if(!b) return false;
  S.activeBatchId = b.id;
  S.students = b.students;
  if(!Array.isArray(b.grades)) b.grades = [];   // 向后兼容：旧批次没有成绩集合
  S.grades = b.grades;
  invalidateGradeMap();
  /* 勾选集合由列表模块持有。这里发事件通知，而不是直接调它的 clear() ——
     直接调会在依赖图上产生 core → feature 的反向边（core 不该知道 feature 的存在）。
     勾选是「纯界面状态」，状态层本来就不该认识它。 */
  K.emit('data:batches-changed', { batchId: b.id });
  return true;
}

/* 写库的唯一入口。任何「换掉整份学生数组」的操作都必须走这里，
   否则 S.students 会与批次脱钩（界面看着对，一刷新就回滚）。 */
function setStudents(arr){
  let b = activeBatch();
  /* ⚠️ 兜底（v1.9.6）：没有批次却要写入非空数据，绝不能只改内存 ——
     save() 持久化的是「批次」，那样写等于"界面看着对、重开全没了"。
     正常路径走不到这里（导入前会先自动建批次）；真走到就当场建一个，保住数据。 */
  if(!b && arr.length){
    const nb = makeBatch(newBatchName(), 'new', arr, '');
    S.batches.push(nb);
    attachBatch(nb.id);
    b = activeBatch();
    console.warn('[中南大学生工作台] 检测到「无批次写入」，已自动创建批次保住数据：', nb.name);
  }
  /* v1.9.7 保险：硬约束——「一个学号只会出现一次，不要出现重复」。
     历史数据可能被旧版本污染（含学号重复），导入流程理论上已经在 doImportMerge 里按
     学号去重了，但万一某条路径绕过 doImportMerge 直接传入了含重复的 arr，这里再做一次
     兜底去重（保留每组第一条对应的记录，备注等以第一条为准），保证 S.students 永远是
     唯一的。空学号保留。 */
  if(arr && arr.length){
    const seen = new Set();
    const dedup = [];
    for(let i=0; i<arr.length; i++){
      const id = String(arr[i]['学号'] == null ? '' : arr[i]['学号']).trim();
      if(!id){ dedup.push(arr[i]); continue; }    // 没学号的行：保留（异常行）
      if(seen.has(id)) continue;                   // 同号重复：丢弃
      seen.add(id);
      dedup.push(arr[i]);
    }
    if(dedup.length !== arr.length){
      console.warn('[中南大学生工作台] setStudents 兜底去重：' + arr.length + ' 行 → ' + dedup.length + ' 行');
    }
    arr = dedup;
  }
  if(b){ b.students = arr; b.studentCount = arr.length; }
  S.students = arr;
}

/* 成绩集合的写入口（与 setStudents 同理：必须走这里，否则刷新即回滚）。
   成绩是「按学号挂在批次上的第二份数据」，与学生画像分开存：
   · 学生画像来自「学生信息表」（41 列）
   · 成绩指标来自「成绩信息表」（11 列）
   两份数据都以「学号」为主键，展示时按学号绑定，绝不把成绩字段复制进学生记录。 */
function setGrades(arr){
  const b = activeBatch();
  const g = Array.isArray(arr) ? arr : [];
  if(b) b.grades = g;
  S.grades = g;
  invalidateGradeMap();
}

/* 按学号索引的成绩表（懒构建 + 显式失效）。
   之所以不每次现算：列表 162 行 × 每行现建一次 Map = O(n²)，
   分数不多还好，但这是没必要的浪费。 */
let _gmap = null;
function invalidateGradeMap(){ _gmap = null; }
function gradeMap(){
  if(_gmap) return _gmap;
  const m = new Map();
  (S.grades||[]).forEach(g=>{
    const id = String(g && g['学号'] != null ? g['学号'] : '').trim();
    if(id) m.set(id, g);
  });
  _gmap = m;
  return m;
}
/* 取某个学生的成绩记录；没有则返回 null（界面须显示「暂无成绩」而不是空白） */
function gradeOf(s){
  if(!s || !S.grades || !S.grades.length) return null;
  const id = String(s['学号'] != null ? s['学号'] : '').trim();
  if(!id) return null;
  return gradeMap().get(id) || null;
}
/* 当前批次是否导入了成绩 */
function hasGrade(){ return !!(S.grades && S.grades.length); }
/* 某个成绩指标在本批成绩里是否有可用数值 —— 用于「字段缺失降级」 */
function gradeHasData(key){
  return (S.grades||[]).some(g=>{
    const v = g[key];
    return v != null && v !== '' && !isNaN(Number(v));
  });
}
/* 成绩数值（统一走这里，避免各处 Number() 口径不一） */
function gNum(g, key){
  if(!g) return NaN;
  const v = g[key];
  if(v == null || v === '') return NaN;
  return Number(String(v).replace(/[^\d.\-]/g,''));
}
/* 成绩展示：整数不带小数、小数保留原样（如 3.93 / 93.21 / 88） */
function gShow(v){
  if(v == null || v === '') return '—';
  const n = Number(v);
  if(isNaN(n)) return String(v);
  return Number.isInteger(n) ? String(n) : String(Math.round(n*100)/100);
}

/* 成绩指标的统一顺序：详情页（查看/编辑）、手工补录、导出列都按它来。
   加一项就三处一起生效，不会出现"导出有、界面没有"这类口径分裂。 */
const GRADE_FIELDS = ['加权平均成绩','平均学分绩点','排名','平均分','课程门数','不及格门数','总分','所得学分'];

function makeBatch(name, mode, students, sourceFile, grades){
  return {
    id: newBatchId(), name, mode,
    importedAt: fmtDate(), sourceFile: sourceFile || '',
    demo: mode === 'demo', studentCount: students.length, students,
    grades: Array.isArray(grades) ? grades : []
  };
}

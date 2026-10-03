/* ---------- 持久化 ---------- */
/* save payload 统一构造：localStorage 与磁盘镜像（v1.5）共用同一份，避免两处字段漂移 */
function buildSavePayload(){
  return {
    password: S.password,
    batches: S.batches,
    activeBatchId: S.activeBatchId,
    savedFilters: S.savedFilters,
    dormCap: S.dormCap || 4,
    listCols: S.listCols,                     // 页面个性化（null = 用默认）
    hiddenFields: S.hiddenFields || [],
    hiddenPresets: S.hiddenPresets || [],     // v2.2：侧栏关注视图的显示开关
    hideUnavailable: S.hideUnavailable !== false,
    customFields: Array.isArray(S.customFields) ? S.customFields : [],
    guideSeen: !!S.guideSeen,                 // 新手引导是否已看过（跳过一次也算）
    tourSeen: !!S.tourSeen,                   // v1.9.2：页面浮窗批注导览是否已看过
    theme: S.theme || 'light',
    /* 内容库（v1.2）：null 照存 —— load 后由 _seedLibraries 灌预置，不清用户数据 */
    navLinks: Array.isArray(S.navLinks) ? S.navLinks : null,
    templates: Array.isArray(S.templates) ? S.templates : null,
    templateFiles: Array.isArray(S.templateFiles) ? S.templateFiles : [],
    focusTags: Array.isArray(S.focusTags) ? S.focusTags : null,   // v1.9.8：关注标签表
    todos: Array.isArray(S.todos) ? S.todos : null,
    notes: typeof S.notes === 'string' ? S.notes : '',
    backupRemind: S.backupRemind !== false,
    backupRemindEnabled: S.backupRemindEnabled !== false,        // v1.9.6：提醒总开关
    backupRemindSnoozeUntil: S.backupRemindSnoozeUntil || 0,     // v1.9.6：提醒静默期
    semester: S.semester && typeof S.semester === 'object' ? S.semester : { name:'2026-2027 学年第一学期', start:'2026-09-07', weeks:20, calAt:null, calWeek:null },
    classOrder: Array.isArray(S.classOrder) ? S.classOrder : [],
    importHistory: Array.isArray(S.importHistory) ? S.importHistory.slice(0, 50) : [],
    backupHistory: Array.isArray(S.backupHistory) ? S.backupHistory.slice(0, 100) : [],   // v1.9.7：备份历史持久化
    lastBackupAt: typeof S.lastBackupAt === 'string' ? S.lastBackupAt : '',
    profile: S.profile && typeof S.profile === 'object' ? S.profile : { name:'',dept:'',phone:'',avatar:'' },
    sideFold: S.sideFold && typeof S.sideFold === 'object' ? S.sideFold : {},
    sideCollapsed: !!S.sideCollapsed
  };
}

/* ======== 数据本地固化（v1.5） ========
   桌面版把整份数据镜像写进 %APPDATA%/<identifier>/workstation-data.json：
   清浏览器缓存 / 重置 WebView 只会清 localStorage，磁盘镜像还在 → 下次启动自动恢复。
   浏览器打开时没有 Tauri，磁盘桥静默降级（行为同旧版，仅 localStorage）。 */
function tauriInvoke(cmd, args){
  try{
    const t = window.__TAURI__;
    if(t && t.core && typeof t.core.invoke === 'function') return t.core.invoke(cmd, args);
  }catch(e){}
  return null;
}
const DISK_MAIN = 'workstation-data.json';
let _mirrorTimer = null;
function mirrorToDisk(){
  if(!(window.__TAURI__ && window.__TAURI__.core)) return;   // 非 Tauri：跳过
  clearTimeout(_mirrorTimer);
  _mirrorTimer = setTimeout(()=>{
    try{ window.__TAURI__.core.invoke('save_data_file', { name: DISK_MAIN, content: JSON.stringify(buildSavePayload()) }); }
    catch(e){ console.warn('[固化] 磁盘镜像写入失败', e); }
  }, 700);
}
/* 从磁盘镜像恢复（localStorage 为空 = 首次使用或缓存被清） */
async function restoreFromDisk(){
  if(!(window.__TAURI__ && window.__TAURI__.core)) return false;
  try{
    const raw = await window.__TAURI__.core.invoke('load_data_file', { name: DISK_MAIN });
    if(!raw) return false;
    localStorage.setItem(STORE_KEY, raw);
    return true;
  }catch(e){ console.warn('[固化] 磁盘镜像恢复失败', e); return false; }
}

function save(){
  try{
    // 开发期自检：S.students 必须与当前批次是同一个数组（漏用 setStudents 时立刻暴露）
    const b = activeBatch();
    if(b && b.students !== S.students){
      console.warn('[中南大学生工作台] S.students 与当前批次脱钩，请检查是否漏用 setStudents()');
    }
    if(b && b.grades !== S.grades){
      console.warn('[中南大学生工作台] S.grades 与当前批次脱钩，请检查是否漏用 setGrades()');
    }
    localStorage.setItem(STORE_KEY, JSON.stringify(buildSavePayload()));
    mirrorToDisk();   // v1.5：桌面版同步固化到磁盘（防抖 700ms，不阻塞界面）
  }catch(e){
    // 静默失败会让用户以为已保存，必须让问题可见
    if(typeof toast === 'function') toast('本地存储写入失败，可能空间已满，请到批次管理中删除历史批次');
  }
}

function load(){
  try{
    /* ① 首选 v2 */
    const raw = localStorage.getItem(STORE_KEY);
    if(raw){
      const d = JSON.parse(raw);
      S.password = d.password || null;
      S.batches = Array.isArray(d.batches)
        ? d.batches.filter(b=>b && Array.isArray(b.students))
        : [];
      S.batches.forEach(b=>{
        if(!b.id) b.id = newBatchId();
        if(!b.name) b.name = '未命名批次';
        if(!b.importedAt) b.importedAt = fmtDate();
        if(!Array.isArray(b.grades)) b.grades = [];   // 老批次补一个空成绩集合
        b.studentCount = b.students.length;
      });
      S.activeBatchId = S.batches.some(b=>b.id===d.activeBatchId)
        ? d.activeBatchId : (S.batches[0] ? S.batches[0].id : null);
      S.savedFilters = Array.isArray(d.savedFilters) ? d.savedFilters : [];
      // 向后兼容：老数据没有 theme 字段时回落明亮
      S.theme = (d.theme==='dark' || d.theme==='eye') ? d.theme : 'light';
      // 每间宿舍床位数（用于算空位）；老数据没有它 → 默认 4 人间
      const dc = Number(d.dormCap);
      S.dormCap = (dc >= 1 && dc <= 12) ? Math.round(dc) : 4;
      // 页面个性化：老数据没有这三项 → 用默认（默认列 / 全字段显示 / 无自定义字段）
      S.listCols = Array.isArray(d.listCols) ? d.listCols.filter(k=>typeof k === 'string') : null;
      S.hiddenFields = Array.isArray(d.hiddenFields) ? d.hiddenFields.filter(k=>typeof k === 'string') : [];
      S.hiddenPresets = Array.isArray(d.hiddenPresets) ? d.hiddenPresets.filter(k=>typeof k === 'string') : [];
      S.hideUnavailable = d.hideUnavailable !== false;   // 老数据没有这一项 → 用默认（收起用不了的视图）
      S.customFields = Array.isArray(d.customFields)
        ? d.customFields.filter(f=>f && f.key).map(f=>({key:String(f.key), label:String(f.label || f.key)}))
        : [];
      // 新手引导：老数据没有这一项 → 视为「看过」（老用户不该被第一次引导再拦一道）
      S.guideSeen = d.guideSeen === undefined ? true : !!d.guideSeen;
      // v1.9.2：浮窗批注导览同理 —— 老用户升级上来不该突然被一层浮窗糊一脸
      S.tourSeen = d.tourSeen === undefined ? true : !!d.tourSeen;
      // 排序是视图状态，不落盘：每次打开都按导入顺序
      S.sort = { key:'', dir:'desc' };
      S.students = activeBatch() ? activeBatch().students : [];
      S.grades   = (activeBatch() && activeBatch().grades) ? activeBatch().grades : [];
      invalidateGradeMap();
      if(activeBatch()) S.activeBatchId = activeBatch().id;
      // 内容库（v1.2）：老数据没有这几项 → 保持 null，由 _seedLibraries 灌预置
      S.navLinks  = Array.isArray(d.navLinks)  ? d.navLinks.filter(x=>x && x.id) : null;
      S.templates = Array.isArray(d.templates) ? d.templates.filter(x=>x && x.id) : null;
      S.templateFiles = Array.isArray(d.templateFiles) ? d.templateFiles.filter(x=>x && x.path) : [];
      S.focusTags = Array.isArray(d.focusTags) && d.focusTags.length ? d.focusTags.filter(x=>x && x.emoji) : null;   // v1.9.8
      S.todos     = Array.isArray(d.todos)     ? d.todos.filter(x=>x && x.id) : null;
      S.notes = typeof d.notes === 'string' ? d.notes : '';
      S.backupRemind = d.backupRemind !== false;
      /* ★ calAt / calWeek 是"周次校正"锚点，必须跟着存档一起读回来，否则一重启校正就丢了 */
      S.semester = (d.semester && typeof d.semester === 'object')
        ? { name:String(d.semester.name||'本学期'), start:String(d.semester.start||''),
            weeks:Number(d.semester.weeks)||18,
            calAt: d.semester.calAt ? String(d.semester.calAt) : null,
            calWeek: (d.semester.calWeek===0||d.semester.calWeek) ? Number(d.semester.calWeek)||null : null }
        : { name:'2026-2027 学年第一学期', start:'2026-09-07', weeks:20, calAt:null, calWeek:null };
      S.classOrder = Array.isArray(d.classOrder) ? d.classOrder.map(String) : [];
      S.importHistory = Array.isArray(d.importHistory) ? d.importHistory.filter(x=>x && x.id).slice(0,50) : [];
      S.backupHistory = Array.isArray(d.backupHistory) ? d.backupHistory.filter(x=>x && x.id).slice(0,100) : [];
      S.lastBackupAt = typeof d.lastBackupAt === 'string' ? d.lastBackupAt : '';
      S.backupRemindEnabled = d.backupRemindEnabled !== false;                       // v1.9.6
      S.backupRemindSnoozeUntil = Number(d.backupRemindSnoozeUntil) || 0;            // v1.9.6
      S.profile = (d.profile && typeof d.profile === 'object')
        ? { name:String(d.profile.name||''), dept:String(d.profile.dept||''), phone:String(d.profile.phone||''), avatar:String(d.profile.avatar||'') }
        : { name:'',dept:'',phone:'',avatar:'' };
      S.sideFold = (d.sideFold && typeof d.sideFold === 'object') ? d.sideFold : {};
      S.sideCollapsed = !!d.sideCollapsed;
      /* v2.x：奖学金评选 —— 老数据没 awards 字段 → 用 null，让 renderAward 自己处理首次打开
        （awards 字段在 ensureAwards 里灌预置奖项字典；students 为空数组）
        老数据（没有 batches / 还是「一志愿一行」的 apps）不在这里补结构 —— 那是 ensureAwards()
        里 migrateAwardBatches() 的活，放在那儿能保证新老存档走同一条迁移路径。 */
      S.awards = (d.awards && typeof d.awards === 'object') ? d.awards : null;
      if(S.awards){
        if(!Array.isArray(S.awards.batches)) delete S.awards.batches;   // 没有 → 交给迁移补
        if(typeof S.awards.activeBatch !== 'string') S.awards.activeBatch = '';
      }
      /* 排序只认分数：综合测评 / 知识水平 / B1~B5。
         键表由奖学金模块通过 K.provide('award.sortKeys') 提供 —— 这里不直接
         引用它的 AWARD_SORT_KEYS，否则 core 就会反向依赖 feature：
         持久化层去认识某个业务模块，是分层倒置的典型症状。

         用 K.has() 而不是直接引用，是因为这是**软依赖**：奖学金模块
         万一没加载，存档照样要能读出来（用兜底键表）。
         这跟 `typeof X !== 'undefined'` 是同一件事，但它是**声明过的**，
         依赖图上看得见，不会被误当成硬依赖。 */
      const _awSortKeys = K.has('award.sortKeys') && K.use('award.sortKeys').length
        ? K.use('award.sortKeys') : ['总成绩','知识水平评价'];
      S.awardSort = (d.awardSort && typeof d.awardSort === 'object')
        ? { key:_awSortKeys.includes(d.awardSort.key) ? d.awardSort.key : '总成绩',
            dir: d.awardSort.dir==='asc' ? 'asc' : 'desc' }
        : { key:'总成绩', dir:'desc' };
      S.awardFilter = typeof d.awardFilter === 'string' ? d.awardFilter : '';
      S.awardShowFinal = !!d.awardShowFinal;
      S.awardQuotaOpen = !!d.awardQuotaOpen;
      S.awardImportLog = Array.isArray(d.awardImportLog) ? d.awardImportLog.slice(0,20) : [];
      // 注意：batches 为空也算「已初始化」→ 返回 true，不会再灌演示数据
      return true;
    }

    /* ② 迁移旧版 v1（只有一份 students）→ 包成第一个批次 */
    const raw1 = localStorage.getItem(STORE_KEY_V1);
    if(raw1){
      const d1 = JSON.parse(raw1);
      const students = Array.isArray(d1.students) ? d1.students : [];
      S.password = d1.password || null;
      S.savedFilters = Array.isArray(d1.savedFilters) ? d1.savedFilters : [];
      S.theme = (d1.theme==='dark' || d1.theme==='eye') ? d1.theme : 'light';
      S.batches = students.length
        ? [makeBatch('初始数据（迁移自旧版）', 'migrate', students, '')]
        : [];
      S.activeBatchId = S.batches[0] ? S.batches[0].id : null;
      S.students = S.batches[0] ? S.batches[0].students : [];
      S.grades = [];          // 旧版没有成绩数据
      invalidateGradeMap();
      save();                 // v1 原样保留不清除，万一 v2 出问题还能回退
      return true;
    }

    return false;             // 从未使用过 → 首次启动
  }catch(e){ return false; }
}

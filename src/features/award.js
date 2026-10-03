/* ======== ⑥ 奖学金评选（v2.x · 2026-10-02 按辅导员实际评选流程重写） ========
   ★ 一条铁律：**一个学生 = 列表里一行**。
     学生报的多个奖项志愿，聚合成这一行的「志愿」格（chip 并列），**不拆成多行** ——
     拆成多行会让同一个人重复出现五六次，根本没法定人选。（这条已经改过一次，别再改回去。）

   数据模型：
     S.awards = { batches:[{id,name,at}], activeBatch,
                  awards:[{id,name,quota,type}],
                  students:[{ id, sid, name, cls, dept, major, grade, batchId, batchName,
                              score:{ 总成绩, 知识水平评价, 科研创新B1 … 共 13 个分项 },
                              vols:[{awardId, volName, order}],
                              draft: awardId|null,     // 点了「拟定」、待复核确认
                              final: [awardId,…] }] }  // 复核确认后写入；单项奖可多个

   奖项两类（辅导员 2026-10-02 确认）：
     type:'general' 综合类 —— 国家奖学金/励志/比亚迪/紫光/优秀学生一二三等：**互斥，一人只能拿一个**
     type:'single'  单项类 —— 文体佳绩/社会实践/社会工作/科研创新：**可兼得**，能叠在综合类之上

   流程：按综合测评（或某个单项分）排序 → 点「拟定」打标记（**人还留在列表里，不消失**）
        → 顶部「复核确认 (N)」批量核对 → 确认后写入 final，
          并从**其他综合类奖项**的候选里剔除（不是删数据，只是不再参与别的评选）。
   排序只认分数：综合测评 / 知识水平 / B1~B5 —— 没有 GPA、没有不及格门数、没有姓名排序。
   单向刷新：用户交互 → 改数据 → save() → renderAward()，渲染函数之间不互调。 */

/* 真实数据的 11 项（2025-2026 本科学生奖学金评选，从「志愿顺序」列拆出来的全集） */
const AWARD_PRESETS = [
  { id:'gj',    name:'国家奖学金',              type:'general' },
  { id:'gzjl',  name:'国家励志奖学金',          type:'general' },
  { id:'byd',   name:'比亚迪奖学金',            type:'general' },
  { id:'zglxj', name:'紫光励学金',              type:'general' },
  { id:'yxxs1', name:'优秀学生奖学金（一等奖）', type:'general' },
  { id:'yxxs2', name:'优秀学生奖学金（二等奖）', type:'general' },
  { id:'yxxs3', name:'优秀学生奖学金（三等奖）', type:'general' },
  { id:'wtjj',  name:'文体佳绩奖学金',          type:'single' },
  { id:'shsj',  name:'社会实践奖学金',          type:'single' },
  { id:'shgz',  name:'社会工作奖学金',          type:'single' },
  { id:'kcyc',  name:'科研创新奖学金',          type:'single' }
];
/* 单项奖 ↔ 它主要看哪一列分（筛到该奖项时自动把排序切到这列） */
const AWARD_SCORE_KEY = {
  kcyc:'科研创新B1', wtjj:'文体特长B3', shsj:'社会实践B5', shgz:'社会工作B4'
};
/* 列表里显示的分数列 —— 综合测评 + 知识水平 + B1~B5（辅导员要的就是这 7 个数） */
const AWARD_SCORE_COLS = [
  { key:'总成绩',       label:'综合测评', tip:'奖学金系统提取的近两学期综合测评总分 —— 排序主依据' },
  { key:'知识水平评价', label:'知识水平', tip:'奖学金系统提取的近两学期成绩，不是辅导员维护的那份成绩单' },
  { key:'科研创新B1',   label:'B1 科研',  tip:'评「科研创新奖学金」主要看这列' },
  { key:'专业技能B2',   label:'B2 专业',  tip:'专业技能分' },
  { key:'文体特长B3',   label:'B3 文体',  tip:'评「文体佳绩奖学金」主要看这列' },
  { key:'社会工作B4',   label:'B4 社工',  tip:'评「社会工作奖学金」主要看这列' },
  { key:'社会实践B5',   label:'B5 实践',  tip:'评「社会实践奖学金」主要看这列' }
];
const AWARD_SORT_KEYS = AWARD_SCORE_COLS.map(c=>c.key);

/* 排序键表通过内核提供给持久化层。
   起因：core/persist.js 读存档时要校验 S.awardSort.key 是否合法，
   而这份键表在本模块 —— 直接引用就是 core → feature 的分层倒置。
   改用能力注册后，core 只知道「award.sortKeys」这个名字。

   ⚠️ 少了这一行不会报错，只会让存档里的非法排序键**静默回退**到「总成绩」，
      表现为「我明明按绩点排的，怎么刷新就变了」。所以它必须在这儿。 */
K.provide('award.sortKeys', AWARD_SORT_KEYS);

const AWARD_BATCH_UNTITLED = '未标注批次';
function awardNameById(id){
  const a = ((S.awards && S.awards.awards) || []).find(x=>x.id===id);
  return a ? a.name : '未识别奖项';
}
function awardById(id){
  return ((S.awards && S.awards.awards) || []).find(x=>x.id===id) || null;
}
function awardTypeOf(id){
  const a = awardById(id);
  return (a && a.type==='single') ? 'single' : 'general';
}

/* ---- 评选批次：一次评选 = 一个批次，批次之间互不串数据 ----
   真实「申报情况」表里本来就有「批次」列（如 2025-2026年本科学生奖学金评选），导入时按它归档；
   页面顶部可切换，切到哪批就看哪批的人。
   ★ 这是奖学金自己的维度，跟工作台主批次（学生名册/成绩单那套）互不相干。 */
function awardRegisterBatch(name){
  if(!S.awards || typeof S.awards!=='object') return AWARD_BATCH_UNTITLED;
  if(!Array.isArray(S.awards.batches)) S.awards.batches = [];
  const nm = String(name==null?'':name).trim() || AWARD_BATCH_UNTITLED;
  const hit = S.awards.batches.find(b=>b.name===nm);
  if(hit) return hit.id;
  const id = 'batch_'+(S.awards.batches.length+1)+'_'+Date.now().toString(36);
  S.awards.batches.push({ id, name:nm, at:Date.now() });
  return id;
}
function awardActiveBatchId(){
  if(!S.awards || typeof S.awards!=='object') return '';
  const bs = S.awards.batches || [];
  if(!bs.length) return '';
  if(!bs.some(b=>b.id===S.awards.activeBatch)) S.awards.activeBatch = bs[bs.length-1].id;
  return S.awards.activeBatch;
}
function setAwardBatch(id){
  if(!S.awards || !Array.isArray(S.awards.batches)) return;
  if(!S.awards.batches.some(b=>b.id===id)) return;
  S.awards.activeBatch = id;
  S.awardFilter = '';          // 换批次顺手清掉奖项筛选
  save();
  renderAward();
}
/* 当前批次的学生行 —— 列表 / 统计 / 导出都只看它 */
function awardScopeStudents(){
  const bid = awardActiveBatchId();
  return ((S.awards && S.awards.students) || []).filter(s=>s.batchId===bid);
}

function ensureAwards(){
  if(!S.awards || typeof S.awards !== 'object'){
    S.awards = { awards: AWARD_PRESETS.map(x=>Object.assign({}, x, {quota:null})), students: [] };
  }
  if(!Array.isArray(S.awards.awards)) S.awards.awards = AWARD_PRESETS.map(x=>Object.assign({}, x, {quota:null}));
  if(!Array.isArray(S.awards.students)) S.awards.students = [];
  AWARD_PRESETS.forEach(p=>{
    if(!S.awards.awards.some(a=>a.id===p.id)) S.awards.awards.push(Object.assign({}, p, {quota:null}));
  });
  migrateAwardBatches();
}
/* 老存档迁移（幂等）：早期是「一志愿一行」的 apps + 扁平 scores，
   这里按学号聚合成「一学生一行」，并把分数并进去 —— 一条都不丢。 */
function migrateAwardBatches(){
  if(!S.awards || typeof S.awards!=='object') return;
  /* ① apps（多行志愿）→ students（一行一人） */
  if(!Array.isArray(S.awards.students) || (Array.isArray(S.awards.apps) && S.awards.apps.length)){
    const rows = Array.isArray(S.awards.apps) ? S.awards.apps : [];
    const flat = Array.isArray(S.awards.scoresFlat) ? S.awards.scoresFlat
               : (S.awards.scores && typeof S.awards.scores==='object') ? S.awards.scores : null;
    const buckets = (S.awards.scoreBuckets && typeof S.awards.scoreBuckets==='object') ? S.awards.scoreBuckets : null;
    const raw = Array.isArray(S.awards.scoreRaw) ? S.awards.scoreRaw : [];
    const map = {};
    rows.forEach(a=>{
      const key = String(a.sid||'');
      if(!key) return;
      if(!map[key]){
        map[key] = { id:a.batchId+'_'+key, sid:key, name:a.name||'', cls:a.cls||'', dept:a.dept||'',
                     major:a.major||'', batchId:a.batchId||'', batchName:a.batchName||a.batch||'',
                     score:{}, vols:[], draft:null, final:[] };
      }
      if(!map[key].vols.some(v=>v.awardId===a.awardId)){
        map[key].vols.push({ awardId:a.awardId, volName:a.volName||a.awardId, order:map[key].vols.length });
      }
    });
    /* 分数：优先按批次桶取，回落老扁平 scores */
    Object.keys(map).forEach(sid=>{
      const stu = map[sid];
      let sc = null;
      if(buckets && buckets[stu.batchId]) sc = buckets[stu.batchId][sid];
      if(sc===null || sc===undefined){ if(flat) sc = flat[sid]; }
      const detail = raw.find(x=>x && String(x.sid)===sid && (!x.batchId || x.batchId===stu.batchId));
      stu.score = Object.assign({}, detail||{});
      if(sc!==null && sc!==undefined && isFinite(Number(sc))) stu.score['总成绩'] = Number(sc);
    });
    S.awards.students = Object.keys(map).map(k=>map[k]);
    delete S.awards.apps;
    delete S.awards.reviews;
    delete S.awards.scores;
    delete S.awards.scoreBuckets;
    delete S.awards.scoreRaw;
  }
  if(!Array.isArray(S.awards.batches)){
    const hasData = (S.awards.students||[]).length || (S.awards.scoreRaw||[]).length || S.awards.scores;
    if(!hasData){
      S.awards.batches = [];
    }else{
      const first = (S.awards.students||[])[0];
      const nm = first ? (first.batchName || '旧数据') : '旧数据';
      const id = 'batch_migrated';
      S.awards.batches = [{ id, name:nm, at:Date.now(), migrated:true }];
      S.awards.students = (S.awards.students||[]).map(s=>Object.assign({}, s, { batchId:id, batchName:nm }));
    }
  }
  if(typeof S.awards.activeBatch !== 'string') S.awards.activeBatch = '';
  S.awards.students.forEach(s=>{
    if(!Array.isArray(s.vols))  s.vols  = [];
    if(!Array.isArray(s.final)) s.final = [];
    if(!s.score || typeof s.score!=='object') s.score = {};
    if(s.draft===undefined) s.draft = null;
  });
}
function findAwardStudent(id){
  return ((S.awards && S.awards.students) || []).find(s=>s.id===id) || null;
}
function scoreVal(stu, key){
  if(!stu || !stu.score) return null;
  const v = stu.score[key];
  if(v===null || v===undefined || v==='') return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}
/* 这个学生还能不能参与这个奖项：
   单项奖可兼得（只查是否已拿过同一个）；综合类互斥（拿过任何综合类就不能再参评别的综合类）。 */
function studentLockedOut(stu, awardId){
  if(!stu) return true;
  const fin = stu.final || [];
  if(fin.indexOf(awardId)>=0) return true;
  if(awardTypeOf(awardId)==='single') return false;
  return fin.some(id=>awardTypeOf(id)==='general');
}
/* 某个奖项的候选：报了这个志愿 + 还没被别家定走 */
function awardCandidates(awardId){
  const bid = awardActiveBatchId();
  return ((S.awards && S.awards.students) || []).filter(s=>
    s.batchId===bid && (s.vols||[]).some(v=>v.awardId===awardId) && !studentLockedOut(s, awardId));
}
/* 已定/已拟定的统计 */
function awardQuotaStat(awardId){
  const bid = awardActiveBatchId();
  const a = awardById(awardId);
  const scope = ((S.awards && S.awards.students) || []).filter(s=>s.batchId===bid);
  const q = (a && typeof a.quota === 'number' && isFinite(a.quota) && a.quota >= 0) ? a.quota : null;
  return {
    quota: q,                        // null = 不限；0 = 这个奖项今年没有名额
    final: scope.filter(s=>(s.final||[]).indexOf(awardId)>=0).length,
    draft: scope.filter(s=>s.draft===awardId).length,
    cand : awardCandidates(awardId).length
  };
}
function gotoAward(){
  ensureAwards();
  S.view = 'award';
  renderSidebar();
  renderMain();
  closeSidebar();
}
function setAwardSort(key){
  if(AWARD_SORT_KEYS.indexOf(key)<0) return;
  if(S.awardSort.key===key){
    S.awardSort.dir = S.awardSort.dir==='asc' ? 'desc' : 'asc';
  }else{
    S.awardSort.key = key;
    S.awardSort.dir = 'desc';
  }
  save();
  renderAward();
}
/* 筛到某个奖项时，自动把排序切到它该看的那列（单项奖 → 对应 B 列，综合类 → 综合测评） */
function setAwardFilter(id){
  S.awardFilter = id || '';
  if(id){
    const want = AWARD_SCORE_KEY[id] || '总成绩';
    if(S.awardSort.key !== want){ S.awardSort.key = want; S.awardSort.dir = 'desc'; }
  }
  save();
  renderAward();
}
function setAwardQuota(id, val){
  const a = awardById(id);
  if(!a) return;
  const raw = String(val==null?'':val).trim();
  /* 空 = 不限；0 是合法值（这个奖项今年没有名额），别再当成"未设" */
  if(raw === ''){ a.quota = null; }
  else{
    const n = parseInt(raw, 10);
    a.quota = (isFinite(n) && n >= 0) ? n : null;
  }
  save();
  renderAward();
}
function toggleAwardShowFinal(){
  S.awardShowFinal = !S.awardShowFinal;
  save();
  renderAward();
}
function toggleAwardQuota(){
  S.awardQuotaOpen = !S.awardQuotaOpen;
  save();
  renderAward();
}
/* 名额批量区：一次把所有奖项的名额清掉 */
/* 全部清空名额要二次确认 —— 上个版本它和「收起」挨得太近，一不小心就点掉了 */
function askClearAllQuotas(){
  const n = ((S.awards && S.awards.awards) || []).filter(a=>a.quota!==null && a.quota!==undefined).length;
  if(!n){ toast('现在所有奖项都没设名额'); return; }
  askConfirm({
    title:'清空全部名额', danger:true, okText:'确认清空',
    html:`将把 <b>${n}</b> 个奖项的名额全部清空（恢复成"不限"）。<br>
          <span style="font-size:12.5px;color:var(--text-3)">已经确定的人选不受影响，只是去掉名额上限。</span>`,
    onOk(){ clearAllQuotas(); }
  });
}
function clearAllQuotas(){
  (S.awards.awards||[]).forEach(a=>{ a.quota = null; });
  save();
  renderAward();
  toast('已清空所有奖项的名额');
}
/* ---- 拟定 / 复核确认：先打标记，人还留在列表里；批量确认后才真正定下来 ---- */
function draftAward(stuId, awardId){
  const stu = findAwardStudent(stuId);
  if(!stu){ toast('找不到这个学生'); return; }
  if(studentLockedOut(stu, awardId)){
    const got = (stu.final||[]).map(awardNameById).join('、');
    showNotice('不能再拟定这个奖项',
      `<b>${esc(stu.name)}</b> 已经确定获得「<b>${esc(got)}</b>」。<br>
       除单项奖学金外，各奖项<b>不兼得</b> —— 他已经不参与其他综合类奖项的评选了。`);
    return;
  }
  stu.draft = awardId;
  save();
  closeModal();
  renderAward();
  toast(`已标记「${awardNameById(awardId)}」—— 待复核确认`);
}
function cancelDraft(stuId){
  const stu = findAwardStudent(stuId);
  if(!stu) return;
  stu.draft = null;
  save();
  renderAward();
}
function clearAllDrafts(){
  const list = awardScopeStudents().filter(s=>s.draft);
  if(!list.length) return;
  list.forEach(s=>{ s.draft = null; });
  save();
  renderAward();
  toast(`已取消 ${list.length} 条拟定标记`);
}
function confirmDrafts(){
  const list = awardScopeStudents().filter(s=>s.draft);
  if(!list.length){ toast('还没有待确认的拟定'); return; }
  const rows = list.map(s=>{
    const a = awardById(s.draft);
    const over = (a && typeof a.quota==='number' && a.quota>0)
      ? awardQuotaStat(s.draft).final + awardQuotaStat(s.draft).draft > a.quota : false;
    return `<tr>
      <td><b>${esc(s.name)}</b></td>
      <td><span class="sid">${esc(s.sid)}</span></td>
      <td>${esc(s.major||'')}</td>
      <td>${esc(a?a.name:s.draft)}</td>
      <td>${scoreVal(s,'总成绩')===null?'—':scoreVal(s,'总成绩').toFixed(2)}</td>
      <td>${over?'<span style="color:var(--danger);font-weight:650">超出名额</span>':''}</td>
    </tr>`;
  }).join('');
  askConfirm({
    title:`复核确认（${list.length} 人）`, okText:'确认并转入拟定名单',
    html:`<div style="font-size:13px;color:var(--text-2);margin-bottom:10px">
        确认后这些人<b>正式进入拟定名单</b>，并从其他综合类奖项的候选里剔除（单项奖学金不受影响）。</div>
      <div style="max-height:300px;overflow:auto"><table class="tbl" style="font-size:12.5px">
        <thead><tr><th>姓名</th><th>学号</th><th>班级</th><th>拟定奖项</th><th>综合测评</th><th></th></tr></thead>
        <tbody>${rows}</tbody></table></div>`,
    onOk(){
      list.forEach(s=>{
        if(s.draft && (s.final||[]).indexOf(s.draft)<0) s.final.push(s.draft);
        s.draft = null;
      });
      save();
      renderAward();
      toast(`已确认 ${list.length} 人，转入拟定名单`);
    }
  });
}
function undoFinal(stuId, awardId){
  const stu = findAwardStudent(stuId);
  if(!stu) return;
  stu.final = (stu.final||[]).filter(x=>x!==awardId);
  save();
  renderAward();
  toast(`已撤销「${awardNameById(awardId)}」`);
}
/* ---- 批量拟定：勾选多人 → 一次性打拟定标记 ----
   勾选状态是**界面选择**，不写进存档（换页/刷新就没了，避免误以为已经定下来）。
   打完标记照样要走顶部「复核确认」，跟单人拟定是同一条流程。 */
let _awardPick = [];   // 勾中的学生 id
let _awardRows = [];   // 当前列表渲染出来的行（供「全选」用）
function awardPickedList(){
  return _awardPick.map(id=>findAwardStudent(id)).filter(Boolean);
}
function awardTogglePick(id, on){
  const i = _awardPick.indexOf(id);
  if(on && i<0) _awardPick.push(id);
  if(!on && i>=0) _awardPick.splice(i,1);
  renderAward();
}
function awardToggleAll(on){
  _awardPick = on ? _awardRows.map(s=>s.id) : [];
  renderAward();
}
function awardClearPick(){
  _awardPick = [];
  renderAward();
}
function openBatchDraft(){
  const list = awardPickedList();
  if(!list.length){ toast('先勾选学生'); return; }
  /* 列出这批人报过的奖项（并集），每个奖项标出"能拟定的有几人" */
  const tally = {};
  list.forEach(s=>{
    (s.vols||[]).forEach(v=>{
      tally[v.awardId] = tally[v.awardId] || { ok:0, skip:0 };
      if(studentLockedOut(s, v.awardId)) tally[v.awardId].skip++ ;
      else tally[v.awardId].ok++ ;
    });
  });
  const ids = Object.keys(tally);
  if(!ids.length){
    showNotice('这些人没有申报奖项', '勾选的学生里没有人报过任何奖项志愿，没法拟定。');
    return;
  }
  $('modalRoot').innerHTML = `
  <div class="mask" onclick="if(event.target===this)closeModal()">
    <div class="modal" onclick="event.stopPropagation()" style="max-width:460px">
      <div class="modal-head"><div class="modal-title">批量拟定（已勾 ${list.length} 人）</div>
        <div class="modal-close" onclick="closeModal()">×</div></div>
      <div class="modal-body">
        <div style="font-size:12.5px;color:var(--text-3);margin-bottom:10px">
          选一个奖项，一次性给勾选的人打上拟定标记。已定了其他奖项的人会<b>自动跳过</b>（除单项奖学金外不兼得）。
        </div>
        ${ids.map(aid=>{
          const t = tally[aid];
          const noOne = t.ok===0;
          return `<button class="btn" style="width:100%;justify-content:flex-start;margin-bottom:7px;${noOne?'opacity:.45':''}"
            ${noOne?'disabled':''} onclick="batchDraftAward('${aid}')">
            ${esc(awardNameById(aid))}
            <span class="muted" style="font-size:12px;margin-left:6px">可拟定 ${t.ok} 人${t.skip?` · 跳过 ${t.skip}`:''}</span>
            ${awardTypeOf(aid)==='single'?'<span class="muted" style="font-size:11.5px;margin-left:4px">（单项，可兼得）</span>':''}
          </button>`;
        }).join('')}
      </div>
      <div class="modal-foot">
        <button class="btn" onclick="awardClearPick()">清空勾选</button>
        <button class="btn" onclick="closeModal()">取消</button>
      </div>
    </div>
  </div>`;
}
function batchDraftAward(awardId){
  const list = awardPickedList();
  if(!list.length){ toast('先勾选学生'); return; }
  let ok=0, skip=0;
  list.forEach(s=>{
    if(studentLockedOut(s, awardId)){ skip++ ; return; }
    s.draft = awardId; ok++ ;
  });
  _awardPick = [];
  save();
  closeModal();
  renderAward();
  toast(`已拟定 ${ok} 人 → 「${awardNameById(awardId)}」${skip?`，跳过 ${skip} 人（已定其他奖项）`:''} —— 到顶部复核确认`);
}
/* 拟定弹层：列出这个学生报的所有志愿，选一个 */
function openDraftPicker(stuId){
  const stu = findAwardStudent(stuId);
  if(!stu){ toast('找不到这个学生'); return; }
  const vols = (stu.vols||[]).slice().sort((a,b)=>(a.order||0)-(b.order||0));
  if(!vols.length){
    showNotice('没有可拟定的奖项', `<b>${esc(stu.name)}</b> 没有申报任何奖项志愿。`);
    return;
  }
  $('modalRoot').innerHTML = `
  <div class="mask" onclick="if(event.target===this)closeModal()">
    <div class="modal" onclick="event.stopPropagation()" style="max-width:430px">
      <div class="modal-head"><div class="modal-title">拟定奖项 · ${esc(stu.name)}</div>
        <div class="modal-close" onclick="closeModal()">×</div></div>
      <div class="modal-body">
        <div style="font-size:12.5px;color:var(--text-3);margin-bottom:10px">
          学号 ${esc(stu.sid)}　综合测评 ${scoreVal(stu,'总成绩')===null?'—':scoreVal(stu,'总成绩').toFixed(2)}
        </div>
        ${vols.map(v=>{
          const locked = studentLockedOut(stu, v.awardId);
          const st = awardQuotaStat(v.awardId);
          const quotaTxt = st.quota===null ? '名额不限' : `名额 ${st.quota}（已定 ${st.final}）`;
          return `<button class="btn" style="width:100%;justify-content:flex-start;margin-bottom:7px;${locked?'opacity:.45':''}"
            ${locked?'disabled':''}
            onclick="draftAward('${stu.id}','${v.awardId}')">
            ${esc(awardNameById(v.awardId))}
            <span class="muted" style="font-size:12px;margin-left:6px">第${(v.order||0)+1}志愿 · ${quotaTxt}</span>
            ${awardTypeOf(v.awardId)==='single'?'<span class="muted" style="font-size:11.5px;margin-left:4px">（单项，可兼得）</span>':''}
          </button>`;
        }).join('')}
        <div style="font-size:12px;color:var(--text-3);margin-top:8px">
          点一下只是<b>打标记</b>，人还留在列表里；到顶部「复核确认」统一核对后才生效。</div>
      </div>
      <div class="modal-foot"><button class="btn" onclick="closeModal()">取消</button></div>
    </div>
  </div>`;
}
/* 学生详情：志愿 + 全部分项 + 拟定状态 */
function openStudentDetail(stuId){
  const stu = findAwardStudent(stuId);
  if(!stu){ toast('找不到这个学生'); return; }
  const parts = Object.keys(stu.score||{}).filter(k=>k!=='sid'&&k!=='batchId');
  const vols = (stu.vols||[]).slice().sort((a,b)=>(a.order||0)-(b.order||0));
  $('modalRoot').innerHTML = `
  <div class="mask" onclick="if(event.target===this)closeModal()">
    <div class="modal" onclick="event.stopPropagation()" style="max-width:520px">
      <div class="modal-head"><div class="modal-title">${esc(stu.name)} · ${esc(stu.sid)}</div>
        <div class="modal-close" onclick="closeModal()">×</div></div>
      <div class="modal-body">
        <div style="font-size:12.5px;color:var(--text-3);margin-bottom:12px">
          ${esc(stu.major||'')}${stu.cls?' · '+esc(stu.cls):''}${stu.grade?' · '+esc(stu.grade):''}
        </div>
        <div style="margin-bottom:14px">
          <div style="font-weight:650;margin-bottom:6px">申报志愿（${vols.length} 个）</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            ${vols.length ? vols.map(v=>`<span class="pchip ${awardTypeOf(v.awardId)==='single'?'':'on'}">${esc(awardNameById(v.awardId))}<span class="muted" style="font-size:11px;margin-left:4px">${(v.order||0)+1}</span></span>`).join('') : '<span class="muted">无</span>'}
          </div>
        </div>
        <div style="margin-bottom:14px">
          <div style="font-weight:650;margin-bottom:6px">当前状态</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            ${(stu.final||[]).length ? stu.final.map(id=>`<span class="pchip on">已定：${esc(awardNameById(id))}</span>`).join('') : '<span class="muted">未定</span>'}
            ${stu.draft ? `<span class="pchip" style="border-color:var(--warn-line,#e0a800)">拟定中：${esc(awardNameById(stu.draft))}（待复核）</span>` : ''}
          </div>
        </div>
        <div>
          <div style="font-weight:650;margin-bottom:6px">综合测评分项
            <span class="muted" style="font-weight:400;font-size:12px">（系统提取的近两学期成绩，辅导员只导入不维护）</span></div>
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            ${parts.length ? parts.map(k=>`<span class="pchip">${esc(k)} <b>${esc(stu.score[k])}</b></span>`).join('') : '<span class="muted">还没导入审核表，没有分数</span>'}
          </div>
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn" onclick="closeModal()">关闭</button>
        <button class="btn pri" onclick="closeModal();openDraftPicker('${stu.id}')">拟定奖项</button>
      </div>
    </div>
  </div>`;
}

/* ---- 渲染 ---- */
function renderAward(){
  ensureAwards();
  const bid     = awardActiveBatchId();
  const batches = S.awards.batches || [];
  const bName   = (batches.find(b => b.id === bid) || {}).name || '';
  const scope   = awardScopeStudents();
  const awards  = S.awards.awards || [];
  const filter  = S.awardFilter || '';
  const sortKey = S.awardSort.key, sortDir = S.awardSort.dir;
  const showFin = !!S.awardShowFinal;
  const lastImp = (S.awardImportLog || [])[0];

  /* 列表行：筛到某奖项 → 该奖项候选；否则 → 本批全体 */
  let rows = filter ? awardCandidates(filter) : scope.slice();
  if(!showFin) rows = rows.filter(s => !(s.final || []).length);
  rows = rows.slice().sort((a, b) => {
    let va = scoreVal(a, sortKey), vb = scoreVal(b, sortKey);
    if(va === null && vb === null) return 0;
    if(va === null) return 1;
    if(vb === null) return -1;
    return (va - vb) * (sortDir === 'asc' ? 1 : -1);
  });

  /* 批量拟定用的"当前列表"；顺手把勾选里已经不在列表中的人剔掉（换了筛选/批次） */
  _awardRows = rows;
  const _rowIds = new Set(rows.map(s => s.id));
  if(_awardPick.some(id => !_rowIds.has(id))) _awardPick = _awardPick.filter(id => _rowIds.has(id));

  const drafts = awardScopeStudents().filter(s => s.draft);
  const finals = scope.filter(s => (s.final || []).length);
  const general = awards.filter(a => awardTypeOf(a.id) === 'general');
  const singles = awards.filter(a => awardTypeOf(a.id) === 'single');
  const fStat   = filter ? awardQuotaStat(filter) : null;
  const fName   = filter ? awardNameById(filter) : '';
  const totalFinal = finals.reduce((n, s) => n + (s.final || []).length, 0);

  /* chip 上的名额进度（0/不限 两种情况样式不同） */
  const quotaChip = a => {
    const st = awardQuotaStat(a.id);
    const hasQ = st.quota !== null;
    const pct = hasQ && st.quota > 0 ? Math.min(100, Math.round(st.final / st.quota * 100)) : (st.final > 0 ? 100 : 0);
    const over = hasQ && st.final > st.quota;
    return `<span class="aw-q">
      <span class="aw-q-n">${st.final}${hasQ ? ' / ' + st.quota : ''}</span>
      <span class="aw-q-bar"><i style="width:${pct}%;${over ? 'background:var(--danger)' : ''}"></i></span>
    </span>`;
  };

  $('mainArea').innerHTML = `
  <div class="u-head">
    <div class="u-head-main">
      <div class="u-title">奖学金评选</div>
      <div class="u-sub">${bid ? esc(bName) : '还没有评选批次'} · 共 ${scope.length} 人 · 一个学生一行，按综合测评或单项分排序</div>
    </div>
    <div class="u-head-actions">
      <select class="u-input" style="width:auto;min-width:180px" onchange="setAwardBatch(this.value)"
              title="评选批次——各批次数据互不串，切到哪批就看哪批">
        ${batches.length ? batches.map(b =>
          `<option value="${b.id}" ${b.id === bid ? 'selected' : ''}>${b.migrated ? '（旧数据）' : ''}${esc(b.name)} · ${((S.awards.students) || []).filter(x => x.batchId === b.id).length} 人</option>`
        ).join('') : '<option value="">还没有评选批次</option>'}
      </select>
      <button class="u-btn u-btn-primary" onclick="openAwardsImporter('apps')">＋ 导入申报情况</button>
      <button class="u-btn" onclick="openAwardsImporter('reviews')">导入综合测评分数</button>
      <button class="u-btn" onclick="exportAwardsXlsx()" ${finals.length || scope.length ? '' : 'disabled'}>导出拟定名单</button>
    </div>
  </div>

  <!-- 评选进度：一眼看到"定了多少 / 还差多少" -->
  <div class="u-card">
    <div class="u-card-body aw-prog">
      <div class="aw-prog-item">
        <span class="aw-prog-n">${finals.length}</span>
        <span class="aw-prog-l">已定人选</span>
      </div>
      <div class="aw-prog-item">
        <span class="aw-prog-n" style="color:${drafts.length ? 'var(--brand)' : 'inherit'}">${drafts.length}</span>
        <span class="aw-prog-l">待复核</span>
      </div>
      <div class="aw-prog-item">
        <span class="aw-prog-n">${totalFinal}</span>
        <span class="aw-prog-l">已授予奖项数</span>
      </div>
      <div class="aw-prog-item aw-prog-grow">
        <div class="aw-prog-track" title="已定人数占候选人数的比例">
          <i style="width:${scope.length ? Math.min(100, Math.round(finals.length / scope.length * 100)) : 0}%"></i>
        </div>
        <span class="u-hint-quiet">评选进度</span>
      </div>
      <button class="u-btn u-btn-ghost u-btn-sm" style="color:var(--danger)" onclick="askClearAwards()">清空本批</button>
    </div>
  </div>

  ${drafts.length ? `
  <!-- 待复核：这是当前唯一"卡住流程"的事，所以给它最醒目的位置 -->
  <div class="u-note u-note-warn aw-draft-bar">
    <b>${drafts.length} 人待复核</b>
    <span>已打拟定标记，核对无误后一次性生效；生效后这些人不再参与其他综合类奖项</span>
    <div class="u-note-act">
      <button class="u-btn u-btn-sm" onclick="openDraftReview()">查看清单</button>
      <button class="u-btn u-btn-sm" onclick="clearAllDrafts()">全部取消</button>
      <button class="u-btn u-btn-sm u-btn-primary" onclick="confirmDrafts()">复核确认</button>
    </div>
  </div>` : ''}

  <!-- 奖项筛选：综合类与单项类分开，因为兼得规则不同，混在一起容易点错 -->
  <div class="u-card">
    <div class="u-card-body aw-awards">
      <div class="aw-group">
        <div class="aw-group-t">
          综合类 <span class="u-hint-quiet">不兼得 · 一人只能拿一个</span>
        </div>
        <div class="aw-chips">
          <button class="u-chip ${!filter ? 'u-chip-on' : ''}" onclick="setAwardFilter('')">全部 · ${scope.length} 人</button>
          ${general.map(a => `
            <button class="u-chip ${filter === a.id ? 'u-chip-on' : ''}" onclick="setAwardFilter('${a.id}')"
                    title="候选 ${awardQuotaStat(a.id).cand} 人">${esc(a.name)} · ${awardQuotaStat(a.id).cand}${quotaChip(a)}</button>
          `).join('')}
        </div>
      </div>
      <div class="aw-group">
        <div class="aw-group-t">
          单项类 <span class="u-hint-quiet">可兼得 · 能叠在综合类之上</span>
          <button class="u-btn u-btn-sm u-btn-ghost" style="margin-left:auto" onclick="toggleAwardQuota()">
            ${S.awardQuotaOpen ? '收起名额 ▲' : '名额设置'}${awards.filter(a => a.quota !== null && a.quota !== undefined).length ? `（已设 ${awards.filter(a => a.quota !== null && a.quota !== undefined).length}）` : ''}
          </button>
        </div>
        <div class="aw-chips">
          ${singles.map(a => `
            <button class="u-chip ${filter === a.id ? 'u-chip-on' : ''}" onclick="setAwardFilter('${a.id}')"
                    title="候选 ${awardQuotaStat(a.id).cand} 人">${esc(a.name)} · ${awardQuotaStat(a.id).cand}${quotaChip(a)}</button>
          `).join('')}
        </div>
      </div>

      ${S.awardQuotaOpen ? `
      <!-- 名额统一录入：清空在左、收起在右，隔得远；清空还要二次确认 -->
      <div class="aw-quota">
        <div class="aw-quota-t">
          <span>名额设置</span>
          <span class="u-hint-quiet">留空 = 不限；填 0 = 这个奖项今年没有名额</span>
          <button class="u-btn u-btn-sm u-btn-danger" style="margin-left:auto" onclick="askClearAllQuotas()">全部清空</button>
          <button class="u-btn u-btn-sm" onclick="toggleAwardQuota()">收起 ▲</button>
        </div>
        <div class="aw-qgrid">
          ${awards.map(a => {
            const st = awardQuotaStat(a.id);
            const hasQ = st.quota !== null;
            const over = hasQ && st.final > st.quota;
            return `<label class="aw-qcell">
              <span class="aw-qcell-n">${esc(a.name)}<i>${awardTypeOf(a.id) === 'single' ? '单项' : '综合'}</i></span>
              <span class="aw-qcell-m">候选 ${st.cand} · 已定 <b style="${over ? 'color:var(--danger)' : ''}">${st.final}${hasQ ? ' / ' + st.quota : ''}</b>${over ? ' 超额' : ''}</span>
              <input class="u-input u-input-sm" type="number" min="0" step="1" value="${hasQ ? st.quota : ''}" placeholder="不限"
                     onchange="setAwardQuota('${a.id}', this.value)">
            </label>`;
          }).join('')}
        </div>
      </div>` : ''}
    </div>
  </div>

  <!-- 列表 -->
  <div class="u-card">
    <div class="u-toolbar">
      <span class="u-toolbar-count">
        ${filter ? `拟评「${esc(fName)}」· ` : ''}${rows.length} 人
        ${filter && fStat ? `· 已定 ${fStat.final}${fStat.quota !== null ? ' / 名额 ' + fStat.quota : ' / 名额不限'}` : ''}
      </span>
      <div class="u-toolbar-right">
        <label class="u-check">
          <input type="checkbox" ${showFin ? 'checked' : ''} onchange="toggleAwardShowFinal()"> 显示已定学生
        </label>
        <span class="u-hint-quiet">点分数列名可排序</span>
      </div>
    </div>
    ${renderAwardTable(rows, sortKey, sortDir)}
  </div>

  ${finals.length ? `
  <!-- 拟定名单：按奖项分组，× 撤销 -->
  <div class="u-card">
    <div class="u-card-head">
      <span class="u-card-title">拟定名单</span>
      <span class="u-card-sub">${finals.length} 人 · ${totalFinal} 项</span>
    </div>
    <div class="u-card-body">
      ${awards.map(a => {
        const got = finals.filter(s => (s.final || []).indexOf(a.id) >= 0);
        if(!got.length) return '';
        const st = awardQuotaStat(a.id);
        const hasQ = st.quota !== null;
        const over = hasQ && got.length > st.quota;
        return `<div class="aw-final">
          <div class="aw-final-t">
            <span>${esc(a.name)}</span>
            <span class="u-hint-quiet">${got.length}${hasQ ? ' / 名额 ' + st.quota : ''}${over ? ' · 超额' : ''}</span>
          </div>
          <div class="aw-final-list">
            ${got.slice().sort((x, y) => (scoreVal(y, '总成绩') || 0) - (scoreVal(x, '总成绩') || 0)).map(s =>
              `<span class="u-chip u-chip-static u-chip-on">
                ${esc(s.name)}
                <i class="aw-final-score">${scoreVal(s, '总成绩') === null ? '' : scoreVal(s, '总成绩').toFixed(2)}</i>
                <a class="aw-x" onclick="undoFinal('${s.id}','${a.id}')" title="撤销">×</a>
              </span>`).join('')}
          </div>
        </div>`;
      }).join('')}
    </div>
  </div>` : ''}

  ${_awardPick.length ? `
  <!-- 勾选后的批量操作浮条：贴着底部，不用回头去工具栏找 -->
  <div class="aw-float">
    <span>已勾 <b>${_awardPick.length}</b> 人</span>
    <button class="u-btn u-btn-sm" onclick="awardClearPick()">取消勾选</button>
    <button class="u-btn u-btn-sm u-btn-primary" onclick="openBatchDraft()">批量拟定</button>
  </div>` : ''}`;
}

/* ---------- 表头拖拽调列顺序 ----------
   可拖：学号 / 姓名 / 专业 / 7 个分数列
   锁定：勾选框 · # · 操作 · 志愿（这几列位置固定，拖了反而难用）
   顺序存在 S.awardCols（跟学生列表的 S.listCols 一个套路），刷新/重启都还在。 */
let _awardColFrom = null;   // 拖动源（列 key）
let _awardColTo = null;     // 插入位置高亮
function awardDraggableKeys(){
  return ['sid', 'name', 'major'].concat(AWARD_SCORE_COLS.map(c => c.key));
}
function awardColLabel(k){
  if(k === 'sid') return '学号';
  if(k === 'name') return '姓名';
  if(k === 'major') return '专业';
  const c = AWARD_SCORE_COLS.find(x => x.key === k);
  return c ? c.label : k;
}
function awardColTip(k){
  if(k === 'sid') return '学生学号';
  if(k === 'name') return '姓名与拟定状态';
  if(k === 'major') return '所学专业';
  const c = AWARD_SCORE_COLS.find(x => x.key === k);
  return c ? c.tip : '';
}
function awardOrderCols(){
  const keys = awardDraggableKeys();
  const saved = (S.awards && Array.isArray(S.awardCols)) ? S.awardCols : null;
  if(!saved || !saved.length) return keys;
  const valid = saved.filter(k => keys.indexOf(k) >= 0);
  return valid.concat(keys.filter(k => valid.indexOf(k) < 0));   // 新增分数列自动补到末尾
}
function awardColTh(k, sortKey, arrow){
  const isNum = AWARD_SCORE_COLS.some(c => c.key === k);
  const hot = sortKey === k;
  const cls = isNum ? 'u-th-sort aw-c-num' : (k === 'major' ? 'aw-c-major' : (k === 'name' ? 'aw-c-name' : ''));
  const drop = _awardColTo === k ? ' aw-c-drop' : '';
  return `<th class="${cls}${drop}${_awardColFrom === k ? ' aw-c-drag' : ''}"
    draggable="true"
    ondragstart="awardColDragStart(event,'${k}')"
    ondragover="awardColDragOver(event,'${k}')"
    ondrop="awardColDrop(event,'${k}')"
    ondragend="awardColDragEnd()"
    title="${esc(awardColTip(k))}${isNum ? ' · 点列名排序' : ''} · 按住拖动可调位置">
    ${esc(awardColLabel(k))}${isNum ? ' ' + arrow(k) : ''}
    ${hot ? '<i class="aw-c-sortdot"></i>' : ''}
  </th>`;
}
function awardColDragStart(ev, k){
  _awardColFrom = k;
  if(ev && ev.dataTransfer){ ev.dataTransfer.effectAllowed = 'move'; try{ ev.dataTransfer.setData('text/plain', k); }catch(e){} }
  renderAward();
}
function awardColDragOver(ev, k){
  if(ev) ev.preventDefault();
  if(ev && ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
  if(_awardColTo !== k){ _awardColTo = k; renderAward(); }
}
function awardColDragEnd(){ _awardColFrom = null; _awardColTo = null; renderAward(); }
function awardColDrop(ev, k){
  if(ev) ev.preventDefault();
  const from = _awardColFrom;
  _awardColFrom = null; _awardColTo = null;
  if(!from || from === k) { renderAward(); return; }
  ensureAwards();
  const arr = awardOrderCols().slice();
  const a = arr.indexOf(from), b = arr.indexOf(k);
  if(a < 0 || b < 0){ renderAward(); return; }
  arr.splice(a, 1);
  arr.splice(arr.indexOf(k), 0, from);
  S.awardCols = arr;          // 存进奖学金自己的存档，跟着批次隔离
  save();
  renderAward();
  toast(`「${awardColLabel(from)}」移到「${awardColLabel(k)}」前面`);
}
function resetAwardCols(){
  ensureAwards();
  S.awardCols = null;
  save();
  renderAward();
  toast('列顺序已恢复默认');
}

/* 表格：分数右对齐 + 等宽数字，扫一行就能比大小 */
function renderAwardTable(rows, sortKey, sortDir){
  if(!rows.length){
    return `<div class="u-empty">
      <div class="u-empty-ico">🏆</div>
      <div class="u-empty-t">还没有可评的人</div>
      <div class="u-empty-d">
        先导入「申报情况」：智慧学工 → 奖学金 → 志愿申报情况 → 导出 → 自定义导出 → 字段全选。<br>
        一个学生就是一行，他报的多个奖项会并列显示在「志愿」格里。
      </div>
    </div>`;
  }
  const arrow = k => sortKey === k ? (sortDir === 'asc' ? '▲' : '▼') : '';
  const allOn = rows.length > 0 && rows.every(s => _awardPick.indexOf(s.id) >= 0);
  return `<div class="u-table-wrap">
    <table class="u-table aw-tbl">
    <thead><tr>
      <th class="aw-c-check"><input type="checkbox" ${allOn ? 'checked' : ''} onchange="awardToggleAll(this.checked)" title="全选/取消全选"></th>
      <th class="aw-c-idx">#</th>
      ${awardOrderCols().map(k => awardColTh(k, sortKey, arrow)).join('')}
      <th class="aw-c-act">操作</th>
      <th class="aw-c-vol">志愿</th>
    </tr></thead>
    <tbody>
      ${rows.map((s, i) => {
        const vols = (s.vols || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
        const fin = s.final || [];
        return `<tr${s.draft ? ' class="award-row-draft"' : ''}>
          <td><input type="checkbox" ${_awardPick.indexOf(s.id) >= 0 ? 'checked' : ''} onchange="awardTogglePick('${s.id}', this.checked)"></td>
          <td class="aw-c-idx">${i + 1}</td>
          ${awardOrderCols().map(k => {
            if(k === 'name') return `<td class="aw-c-name">
              <b>${esc(s.name)}</b>
              ${fin.length ? `<span class="u-tag u-tag-ok">${fin.length > 1 ? '已定 ' + fin.length + ' 项' : '已定 ' + esc(awardNameById(fin[0]))}</span>` : ''}
              ${s.draft ? `<span class="u-tag u-tag-warn">拟定 ${esc(awardNameById(s.draft))}</span>` : ''}
            </td>`;
            if(k === 'major') return `<td class="aw-c-major">${esc(s.major || '')}</td>`;
            if(k === 'sid')   return `<td><span class="sid">${esc(s.sid)}</span></td>`;
            const v = scoreVal(s, k);
            return `<td class="aw-c-num${sortKey === k ? ' aw-c-hot' : ''}">${v === null ? '<span class="u-hint-quiet">—</span>' : v.toFixed(2)}</td>`;
          }).join('')}
          <td class="aw-c-act">
            ${s.draft
              ? `<button class="u-btn u-btn-sm" onclick="cancelDraft('${s.id}')">取消拟定</button>`
              : `<button class="u-btn u-btn-sm" onclick="openDraftPicker('${s.id}')">拟定</button>`}
            <button class="u-btn u-btn-sm u-btn-ghost" onclick="openStudentDetail('${s.id}')">详情</button>
          </td>
          <td class="aw-c-vol">${vols.length ? vols.map(v =>
            `<span class="u-chip u-chip-static aw-vol" title="第 ${(v.order || 0) + 1} 志愿">${esc(awardNameById(v.awardId))}${awardTypeOf(v.awardId) === 'single' ? '<i>单</i>' : ''}</span>`
          ).join('') : '<span class="u-hint-quiet" title="综合测评表里有这个人，但他没申报任何奖项">未申报</span>'}</td>
        </tr>`;
      }).join('')}
    </tbody>
    </table>
  </div>`;
}

function askClearAwards(){
  ensureAwards();
  const bid = awardActiveBatchId();
  const bName = ((S.awards.batches||[]).find(b=>b.id===bid)||{}).name || '当前批次';
  const inBatch = ((S.awards.students)||[]).filter(s=>s.batchId===bid).length;
  const allN = ((S.awards.students)||[]).length;
  const multi = (S.awards.batches||[]).length > 1;
  askConfirm({
    title:'清空奖学金评选数据', danger:true, okText:'清空',
    html:`将删除「<b>${esc(bName)}</b>」的申报记录与拟定结果（${inBatch} 人），<b>不可恢复</b>。建议先「导出拟定名单」备份。`
       + (multi ? `<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--line)">
            <label style="display:flex;align-items:center;gap:7px;font-size:13px;color:var(--text-2);cursor:pointer">
            <input type="checkbox" id="clearAllBatches"> 连其他评选批次一起清空（共 ${allN} 人）</label>
            <div style="font-size:12.5px;color:var(--text-3);margin-top:6px">勾选=只留奖项字典，全部批次都删；不勾=只删「${esc(bName)}」这一批。</div></div>` : ''),
    onOk(){
      const cb = document.getElementById('clearAllBatches');
      const all = multi && cb && cb.checked;
      if(all){
        S.awards = { awards: AWARD_PRESETS.map(x=>Object.assign({}, x, {quota:null})), students: [] };
      }else{
        S.awards.students = ((S.awards.students)||[]).filter(s=>s.batchId!==bid);
        S.awards.batches  = ((S.awards.batches)||[]).filter(b=>b.id!==bid);
        if(!(S.awards.batches||[]).length){
          S.awards = { awards: AWARD_PRESETS.map(x=>Object.assign({}, x, {quota:null})), students: [] };
        }
        S.awards.activeBatch = '';
      }
      S.awardFilter = '';
      save();
      renderAward();
      toast(all ? '已清空全部评选批次' : `已清空「${bName}」`);
    }
  });
}

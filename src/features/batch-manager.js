/* ---------- 批次管理 ---------- */
function openBatchManager(){
  const activeId = S.activeBatchId;
  $('modalRoot').innerHTML = `
  <div class="mask" onclick="if(event.target===this)closeModal()">
    <div class="modal wide" onclick="event.stopPropagation()">
      <div class="modal-head"><div class="modal-title">数据批次管理</div>
        <div class="modal-close" onclick="closeModal()">×</div></div>
      <div class="modal-body">
        <div class="hint">
          <b>每一次导入都是一份独立快照</b><br>
          切换批次等于换一整套「学生 + 备注 + 成绩」，彼此互不影响。<br>
          当前 ${S.batches.length} / ${MAX_BATCHES} 个批次。删除批次前会<b>自动导出 CSV 备份</b>。
        </div>
        ${S.batches.length ? S.batches.map(b=>{
          const renaming = (renamingId === b.id);
          return `
          <div class="batch-row ${b.id===activeId?'on':''}">
            <div class="batch-info">
              ${renaming ? `
                <div class="batch-rename">
                  <input class="edit-in" id="rn-${b.id}" value="${esc(b.name)}" placeholder="批次名称"
                         onkeydown="if(event.key==='Enter'){event.preventDefault();commitRename('${b.id}',this);}if(event.key==='Escape')cancelRename();">
                  <button class="btn pri" style="flex:none" onclick="commitRename('${b.id}',document.getElementById('rn-${b.id}'))">确定</button>
                  <button class="btn" style="flex:none" onclick="cancelRename()">取消</button>
                </div>`
              : `
                <div class="batch-name">
                  ${b.demo?'<span class="tag">演示</span>':''}
                  ${b.mode==='migrate'?'<span class="tag">迁移</span>':''}
                  ${esc(b.name)}
                  ${b.id===activeId?'<span class="tag blue">当前</span>':''}
                </div>`}
              <div class="batch-meta">${b.students.length} 人 · 成绩 ${(b.grades&&b.grades.length)?b.grades.length+' 条':'未导入'} ·
                导入于 ${esc(b.importedAt||'-')}${b.sourceFile?` · 来源 ${esc(b.sourceFile)}`:''}</div>
            </div>
            <div class="batch-acts">
              ${b.id===activeId?'':`<button class="btn" onclick="switchBatch('${b.id}');openBatchManager();">切换</button>`}
              ${b.id===activeId?`<button class="btn" onclick="closeModal();openImport('成绩表：按学号绑到学生上，不会改动学生档案')">导入成绩</button>`:''}
              <button class="btn" onclick="exportBatchCsv(findBatch('${b.id}'))">CSV</button>
              <button class="btn" onclick="exportBatchXlsx(findBatch('${b.id}'))">Excel</button>
              <button class="btn"${renaming?' disabled':''} onclick="renameBatch('${b.id}')">重命名</button>
              <button class="btn" style="color:var(--danger);border-color:var(--danger-line)"
                      onclick="deleteBatch('${b.id}')">删除</button>
            </div>
          </div>`;}).join('') : `<div class="empty-state" style="padding:24px">还没有任何批次</div>`}
      </div>
      <div class="modal-foot">
        <button class="btn" onclick="openBackupRestore()">备份与恢复</button>
        <button class="btn" onclick="closeModal();openImport()">+ 导入新批次</button>
        <button class="btn" onclick="exportBatchCsv(activeBatch())">导出当前批次全部</button>
        <button class="btn pri" onclick="closeModal()">关闭</button>
      </div>
    </div>
  </div>`;
}

function findBatch(id){ return S.batches.find(b=>b.id===id) || null; }

/* 批次重命名：改成「行内编辑」，不用 prompt()（打包后预览窗口不支持系统弹窗） */
let renamingId = null;   // 正在改名的批次 id（null = 没人改名）
function renameBatch(id){
  renamingId = id;
  openBatchManager();
  const el = $('rn-' + id);
  if(el){ try{ el.focus(); el.select(); }catch(e){} }
}
function cancelRename(){ renamingId = null; openBatchManager(); }
function commitRename(id, el){
  const b = findBatch(id);
  if(!b) return;
  const n = (el && el.value != null ? el.value : '').trim();
  if(!n){ toast('名称不能为空'); return; }
  renamingId = null;
  b.name = n;
  save(); renderBatchBar(); openBatchManager();
  toast('批次已重命名');
}

/* 删除批次：先自动导出备份，再二次确认。用户已确认的保护策略。 */
function deleteBatch(id){
  const b = findBatch(id);
  if(!b) return;
  let backupTip = '该批次为空，未生成备份';
  if(b.students.length){
    try{
      exportBatchCsv(b, true);
      backupTip = `已导出备份：学生数据_${safeName(b.name)}_${todayStr()}.csv`;
    }catch(e){
      console.warn(e);
      backupTip = '备份导出失败（浏览器可能拦截了下载），请先手动导出再删除';
    }
  }
  const gN = (b.grades && b.grades.length) ? b.grades.length : 0;
  askConfirm({
    title:'删除批次', danger:true, okText:'删除批次',
    html:`${esc(backupTip).replace(/\n/g,'<br>')}<br><br>将删除批次「<b>${esc(b.name)}</b>」（${b.students.length} 人${gN?`、${gN} 条成绩`:''}）。<br><br>删除后 <b>30 秒内</b>可点「撤销」恢复。`,
    onOk(){ doDeleteBatch(b); }
  });
}

/* 确认后的实际删除（快照在动手前拍） */
function doDeleteBatch(b){
  snapshotForUndo(`已删除批次「${b.name}」`);
  const idx = S.batches.indexOf(b);
  S.batches.splice(idx, 1);
  if(S.activeBatchId === b.id){
    const next = S.batches[Math.min(idx, S.batches.length-1)] || null;
    if(next) attachBatch(next.id);
    else { S.activeBatchId = null; S.students = []; S.grades = []; invalidateGradeMap(); }
    S.filters = {}; S.quickView='all'; S.classFilter='all'; S._search='';
  }
  save(); renderBatchBar(); renderSidebar(); renderMain();
  openBatchManager();
  toast('批次已删除');
}

function pickClass(c){ S.view='list'; S.classFilter = c; S.quickView='all'; S._search=''; renderSidebar(); renderMain(); closeSidebar(); }
function pickPreset(id){ S.view='list'; S.quickView = id; S.classFilter='all'; S._search=''; renderSidebar(); renderMain(); closeSidebar(); }

/* ---------- 视图路由 ---------- */
function gotoDashboard(){ S.view = 'dashboard'; renderSidebar(); renderMain(); closeSidebar(); }
/* v2.2（升级清单 ④）：三张原本不可点的指标卡补上跳转 —— 让"每张卡点一下都有去处"一致起来。
   去处都挑"能接着做事"的，而不是只为可点而可点：
     · 覆盖班级   → 列表按「班级」排开（同班聚在一起，便于逐个班处理）
     · 平均加权成绩 → 列表按「成绩」排序（低分在前，看是谁把平均拉下来了）
     · 平均学分绩点 → 直接进「绩点偏低」名单（可操作，而不只是看个数） */
function jumpByClass(){ gotoList(); setSort('班级'); }
function jumpByScore(){ gotoList(); setSort('成绩'); }
function jumpToLowGpa(){ gotoList({preset:'lowgpa'}); }

function gotoList(opts={}){
  S.view = 'list';
  if(opts.preset){
    // 安全网：本批数据缺该字段的预设不跳转（界面上已置灰，这里兜住漏网的入口）
    const p = presetById(opts.preset);
    if(p && !presetAvailable(p)){ toast(missTip(p.need||[])); return; }
    S.quickView = opts.preset; S.classFilter = 'all';
  }
  if(opts.classFilter){ S.classFilter = opts.classFilter; S.quickView = 'all'; }
  if(opts.filters){ S.filters = normFilters(opts.filters); }
  if(opts.clear){ S.filters = {}; S.classFilter = 'all'; S.quickView = 'all'; }
  S._search = '';
  const m = document.querySelector('.main');
  if(m) m.scrollTo({top:0, behavior:'smooth'});
  renderSidebar(); renderMain();
}

/* ---------- 数据计算 ---------- */
function baseList(){
  let list = S.students;
  if(S.classFilter !== 'all') list = list.filter(s=>s['班级']===S.classFilter);
  return list;
}
function applyAll(){
  let list = baseList();
  const p = PRESETS.find(x=>x.id===S.quickView);
  if(p && p.id!=='all') list = p.fn(list);
  /* 筛选条件自 v0.6 起支持多选：同一个字段的多个取值之间是「或」的关系
     （班级 = A 或 B），不同字段之间仍是「且」的关系。 */
  Object.entries(S.filters).forEach(([k,raw])=>{
    const vals = Array.isArray(raw) ? raw : (raw ? [raw] : []);
    if(!vals.length) return;
    list = list.filter(s=>vals.some(v=>{
      if(v === '__EMPTY__') return !s[k];
      const cur = String(s[k] == null ? '' : s[k]);
      /* v1.9.8：「关注标签」一个字段里塞多个 emoji（如 🎭⛄），必须按「包含」匹配；
         v2.2：这类字段统一登记在 MULTIVALUE_FIELDS（新增「管理老师」——值是逗号分隔的多人）。
         其余字段仍是等值匹配（同字段多值=或，不同字段=且）。 */
      return MULTIVALUE_FIELDS.has(k) ? cur.indexOf(v) >= 0 : cur === v;
    }));
  });
  return list;
}
function currentList(){ return viewList(); }

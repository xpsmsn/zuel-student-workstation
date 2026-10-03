/* ════════════════════════════════════════════════════════════════════════
   modules/roster-ops.js —— 名册数据操作（L5 feature）
   ────────────────────────────────────────────────────────────────────────
   撤销快照、删除学生、勾选批量、打标签、导出所选。
   这些操作**认识学生**，所以不属于 core。

   它们原先住在 core/04-kit.js，产生了 core → feature 的反向依赖 ——
   也就是地基反过来依赖墙皮。这会让「谁都能改 core」变成一句空话：
   改一个勾选框可能炸掉持久化层。

   ⚠️ 本文件里的删除一律走「确认 → 撤销快照 → 写库 → save()」四步。
      少一步就可能丢数据，而丢数据在这个产品里是最严重的故障。
   ════════════════════════════════════════════════════════════════════════ */

/* ---------- 撤销快照：删除前把整个批次表拍下来，30 秒内可一键还原 ---------- */
let undoSnap = null, undoTimer = null;
/* v2.2：撤销条本身不变，只是把"开一次撤销机会"抽成 offerUndo —— 因为现在有**两个来源**：
   删除类操作（snapshotForUndo 用**当前**状态拍照）与详情页保存（事先拍好的 beforeEdit 快照）。 */
function offerUndo(data, label){
  undoSnap = { label: label || '', data: data };
  clearTimeout(undoTimer);
  undoTimer = setTimeout(hideUndoBar, 30000);
  $('undoMsg').textContent = (label || '') + ' · 30 秒内可撤销';
  $('undoBar').classList.add('show');
}
function snapshotForUndo(label){
  offerUndo(JSON.stringify({ batches: S.batches, activeBatchId: S.activeBatchId }), label);
}
function hideUndoBar(){
  $('undoBar').classList.remove('show');
  $('undoMsg').textContent = '';
  clearTimeout(undoTimer); undoTimer = null; undoSnap = null;
}
function undoRestore(){
  if(!undoSnap) return;
  const label = undoSnap.label || '';
  let d = null;
  try{ d = JSON.parse(undoSnap.data); }catch(e){}
  hideUndoBar();
  if(!d || !Array.isArray(d.batches)){ toast('快照已失效，无法撤销'); return; }
  S.batches = d.batches;
  selRows.clear();
  if(d.activeBatchId && S.batches.some(b=>b.id===d.activeBatchId)) attachBatch(d.activeBatchId);
  else if(S.batches.length) attachBatch(S.batches[0].id);
  else { S.activeBatchId = null; S.students = []; S.grades = []; invalidateGradeMap(); }
  S.filters = {}; S.quickView = 'all'; S.classFilter = 'all'; S._search = '';
  save(); renderBatchBar(); renderSidebar(); renderMain(); closeModal();
  // v2.2：撤销条现在也服务"改资料"（不止删除），所以提示语不再写死"删除前"
  toast(label ? `已撤销：${label}` : '已撤销，数据已恢复');
}

/* ---------- 删除 · 单个学生 ---------- */
function deleteStudent(sid){
  const b = activeBatch();
  if(!b){ toast('当前没有批次'); return; }
  const s = S.students.find(x=>String(x['学号'])===String(sid));
  if(!s){ toast('找不到该学生'); return; }
  const nm = studentName(s);
  const idStr = String(s['学号']==null?'':s['学号']).trim();
  const gN = (idStr && Array.isArray(b.grades))
    ? b.grades.filter(g=>String(g['学号']==null?'':g['学号']).trim()===idStr).length : 0;
  askConfirm({
    title:'删除学生', danger:true, okText:'删除',
    html:`将删除 <b>${esc(nm)}</b>${idStr?`（学号 ${esc(idStr)}）`:''}${gN?`，同时删除其 <b>${gN}</b> 条成绩记录`:''}。<br><br>删除后 <b>30 秒内</b>可点下方「撤销」恢复；也可随时用「备份与恢复」整份还原。`,
    onOk(){
      snapshotForUndo(`已删除学生：${nm}`);
      const i = b.students.indexOf(s);
      if(i > -1) b.students.splice(i, 1);
      if(idStr && Array.isArray(b.grades)) setGrades(b.grades.filter(g=>String(g['学号']==null?'':g['学号']).trim()!==idStr));
      setStudents(b.students);
      selRows.delete(s);
      save(); closeModal(); renderBatchBar(); renderSidebar(); renderMain();
      toast(`已删除 ${nm}`);
    }
  });
}

/* ---------- 删除 · 勾选批量 ---------- */
const selRows = new Set();     // 勾选中的学生对象（同一引用，切批次/删除后自动清）
let curList = [];              // 当前列表渲染用的学生数组（勾选框按行号回查）
function toggleSelOne(i, on){
  const s = curList[i];
  if(!s) return;
  if(on) selRows.add(s); else selRows.delete(s);
  renderMain();
}
function toggleSelAll(on){
  curList.forEach(s=>{ if(on) selRows.add(s); else selRows.delete(s); });
  renderMain();
}
function clearSel(){ selRows.clear(); renderMain(); }
function deleteSelected(){
  const b = activeBatch();
  if(!b){ toast('当前没有批次'); return; }
  const arr = [...selRows].filter(s=>S.students.includes(s));
  if(!arr.length){ toast('请先勾选要删除的学生'); return; }
  const gSet = new Set(arr.map(s=>String(s['学号']==null?'':s['学号']).trim()).filter(Boolean));
  askConfirm({
    title:'批量删除', danger:true, okText:'删除所选',
    html:`将删除勾选的 <b>${arr.length}</b> 名学生${(gSet.size && hasGrade())?`，并清理其成绩记录`:''}。<br><br>删除后 <b>30 秒内</b>可点「撤销」恢复。`,
    onOk(){
      snapshotForUndo(`已删除 ${arr.length} 名学生`);
      const del = new Set(arr);
      setStudents(b.students.filter(s=>!del.has(s)));
      if(gSet.size && Array.isArray(b.grades))
        setGrades(b.grades.filter(g=>!gSet.has(String(g['学号']==null?'':g['学号']).trim())));
      selRows.clear();
      save(); renderBatchBar(); renderSidebar(); renderMain();
      toast(`已删除 ${arr.length} 名学生`);
    }
  });
}

/* v2.2（升级清单 B）：给所有勾选的学生打同一个标签。
   语义与详情页的 toggleStudentTag 一致（存 emoji、可叠加、清空写 null），只多一条**批量口径**：
   勾选的人**全都有**这个标签 → 这次算「取消」—— 否则再点一次毫无反应，会让人以为坏了。 */
function bulkTag(emoji){
  const arr = [...selRows].filter(s=>S.students.includes(s));
  if(!arr.length){ toast('请先勾选学生'); return; }
  const all = arr.every(s=>tagStr(s).indexOf(emoji) >= 0);
  arr.forEach(s=>{
    const cur = tagStr(s);
    s['关注标签'] = (all ? cur.split(emoji).join('')
                         : (cur.indexOf(emoji) >= 0 ? cur : cur + emoji)) || null;
  });
  save();
  renderMain();
  const lbl = emoji + (tagLabelOf(emoji) || '');
  toast(all ? `已取消 ${arr.length} 人的 ${lbl}` : `已给 ${arr.length} 人打上 ${lbl}`);
}

/* v2.2（升级清单 B）：只导出勾选的学生（CSV，含成绩）。
   复用现有的 mergedRows + downloadCsv —— 格式与「导出当前结果」完全一致，不另造一套导出。 */
function exportSelected(){
  const list = [...selRows].filter(s=>S.students.includes(s));
  if(!list.length){ toast('请先勾选要导出的学生'); return; }
  const rows = mergedRows(list, S.grades);
  const csv = csvOf(rows);
  const fileName = `所选学生_${todayStr()}.csv`;
  downloadCsv(csv, fileName);
  const b = activeBatch();
  recordBackup({ type:'csv-batch', fileName, batchName: b?b.name:'', batchId: b?b.id:'', bytes: csv.length });
  toast(`已导出所选的 ${rows.length} 条${hasGrade()?'（含成绩）':''}`);
}

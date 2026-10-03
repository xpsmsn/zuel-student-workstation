/* ---------- 备份与恢复（全量 JSON，一份文件兜底） ---------- */
function backupPayload(){
  return {
    app: 'zuel-student-workstation', kind: 'full-backup', ver: APP_VER,
    exportedAt: new Date().toISOString(),
    password: S.password, batches: S.batches, activeBatchId: S.activeBatchId,
    savedFilters: S.savedFilters, dormCap: S.dormCap || 4, listCols: S.listCols,
    hiddenFields: S.hiddenFields || [],
    hiddenPresets: S.hiddenPresets || [], hideUnavailable: S.hideUnavailable !== false,
    customFields: Array.isArray(S.customFields) ? S.customFields : [],
    guideSeen: !!S.guideSeen, tourSeen: !!S.tourSeen, theme: S.theme || 'light'
  };
}
function downloadJson(txt, filename){
  const blob = new Blob([txt], {type:'application/json;charset=utf-8'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}
function exportBackupFile(){
  try{
    const fileName = `工作台完整备份_${todayStr()}.json`;
    const bytes = new TextEncoder().encode(JSON.stringify(backupPayload(), null, 1)).length;
    downloadJson(JSON.stringify(backupPayload(), null, 1), fileName);
    S.backupRemind = false;   // v1.4：已导出过备份，导入后的提醒不再弹
    S.lastBackupAt = new Date().toLocaleString('zh-CN', { hour12:false });   // v1.6：记录备份时间
    recordBackup({ type:'json', fileName, batchName:'', batchId:'', bytes });   // v1.9.7：记入备份历史
    save();
    toast('备份文件已导出，请妥善保存（含全部批次、成绩与设置）');
  }catch(e){ toast('导出失败：' + e.message); }
}
function restoreBackupFile(input){
  const f = input && input.files && input.files[0];
  if(!f) return;
  if(!/\.json$/i.test(f.name)){ toast('请选择本工作台导出的 .json 备份文件'); input.value=''; return; }
  const reader = new FileReader();
  reader.onload = ()=>{
    let d = null;
    try{ d = JSON.parse(reader.result); }catch(e){ toast('文件不是有效的 JSON'); input.value=''; return; }
    const ok = d && d.kind==='full-backup' && Array.isArray(d.batches)
      && d.batches.every(b=>b && Array.isArray(b.students));
    if(!ok){ toast('这不是本工作台的完整备份文件（或已损坏）'); input.value=''; return; }
    const nStu = d.batches.reduce((n,b)=>n+b.students.length,0);
    const nGrd = d.batches.reduce((n,b)=>n+((b.grades&&b.grades.length)||0),0);
    askConfirm({
      title:'从备份恢复', danger:true, okText:'恢复',
      html:`备份包含 <b>${d.batches.length}</b> 个批次、<b>${nStu}</b> 名学生、<b>${nGrd}</b> 条成绩${d.exportedAt?`<br>导出时间：${esc(String(d.exportedAt).slice(0,10))}`:''}。<br><br><b>恢复将覆盖当前全部数据</b>（当前 ${S.batches.length} 个批次会被替换）。`,
      onOk(){
        S.password = d.password || S.password;
        S.batches = d.batches;
        S.activeBatchId = d.activeBatchId || null;
        S.savedFilters = Array.isArray(d.savedFilters) ? d.savedFilters : [];
        S.dormCap = d.dormCap || 4;
        S.listCols = d.listCols || null;
        S.hiddenFields = Array.isArray(d.hiddenFields) ? d.hiddenFields : [];
        S.hiddenPresets = Array.isArray(d.hiddenPresets) ? d.hiddenPresets : [];
        S.hideUnavailable = d.hideUnavailable !== false;
        S.customFields = Array.isArray(d.customFields) ? d.customFields : [];
        S.guideSeen = !!d.guideSeen;
        // v1.9.2：老备份里没有这项 → 视为「看过」，别让恢复完备份又弹一层浮窗
        S.tourSeen = d.tourSeen === undefined ? true : !!d.tourSeen;
        S.theme = d.theme || 'light';
        selRows.clear();
        // 立即把 S.students / S.grades 重新挂到恢复后的当前批次上（别等 reload 兜底）
        if(S.activeBatchId && S.batches.some(b=>b.id===S.activeBatchId)) attachBatch(S.activeBatchId);
        else if(S.batches.length) attachBatch(S.batches[0].id);
        else { S.activeBatchId = null; S.students = []; S.grades = []; invalidateGradeMap(); }
        save();
        toast('恢复完成');
        location.reload();
      }
    });
    input.value = '';
  };
  reader.onerror = ()=>{ toast('读取文件失败'); input.value=''; };
  reader.readAsText(f, 'utf-8');
}
function openBackupRestore(){
  const nB = S.batches.length;
  const nS = S.batches.reduce((n,b)=>n+b.students.length,0);
  const nG = S.batches.reduce((n,b)=>n+((b.grades&&b.grades.length)||0),0);
  $('modalRoot').innerHTML = `
  <div class="mask" onclick="if(event.target===this)closeModal()">
    <div class="modal" onclick="event.stopPropagation()">
      <div class="modal-head"><div class="modal-title">备份与恢复</div>
        <div class="modal-close" onclick="closeModal()">×</div></div>
      <div class="modal-body">
        <div class="hint">
          数据全部存在<b>本机浏览器存储</b>里。建议定期导出一份备份文件，重装系统、换电脑、清浏览器缓存时用它一键还原。</div>
        <div style="display:flex;gap:10px;margin:14px 0">
          <div class="stat-mini"><div class="v">${nB}</div><div class="k">批次</div></div>
          <div class="stat-mini"><div class="v">${nS}</div><div class="k">学生</div></div>
          <div class="stat-mini"><div class="v">${nG}</div><div class="k">成绩条</div></div>
        </div>
        <div style="font-weight:640;font-size:13.5px;margin:16px 0 9px;color:var(--text-2)">① 导出备份</div>
        <div style="display:flex;gap:9px;align-items:center">
          <button class="btn pri" onclick="exportBackupFile()">导出完整备份（.json）</button>
          <span style="font-size:12px;color:var(--text-3)">包含全部批次、成绩、备注与个性化设置</span>
        </div>
        <div style="font-weight:640;font-size:13.5px;margin:16px 0 9px;color:var(--text-2)">② 从备份文件恢复</div>
        <label class="dropzone" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;
          border:1.5px dashed var(--line);border-radius:10px;padding:22px;cursor:pointer">
          <span style="font-size:20px">📥</span>
          <span style="font-size:13.5px;font-weight:600">点击选择备份文件</span>
          <span style="font-size:12px;color:var(--text-3)">仅接受本工作台导出的 .json 备份 · 恢复前会先确认，不会立即覆盖</span>
          <input type="file" accept=".json,application/json" style="display:none" onchange="restoreBackupFile(this)">
        </label>

        <div style="font-weight:640;font-size:13.5px;margin:16px 0 9px;color:var(--text-2)">③ 找已导出的文件</div>
        <div style="display:flex;gap:9px;align-items:center;flex-wrap:wrap">
          <button class="btn" onclick="openDownloadsFolder()">📂 打开备份文件夹</button>
          <button class="btn" onclick="closeModal();gotoBackupHistory()">📜 我导出的备份文件（${(S.backupHistory||[]).length} 份）</button>
          <span style="font-size:12px;color:var(--text-3)">备份都落在「下载」文件夹；点「我导出的备份文件」可一键定位或删除</span>
        </div>

        <div class="hint" style="margin-top:16px">
          <b>三种"保命"机制的区别（别再混了）：</b><br>
          · <b>备份</b>（本弹窗）：导出成文件、你能带走 —— 换电脑、磁盘坏了靠它。<br>
          · <b>自动保护</b>：本机每次保存自动留镜像 —— 防"清了浏览器缓存 / 重装程序"，但<b>带不走</b>。<br>
          · <b>导入历史</b>：本机每次导入前自动留快照 —— 专门用来"这次导错了，退回去"，<b>也不是备份</b>。
        </div>
      </div>
      <div class="modal-foot"><button class="btn pri" onclick="closeModal()">关闭</button></div>
    </div>
  </div>`;
}

/* ---------- 成绩导入（独立于学生导入的一趟流程） ----------
   成绩表来自系统「成绩信息」报表，结构比学生表"脏"得多，不能套用
   「第 1 行即表头」那套解析：
     · 第 1–2 行是合并的标题带（A1:K2 = "成绩信息"）
     · 真正的表头在第 3 行
     · 末尾有「162人 / 不及格」这类合计行，必须剔除
   所以这里单独定位表头、只认「学号是纯数字」的数据行。
   合并口径与项目铁律一致：按学号 upsert，本次表里没出现的学生成绩原样保留。 */
let gradeImportState = { fileName:'', parsed:null };

function parseGradeSheet(arr){
  // ① 定位表头行：第一处出现「学号」的行（容忍前后空格与标题带）
  let headerIdx = -1;
  for(let i=0;i<Math.min(arr.length,20);i++){
    const row = arr[i] || [];
    if(row.some(c=>String(c==null?'':c).trim() === '学号')){ headerIdx = i; break; }
  }
  if(headerIdx < 0) return { ok:false, reason:'没找到「学号」列，这可能不是成绩表' };

  const header = (arr[headerIdx]||[]).map(h=>String(h==null?'':h).trim());
  const rows = [], dropped = [];
  for(let i=headerIdx+1;i<arr.length;i++){
    const raw = arr[i] || [];
    if(!raw.some(c=>c!=null && c!=='')) continue;          // 空行
    const o = {};
    header.forEach((h,j)=>{ if(h) o[h] = (raw[j]==null ? '' : raw[j]); });
    const id = String(o['学号'] == null ? '' : o['学号']).trim();
    // ② 只认「学号是纯数字」的行 → 合计行（162人/不及格）与说明行在此剔除并留痕
    if(!/^\d{6,}$/.test(id)){
      const text = Object.values(o).filter(v=>v!=='').slice(0,3).join(' / ');
      dropped.push({ row:i+1, text });
      continue;
    }
    o['学号'] = id;
    rows.push(o);
  }
  return { ok:true, headerIdx, header, rows, dropped };
}

function openGradeImport(){
  const cur = activeBatch();
  if(!cur){ toast('请先导入学生数据，再导入成绩'); return; }
  closeSidebar();
  gradeImportState = { fileName:'', parsed:null };
  const has = hasGrade();
  $('modalRoot').innerHTML = `
  <div class="mask" onclick="if(event.target===this)closeModal()">
    <div class="modal wide" onclick="event.stopPropagation()">
      <div class="modal-head"><div class="modal-title">导入成绩</div>
        <div class="modal-close" onclick="closeModal()">×</div></div>
      <div class="modal-body" id="gradeBody">${gradePickHtml(cur, has)}</div>
      <div class="modal-foot">
        <button class="btn" onclick="closeModal()">取消</button>
        <button class="btn pri" id="gradeOk" style="display:none" onclick="doImportGrades()">确认导入</button>
      </div>
    </div>
  </div>`;
}

function gradePickHtml(cur, has){
  return `
    <div class="hint">
      <b>按「学号」把成绩绑定到当前批次「${esc(cur.name)}」的 ${cur.students.length} 名学生</b><br>
      · 成绩<b>单独保存</b>，不会改动任何学生档案字段<br>
      · 表头自动定位（该表第 1–2 行是标题带、末尾有合计行，都会自动跳过）<br>
      · 按学号合并：本次表里没出现的学号，其原有成绩<b>保留不动</b>
      ${has?`<br>· 当前已有 <b>${S.grades.length}</b> 条成绩，重复导入同一个人会更新为本次的值`:''}
    </div>
    <div class="drop" onclick="document.getElementById('gradeFileInput').click()">
      <div class="drop-ico">📄</div>
      <div class="drop-t">点击选择成绩表（.xlsx / .xls）</div>
      <div class="drop-s">需包含「学号」及成绩指标列：加权平均成绩、平均学分绩点、排名 等</div>
    </div>
    <input type="file" id="gradeFileInput" accept=".xlsx,.xls" style="display:none" onchange="handleGradeFile(event)">
  `;
}

function handleGradeFile(e){
  const f = e.target.files[0];
  if(!f) return;
  if(!/\.(xlsx|xls)$/i.test(f.name)){ toast('请选择 .xlsx / .xls 文件'); return; }
  if(typeof XLSX === 'undefined'){ toast('当前环境缺少表格解析库'); return; }
  const reader = new FileReader();
  reader.onload = ev => {
    let arr;
    try{
      const wb = XLSX.read(new Uint8Array(ev.target.result), {type:'array', cellDates:false});
      /* v2.2：不再硬取第一张 —— 取第一张**有数据**的表，多表时明说用了哪一张。
         （成绩表一般是单表，这里不做"选表"界面；见 CHANGELOG 待办。） */
      const cands = sheetsNeedingPick(wb);
      const useName = cands.length ? cands[0].name : wb.SheetNames[0];
      if(cands.length > 1){
        toast(`这份文件有 ${cands.length} 张有数据的表，已按「${useName}」读取`);
      }
      const ws = wb.Sheets[useName];
      arr = XLSX.utils.sheet_to_json(ws, {header:1, defval:null, raw:false});
    }catch(err){
      console.error(err);
      toast('解析失败：请确认这是系统导出的 Excel 文件（而不是网页另存）');
      return;
    }
    if(!arr || !arr.length){ toast('表格为空'); return; }
    const p = parseGradeSheet(arr);
    if(!p.ok){ toast(p.reason); return; }
    gradeImportState.fileName = f.name;
    gradeImportState.parsed = p;
    renderGradePreview();
  };
  reader.readAsArrayBuffer(f);
}

function renderGradePreview(){
  const p = gradeImportState.parsed;
  const body = $('gradeBody');
  if(!body || !p) return;
  const okBtn = $('gradeOk');
  if(okBtn) okBtn.style.display = 'inline-flex';

  const sidOf = s => String(s['学号'] == null ? '' : s['学号']).trim();
  const sids = new Set(S.students.map(sidOf).filter(Boolean));
  const matched = p.rows.filter(r=>sids.has(sidOf(r))).length;
  const orphans = p.rows.filter(r=>!sids.has(sidOf(r)));
  const gids = new Set(p.rows.map(sidOf));
  const noGrade = S.students.filter(s=>!gids.has(sidOf(s)));

  body.innerHTML = `
    <div class="filebox" style="margin-bottom:14px">
      <div class="file-ico">X</div>
      <div style="flex:1;min-width:0">
        <div class="file-name">${esc(gradeImportState.fileName)}</div>
        <div class="file-meta">表头在第 ${p.headerIdx+1} 行 · 识别到 ${p.rows.length} 条成绩记录${p.dropped.length?` · 跳过 ${p.dropped.length} 行（合计/说明）`:''}</div>
      </div>
    </div>

    <div class="result-row" style="margin-bottom:14px">
      <div class="result-box"><div class="v" style="color:var(--brand)">${p.rows.length}</div><div class="l">成绩记录</div></div>
      <div class="result-box"><div class="v" style="color:var(--ok)">${matched}</div><div class="l">按学号匹配上</div></div>
      <div class="result-box"><div class="v" style="color:${orphans.length?'var(--warn)':'var(--text-3)'}">${orphans.length}</div><div class="l">学生表中没有</div></div>
      <div class="result-box"><div class="v" style="color:var(--text-3)">${noGrade.length}</div><div class="l">本批暂无成绩</div></div>
    </div>

    <div class="hint">
      <b>识别到的列</b>：${p.header.filter(Boolean).map(c=>esc(c)).join('、')}
      ${p.dropped.length?`<br><b>已跳过的非数据行</b>：${p.dropped.slice(0,4).map(d=>`第 ${d.row} 行（${esc(d.text||'空')}）`).join('；')}${p.dropped.length>4?` 等 ${p.dropped.length} 行`:''}`:''}
    </div>
    ${orphans.length?`<div class="hint" style="border-color:var(--warn-line);background:var(--warn-soft)">
      <b style="color:var(--warn)">有 ${orphans.length} 条成绩在学生表里找不到对应学号</b><br>
      这些成绩仍会保存，但不会出现在任何学生详情里：${orphans.slice(0,8).map(r=>esc(sidOf(r))).join('、')}${orphans.length>8?' …':''}
    </div>`:''}
    ${noGrade.length?`<div class="hint">本批有 <b>${noGrade.length}</b> 名学生在成绩表里没有记录，导入后他们的成绩将显示为「暂无成绩」（不会被丢弃）。</div>`:''}
  `;
}

function doImportGrades(){
  const p = gradeImportState.parsed;
  if(!p || !p.rows.length){ toast('没有可导入的成绩记录'); return; }
  // v1.5 导入历史：进函数先冻结「导入前」的成绩集合
  const preGrades = (S.grades || []).slice();
  const preBatchId = activeBatch() ? activeBatch().id : null;
  const preBatchName = activeBatch() ? activeBatch().name : '';
  const preFile = gradeImportState.fileName || '';
  // 按学号 upsert：已有的更新，没有的新增；本次未出现的学号原样保留（不静默删除）
  const m = new Map((S.grades||[]).map(g=>[String(g['学号']==null?'':g['学号']).trim(), g]));
  let added = 0, updated = 0;
  p.rows.forEach(r=>{
    const id = String(r['学号']).trim();
    const rec = {};
    Object.entries(r).forEach(([k,v])=>{ if(v != null && v !== '') rec[k] = v; });
    rec['学号'] = id;
    if(m.has(id)){ Object.assign(m.get(id), rec); updated++; }
    else{ m.set(id, rec); added++; }
  });
  setGrades([...m.values()]);
  markDataChanged();   // v1.4：有新成绩 → 触发备份提醒（若尚未导出过备份）
  save();
  closeModal();
  renderBatchBar(); renderSidebar(); renderMain();
  maybeBackupRemind();   // v1.4：成绩导入成功后弹备份提醒（若尚未导出过备份）
  // v1.5 导入历史：留档 + 快照（桌面版写磁盘）
  recordImport('成绩', preFile,
    { batch: preBatchName, batchId: preBatchId, added, updated, skipped: 0 },
    { kind:'grades', batchId: preBatchId, grades: preGrades });
  toast(`成绩已导入：更新 ${updated} 人、新增 ${added} 人`);
}

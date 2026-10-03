/* ---------- 导出（公共部分抽出来，供「导出当前结果」与「批次备份」共用） ----------
   fmtDate / stampCompact 已在 src/kernel/00-kernel.js（内核的纯工具段）。
   ⚠️ 内核另有一个 todayStr()，与本模块原来那个格式一致（2026-10-03），
      已统一到内核，这里不再重复定义。 */

/* 文件名里不能出现 \ / : * ? " < > | 这类字符 */
function safeName(s){
  return String(s==null?'':s).replace(/[\\/:*?"<>|\r\n\t]+/g,'_').replace(/\s+/g,'').slice(0,40) || '批次';
}
function csvOf(list){
  if(!list || !list.length) return '';
  const header = Object.keys(list[0]);
  const esc2 = v => {
    const s = v==null?'':String(v);
    return /[",\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s;
  };
  // \uFEFF 为 BOM，保证 Excel 打开中文不乱码
  return '\uFEFF' + [header.join(','), ...list.map(r=>header.map(h=>esc2(r[h])).join(','))].join('\n');
}
function downloadCsv(csv, filename){
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}
/* 导出用：把学生行与它绑定的成绩合并成一行（成绩列加前缀「成绩·」，避免与档案列重名）。
   没有成绩时原样返回，不凭空多出 8 个空列。成绩列顺序走 GRADE_FIELDS 统一口径。 */
function mergedRows(list, grades){
  const arr = Array.isArray(grades) ? grades : [];
  if(!arr.length) return list;
  const m = new Map(arr.map(g=>[String(g['学号']==null?'':g['学号']).trim(), g]));
  return list.map(s=>{
    const o = {};
    Object.keys(s).forEach(k=>{ o[k] = s[k]; });
    const g = m.get(String(s['学号']==null?'':s['学号']).trim());
    GRADE_FIELDS.forEach(k=>{ o['成绩·'+k] = (g && g[k]!=null) ? g[k] : ''; });
    return o;
  });
}

/* silent=true 时不弹 toast（用于「删前自动备份」这类后台动作） */
function exportBatchCsv(batch, silent){
  if(!batch){ if(!silent) toast('没有可导出的批次'); return; }
  if(!batch.students.length){ if(!silent) toast('该批次没有可导出的数据'); return; }
  const rows = mergedRows(batch.students, batch.grades);
  const fileName = `学生数据_${safeName(batch.name)}_${todayStr()}.csv`;
  downloadCsv(csvOf(rows), fileName);
  // v1.9.7：记入备份历史。silent=true 也要记 —— 自动备份场景（覆盖前 / 删批次前）的回退依据就在这里
  recordBackup({ type:'csv-batch', fileName, batchName: batch.name, batchId: batch.id, bytes: csvOf(rows).length });
  if(!silent) toast(`已导出 ${rows.length} 条${(batch.grades&&batch.grades.length)?'（含成绩）':''}`);
}

function exportData(){
  const list = currentList();
  if(!list.length){ toast('当前没有可导出的数据'); return; }
  const rows = mergedRows(list, S.grades);
  const csv = csvOf(rows);
  const fileName = `学生数据_${todayStr()}.csv`;
  downloadCsv(csv, fileName);
  // v1.9.7：当前筛选结果导出也记一笔（虽然未关联批次）
  recordBackup({ type:'csv-batch', fileName, batchName: activeBatch() ? activeBatch().name : '', batchId: activeBatch() ? activeBatch().id : '', bytes: csv.length });
  toast(`已导出 ${rows.length} 条${hasGrade()?'（含成绩）':''}`);
}

/* ---------- v1.9.6：导出 Excel（维护用） ----------
   为什么要有它：CSV 在 Excel 里要对付编码/引号，长学号还会变科学计数；
   而且改完再存容易把"文本型数字"改坏。导出成 .xlsx（两个工作表）：
     · 「学生信息」→ 「导入学生数据」直接吃回去
     · 「成绩」    → 「导入成绩」直接吃回去
   形成 导出 → 在 Excel 里大范围改 → 导回 的闭环。学号一律按文本写，不会变 2.02E+11。 */
function fieldOrderOf(list){
  /* 列顺序：主键与常用列在前 → 已知字段按 FIELD_GROUPS 顺序 → 其余字段按出现顺序。
     只导"至少有一个人填了"的列，不给维护表塞几十个全空列。 */
  const known = [].concat(...FIELD_GROUPS.map(g=>g.keys));
  const has = k => list.some(r=> r[k] != null && r[k] !== '');
  const out = [], seen = new Set();
  const push = k => { if(k && !seen.has(k)){ seen.add(k); out.push(k); } };
  ['学号','姓名','班级','性别'].forEach(push);
  known.forEach(k=>{ if(has(k)) push(k); });
  list.forEach(r=>Object.keys(r).forEach(push));
  return out;
}
function xlsxSheet(wb, list, title, extraOrder){
  if(!list.length) return;
  const order = (extraOrder || fieldOrderOf(list)).filter(k=> list.some(r=> r[k]!=null && r[k]!=='') || k==='学号');
  const aoa = [order, ...list.map(r=> order.map(k=> (r[k]==null?'':String(r[k]))))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = order.map(k=>({ wch: Math.min(30, Math.max(9, k.length*2.2+4)) }));
  XLSX.utils.book_append_sheet(wb, ws, title);
}
function exportBatchXlsx(batch, silent){
  if(typeof XLSX === 'undefined'){ toast('表格组件没加载起来，导不了 Excel'); return; }
  if(!batch || !(batch.students||[]).length){ if(!silent) toast('该批次没有可导出的数据'); return; }
  const wb = XLSX.utils.book_new();
  xlsxSheet(wb, batch.students, '学生信息');
  const grades = batch.grades || [];
  if(grades.length){
    const gOrder = ['学号','姓名','班级'].concat(GRADE_FIELDS);
    xlsxSheet(wb, grades, '成绩', gOrder);
  }
  const bytes = XLSX.write(wb, { bookType:'xlsx', type:'array' });
  const file = `学生数据_${safeName(batch.name)}_${todayStr()}.xlsx`;
  saveExportFile(file, bytes, `已导出 Excel：${batch.students.length} 人${
    grades.length?`、${grades.length} 条成绩`:''}（工作表：学生信息${grades.length?' / 成绩':''}）`);
}
/* 列表页顶栏：导出当前筛选结果 —— 学生信息按筛选结果，成绩也只带筛选里这些人的，
   两张表各自都能直接导回 */
function exportDataXlsx(){
  const list = currentList();
  if(!list.length){ toast('当前没有可导出的数据'); return; }
  const ids = new Set(list.map(s=>String(s['学号']==null?'':s['学号']).trim()));
  const grades = (S.grades||[]).filter(g=> ids.has(String(g['学号']==null?'':g['学号']).trim()));
  exportBatchXlsx({ name: todayStr() + ' 筛选结果', students: list, grades }, true);
}
/* xlsx 落盘：桌面版进「下载」文件夹；浏览器版走浏览器下载。
   ⚠️ XLSX.write({type:'array'}) 返回的是 ArrayBuffer（不是 Uint8Array）：
   Array.from(ArrayBuffer) 会得到空数组 —— 直接传给 save_to_downloads 会写出 0 字节的文件。
   所以这里统一先包一层 Uint8Array 再取字节。 */
function saveExportFile(file, bytes, okMsg){
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if(!u8.length){ toast('导出失败：生成的文件是空的'); return; }
  if(isDesktopApp()){
    const p = tauriInvoke('save_to_downloads', { name: file, data: Array.from(u8) });
    Promise.resolve(p).then(()=>toast(okMsg)).catch(e=>toast('导出失败：' + ((e && e.message) || e)));
    return;
  }
  try{
    const blob = new Blob([u8], {type:'application/octet-stream'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = file;
    a.click();
    toast(okMsg);
  }catch(e){ toast('导出失败：' + ((e && e.message) || e)); }
}

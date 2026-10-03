/* ---------- v2.2：多工作表 —— 多于一张有数据的表时，让用户选 ----------
   旧行为是硬取 `wb.SheetNames[0]`。真实数据实证：一份导出里第一张是 189 行学生表、
   第二张是 90 行的班委名册 —— 第二张被**静默丢掉**；而如果某次导出的数据在第二张表，
   程序更会**静默读到空表**（不报错，导 0 人，或把封面页的垃圾导进来）。
   现在：候选多于一张时先让用户选；只有一张时行为与以前完全一致。 */

/* 每张工作表的概览（纯函数 —— 测试里用 XLSX.utils 现造的 workbook 就能直接测）。
   这里对每张表都跑一次 sheet_to_json，用的是**与导入完全相同**的解析参数，
   所以预览里看到的表头，就是导入后会用的表头。 */
function sheetChoices(wb){
  const names = (wb && wb.SheetNames) ? wb.SheetNames : [];
  return names.map(name=>{
    let arr = [];
    try{ arr = XLSX.utils.sheet_to_json(wb.Sheets[name], {header:1, defval:null, raw:false}) || []; }catch(e){ arr = []; }
    const named = arr.filter(r => (r || []).some(c => c != null && String(c).trim() !== ''));
    const headerIdx = named.length ? locateHeaderRow(arr) : 0;   // 与导入同一条表头判定
    const headerLine = arr[headerIdx] || [];
    const names = headerLine.map(c => c == null ? '' : String(c).trim()).filter(Boolean);
    let header = names.slice(0, 6);
    if(!header.length){
      /* 表头行没有可识别的列名（真实文件里第二张表的第一行就是空的）→ 退而用
         **第一行有内容的行**做预览。它只用来帮用户认出"这是哪张表"，不参与导入判定。 */
      const firstNonEmpty = arr.find(r => (r || []).some(c => c != null && String(c).trim() !== '')) || [];
      header = firstNonEmpty.map(c => c == null ? '' : String(c).trim()).filter(Boolean).slice(0, 6);
    }
    /* 行数口径：**只有认出表头才扣掉那一行**。否则（例如第一行是空、整张表没有列名的名册）
       所有有内容的行都是数据行 —— 早先无条件扣 1 会把 90 行的名册报成 89 行。 */
    const dataRows = Math.max(0, named.length - (names.length ? 1 : 0));
    return {
      name,
      rows: dataRows,
      cols: headerLine.length,
      header,
      hasData: dataRows > 0
    };
  });
}

/* 需要用户选表的候选：有数据的表（多于一张时才弹选择） */
function sheetsNeedingPick(wb){
  return sheetChoices(wb).filter(c => c.hasData);
}

/* 默认选哪张：第一张有数据的（与旧行为一致） */
function defaultSheetName(choices){
  const first = (choices || []).find(c => c.hasData);
  if(first) return first.name;
  return (choices && choices.length) ? choices[0].name : null;
}

/* 把某张工作表读成导入态 —— 学生导入**唯一**的「表 → importState」入口：
   选表路径与不选表路径都走它，避免两份复制体各自演化。返回是否成功。 */
function useSheet(wb, name, fileName){
  const ws = wb && wb.Sheets ? wb.Sheets[name] : null;
  if(!ws) return false;
  const arr = XLSX.utils.sheet_to_json(ws, {header:1, defval:null, raw:false});
  if(!arr || !arr.length) return false;
  const headerIdx = locateHeaderRow(arr);            // v1.9.2：表头不一定在第 1 行
  const rawHeader = (arr[headerIdx] || []).map(h => h == null ? '' : String(h));
  const { rows: rawRows, rowNos } = buildRawRows(arr, headerIdx, rawHeader);
  buildImportState(rawHeader, rawRows, fileName, headerIdx, rowNos);
  return true;
}

/* 用户在「选择工作表」那一步点了某一张 */
function chooseSheet(name){
  const wb = importState.pendingWb;
  const fileName = importState.pendingFileName || importState.fileName || '';
  if(!wb) return;
  if(!useSheet(wb, name, fileName)){
    toast('这张工作表是空的，换一张试试');    // 留在选择页，用户可以再点别的
    return;
  }
  importState.pendingWb = null;
  importState.sheetChoices = [];
  renderImport();      // buildImportState 已把 step 设成 2（确认页）
}

function handleFile(e){
  const f = e.target.files[0];
  if(!f) return;
  e.target.value = '';                                  // 同一份文件再选一次也要能触发
  const accept = /\.(xlsx|xls|csv)$/i.test(f.name);
  if(!accept){ toast('请选择 .xlsx / .xls 文件'); return; }
  importState.fileName = f.name;

  const reader = new FileReader();
  reader.onload = ev => {
    try{
      if(typeof XLSX === 'undefined'){
        throw new Error('内置的表格解析库没加载起来');
      }
      const wb = XLSX.read(new Uint8Array(ev.target.result), {type:'array', cellDates:true});
      /* v2.2：多工作表不再硬取第一张 —— 多于一张「有数据」的表时先让用户选 */
      const cands = sheetsNeedingPick(wb);
      if(!cands.length){ toast('这张表是空的，没有任何一行数据'); return; }
      if(cands.length > 1){
        importState.pendingWb = wb;
        importState.pendingFileName = f.name;
        importState.sheetChoices = cands;
        importState.fileName = f.name;
        importState.step = 0;                 // 「选择工作表」这一步
        renderImport();
        return;
      }
      if(!useSheet(wb, cands[0].name, f.name)){ toast('这张表是空的，没有任何一行数据'); return; }
    }catch(err){
      console.error('[中南大学生工作台] 表格解析失败', err);
      openFileError(f.name, err);
    }
  };
  reader.readAsArrayBuffer(f);
}

/* ---------- v1.9.2：文件读不了时，明说读不了 ----------
   ⚠️ 这里以前是「解析失败 → 换成内置演示数据导入」。后果非常严重：
   辅导员拿一张读不了的表进来，莫名其妙多出几十个"软件模板里的人"，
   还会以为是自己导错了 —— 而且是真的写进库了。
   所以现在改成：读不了就一个字都不入库，并给出可照着做的下一步。

   顺带说明：v1.9.2 之前还内置着 SheetJS 的 mini 精简版，它**根本不支持
   旧版 .xls（Excel 97-2003）**，所以这类文件必然走到那个演示数据兜底上。
   现在已换成完整版，.xls 能直接读；这个对话框兜的是"真读不了"的情况。 */
function openFileError(fileName, err){
  importState.fileName = '';
  showNotice('这个文件打不开', `
    <div style="margin-bottom:10px">文件名：<b>${esc(fileName)}</b></div>
    <div style="color:var(--text-2)">
      最常见的原因是这三个：<br>
      · 文件<b>设了打开密码</b>（加密工作簿）—— 要先去掉密码才能导<br>
      · 文件<b>已损坏</b>，或扩展名和真实格式对不上（比如把 WPS 的 .et、或网页 .html 改成了 .xls）<br>
      · 文件正被 <b>Excel / WPS 打开着并锁定</b> —— 关掉 Excel 再试一次
    </div>
    <div style="margin-top:11px;padding:9px 11px;background:var(--hover);border-radius:8px">
      <b>建议</b>：用 Excel 或 WPS 打开它，<b>另存为 .xlsx</b>，再导一次就好了。
    </div>
    <div style="margin-top:10px;color:var(--text-3);font-size:12.5px">
      本工作台<b>不会</b>用任何「演示数据」顶替你的文件 —— 读不了就一个字都不入库，你的数据一点没动。
    </div>`, '明白了');
}

/* v1.9.2：原来的 simulateImport()（解析失败就用内置演示数据顶替）已删除 ——
   它把"读不了你的文件"伪装成"导入成功"，还会把演示学生写进你的批次里。
   需要演示数据的场合请走「系统设置 → 数据管理 → 恢复演示数据」这条显式入口。 */

/* ── 按列合并：委托给 domain 层 ────────────────────────────────────────
   铁律①②③的**唯一实现处**现在是 src/domain/import-rules.js。
   它是纯函数、不碰 DOM，因而可以在 node 里逐条单测（tests/test-domain.js）——
   以前这些规则只能被端到端测试间接覆盖，而端到端覆盖不到
   「CSV 内部合并」这类路径（v2.1.x 正是在那里漏掉了铁律③）。

   这里只做一件事：把「用户勾选了哪些列」传进去。
   ⚠️ 别再在本文件里写第二份合并循环。v2.1.x 的教训正是
   两份复制体已经漂移，而测试还全绿。 */
function filterSkippedCols(rows, cols){
  return domainFilterSkipped(rows, cols, (importState && importState.skipCols) || new Set());
}

/* ---------- 合并入库 ----------
   三种模式：
   · new       新建批次：本次行原样成为一份独立快照，不做任何合并
   · overwrite 覆盖当前批次：清空后按 append 逻辑导入，辅导员备注按学号搬回
   · append    新增/合并：四条铁律（备注不覆盖 / 空值不覆盖 / 未出现的列保留 / 不静默删除）
   覆盖之所以不违反「不静默删除」铁律：它是用户在界面上显式选择 + 二次确认 +
   已自动备份的一次性授权动作，且备注按学号搬回、未匹配的会点名列出。 */
function doImport(){
  let rows = importState.rows;                   // 已归一的行
  let cols = importState.cols || [];             // 本次表真实出现的列（归一后）
  const mode = importState.mode || 'append';
  const target = activeBatch();

  if(!rows.length){ toast('没有可导入的数据'); return; }

  /* ════════ 模式一：新建批次 ════════ */
  if(mode === 'new'){
    if(S.batches.length >= MAX_BATCHES){
      toast(`批次数量已达上限（${MAX_BATCHES}），请先到批次管理中删除历史批次`);
      return;
    }
    // v2.1.x：本分支不走 doImportMerge，必须自己过一次勾选排除（原先漏了，见 filterSkippedCols）
    ({ rows, cols } = filterSkippedCols(rows, cols));
    /* v1.9.7：硬约束——「一个学号只会出现一次，不要出现重复」。
       原实现：CSV 内部有几条学号重复就原样收几条，导完后批次里会出现「同一个学生两条记录」。
       新实现：按学号 upsert（同 append 的合并口径），重复行按"已有则合并 / 没有则新增"处理，
       并在结果页告诉辅导员「合并了 N 行」以便事后核对。
       ⚠ 这条逻辑不是"另起新批次"的削弱：新批次与现有批次仍然完全隔离，
         只是 CSV **内部**不再允许重复学号产生新行。 */
    const recMap = new Map();
    const badRows = [];
    let rosterSynced = 0, rosterKept = 0;
    let internalMerged = 0;       // CSV 内部被合并的行数
    rows.forEach((r, idx)=>{
      const id = String(r['学号'] ?? '').trim();
      if(!id){ badRows.push(excelRowNo(idx)); return; }
      if(recMap.has(id)){
        // ── CSV 内部学号已见过：按列合并（铁律①②③，与 doImportMerge 同一实现）
        domainMergeRowInto(recMap.get(id), r, cols);
        internalMerged++;
        return;
      }
      // ── 第一次见这个学号
      const rec = {};
      Object.entries(r).forEach(([k,v])=>{ if(v != null && v !== '') rec[k] = v; });
      if(applyRosterRule(rec, importState.kind)) rosterSynced++;
      else if(rosterProtected(rec)) rosterKept++;
      rec['备注（保密）'] = r['备注（保密）'] || null;
      recMap.set(id, rec);
    });
    const recs = [...recMap.values()];
    const b = makeBatch(newBatchName(), 'new', recs, importState.fileName);
    S.batches.push(b);
    attachBatch(b.id);
    S.filters = {}; S.quickView = 'all'; S.classFilter = 'all'; S._search = '';
    save();
    importState.result = {
      mode,
      added: recs.length,                    // 实际写入批次的行数（已经按学号去重）
      updated: 0,                            // new 模式不存在"已有 vs 新增"的概念
      skipped: badRows.length,
      badRows,
      missing: [],
      cols,
      batchName: b.name,
      kind: importState.kind,
      rosterSynced, rosterKept,
      internalMerged                         // v1.9.7：CSV 内部被合并的重复行数
    };
    importState.step = 3;
    renderImport();
    return;
  }

  /* ════════ 模式二：覆盖当前批次（先授权、再备份、再清空） ════════ */
  if(mode === 'overwrite'){
    if(!target){ toast('当前没有批次，请改用「新建批次」'); return; }
    const clearedCount = target.students.length;
    const prevSnapshot = target.students.slice();   // 清空前留一份名单，用于统计"本次移除了谁"

    // ① 用户显式授权（应用内确认框：打包后的 WebView 不支持系统 confirm）
    askConfirm({
      title:'覆盖当前批次', danger:true, okText:'覆盖导入',
      html:`将清空 <b>${clearedCount}</b> 人，替换为本次导入的 <b>${rows.length}</b> 行。<br>辅导员备注会按学号搬回，未匹配上的会在结果页点名列出。<br>执行前会自动导出 CSV 备份。<br><br><b>此操作不可恢复，确认继续？</b>`,
      onOk(){ doImportOverwrite(target, clearedCount, prevSnapshot); }
    });
    return;
  }

  /* ════════ 模式三：新增/合并 ════════ */
  doImportMerge(rows, cols, 'append', null, '', 0, null);
}

/* 覆盖模式：授权后的实际执行（备份 → 备份备注 → 清空 → 复用合并逻辑） */
function doImportOverwrite(target, clearedCount, prevSnapshot){
  const rows = importState.rows, cols = importState.cols || [];
  let backupName = '';
  // ② 自动备份（失败不阻断，但要让人知道）
  if(clearedCount){
    try{
      exportBatchCsv(target, true);
      backupName = `学生数据_${safeName(target.name)}_${todayStr()}.csv`;
      recordBackup({ type:'csv-auto', fileName: backupName, batchName: target.name, batchId: target.id });   // v1.9.7：记入备份历史
    }catch(e){ console.warn('[中南大学生工作台] 覆盖前备份失败', e); }
  }
  // ③ 备份备注（必须在清空之前取）
  const remarkMap = new Map();
  target.students.forEach(s=>{
    const k = String(s['学号'] ?? '').trim();
    if(k && s['备注（保密）']) remarkMap.set(k, { remark: s['备注（保密）'], name: studentName(s) });
  });
  // ④ 清空当前批次，下面复用 append 的合并逻辑写入
  setStudents([]);
  doImportMerge(rows, cols, 'overwrite', remarkMap, backupName, clearedCount, prevSnapshot);
}

/* ════════ 模式二/三：按列合并（四条铁律） ════════ */
function doImportMerge(rows, cols, mode, remarkMap, backupName, clearedCount, prevSnapshot){
  /* ⚠️ v1.9.6：没有批次时（比如批次被删光了）绝不能把数据只写进内存。
     save() 持久化的是「批次」，没有批次 = 界面上看得到人数、结果页也显示"导入成功"，
     但重开程序后「全部学生」是空的 —— 数据悄悄丢了。
     所以先自动建一个批次（用文件名命名）并挂上去，结果页会明说这件事。 */
  let autoBatchName = '';
  if(mode !== 'new' && !activeBatch()){
    const base = String((importState && importState.fileName) || '').replace(/\.(xlsx|xls|csv)$/i, '').trim();
    autoBatchName = base || newBatchName();
    const b = makeBatch(autoBatchName, 'new', [], importState ? importState.fileName : '');
    S.batches.push(b);
    attachBatch(b.id);
  }
  /* v1.9.6：勾选排除的字段 —— 确认页里取消勾选的列不参与导入（学号是合并主键，永远保留）。
     ⚠️ 原注释自称"三条模式路径（new / overwrite / append）就都不用各自处理"，这句话是错的：
     新建批次不走本函数，得自己调一次（v2.1.x 已修，见 filterSkippedCols）。 */
  ({ rows, cols } = filterSkippedCols(rows, cols));
  // v1.5 导入历史：进函数先冻结「导入前」的状态（覆盖模式此时学生已被清空，用传入的快照）
  const preStudents = mode === 'overwrite' ? (prevSnapshot || []).slice() : S.students.slice();
  const preBatchId = activeBatch() ? activeBatch().id : null;
  const preBatchName = activeBatch() ? activeBatch().name : '';
  const preFile = importState ? importState.fileName : '';
  const prevList = mode === 'overwrite' ? [] : S.students;   // 覆盖模式下旧数据已清空
  const prevIds  = new Set((mode === 'overwrite' ? prevSnapshot : prevList).map(s=>String(s['学号'])));
  const map = new Map(prevList.map(s=>[String(s['学号']), s]));
  const seen = new Set();
  let added = 0, updated = 0, skipped = 0, internalMerged = 0;   // v1.9.7：CSV 内部重复行被合并的条数
  const badRows = [];
  // v1.9.2：名册导入 → 政治面貌同步的计数（synced=真改了，kept=因已是党员/发展对象而保住）
  const sheetKind = importState ? importState.kind : 'student';
  let rosterSynced = 0, rosterKept = 0;

  rows.forEach((r, idx)=>{
    const id = String(r['学号'] ?? '').trim();
    if(!id){ skipped++; badRows.push(excelRowNo(idx)); return; }   // Excel 真实行号（表头可能不在第 1 行）
    const isInternalDup = seen.has(id);   // v1.9.7：本次 CSV 里之前已见过这个学号
    seen.add(id);

    if(map.has(id)){
      // ── 已存在：逐列合并（铁律①②③，与 doImport 的 CSV 内部合并同一实现）──
      const old = map.get(id);
      domainMergeRowInto(old, r, cols);
      // v1.9.2：名册导入时顺手同步政治面貌（已是党员/发展对象的受保护，不降级）
      if(sheetKind === 'roster'){
        if(rosterProtected(old)) rosterKept++;
        else if(applyRosterRule(old, 'roster')) rosterSynced++;
      }
      updated++;
      if(isInternalDup) internalMerged++;            // v1.9.7：与"已有 prevList"无关，专门统计 CSV 内部重复
    }else{
      // ── 新增：只写入本行真正有值的列 ──
      const rec = {};
      Object.entries(r).forEach(([k,v])=>{ if(v != null && v !== '') rec[k] = v; });
      if(applyRosterRule(rec, sheetKind)) rosterSynced++;   // v1.9.2：名册上的人 → 直接记为入党积极分子
      rec['备注（保密）'] = r['备注（保密）'] || null;
      map.set(id, rec);
      added++;
    }
  });

  // 覆盖模式：把旧备注按学号搬回新数据 —— 让「覆盖」不等于「备注全丢」
  let carried = 0;
  const unmatchedRemarks = [];
  if(remarkMap){
    remarkMap.forEach((info, id)=>{
      const s = map.get(id);
      if(!s){                                  // 新表里没有这个学号，备注搬不回去
        unmatchedRemarks.push(`${info.name || '（无姓名）'}（${id}）`);
      }else{
        if(!s['备注（保密）']) s['备注（保密）'] = info.remark;
        carried++;
      }
    });
  }

  // 铁律④：不静默删除 —— 本次表里没出现的学生只做统计（覆盖模式下属"已被替换"）
  // 必须以「导入前的名单」为基准遍历：覆盖模式下 map 是从空表重建的，
  // 若遍历 map 会永远得到 0，把"本次移除了多少人"算丢。
  const missing = [];
  prevIds.forEach(id=>{ if(!seen.has(id)) missing.push(id); });

  setStudents([...map.values()]);
  markDataChanged();   // v1.4：有新数据 → 触发备份提醒（若尚未导出过备份）
  save();
  // 结果需在导入前计算并冻结，避免二次统计出错
  importState.result = {
    mode, added, updated, skipped, badRows, missing, cols,
    total: rows.length, carried, unmatchedRemarks, clearedCount, backupName,
    kind: sheetKind, rosterSynced, rosterKept,   // v1.9.2：名册同步统计
    autoBatchName,                                 // v1.9.6：无批次时自动建的批次名
    internalMerged                                  // v1.9.7：CSV 内部重复被合并的条数
  };
  importState.step = 3;
  renderImport();
  maybeBackupRemind();   // v1.4：导入成功 1.2s 后弹备份提醒（若尚未导出过备份）
  // v1.5 导入历史：留档 + 快照（桌面版写磁盘）
  recordImport(
    mode === 'overwrite' ? '学生数据·覆盖' : mode === 'new' ? '学生数据·新批次' : '学生数据·合并',
    preFile,
    { batch: preBatchName, batchId: preBatchId, added, updated, skipped: skipped + badRows.length },
    { kind:'students', batchId: preBatchId, students: preStudents }
  );
}

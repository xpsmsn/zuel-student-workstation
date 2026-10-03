/* ════════════════════════════════════════════════════════════════════════
   features/import-unified.js —— 统一数据导入口
   ────────────────────────────────────────────────────────────────────────
   v2.3（2026-10-03 用户要求）：
   原来有**两个**入口 ——「导入学生表」和「导入成绩单」，两套 UI、两条流程，
   12 个调用点散落在各处。用户的判断很对：

     「所有的信息录入其实都在一个入口，都是围绕学号进行数据的更新。」

   合并成一条流水线：

       选文件 → 自动认出这是什么表 → 确认 → 按学号写进去

   ── 为什么能合并（不是硬凑） ────────────────────────────────────────
   两件事的本质完全一样：**把一张表按学号 upsert 进当前批次**。
   差别只在「写进哪一层数据」：
     · 学生表 / 名册 → 写 S.students（档案字段）
     · 成绩表       → 写 S.grades（成绩指标，**不碰档案**）

   成绩必须单独存是硬约束（ADR-0005）：成绩一旦复制进学生记录，
   「只更新成绩」就会把 41 列档案抹平。所以统一的是**流程**，不是**存储**。

   ── 复用而非重写 ──────────────────────────────────────────────────────
   解析逻辑沿用既有的 buildImportState() / parseGradeSheet() / detectSheetKind()，
   这里只做「选文件 → 认类型 → 分派」。任何解析规则的修正仍然只有一处，
   不会出现两条路径走样（v2.1.x 的教训）。
   ════════════════════════════════════════════════════════════════════════ */

let unifiedImport = { fileName: '', sheetName: '', arr: null, kind: null, auto: false, parsed: null };

const KIND_LABEL = {
  student: '学生信息表',
  grades:  '成绩信息表',
  roster:  '名册（政治面貌名单）',
};

/** 这个类型会写进哪一层 —— 界面上要明说，不能让用户猜 */
function kindTarget(kind) {
  return kind === 'grades'
    ? '成绩<b>单独保存</b>，不会改动任何学生档案字段'
    : '学生档案字段（姓名 / 班级 / 宿舍 / 联系方式 …）';
}

/* ── 入口 ────────────────────────────────────────────────────────────── */

/**
 * 唯一的导入口。所有「导入」按钮都调它。
 * @param {string} [hint] 顶部一句提示（例如「本批还没有成绩，先导成绩表」）
 */
function openImport(hint) {
  closeSidebar();
  const b = activeBatch();
  unifiedImport = { fileName: '', sheetName: '', arr: null, kind: null, auto: false, parsed: null };

  const pick = dropHtml(
    '选择要导入的表（.xlsx / .xls / .csv）',
    b ? `当前批次「${esc(b.name)}」· ${b.students.length} 人。学生表和成绩表都能自动认出来`
      : '还没有任何批次。选一份学生信息表就会新建一个批次');

  const body = b
    ? (hint ? `<div class="hint">${hint}</div>` : '') + pick
    : `<div class="hint" style="border-color:var(--warn-line);background:var(--warn-soft)">
         还没有任何数据批次。选一份<b>学生信息表</b>就会新建一个批次。
       </div>` + pick;

  $('modalRoot').innerHTML = `
  <div class="mask" onclick="if(event.target===this)closeModal()">
    <div class="modal wide" onclick="event.stopPropagation()">
      <div class="modal-head">
        <div class="modal-title">导入数据</div>
        <div class="modal-close" onclick="closeModal()" aria-label="关闭">×</div>
      </div>
      <div class="modal-body" id="uiBody">${body}</div>
      <div class="modal-foot">
        <button class="btn" onclick="closeModal()">取消</button>
        <button class="btn pri" id="uiOk" style="display:none" onclick="doUnifiedImport()">确认导入</button>
      </div>
    </div>
  </div>`;
}

function dropHtml(title, sub) {
  return `
    <div class="drop" onclick="document.getElementById('uiFileInput').click()" role="button" tabindex="0">
      <div class="drop-t">${title}</div>
      <div class="drop-s">${sub}</div>
    </div>
    <input type="file" id="uiFileInput" accept=".xlsx,.xls,.csv" style="display:none" onchange="handleUnifiedFile(event)">`;
}

/* ── 读文件 → 认类型 ────────────────────────────────────────────────── */

function handleUnifiedFile(e) {
  const f = e.target.files[0];
  if (!f) return;
  if (!/\.(xlsx|xls|csv)$/i.test(f.name)) { toast('请选择 .xlsx / .xls / .csv 文件'); return; }
  if (typeof XLSX === 'undefined') { toast('当前环境缺少表格解析库'); return; }

  const reader = new FileReader();
  reader.onload = ev => {
    let wb;
    try {
      wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array', cellDates: false });
    } catch (err) {
      console.error(err);
      openFileError(f.name, err);   // 复用既有的「读不了就明说」弹窗
      return;
    }
    try {
      /* 一份导出里可能有多张表（真实数据：学生表 189 行 + 班委名册 90 行）。
         有多张有数据的表时沿用既有的选择流程，不在这里另造一套。 */
      const cands = sheetsNeedingPick(wb);
      if (cands.length > 1) { openSheetChooser(cands, wb, f.name); return; }

      const useName = cands.length ? cands[0].name : wb.SheetNames[0];
      const arr = XLSX.utils.sheet_to_json(wb.Sheets[useName], { header: 1, defval: null, raw: false });
      if (!arr || !arr.length) { toast('这个表里没有数据'); return; }
      unifiedImport = { fileName: f.name, sheetName: useName, arr, kind: null, auto: false, parsed: null };
      renderUnifiedPreview();
    } catch (err) {
      console.error(err);
      openFileError(f.name, err);
    }
  };
  reader.readAsArrayBuffer(f);
}

/** 多表时的选表界面：选定后回到本流程 */
function openSheetChooser(cands, wb, fileName) {
  importState.wb = wb;
  importState.fileName = fileName;
  importState.sheetChoices = cands;
  importState.step = 0;
  closeModal();
  renderImport();
}

/* ── 确认页 ─────────────────────────────────────────────────────────── */

function renderUnifiedPreview() {
  const body = $('uiBody');
  if (!body) return;
  const okBtn = $('uiOk');
  if (okBtn) okBtn.style.display = 'inline-flex';

  /* 先按「学生表」的口径探一次表头，拿到列名才能判类型 */
  const hdr = locateHeaderRow(unifiedImport.arr);
  const rawHeader = (unifiedImport.arr[hdr] || []).map(x => String(x == null ? '' : x));
  const normCols = [];
  rawHeader.forEach(h => { const n = normalizeKey(h); if (n && normCols.indexOf(n) === -1) normCols.push(n); });
  const kind = detectSheetKind(normCols);
  unifiedImport.kind = kind;
  unifiedImport.auto = true;

  body.innerHTML = `
    <div class="filebox" style="margin-bottom:14px">
      <div class="file-ico">X</div>
      <div style="flex:1;min-width:0">
        <div class="file-name">${esc(unifiedImport.fileName)}</div>
        <div class="file-meta">${unifiedImport.sheetName ? '工作表「' + esc(unifiedImport.sheetName) + '」 · ' : ''}表头在第 ${hdr + 1} 行</div>
      </div>
    </div>

    <div class="hint" style="border-color:var(--brand-line);background:var(--brand-soft)">
      <b>认出这是「${KIND_LABEL[kind]}」</b>（自动识别）· 写入${kindTarget(kind)}
    </div>

    <div style="margin-top:14px" id="uiDetail"></div>`;

  runUnifiedParse(kind, hdr, rawHeader);
}

/** 按类型算清楚「会写进多少人」 */
function runUnifiedParse(kind, hdr, rawHeader) {
  const detail = $('uiDetail');
  if (!detail) return;
  const arr = unifiedImport.arr;

  if (kind === 'grades') {
    const p = parseGradeSheet(arr);
    if (!p.ok) { detail.innerHTML = `<div class="hint">${esc(p.reason)}</div>`; return; }
    unifiedImport.parsed = p;
    const sidOf = r => String(r && r['学号'] != null ? r['学号'] : '').trim();
    const sids = new Set(S.students.map(s => sidOf(s)).filter(Boolean));
    const matched = p.rows.filter(r => sids.has(sidOf(r))).length;
    const orphan = p.rows.length - matched;
    detail.innerHTML = `
      <div class="result-row" style="margin-bottom:12px">
        ${rb(p.rows.length, '成绩记录', 'var(--brand)')}
        ${rb(matched, '按学号匹配上', 'var(--ok)')}
        ${rb(orphan, '学生表中没有', orphan ? 'var(--warn)' : 'var(--text-3)')}
        ${rb(S.students.length, '本批学生', 'var(--text-3)')}
      </div>
      <div class="hint">
        成绩表结构比较脏（开头有标题带、末尾有合计行），都已自动跳过 ·
        表头在第 ${p.headerIdx + 1} 行${p.dropped.length ? ` · 跳过 ${p.dropped.length} 行非数据行` : ''}<br>
        识别到的列：${p.header.filter(Boolean).slice(0, 12).map(esc).join('、')}${p.header.length > 12 ? ' …' : ''}<br>
        本次表里没出现的学号，其原有成绩<b>保留不动</b>。
      </div>
      ${orphan ? `<div class="hint" style="border-color:var(--warn-line);background:var(--warn-soft)">
        有 ${orphan} 条成绩在学生表里找不到对应学号，仍会保存但不会显示在任何学生详情里。
      </div>` : ''}`;
    return;
  }

  // 学生表 / 名册：交给既有解析，并算出命中情况
  const { rows, rowNos } = buildRawRows(arr, hdr, rawHeader);
  const ok = buildImportState(rawHeader, rows, unifiedImport.fileName, hdr, rowNos);
  unifiedImport.parsed = ok;   // buildImportState 已把结果写进 importState
  const sidOf = r => String(r && r['学号'] != null ? r['学号'] : '').trim();
  const sids = new Set(S.students.map(s => sidOf(s)).filter(Boolean));
  const exist = ok.rows.filter(x => sids.has(sidOf(x))).length;

  detail.innerHTML = `
    <div class="result-row" style="margin-bottom:12px">
      ${rb(ok.rows.length, '有效数据行', 'var(--brand)')}
      ${rb(exist, '按学号命中', 'var(--ok)')}
      ${rb(ok.rows.length - exist, '新学号', (ok.rows.length - exist) ? 'var(--brand-deep)' : 'var(--text-3)')}
      ${rb(ok.cols.length, '字段数', 'var(--text-3)')}
    </div>
    <div class="hint">
      ${ok.emptyCols.length ? `有 <b>${ok.emptyCols.length}</b> 列在这张表里整列为空，导入时会勾掉 —— 不带来新信息也不覆盖旧值。<br>` : ''}
      已有学号按<b>按列合并</b>更新：备注永不覆盖、本表没出现的列原样保留。<br>
      下一步可以选「合并到当前批次 / 覆盖当前批次 / 新建批次」。
    </div>`;
}

function rb(v, l, color) {
  return `<div class="result-box"><div class="v" style="color:${color}">${v}</div><div class="l">${l}</div></div>`;
}

/* ── 确认写入 ───────────────────────────────────────────────────────── */

function doUnifiedImport() {
  const kind = unifiedImport.kind;
  if (!kind) { toast('没能识别这个表，请重选文件'); return; }

  if (kind === 'grades') {
    const p = unifiedImport.parsed;
    if (!p || !p.rows.length) { toast('没有可导入的成绩记录'); return; }
    const preGrades = (S.grades || []).slice();
    const b = activeBatch();
    /* 按学号 upsert：已有的更新、没有的新增；本次未出现的学号原样保留 */
    const m = new Map((S.grades || []).map(g => [String(g['学号'] == null ? '' : g['学号']).trim(), g]));
    let added = 0, updated = 0;
    p.rows.forEach(r => {
      const id = String(r['学号']).trim();
      const rec = {};
      Object.entries(r).forEach(([k, v]) => { if (v != null && v !== '') rec[k] = v; });
      rec['学号'] = id;
      if (m.has(id)) { Object.assign(m.get(id), rec); updated++; } else { m.set(id, rec); added++; }
    });
    setGrades([...m.values()]);
    markDataChanged(); save();
    closeModal(); renderBatchBar(); renderSidebar(); renderMain();
    maybeBackupRemind();
    recordImport('成绩', unifiedImport.fileName,
      { batch: b ? b.name : '', batchId: b ? b.id : null, added, updated, skipped: 0 },
      { kind: 'grades', batchId: b ? b.id : null, grades: preGrades });
    toast(`成绩已导入：更新 ${updated} 人、新增 ${added} 人`);
    return;
  }

  /* 学生表 / 名册：buildImportState 已经把 importState 填好了，
     直接跳到模式选择那一步（合并 / 覆盖 / 新建）。 */
  if (!importState.rows || !importState.rows.length) { toast('这个表里没有可导入的数据行'); return; }
  importState.step = 2;
  importState.mode = activeBatch() ? (importState.mode || 'append') : 'new';
  closeModal();
  renderImport();
}

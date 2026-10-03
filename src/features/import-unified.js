/* ════════════════════════════════════════════════════════════════════════
   features/import-unified.js —— 唯一的导入口
   ─────────────────────────────────────────────────────────────────═══════
   辅导员 2026-10-03 说了两次，第二遍才说透：

     第一次：「所有的信息录入其实都在一个入口，都是围绕学号进行数据的更新。」
     第二次：「入口到看一下有没有什么办法集中在一个地方？」

   我第一遍做成了「一个入口 + 六个分类 + 让人选类型」，他立刻推翻了：
   **把简单的事做复杂了。** 那是我的错 —— 分类是我替用户做的决定。

   正确的模型只有一句话：

       丢一张表进来 → 有姓名或学号就认人 → 认得出的更新，认不出的新增

   就这样。程序自己去认，界面不问他。

   ── 所以这个文件里没有的东西（曾经都有过）───────────────────────────
     ✗ 分类卡片（每年一次 / 每学期一次 / 随时可导）
     ✗ 让用户选「这是学生表还是成绩表」
     ✗ 让用户选「哪一列是学号」
   全删了。「无模板的表格」这件事**在底层解决**，不在界面上摆一个选项。

   ── 那底层怎么统一？───────────────────────────────────────────────────
   判据不是「这张表叫什么」，而是「这一列能不能认人」：
     有学号 → 按学号认（最稳）
     只有姓名 → 按姓名+班级认（重名也能区分）
   认得出人，就往对应的学生身上合并；认不出但有姓名的，当新学生加进来。
   至于「成绩要不要单独存」——那是**另一条铁律**（ADR-0005），
   不是分类问题：认出来是成绩列就写成绩层，是档案列就写档案，互不干扰。

   ── 唯一保留的一处提问 ────────────────────────────────────────────────
   「这份表跟当前批次是什么关系」：合并 / 覆盖 / 新建批次。
   理由：这三者的后果差别很大（覆盖会清掉旧数据），值得问一句。
   其余一律不问。
   ════════════════════════════════════════════════════════════════════════ */

let unifiedImport = { fileName: '', sheetName: '', arr: null, kind: null, auto: false, parsed: null };

/** 这个类型会写进哪一层 —— 界面上要明说，不能让用户猜 */
function kindTarget(kind) {
  if (kind === 'grades') return '成绩<b>单独保存</b>，不会改动任何学生档案字段';
  return '学生档案（姓名 / 班级 / 宿舍 / 联系方式 …）';
}

/* ── 入口 ────────────────────────────────────────────────────────────── */

/**
 * 唯一的导入口。**所有**「导入」按钮都调它，界面不问任何问题。
 * @param {string} [hint] 顶部一句提示（例如从列表工具条点过来的）
 */
function openImport(hint) {
  closeSidebar();
  const b = activeBatch();
  unifiedImport = { fileName: '', sheetName: '', arr: null, kind: null, auto: false, parsed: null };

  const body = `
    ${hint ? `<div class="hint">${hint}</div>` : ''}
    ${b ? `<div class="hint">当前批次「<b>${esc(b.name)}</b>」· ${b.students.length} 人</div>` : ''}
    ${dropHtml('把表拖进来，或点这里选文件',
      '学生表、成绩单、党团发展表、班委信息表… 都能认。认得出学号或姓名就会对上人，对不上的会新增。')}`;

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
        <button class="btn pri" id="uiOk" style="display:none" onclick="doUnifiedImport()">下一步</button>
      </div>
    </div>
  </div>`;
}

function dropHtml(title, sub) {
  return `
    <div class="drop" onclick="document.getElementById('uiFileInput').click()" role="button" tabindex="0"
         ondragover="event.preventDefault();this.classList.add('drag')"
         ondragleave="this.classList.remove('drag')"
         ondrop="event.preventDefault();this.classList.remove('drag');handleUnifiedDrop(event)">
      <div class="drop-t">${title}</div>
      <div class="drop-s">${sub}</div>
    </div>
    <input type="file" id="uiFileInput" accept=".xlsx,.xls,.csv" style="display:none" onchange="handleUnifiedFile(event)">`;
}

/** 拖进来的文件 */
function handleUnifiedDrop(e) {
  const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  if (!f) return;
  readUnifiedFile(f);
}



/* ── 读文件 → 认类型 ────────────────────────────────────────────────── */

function handleUnifiedFile(e) {
  const f = e.target.files[0];
  if (!f) return;
  readUnifiedFile(f);
}

function readUnifiedFile(f) {
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
         有多张有数据的表时沿用既有的选择流程，不另造一套。 */
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

/**
 * 读完表之后做三件事，**顺序不能换**：
 *   ① 找到表头在哪一行
 *   ② 找到哪一列能认人（有学号最好，没有就姓名+班级）
 *   ③ 拿这列去对当前批次，算出「对上几个 / 对不上几个」
 *
 * 第 ③ 步的结果就是要给用户看的全部。不再问「这是学生表还是成绩表」——
 * 因为不管是哪种，处理方式都一样：按认出的这一列把人找出来。
 * 唯一还要分的是「写进档案还是写进成绩」，而那个由**列名本身**决定
 * （出现加权平均成绩这类列就走成绩层），不问他。
 */
function renderUnifiedPreview() {
  const body = $('uiBody');
  if (!body) return;
  const okBtn = $('uiOk');
  if (okBtn) { okBtn.style.display = 'inline-flex'; okBtn.textContent = '下一步'; }

  const arr = unifiedImport.arr;
  const hdr = guessHeaderRow(arr);              // 前几行可能是标题带，得自己找
  const rawHeader = (arr[hdr] || []).map(x => String(x == null ? '' : x));
  const normCols = [];
  rawHeader.forEach(h => { const n = normalizeKey(h); if (n && normCols.indexOf(n) === -1) normCols.push(n); });

  const idCol = guessIdCol(normCols);
  unifiedImport.headerIdx = hdr;
  unifiedImport.rawHeader = rawHeader;
  unifiedImport.normCols = normCols;

  if (!idCol) {
    /* 认不出人 → 什么都做不了，只能说清楚缺什么。
       这是唯一值得中断的情况：没有身份列，这张表跟现有数据毫无关系。 */
    if (okBtn) okBtn.style.display = 'none';
    body.innerHTML = `
      ${filebox(hdr)}
      <div class="hint" style="border-color:var(--warn-line);background:var(--warn-soft)">
        <b>这张表里找不到能认出人的列</b><br>
        需要 <b>学号</b> 或 <b>姓名</b>（配合班级更好）。没有这两列，
        就没法知道这一行是谁。<br>
        现在的列：${rawHeader.filter(Boolean).slice(0, 12).map(esc).join('、')}
      </div>`;
    return;
  }

  /* 认出人之后，按普通路径解析（有学号走 buildRawRows，按学号剥汇总行） */
  const { rows, rowNos } = buildRawRows(arr, hdr, rawHeader);
  const parsed = buildImportState(rawHeader, rows, unifiedImport.fileName, hdr, rowNos);
  unifiedImport.kind = parsed.kind || 'student';
  unifiedImport.parsed = parsed;

  const sidOf = s => String(s['学号'] == null ? '' : s['学号']).trim();
  const nameOf = s => String(s['姓名'] || s['姓名1'] || '').trim();
  const known = new Map();
  S.students.forEach(s => {
    if (sidOf(s)) known.set('s:' + sidOf(s), s);
    if (nameOf(s)) known.set('n:' + nameOf(s) + '|' + String(s['班级'] || '').trim(), s);
    if (nameOf(s) && !known.has('n:' + nameOf(s))) known.set('n:' + nameOf(s), s);
  });

  const hasSid = idCol.kind !== 'name';
  let hit = 0;
  const misses = [];
  parsed.rows.forEach(r => {
    const k = hasSid
      ? 's:' + String(r['学号'] == null ? '' : r['学号']).trim()
      : 'n:' + String(r['姓名'] || r['姓名1'] || '').trim() + '|' + String(r['班级'] || '').trim();
    const k2 = hasSid ? null : 'n:' + String(r['姓名'] || r['姓名1'] || '').trim();
    if (known.has(k) || (k2 && known.has(k2))) hit++;
    else misses.push(r);
  });

  const isGrades = parsed.kind === 'grades';
  body.innerHTML = `
    ${filebox(hdr)}
    <div class="hint" style="border-color:var(--brand-line);background:var(--brand-soft)">
      ${isGrades
        ? `认出这是<b>成绩表</b> —— 成绩会单独保存，不改动任何学生档案字段。`
        : `认出这是<b>学生信息表</b> —— 按<b>${esc(idCol.col)}</b>对上人，已有的更新、认不出的新增。`}
    </div>
    <div class="result-row" style="margin:14px 0">
      ${rb(parsed.rows.length, '数据行', 'var(--brand)')}
      ${rb(hit, '已经对上', hit ? 'var(--ok)' : 'var(--warn)')}
      ${rb(misses.length, '认不出（会新增）', misses.length ? 'var(--brand-deep)' : 'var(--text-3)')}
      ${rb(parsed.cols.length, '字段', 'var(--text-3)')}
    </div>
    ${parsed.emptyCols.length ? `<div class="hint">
      有 <b>${parsed.emptyCols.length}</b> 列在这张表里整列为空（${parsed.emptyCols.slice(0, 6).map(esc).join('、')}${parsed.emptyCols.length > 6 ? ' …' : ''}），
      不带信息也不会覆盖旧值，下一步可以取消勾选。</div>` : ''}
    ${misses.length ? `<div class="hint">
      认不出的 ${misses.length} 行会**新建成学生**：${misses.slice(0, 6).map(r => esc(nameOf(r) || r['学号'] || '?')).join('、')}${misses.length > 6 ? ' …' : ''}
      ${activeBatch() ? '' : '<br>当前还没有任何批次，这批人会直接成为新批次。'}
    </div>` : ''}`;
}

function filebox(hdr) {
  return `
    <div class="filebox" style="margin-bottom:14px">
      <div class="file-ico">X</div>
      <div style="flex:1;min-width:0">
        <div class="file-name">${esc(unifiedImport.fileName)}</div>
        <div class="file-meta">${unifiedImport.sheetName ? '工作表「' + esc(unifiedImport.sheetName) + '」 · ' : ''}表头在第 ${hdr + 1} 行</div>
      </div>
    </div>`;
}

/** 按类型算清楚「会写进多少人」 */
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

  /* 其余都走这一条：把 importState 交给既有向导，去选「合并 / 覆盖 / 新建」。
     为什么党团表、班委表也走这里 —— 因为它们认得出人，
     认得出人的表就该按列合并进档案，**不需要**「附加表」那一层。
     曾经设计过「自定义列存成独立附加表」，是过度设计：
     多一个地方存同一批人的信息，两处迟早会不一致。 */
  if (!importState.rows || !importState.rows.length) { toast('这个表里没有可导入的数据行'); return; }
  importState.step = 2;
  importState.mode = activeBatch() ? (importState.mode || 'append') : 'new';
  closeModal();
  renderImport();
}




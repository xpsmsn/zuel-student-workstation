/* ---------- 导入向导 ---------- */
let importState = {
  step:1, fileName:'', header:[], cols:[], emptyCols:[], rows:[],
  mode:'append'          // append 新增合并 | overwrite 覆盖当前批次 | new 新建批次
};

/* newBatchName() 已移入 core/01-state.js —— 它是「批次起名」，
   core 的 setStudents 兜底也要用；住在导入向导里会造成 core → feature 反向依赖。 */

/* 导入方式单选卡（v1.9.6 紧凑化：标题 + 短标签；详细规则看下方 modeHint()） */
function modeCard(id, title, tag, tone){
  const on = importState.mode === id;
  return `<div class="mode-card ${on?'on':''} ${tone||''}" onclick="setImportMode('${id}')">
    <div class="mode-head"><span class="mode-radio">${on?'●':'○'}</span><span class="mode-t">${title}</span></div>
    <div class="mode-tag">${tag}</div>
  </div>`;
}
function setImportMode(id){ importState.mode = id; renderImport(); }

/* v1.9.6：确认页里勾选/取消某一列是否导入（学号是合并主键，不可排除） */
function toggleImportCol(k, on){
  if(k === '学号') return;
  importState.skipCols = importState.skipCols || new Set();
  if(on) importState.skipCols.delete(k); else importState.skipCols.add(k);
  renderImport();
}
/* 勾选结果的实时小结：这次进几个字段、排除了哪些。
   名册导入若把「政治面貌」排除掉，自动同步就不会发生 —— 必须当场提醒，不能等导入完才发现。 */
function importFieldSummary(){
  const m = importState;
  const all = m.cols || [];
  if(!all.length) return '';
  const skipped = all.filter(c=>m.skipCols && m.skipCols.has(c));
  const keep = all.length - skipped.length;
  let html = `<div class="hint" style="margin-top:10px">
    <b>本次将导入 ${keep} / ${all.length} 个字段</b>${
      skipped.length
        ? `（已排除：<b>${skipped.map(esc).join('、')}</b> —— 这些列不会进来，本机已有数据不受影响）`
        : '（默认全部导入）'}`;
  if(m.kind === 'roster' && skipped.indexOf('政治面貌') >= 0){
    html += `<br><b style="color:var(--warn)">⚠ 名册导入排除了「政治面貌」：本次不会把任何人同步为"入党积极分子"。</b>`;
  }
  return html + `</div>`;
}

/* 模式对应的规则说明（覆盖模式必须把风险写在明面上） */
function modeHint(mode){
  const cur = activeBatch();
  if(mode === 'overwrite'){
    return `<b style="color:var(--danger)">覆盖模式：先清空当前批次，再导入本次数据</b><br>
      · 当前批次「${esc(cur?cur.name:'-')}」共 <b>${cur?cur.students.length:0}</b> 人将被替换<br>
      · 执行前<b>自动导出 CSV 备份</b>；辅导员备注按学号搬回，未匹配上的会在结果页点名列出<br>
      · 新表里没有出现的学生<b>会被移除</b> —— 这正是「覆盖」的含义，请在下一步核对人数`;
  }
  if(mode === 'new'){
    return `<b>新建批次：另起一份独立快照</b><br>
      · 本次导入的全部行组成一个新批次，与现有数据完全隔离，不参与任何合并<br>
      · 适合「换一届学生」「另带一个班」这类场景；导入后自动切换到新批次`;
  }
  return `<b>导入规则（四条铁律）</b><br>
    · 已有备注<b>永不覆盖</b>；空值<b>不覆盖</b>已有内容；本次表里没出现的列<b>原样保留</b><br>
    · 新表里没出现的学生<b>不会被删除</b>，只提示「本次未覆盖」<br>
    · 最稳妥的默认方式，适合同一批学生的信息补全与更新`;
}

/* 把「原始表头 + 原始行」整理成导入态：列名归一、行归一、记录本次表真实列 */
/* 把「本次表里的第 idx 行」换算成 Excel 里的真实行号。
   优先用导入时逐行记下的原始行号（表头可能不在第 1 行、中间还可能剔掉合计行），
   拿不到才退回按「表头行 + 2」估算。 */
function excelRowNo(idx){
  const m = importState && importState.rowNos;
  if(m && m[idx] != null) return m[idx];
  return idx + ((importState && importState.headerIdx) || 0) + 2;
}

/** 把「表头 + 原始行」整理成 importState（学生导入唯一的「表 → importState」入口）。
 *      @param noRender true = 只填状态不弹界面（统一入口要给自己的预览）
 *      @returns importState（历史上它不返回任何东西，这里补上 —— 少一次「拿返回值」的坑） */
function buildImportState(rawHeader, rawRows, fileName, headerIdx, rowNos, noRender){
  const cols = [];                        // 归一后的列（去重）
  const headerMap = rawHeader.map(h=>{
    const raw = String(h == null ? '' : h).trim();
    const norm = normalizeKey(raw);
    if(norm && cols.indexOf(norm) === -1) cols.push(norm);
    return { raw, norm, renamed: !!raw && raw !== norm };
  });

  const rows = rawRows.map(r=>{
    const o = {};
    rawHeader.forEach((h,i)=>{
      const raw = String(h == null ? '' : h).trim();
      if(raw) o[raw] = (r[i] == null ? '' : r[i]);
    });
    return normalizeRow(o);              // 同行多别名 → 取非空值
  });

  importState.fileName = fileName;
  importState.headerIdx = headerIdx || 0; // v1.9.2：表头在第几行（0-based），用于还原 Excel 行号
  importState.rowNos = rowNos || null;    // v1.9.2：每行对应的 Excel 真实行号（中途剔过行也准）
  importState.kind = detectSheetKind(cols); // v1.9.2：'roster' = 入党积极分子名册
  importState.header = headerMap;        // [{raw, norm, renamed}]
  importState.cols = cols;               // 本次表真实出现的列（归一后）→ 合并时只动这些列
  importState.rows = rows;
  // 本列全空 → 导入后不带来新信息，提前告知（而不是导入完才发现一片空）
  importState.emptyCols = cols.filter(c => !rows.some(r => r[c] != null && r[c] !== ''));
  importState.skipCols = new Set();      // v1.9.6：换文件后重置勾选，默认全部导入
  importState.step = 2;

  /* ⚠️ renderImport() 会把整个弹窗换掉。统一入口
     （features/import-unified.js 的 renderUnifiedPreview）想先给用户看一份
     「对上几个 / 认不出几个」的预览再进下一步，所以那边需要**只填不渲染**。
     用 noRender 开关，而不是在调用方 hack 时序 —— 副作用顺序很难猜。 */
  if (!noRender) renderImport();
  return importState;
}

/* openImport() 已移入 features/import-unified.js ——
   现在**只有一个**导入口，学生表与成绩表由程序自动识别
   （v2.3：原来这里是「导入学生表」，另有 openGradeImport() 是第二条流程）。
   本文件只负责「模式选择 → 字段勾选 → 写入」这三步，
   也就是两种表共用的后半程。 */

function renderImport(){
  const m = importState;
  let body = '';

  if(m.step===0){
    const list = (m.sheetChoices || []).map(c => `
      <div class="filebox" style="margin-top:10px">
        <div class="file-ico">X</div>
        <div style="flex:1;min-width:0">
          <div class="file-name">${esc(c.name)}</div>
          <div class="file-meta">${c.rows} 行 · ${c.cols} 列${c.header.length ? ' · ' + esc(c.header.join(' / ')) : ''}</div>
        </div>
        <button class="btn pri" onclick="chooseSheet(${esc(JSON.stringify(c.name))})">用这张</button>
      </div>`).join('');
    body = `
      <div class="steps">
        <div class="step on"><div class="step-n">1</div>选择文件</div><div class="step-line"></div>
        <div class="step"><div class="step-n">2</div>确认导入</div><div class="step-line"></div>
        <div class="step"><div class="step-n">3</div>完成</div>
      </div>
      <div class="hint">这份文件里有 <b>${(m.sheetChoices || []).length}</b> 张工作表都有数据。
        选一张导入 —— <b>其余不会读</b>，避免把别的东西混进来。</div>
      ${list}
      <div class="hint" style="margin-top:12px">文件名：<b>${esc(m.fileName || '')}</b></div>`;
  }
  else if(m.step===1){
    const cur = activeBatch();
    body = `
      <div class="steps">
        <div class="step on"><div class="step-n">1</div>选择文件</div><div class="step-line"></div>
        <div class="step"><div class="step-n">2</div>确认导入</div><div class="step-line"></div>
        <div class="step"><div class="step-n">3</div>完成</div>
      </div>
      <div class="drop" onclick="document.getElementById('fileInput').click()">
        <div class="drop-ico">📄</div>
        <div class="drop-t">点击选择 Excel 文件</div>
        <div class="drop-s">支持 .xlsx / .xls（含 Excel 97-2003 旧格式）· <b>迎新系统、新系统导出的原始表都可以直接导入，无需任何预处理</b></div>
      </div>
      <input type="file" id="fileInput" accept=".xlsx,.xls" style="display:none" onchange="handleFile(event)">

      <div class="modelabel">导入方式</div>
      <div class="modes">
        ${modeCard('append','新增 / 合并','日常用这个 · 备注永不覆盖')}
        ${modeCard('overwrite','覆盖当前批次','整批替换 · 删前自动备份','danger')}
        ${modeCard('new','新建批次','另起一份 · 与现有批次并存')}
      </div>
      <div class="hint" style="margin-top:14px">${modeHint(m.mode)}</div>
      ${m.rows.length ? `
      <div class="filebox" style="margin-top:14px;margin-bottom:0">
        <div class="file-ico">X</div>
        <div style="flex:1;min-width:0">
          <div class="file-name">${esc(m.fileName)}</div>
          <div class="file-meta">已解析 ${m.rows.length} 行 · ${m.header.length} 个字段（换了导入方式也能直接继续）</div>
        </div>
        <button class="btn pri" onclick="importState.step=2;renderImport()">继续</button>
      </div>` : ''}`;
  }
  else if(m.step===2){
    body = `
      <div class="steps">
        <div class="step done"><div class="step-n">✓</div>选择文件</div><div class="step-line"></div>
        <div class="step on"><div class="step-n">2</div>确认导入</div><div class="step-line"></div>
        <div class="step"><div class="step-n">3</div>完成</div>
      </div>
      <div class="filebox">
        <div class="file-ico">X</div>
        <div style="flex:1">
          <div class="file-name">${esc(m.fileName)}</div>
          <div class="file-meta">已识别 ${m.rows.length} 行数据 · ${m.header.length} 个字段</div>
        </div>
        <span class="ok-badge">✓ 解析成功</span>
      </div>
      <div class="hint">表头识别结果如下。<b>不同系统导出的列名会自动归一</b>（如「住宿地址」→「宿舍」），未见过的新字段原样保留，学号为必备主键。
        <b>不想导入的列，把右边"导入"的勾去掉即可</b>（只是这一列不进来，已在本机的数据不受影响）。</div>
      <div style="max-height:250px;overflow:auto;border:1px solid var(--line-2);border-radius:9px">
        <table class="map-tbl">
          <thead><tr><th style="width:44px">#</th><th>表格列名</th><th style="width:150px">识别结果</th><th style="width:64px">导入</th></tr></thead>
          <tbody>${m.header.map((h,i)=>{
            const isKey = h.norm === '学号';
            const isEmptyCol = m.emptyCols.indexOf(h.norm) >= 0;
            const canSkip = !!h.norm && !isKey;
            const checked = !(m.skipCols && m.skipCols.has(h.norm));
            const badge = isKey
              ? `<span class="ok-badge">✓ 主键</span>`
              : h.renamed
                ? `<span class="ok-badge">✓ → ${esc(h.norm)}</span>`
                : KNOWN_FIELDS.has(h.norm)
                  ? `<span class="ok-badge">✓ 保留</span>`
                  : `<span class="warn-badge">＋ 新字段</span>`;
            return `<tr>
              <td style="color:var(--text-3)">${i+1}</td>
              <td>${esc(h.raw || '（空列名）')}${isEmptyCol?' <span style="color:var(--warn);font-size:11.5px">· 本列全空</span>':''}</td>
              <td>${badge}</td>
              <td style="text-align:center">${h.norm ? (canSkip
                  ? `<input type="checkbox" ${checked?'checked':''} data-k="${esc(h.norm)}" onchange="toggleImportCol(this.dataset.k, this.checked)" title="勾选 = 导入这一列；取消 = 这一列不进来">`
                  : `<span class="ok-badge" title="学号是合并主键，必须导入">必导入</span>`) : ''}</td></tr>`;
          }).join('')}</tbody>
        </table>
      </div>
      ${importFieldSummary()}
      ${importPreStats()}`;
  }
  else{
    const res = m.result || { added: m.rows.length, updated: 0, skipped:0, badRows:[], missing:[] };
    const renamed = (m.header||[]).filter(h=>h.renamed).map(h=>`${h.raw} → ${h.norm}`);
    const newCols = (m.header||[]).filter(h=>h.norm && !h.renamed && !KNOWN_FIELDS.has(h.norm)).map(h=>h.raw);
    body = `
      <div class="steps">
        <div class="step done"><div class="step-n">✓</div>选择文件</div><div class="step-line"></div>
        <div class="step done"><div class="step-n">✓</div>确认导入</div><div class="step-line"></div>
        <div class="step on"><div class="step-n">3</div>完成</div>
      </div>
      <div class="empty-state" style="padding:16px 20px">
        <div style="font-size:40px;margin-bottom:8px">✅</div>
        <div style="font-size:16px;font-weight:640;color:var(--text)">${
          res.mode==='overwrite' ? '覆盖导入完成' : res.mode==='new' ? '新批次已创建' : '导入完成'}</div>
        <div style="margin-top:5px">${
          res.mode==='overwrite'
            ? `清空 ${res.clearedCount||0} 人 · 导入 ${res.added||0} 人`
            : res.mode==='new'
              ? `新批次共 ${res.added||0} 人`
              : `本次新增 ${res.added} 人，更新 ${res.updated} 人`}</div>
      </div>

      <div class="result-row" style="margin-bottom:14px">
        <div class="result-box"><div class="v" style="color:var(--brand)">${res.added||0}</div><div class="l">新增学生</div></div>
        <div class="result-box"><div class="v" style="color:var(--ok)">${res.updated||0}</div><div class="l">更新学生</div></div>
        <div class="result-box"><div class="v" style="color:${res.skipped?'var(--danger)':'var(--text-3)'}">${res.skipped||0}</div><div class="l">异常行（学号为空）</div></div>
        <div class="result-box"><div class="v" style="color:var(--text-3)">${(res.missing||[]).length}</div><div class="l">${
          res.mode==='overwrite' ? '本次移除（已备份）' : res.mode==='new' ? '未出现的学生' : '本次未覆盖（仍保留）'}</div></div>
      </div>

      ${res.mode==='overwrite' ? `<div class="hint">
        <b>覆盖结果</b><br>
        · 原批次清空 ${res.clearedCount||0} 人 → 导入 ${res.added||0} 人<br>
        · 辅导员备注按学号搬回 <b>${res.carried||0}</b> 条
        ${res.backupName?`<br>· 已自动备份到本机：<b>${esc(res.backupName)}</b>`:''}
      </div>` : ''}

      ${res.mode==='overwrite' && (res.unmatchedRemarks||[]).length ? `<div class="hint" style="border-color:var(--warn)">
        <b style="color:var(--warn)">有 ${res.unmatchedRemarks.length} 条备注未能匹配到新数据</b><br>
        这些学号在新表里没有出现，备注无法搬回：${res.unmatchedRemarks.slice(0,15).map(esc).join('、')}${res.unmatchedRemarks.length>15?' …':''}<br>
        原备注完整保留在自动导出的备份 CSV 里，可从中找回。
      </div>` : ''}

      ${res.mode==='new' ? `<div class="hint">
        <b>新批次已创建，并自动切换为当前批次</b><br>
        批次名「${esc(res.batchName||'')}」共 ${res.added||0} 人；原有批次未受影响，可在顶部批次条随时切回。
      </div>` : ''}

      ${res.autoBatchName ? `<div class="hint" style="border-color:var(--warn)">
        <b style="color:var(--warn)">导入前没有任何批次，已自动新建「${esc(res.autoBatchName)}」并放入本次导入的 ${res.added||0} 人</b><br>
        这是防止数据丢失的保护动作（以前这种情况数据只存在内存里，重开程序就没了）。<br>
        如果这批数据本该并进某个已有批次，请到「批次管理」删掉这个自动批次，再重新导入并选对方式。
      </div>` : ''}

      ${res.kind==='roster' ? `<div class="hint" style="border-color:var(--brand);background:var(--brand-soft)">
        <b style="color:var(--brand)">🎯 入党积极分子名册：政治面貌已自动同步</b><br>
        · 本次把 <b>${res.rosterSynced||0}</b> 名学生的政治面貌同步为「入党积极分子」<br>
        ${(res.rosterKept||0) ? `· <b>${res.rosterKept}</b> 名学生已是中共党员 / 中共预备党员 / 发展对象，身份<b>未做降级</b>，原样保留<br>` : ''}
        · 这些学生现在可以在筛选里直接选出「入党积极分子」，后续评奖评优、发展党员统计都省事了
      </div>` : ''}

      ${res.kind==='roster' && (res.added||0) > 0 ? `<div class="hint" style="border-color:var(--warn)">
        <b style="color:var(--warn)">名册里有 ${res.added} 人是以「新学生」身份加进来的</b><br>
        他们的学号在当前批次里原本不存在。可能是名册跨了年级、或学号写法不一致（如多了空格、字母大小写）。<br>
        若本不该新增，请到「批次管理」里把这一批撤掉，核对学号后重新导入。
      </div>` : ''}

      ${res.skipped ? `<div class="hint" style="border-color:var(--danger-line)">
        <b style="color:var(--danger)">有 ${res.skipped} 行因「学号」为空被跳过</b><br>
        对应 Excel 行号：${res.badRows.join('、')}。这些行<b>没有被写入</b>，请回原表补齐学号后重新导入。
      </div>` : ''}

      ${(res.missing||[]).length ? `<div class="hint">
        <b>有 ${(res.missing||[]).length} 名学生本次未出现</b><br>
        数据库里<b>没有删除</b>他们，仍需你自行核对：是这批数据不含他们，还是确实已不在名单中。学号：${res.missing.slice(0,10).map(esc).join('、')}${res.missing.length>10?' …':''}
      </div>` : ''}

      ${renamed.length ? `<div class="hint">
        <b>列名已自动归一</b><br>${renamed.map(esc).join('；')}（原始表头与原始值已完整保留，可随时回溯）
      </div>` : ''}

      ${newCols.length ? `<div class="hint">
        <b>识别到 ${newCols.length} 个新字段</b><br>${newCols.map(esc).join('、')} —— 已原样入库，可在学生详情中查看。
      </div>` : ''}

      ${(m.emptyCols||[]).length ? `<div class="hint">
        <b>有 ${m.emptyCols.length} 列在本批数据中全为空</b><br>${m.emptyCols.map(esc).join('、')} —— 导入后不带来新信息，原有数据未被覆盖。
      </div>` : ''}

      ${(res.internalMerged||0) > 0 ? `<div class="hint" style="border-color:var(--warn-line);background:var(--warn-soft)">
        <b style="color:var(--warn)">本次自动合并了 ${res.internalMerged} 行 CSV 内部重复</b><br>
        同一个学号在 CSV 里出现多次时，程序已按<b>学号</b>自动合并为一条记录（字段非空优先，备注永不覆盖）。<br>
        <span style="color:var(--text-3)">下次导之前先在 Excel 里把同一学号的多行整理成一行 —— 反复出现通常意味着表格上游有重复段（比如「2024 名单」后面又接了「2025 上半年补录」），靠程序合并比较费眼。</span>
      </div>` : ''}

      <div class="hint">
        ${res.mode==='overwrite'
          ? `<b>辅导员备注已按学号搬回</b><br>未能匹配上的备注已在上面点名列出，原始内容保留在备份 CSV 里。当前批次共 ${S.students.length} 名学生。`
          : `<b>辅导员备注已完整保留</b><br>重复导入不会覆盖你填写的任何备注内容（备注永不覆盖 · 空值不覆盖 · 未出现的列保留）。当前批次共 ${S.students.length} 名学生。`}
      </div>`;
  }

  const foot = m.step===1
    ? `<button class="btn" onclick="closeModal()">取消</button>`
    : m.step===2
      ? `<button class="btn" onclick="importState.step=1;renderImport()">上一步</button>
         <button class="btn ${m.mode==='overwrite'?'danger-pri':'pri'}" onclick="doImport()">${
           m.mode==='overwrite' ? '确认覆盖并导入' : m.mode==='new' ? '创建批次并导入' : '确认导入'}</button>`
      : `<button class="btn pri" onclick="closeModal();renderBatchBar();renderSidebar();renderMain()">完成</button>`;

  $('modalRoot').innerHTML = `
  <div class="mask" onclick="if(event.target===this)closeModal()">
    <div class="modal wide" onclick="event.stopPropagation()">
      <div class="modal-head"><div class="modal-title">导入学生数据</div>
        <div class="modal-close" onclick="closeModal()">×</div></div>
      <div class="modal-body">${body}</div>
      <div class="modal-foot">${foot}</div>
    </div>
  </div>`;
}

function countSame(rows){
  const ids = new Set(S.students.map(s=>String(s['学号'])));
  return rows.filter(r=>r['学号']!=null && r['学号']!=='' && ids.has(String(r['学号']))).length;
}

/* 检测 CSV 内部是否含有学号重复行：返回 { dups, dupRowCount }。
   · dups      — [{ id, idxs: [原始行下标...], names: [...] }]，每个 id 一条
   · dupRowCount — 出现在重复组里的"多余行"总数（不算第一条）
   注意：返回 idxs 是导入归一后的下标，配合 excelRowNo(idx) 才能换算回 Excel 真实行号。
   这一项**只在预览页提示，不阻断导入**：append/overwrite 模式本来就会按学号 upsert，
   CSV 内部的重复会被自动合并；只有「新建批次」会把所有重复行原样保留。
   但提前提示能让辅导员决定是否回 Excel 处理。 */
function detectCsvInternalDup(rows){
  const groups = new Map();          // 学号 → { idxs: [...], names: [...] }
  rows.forEach((r, idx) => {
    const id = String(r['学号'] == null ? '' : r['学号']).trim();
    if(!id) return;
    if(!groups.has(id)) groups.set(id, { idxs: [], names: [] });
    const g = groups.get(id);
    g.idxs.push(idx);
    g.names.push(String(r['姓名'] == null ? '' : r['姓名']).trim());
  });
  const dups = [];
  let dupRowCount = 0;
  groups.forEach((g, id) => {
    if(g.idxs.length > 1){
      dups.push({ id, idxs: g.idxs, names: g.names });
      dupRowCount += g.idxs.length - 1;
    }
  });
  dups.sort((a, b) => b.idxs.length - a.idxs.length);
  return { dups, dupRowCount };
}

/* 在预览页把 CSV 内部重复情况渲染成警告卡片。
   `which` 用来决定提示语气：
     · append/overwrite：自动按学号合并（不会增加新行），但要明说这件事
     · new (v1.9.7 之前)：会把所有重复行原样保留（必须最显眼） → 现已统一按学号合并，提示也对应改成"自动处理" */
function csvDupWarn(rows, which){
  const { dups, dupRowCount } = detectCsvInternalDup(rows);
  if(!dups.length) return '';
  const rowsN = rows.length;
  const head = dups.slice(0, 6).map(d => {
    const lines = d.idxs.map((idx, k) => `${excelRowNo(idx)} 行${d.names[k]?`（${esc(d.names[k])}）`:''}`).join('、');
    return `<li>学号 <b>${esc(d.id)}</b> 出现 ${d.idxs.length} 次：${lines}</li>`;
  }).join('');
  const more = dups.length > 6 ? `<li style="color:var(--text-3)">…还有 ${dups.length - 6} 个学号重复</li>` : '';
  /* v1.9.7 硬约束：所有模式都按学号去重，不会出现重复行。这里统一告诉辅导员程序会自动处理，
     并建议他回 Excel 整理以避免反复出现。 */
  const mergeNote = `✓ 选哪种导入方式都一样 —— 程序会按<b>学号</b>自动合并，<b>不会</b>出现重复记录。<br>
    <span style="color:var(--text-3)">建议回 Excel 整理干净再导：不同老师重复上报、合并表格忘删旧段，是 CSV 出现重复学号的最常见原因。</span>`;
  return `
    <div class="hint" style="border-color:var(--warn-line);background:var(--warn-soft)">
      <b style="color:var(--warn)">
        📌 本次文件里发现 ${dups.length} 个学号重复（${dupRowCount} 行多余 / 共 ${rowsN} 行）
      </b><br>
      <ul style="margin:6px 0 6px 18px;padding:0;font-size:12.5px">${head}${more}</ul>
      ${mergeNote}
    </div>`;
}

/* 第 2 步（确认页）的预统计：三种模式关心的问题完全不同，
   覆盖模式必须把「会丢什么」写在明面上，这是"显式授权"的一部分。 */
function importPreStats(){
  const m = importState;
  const cur = activeBatch();
  const curN = cur ? cur.students.length : 0;
  const same = countSame(m.rows);
  const modeLab = {append:'新增 / 合并', overwrite:'覆盖当前批次', new:'新建批次'}[m.mode] || '新增 / 合并';

  const head = `<div class="hint"><b>当前导入方式：${modeLab}</b></div>`;

  /* v1.9.2：认出「入党积极分子名册」时，把"会自动改政治面貌"这件事说在最前面 ——
     改学生身份是要负责任的动作，必须让人在点「确认导入」之前就清楚会发生什么。 */
  const rosterNote = m.kind === 'roster' ? `
    <div class="hint" style="border-color:var(--brand);background:var(--brand-soft)">
      <b style="color:var(--brand)">🎯 已识别为「入党积极分子名册」</b><br>
      · 匹配到的学生，<b>政治面貌会自动同步为「入党积极分子」</b>，不必再几百人一个个手点<br>
      · 名册里的「所在党支部」「递交入党申请书时间」「确定为入党积极分子时间」等列会一并写入档案<br>
      · <b>已是中共党员 / 中共预备党员 / 发展对象的学生不会被降级</b>，身份原样保留<br>
      · 党支部上报材料（名额、备案等）本软件不参与，只做学生档案这一侧的信息同步
      ${m.mode === 'overwrite' ? `<br><b style="color:var(--danger)">⚠ 但你现在选的是「覆盖当前批次」：名册一般只是全班里的一部分（例如 78 人），覆盖会把名册之外的同学整批清掉。同步积极分子请改用「新增 / 合并」。</b>` : ''}
    </div>` : '';

  if(m.mode === 'overwrite'){
    const remarkN = (cur ? cur.students : []).filter(s=>s['备注（保密）']).length;
    return head + rosterNote + csvDupWarn(m.rows, 'overwrite') + `
      <div class="hint" style="border-color:var(--danger-line);background:var(--danger-soft)">
        <b style="color:var(--danger)">⚠ 覆盖模式：当前批次将被整体替换</b><br>
        · 当前批次「${esc(cur?cur.name:'-')}」的 <b>${curN} 人</b>会被清空，替换为本次导入的 ${m.rows.length} 行<br>
        · 其中 <b>${remarkN} 条</b>辅导员备注按学号搬回；未能匹配上的会在结果页点名列出<br>
        · 执行前自动导出 CSV 备份，万一导错还能从备份找回
      </div>
      <div class="result-row">
        <div class="result-box"><div class="v" style="color:var(--danger)">${curN}</div><div class="l">将清空（当前批次）</div></div>
        <div class="result-box"><div class="v" style="color:var(--brand)">${m.rows.length}</div><div class="l">本次导入</div></div>
        <div class="result-box"><div class="v" style="color:var(--ok)">${remarkN}</div><div class="l">可带走备注</div></div>
      </div>`;
  }

  if(m.mode === 'new'){
    return head + rosterNote + csvDupWarn(m.rows, 'new') + `
      <div class="hint">
        <b>将新建一个独立批次</b><br>
        · 批次名「${esc(newBatchName())}」，与现有数据完全隔离<br>
        · 当前批次「${esc(cur?cur.name:'-')}」的 ${curN} 人<b>不受影响</b>；导入后自动切换到新批次<br>
        · 新批次按学号自动合并，<b>一个学号只会产生一条记录</b>
      </div>
      <div class="result-row">
        <div class="result-box"><div class="v" style="color:var(--brand)">${m.rows.length}</div><div class="l">本次导入行数</div></div>
        <div class="result-box"><div class="v" style="color:var(--text-3)">${S.batches.length}</div><div class="l">现有批次</div></div>
        <div class="result-box"><div class="v" style="color:var(--ok)">${S.batches.length+1}</div><div class="l">导入后批次</div></div>
      </div>`;
  }

  return head + rosterNote + csvDupWarn(m.rows, 'append') + `
    <div class="hint">
      <b>合并规则（四条铁律）</b><br>
      · 已有备注<b>永不覆盖</b>；空值<b>不覆盖</b>已有内容；本次表里没出现的列<b>原样保留</b><br>
      · 新表里没出现的学生<b>不会被删除</b>，只提示「本次未覆盖」
    </div>
    <div class="result-row">
      <div class="result-box"><div class="v" style="color:var(--brand)">${m.rows.length}</div><div class="l">本次导入学生</div></div>
      <div class="result-box"><div class="v" style="color:var(--ok)">${same}</div><div class="l">与已有记录匹配（更新）</div></div>
      <div class="result-box"><div class="v" style="color:var(--warn)">${m.rows.length - same}</div><div class="l">新增学生</div></div>
    </div>`;
}

/* ---------- 列表视图 ---------- */
/* 顶部统计条：4 个数字都可点击跳到对应名单。
   · 「当前筛选结果」是本视图本身，点它没意义 → 做成「清空筛选回到全部」，且仅在有筛选时可点；
   · 依赖字段在本批数据里不存在时（presetAvailable 为 false）显示「—」，置灰不跳转；
   · 计数为 0 时不跳转（点进去只会得到一个空名单）。
   抽成独立函数是为了让 quickSearch() 打字时能同步刷新这 4 个数字。 */
/* 数据总览卡片（v1.9.7 重构）
   之前：5 张卡片按 auto-fit grid 排，有时 3 列、有时 4 列、有时 5 列，
   加上"暂无成绩"卡片只在有成绩时才出现，整行高度参差不齐。
   现在：固定 4 列网格（更窄的窗口自动收紧到 2 列），所有卡片同高。
   标题里"当前筛选 / 共 N" 拆成两行：避免数字 + 总数挤在一起宽度飘忽。 */
function statsHtml(list, total){
  const hasFilter = S.classFilter!=='all' || S.quickView!=='all'
                    || Object.keys(S.filters).length>0 || !!S._search;
  const withRemark = list.filter(s=>s['备注（保密）']).length;
  const focus = list.filter(hasFocus).length;
  const fail  = list.filter(s=>{const g=gradeOf(s); return !!g && gNum(g,'不及格门数')>0;}).length;
  const noGradeN = list.filter(s=>!gradeOf(s)).length;
  const canFail  = presetAvailable(presetById('fail'));

  /* 4 个固定槽位。卡片就是「左边数字、右边文字」—— 不加"点击查看…"这类辅助描述：
     可点击这件事用 cursor 和悬停底色表达就够了，写在卡片上反而挤。 */
  const cell = (tone, val, lab, action) =>
    `<div class="stat${tone ? ' ' + tone : ''}${action ? ' stat-click' : ''}"${action ? ` onclick="${action}"` : ''}>
      <div class="stat-val">${val}</div>
      <div class="stat-lab">${lab}</div>
    </div>`;

  const cards = [
    cell('accent', list.length,
      hasFilter ? '当前筛选' : '当前名单',
      hasFilter ? 'gotoList({clear:true})' : ''),
    cell('', withRemark, '已写备注',
      withRemark ? `gotoList({preset:'hasremark'})` : ''),
    cell('warn', focus, '需重点关注',
      focus ? `gotoList({preset:'focus'})` : ''),
    cell('danger', canFail ? fail : (hasGrade() ? 0 : '—'),
      canFail ? '有不及格' : (hasGrade() ? '有不及格' : '未导入成绩'),
      canFail && fail ? `gotoList({preset:'fail'})` : '')
  ];

  return `<div class="stats stats-4">
    ${cards.join('')}
  </div>`;
}

function renderList(){
  const base = applyAll();
  const list = viewList();
  const total = baseList().length;
  curList = list;                                   // 勾选框按行号回查用
  [...selRows].forEach(s=>{ if(!S.students.includes(s)) selRows.delete(s); });  // 已被删掉的自动清出

  const title = S.classFilter==='all'
    ? (PRESETS.find(p=>p.id===S.quickView)?.label || '全部学生')
    : S.classFilter;

  let h = statsHtml(list, total);

  /* ===== 筛选区 =====
     重排的理由（按真实使用频率）：
       1. 搜索是最高频动作 → 独立一行、给足宽度，不用挤在一排小控件里
       2. 筛选条件是"低频但要显眼" → 做成和搜索同一张卡，分两行
       3. 「已启用条件」是"当前状态" → 单独一行，随时能看清、能一键清
       4. 列设置/保存筛选是"偶尔设置" → 收到页头右侧，不占筛选区空间 */
  const activeChips = renderActiveChips(list);
  const hasActive = activeChips && activeChips.indexOf('>已启用条件：<') < 0;

  h += `
  <div class="u-head">
    <div class="u-head-main">
      <div class="u-title">${esc(title)}</div>
      <div class="u-sub">
        共 <b>${list.length}</b> 人${list.length !== total ? `（全部 ${total} 人）` : ''}
        ${S.sort.key ? ` · 排序：${esc(sortLabel())}` : ''}
      </div>
    </div>
    <div class="u-head-actions">
      <button class="u-btn u-btn-sm${colsCustomized() ? ' u-btn-primary' : ''}" onclick="openColSettings()"
              title="自定义显示哪些列、以及列的前后顺序">列设置</button>
      <button class="u-btn u-btn-sm" onclick="openSaveFilter()">保存为常用筛选</button>
      ${hasGrade()
        ? `<button class="u-btn u-btn-sm" onclick="openGradeImport()" title="重新导入本批次的成绩表">更新成绩</button>`
        : `<button class="u-btn u-btn-sm u-btn-primary" onclick="openGradeImport()" title="导入系统导出的「成绩信息」表，按学号与这批学生绑定">＋ 导入成绩</button>`}
    </div>
  </div>

  <div class="u-card ls-filter">
    <!-- 第一行：搜索独占。辅导员一天要用几十次，它必须最显眼 -->
    <div class="ls-search">
      <span class="ls-search-ico" aria-hidden="true">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
      </span>
      <input class="ls-search-input" id="listSearchInput" data-tour="filter"
             title="⌘K 或 / 可快速唤起；Esc 清空" value="${esc(S._search || '')}"
             placeholder="搜索姓名 / 学号 / 考生号 / 电话" oninput="quickSearch(this.value)">
      ${S._search ? `<button class="ls-search-clear" onclick="quickSearch('')" title="清空">×</button>` : ''}
    </div>

    <!-- 第二行：筛选维度 -->
    <div class="ls-dims">
      ${filterDrop('班级', '班级', [...new Set(S.students.map(s => s['班级']).filter(Boolean))].sort())}
      ${filterDrop('性别', '性别', ['男', '女'])}
      ${filterDrop('政治面貌', '政治面貌',
          [...new Set(S.students.map(s => s['政治面貌']).filter(Boolean))].sort().concat(['__EMPTY__']))}
      ${filterDrop('宿舍', '宿舍', [...new Set(S.students.map(s => s['宿舍']).filter(Boolean))].sort())}
      ${filterDrop('关注标签', '关注标签', focusTags().map(t => t.emoji))}
      <button class="u-btn u-btn-sm u-btn-ghost" onclick="openCustomFilter()">＋ 添加条件</button>
    </div>

    <!-- 第三行：当前生效的条件，一眼看清 + 一键清 -->
    <div class="ls-active${hasActive ? '' : ' ls-active-empty'}">
      <span class="ls-active-t">已启用</span>
      ${hasActive
        ? activeChips
        : '<span class="u-hint-quiet">没有筛选条件，下面是全部学生</span>'}
      ${(hasActive || S.sort.key) ? `<button class="u-btn u-btn-sm u-btn-ghost ls-active-clear" onclick="clearFilters()">清空筛选</button>` : ''}
      ${S.sort.key ? `<button class="u-btn u-btn-sm u-btn-ghost" onclick="clearSort()" title="回到导入顺序">排序：${esc(sortLabel())} ✕</button>` : ''}
    </div>
  </div>
  `;

  /* 勾选后的批量操作 —— 底部浮条（与奖学金页同一范式：勾了就在，不用回头找工具栏） */
  if(selRows.size){
    const tgs = focusTags();
    h += `<div class="ls-float">
      <b>已勾选 ${selRows.size} 人</b>
      ${tgs.length ? `<span class="ls-float-t">打标签</span>${tgs.map(t =>
        `<button class="u-btn u-btn-sm" title="给这 ${selRows.size} 人加上 / 去掉「${esc(t.label)}」"
          onclick="bulkTag(${jsq(t.emoji)})">${t.emoji} ${esc(t.label)}</button>`).join('')}` : ''}
      <button class="u-btn u-btn-sm" onclick="exportSelected()" title="只导出勾选的这些人（CSV，含成绩）">导出所选</button>
      <button class="u-btn u-btn-sm u-btn-ghost" onclick="clearSel()">取消勾选</button>
      <button class="u-btn u-btn-sm u-btn-danger" onclick="deleteSelected()">删除所选</button>
    </div>`;
  }

  // 表格（窄屏下由 CSS 重排成卡片，见 .tbl-wrap.as-cards）
  h += `<div class="u-card">
    <div class="tbl-wrap${isNarrow()?' as-cards':''}">
      <table>
        <thead>${listHeadHtml()}</thead>
        <tbody>${renderRows(list)}</tbody>
      </table>
    </div>
  </div>`;

  $('mainArea').innerHTML = h;
}

/* ---------- 列表列定义（表头排序 + 列自定义的唯一来源） ----------
   FIXED_COLS 只描述"有专门长相"的列；任何没列在这里的字段也能成列，走通用渲染。
   用户自定义的可见列存在 S.listCols；null = 用 DEFAULT_COLS。 */
const FIXED_COLS = {
  '':             {label:'#',        style:'width:44px', sortable:false, lock:true},
  '姓名':         {label:'姓名',     bold:true},
  '学号':         {label:'学号',     mono:true},
  '班级':         {label:'班级'},
  '成绩':         {label:'成绩',     onlyGrade:true},
  '性别':         {label:'性别'},
  '政治面貌':     {label:'政治面貌'},
  '生源地':       {label:'生源地'},
  '联系电话':     {label:'联系电话', mono:true},
  '关注':         {label:'关注',     sortable:false},
  '备注（保密）': {label:'辅导员备注', style:'min-width:200px', rsn:true}
};
/* 首次打开列表时的列（也是「恢复默认」的落点） */
const DEFAULT_COLS = ['姓名','学号','班级','成绩','性别','政治面貌','生源地','联系电话','关注','备注（保密）'];
/* 看着像"号码"的字段 → 等宽字体，便于逐位核对 */
const MONO_FIELDS = new Set(['学号','联系电话','电话','家长电话','家长联系方式','证件号码','身份证件号','手机号','QQ号','微信号','考生号']);

/* 一个列的展示口径（自定义字段同样吃它） */
function colMeta(key){
  const f = FIXED_COLS[key];
  if(f) return Object.assign({key}, f);
  return { key, label: key, mono: MONO_FIELDS.has(key) };
}

/* 本批数据里真实存在的字段键（含自定义字段） */
function allFieldKeys(){
  const set = new Set(batchFieldKeys());
  (S.customFields||[]).forEach(f=>set.add(f.key));
  set.add('备注（保密）');            // 备注列即使整批为空也要能显示
  return set;
}
/* 这个列在本批能不能显示：字段型列要求本批真有该字段；成绩列要求已导成绩 */
function colAvailable(key){
  if(key === '' || key === '成绩') return key === '' ? true : hasGrade();
  if(FIXED_COLS[key]) return true;                 // 其余内置固定列恒可用
  return allFieldKeys().has(key);
}
/* 当前生效的列（第一列永远是「#」，不参与自定义） */
function activeCols(){
  const keys = Array.isArray(S.listCols) ? S.listCols : DEFAULT_COLS;
  const out = [colMeta('')];
  const seen = new Set();
  keys.forEach(k=>{
    if(!k || seen.has(k)) return;
    seen.add(k);
    if(!colAvailable(k)) return;      // 本批没有的字段不凭空占一列
    out.push(colMeta(k));
  });
  return out;
}
function listColCount(){ return activeCols().length; }

function listHeadHtml(){
  const allOn = curList.length > 0 && curList.every(s=>selRows.has(s));
  return '<tr><th style="width:34px"><input type="checkbox" title="全选 / 取消当前列表"'
    + (allOn?' checked':'') + ' onclick="toggleSelAll(this.checked)"></th>'
    + activeCols().map(c=>{
    const style = c.style ? ` style="${c.style}"` : '';
    if(c.sortable === false) return `<th${style}>${esc(c.label)}</th>`;
    const on = S.sort.key === c.key;
    return `<th class="sortable${on?' on':''}"${style} onclick="setSort(${jsq(c.key)})"
      title="点击按「${esc(c.label)}」排序，再点一次切换升/降序">${esc(c.label)}${sortInd(c.key)}</th>`;
  }).join('') + '</tr>';
}
/* 当前列是默认列还是自定义过（决定「列设置」按钮是否高亮） */
function colsCustomized(){
  if(!Array.isArray(S.listCols)) return false;
  if(S.listCols.length !== DEFAULT_COLS.length) return true;
  return S.listCols.some((k,i)=>k !== DEFAULT_COLS[i]);
}

/* ---------- 列设置（勾选显示 + 拖动/上下调顺序） ----------
   编辑期间用草稿 colDraft/colOn，点「完成」才写进 S.listCols ——
   取消/关闭不落盘，与详情页编辑态同一套"草稿 → 确认"的习惯。 */
let colDraft = null;     // 编辑中的列顺序（全量候选，含未勾选的）
let colOn = null;        // 编辑中勾选了哪些（Set）
let colDragFrom = null;  // 拖动源下标

/* 候选列 = 当前顺序 + 默认列 + 本批真实存在的全部字段（含自定义字段）。
   「邮箱 / 身份证号 / 家长电话」这类只要导入表里有，就会出现在这里。 */
function colCandidates(){
  const out = [], seen = new Set();
  const push = k=>{ if(k && k !== '' && !seen.has(k)){ seen.add(k); out.push(k); } };
  (Array.isArray(S.listCols) ? S.listCols : DEFAULT_COLS).forEach(push);
  DEFAULT_COLS.forEach(push);
  [...allFieldKeys()].sort((a,b)=>a.localeCompare(b,'zh')).forEach(push);
  if(hasGrade()) push('成绩');
  return out;
}
/* 本批没有这个字段时，给一句人话解释（不显示 0、也不假装有）。
   注意区分两种"没有"：
     · 本批无此字段 —— 表里根本没这列（如新模板没有「毕业学校」）
     · 本批全空     —— 表里有这列，但整列没填值（如未启用时的「电子信箱」）
   两者都「可选为列」，只是如实标注，不静默藏掉 —— 辅导员想加就让他加。 */
function colMissReason(k){
  if(k === '成绩') return hasGrade() ? '' : '未导成绩';
  if(FIXED_COLS[k]) return '';
  if(!allFieldKeys().has(k)) return '本批无此字段';
  return fieldHasData(k) ? '' : '本批全空';
}

function openColSettings(){
  colDraft = colCandidates();
  colOn = new Set(Array.isArray(S.listCols) ? S.listCols : DEFAULT_COLS.filter(colAvailable));
  renderColSettings();
}
function renderColSettings(focusIdx){
  const rows = colDraft.map((k,i)=>{
    const c = colMeta(k);
    const miss = colMissReason(k);
    return `<div class="colrow${colOn.has(k)?' on':''}" draggable="true"
        ondragstart="colDragStart(${i},event)" ondragover="colDragOver(event)"
        ondrop="colDrop(${i},event)" ondragend="colDragEnd()">
      <span class="colrow-grip" title="按住拖动调整顺序">⠿</span>
      <label class="colrow-chk">
        <input type="checkbox" ${colOn.has(k)?'checked':''} onchange="colToggle(${i},this.checked,this)">
        <span>${esc(c.label)}</span>
      </label>
      ${miss?`<span class="colrow-miss" title="${
        miss==='本批全空'
          ? '这一列在本批数据里全是空的，显示出来也是一排「—」；换一批填了值的就会自动出现'
          : '本批数据里没有这个字段，勾了也不会显示'
      }">${esc(miss)}</span>`:''}
      <span style="flex:1"></span>
      <button class="colrow-btn" onclick="colMove(${i},-1)" ${i===0?'disabled':''} title="上移">↑</button>
      <button class="colrow-btn" onclick="colMove(${i},1)" ${i===colDraft.length-1?'disabled':''} title="下移">↓</button>
    </div>`;
  }).join('');

  $('modalRoot').innerHTML = `
  <div class="mask" onclick="if(event.target===this)closeModal()">
    <div class="modal" onclick="event.stopPropagation()">
      <div class="modal-head"><div class="modal-title">列设置 · 全部学生</div>
        <div class="modal-close" onclick="closeModal()">×</div></div>
      <div class="modal-body">
        <div class="fieldset-hint" style="margin-bottom:14px">
          勾选要显示的列，按住 <b>⠿</b> 拖动、或点 <b>↑↓</b> 调整前后顺序。<br>
          这里列出的字段都来自你导入的表 —— 勾了本批没有的字段也不会显示（换到有该字段的数据会自动出现）。<br>
          想加表里没有的列（例如「家长电话」）？先到详情页的「<b>字段设置</b>」里新建自定义字段。
        </div>
        <div class="collist" id="colList">${rows}</div>
      </div>
      <div class="modal-foot">
        <button class="btn" onclick="resetCols()" title="回到出厂的 10 列">恢复默认（10 列）</button>
        <button class="btn" onclick="showAllCols()" title="把本批所有可用字段都显示出来（列会变多，可再自行增减）">显示全部字段</button>
        <span style="flex:1"></span>
        <button class="btn" onclick="closeModal()">取消</button>
        <button class="btn pri" onclick="saveColSettings()">完成</button>
      </div>
    </div>
  </div>`;
  /* v2.2：排序（上移/下移/拖动）后必须重画 —— 但重画会把 .collist 滚回顶部，
     用户就找不到刚动的那一行了。所以把"刚动过的下标"传进来，重画后把它滚回视野。
     （勾选不走这里：勾选是就地更新，见 colToggle。） */
  if(focusIdx != null){
    const list = $('colList');
    const row = (list && list.children) ? list.children[focusIdx] : null;
    if(row && typeof row.scrollIntoView === 'function'){ try{ row.scrollIntoView({block:'nearest'}); }catch(e){} }
  }
}
/* 就地切换一行「已选」外观 —— 不整段重绘（重绘会让 .collist 的滚动位置打回顶部，
   用户反馈"每勾一项就跳回首行"就是这个原因）。colToggle 与 fsToggle 共用这一处。 */
function toggleRowOn(el, on){
  const row = (el && el.closest) ? el.closest('.colrow') : null;
  if(row && row.classList) row.classList.toggle('on', on);
}
function colDragStart(i, ev){ colDragFrom = i; if(ev && ev.dataTransfer){ ev.dataTransfer.effectAllowed='move'; } }
function colDragOver(ev){ if(ev) ev.preventDefault(); }
function colDragEnd(){ colDragFrom = null; }
function colDrop(i, ev){
  if(ev) ev.preventDefault();
  if(colDragFrom == null || colDragFrom === i) return;
  const arr = colDraft.slice();
  const it = arr.splice(colDragFrom,1)[0];
  arr.splice(i,0,it);
  colDraft = arr; colDragFrom = null;
  renderColSettings(i);
}
function colToggle(i, on, el){
  const k = colDraft[i];
  if(on) colOn.add(k); else colOn.delete(k);
  toggleRowOn(el, on);   // v2.2：就地更新 —— 不重绘（重绘会把列表滚回顶部，用户反馈的"跳回首行"）
}
function colMove(i, d){
  const j = i + d;
  if(j < 0 || j >= colDraft.length) return;
  const arr = colDraft.slice();
  const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  colDraft = arr;
  renderColSettings(j);   // 重画后把刚移动的那一行滚回视野
}
/* v2.2（升级清单 ⑤）：把本批**所有可用字段**都显示出来。
   原来只有「恢复默认」一条路（回到出厂 10 列）；片 3 之后本批常有二十几个可用字段，
   想"先全显示、再删掉不要的"没有出口。两档并存，可来回切。 */
function showAllCols(){
  colDraft = colCandidates();
  colOn = new Set(colDraft.filter(k => k && k !== '' && colAvailable(k)));
  if(!colOn.size){ toast('本批没有可用字段'); return; }
  renderColSettings();
}
function resetCols(){
  colDraft = colCandidates();
  colOn = new Set(DEFAULT_COLS.filter(colAvailable));
  renderColSettings();
}
function saveColSettings(){
  const cols = colDraft.filter(k=>colOn.has(k));
  if(!cols.length){ toast('至少要保留一列'); return; }
  S.listCols = cols;
  save();
  closeModal();
  renderMain();
  toast(`列已更新：显示 ${cols.length} 列`);
}

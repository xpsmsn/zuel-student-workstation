/* ---------- 总览页 · 筛选器（与列表页共享同一份状态） ---------- */
function dashFilterBar(){
  const classes = [...new Set(S.students.map(s=>s['班级']).filter(Boolean))].sort();
  return `<div class="filterbar dash-filter">
    <div class="fgroup">
      <span class="flabel">快速搜索</span>
      <input class="finput fsearch" id="dashSearchInput" title="⌘K 或 / 可快速唤起；Esc 清空" value="${esc(S._search||'')}" placeholder="姓名 / 学号 / 考生号 / 电话" oninput="dashSearch(this.value)">
    </div>
    <!-- v1.9.3：与列表页统一成复选框面板（这里单选式交互不变，但多选体验一致） -->
    ${filterDrop('班级', '班级', classes)}
    ${filterDrop('性别', '性别', ['男','女'])}
    ${filterDrop('政治面貌', '政治面貌',
        [...new Set(S.students.map(s=>s['政治面貌']).filter(Boolean))].sort().concat(['__EMPTY__']))}
    <div class="fgroup">
      <span class="flabel">预设视图</span>
      <select class="fselect" onchange="dashPreset(this.value)">
        ${PRESETS.map(p=>{
          const ok = presetAvailable(p);
          return `<option value="${p.id}" ${S.quickView===p.id?'selected':''} ${ok?'':'disabled'}>${p.label}${ok?'':'（本批未提供字段）'}</option>`;
        }).join('')}
      </select>
    </div>
    <button class="btn" style="height:34px" onclick="clearFilters()">清空筛选</button>
  </div>`;
}
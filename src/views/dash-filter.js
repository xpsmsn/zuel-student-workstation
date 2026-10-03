/* ════════════════════════════════════════════════════════════════════════
   views/dash-filter.js —— 总览页 · 筛选器
   ────────────────────────────────────────────────────────────────────────
   与列表页共享同一份筛选状态（S.filters / S.quickView / S._search），
   所以在总览页筛出来的口径，切到列表页还是同一批人 —— 这是刻意设计的。

   v2.3 的一处调整：搜索框**保留**。
   原本想删掉它（跟列表页重复），但实测发现顶栏并没有全局搜索框 ——
   ⌘K / / 唤起的是「当前页面的搜索框」，而总览页是唯一能一边看分布图
   一边缩小范围的页面。删了它，总览页就搜不了人了。
   → 真正该做的是让两边的搜索框长得一样（都已用 .finput + .fsearch），
     而不是砍掉一个。
   ════════════════════════════════════════════════════════════════════════ */
function dashFilterBar() {
  const classes = [...new Set(S.students.map(s => s['班级']).filter(Boolean))].sort();
  const active = countActiveFilters();

  return `<div class="filterbar dash-filter">
    <div class="fgroup fgroup-search">
      <span class="flabel">搜索</span>
      <input class="finput fsearch" id="dashSearchInput"
        title="⌘K 或 / 可快速唤起；Esc 清空" value="${esc(S._search || '')}"
        placeholder="姓名 / 学号 / 考生号 / 电话" oninput="dashSearch(this.value)">
    </div>
    ${filterDrop('班级', '班级', classes)}
    ${filterDrop('性别', '性别', ['男', '女'])}
    ${filterDrop('政治面貌', '政治面貌',
        [...new Set(S.students.map(s => s['政治面貌']).filter(Boolean))].sort().concat(['__EMPTY__']))}
    <div style="flex:1 1 auto"></div>
    ${active
      ? `<button class="u-btn u-btn-sm u-btn-ghost" onclick="clearFilters()">清空筛选（${active}）</button>`
      : ''}
  </div>`;
}

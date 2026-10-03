/* ---------- 筛选操作 ---------- */
/* ---------- 筛选操作（v0.6 起同一字段可多选） ----------
   值统一按数组存；旧的字符串写法读进来也兼容。
   多选语义：同字段多个值 = 「或」，不同字段之间 = 「且」。 */
function filterValues(k){
  const v = S.filters[k];
  if(v == null || v === '') return [];
  return Array.isArray(v) ? v.slice() : [v];
}
/* 把 {字段: '值'} 这类旧写法统一成 {字段: ['值']}，让多选与单选共用一套读取口径 */
function normFilters(obj){
  const out = {};
  Object.entries(obj || {}).forEach(([k,v])=>{
    if(v == null || v === '') return;
    out[k] = Array.isArray(v) ? v.slice() : [v];
  });
  return out;
}
function afterFilterChange(){
  // 总览页只需刷新图表区，避免整页重绘导致筛选控件失焦
  if(S.view==='dashboard'){ renderDashBody(); renderDashMetrics(); }
  else renderMain();
}
function addFilterValue(k,v){
  if(!v) return;
  const cur = filterValues(k);
  if(cur.indexOf(v) < 0) cur.push(v);
  S.filters[k] = cur;
  afterFilterChange();
}
function removeFilterValue(k,v){
  const cur = filterValues(k).filter(x=>x !== v);
  if(cur.length) S.filters[k] = cur; else delete S.filters[k];
  afterFilterChange();
}
/* 「已选」标记：让下拉里的值一眼看出是否已经选过 */
function filterMark(k,v){
  return filterValues(k).indexOf(v) >= 0 ? ' ✓' : '';
}

/* ---------- v1.9.3：筛选下拉改成「复选框面板」 ----------
   原生 <select> 每选一个值就自动收起，想多选只能反复点开（"一次只能点一个，
   然后需要重新点击筛选"）。这里换成自绘面板：
     · 点按钮展开，里面每个取值一个复选框，**勾选立刻生效、面板不关**，
       一次就能把几个值都勾上，最后点「完成」或点面板外收起；
     · 按钮上直接显示当前选中的值（选多了就显示 n 个的角标），不用点开也知道筛了什么；
     · 同字段多值 = 「或」，不同字段之间 = 「且」（沿用原有语义，没变）。

   注意「保持展开」这件事：列表页每次筛选都会整页重绘（innerHTML 重建），
   所以把"哪个面板开着"存在 _fdOpen 里，重绘后据此恢复；
   总览页为了不打断搜索框输入只重绘图表区，那种情况下面板没被重建，
   就由 paintFilterDrop() 就地同步勾选态。两种路径共用同一个函数。 */
let _fdOpen = null;                       // 当前展开的字段名（null = 都收起）

function filterDrop(field, label, values){
  const cur = filterValues(field);
  const shown = cur.map(v => v === '__EMPTY__' ? '未填写' : v);
  const items = values.map(v => {
    const hit = cur.indexOf(v) >= 0;
    return `<label class="fd-item${hit ? ' on' : ''}">
      <input type="checkbox" data-v="${esc(v)}" ${hit ? 'checked' : ''}
        onchange="toggleFilterValue(${jsq(field)}, ${jsq(v)})">
      <span>${esc(v === '__EMPTY__' ? '未填写' : v)}</span></label>`;
  }).join('');
  return `<div class="fgroup">
    <span class="flabel">${esc(label)}</span>
    <div class="fdrop" data-field="${esc(field)}" data-label="${esc(label)}">
      <button type="button" class="fselect fdrop-btn${cur.length ? ' on' : ''}"
        onclick="toggleFilterDrop(event, ${jsq(field)})"
        title="可勾选多个；同组内多值是「或」的关系">
        <span class="fd-txt">${cur.length ? esc(shown.join('、')) : '全部'}</span>
        <span class="fd-n">${cur.length || ''}</span>
        <span class="fd-car">▾</span>
      </button>
      <div class="fdrop-panel${_fdOpen === field ? ' open' : ''}">
        <div class="fd-head">勾选多个 · 同组内是「或」</div>
        <div class="fd-list">${items || '<div class="fd-head">这批数据里没有可选的取值</div>'}</div>
        <div class="fd-foot">
          <button type="button" class="btn" onclick="clearFilterField(${jsq(field)})">清除本组</button>
          <button type="button" class="btn pri" onclick="toggleFilterDrop(event, ${jsq(field)})">完成</button>
        </div>
      </div>
    </div>
  </div>`;
}

function toggleFilterDrop(e, field){
  if(e && e.stopPropagation) e.stopPropagation();      // 别让全局"点外面收起"顺手把它关掉
  _fdOpen = (_fdOpen === field) ? null : field;
  paintFilterDrop();
}
/* 只切面板显隐 + 就地同步勾选态，本身不触发重绘 */
function paintFilterDrop(){
  if(typeof document === 'undefined' || !document.querySelectorAll) return;
  document.querySelectorAll('.fdrop').forEach(d => {
    const f = d.getAttribute('data-field');
    const cur = filterValues(f);
    const p = d.querySelector('.fdrop-panel');
    if(p) p.classList.toggle('open', f === _fdOpen);
    d.querySelectorAll('.fd-item').forEach(l => {
      const inp = l.querySelector('input');
      if(!inp) return;
      const hit = cur.indexOf(inp.getAttribute('data-v')) >= 0;
      inp.checked = hit;
      l.classList.toggle('on', hit);
    });
    const btn = d.querySelector('.fdrop-btn');
    if(btn){
      btn.classList.toggle('on', cur.length > 0);
      const t = d.querySelector('.fd-txt');
      if(t) t.textContent = cur.length
        ? cur.map(v => v === '__EMPTY__' ? '未填写' : v).join('、')
        : '全部';
      const n = d.querySelector('.fd-n');
      if(n) n.textContent = cur.length || '';
    }
  });
}
/* 勾/取消一个值：立刻生效并保持面板展开 */
function toggleFilterValue(k, v){
  const cur = filterValues(k);
  const i = cur.indexOf(v);
  if(i >= 0) cur.splice(i, 1); else cur.push(v);
  if(cur.length) S.filters[k] = cur; else delete S.filters[k];
  _fdOpen = k;                       // 记住是哪个面板：整页重绘后要恢复展开
  afterFilterChange();
  paintFilterDrop();                 // 总览页不重绘筛选栏，靠它就地同步勾选态
}
/* 清掉某一个字段的全部取值（面板保持展开，方便重选） */
function clearFilterField(k){
  delete S.filters[k];
  _fdOpen = k;
  afterFilterChange();
  paintFilterDrop();
}
/* 点面板外面收起（面板内的点击会被 .fdrop 拦下） */
document.addEventListener('click', e => {
  if(!_fdOpen) return;
  const t = e.target;
  if(t && t.closest && t.closest('.fdrop')) return;
  _fdOpen = null;
  paintFilterDrop();
});

function clearFilters(){
  S.filters = {}; S.quickView='all'; S.classFilter='all'; S._search='';
  _fdOpen = null;
  renderSidebar(); renderMain(); toast('已清空全部筛选');
}
function quickSearch(v){
  v = v.trim();
  S._search = v;
  // 只重绘表格与统计条，避免整页重绘导致输入框失焦（排序口径与 renderList 保持一致）
  const list = sortList(searchList(v));
  const tb = document.querySelector('#mainArea tbody');
  if(tb) tb.innerHTML = renderRows(list);
  // 顶部数字必须一起刷新：只刷第 1 个会让「已写备注 / 需重点关注 / 有不及格」与表格对不上
  const st = document.querySelector('#mainArea .stats');
  if(st) st.outerHTML = statsHtml(list, baseList().length);
}
/* 取消排序，回到导入顺序 */
function clearSort(){ S.sort = { key:'', dir:'desc' }; renderMain(); toast('已恢复导入顺序'); }
function searchList(v){
  let list = applyAll();
  if(v){
    list = list.filter(s=>
      String(s['姓名1']||'').includes(v) || String(s['姓名']||'').includes(v) ||
      String(s['学号']||'').includes(v) ||
      String(s['考生号']||'').includes(v) || String(s['联系电话']||'').includes(v)
    );
  }
  return list;
}

/* ---------- 列表排序 ----------
   辅导员点表头即可排序：点一次降序、再点升序。
   · 「成绩」列走成绩层（加权平均成绩），默认先给「从高到低」
   · 数值列（成绩 / 学号 / 联系电话 / 考生号）按数值比，文本列按中文拼音比
   · 空值恒沉底（不论升序还是降序）—— 否则「暂无成绩」的人会被混进低分段里，
     一眼看去像是"考得最差"，这是会被误读的地方。 */
const NUM_SORT_KEYS = { '学号':1, '联系电话':1, '电话':1, '家长电话':1, '考生号':1 };

function sortValue(s, key){
  if(key === '成绩'){
    const v = gNum(gradeOf(s), '加权平均成绩');
    return isNaN(v) ? null : v;
  }
  if(key === '姓名'){ const v = studentName(s); return v || null; }
  const v = s ? s[key] : null;
  if(v == null || v === '') return null;
  if(NUM_SORT_KEYS[key]){
    const n = Number(String(v).replace(/[^\d.\-]/g,''));
    return isNaN(n) ? String(v) : n;
  }
  return String(v);
}

function sortList(list){
  const st = S.sort;
  if(!st || !st.key) return list;
  const dir = st.dir === 'asc' ? 1 : -1;
  const arr = list.slice();
  arr.sort((a,b)=>{
    const va = sortValue(a, st.key), vb = sortValue(b, st.key);
    const ea = (va == null), eb = (vb == null);
    if(ea && eb) return 0;
    if(ea) return 1;                 // 空值恒沉底
    if(eb) return -1;
    if(typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
    return String(va).localeCompare(String(vb), 'zh') * dir;
  });
  return arr;
}

/* 点表头：同一个列再点一次反向；换列则给一个合理的默认方向 */
function setSort(key){
  if(!key) return;
  if(S.sort.key === key){
    S.sort.dir = (S.sort.dir === 'desc') ? 'asc' : 'desc';
  }else{
    S.sort = { key, dir: key === '成绩' ? 'desc' : 'asc' };
  }
  renderMain();
}
function sortInd(key){
  if(!S.sort.key || S.sort.key !== key) return '<span class="sort-ind">↕</span>';
  return `<span class="sort-ind on">${S.sort.dir === 'desc' ? '↓' : '↑'}</span>`;
}
function sortLabel(){
  const st = S.sort;
  if(!st || !st.key) return '未排序';
  return `按「${colMeta(st.key).label}」${st.dir === 'desc' ? '降序' : '升序'}`;
}

/* 出列表的唯一口径：筛选 → 搜索 → 排序。所有需要"最终这份名单"的地方都调它 */
function viewList(){ return sortList(searchList((S._search||'').trim())); }

/* ---------- 自定义筛选 & 保存 ---------- */
function openCustomFilter(){
  /* 可选字段 = 常用字段 + 本批真实存在的其它字段（含自定义字段）。
     自定义字段建好后就能像导入字段一样用来筛选。 */
  const seen = new Set(), opts = [];
  FILTER_FIELDS.forEach(f=>{
    if(seen.has(f.key)) return;
    seen.add(f.key);
    opts.push(`<option value="${esc(f.key)}">${esc(f.label)}</option>`);
  });
  [...allFieldKeys()].sort((a,b)=>a.localeCompare(b,'zh'))
    .filter(k=>!isSpecialField(k) && !seen.has(k))
    .forEach(k=>{ seen.add(k); opts.push(`<option value="${esc(k)}">${esc(k)}</option>`); });

  $('modalRoot').innerHTML = `
  <div class="mask" onclick="if(event.target===this)closeModal()">
    <div class="modal" onclick="event.stopPropagation()">
      <div class="modal-head"><div class="modal-title">添加筛选条件</div>
        <div class="modal-close" onclick="closeModal()">×</div></div>
      <div class="modal-body">
        <div class="field"><label>筛选字段</label>
          <select class="fselect" id="cfField" style="width:100%;height:40px" onchange="syncCfValues()">${opts.join('')}</select></div>
        <div class="field"><label>取值（可重复添加，多选之间是「或」）</label>
          <select class="fselect" id="cfValue" style="width:100%;height:40px"></select></div>
        <div class="hint">字段列表支持扩展：导入包含新字段的表格后，新字段会自动出现在这里；
        在详情页「字段设置」里新建的自定义字段也会出现。</div>
      </div>
      <div class="modal-foot">
        <button class="btn" onclick="closeModal()">取消</button>
        <button class="btn pri" onclick="confirmCustomFilter()">添加条件</button>
      </div>
    </div>
  </div>`;
  syncCfValues();
}
function syncCfValues(){
  const k = $('cfField').value;
  const vals = [...new Set(S.students.map(s=>s[k]).filter(v=>v!=null&&v!==''))]
    .map(String).sort((a,b)=>a.localeCompare(b,'zh',{numeric:true}));
  $('cfValue').innerHTML = vals.map(v=>`<option value="${esc(v)}">${esc(v)}${filterMark(k,v)}</option>`).join('')
    + `<option value="__EMPTY__">（未填写）${filterMark(k,'__EMPTY__')}</option>`;
}
function confirmCustomFilter(){
  const k = $('cfField').value, v = $('cfValue').value;
  if(!v){ toast('请选择一个取值'); return; }
  addFilterValue(k, v);          // 追加而非覆盖 —— 同一个字段可以叠加多个取值
  closeModal(); renderMain();
  toast(`已添加条件：${k} = ${v==='__EMPTY__'?'未填写':v}`);
}

function openSaveFilter(){
  $('modalRoot').innerHTML = `
  <div class="mask" onclick="if(event.target===this)closeModal()">
    <div class="modal" onclick="event.stopPropagation()">
      <div class="modal-head"><div class="modal-title">保存为常用筛选</div>
        <div class="modal-close" onclick="closeModal()">×</div></div>
      <div class="modal-body">
        <div class="field"><label>筛选名称</label>
          <input id="sfName" placeholder="例如：英语2401 未写备注的团员" style="width:100%;height:40px;padding:0 12px;border:1px solid var(--line);border-radius:9px"></div>
        <div class="hint">当前条件：${S.classFilter!=='all'?`班级=${esc(S.classFilter)}； `:''}${
          Object.entries(S.filters).map(([k,v])=>{
            const vals = Array.isArray(v) ? v : [v];
            return `${esc(k)}=${vals.map(x=>x==='__EMPTY__'?'未填写':x).join(' 或 ')}`;
          }).join('；') || '无'}</div>
      </div>
      <div class="modal-foot">
        <button class="btn" onclick="closeModal()">取消</button>
        <button class="btn pri" onclick="saveCurrentFilter()">保存</button>
      </div>
    </div>
  </div>`;
}
function saveCurrentFilter(){
  const name = $('sfName').value.trim();
  if(!name){ toast('请输入名称'); return; }
  S.savedFilters.push({name, classFilter:S.classFilter, filters:{...S.filters}, quickView:S.quickView});
  save(); closeModal(); renderSidebar(); renderMain();
  toast('已保存为常用筛选');
}
function applySavedFilter(i){
  const f = S.savedFilters[i];
  S.classFilter = f.classFilter; S.filters = normFilters(f.filters); S.quickView = f.quickView;
  renderSidebar(); renderMain();
}

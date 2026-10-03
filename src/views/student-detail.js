/* ---------- 详情 ---------- */
let detailEdit = false;      // 详情页是否处于编辑态
let detailDraft = null;      // 编辑草稿 {fields:{}, grade:{}} —— 不直接改原对象，取消即丢弃

/* 批次里出现过的全部列（各学生取并集）。
   系统新模板有 41 列，其中不少不在 FIELD_GROUPS 里（现在年级 / 学制 / 管理老师 …）。
   以"并集"为准才能既看得到、又改得了，而不是某一行的某个字段恰好缺失就被藏起来。 */
function batchFieldKeys(){
  const set = new Set();
  S.students.forEach(s=>{ if(s) Object.keys(s).forEach(k=>{ if(k && k.charAt(0) !== '_') set.add(k); }); });
  return set;
}

/* 把值变成可安全嵌进双引号 HTML 属性里的单引号 JS 字面量 */
function jsq(v){
  return "'" + String(v == null ? '' : v)
    .replace(/\\/g,'\\\\').replace(/'/g,"\\'")
    .replace(/"/g,'&quot;').replace(/</g,'&lt;') + "'";
}

/* 编辑草稿写入（由输入框的 oninput 调用） */
function draftSet(kind, key, val){
  if(!detailDraft) return;
  const box = kind === 'g' ? detailDraft.grade : detailDraft.fields;
  box[key] = val;
  /* v2.2（升级清单 ①）：标记"有未保存的修改" —— 离开（× / 遮罩 / 侧栏跳转 / 关标签页）时要拦一道，
     否则一整页字段编辑会被静默丢弃。这是 draftSet 作为"所有编辑的唯一入口"才成立的做法。 */
  detailDraft.dirty = true;
}

/* v2.2（升级清单 ①）：离开详情页编辑前的守门。
   有未保存修改 → 先问；没有 → 直接执行 then()。
   注意用应用内 askConfirm 而不是系统 confirm（打包后的 WebView 会吞掉系统对话框）。 */
function confirmLeaveDirty(then){
  if(!(detailDraft && detailDraft.dirty)){ then(); return; }
  askConfirm({
    title:'有未保存的修改',
    html:'你正在编辑学生资料，但还没点「<b>保存修改</b>」。<br>现在离开，这些改动会丢掉。',
    okText:'确认离开',
    onOk: then
  });
}

/* 单个字段：查看态是文本，编辑态是输入框 */
/* ---------- 详情页编辑：哪些字段用「选择题」而不是自由输入 ----------
   选项来源 = 预置常用值 ∪ 本批数据里已有的值 ∪ 该生当前值
   （当前值永远保留，否则历史里的脏值会被悄悄改掉）。
   下拉末尾留一个「＋ 手输其他…」，避免选项没覆盖到的值就录不进去。 */
const SELECT_PRESETS = {
  '性别':           ['男','女'],
  /* v1.9.2：补上「入党积极分子」「发展对象」——过去这两个身份只能靠手输，
     而下拉里没有的选项很容易被手打成「积极分子」「入党积极分子（已备案）」等五花八门的写法。
     顺序按政治面貌的实际递进排列，方便一眼挑中。 */
  '政治面貌':       ['群众','共青团员','入党积极分子','发展对象','中共预备党员','中共党员','民主党派','无党派人士'],
  '学生类别':       ['普通本科','预科生','第二学士学位','专升本','留学生','港澳台侨学生'],
  '学籍状态':       ['在籍','休学','保留学籍','退学','毕业','结业'],
  '在籍状态':       ['在籍','不在籍'],
  '是否在校':       ['是','否'],
  '港澳台侨':       ['否','是'],
  '入学前户口性质': ['城镇','农村'],
  '培养层次':       ['本科','硕士','博士']
};
/* 这些字段一律走下拉，选项完全按本批数据自动生成 */
const SELECT_AUTO_FIELDS = [
  '班级','专业','院系','民族','生源地','户口所在地','出生地','校区','宿舍',
  '宿舍楼','房间号','床位','现在年级','学制','入学年月','预计毕业年份','预计毕业日期','管理老师'
];
function isSelectField(k){
  return !!(SELECT_PRESETS[k] || SELECT_AUTO_FIELDS.indexOf(k) >= 0);
}
function selectOptions(k, cur){
  const out = [], seen = new Set();
  (SELECT_PRESETS[k] || []).forEach(v=>{ if(!seen.has(v)){ seen.add(v); out.push(v); } });
  const fromData = [...new Set(S.students.map(s=>s[k])
    .filter(v=>v!=null && v!=='')
    .map(v=>String(v)))].sort((a,b)=>a.localeCompare(b,'zh',{numeric:true}));
  fromData.forEach(v=>{ if(!seen.has(v)){ seen.add(v); out.push(v); } });
  const c = (cur == null ? '' : String(cur)).trim();
  if(c && !seen.has(c)) out.unshift(c);      // 当前值不在候选里 → 置顶保留
  return out;
}
/* 选了「＋ 手输其他…」→ 在字段下面展开一个输入框，让用户直接敲。
   ⚠️ 这里**不能**用 prompt()：打包后的预览窗口（WebView）会直接吞掉系统弹窗，
   用户点了「手输其他」像是没反应。改成内联输入框，纯 DOM，任何环境都能用。 */
function onSelectField(k, sel){
  if(sel.value !== '__CUSTOM__'){
    hideCustomInput(sel);
    draftSet('f', k, sel.value);
    return;
  }
  const box = sel.parentElement && sel.parentElement.querySelector('.cv-in');
  if(!box) return;
  const cur = (detailDraft && detailDraft.fields[k] != null) ? String(detailDraft.fields[k]) : '';
  box.dataset.prev = cur;          // 记下原值，敲了空就拨回去
  box.value = cur;                 // 预填当前值，便于在原值上改
  box.style.display = '';
  try{ box.focus(); box.select(); }catch(e){}
}
function hideCustomInput(sel){
  const box = sel && sel.parentElement && sel.parentElement.querySelector('.cv-in');
  if(box && box.style.display !== 'none'){ box.style.display = 'none'; box.value = ''; }
}
/* 每敲一个字就写进草稿（只写草稿，不重渲染，输入框不会掉焦点） */
function onCustomInput(k, el){ draftSet('f', k, el.value); }
/* 回车 / 点别处 → 把输入的值补进下拉并选中；空值则还原为原值 */
function commitCustomValue(k, el){
  if(el.style.display === 'none') return;   // 回车已提交过，防止随后的 blur 二次清空
  const sel = el.parentElement && el.parentElement.querySelector('select');
  if(!sel) return;
  const nv = (el.value || '').trim();
  if(!nv){                                   // 什么都没填 → 拨回进入前的值
    const prev = el.dataset.prev || '';
    sel.value = prev;
    draftSet('f', k, prev);
  }else{
    const has = [...sel.options].some(o=>o.value === nv && o.value !== '__CUSTOM__');
    if(!has){                                // 新值补进下拉（置顶），以后还能直接选
      const o = document.createElement('option');
      o.value = nv; o.textContent = nv;
      sel.insertBefore(o, sel.firstChild);
    }
    sel.value = nv;
    draftSet('f', k, nv);
  }
  el.style.display = 'none';
  el.value = '';
}

/* ---------- 详情页「字段设置」：隐藏不关心的字段 / 新增自定义字段 ---------- */
function isHiddenField(k){ return (S.hiddenFields || []).indexOf(k) >= 0; }

/* v2.2：侧栏「关注视图」的显示开关 —— 与详情页「字段设置」同一套思路：
   只控制"入口显不显示"，数据与筛选能力都不动，随时勾回来。
   用户 2026-09-30 请求：关注视图太杂、且"缺项的灰色显示依然占用地方"。 */
function isHiddenPreset(id){ return (S.hiddenPresets || []).indexOf(id) >= 0; }
function togglePresetVisible(id, on, el){
  const set = new Set(S.hiddenPresets || []);
  if(on) set.delete(id); else set.add(id);
  S.hiddenPresets = [...set];
  save();
  renderSidebar();
  /* v2.2：设置页那颗标签**就地改状态**，不重绘整页 —— 重绘会把页面滚动位置打回顶部
     （与列设置"勾选跳回首行"是同一类问题）。没传元素时（如测试）才退回重绘。 */
  if(el && el.classList){
    el.classList.toggle('on', on);
    const p = presetById(id);
    el.textContent = (on ? '✓ ' : '') + (p ? p.label : id);
  }else if(S.view === 'settings'){
    renderSettings();
  }
}
function setHideUnavailable(v){
  S.hideUnavailable = !!v;
  save();
  renderSidebar();
  if(S.view === 'settings') renderSettings();
}
/* 全选 / 全不选：「全不选」= 把所有预设都记进隐藏清单（比逐个点 17 次省事） */
function showAllPresets(on){
  S.hiddenPresets = on ? [] : PRESETS.filter(p=>p.id!=='all').map(p=>p.id);
  save();
  renderSidebar();
  if(S.view === 'settings') renderSettings();
}
function customFieldKeys(){ return (S.customFields || []).map(f=>f.key); }

let fsHidden = null;    // 字段设置草稿：隐藏了哪些
let fsCustom = null;    // 字段设置草稿：自定义字段定义
function openFieldSettings(){
  fsHidden = new Set(S.hiddenFields || []);
  fsCustom = (S.customFields || []).map(f=>({key:f.key, label:f.label}));
  renderFieldSettings();
}
function renderFieldSettings(){
  const keys = batchFieldKeys();
  const grouped = new Set();
  FIELD_GROUPS.forEach(g=>g.keys.forEach(k=>grouped.add(k)));
  const ck = customFieldKeys();
  const extra = [...keys].filter(k=>!grouped.has(k) && !isSpecialField(k) && ck.indexOf(k)<0).sort();

  const rowOf = k => {
    const on = !fsHidden.has(k);
    return `<div class="colrow${on?' on':''}">
      <label class="colrow-chk">
        <input type="checkbox" ${on?'checked':''} onchange="fsToggle(${jsq(k)},this.checked,this)">
        <span>${esc(colMeta(k).label)}</span>
      </label>
    </div>`;
  };
  const sect = (name, list) => (!list || !list.length) ? '' : `
    <div style="font-weight:640;font-size:13px;margin:14px 0 8px;color:var(--text-2)">${esc(name)}</div>
    <div class="collist" style="max-height:none">${list.map(rowOf).join('')}</div>`;

  let h = `<div class="fieldset-hint">
    取消勾选的字段，在详情页里不再显示。<b>数据不会被删除</b>，随时勾回来都在。
    「辅导员备注」与成绩不在此列，始终显示。</div>`;
  FIELD_GROUPS.forEach(g=>{
    h += sect(g.name, g.keys.filter(k=>!isSpecialField(k) && keys.has(k) && ck.indexOf(k)<0));
  });
  h += sect('其他字段（系统导出中本批新增的列）', extra);
  h += sect('自定义字段（你自己加的）', fsCustom.map(f=>f.key));

  h += `
  <div style="font-weight:640;font-size:13px;margin:18px 0 8px;color:var(--text-2)">新增自定义字段</div>
  <div class="fieldset-hint" style="margin-bottom:8px">
    导入表里没有、但你想记的字段（例如「家长电话」「家长姓名」「高考位次」）。<br>
    新建后它就和你导入的字段一样：能录入、能当列表的列、能筛选、能导出。</div>
  <div style="display:flex;gap:8px;align-items:center">
    <input class="edit-in" id="cfName" placeholder="字段名，例如：家长电话" style="height:36px;margin-top:0"
      onkeydown="if(event.key==='Enter')addCustomField()">
    <button class="btn pri" style="flex:none" onclick="addCustomField()">新增</button>
  </div>
  ${fsCustom.length ? `<div class="collist" style="max-height:none;margin-top:10px">${
    fsCustom.map(f=>`<div class="colrow on">
      <span style="font-size:13.5px">${esc(f.label)}</span>
      <span style="flex:1"></span>
      <button class="colrow-btn" style="width:auto;padding:0 10px"
        onclick="removeCustomField(${jsq(f.key)})"
        title="删除该字段：已录入的内容会保留，只是不再显示">删除</button>
    </div>`).join('')}</div>` : ''}`;

  $('modalRoot').innerHTML = `
  <div class="mask" onclick="if(event.target===this)closeModal()">
    <div class="modal wide" onclick="event.stopPropagation()">
      <div class="modal-head"><div class="modal-title">字段设置 · 学生详情</div>
        <div class="modal-close" onclick="closeModal()">×</div></div>
      <div class="modal-body">${h}</div>
      <div class="modal-foot">
        <button class="btn" onclick="resetFieldSettings()">全部显示</button>
        <span style="flex:1"></span>
        <button class="btn" onclick="closeModal()">取消</button>
        <button class="btn pri" onclick="saveFieldSettings()">完成</button>
      </div>
    </div>
  </div>`;
}
function fsToggle(k, on, el){
  if(on) fsHidden.delete(k); else fsHidden.add(k);
  toggleRowOn(el, on);   // v2.2：与列设置共用同一处就地更新（都是"勾选不该整段重绘"）
}
function addCustomField(){
  const el = $('cfName');
  const name = ((el && el.value) || '').trim();
  if(!name){ toast('请输入字段名'); return; }
  if(allFieldKeys().has(name) || batchFieldKeys().has(name)){
    toast(`字段「${name}」已经存在，直接用它就行`); return;
  }
  if(fsCustom.some(f=>f.key === name)){ toast('已添加过该字段'); return; }
  fsCustom.push({ key:name, label:name });
  renderFieldSettings();
  toast(`已新增字段「${name}」，点「完成」后到详情页录入`);
}
function removeCustomField(k){
  askConfirm({
    title:'删除自定义字段', okText:'删除字段',
    html:`删除自定义字段「<b>${esc(k)}</b>」？<br><br>已录入的内容会<b>保留</b>在数据里（不删除），只是不再显示；以后重建同名字段即可找回。`,
    onOk(){
      fsCustom = fsCustom.filter(f=>f.key !== k);
      renderFieldSettings();
    }
  });
}
function resetFieldSettings(){
  fsHidden = new Set();
  renderFieldSettings();
}
function saveFieldSettings(){
  const sid = curStudent ? curStudent['学号'] : null;
  S.hiddenFields = [...fsHidden];
  S.customFields = fsCustom.map(f=>({ key:f.key, label:f.label }));
  save();
  closeModal();
  if(sid != null) openDetail(sid, false); else renderMain();
  toast('字段设置已保存');
}

/* 单个字段：查看态是文本；编辑态是输入框，枚举字段则给「选择题」 */
function fieldItem(k, v){
  if(detailEdit){
    const label = `<div class="info-k">${esc(k)}</div>`;
    if(isSelectField(k)){
      const cur = (detailDraft && detailDraft.fields[k] != null)
        ? String(detailDraft.fields[k]) : (v == null ? '' : String(v));
      const opts = selectOptions(k, cur);
      return `<div class="info-item">${label}
        <select class="edit-in" onchange="onSelectField(${jsq(k)},this)">
          <option value=""${cur===''?' selected':''}>（未填写）</option>
          ${opts.map(o=>`<option value="${esc(o)}"${o===cur?' selected':''}>${esc(o)}</option>`).join('')}
          <option value="__CUSTOM__">＋ 手输其他…</option>
        </select>
        <input class="edit-in cv-in" style="display:none" placeholder="直接输入，回车确认（留空取消）"
               oninput="onCustomInput(${jsq(k)},this)"
               onkeydown="if(event.key==='Enter'){event.preventDefault();commitCustomValue(${jsq(k)},this);}"
               onblur="commitCustomValue(${jsq(k)},this)">
      </div>`;
    }
    return `<div class="info-item">${label}
      <input class="edit-in" value="${esc(v == null ? '' : v)}"
             oninput="draftSet('f',${jsq(k)},this.value)">
    </div>`;
  }
  return `<div class="info-item">
    <div class="info-k">${esc(k)}</div>
    <div class="info-v ${v==null||v===''?'empty':''}">${v==null||v===''?'未填写':esc(v)}</div>
  </div>`;
}

function openDetail(sid, edit){
  const s = S.students.find(x=>String(x['学号'])===String(sid));
  if(!s) return;
  /* v2.2（升级清单 ①）：正在编辑**另一个**学生（草稿未保存）时，直接打开这位会把草稿冲掉 —— 先问一句。
     ⚠️ 同一学生不算（"保存 → 回到查看态"就是走 openDetail 同 id 的路径，那是正常流程）。
     注：**导航（侧栏跳转/换筛选）不需要守门** —— 详情弹窗挂在独立的 #modalRoot 上，
     视图切换不会碰它，草稿也不会因此丢失（这一点是实测确认的，不是推断）。 */
  if(detailDraft && detailDraft.dirty && curStudent && String(curStudent['学号']) !== String(sid)){
    askConfirm({
      title:'有未保存的修改',
      html:`学生「<b>${esc(studentName(curStudent) || '（无姓名）')}</b>」的资料还没保存。<br>现在打开另一位学生，刚才的改动会丢掉。`,
      okText:'放弃改动并打开',
      onOk(){ detailDraft.dirty = false; openDetail(sid, edit); }
    });
    return;
  }
  curStudent = s;
  detailEdit = !!edit;
  const grade = gradeOf(s);

  const keys = batchFieldKeys();
  const grouped = new Set();
  FIELD_GROUPS.forEach(g=>g.keys.forEach(k=>grouped.add(k)));
  const ck = customFieldKeys();
  const extra = [...keys].filter(k=>!grouped.has(k) && !isSpecialField(k) && ck.indexOf(k) < 0).sort();

  if(detailEdit){
    detailDraft = { fields:{}, grade:{} };
    /* 草稿要覆盖「本批有值的字段 + 自定义字段」：
       自定义字段刚建好时还没有任何学生带该键，漏掉它就第一遍录不进去。 */
    const all = new Set([...keys, ...ck]);
    all.forEach(k=>{ if(!isSpecialField(k)) detailDraft.fields[k] = s[k] == null ? '' : String(s[k]); });
    GRADE_FIELDS.forEach(k=>{ detailDraft.grade[k] = (grade && grade[k] != null) ? String(grade[k]) : ''; });
  }else{
    detailDraft = null;
  }

  /* 被「字段设置」隐藏的字段只是不显示 —— 它的草稿值仍在，保存时不会被误清空 */
  let groups = '';
  const groupHtml = (name, list) => `<div style="margin-bottom:18px">
      <div style="font-weight:640;font-size:13.5px;margin-bottom:9px;color:var(--text-2)">${esc(name)}</div>
      <div class="info-grid">${list.map(k=>fieldItem(k, s[k])).join('')}</div></div>`;
  FIELD_GROUPS.forEach(g=>{
    const list = g.keys.filter(k=>!isSpecialField(k) && keys.has(k) && !isHiddenField(k));
    if(list.length) groups += groupHtml(g.name, list);
  });
  const extraShow = extra.filter(k=>!isHiddenField(k));
  if(extraShow.length) groups += groupHtml('其他字段（系统导出中本批新增的列）', extraShow);
  const customShow = ck.filter(k=>!isHiddenField(k));
  if(customShow.length) groups += groupHtml('自定义字段（你自己加的）', customShow);

  const tags = [];
  if(grade && gNum(grade,'不及格门数')>0) tags.push(`<span class="tag red">不及格 ${esc(gShow(grade['不及格门数']))} 门</span>`);
  if(s['挂科情况']) tags.push(`<span class="tag red">有挂科记录</span>`);
  if(s['军训备注']) tags.push(`<span class="tag orange">军训备注</span>`);
  if(s['班委']) tags.push(`<span class="tag blue">${esc(s['班委'])}</span>`);

  const mod = `
  <div class="mask" onclick="if(event.target===this)closeModal()">
    <div class="modal wide" onclick="event.stopPropagation()">
      <div class="modal-head">
        <div class="modal-title">学生详情${detailEdit?'<span class="tag blue" style="margin-left:8px">编辑中</span>':''}</div>
        <button class="tb-btn" onclick="openFieldSettings()"
          title="设置详情页显示哪些字段，或新增导入表里没有的字段">字段设置</button>
        <div class="modal-close" onclick="closeModal()">×</div>
      </div>
      <div class="modal-body">
        <div class="detail-head">
          <div class="avatar-lg">${esc((studentName(s)||'?').charAt(0))}</div>
          <div style="flex:1;min-width:180px">
            <div class="detail-name">${esc(studentName(s))} ${tags.join(' ')}</div>
            <div class="detail-meta">
              <span>学号 ${esc(s['学号'])}</span>
              <span>${esc(s['班级']||'')}</span>
              <span>${esc(s['专业']||'')}</span>
              <span>${esc(s['性别']||'')}</span>
            </div>
          </div>
        </div>

        <div id="tagBox">${detailTagBlock(sid)}</div>

        ${detailFollowUpBlock(s)}

        <!-- 辅导员备注 -->
        <div style="margin-bottom:18px">
          <div style="font-weight:640;font-size:13.5px;margin-bottom:9px;color:var(--text-2)">
            辅导员备注 <span style="font-weight:400;color:var(--text-3);font-size:12px">· 仅保存在本机</span></div>
          <textarea class="remark-area" id="remarkBox" placeholder="记录该生的特殊情况、谈话要点、跟进事项…"
            oninput="draftSet('f','备注（保密）',this.value)">${esc(s['备注（保密）']||'')}</textarea>
          ${detailEdit
            ? `<div style="font-size:12px;color:var(--text-3);margin-top:8px">编辑态：备注与下面各项会一起写入（点右下角「保存修改」）</div>`
            : `<div style="display:flex;gap:9px;margin-top:10px;align-items:center">
            <button class="btn pri" onclick="saveRemark()">保存备注</button>
            <button class="btn" onclick="clearRemark()">清空</button>
            <span style="font-size:12px;color:var(--text-3)" id="rmTip">修改后请点击保存</span>
          </div>`}
        </div>

        <!-- 成绩：取自系统「成绩信息」表，按学号与当前学生绑定 -->
        <div style="margin-bottom:18px">
          <div style="font-weight:640;font-size:13.5px;margin-bottom:9px;color:var(--text-2)">
            成绩 <span style="font-weight:400;color:var(--text-3);font-size:12px">· 取自系统「成绩信息」表，按学号绑定</span></div>
          ${detailEdit ? `
          <div class="info-grid" style="grid-template-columns:repeat(auto-fill,minmax(140px,1fr))">
            ${GRADE_FIELDS.map(k=>`<div class="info-item">
              <div class="info-k">${esc(k)}</div>
              <input class="edit-in" value="${esc(detailDraft.grade[k]||'')}"
                     oninput="draftSet('g',${jsq(k)},this.value)">
            </div>`).join('')}
          </div>
          <div style="font-size:12px;color:var(--text-3);margin-top:8px">${
            grade ? '修改后按「学号」更新该生的成绩记录。'
                  : '该生当前<b>暂无成绩记录</b>——填任意一项即会新建；全部留空则不创建。'}</div>
          ` : (grade ? `
          <div class="info-grid" style="grid-template-columns:repeat(auto-fill,minmax(132px,1fr))">
            <div class="info-item"><div class="info-k">加权平均成绩</div>
              <div class="info-v" style="font-size:17px;font-weight:660">${esc(gShow(grade['加权平均成绩']))}</div></div>
            <div class="info-item"><div class="info-k">平均学分绩点</div>
              <div class="info-v" style="font-size:17px;font-weight:660">${esc(gShow(grade['平均学分绩点']))}</div></div>
            <div class="info-item"><div class="info-k">排名</div>
              <div class="info-v" style="font-size:17px;font-weight:660">${esc(gShow(grade['排名']))}</div></div>
            <div class="info-item"><div class="info-k">平均分</div>
              <div class="info-v" style="font-size:17px;font-weight:660">${esc(gShow(grade['平均分']))}</div></div>
            <div class="info-item"><div class="info-k">课程门数</div>
              <div class="info-v" style="font-size:17px;font-weight:660">${esc(gShow(grade['课程门数']))}</div></div>
            <div class="info-item"><div class="info-k">不及格门数</div>
              <div class="info-v" style="font-size:17px;font-weight:660;${gNum(grade,'不及格门数')>0?'color:var(--danger)':''}">${esc(gShow(grade['不及格门数']))}</div></div>
            <div class="info-item"><div class="info-k">总分</div>
              <div class="info-v" style="font-size:17px;font-weight:660">${esc(gShow(grade['总分']))}</div></div>
            <div class="info-item"><div class="info-k">所得学分</div>
              <div class="info-v" style="font-size:17px;font-weight:660">${esc(gShow(grade['所得学分']))}</div></div>
          </div>` : `
          <div class="note-banner" style="margin-bottom:0">
            该生<b>暂无成绩记录</b>——本批成绩表里没有这个学号。若其应有成绩，请核对成绩表是否覆盖了该生，
            也可以直接点「✏ 编辑档案」手工补录。
          </div>`)}
        </div>

        <!-- 完整字段 -->
        <div style="font-weight:640;font-size:13.5px;margin-bottom:9px;color:var(--text-2)">
          完整档案 <span style="font-weight:400;color:var(--text-3);font-size:12px">· 导入时原样保留全部字段${detailEdit?' · 现在均可编辑':''}</span></div>
        ${groups}
      </div>
      <div class="modal-foot">
        ${detailEdit
          ? `<button class="btn" onclick="openDetail(${jsq(String(s['学号']))},false)">取消编辑</button>
             <button class="btn pri" onclick="saveDetailEdit()">保存修改</button>`
          : `<button class="btn" onclick="closeModal()">关闭</button>
             <button class="btn" onclick="openDetail(${jsq(String(s['学号']))},true)">✏ 编辑档案</button>
             <button class="btn pri" onclick="saveRemarkAndClose()">保存备注并关闭</button>
             <button class="btn" style="color:var(--danger);border-color:var(--danger-line)"
                     title="从当前批次删除该学生（30 秒内可撤销）" onclick="deleteStudent(${jsq(String(s['学号']))})">删除该学生</button>`}
      </div>
    </div>
  </div>`;

  $('modalRoot').innerHTML = mod;
}

function saveRemark(){
  if(!curStudent) return;
  const v = $('remarkBox').value.trim();
  curStudent['备注（保密）'] = v || null;
  save();
  $('rmTip').textContent = '已保存 · ' + fmtDate();
  renderMain();
  toast('备注已保存到本机');
}
function clearRemark(){ $('remarkBox').value=''; $('rmTip').textContent='已清空，点击保存生效'; }
function saveRemarkAndClose(){ saveRemark(); closeModal(); }

/* ---------- 详情 · 保存全部修改 ----------
   一次把「档案字段 + 备注 + 成绩指标」写回。
   · 只有真正变化的项才计数、才写库，避免无意义地"改"一遍
   · 学号是成绩绑定的主键：改动前必须显式确认，否则成绩会悄悄对不上
   · 成绩层没有记录时可以补录；把 8 项全部清空 = 删除这条成绩记录 */
function saveDetailEdit(){
  if(!curStudent || !detailDraft){ toast('没有可保存的修改'); return; }
  const s = curStudent;

  // ① 学号变更需确认（它是成绩绑定的主键）—— 改了就先弹应用内确认，确认后走 saveDetailEditApply
  const rawId = detailDraft.fields['学号'];
  const newId = String(rawId == null ? (s['学号']==null?'':s['学号']) : rawId).trim();
  const oldId = String(s['学号']==null?'':s['学号']).trim();
  if(newId !== oldId){
    askConfirm({
      title:'修改学号', okText:'确认修改',
      html:`学号将从 <b>${esc(oldId||'（空）')}</b> 改为 <b>${esc(newId||'（空）')}</b>。<br><br>学号是成绩绑定的主键，改动后该生的成绩可能对不上（需重新导入成绩表，或再手工修正一次）。`,
      onOk(){ saveDetailEditApply(); }
    });
    return;
  }
  saveDetailEditApply();
}

/* 保存的实际执行（应用内确认之后也走这里；学号可能已改，主键在此重算） */
function saveDetailEditApply(){
  const s = curStudent;
  if(!s || !detailDraft){ toast('没有可保存的修改'); return; }
  /* v2.2（升级清单 D）：**改动前**先拍一张快照。保存后若真有改动，就用现成的 30 秒撤销条
     给一次后悔药（误清字段、数字填错都能一键回来）；没改动则不亮出撤销条，避免"撤销了个寂寞"。
     ⚠️ 必须在这里立刻 stringify —— 后面的循环会就地改 s，晚了拍到的就是改后的值。 */
  const beforeEdit = JSON.stringify({ batches: S.batches, activeBatchId: S.activeBatchId });
  const rawId2 = detailDraft.fields['学号'];
  const newId = String(rawId2 == null ? (s['学号']==null?'':s['学号']) : rawId2).trim();
  const oldId = String(s['学号']==null?'':s['学号']).trim();
  // 学号变了：把已绑定的成绩记录一起搬过去，免得平白多出一条"孤儿成绩"
  if(newId && oldId && newId !== oldId){
    const rec0 = (S.grades||[]).find(x=>String(x['学号']==null?'':x['学号']).trim() === oldId);
    if(rec0){ rec0['学号'] = newId; invalidateGradeMap(); }
  }

  // ② 档案字段（逐项比对，空字符串 = 清空该字段）
  let n = 0;
  Object.entries(detailDraft.fields).forEach(([k, v])=>{
    const nv = String(v == null ? '' : v).trim();
    const oldRaw = s[k];
    const oldStr = (oldRaw == null || oldRaw === '') ? '' : String(oldRaw);
    if(nv === oldStr) return;
    // 原来是数字的字段，输入仍是数字时保持数字类型（导出/展示口径不变）
    s[k] = nv === '' ? null
      : (typeof oldRaw === 'number' && /^-?\d+(\.\d+)?$/.test(nv) ? Number(nv) : nv);
    n++;
  });

  // ③ 成绩指标（按学号 upsert；全空则删掉这条记录）
  const gIn = detailDraft.grade || {};
  const gChanged = GRADE_FIELDS.filter(k=>{
    const rec = gradeOf(s);
    const oldStr = (rec && rec[k] != null) ? String(rec[k]) : '';
    return String(gIn[k] == null ? '' : gIn[k]).trim() !== oldStr;
  });
  if(gChanged.length){
    const id = String(s['学号']==null?'':s['学号']).trim();
    if(!id){
      toast('该生学号为空，无法绑定成绩');
    }else{
      let rec = (S.grades||[]).find(x=>String(x['学号']==null?'':x['学号']).trim() === id);
      if(!rec){
        rec = { '学号': id };
        if(!Array.isArray(S.grades)) S.grades = [];
        S.grades.push(rec);          // push 不改数组引用，S.grades 仍与批次同一份
      }
      GRADE_FIELDS.forEach(k=>{
        const nv = String(gIn[k] == null ? '' : gIn[k]).trim();
        rec[k] = nv;
      });
        if(GRADE_FIELDS.every(k=>rec[k] === '')){
          const i = S.grades.indexOf(rec);
          if(i >= 0) S.grades.splice(i, 1);   // 8 项全空 = 删除该成绩
        }
        /* v2.0.0：把 S.grades 重新挂回当前批次。
           正常路径下 S.grades 本来就是批次那一份，这一步是同值赋值、没有副作用；
           但万一它是个「孤儿数组」（旧数据迁移等场景会出现），不挂回去的话
           上面这条成绩只活在内存里 —— save() 存的是批次，重开就没了
           （与 v1.9.6 那次丢数据是同一个源头）。 */
        setGrades(S.grades);
        invalidateGradeMap();
      n += gChanged.length;
    }
  }

  save();
  if(n) offerUndo(beforeEdit, `已修改 ${studentName(s) || '该生'} 的资料（${n} 项）`);
  toast(n ? `已保存 ${n} 项修改` : '没有检测到修改');
  openDetail(s['学号'], false);
  renderBatchBar(); renderSidebar(); renderMain();
}

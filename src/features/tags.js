/* ════════════════════════════════════════════════════════════════════════
   modules/student-tags.js —— 关注视图预设 · 关注标签 · 跟进记录
   ────────────────────────────────────────────────────────────────────────
   前半部分（字段元数据与归一化）已移入 src/domain/field-schema.js。

   剩下的都是「认识学生、也要动界面」的东西：
     关注视图预设（需重点关注 / 有挂科 / 绩点偏低…）
     关注标签（emoji，辅导员手工贴）
     跟进记录（什么时候跟谁谈过、下次什么时候复查）

   ⚠️ 本批数据缺某字段时，相关视图必须**置灰并说明原因，绝不显示 0** ——
      「0 人挂科」比没数据更危险。
   ════════════════════════════════════════════════════════════════════════ */

/* 预设视图
   · need       该视图依赖哪些【学生表】字段
   · gradeNeed  该视图依赖哪些【成绩表】指标
   · requireGrade 需要先导入成绩才有意义
   注意：列表页顶部的数字、看板的提醒都直接跳到这里，新增预设时请一并考虑落点。 */
const PRESETS = [
  {id:'all',       label:'全部学生', always:true,   fn:list=>list},
  {id:'focus',     label:'需重点关注', fn:list=>list.filter(s=>hasFocus(s))},
  {id:'tagged',    label:'带标签学生', fn:list=>list.filter(s=>hasFocusTag(s))},
  {id:'fail',      label:'有不及格',   fn:list=>list.filter(s=>{const g=gradeOf(s); return !!g && gNum(g,'不及格门数')>0;}), gradeNeed:['不及格门数']},
  {id:'lowgpa',    label:'绩点偏低',   fn:list=>list.filter(s=>{const v=gNum(gradeOf(s),'平均学分绩点'); return !isNaN(v) && v>0 && v<LOW_GPA;}), gradeNeed:['平均学分绩点']},
  {id:'noscore',   label:'暂无成绩',   fn:list=>list.filter(s=>!gradeOf(s)), requireGrade:true},
  {id:'noremark',  label:'未写备注',   fn:list=>list.filter(s=>!s['备注（保密）'])},
  {id:'hasremark', label:'已写备注',   fn:list=>list.filter(s=>s['备注（保密）'])},
  {id:'party',     label:'团员/党员',  fn:list=>list.filter(s=>/共青团员|党员/.test(s['政治面貌']||'')), need:['政治面貌']},
  {id:'cadre',     label:'班委成员',   fn:list=>list.filter(s=>s['班委']), need:['班委']},

  /* ── v2.2：真实导出表（学工系统 42 列）带来的预设 ──
     判定式与**本批真实命中人数**都记在注释里（样本 189 行，见
     docs/真实模板适配与查看体验-方案.md 第 2.1 节）。这一组都是"筛出少数人"的负向条件 ——
     所以在单值常量列上会得到 **0**（而不是"全部人"），0 是正确答案、不该被置灰。
     注意字段名一律用**归一后的内部名**（住宿地址→宿舍、身份证件号→证件号码、手机号→联系电话）。 */
  {id:'xjabnormal', label:'学籍异常',      fn:list=>list.filter(s=>(s['学籍状态'] && s['学籍状态'] !== '在读') || s['是否在校'] === '否'), need:['学籍状态','是否在校']},
  {id:'nodorm',     label:'不住校',        fn:list=>list.filter(s=>!s['宿舍']), need:['宿舍']},
  {id:'dormnoin',   label:'不在校却有床位', fn:list=>list.filter(s=>s['是否在校'] === '否' && !!s['宿舍']), need:['是否在校','宿舍']},
  {id:'second',     label:'第二学士学位',  fn:list=>list.filter(s=>String(s['学制'] || '') === '2' || /二/.test(String(s['班级'] || ''))), need:['学制','班级']},
  {id:'nocontact',  label:'缺联系方式',    fn:list=>list.filter(s=>!s['联系电话']), need:['联系电话']},
  {id:'noidno',     label:'无证件号',      fn:list=>list.filter(s=>!s['证件号码']), need:['证件号码']},
  {id:'nowechat',   label:'缺微信号',      fn:list=>list.filter(s=>!s['微信号']), need:['微信号']},
  {id:'earlygrad',  label:'提前毕业',      fn:list=>list.filter(s=>isEarlyGrad(s)), need:['预计毕业年份']},

  /* ── v2.2（升级清单 C）：跟进记录到期 ──
     判定：某条的"下次跟进日" ≤ 今天。没写"下次"的不算 —— 否则会永远挂在提醒里。
     need 挂「跟进记录」→ 本批谁都没记过跟进时这个预设自动消失，不占侧栏。 */
  {id:'followdue',  label:'该跟进',        fn:list=>list.filter(s=>followUpDue(s)), need:['跟进记录']}
];

/* 某个预设当前是否可跳转 */
function presetById(id){ return PRESETS.find(p=>p.id===id); }

/* 这个预设在本批会不会"命中全部人"（= 等于没筛）。
   典型来源：字段是**单值常量**（例如本批所有人都是同一个校区）。
   ⚠️ 只判"命中全部"，**不判"命中 0"** —— 0 是有意义的答案（"本批没有这类学生"），
   置灰会把它藏起来。另外空批次（还没导数据）也不判，否则所有预设都会被误置灰。 */
function presetMatchesAll(p){
  const all = S.students || [];
  if(!all.length || typeof p.fn !== 'function') return false;
  try{ return p.fn(all.slice()).length === all.length; }catch(e){ return false; }
}

/* 视图是否可用：
   · need         —— 依赖学生表字段，本批一个非空值都没有 → 置灰
   · gradeNeed    —— 依赖成绩表指标，本批成绩里没有该指标 → 置灰
   · requireGrade —— 需先导入成绩（否则「暂无成绩」等于全部人，没有意义）
   · v2.2：命中的是**全部学生** → 也置灰（点进去等于没筛；常量列上的预设就是这种）。
     只有标了 `always:true` 的预设豁免 —— 目前只有「全部学生」本身。 */
function presetAvailable(p){
  if(!p) return false;
  if(p.requireGrade && !hasGrade()) return false;
  if(p.gradeNeed && !p.gradeNeed.some(gradeHasData)) return false;
  if(p.need && !p.need.some(fieldHasData)) return false;
  if(!p.always && presetMatchesAll(p)) return false;
  return true;
}

/* 预设不可用时，告诉用户缺的是什么 */
function presetMissText(p){
  // 先区分「整批都没导成绩」和「导了成绩但这一项是空的」——两者提示完全不同
  if(!hasGrade() && (p.gradeNeed || p.requireGrade)) return '尚未导入成绩';
  if(p.gradeNeed && !p.gradeNeed.some(gradeHasData)) return '成绩表未提供：' + p.gradeNeed.join('、');
  // 字段在、但整批都没值 → 说字段名（比"筛不出人"更具体）
  if(p.need && !p.need.some(fieldHasData)) return p.need.join('、');
  if(presetMatchesAll(p)) return '本批学生全部符合（筛不出人）';
  if(p.need) return p.need.join('、');
  return '字段缺失';
}

/* 「需重点关注」= 有不及格（来自成绩表）或 旧挂科字段（来自学生表，仅为旧模板兼容）有值 */
/* ======== v1.9.8：学生「关注标签」（可自定义） ========
   原来的「需重点关注」只认两类信号：成绩表的不及格门数、学生表的挂科情况/军训备注
   ⚠️ 军训备注已于 v2.1.x 移出关注信号。这是**口径决定，不是修 bug**：
      该字段确有该跟进的值（样例「膝盖受伤、请假」），但它属身体 / 请假类信息，
      与学业预警不同源 —— 不该由一列旧导出字段自动推断，该由辅导员用关注标签主动标注。
      （只摘信号，不删字段 —— 详情页「入学与住宿」里仍能看到它。见 CONTEXT.md「关注信号」）
   —— 也就是"有据可查"的那部分。但辅导员真正在跟的事往往没数据来源：
   心理状态、单亲、人际紧张…… 这些只有自己知道，得有地方标。
   设计取舍：
     · 标签存成一个字符串字段「关注标签」（如 '🎭⛄'），**存 emoji 本身**而不是 id ——
       这样导出 Excel 看到的就是 emoji，也能直接在 Excel 里手写，导回来照样认；
     · 默认只显示 emoji（列表里不占地方），名称放在鼠标悬停提示里；
     · 标签表（emoji + 名称）可增删改，预置 🎭心理 / 👩‍👦单亲 / ⛄人际。
   ⚠️ 👩‍👦 是 ZWJ 组合字符，**不能靠 [...str] 逐字符拆**（会被拆成 👩 和 👦 两个），
     所以一律按"已知标签的 emoji 做子串匹配"来还原，剩下的残余再兜底显示。 */
const FOCUS_TAG_PRESET = [
  { emoji:'🎭', label:'心理' },
  { emoji:'👩‍👦', label:'单亲' },
  { emoji:'⛄', label:'人际' }
];
function focusTags(){
  if(!Array.isArray(S.focusTags) || !S.focusTags.length) S.focusTags = FOCUS_TAG_PRESET.map(x=>({ ...x }));
  return S.focusTags;
}
function tagStr(s){ return String((s && s['关注标签']) || ''); }
function hasFocusTag(s){ return tagStr(s).trim() !== ''; }
function tagLabelOf(emoji){ const t = focusTags().find(x=>x.emoji === emoji); return t ? t.label : ''; }
/* 还原一个学生身上的标签：先按已知标签匹配（ZWJ 安全），再兜底收残余字符 */
function tagsOf(s){
  const str = tagStr(s);
  if(!str.trim()) return [];
  let rest = str, out = [];
  focusTags().forEach(t=>{ if(t.emoji && rest.indexOf(t.emoji) >= 0){ out.push(t.emoji); rest = rest.split(t.emoji).join(''); } });
  rest = rest.replace(/\u200d/g, '').trim();
  if(rest) out = out.concat([...rest].filter(c=>c.trim()));
  return out;
}
function tagTitleOf(s){
  return tagsOf(s).map(e=>tagLabelOf(e) ? `${e}${tagLabelOf(e)}` : e).join(' ');
}
/* 列表/看板里的一小串图标（鼠标悬停给出名称） */
function tagBadge(s){
  const list = tagsOf(s);
  if(!list.length) return '';
  return ` <span class="tag-badge" title="${esc(tagTitleOf(s))}">${list.join('')}</span>`;
}
function detailTagBlock(sid){
  const s = S.students.find(x=>String(x['学号'])===String(sid));
  if(!s) return '';
  const cur = tagStr(s);
  return `<div style="margin-bottom:18px">
    <div style="font-weight:640;font-size:13.5px;margin-bottom:9px;color:var(--text-2)">关注标签
      <span style="font-weight:400;font-size:11.5px;color:var(--text-3)">· 点一下标记或取消；列表里只显示图标，悬停可看名称</span></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      ${focusTags().map(t=>{
        const on = cur.indexOf(t.emoji) >= 0;
        return `<button class="btn" style="padding:4px 12px;font-size:12.5px;${
          on ? 'border-color:var(--brand);background:var(--brand-soft);color:var(--brand);font-weight:620' : ''}"
          onclick="toggleStudentTag(${jsq(String(s['学号']))}, ${jsq(t.emoji)})"
          title="${on ? '点击取消' : '点击标记'}：${esc(t.label)}">${t.emoji} ${on ? '✓' : ''}${esc(t.label)}</button>`;
      }).join('')}
      <button class="btn" style="padding:4px 12px;font-size:12.5px" onclick="openTagManager()">＋ 自定义标签</button>
    </div>
  </div>`;
}
function toggleStudentTag(sid, emoji){
  const s = S.students.find(x=>String(x['学号'])===String(sid));
  if(!s) return;
  const cur = tagStr(s);
  const on = cur.indexOf(emoji) >= 0;
  const next = on ? cur.split(emoji).join('') : (cur + emoji);
  s['关注标签'] = next || null;
  save();
  /* v2.2：**就地刷新标签块**，不再整体 openDetail ——
     整体重渲染会把编辑态的 detailDraft 重新初始化，**未保存的字段编辑会被静默冲掉**（老毛病）。 */
  refreshDetailBlock('tagBox', ()=>detailTagBlock(sid));
  toast(on ? `已取消 ${emoji}${tagLabelOf(emoji)}` : `已标记 ${emoji}${tagLabelOf(emoji)}`);
}
/* v2.2：就地替换弹窗里的某一块（拿不到那个块就返回 false —— 例如详情页根本没开着） */
function refreshDetailBlock(boxId, htmlFn){
  const box = $(boxId);
  if(box && typeof box.innerHTML === 'string'){ box.innerHTML = htmlFn(); return true; }
  return false;
}

/* ---------- v2.2（升级清单 C）：学生跟进记录 ----------
   为什么存在**学生字段**上（而不是像成绩那样另做一个层）：
     · 它就是一个普通字段 → 导入 / 导出 Excel / 备份 / 详情编辑**全都自动带上**，零新增管道；
     · 换电脑只要带学生表那一个文件；在 Excel 里补的跟进，导回来照样认。
   格式（人可读、Excel 可编辑、可往返），每行一条：
     2026-09-30 谈心：家庭经济困难，已告知绿色通道 → 2026-10-15
   前 10 位是日期；` → ` 之后是可选的"下次跟进日"；没写箭头 = 不需要再跟。 */
const FU_LINE_SEP = '\n';
const FU_ARROW = ' → ';
const FU_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function parseFollowUps(s){
  const raw = (s && s['跟进记录'] != null) ? String(s['跟进记录']) : '';
  return raw.split(FU_LINE_SEP).map(l=>l.trim()).filter(Boolean).map(l=>{
    const i = l.indexOf(FU_ARROW);
    const head = (i >= 0 ? l.slice(0, i) : l).trim();
    const nxt  = i >= 0 ? l.slice(i + FU_ARROW.length).trim() : '';
    const d = head.slice(0, 10);
    const hasDate = FU_DATE_RE.test(d);
    return { date: hasDate ? d : '', text: (hasDate ? head.slice(10) : head).trim(), next: FU_DATE_RE.test(nxt) ? nxt : '' };
  });
}
function serializeFollowUps(arr){
  const lines = (arr || []).filter(x=>x && (x.date || x.text)).map(x=>{
    const head = (x.date ? x.date + ' ' : '') + String(x.text || '').trim();
    return x.next ? head + FU_ARROW + x.next : head;
  });
  return lines.join(FU_LINE_SEP) || null;
}
function addFollowUp(s, entry){
  if(!s || !entry || !String(entry.text || '').trim()){ toast('写一句跟进内容'); return false; }
  const arr = parseFollowUps(s);
  arr.push({ date: entry.date || todayStr(), text: String(entry.text).trim(), next: entry.next || '' });
  s['跟进记录'] = serializeFollowUps(arr);
  return true;
}
function removeFollowUp(s, idx){
  const arr = parseFollowUps(s);
  if(idx < 0 || idx >= arr.length) return false;
  arr.splice(idx, 1);
  s['跟进记录'] = serializeFollowUps(arr);
  return true;
}
/* 到期 = 某条的"下次跟进日" ≤ 今天（含今天）。没写"下次"的不算 —— 否则会永远挂在提醒里 */
function followUpDue(s, today){
  const t = today || todayStr();
  return parseFollowUps(s).some(x => x.next && x.next <= t);
}
function followUpDueList(list, today){
  return (list || []).filter(s => followUpDue(s, today));
}
/* 详情页里的那一块（单独成函数，便于就地刷新，不牵动整个弹窗） */
function detailFollowUpBlock(s){
  if(!s) return '';
  const arr = parseFollowUps(s);
  const today = todayStr();
  const due = arr.some(x => x.next && x.next <= today);
  const rows = arr.map((x, i) => Object.assign({}, x, { i })).slice(-5).reverse();   // 最近 5 条，新的在上
  return `<div id="fuBox">
    <div style="font-weight:640;font-size:13.5px;margin-bottom:9px;color:var(--text-2)">跟进记录
      <span style="font-weight:400;font-size:11.5px;color:var(--text-3)">· 共 ${arr.length} 条${
        due ? ' · <b style="color:var(--warn)">有到期的</b>' : ''}${arr.length > 5 ? ' · 只显示最近 5 条' : ''}</span></div>
    ${rows.length ? `<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:9px">${rows.map(x=>`
      <div style="display:flex;gap:9px;align-items:baseline;font-size:12.5px;line-height:1.7">
        <span style="color:var(--text-3);flex-shrink:0">${esc(x.date || '—')}</span>
        <span style="flex:1;min-width:0;word-break:break-word">${esc(x.text || '')}</span>
        ${x.next ? `<span style="flex-shrink:0;color:${x.next <= today ? 'var(--warn)' : 'var(--text-3)'}">下次 ${esc(x.next)}</span>` : ''}
        <button class="btn" style="padding:1px 7px;font-size:11.5px" title="删除这条"
          onclick="deleteFollowUp(${x.i})">×</button>
      </div>`).join('')}</div>`
      : `<div style="font-size:12.5px;color:var(--text-3);margin-bottom:9px">还没有跟进记录</div>`}
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <input class="input" id="fuText" style="flex:1;min-width:180px" placeholder="记一条：谈了什么 / 下一步做什么"
        onkeydown="if(event.key==='Enter'){event.preventDefault();saveFollowUp();}">
      <input class="input" id="fuNext" type="date" style="width:auto" title="下次跟进日（可选）">
      <button class="btn pri" onclick="saveFollowUp()">加一条</button>
    </div>
    <div style="font-size:11.5px;color:var(--text-3);margin-top:6px">
      日期默认今天；填了「下次跟进日」，到那天会进看板的「关注提醒」，也能在侧栏「该跟进」里筛出来</div>
  </div>`;
}
function saveFollowUp(){
  const s = curStudent;
  if(!s) return;
  const t = $('fuText'), n = $('fuNext');
  if(!addFollowUp(s, { date: todayStr(), text: (t && t.value) || '', next: (n && n.value) || '' })) return;
  save();
  refreshDetailBlock('fuBox', ()=>detailFollowUpBlock(s));   // 就地刷新：编辑态的草稿不受影响
  if(t) t.value = '';
  if(n) n.value = '';
  toast('已记一条跟进');
}
function deleteFollowUp(i){
  const s = curStudent;
  if(!s) return;
  if(!removeFollowUp(s, i)) return;
  save();
  refreshDetailBlock('fuBox', ()=>detailFollowUpBlock(s));
  toast('已删除这条跟进');
}
/* 标签管理：增删改（改了名称不影响已标记的学生 —— 存的是 emoji） */
function openTagManager(){
  $('modalRoot').innerHTML = `
  <div class="mask" onclick="if(event.target===this)closeModal()">
    <div class="modal" onclick="event.stopPropagation()">
      <div class="modal-head"><div class="modal-title">关注标签</div>
        <div class="modal-close" onclick="closeModal()">×</div></div>
      <div class="modal-body">
        <div class="hint">标签只存在本机。学生身上记的是 <b>emoji 本身</b>，
          所以导出 Excel 看到的就是这些图标，也能直接在 Excel 里手写后导回来。</div>
        <div style="margin:14px 0">
          ${focusTags().map(t=>{
            const n = S.students.filter(s=>tagStr(s).indexOf(t.emoji) >= 0).length;
            return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--line)">
              <span style="font-size:18px">${t.emoji}</span>
              <input class="input" style="flex:1" value="${esc(t.label)}" onchange="renameFocusTag(${jsq(t.emoji)}, this.value)">
              <span style="font-size:12px;color:var(--text-3);flex-shrink:0">${n} 人</span>
              <button class="btn" style="padding:3px 10px;font-size:12px;color:var(--danger);border-color:var(--danger-line)"
                onclick="delFocusTag(${jsq(t.emoji)})">删除</button>
            </div>`;
          }).join('')}
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <input class="input" id="newTagEmoji" style="width:76px;text-align:center" placeholder="😀" maxlength="4">
          <input class="input" id="newTagLabel" style="flex:1" placeholder="标签名称（如：家庭困难）">
          <button class="btn pri" onclick="addFocusTag()">新增</button>
        </div>
        <div style="font-size:11.5px;color:var(--text-3);margin-top:6px">第一个框填一个 emoji（可从输入法表情里选），第二个框填名称。</div>
      </div>
      <div class="modal-foot"><button class="btn pri" onclick="closeModal()">完成</button></div>
    </div>
  </div>`;
}
function addFocusTag(){
  const emoji = ($('newTagEmoji').value || '').trim();
  const label = ($('newTagLabel').value || '').trim();
  if(!emoji){ toast('先填一个 emoji'); return; }
  if(!label){ toast('给标签起个名字（鼠标悬停时显示）'); return; }
  if(focusTags().some(t=>t.emoji === emoji)){ toast('这个 emoji 已经用过了'); return; }
  S.focusTags.push({ emoji, label });
  save(); openTagManager(); toast(`已新增标签 ${emoji}${label}`);
}
function renameFocusTag(emoji, label){
  const t = focusTags().find(x=>x.emoji === emoji);
  if(!t) return;
  t.label = String(label || '').trim() || t.label;
  save(); toast('标签名称已更新');
}
function delFocusTag(emoji){
  const n = S.students.filter(s=>tagStr(s).indexOf(emoji) >= 0).length;
  askConfirm({
    title:'删除标签', danger:true, okText:'删除标签',
    html:`删除标签 <b>${emoji}${esc(tagLabelOf(emoji))}</b>？${n ? `<br><br>已经标记过它的 <b>${n}</b> 名学生会一并去掉这个标记（其他数据不受影响）。` : ''}`,
    onOk(){
      S.focusTags = focusTags().filter(t=>t.emoji !== emoji);
      if(n) S.students.forEach(s=>{ const cur = tagStr(s); if(cur.indexOf(emoji) >= 0) s['关注标签'] = cur.split(emoji).join('') || null; });
      save(); openTagManager(); renderMain(); toast('标签已删除');
    }
  });
}

function hasFocus(s){
  const g = gradeOf(s);
  if(g && gNum(g,'不及格门数') > 0) return true;
  if(s['挂科情况']) return true;   // 旧导出模板的遗留字段，仅为老批次兼容保留
  return hasFocusTag(s);   // v1.9.8：辅导员自己标的关注标签也算
}

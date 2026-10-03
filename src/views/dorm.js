/* =====================================================================
   宿舍看板
   设计要点：
   · 数据里**没有"床位数"这一列** → 容量由辅导员设定（S.dormCap，默认 4 人间），
     并与该房间实际出现的最大床位号取较大者 —— 否则会出现"空位 −1"这种假数字
   · 房间身份：优先用「宿舍」（形如 100栋-101）；没有时才用「宿舍楼 + 房间号」拼
   · 男/女寝按房间内学生的性别判定；出现两种就明确标"男女混住"，不猜、不掩盖
   · 一律不编造：没有宿舍的学生单独归入「未分配宿舍」并逐个点名（不代表他们不住宿）
   ===================================================================== */

function dormState(){
  if(!S.dorm) S.dorm = { gender:'all', building:'all', onlyFree:false, sort:'room' };
  return S.dorm;
}
function dormRoom(key){
  const i = String(key).indexOf('-');
  return i > 0 ? String(key).slice(i + 1) : String(key);
}
function natCmp(a, b){ return String(a).localeCompare(String(b), 'zh', {numeric:true}); }
function dormRoomCount(){ return new Set(S.students.map(dormKey).filter(Boolean)).size; }

/* 按房间聚合。key 为 '' 的那组 = 未分配宿舍 */
function dormRooms(list){
  const m = new Map();
  (list || S.students).forEach(s=>{
    const k = dormKey(s);
    if(!m.has(k)) m.set(k, { key:k, building:dormBuilding(k), room:dormRoom(k), members:[] });
    m.get(k).members.push(s);
  });
  const rooms = [...m.values()];
  rooms.forEach(r=>{
    r.members.sort((a,b)=>{
      const ba = bedNo(a), bb = bedNo(b);
      if(ba == null && bb == null) return natCmp(studentName(a), studentName(b));
      if(ba == null) return 1;
      if(bb == null) return -1;
      return ba - bb;
    });
    r.beds = new Set();
    r.members.forEach(s=>{ const b = bedNo(s); if(b) r.beds.add(b); });
    r.maxBed = r.beds.size ? Math.max(...r.beds) : 0;
    r.cap = Math.max(S.dormCap || 4, r.maxBed);     // 实际床位比设定值大时按实际算
    r.free = Math.max(0, r.cap - r.members.length);
    r.over = Math.max(0, r.members.length - r.cap);
    const gs = [...new Set(r.members.map(s=>String(s['性别'] || '').trim()).filter(Boolean))];
    r.gender = gs.length === 1 ? gs[0] : (gs.length === 0 ? '' : 'mixed');
  });
  return rooms;
}

function dormStats(rooms){
  const assigned = rooms.filter(r=>r.key !== '');
  const un = rooms.find(r=>r.key === '') || null;
  return {
    assigned,
    unassigned: un,
    people: assigned.reduce((a,r)=>a + r.members.length, 0),
    free: assigned.reduce((a,r)=>a + r.free, 0),
    full: assigned.filter(r=>r.free === 0 && r.over === 0).length,
    over: assigned.filter(r=>r.over > 0).length,
    male: assigned.filter(r=>r.gender === '男').length,
    female: assigned.filter(r=>r.gender === '女').length
  };
}

/* 应用筛选与排序（宿舍看板自己的条件，不共用列表筛选） */
function dormView(){
  const d = dormState();
  let rooms = dormRooms(S.students).filter(r=>r.key !== '');
  if(d.gender !== 'all') rooms = rooms.filter(r=>r.gender === d.gender);
  if(d.building !== 'all') rooms = rooms.filter(r=>r.building === d.building);
  if(d.onlyFree) rooms = rooms.filter(r=>r.free > 0);
  const byRoom = (a,b)=> natCmp(a.building, b.building) || natCmp(a.room, b.room);
  if(d.sort === 'free')        rooms.sort((a,b)=> b.free - a.free || byRoom(a,b));
  else if(d.sort === 'filled') rooms.sort((a,b)=> b.members.length - a.members.length || byRoom(a,b));
  else if(d.sort === 'gender') rooms.sort((a,b)=> String(a.gender).localeCompare(String(b.gender),'zh') || byRoom(a,b));
  else                         rooms.sort(byRoom);
  return rooms;
}

/* =====================================================================
   v1.9 · 宿舍查寝卫生打分表（A4 横版打印）
   ---------------------------------------------------------------------
   为什么选横版：一间宿舍一行，最少也要「楼栋｜房间｜住宿人｜8 个打分项｜总分｜备注」
   共 14 列。A4 竖版去掉页边距只剩 18.6cm，平均 1.3cm/列，「物品摆放」这种四字表头
   根本排不下；横版有 27.3cm，打分列能稳稳保持 1.3cm（够写一个两位分数），
   住宿人员列还能给到 4.5cm 写全名字。所以：**横向（landscape）**。
   表头用 thead + display:table-header-group，翻页时每页自动重复表头。
   ===================================================================== */

/* 默认打分项：宿舍卫生检查最常见的 8 项，辅导员可以在弹窗里改 */
const DORM_CHECK_ITEMS = ['地面', '门窗', '床铺', '桌面', '物品摆放', '卫生间', '阳台', '安全用电'];

function dormCheckDefaults(){
  const t = new Date();
  const pad = n => (n < 10 ? '0' : '') + n;
  return {
    title  : '宿舍卫生查寝打分表',
    date   : t.getFullYear() + '-' + pad(t.getMonth() + 1) + '-' + pad(t.getDate()),
    checker: ((S.profile && S.profile.name) || '').trim(),
    dept   : ((S.profile && S.profile.dept) || '').trim(),
    items  : DORM_CHECK_ITEMS.slice(),
    full   : 10,
    withNames: true,
    scope  : 'view'          // view = 当前筛选结果；all = 本批全部宿舍
  };
}
let dormCheckOpt = null;

function openDormCheckExport(){
  const rooms = dormView();
  if(!rooms.length){ toast('当前没有可导出的宿舍'); return; }
  if(!dormCheckOpt) dormCheckOpt = dormCheckDefaults();
  const o = dormCheckOpt;
  const allCount = dormRooms(S.students).filter(r=>r.key !== '').length;

  $('modalRoot').innerHTML = `
  <div class="mask" onclick="if(event.target===this)closeModal()">
    <div class="modal" style="max-width:560px" onclick="event.stopPropagation()">
      <div class="modal-head"><div class="modal-title">🖨 导出宿舍查寝卫生打分表</div>
        <button type="button" class="modal-close" onclick="closeModal()">×</button></div>
      <div class="modal-body">
        <div class="lbl">表格标题</div>
        <input class="input" id="dcTitle" style="width:100%" value="${esc(o.title)}" oninput="dormCheckOpt.title=this.value">

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px" class="sem-grid">
          <div><div class="lbl">检查日期</div>
            <input class="input" id="dcDate" type="date" style="width:100%" value="${esc(o.date)}" oninput="dormCheckOpt.date=this.value"></div>
          <div><div class="lbl">检查人</div>
            <input class="input" id="dcChecker" style="width:100%" value="${esc(o.checker)}" placeholder="填你的名字" oninput="dormCheckOpt.checker=this.value"></div>
          <div><div class="lbl">学院 / 单位</div>
            <input class="input" id="dcDept" style="width:100%" value="${esc(o.dept)}" placeholder="选填" oninput="dormCheckOpt.dept=this.value"></div>
          <div><div class="lbl">每项满分</div>
            <input class="input" id="dcFull" type="number" min="1" max="100" style="width:100%" value="${o.full}" oninput="dormCheckOpt.full=Math.max(1,Math.min(100,Math.round(Number(this.value)||10)))"></div>
        </div>

        <div class="lbl" style="margin-top:12px">打分项（用逗号分隔，可增删改）</div>
        <input class="input" id="dcItems" style="width:100%" value="${esc(o.items.join('，'))}"
          oninput="dormCheckOpt.items=String(this.value).split(/[，,、;；]/).map(x=>x.trim()).filter(Boolean)">
        <div style="font-size:12px;color:var(--text-3);margin-top:6px">
          当前 ${o.items.length} 项 · 满分合计 ${o.items.length * o.full} 分</div>

        <div class="lbl" style="margin-top:12px">导出范围</div>
        <div class="seg">
          <button class="${o.scope==='view'?'on':''}" onclick="dormCheckOpt.scope='view';openDormCheckExport()">当前筛选（${rooms.length} 间）</button>
          <button class="${o.scope==='all'?'on':''}" onclick="dormCheckOpt.scope='all';openDormCheckExport()">本批全部（${allCount} 间）</button>
        </div>

        <label style="display:flex;align-items:center;gap:8px;margin-top:12px;font-size:13px;cursor:pointer">
          <input type="checkbox" style="width:15px;height:15px;accent-color:var(--brand)" ${o.withNames?'checked':''}
            onchange="dormCheckOpt.withNames=this.checked"> 打印住宿人员名单（便于点名、找人）
        </label>

        <div class="gtip" style="margin-top:12px">
          生成的是<b>A4 横向</b>表格（列多，竖版会挤成一团）。桌面版会存到「下载」文件夹并自动打开，
          在浏览器里按 <b>Ctrl + P</b> 即可打印；手机上请先把文件传到电脑。
        </div>
      </div>
      <div class="modal-foot">
        <button type="button" class="btn" onclick="closeModal()">取消</button>
        <span style="flex:1"></span>
        <button type="button" class="btn pri" onclick="doDormCheckExport()">生成打分表</button>
      </div>
    </div>
  </div>`;
}

/* 生成打印页 HTML（独立文件，自带 A4 横版样式，打印时只留表格） */
function buildDormCheckHtml(o){
  /* 「本批全部」必须按楼栋+房号自然序排 —— 明细表给检查组看，
     顺序乱了会漏查、也不好找人。「当前筛选」保留用户在界面选的排序。 */
  const byRoom = (a, b)=> natCmp(a.building, b.building) || natCmp(a.room, b.room);
  const rooms = (o.scope === 'all')
    ? dormRooms(S.students).filter(r=>r.key !== '').sort(byRoom)
    : dormView();
  const items = (o.items || []).filter(Boolean);
  const escH = s => String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  const rows = rooms.map((r, i) => {
    /* 每位住宿人员是一个「不可断开」的标签：人多时整组换到下一行，
       而不是把「顾瑞辰(4床)」从中间劈成两行。 */
    const names = r.members.map(s => {
      const n = studentName(s);
      const b = bedNo(s);
      return `<span class="nm">${escH(n)}${b ? `(${b}床)` : ''}</span>`;
    }).join('');
    return `<tr>
      <td class="c idx">${i + 1}</td>
      <td class="c">${escH(r.building)}</td>
      <td class="c room">${escH(r.room)}</td>
      ${o.withNames ? `<td class="names">${names}</td>` : ''}
      <td class="c num">${r.members.length}</td>
      ${items.map(()=>'<td class="c score"></td>').join('')}
      <td class="c score total"></td>
      <td class="c memo"></td>
    </tr>`;
  }).join('');

  const colSpanNames = o.withNames ? 1 : 0;
  const totalCols = 4 + colSpanNames + items.length + 2;

  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<title>${escH(o.title)}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: "Microsoft YaHei", "PingFang SC", sans-serif; color:#111; }
  .bar { display:flex; align-items:center; gap:10px; padding:10px 14px; background:#f4f6f8;
         border-bottom:1px solid #d8dde3; font-size:13px; }
  .bar .tip { color:#5b6673; }
  .bar button { padding:6px 16px; font-size:13px; border-radius:7px; border:1px solid #c9d1da;
         background:#fff; cursor:pointer; }
  .bar button.pri { background:#1e785a; color:#fff; border-color:#1e785a; }
  h1 { font-size:19px; margin:14px 0 4px; text-align:center; letter-spacing:1px; }
  .meta { text-align:center; font-size:12px; color:#444; margin-bottom:10px; }
  .meta span { margin:0 10px; }
  table { width:100%; border-collapse:collapse; font-size:11.5px; table-layout:fixed; }
  th, td { border:1px solid #333; padding:0; height:8.2mm; vertical-align:middle; }
  thead { display:table-header-group; }
  th { background:#eef2f6; font-weight:600; height:9mm; font-size:11px; line-height:1.25; }
  td.c { text-align:center; }
  td.idx { width:9mm; }
  td.room { font-weight:600; }
  /* 住宿人员那一格不能 overflow:hidden —— 四人寝写满会折行，裁掉就等于漏人。
     每个姓名用 .nm 包成不可断开的标签：人多时整组换行，不会把「张三(4床)」劈成两行。 */
  td.names { text-align:left; padding:1px 3px; font-size:9.5px; line-height:1.4; }
  td.names .nm { display:inline-block; white-space:nowrap; margin-right:4px; }
  td.num { width:11mm; }
  td.score { width:12mm; }
  td.score.total { width:15mm; background:#f7f9fb; }
  td.memo { width:30mm; }
  .foot { margin-top:10px; font-size:11.5px; color:#444; display:flex; justify-content:space-between; }
  @media print {
    .bar { display:none; }
    h1 { margin-top:0; }
    body { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  }
</style></head><body>
<div class="bar">
  <button class="pri" onclick="window.print()">打印（A4 横向）</button>
  <button onclick="window.close()">关闭</button>
  <span class="tip">打印时请在打印机设置里确认「横向 / 纵向」选的是<b>横向</b>；表头会在每一页自动重复。</span>
</div>
<h1>${escH(o.title)}</h1>
<div class="meta">
  ${o.dept ? `<span>学院：${escH(o.dept)}</span>` : ''}
  <span>检查日期：${escH(o.date)}</span>
  <span>检查人：${escH(o.checker || '________')}</span>
  <span>共 ${rooms.length} 间 · 满分 ${items.length * o.full} 分</span>
</div>
<table>
  <colgroup>
    <col style="width:9mm"><col style="width:20mm"><col style="width:15mm">
    ${o.withNames ? '<col style="width:45mm">' : ''}
    <col style="width:11mm">
    ${items.map(()=>'<col style="width:12mm">').join('')}
    <col style="width:15mm"><col style="width:26mm">
  </colgroup>
  <thead>
    <tr>
      <th>序号</th><th>宿舍楼</th><th>房间</th>
      ${o.withNames ? '<th>住宿人员</th>' : ''}
      <th>人数</th>
      ${items.map(it=>`<th>${escH(it)}<br><span style="font-weight:400;color:#666">(${o.full}分)</span></th>`).join('')}
      <th>总分</th><th>备注 / 整改意见</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>
<div class="foot">
  <span>说明：每项 ${o.full} 分，共 ${items.length} 项，满分 ${items.length * o.full} 分。</span>
  <span>检查人签字：____________　　日期：${escH(o.date)}</span>
</div>
</body></html>`;
}

function doDormCheckExport(){
  const o = Object.assign(dormCheckDefaults(), dormCheckOpt || {});
  if(!(o.items || []).length){ toast('至少留一个打分项'); return; }
  const html = buildDormCheckHtml(o);
  const ts = String(o.date || '').replace(/-/g, '');
  const file = `宿舍查寝卫生打分表${ts ? '_' + ts : ''}.html`;

  if(isDesktopApp()){
    const bytes = Array.from(new TextEncoder().encode(html));
    const p = tauriInvoke('save_to_downloads', { name: file, data: bytes });
    if(!p){ toast('导出失败：桌面外壳未响应'); return; }
    Promise.resolve(p).then(path=>{
      toast('已保存到「下载」并打开，按 Ctrl+P 打印');
      return tauriInvoke('open_local_file', { path: path });
    }).catch(e=>toast('导出失败：' + ((e && e.message) || e)));
    closeModal();
    return;
  }
  // 浏览器版：新窗口直接打开（可就地 Ctrl+P 打印）
  const blob = new Blob([html], {type:'text/html;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank');
  if(!w){ toast('浏览器拦截了新窗口，请允许弹窗后重试'); return; }
  toast('已在新标签页打开，按 Ctrl+P 打印（记得选横向）');
  closeModal();
}

function setDormCap(v){
  const n = Number(v);
  if(!(n >= 1 && n <= 12)) return;
  S.dormCap = Math.round(n); save(); renderDorm();
}
function setDormFilter(k, v){ dormState()[k] = v; renderDorm(); }
function toggleDormFree(){ const d = dormState(); d.onlyFree = !d.onlyFree; renderDorm(); }
function clearDormFilter(){
  S.dorm = { gender:'all', building:'all', onlyFree:false, sort:'room' };
  renderDorm(); toast('宿舍条件已重置');
}
function gotoDorm(){ S.view = 'dorm'; renderSidebar(); renderMain(); closeSidebar(); }

/* 一个房间的床位槽：已住的显示姓名（可点开详情），空的显示「空位」
   v1.5：有人的床位可拖拽 —— 拖到其他宿舍即调宿（确认后写回宿舍字段） */
let _dragSid = '', _popSid = '';
function roomBedsHtml(r){
  const byBed = new Map(), noBed = [];
  r.members.forEach(s=>{
    const b = bedNo(s);
    if(b && !byBed.has(b)) byBed.set(b, s); else noBed.push(s);
  });
  const slots = Math.max(r.cap, r.members.length);   // 超员时也要把人全列出来，不能吞
  let q = 0, h = '';
  for(let i=1;i<=slots;i++){
    const s = byBed.get(i) || noBed[q++];
    if(s){
      const sid = String(s['学号'] == null ? '' : s['学号']);
      h += `<button class="bed on${_popSid === sid ? ' drop-settle' : ''}" draggable="true"
        title="点击查看 ${esc(studentName(s))} 的详情 · 按住拖到其他宿舍可调宿"
        onclick="openDetail(${jsq(sid)})"
        ondragstart="bedDragStart(event, '${esc(sid)}')" ondragend="bedDragEnd(event)">
        <span class="bed-n">${String(i).padStart(2,'0')}</span>
        <span class="bed-x">${esc(studentName(s) || '（无姓名）')}</span>
        <span class="bed-g">${esc(s['性别'] || '')}</span></button>`;
    }else{
      h += `<span class="bed free"><span class="bed-n">${String(i).padStart(2,'0')}</span>
        <span class="bed-x">空位</span></span>`;
    }
  }
  return h;
}

/* 跨宿舍拖拽（v1.5）：拖起半透明、目标房间虚线高亮、落位 pop 动画 */
function bedDragStart(e, sid){
  _dragSid = sid;
  e.currentTarget.classList.add('dragging');
  try{ e.dataTransfer.setData('text/plain', sid); e.dataTransfer.effectAllowed = 'move'; }catch(err){}
}
function bedDragEnd(e){
  e.currentTarget.classList.remove('dragging');
  document.querySelectorAll('.room-beds.drag-hover').forEach(x=>x.classList.remove('drag-hover'));
}
function bedDragOver(e){
  e.preventDefault();
  const el = e.currentTarget;
  if(el.classList.contains('drag-hover')) return;
  document.querySelectorAll('.room-beds.drag-hover').forEach(x=>x.classList.remove('drag-hover'));
  el.classList.add('drag-hover');
}
function bedDragLeave(e){ e.currentTarget.classList.remove('drag-hover'); }
function bedDrop(e, roomKey){
  e.preventDefault();
  document.querySelectorAll('.room-beds.drag-hover').forEach(x=>x.classList.remove('drag-hover'));
  const sid = _dragSid; _dragSid = '';
  if(!sid) return;
  const s = S.students.find(x=>String(x['学号'] == null ? '' : x['学号']).trim() === sid);
  if(!s){ toast('未找到该学生'); return; }
  if(dormKey(s) === roomKey) return;   // 拖回原宿舍：无事发生
  const name = studentName(s) || '（无姓名）';
  const from = dormKey(s) || '（未分配宿舍）';
  askConfirm({
    title:'调整宿舍',
    html:`把 <b>${esc(name)}</b> 从「${esc(from)}」调到「${esc(roomKey)}」？<br>
      <span style="font-size:12.5px;color:var(--text-3)">会更新 TA 的宿舍字段；需要撤销时拖回去即可。</span>`,
    okText:'确认调宿',
    onOk(){
      const hasSplit = _s(s['宿舍楼']) && _s(s['房间号']);   // 三列分开的表结构：分列写回
      if(hasSplit){ s['宿舍楼'] = dormBuilding(roomKey); s['房间号'] = dormRoom(roomKey); }
      else s['宿舍'] = roomKey;
      _popSid = sid;
      save(); renderDorm();
      toast(`${name} 已调至 ${roomKey}`);
      setTimeout(()=>{ _popSid = ''; }, 600);
    }
  });
}

function roomCardHtml(r){
  const gTag = r.gender
    ? `<span class="tag ${r.gender === '男' ? 'blue' : r.gender === '女' ? 'orange' : 'red'}">${
        r.gender === 'mixed' ? '男女混住' : r.gender}</span>`
    : `<span class="tag">性别未知</span>`;
  const freeTag = r.over > 0
    ? `<span class="room-free over">超 ${r.over}</span>`
    : (r.free > 0 ? `<span class="room-free free">空 ${r.free}</span>`
                  : `<span class="room-free full">满员</span>`);
  return `<div class="room-card">
    <div class="room-head"><span class="room-name" title="${esc(r.key)}">${esc(r.key)}</span>${gTag}${freeTag}</div>
    <div class="room-beds" ondragover="bedDragOver(event)" ondragleave="bedDragLeave(event)"
      ondrop="bedDrop(event, '${esc(r.key)}')">${roomBedsHtml(r)}</div>
    <div class="room-foot"><span>${r.members.length} / ${r.cap} 人</span>${
      (r.maxBed && r.maxBed > (S.dormCap || 4))
        ? '<span title="该房间出现了比设定床位数更大的床位号，已按实际床位计算">按实际床位</span>' : ''}</div>
  </div>`;
}

/* v1.9.7.1：宿舍顶部指标卡。
   原来 6 张卡用的是没有列数定义的 .stats（= 单列），于是每张卡都是"整屏宽的一条"，
   桌面白占 ~570px 高、手机要滚 6 屏才看到房间列表，扫一眼也读不出对比关系。
   现在：① 套 stats-4 走响应式网格（宽屏 4 列 / ≤1080px 两列）；
        ② 每张卡补一个图标 + 单位，让"这数是什么"不用读标签。 */
/* 统计单元图标：与侧栏 SIDE_ICONS 同一套画法 —— 线性 SVG、stroke 走 currentColor，
   三套主题自动适配。★ 不用 emoji：Windows 上 emoji 是彩色渲染，尺寸也不统一
   （同一个行里 ↔️ 特别小、⚠️ 特别大），混排非常刺眼。 */
const DORM_STAT_ICONS = {
  rooms:  '<path d="M3 21V9.5L12 3l9 6.5V21"/><path d="M3 21h18"/><path d="M9.5 21v-5.5h5V21"/>',
  people: '<circle cx="8.5" cy="8" r="3"/><path d="M3.5 20c0-3 2.2-5 5-5s5 2 5 5"/><circle cx="17" cy="9.5" r="2.2"/><path d="M15.8 20c0-2.4 1.6-3.8 3.4-3.8 1.7 0 3.1 1.4 3.1 3.8"/>',
  bed:    '<path d="M3 19v-8"/><path d="M3 14.5h13.5a4.5 4.5 0 0 1 4.5 4.5"/><path d="M3 19h18"/><circle cx="7.5" cy="11.5" r="1.8"/>',
  warn:   '<path d="M12 4.2l8.8 15.4H3.2z"/><path d="M12 10v4"/><circle cx="12" cy="16.8" r=".7" fill="currentColor" stroke="none"/>',
  wc:     '<circle cx="7" cy="5.6" r="2.1"/><path d="M4.2 20v-5.6h5.6V20"/><path d="M7 11.6v3.2"/><circle cx="17" cy="5.6" r="2.1"/><path d="M14.6 12h4.8l1.2 8h-7.2z"/>',
  full:   '<rect x="3.2" y="5" width="17.6" height="14" rx="2.4"/><path d="M3.2 10.2h17.6"/><path d="M8.6 14.8l2.2 2.2 4.4-4.4"/>',
  over:   '<rect x="3.2" y="5" width="17.6" height="14" rx="2.4"/><path d="M3.2 10.2h17.6"/><path d="M9.2 14.4l5.6 4.4"/><path d="M14.8 14.4l-5.6 4.4"/>'
};
function statIco(name){
  const d = DORM_STAT_ICONS[name];
  return d ? `<svg class="stat-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>` : '';
}
function dormStatCell(tone, val, lab, tip, icon, unit){
  return `<div class="stat${tone ? ' ' + tone : ''}">
    <div class="stat-lab"${tip ? ` title="${esc(tip)}"` : ''}>${statIco(icon)}${lab}</div>
    <div class="stat-val">${val}${unit ? `<span class="stat-unit">${unit}</span>` : ''}</div></div>`;
}

function renderDorm(){
  const all = dormRooms(S.students);
  const st = dormStats(all);

  // 字段缺失降级：整批没有宿舍信息时，说明原因而不是画一片空
  if(!st.assigned.length){
    const hasField = fieldHasData('宿舍') || fieldHasData('宿舍楼') || fieldHasData('房间号');
    $('mainArea').innerHTML = `<div class="u-card"><div class="u-card-body">
      <div class="empty-state" style="padding:46px 20px">
        <div class="ico">🏠</div>
        <div style="font-size:15.5px;font-weight:650;color:var(--text);margin-bottom:6px">本批数据没有宿舍信息</div>
        <div style="font-size:12.5px">${esc(hasField
          ? '暂时解析不出宿舍房间，请核对「宿舍」或「宿舍楼 + 房间号」列的内容'
          : missTip(['宿舍','宿舍楼','房间号']))}</div>
      </div></div></div>`;
    return;
  }

  const d = dormState();
  const buildings = [...new Set(st.assigned.map(r=>r.building).filter(Boolean))].sort(natCmp);
  const rooms = dormView();
  const unassigned = st.unassigned ? st.unassigned.members : [];

  let h = `<div class="stats stats-4 stats-dorm">
    ${dormStatCell('accent', st.assigned.length, '宿舍房间', '', 'rooms', ' 间')}
    ${dormStatCell('', st.people, '已分配住宿', '', 'people', ' 人')}
    ${dormStatCell('ok', st.free, '空床位', `按每间 ${S.dormCap} 人估算，可在下方切换床位数`, 'bed', ' 个')}
    ${dormStatCell(unassigned.length ? 'warn' : '', unassigned.length, '未分配宿舍', unassigned.length ? '这些学生还没有宿舍信息' : '全都分好了', 'warn', ' 人')}
    ${dormStatCell('', st.male + ' / ' + st.female, '男寝 / 女寝', '', 'wc', '')}
    ${st.over ? dormStatCell('danger', st.over, '超员房间', '住的人数超过床位数', 'over', ' 间')
              : dormStatCell('', st.full, '满员房间', '', 'full', ' 间')}
  </div>`;

  h += `<div class="u-card">
    <div class="u-card-head">
      <div class="u-card-title">宿舍看板</div>
      <span class="tag">${rooms.length} 间</span>
      <div style="flex:1"></div>
      <label class="dorm-cap">每间床位
        <select class="fselect" style="height:30px;min-width:76px" onchange="setDormCap(this.value)">
          ${[2,4,6,8].map(n=>`<option value="${n}" ${S.dormCap === n ? 'selected' : ''}>${n} 人</option>`).join('')}
        </select></label>
      <button class="tb-btn" onclick="openDormCheckExport()" title="生成 A4 横向的查寝打分表，可直接打印">🖨 查寝打分表</button>
      <button class="tb-btn" onclick="clearDormFilter()">重置条件</button>
    </div>
    <div class="u-card-body" style="padding-bottom:14px">
      <div class="filterbar dorm-toolbar">
        <div class="fgroup"><span class="flabel">性别</span>
          <select class="fselect" onchange="setDormFilter('gender', this.value)">
            ${[['all','全部'],['男','男生宿舍'],['女','女生宿舍']].map(([v,l])=>
              `<option value="${v}" ${d.gender === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select></div>
        <div class="fgroup"><span class="flabel">楼栋</span>
          <select class="fselect" onchange="setDormFilter('building', this.value)">
            <option value="all">全部楼栋</option>
            ${buildings.map(b=>`<option value="${esc(b)}" ${d.building === b ? 'selected' : ''}>${esc(b)}</option>`).join('')}
          </select></div>
        <div class="fgroup"><span class="flabel">排序</span>
          <select class="fselect" onchange="setDormFilter('sort', this.value)">
            ${[['room','按房间号'],['gender','男寝在前'],['free','空位多 → 少'],['filled','住得多在前']].map(([v,l])=>
              `<option value="${v}" ${d.sort === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select></div>
        <button class="btn" style="height:34px" onclick="toggleDormFree()">${
          d.onlyFree ? '✓ 只看有空位' : '只看有空位'}</button>
      </div>
      <div class="hint" style="margin:14px 0 0">
        床位容量按<b>每间 ${S.dormCap} 人</b>估算（数据里没有容量列）。点住在上面的姓名可直接打开该生详情。
      </div>
    </div>
  </div>`;

  h += `<div class="u-card"><div class="u-card-body">
    <div style="font-weight:640;font-size:13.5px;margin-bottom:11px;color:var(--text-2)">
      共 ${rooms.length} 间${(d.gender !== 'all' || d.building !== 'all' || d.onlyFree) ? '（已筛选）' : ''}</div>
    ${rooms.length
      ? `<div class="room-grid">${rooms.map(roomCardHtml).join('')}</div>`
      : `<div class="empty-state" style="padding:34px 20px">没有符合当前条件的宿舍<br>
          <span style="font-size:12.5px">试试把「性别 / 楼栋 / 只看有空位」放宽</span></div>`}
  </div></div>`;

  if(unassigned.length){
    h += `<div class="u-card">
      <div class="u-card-head"><div class="u-card-title">未分配宿舍</div>
        <span class="tag">${unassigned.length} 人</span>
        <div style="flex:1"></div>
        <button class="tb-btn" onclick="gotoList({filters:{'宿舍':'__EMPTY__'}})">在列表中查看</button>
      </div>
      <div class="u-card-body">
        <div class="hint">这些学生在数据里<b>没有宿舍信息</b>——可能是尚未分宿舍，也可能是这一批数据没有导出该字段。
          <b>不代表他们不住宿</b>，请自行核对。</div>
        <div class="chips">${unassigned.map(s=>
          `<span class="chip" style="cursor:pointer" onclick="openDetail(${jsq(String(s['学号'] || ''))})">
            ${esc(studentName(s) || '（无姓名）')}<span class="x">›</span></span>`).join('')}</div>
      </div>
    </div>`;
  }

  $('mainArea').innerHTML = h;
}

function renderRows(list){
  const nCol = listColCount() + 1;   // +1 = 勾选列
  if(!list.length) return `<tr class="empty-row"><td colspan="${nCol}"><div class="empty-state">
    <div class="ico">🔍</div>没有符合条件的学生<br>
    <span style="font-size:12.5px">试试放宽筛选条件</span></div></td></tr>`;

  /* 每个 td 都带 data-label：窄屏下靠 CSS 把表格重排成卡片，
     标签由 ::before 取 attr(data-label) 显示，同一套 DOM 支持两种呈现。
     列顺序完全由 activeCols() 决定 —— 所以「列设置」里改顺序，这里自动跟着走。 */
  const cols = activeCols();
  return list.map((s,i)=>{
    const chk = `<td data-label="勾选" style="width:34px" onclick="event.stopPropagation()">
      <input type="checkbox" title="勾选该学生"${selRows.has(s)?' checked':''}
        onclick="event.stopPropagation();toggleSelOne(${i},this.checked)"></td>`;
    const cells = cols.map(c=>cellHtml(c, s, i)).join('');
    return `<tr onclick="openDetail(${jsq(String(s['学号']==null?'':s['学号']))})">${chk}${cells}</tr>`;
  }).join('');
}

/* 一个单元格。固定列有专门长相，其余字段走通用渲染 ——
   所以「加一列」只要该字段存在于数据里（或加为自定义字段），不用改这里。 */
function cellHtml(c, s, i){
  const k = c.key;
  if(k === '') return `<td class="mono col-idx" style="color:var(--text-3)">${i+1}</td>`;
  if(k === '姓名') return `<td data-label="姓名" style="font-weight:600">${esc(studentName(s))}${tagBadge(s)}</td>`;
  if(k === '学号') return `<td data-label="学号" class="mono">${esc(String(s['学号']==null?'':s['学号']))}</td>`;

  if(k === '成绩'){
    const g = gradeOf(s);
    // 有成绩 → 加权成绩 +（绩点·排名）；无成绩 → 灰字「暂无成绩」，绝不置 0
    const cell = g
      ? `<div class="gscore">${esc(gShow(g['加权平均成绩']))}</div>
         <div class="gsub">绩点 ${esc(gShow(g['平均学分绩点']))} · 排名 ${esc(gShow(g['排名']))}</div>`
      : `<span class="gscore none">暂无成绩</span>`;
    return `<td data-label="成绩">${cell}</td>`;
  }
  if(k === '关注'){
    const g = gradeOf(s);
    const tags = [];
    if(g && gNum(g,'不及格门数')>0) tags.push(`<span class="tag red">不及格 ${esc(gShow(g['不及格门数']))} 门</span>`);
    if(s['军训备注']) tags.push(`<span class="tag orange">军训</span>`);
    if(s['班委']) tags.push(`<span class="tag blue">${esc(s['班委'])}</span>`);
    return `<td data-label="关注">${tags.join(' ')||'<span style="color:var(--dim)">—</span>'}</td>`;
  }
  if(k === '备注（保密）'){
    const r = s[k];
    return `<td data-label="辅导员备注">${r ? `<span class="rsn" title="${esc(r)}">${esc(r)}</span>`
            : `<span class="rsn empty" title="点击添加备注">未填写</span>`}</td>`;
  }

  const v = s[k];
  const empty = (v == null || v === '');
  return `<td data-label="${esc(c.label)}"${c.mono?' class="mono"':''}>${
    empty ? '<span style="color:var(--dim)">—</span>' : esc(String(v))}</td>`;
}

function renderActiveChips(list){
  const parts = [];
  if(S.classFilter !== 'all'){
    parts.push(`<span class="chip on">班级：${esc(S.classFilter)} <span class="x" onclick="event.stopPropagation();pickClass('all')">×</span></span>`);
  }
  const p = PRESETS.find(x=>x.id===S.quickView);
  if(p && p.id!=='all'){
    parts.push(`<span class="chip on">视图：${p.label} <span class="x" onclick="event.stopPropagation();pickPreset('all')">×</span></span>`);
  }
  /* 一个取值一个 chip：多选时能逐个 × 掉，比整组清掉更好用 */
  Object.entries(S.filters).forEach(([k,raw])=>{
    const vals = Array.isArray(raw) ? raw : (raw ? [raw] : []);
    vals.forEach(v=>{
      const disp = v==='__EMPTY__' ? '未填写' : v;
      parts.push(`<span class="chip on">${esc(k)}：${esc(disp)} <span class="x"
        onclick="event.stopPropagation();removeFilterValue(${jsq(k)},${jsq(v)})">×</span></span>`);
    });
  });
  if(!parts.length) parts.push(`<span style="color:var(--text-3);font-size:12.5px">无（显示全部）</span>`);

  // 常用筛选
  S.savedFilters.forEach((f,i)=>{
    parts.push(`<span class="chip chip-add" onclick="applySavedFilter(${i})">★ ${esc(f.name)}</span>`);
  });
  return parts.join('');
}

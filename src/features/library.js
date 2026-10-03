/* ---------- 内容库三页（v1.2：校务导航 / 常用模板 / 制度速查） ----------
   共用思路：数据在 S.navLinks / S.templates / S.policies，改动即 save()；
   「恢复预置」只补缺、不覆盖。这些页面不依赖学生数据，没导入也能用。 */

/* 外链打开：桌面壳走 open_external（系统默认浏览器）；
   纯浏览器预览时回退 window.open。协议白名单双保险（壳里也有一道）。 */
function openLinkExternal(url){
  const u = String(url||'').trim();
  if(!/^https?:\/\//i.test(u)){ toast('仅支持 http/https 链接'); return; }
  try{
    const t = window.__TAURI__;
    if(t && t.core && typeof t.core.invoke === 'function'){
      t.core.invoke('open_external', { url: u }).catch(e=>toast('打开失败：' + e));
      return;
    }
  }catch(e){}
  window.open(u, '_blank', 'noopener');
}

/* 剪贴板：tauri.localhost 不算安全源时 navigator.clipboard 可能不可用 → execCommand 兜底 */
function copyPlain(text, okMsg){
  const done = ()=>toast(okMsg || '已复制到剪贴板');
  try{
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(done, ()=>copyPlainFallback(text, done));
      return;
    }
  }catch(e){}
  copyPlainFallback(text, done);
}
function copyPlainFallback(text, done){
  try{
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.focus(); ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    if(ok) done(); else toast('复制失败，请手动选择文本复制');
  }catch(e){ toast('复制失败，请手动选择文本复制'); }
}

/* 搜索框重渲染后找回焦点与光标（oninput 里先置 _keepFocusId 再重渲染） */
let _keepFocusId = '';
function refocus(){
  if(!_keepFocusId) return;
  const el = document.getElementById(_keepFocusId);
  if(el){
    el.focus();
    const len = el.value.length;
    try{ el.setSelectionRange(len, len); }catch(e){}
  }
  _keepFocusId = '';
}

function gotoNav(){ S.view = 'nav'; renderSidebar(); renderMain(); closeSidebar(); }
function gotoTpl(){ S.view = 'tpl'; renderSidebar(); renderMain(); closeSidebar(); }
function gotoPol(){ S.view = 'pol'; renderSidebar(); renderMain(); closeSidebar(); }
function gotoCal(){ S.view = 'cal'; renderSidebar(); renderMain(); closeSidebar(); }
function gotoProfile(){ S.view = 'profile'; renderSidebar(); renderMain(); closeSidebar(); }

/* 小徽章：分类/标签 chip */
function libChip(txt){
  return `<span style="display:inline-block;padding:2px 9px;border-radius:999px;font-size:11.5px;
    background:var(--brand-soft);color:var(--brand);font-weight:600;white-space:nowrap;flex-shrink:0">${esc(txt)}</span>`;
}

/* ======== ① 校务导航 ======== */
function renderNav(){
  const q = String(S._navQ||'').trim().toLowerCase();
  const catSel = String((S._navCat||{}).nav||'');
  let list = S.navLinks.filter(x=>
    !q || String(x.name||'').toLowerCase().includes(q)
       || String(x.desc||'').toLowerCase().includes(q)
       || String(x.url||'').toLowerCase().includes(q));
  if(catSel) list = list.filter(x=>(x.cat||'其他')===catSel);
  const allCats = [];
  S.navLinks.forEach(x=>{ const c = x.cat||'其他'; if(!allCats.includes(c)) allCats.push(c); });
  const cats = [];
  list.forEach(x=>{ const c = x.cat||'其他'; if(!cats.includes(c)) cats.push(c); });
  const byCat = c => list.filter(x=>(x.cat||'其他')===c);

  $('mainArea').innerHTML = `
  <div class="page-head">
    <div><div class="u-title">校务导航</div>
    <div class="u-sub">常用网站一屏直达 · 点击卡片用系统浏览器打开 · 预置链接可能有调整，可随时编辑</div></div>
    <div style="display:flex;gap:9px;align-items:center">
      <input id="navQ" class="input" placeholder="搜索名称 / 网址…" value="${esc(S._navQ||'')}"
        style="width:190px" oninput="_keepFocusId='navQ'; S._navQ=this.value; renderNav()">
      <button class="btn" onclick="restoreLibPresets('navLinks')">恢复预置</button>
    </div>
  </div>
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
    <button class="btn" style="padding:4px 13px;font-size:12.5px;${!catSel?'border-color:var(--brand);color:var(--brand);font-weight:600':''}"
      onclick="S._navCat=S._navCat||{}; S._navCat.nav=''; renderNav()">全部 · ${S.navLinks.length}</button>
    ${allCats.map(c=>`<button class="btn" style="padding:4px 13px;font-size:12.5px;${catSel===c?'border-color:var(--brand);color:var(--brand);font-weight:600':''}"
      onclick="S._navCat=S._navCat||{}; S._navCat.nav='${esc(c)}'; renderNav()">${esc(c)} · ${S.navLinks.filter(x=>(x.cat||'其他')===c).length}</button>`).join('')}
  </div>
  ${cats.length ? cats.map(c=>`
    <div class="u-card" style="margin-bottom:16px">
      <div class="u-card-body">
        <div style="font-weight:660;font-size:13.5px;color:var(--text-2);margin-bottom:12px">${esc(c)}
          <span style="color:var(--text-3);font-weight:500">· ${byCat(c).length}</span></div>
        <div class="nav-grid">
          ${byCat(c).map(x=>`
          <div class="nav-card" onclick="openLinkExternal('${esc(x.url)}')" title="${esc(x.url)}">
            <div class="nc-name">${esc(x.name)}</div>
            <div class="nc-meta">${esc(x.desc||'')}</div>
            <div class="nc-url">${esc(x.url)}</div>
            <div class="nc-acts" onclick="event.stopPropagation()">
              <button class="btn" style="padding:3px 10px;font-size:12px" onclick="editNav('${x.id}')">编辑</button>
              <button class="btn" style="padding:3px 10px;font-size:12px;color:var(--danger);border-color:var(--danger-line)"
                onclick="delNav('${x.id}')">删除</button>
            </div>
          </div>`).join('')}
          <div class="nav-add" onclick="editNav(null, '${esc(c)}')">
            <span style="font-size:20px">＋</span><span>添加${q ? '' : esc(c)}链接</span>
          </div>
        </div>
      </div>
    </div>`).join('') : `
    <div class="u-card"><div class="u-card-body"><div class="empty-state" style="padding:44px 20px">
      <div class="ico">🧭</div>
      <div style="font-size:15.5px;font-weight:650;margin-bottom:6px">没有匹配的链接</div>
      <div style="font-size:13px;color:var(--text-3)">换个关键词，或点右上角「恢复预置」补回常用网站</div>
    </div></div></div>`}
  ${refocus ? '' : ''}`;
}

/* 导航编辑弹层：id=null 为新增；cat0 用于「在某个分组下直接新增」 */
function editNav(id, cat0){
  const item = id ? S.navLinks.find(x=>x.id===id) : null;
  const cats = [];
  S.navLinks.forEach(x=>{ const c = x.cat||'其他'; if(!cats.includes(c)) cats.push(c); });
  $('modalRoot').innerHTML = `
  <div class="mask" onclick="if(event.target===this)closeModal()">
    <div class="modal" onclick="event.stopPropagation()" style="max-width:520px">
      <div class="modal-head"><div class="modal-title">${item ? '编辑链接' : '添加链接'}</div>
        <div class="modal-close" onclick="closeModal()">×</div></div>
      <div class="modal-body">
        <div style="display:grid;gap:12px">
          <div><div class="lbl">名称</div>
            <input id="nvName" class="input" style="width:100%" value="${esc(item?item.name:'')}" placeholder="如：教务处"></div>
          <div><div class="lbl">分组</div>
            <input id="nvCat" class="input" style="width:100%" list="nvCatList" value="${esc(item?item.cat:(cat0||''))}" placeholder="如：教务教学">
            <datalist id="nvCatList">${cats.map(c=>`<option value="${esc(c)}">`).join('')}</datalist></div>
          <div><div class="lbl">网址（http/https 开头）</div>
            <input id="nvUrl" class="input" style="width:100%" value="${esc(item?item.url:'')}" placeholder="https://…"></div>
          <div><div class="lbl">备注（选填）</div>
            <input id="nvDesc" class="input" style="width:100%" value="${esc(item?item.desc:'')}" placeholder="一句话说明这个网站是干嘛的"></div>
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn" onclick="closeModal()">取消</button>
        <button class="btn pri" onclick="saveNav('${id||''}')">保存</button>
      </div>
    </div>
  </div>`;
  setTimeout(()=>{ const el = $('nvName'); if(el) el.focus(); }, 0);
}
function saveNav(id){
  const name = $('nvName').value.trim();
  const url  = $('nvUrl').value.trim();
  if(!name){ toast('请填写名称'); return; }
  if(!/^https?:\/\/.+/i.test(url)){ toast('网址需以 http:// 或 https:// 开头'); return; }
  const cat  = $('nvCat').value.trim() || '其他';
  const desc = $('nvDesc').value.trim();
  if(id){
    const it = S.navLinks.find(x=>x.id===id);
    if(it) Object.assign(it, { name, url, cat, desc });
  }else{
    S.navLinks.push({ id:_libId(), name, url, cat, desc });
  }
  save(); closeModal(); renderNav(); toast('已保存');
}
function delNav(id){
  const it = S.navLinks.find(x=>x.id===id);
  if(!it) return;
  askConfirm({
    title:'删除链接', danger:true, okText:'删除',
    html:`确定删除「<b>${esc(it.name)}</b>」吗？该操作不可撤销。`,
    onOk(){
      S.navLinks = S.navLinks.filter(x=>x.id!==id);
      save(); renderNav(); toast('已删除');
    }
  });
}
function restoreLibPresets(key){
  const labels = { navLinks:'校务导航', templates:'常用模板' };
  const n = restoreLibraryPresets(key);
  if(key==='navLinks') renderNav(); else renderLibPage(key);
  toast(n ? `已补回 ${n} 条预置${labels[key]||''}` : `预置${labels[key]||''}都在，无需恢复`);
}

/* ======== ② 常用模板 / ③ 制度速查（同一套两栏交互，key 区分） ======== */
function renderTpl(){ renderLibPage('templates'); }
/* ======== ③ AI 助理（v1.3 起替代原「制度速查」；v2.1.0 起收三个入口） ========
   三个企业微信入口：辅导员专用的「学工工作助理」，以及学生可自助的两个答疑机器人。

   v1.9.3 重排：原来左卡带图、右下卡横跨两列、旁边还挂一张「什么问题适合问鹿晓南」，
   三块信息挤在一起很乱。现在两人各占一卡、左右等宽：
       标题 → 二维码（统一外框）→ 一句话说清能干什么 → 「复制链接」。
   「什么问题适合问鹿晓南」那张说明卡已删（内容并进左卡的三条 bullet）。 */
function renderAssistant(){
  const botCard = (title, tag, img, url, items, okMsg) => `
    <div class="u-card"><div class="card-body bot-card">
      <div class="bot-h">${title}</div>
      <div class="bot-tag">${tag}</div>
      <div class="qr-box"><img src="${img}" alt="${title}二维码"></div>
      <div class="bot-desc">${items}</div>
      <div class="bot-act">
        <button class="btn pri" onclick="copyPlain(${jsq(url)}, ${jsq(okMsg)})">复制链接</button>
      </div>
    </div></div>`;
  /* v1.9.8：去掉原来的「在浏览器打开」按钮 ——
     这两个链接是企业微信内的入口（扫码进的是企微会话），在普通浏览器里打开基本没有意义，
     留着反而让人点了以后困惑。保留「复制链接」（粘进班级群）与二维码这两条真正有用的路径。 */

  $('mainArea').innerHTML = `
  <div class="page-head">
    <div><div class="u-title">AI 助理</div>
    <div class="u-sub">三个企业微信入口：辅导员自身的「学工工作助理」，学生可自助的答疑机器人两个</div></div>
  </div>
  <div class="asst-cards">
    ${botCard('AI 辅导员 · 鹿晓南', '制度 · 流程 · 材料', QR_XIAOLUNAN, LU_URL,
      `· <b>请假、销假、晚归报备</b>等制度细则与办理流程<br>
       · <b>奖助学金、困难认定</b>的政策口径与申请材料<br>
       · <b>考试、缓考、学籍</b>等教务类常见问题`,
      '鹿晓南链接已复制，可直接粘贴到班级群')}
    ${botCard('综合评定答疑机器人', '综合测评 · 评奖评优', QR_ROBOT, BOT_URL,
      `· <b>加分细则、材料要求、时间节点</b>，直接问它<br>
       · <b>学生自己也能扫</b>，重复的口径问答不必再找您<br>
       · 真正有争议的判断，仍由您把关拍板`,
      '答疑机器人链接已复制，可直接粘贴到班级群')}
    ${botCard('学工工作助理', '辅导员专用 · 工作上的问题都可以问', QR_XSGZZL, XSGZZL_URL,
      `· <b>辅导员本职工作中的任何问题</b>都能问它 —— 制度口径、流程节点、材料怎么写、话术怎么讲<br>
       · 答复口吻<b>更专业、更讲依据</b>，适合用来核对口径、起草文本<br>
       · 涉及具体学生的处置判断，仍由您拍板`,
      '学工工作助理链接已复制，可直接粘贴到班级群')}
  </div>
  <div class="asst-note">三个入口互不影响，随时换着问 · 「复制链接」可直接粘贴进企业微信（学生群里点开即用），
    二维码则用企业微信扫一扫 · 拿不准的答案，仍建议您把关后再答复</div>`;
}

function renderLibPage(key){
  const isTpl = key === 'templates';
  const title = isTpl ? '常用模板' : '制度速查';
  const sub = isTpl
    ? '常用文书与通知的现成文案 · 点开即看，「复制全文」后粘贴到 Word / 微信稍作修改就能用'
    : '学生工作常用制度要点摘要 · 仅供快速回忆，办理具体事项以学校最新文件为准';
  const items = S[key];
  const q = String((S._libQ||{})[key]||'').trim().toLowerCase();
  const tag = String((S._libTag||{})[key]||'');
  const openId = (S._libOpen||{})[key] || null;

  const tags = [];
  items.forEach(x=>{ const t = x.tag||'其他'; if(!tags.includes(t)) tags.push(t); });

  const filtered = items.filter(x=>
    (!tag || (x.tag||'其他')===tag) &&
    (!q || String(x.title||'').toLowerCase().includes(q) || String(x.body||'').toLowerCase().includes(q)));

  $('mainArea').innerHTML = `
  <div class="page-head">
    <div><div class="u-title">${title}</div><div class="u-sub">${sub}</div></div>
    <div style="display:flex;gap:9px;align-items:center">
      <input id="libQ" class="input" placeholder="搜索标题 / 内容…" value="${esc(q)}"
        style="width:190px" oninput="_keepFocusId='libQ'; if(!S._libQ)S._libQ={}; S._libQ['${key}']=this.value; renderLibPage('${key}')">
      <button class="btn" onclick="restoreLibPresets('${key}')">恢复预置</button>
      <button class="btn pri" onclick="editLibItem('${key}', null)">＋ 新建</button>
    </div>
  </div>
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
    <button class="btn" style="padding:4px 13px;font-size:12.5px;${!tag?'border-color:var(--brand);color:var(--brand);font-weight:600':''}"
      onclick="S._libTag=S._libTag||{}; S._libTag['${key}']=''; renderLibPage('${key}')">全部 · ${items.length}</button>
    ${tags.map(t=>`<button class="btn" style="padding:4px 13px;font-size:12.5px;${tag===t?'border-color:var(--brand);color:var(--brand);font-weight:600':''}"
      onclick="S._libTag=S._libTag||{}; S._libTag['${key}']='${esc(t)}'; renderLibPage('${key}')">${esc(t)} · ${items.filter(x=>(x.tag||'其他')===t).length}</button>`).join('')}
  </div>
  <div class="u-card"><div class="u-card-body">
    ${filtered.length ? filtered.map(x=>{
      const open = x.id === openId;
      const head = String(x.body||'').split('\n').find(l=>l.trim()) || '';
      return `
      <div class="lib-item" style="${open?'border-color:var(--brand)':''}">
        <div class="lib-head" onclick="toggleLibOpen('${key}','${x.id}')">
          ${libChip(x.tag||'其他')}
          <div class="li-title">${esc(x.title)}</div>
          ${open?'':`<div class="lib-preview">${esc(head)}</div>`}
          <div style="display:flex;gap:6px" onclick="event.stopPropagation()">
            ${isTpl?`<button class="btn" style="padding:3px 10px;font-size:12px" onclick="copyLibItem('${key}','${x.id}')">复制全文</button>`:''}
            <button class="btn" style="padding:3px 10px;font-size:12px" onclick="editLibItem('${key}','${x.id}')">编辑</button>
            <button class="btn" style="padding:3px 10px;font-size:12px;color:var(--danger);border-color:var(--danger-line)"
              onclick="delLibItem('${key}','${x.id}')">删除</button>
          </div>
        </div>
        ${open?`<div class="lib-body">${esc(x.body)}</div>`:''}
      </div>`;}).join('') : `
      <div class="empty-state" style="padding:44px 20px">
        <div class="ico">📄</div>
        <div style="font-size:15.5px;font-weight:650;margin-bottom:6px">没有匹配的内容</div>
        <div style="font-size:13px;color:var(--text-3)">换个关键词 / 标签，或点右上角「恢复预置」</div>
      </div>`}
  </div></div>
  ${isTpl ? builtinTemplatesSection() : ''}
  ${isTpl ? tplFilesSection() : ''}
  ${refocus ? '' : ''}`;
}

/* ======== v1.9.6：常用模板 · 我的模板文件（桌面版） ========
   PDF / Word / Excel 这类模板文件的价值在「格式与表格」本身，复制文字没有意义，
   所以这里登记的是文件路径、点一下用系统默认程序打开；不复制内容、不上传。
   浏览器版没有本机路径与打开能力，明确提示（不静默）。 */
/* ======== v1.9.8：表单模板（内置，随程序打包） ========
   这些 PDF / Word / Excel 是「有固定版式的表单」——价值在格式，不在文字，
   所以不做成可复制的文案，而是**把文件本身内联进单文件**（见 .build/embed-templates.py）。
   为什么内联而不是放附件文件夹：
     · 绿色版一直是「一个 exe，拷到哪都能跑」，多一个附件文件夹就破坏了这个卖点；
     · 内联后浏览器版 / Windows 版 / macOS 版都一样能用；
     · 不受"把桌面模板文件夹挪走 / 改名"影响。
   用法：点「另存到下载」→ 落一份到「下载」文件夹（桌面版随后自动打开），
   在 Word / Excel / 阅读器里填好、打印或盖章 —— 原件永远是干净的。 */
function builtinTemplates(){ return (typeof BUILTIN_TEMPLATES !== 'undefined' && Array.isArray(BUILTIN_TEMPLATES)) ? BUILTIN_TEMPLATES : []; }
function b64ToBytes(b64){
  const bin = atob(String(b64 || ''));
  const u8 = new Uint8Array(bin.length);
  for(let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}
function fmtSize(n){
  n = Number(n) || 0;
  return n >= 1048576 ? (n/1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n/1024)) + ' KB';
}
function saveBuiltinTemplate(i){
  const t = builtinTemplates()[i];
  if(!t) return;
  let u8;
  try{ u8 = b64ToBytes(t.b64); }catch(e){ toast('模板数据读取失败：' + ((e && e.message) || e)); return; }
  if(isDesktopApp()){
    const p = tauriInvoke('save_to_downloads', { name: t.name, data: Array.from(u8) });
    Promise.resolve(p).then(path=>{
      toast(`已保存到「下载」文件夹：${t.name}`);
      return tauriInvoke('open_local_file', { path: path });
    }).catch(e=>toast('保存失败：' + ((e && e.message) || e)));
    return;
  }
  try{
    const blob = new Blob([u8], {type:'application/octet-stream'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = t.name;
    a.click();
    toast(`已开始下载：${t.name}`);
  }catch(e){ toast('保存失败：' + ((e && e.message) || e)); }
}
function builtinTemplatesSection(){
  const list = builtinTemplates();
  if(!list.length) return '';
  const groups = [];
  list.forEach((t, i)=>{
    const g = t.group || '其他';
    let o = groups.find(x=>x.name === g);
    if(!o){ o = { name:g, items:[] }; groups.push(o); }
    o.items.push({ t, i });
  });
  return `
  <div class="u-card" style="margin-top:16px"><div class="u-card-body">
    <div style="font-weight:660;font-size:14.5px">📎 表单模板（内置 ${list.length} 份）
      <span style="font-weight:400;font-size:12.5px;color:var(--text-3)">· 已随程序打包，点「另存到下载」后用它原本的程序填写 / 打印；原件不会被改</span></div>
    ${groups.map(g=>`
      <div style="margin-top:13px">
        <div class="dm-group-t">${esc(g.name)}</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:8px">
          ${g.items.map(({ t, i })=>`
            <div class="lib-item" style="padding:9px 12px;display:flex;gap:8px;align-items:center">
              <div style="flex:1;min-width:0">
                <div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
                  title="${esc(t.name)}">${esc(t.name)}</div>
                <div style="font-size:11.5px;color:var(--text-3)">${esc(String(t.ext||'').toUpperCase())} · ${fmtSize(t.size)}</div>
              </div>
              <button class="btn" style="padding:3px 10px;font-size:12px;flex-shrink:0"
                onclick="saveBuiltinTemplate(${i})" title="另存一份到「下载」文件夹（桌面版会随后自动打开）">另存到下载</button>
            </div>`).join('')}
        </div>
      </div>`).join('')}
  </div></div>`;
}

function tplFiles(){ return Array.isArray(S.templateFiles) ? S.templateFiles : []; }
function tplFilesSection(){
  const files = tplFiles();
  if(!isDesktopApp()) return '';
  return `
  <div class="u-card" style="margin-top:16px"><div class="u-card-body">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:${files.length?'12px':'0'}">
      <div style="font-weight:660;font-size:14.5px;flex:1">📁 我的模板文件
        <span style="font-weight:400;font-size:12.5px;color:var(--text-3)">（登记本机的 PDF / Word / Excel，点一下就用对应程序打开）</span></div>
      <button class="btn pri" style="padding:5px 14px;font-size:12.5px" onclick="openTplFolderModal()">从文件夹添加</button>
    </div>
    ${files.length ? `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:8px">
      ${files.map(f=>`
        <div class="lib-item" style="padding:9px 12px;display:flex;gap:8px;align-items:center">
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(f.name)}">${esc(f.name)}</div>
            <div style="font-size:11.5px;color:var(--text-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(f.path)}">${esc(f.relText || f.path)}</div>
          </div>
          <button class="btn" style="padding:3px 10px;font-size:12px;flex-shrink:0" onclick="openTplFile('${f.id}')">打开</button>
          <button class="btn" style="padding:3px 10px;font-size:12px;color:var(--danger);border-color:var(--danger-line);flex-shrink:0"
            onclick="removeTplFile('${f.id}')" title="只移除登记，不动文件本身">移除</button>
        </div>`).join('')}
      </div>`
    : `<div style="font-size:13px;color:var(--text-2);line-height:1.9">
        还没有登记。点右上角「从文件夹添加」→ 粘贴存放模板的文件夹路径 → 勾选要登记的文件。<br>
        登记后点一下就用系统默认程序打开（PDF 用阅读器、Word 用 Word），文件本身不会被复制或移动。
      </div>`}
  </div></div>`;
}
function openTplFolderModal(){
  if(!isDesktopApp()){ toast('登记本机模板文件需要桌面版（浏览器版拿不到文件路径）'); return; }
  $('modalRoot').innerHTML = `
  <div class="mask" onclick="if(event.target===this)closeModal()">
    <div class="modal" onclick="event.stopPropagation()">
      <div class="modal-head"><div class="modal-title">从文件夹登记模板文件</div>
        <div class="modal-close" onclick="closeModal()">×</div></div>
      <div class="modal-body">
        <div class="hint">把存放模板的<b>文件夹路径</b>粘贴到下面（整个文件夹含子文件夹都会列出来，PDF / Word / Excel 都算），
        勾选要登记的文件后点确认。登记后点一下就能用系统默认程序打开；<b>只记路径，不复制内容、不上传</b>。</div>
        <div style="display:flex;gap:8px;margin:12px 0">
          <input class="input" id="tplDir" style="flex:1" placeholder="例如 C:\\Users\\我\\Desktop\\常用模板" onkeydown="if(event.key==='Enter'){event.preventDefault();listTplDir();}">
          <button class="btn pri" style="flex-shrink:0" onclick="listTplDir()">列出文件</button>
        </div>
        <div id="tplDirList"></div>
      </div>
      <div class="modal-foot">
        <button class="btn" onclick="closeModal()">取消</button>
        <button class="btn pri" id="tplRegOk" style="display:none" onclick="registerTplFiles()">登记勾选的文件</button>
      </div>
    </div>
  </div>`;
  setTimeout(()=>{ const i=$('tplDir'); if(i&&i.focus) i.focus(); }, 60);
}
function listTplDir(){
  const dir = ($('tplDir').value||'').trim().replace(/^"+|"+$/g,'');
  if(!dir){ toast('先粘贴文件夹路径'); return; }
  const box = $('tplDirList');
  box.innerHTML = '<div style="color:var(--text-3);font-size:13px;padding:8px 2px">正在读取文件夹…</div>';
  Promise.resolve(tauriInvoke('list_doc_files', { dir })).then(files=>{
    if(!files || !files.length){ box.innerHTML = '<div class="hint">这个文件夹里没有找到 PDF / Word / Excel 文件</div>'; return; }
    window.__tplCandidates = files;
    const okBtn = $('tplRegOk'); if(okBtn) okBtn.style.display='';
    box.innerHTML = `
      <div style="max-height:280px;overflow:auto;border:1px solid var(--line-2);border-radius:9px;padding:6px 10px">
      ${files.map((f,i)=>`
        <label style="display:flex;gap:8px;align-items:center;padding:6px 2px;font-size:13px;cursor:pointer">
          <input type="checkbox" class="tpl-cand" data-i="${i}" checked>
          <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(f.path)}">${esc(f.rel)}</span>
        </label>`).join('')}
      </div>
      <div style="font-size:12px;color:var(--text-3);margin-top:6px">共 ${files.length} 个文件（含子文件夹）</div>`;
  }).catch(e=>{ box.innerHTML = `<div class="hint" style="border-color:var(--warn)">${esc((e && e.message) || String(e))}</div>`; });
}
function registerTplFiles(){
  const cands = window.__tplCandidates || [];
  const sel = [...document.querySelectorAll('.tpl-cand')].filter(x=>x.checked).map(x=>cands[Number(x.dataset.i)]);
  if(!sel.length){ toast('先勾选要登记的文件'); return; }
  const have = new Set(tplFiles().map(x=>x.path));
  let added = 0;
  S.templateFiles = tplFiles();
  sel.forEach(f=>{
    if(have.has(f.path)) return;
    S.templateFiles.push({ id:_libId(), name:f.name, relText:f.rel, path:f.path, addedAt: todayStr() });
    added++;
  });
  save(); renderTpl(); closeModal();
  toast(added ? `已登记 ${added} 个模板文件` : '这些文件都已经登记过了');
}
function openTplFile(id){
  const f = tplFiles().find(x=>x.id===id);
  if(!f) return;
  const p = tauriInvoke('open_local_file', { path: f.path, extraAllowed: tplFiles().map(x=>x.path) });
  Promise.resolve(p).catch(e=>toast((e && e.message) || '打开失败'));
}
function removeTplFile(id){
  S.templateFiles = tplFiles().filter(x=>x.id!==id);
  save(); renderTpl(); toast('已移除登记（文件本身没有动）');
}

function toggleLibOpen(key, id){
  S._libOpen = S._libOpen || {};
  S._libOpen[key] = (S._libOpen[key] === id) ? null : id;
  renderLibPage(key);
}
function copyLibItem(key, id){
  const it = S[key].find(x=>x.id===id);
  if(it) copyPlain(it.title + '\n\n' + it.body, '全文已复制，粘贴即可使用');
}

/* 模板/制度编辑弹层：id=null 为新增 */
function editLibItem(key, id){
  const it = id ? S[key].find(x=>x.id===id) : null;
  const isTpl = key === 'templates';
  const tags = []; S[key].forEach(x=>{ const t = x.tag||'其他'; if(!tags.includes(t)) tags.push(t); });
  $('modalRoot').innerHTML = `
  <div class="mask" onclick="if(event.target===this)closeModal()">
    <div class="modal wide" onclick="event.stopPropagation()">
      <div class="modal-head"><div class="modal-title">${it?'编辑':'新建'}${isTpl?'模板':'制度摘要'}</div>
        <div class="modal-close" onclick="closeModal()">×</div></div>
      <div class="modal-body">
        <div style="display:grid;grid-template-columns:1fr 200px;gap:12px;margin-bottom:12px">
          <div><div class="lbl">标题</div>
            <input id="lbTitle" class="input" style="width:100%" value="${esc(it?it.title:'')}"
              placeholder="${isTpl?'如：谈话记录表':'如：奖学金评定'}"></div>
          <div><div class="lbl">标签</div>
            <input id="lbTag" class="input" style="width:100%" list="lbTagList" value="${esc(it?it.tag:'')}"
              placeholder="如：日常事务">
            <datalist id="lbTagList">${tags.map(t=>`<option value="${esc(t)}">`).join('')}</datalist></div>
        </div>
        <div class="lbl">内容</div>
        <textarea id="lbBody" class="edit-area" style="min-height:260px"
          placeholder="直接粘贴 / 编写正文，保存后在页面里一键复制">${esc(it?it.body:'')}</textarea>
      </div>
      <div class="modal-foot">
        <button class="btn" onclick="closeModal()">取消</button>
        <button class="btn pri" onclick="saveLibItem('${key}','${id||''}')">保存</button>
      </div>
    </div>
  </div>`;
  setTimeout(()=>{ const el = $('lbTitle'); if(el) el.focus(); }, 0);
}
function saveLibItem(key, id){
  const title = $('lbTitle').value.trim();
  const body  = $('lbBody').value;
  if(!title){ toast('请填写标题'); return; }
  if(!body.trim()){ toast('内容不能为空'); return; }
  const tag = $('lbTag').value.trim() || '其他';
  if(id){
    const it = S[key].find(x=>x.id===id);
    if(it) Object.assign(it, { title, tag, body });
  }else{
    S[key].push({ id:_libId(), title, tag, body });
  }
  save(); closeModal(); renderLibPage(key); toast('已保存');
}
function delLibItem(key, id){
  const it = S[key].find(x=>x.id===id);
  if(!it) return;
  askConfirm({
    title:'删除' + (key==='templates'?'模板':'制度摘要'), danger:true, okText:'删除',
    html:`确定删除「<b>${esc(it.title)}</b>」吗？该操作不可撤销。`,
    onOk(){
      S[key] = S[key].filter(x=>x.id!==id);
      if((S._libOpen||{})[key] === id) S._libOpen[key] = null;
      save(); renderLibPage(key); toast('已删除');
    }
  });
}

/* ======== 备忘清单（v1.4，替代原「工作笔记」） ========
   逻辑重设计：原笔记是自由文本，记了没有下文；改成清单后每条可勾选完成、可删除，
   放在首页每天可见 —— 「记了干嘛」的答案是：盯着你把它做完。 */
function addTodo(input){
  const el = typeof input === 'string' ? null : input;
  const text = (el ? el.value : input || '').trim();
  if(!text){ toast('先写点要记的事'); return; }
  S.todos.unshift({ id:_libId(), text, done:false, created:todayStr() });
  if(el) el.value = '';
  save(); renderTodos();
}
function toggleTodo(id){
  const t = (S.todos||[]).find(x=>x.id===id);
  if(!t) return;
  t.done = !t.done;
  save(); renderTodos();
}
function delTodo(id){
  S.todos = (S.todos||[]).filter(x=>x.id!==id);
  save(); renderTodos();
}
function renderTodos(){
  const box = $('todoList');
  if(!box) return;
  const list = S.todos || [];
  if(!list.length){
    box.innerHTML = `<div style="color:var(--text-3);font-size:12.8px;padding:6px 0">
      还没有备忘。适合记：待跟进的学生、要收的材料、某天要回访的谈话……勾选即完成。</div>`;
    return;
  }
  box.innerHTML = list.map(t=>`
    <div style="display:flex;align-items:flex-start;gap:9px;padding:7px 0;border-bottom:1px dashed var(--line)">
      <input type="checkbox" ${t.done?'checked':''} onchange="toggleTodo('${t.id}')" style="margin-top:3px;cursor:pointer">
      <div style="flex:1;min-width:0">
        <div style="font-size:13.2px;line-height:1.55;${t.done?'color:var(--text-3);text-decoration:line-through':'color:var(--text)'}">${esc(t.text)}</div>
        ${t.created?`<div style="font-size:11px;color:var(--text-3);margin-top:2px">${esc(t.created)} 记</div>`:''}
      </div>
      <button class="btn" style="padding:2px 8px;font-size:12px;color:var(--text-3)" onclick="delTodo('${t.id}')" title="删除">✕</button>
    </div>`).join('');
}

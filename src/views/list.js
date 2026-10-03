/* ---------- 我的班级：拖拽排序（v1.5） ----------
   S.classOrder 存班级名顺序；新出现的班级自动排最后。拖拽带半透明浮起 +
   品牌色插入指示线 + 落位 settle 动画。 */
function orderClasses(list){
  const ord = Array.isArray(S.classOrder) ? S.classOrder : [];
  const rank = c => { const i = ord.indexOf(c); return i === -1 ? 10000 + list.indexOf(c) : i; };
  return [...list].sort((a,b)=>rank(a)-rank(b));
}
let _dragClassIdx = -1;
function classDragStart(e, i){
  _dragClassIdx = i;
  e.currentTarget.classList.add('dragging');
  try{ e.dataTransfer.setData('text/plain', String(i)); e.dataTransfer.effectAllowed = 'move'; }catch(err){}
}
function classDragOver(e){
  e.preventDefault();
  const el = e.currentTarget;
  if(el.classList.contains('drag-over')) return;
  document.querySelectorAll('.side-item.drag-over').forEach(x=>x.classList.remove('drag-over'));
  el.classList.add('drag-over');
}
function classDragLeave(e){ e.currentTarget.classList.remove('drag-over'); }
function classDrop(e, i){
  e.preventDefault();
  document.querySelectorAll('.side-item.drag-over').forEach(x=>x.classList.remove('drag-over'));
  const from = _dragClassIdx;
  _dragClassIdx = -1;
  if(from < 0 || from === i) return;
  const list = orderClasses([...new Set(S.students.map(s=>s['班级']).filter(Boolean))]);
  const moved = list.splice(from, 1)[0];
  list.splice(i, 0, moved);
  S.classOrder = list;
  save(); renderSidebar();
  // 落位动画：被拖的班级在新位置轻弹入位
  const el = [...document.querySelectorAll('.side-item')].find(x=>x.getAttribute('data-class') === moved);
  if(el){ el.classList.add('drop-settle'); setTimeout(()=>el.classList.remove('drop-settle'), 320); }
}
function classDragEnd(e){
  e.currentTarget.classList.remove('dragging');
  document.querySelectorAll('.side-item.drag-over').forEach(x=>x.classList.remove('drag-over'));
}

/* ── 从页面注册表渲染侧栏条目 ──────────────────────────────────────────
   重构前这里是三段手写的 HTML 模板，每加一个页面要改两处（这里 + if 链），
   而且每处的 active 判定写法都不一样（有的比 S.view，有的还要带上
   classFilter / quickView）—— 三份模板三种写法，改一处漏两处是常态。

   现在页面自己在 shell/page-registry.js 里声明，这一段只负责：
     · 按注册表遍历该组的页面
     · 标出当前页
     · 把「个人状态」挂成徽标（人数 / 模板数 / 参赛人数…）
   页面增删移动，只改注册表一处。

   ⚠️ 徽标和「点进去要做什么」仍是页面特有的，所以通过 page.badge 提供；
      没提供就不显示 —— 不用为每个页面改这里。 */

/* ════════════════════════════════════════════════════════════════════════
   侧栏渲染
   ────────────────────────────────────────────────────────────────────────
   ⚠️ 这里为什么统一走 onGoTo(id) 而不是各自拼 onclick="gotoXxx()"

   注册表里 `goto: gotoDashboard` 存的是**函数引用**。如果直接拼进 HTML：
       onclick="${p.goto}('${p.id}')"
   得到的是
       onclick="function gotoDashboard(){ S.view = ... }('dashboard')"
   浏览器会去找一个**名叫「function gotoDashboard……」的全局变量** → 找不到，
   于是点了没反应、也不报错。这就是「页面点不进去」的真凶（v2.3）。

   代价特别隐蔽：模板字符串能正常生成、语法检查过、其它条目（像 gotoGuide）
   恰好拼对了没暴露问题，只有大部分条目静默失效。

   所以：**所有导航点击都收口到 onGoTo(id) 这一个函数**，
   由它查注册表拿到真正的函数并调用。既短，又不会再拼错。
   ════════════════════════════════════════════════════════════════════════ */

/** 侧栏/卡片跳转的唯一入口。id 见 src/shell/page-registry.js */
function onGoTo(id) {
  const p = K.page(id);
  if (!p) { toast('这个入口还没接上（' + id + '）'); return; }
  if (p.needsData && !S.batches.length) { renderEmpty(); return; }
  if (typeof p.goto === 'function') { p.goto(); return; }
  // 注册表没给专门的跳转函数：直接切视图 + 重画，这是通用兜底
  S.view = id;
  renderSidebar(); renderMain(); closeSidebar();
}

/* ════════════════════════════════════════════════════════════════════════
   侧栏渲染
   ────────────────────────────────────────────────────────────────────────
   v2.3（2026-10-03）：**完全由页面注册表驱动**。

   改前这里是三段手写的 HTML 模板（总览 / 常用工具 / 系统），
   加上「我的班级」「关注视图」两段动态生成的，加起来近 200 行。
   改后：
     · 页面分组 → 遍历 K.NAV_GROUPS + K.pagesIn(group)，不写死任何一条
     · 折叠状态 → 折叠的键直接从分组 id 派生，不用再维护一张映射表
   加一个页面 / 换一次分组，只改 shell/page-registry.js 与 kernel 里的
   NAV_GROUPS，侧栏这一段一个字都不用动。

   ── 三条布局规则 ──────────────────────────────────────────────────────
     ① 组内 ≤5 条 → 默认展开，标题上**不画折叠符**
        条目本来就放得下，给个"能折"的假提示反而是噪音。
     ② 组内 >5 条 → 默认折叠成一行（侧栏纵向空间最稀缺，
        11 个页面全展开会把下面的「我的班级」挤到看不见）
     ③ 手动展开/收起的选择会记住（走 S.sideFold，键就是分组 id）
   ════════════════════════════════════════════════════════════════════════ */

/** 侧栏条目的徽标：显示当前分组/对象里有多少条。没提供 badge 就不显示。 */
function pageBadge(p) {
  if (typeof p.badge !== 'function') return '';
  const n = p.badge();
  return n === null || n === undefined || n === '' ? '' : `<span class="cnt">${esc(String(n))}</span>`;
}

/**
 * 该页面是不是「当前高亮」的页面。
 * 有些页面只是别人页面的视图（例如某个班级仍是 list 页），
 * 所以额外问一句：isActive() 认不认自己是当前高亮项。
 */
function pageActive(p) {
  if (typeof p.isActive === 'function') return !!p.isActive();
  return S.view === p.id;
}

/** 渲染某个导航分组下的所有页面条目 */
function renderNavGroup(group) {
  return K.pagesIn(group).map(p => {
    const disabled = p.disabled && p.disabled();
    if (disabled) {
      return `<div class="side-item disabled" title="${esc(disabled)}" onclick="toast('${esc(disabled)}')">
        ${sideIco(p.icon)}<span class="s-txt">${esc(p.title)}</span><span class="cnt">—</span></div>`;
    }
    return `<div class="side-item ${pageActive(p) ? 'active' : ''}"${p.tour ? ` data-tour="${p.tour}"` : ''}
      onclick="onGoTo('${p.id}')" title="${esc(p.title)}">
      ${sideIco(p.icon)}<span class="s-txt">${esc(p.title)}</span>${pageBadge(p)}</div>`;
  }).join('');
}

/** 这一组能不能折：条目多才折（≤5 条折了也没意义，见文件头规则 ①） */
function navGroupFoldable(group) { return K.pagesIn(group).length > 5; }
/** 这一组默认该不该展开：条目多就收起来（规则 ②） */
function navGroupDefaultOpen(group) { return !navGroupFoldable(group); }
/** 这一组当前是否展开：用户没手动设过时，按默认来（规则 ③） */
function navGroupOpen(group) {
  if (S.sideCollapsed) return true;               // 侧栏整体收起时不谈折叠
  const fold = S.sideFold || (S.sideFold = {});
  if (typeof fold[group] !== 'boolean') return navGroupDefaultOpen(group);
  return !fold[group];
}

function renderSidebar() {
  const classes = orderClasses([...new Set(S.students.map(s => s['班级']).filter(Boolean))]);
  const cnt = c => S.students.filter(s => s['班级'] === c).length;
  let h = '';

  /* ── ① 页面分组：完全按注册表遍历 ── */
  K.NAV_GROUPS.forEach(g => {
    const items = K.pagesIn(g.id);
    if (!items.length) return;                       // 注册了但一个页面都没有 → 不显示这一组
    const foldable = navGroupFoldable(g.id);
    h += sideLabel('nav:' + g.id, g.label, null, foldable ? '' : ' plain');
    if (navGroupOpen(g.id)) h += renderNavGroup(g.id);
  });

  /* ── ② 我的班级 ──
     11 个班会占掉大半屏，所以跟页面分组用同一套规则：多就默认折起来。 */
  const foldClasses = classes.length > 5;
  h += sideLabel('classes', `我的班级（${classes.length}）`, null, foldClasses ? '' : ' plain');
  if (!foldClasses || sideGroupOpen('classes')) {
    classes.forEach((c, i) => {
      h += `<div class="side-item ${(S.view === 'list' && S.classFilter === c) ? 'active' : ''}" data-class="${esc(c)}"
        draggable="true" onclick="pickClass('${esc(c)}')" title="${esc(c)}（按住拖动可排序）"
        ondragstart="classDragStart(event, ${i})" ondragover="classDragOver(event)"
        ondragleave="classDragLeave(event)" ondrop="classDrop(event, ${i})" ondragend="classDragEnd(event)">
        ${sideIco('book')}<span class="s-txt">${esc(c)}</span><span class="cnt">${cnt(c)}</span></div>`;
    });
  }

  /* ── ③ 关注视图（预设，不是页面）── */
  const ICO_BY_PRESET = { focus:'eye', fail:'warn', lowgpa:'trend', noscore:'doc', noremark:'pencil', hasremark:'chat', party:'flag', cadre:'star' };
  const shownPresets = PRESETS.filter(p => p.id !== 'all' && !isHiddenPreset(p.id));
  /* 18 个预设全展开要滚很久 → 多就折起来（跟上面同一套规则） */
  const foldViews = shownPresets.length > 5;
  h += sideLabel('views', '关注视图', 'views', foldViews ? '' : ' plain');
  if (!foldViews || sideGroupOpen('views')) {
    /* v2.2（用户 2026-09-30 请求）：① 设置里取消勾选的视图不显示；
       ② "本批暂时用不了"的视图**默认收成一行**（原先是逐个置灰各占一行，17 个预设时很杂）。
       收起 ≠ 悄悄消失：那一行可以点开，会列出是哪些视图、各自缺什么。 */
    const unavailable = [];
    shownPresets.forEach(p => {
      if (!presetAvailable(p)) {
        if (S.hideUnavailable !== false) { unavailable.push(p); return; }
        // 字段缺失降级：本批数据没导出这个字段 → 置灰 + 显示「—」，
        // 绝不能显示 0（0 会被误读成"这批学生没人挂科"）
        const miss = presetMissText(p);
        h += `<div class="side-item disabled" title="${esc(miss)}，无法统计"
          onclick="toast('${esc(miss)}，无法统计')">
          ${sideIco(ICO_BY_PRESET[p.id] || 'eye')}<span class="s-txt">${p.label}</span><span class="cnt">—</span></div>`;
        return;
      }
      const n = p.fn(S.students).length;
      h += `<div class="side-item ${(S.view === 'list' && S.quickView === p.id) ? 'active' : ''}" onclick="pickPreset('${p.id}')" title="${p.label}">
        ${sideIco(ICO_BY_PRESET[p.id] || 'eye')}<span class="s-txt">${p.label}</span><span class="cnt">${n}</span></div>`;
    });
    if (unavailable.length) {
      const why = unavailable.map(p => `${p.label}（${presetMissText(p)}）`).join('；');
      h += `<div class="side-item disabled" title="点击查看是哪几个：${esc(why)}"
        onclick="toast('${esc(unavailable.length + ' 个视图本批暂时用不了：' + why)}')">
        ${sideIco('doc')}<span class="s-txt">用不了的视图</span><span class="cnt">${unavailable.length}</span></div>`;
    }
  }

  h += `<div class="side-collapse" onclick="toggleSideCollapse()" title="${S.sideCollapsed ? '展开侧栏' : '收起侧栏'}">
      ${sideIco('collapse')}<span class="s-txt">${S.sideCollapsed ? '展开侧栏' : '收起侧栏'}</span></div>`;

  $('sidebar').innerHTML = h;
  $('sidebar').classList.toggle('collapsed', !!S.sideCollapsed);
  // 顶栏用户徽章同步个人中心信息
  try {
    const p = S.profile || {};
    const av = $('chipAvatar'), nm = $('chipName');
    if (av) {
      av.innerHTML = p.avatar
        ? `<img src="${p.avatar}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
        : esc((p.name || '辅').charAt(0) || '辅');
    }
    if (nm) nm.textContent = p.name || '辅导员';
  } catch (e) { /* 顶栏还没渲染完，下次再说 */ }
}

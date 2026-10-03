/* ============ v1.9.2：新手引导之后 · 页面浮窗批注导览 ============
   向导讲的是"数据怎么取进来"，这个导览讲的是"取进来之后，界面上的东西都在哪"。
   设计上的几条取舍：
     · 只指路、不啰嗦 —— 全篇 11 步、每步一句话，不做功能手册（手册在「导入指引」页）。
       其中「常用功能」四步（校务导航 / 常用模板 / AI 助理 / 校历作息）是 v1.9.4 加的：
       这几个天天要用，但光看名字看不出好处（统一身份认证只需登一次、模板还会陆续更新、
       AI 助理能拉进班级群），所以单独点出来讲一句。
     · 锚点用 data-tour 属性而不是 nth-child 之类的位置选择器：以后界面调顺序也不会指错地方。
     · 找不到锚点就自动跳过那一步（比如没数据时没有筛选条、侧栏被收起），绝不指着一片空白讲。
       ⚠️ 但「常用工具」分组可以折叠 —— 折起来那 4 个锚点就没、会被静默跳过，
       所以 startTour() 临时展开它、tourEnd() 再还原（不擅自改用户偏好）。
     · 每步都能「跳过」，跳过也算看过 —— 讲过的允许忘，重看入口放在个人中心和导入指引页。
     · 老数据（S.tourSeen 缺省）一律视为已看过：升级上来的老用户不会突然被糊一层浮窗。 */
const TOUR_STEPS = [
  { sel:'[data-tour="batchbar"]', side:'bottom', title:'这一条是「批次」',
    text:'一次导入 = 一个批次。带一届学生、换学期重新导，各自成一批、互不干扰；点一下就能切回上一批，上一批的数据还在。' },
  { sel:'[data-tour="import"]', side:'bottom', title:'数据从这个按钮进来',
    text:'右上角这个蓝色按钮。系统里导出的学生表、成绩单<b>原样丢进来</b>就行 —— 列名会自动识别，不用先整理成模板。' },
  { sel:'[data-tour="sidebar"]', side:'right', title:'全部功能都收在左边',
    text:'数据总览、全部学生、宿舍看板、校务导航、常用模板、AI 助理、校历作息 —— 都在这条侧栏里。最上面那条「导入指引」是新用户入口。' },
  { sel:'[data-tour="guide"]', side:'right', title:'忘了怎么导？看这儿',
    text:'不记得在哪个系统、点哪个菜单导出学生表和成绩单？「导入指引」把系统地址和菜单路径都写死了，照着点就行。' },
  { sel:'[data-tour="nav"]', side:'right', title:'常用功能① 校务导航：登录一次，全都能进',
    text:'教务、学工、图书馆这些校内系统集中在一页，不用记网址。它们走的是同一套统一身份认证 —— <b>登录其中任意一个之后，在登录状态还有效的这段时间里，点开其他几个就不用再登一遍</b>，一个页面来回切很方便。' },
  { sel:'[data-tour="tpl"]', side:'right', title:'常用功能② 常用模板：现成稿子，复制就能用',
    text:'请假条、各类通知、谈话记录这些常用文书都有现成文案，点开「复制全文」再贴到 Word / 微信里改两个字就行。<b>内容还在陆续补</b> —— 手上有好用的模板欢迎发我，攒够了一起更新进去。' },
  { sel:'[data-tour="pol"]', side:'right', title:'常用功能③ AI 助理：学生自己就能问',
    text:'三个入口各有分工：<b>学工工作助理</b>是辅导员专用的，工作上的问题都可以问它；制度流程问<b>鹿晓南</b>；综合评定的口径问<b>答疑机器人</b>。<b>私信它之后，可以把它拉进自己的班级群</b> —— 重复的问题学生自己就能问，不必再一个个回。每张码下面都有「<b>复制链接</b>」，粘进群里就行。' },
  { sel:'[data-tour="cal"]', side:'right', title:'常用功能④ 校历作息：随手查，不用翻文件',
    text:'学年校历和课堂时间表都在这一页（下课、熄灯、行政上班时间也都有），下查寝、排谈话前瞄一眼就够；点图片能放大看原图。' },
  { sel:'[data-tour="filter"]', side:'bottom', title:'筛人 与 看哪些列',
    text:'左边搜姓名/学号，中间按班级、性别、政治面貌等条件筛；右上角「<b>列设置</b>」决定这张表显示哪些列、什么顺序，还能拖动排序。' },
  { sel:'[data-tour="views"]', side:'right', title:'常查的几类人，一键筛好',
    text:'「关注视图」把平时最常翻的几类人做成了快捷入口：班委成员、需重点关注、挂科、没填备注的…… 点一下直接是一张名单，不用每次重新筛。' },
  { sel:'[data-tour="profile"]', side:'bottom', title:'你自己的资料在这里',
    text:'改名字与头像、导出备份、重看这份导览，都在这个头像里。想再看一遍：点头像 →「<b>重看页面导览</b>」。' }
];
let tourIdx = 0;

/* 找锚点：拿不到 / 尺寸为 0（被折叠、被隐藏、还没渲染）都算"这一步没地方指" */
function tourAnchor(step){
  let t = null;
  try{ t = document.querySelector(step.sel); }catch(e){ return null; }
  if(!t || typeof t.getBoundingClientRect !== 'function') return null;
  const r = t.getBoundingClientRect();
  if(r.width < 4 && r.height < 4) return null;
  return t;
}
/* 往下/往上找第一个"指得到"的步骤，全跳过的不讲 */
function tourScan(from, dir){
  let i = from;
  while(i >= 0 && i < TOUR_STEPS.length){
    if(tourAnchor(TOUR_STEPS[i])) return i;
    i += dir;
  }
  return i;
}
let _tourFoldRestore = null;   // 导览开始前「常用工具」组的折叠状态，结束时还原
function startTour(){
  closeModal();
  // 导览要指的「筛选条」「列设置」只在「全部学生」页才有，先切过去
  try{ S.view = 'list'; S.classFilter = 'all'; S.quickView = 'all'; S._search = ''; }catch(e){}
  /* 「常用工具」四个入口（校务导航/常用模板/AI 助理/校历作息）是导览的重点内容，
     但那个分组可以折叠 —— 折起来锚点就不存在，那几步会被静默跳过，等于没讲。
     所以开始前临时展开，结束时还原成用户原来的样子（不擅自改他的偏好）。 */
  S.sideFold = S.sideFold || {};
  _tourFoldRestore = Object.prototype.hasOwnProperty.call(S.sideFold, 'tools') ? !!S.sideFold.tools : null;
  S.sideFold.tools = false;
  try{ renderSidebar(); renderMain(); }catch(e){}
  tourIdx = tourScan(0, 1);
  // 一个可指的位置都没有：也要走一遍收尾，把上面临时展开的分组还原回去
  if(tourIdx >= TOUR_STEPS.length){ tourEnd(false); toast('当前界面没有可批注的位置'); return; }
  renderTour();
}
function tourGo(dir){
  const i = tourScan(tourIdx + dir, dir);
  if(i < 0){ renderTour(); return; }              // 已经是第一步，往回没得退
  if(i >= TOUR_STEPS.length){ tourEnd(true); return; }
  tourIdx = i;
  renderTour();
}
function tourEnd(markSeen){
  const layer = $('tourLayer');
  if(layer && typeof layer.remove === 'function') layer.remove();
  window.removeEventListener('resize', renderTour);
  window.removeEventListener('scroll', renderTour, true);
  /* 还原「常用工具」组的折叠状态：原来没动过就删掉这个键（别在用户数据里留脏值） */
  if(_tourFoldRestore !== null || (S.sideFold && 'tools' in S.sideFold)){
    if(_tourFoldRestore === null) delete S.sideFold.tools;
    else S.sideFold.tools = _tourFoldRestore;
    _tourFoldRestore = null;
    try{ renderSidebar(); }catch(e){}
    save();
  }
  if(markSeen){ S.tourSeen = true; save(); toast('导览已结束 —— 想再看：个人中心 →「重看页面导览」'); }
}

function renderTour(){
  if(tourIdx >= TOUR_STEPS.length){ tourEnd(true); return; }
  const step = TOUR_STEPS[tourIdx];
  const target = tourAnchor(step);
  if(!target){                        // 兜底：目标没了就往后顺延，别指空气
    const nxt = tourScan(tourIdx + 1, 1);
    if(nxt >= TOUR_STEPS.length){ tourEnd(true); return; }
    tourIdx = nxt; renderTour(); return;
  }
  if(typeof target.scrollIntoView === 'function') target.scrollIntoView({ block:'nearest', inline:'nearest' });
  const r = target.getBoundingClientRect();
  const pad = 7;
  const hole = { l:r.left - pad, t:r.top - pad, w:r.width + pad*2, h:r.height + pad*2 };
  const GAP = 14;

  let layer = $('tourLayer');
  const first = !layer;
  if(first){
    layer = document.createElement('div');
    layer.id = 'tourLayer';
    document.body.appendChild(layer);
    window.addEventListener('resize', renderTour);
    window.addEventListener('scroll', renderTour, true);   // 捕获阶段：内部滚动容器也能收到
  }
  layer.innerHTML = `
    <div class="tour-block"></div>
    <div class="tour-hole" style="left:${hole.l}px;top:${hole.t}px;width:${hole.w}px;height:${hole.h}px"></div>
    <div class="tour-tip" id="tourTip">
      <div class="tour-n">第 ${tourIdx+1} / ${TOUR_STEPS.length} 步</div>
      <div class="tour-t">${esc(step.title)}</div>
      <div class="tour-x">${step.text}</div>
      <div class="tour-foot">
        <button class="tb-btn" onclick="tourEnd(true)">跳过</button>
        <span style="flex:1"></span>
        ${tourScan(tourIdx-1, -1) >= 0 ? `<button class="tb-btn" onclick="tourGo(-1)">上一步</button>` : ''}
        <button class="tb-btn primary" onclick="tourGo(1)">${tourScan(tourIdx+1, 1) >= TOUR_STEPS.length ? '我知道了' : '下一步'}</button>
      </div>
    </div>`;

  /* 先把气泡放好再量真实尺寸 —— 一律靠估算，矮屏上很容易顶出屏幕外。
     落点优先级：目标右侧 → 目标下方 → 目标上方 → 只能压上去（仍内收在视口内）。 */
  const tip = layer.querySelector ? layer.querySelector('.tour-tip') : null;
  if(!tip || typeof tip.offsetHeight !== 'number') return;
  const tw = tip.offsetWidth || 326, th = tip.offsetHeight || 150;
  const vw = window.innerWidth, vh = window.innerHeight;
  let bx, by;
  if(step.side === 'right' && hole.l + hole.w + GAP + tw <= vw - 12){
    bx = hole.l + hole.w + GAP;  by = hole.t + hole.h/2 - th/2;
  }else if(hole.t + hole.h + GAP + th <= vh - 12){
    bx = hole.l + hole.w/2 - tw/2;  by = hole.t + hole.h + GAP;
  }else if(hole.t - GAP - th >= 12){
    bx = hole.l + hole.w/2 - tw/2;  by = hole.t - GAP - th;
  }else{
    bx = hole.l + hole.w/2 - tw/2;  by = hole.t + hole.h + GAP;
  }
  bx = Math.max(12, Math.min(bx, vw - tw - 12));
  by = Math.max(12, Math.min(by, vh - th - 12));
  tip.style.left = bx + 'px';
  tip.style.top  = by + 'px';
}
/* 用系统默认浏览器打开校内系统（桌面版走外壳，浏览器版直接新标签页） */
function openSysUrl(url){
  if(isDesktopApp()){ tauriInvoke('open_external', { url: url }); toast('已用默认浏览器打开，登录后按下面的路径走'); }
  else { window.open(url, '_blank', 'noopener'); }
}
function renderOnboarding(){
  const last = wizStep === WIZ_TITLES.length - 1;
  let body;
  if(wizStep === 0){
    body = `<div class="wiz-hero">
      <img class="brand-logo" alt="中南财经政法大学校徽">
      <div class="wh-t">中南大学生工作台</div>
      <div class="wh-s">把系统里导出来的<b>学生信息</b>和<b>成绩单</b>放进来，<br>
        这里就会帮你把每个人的画像、成绩、宿舍、预警一次摊开看。</div>
    </div>
    <div class="wiz-list">
      <div class="wiz-li"><span class="wi-ico">🎯</span><div><b>这一趟要做两件事</b><br>
        ① 去智慧学工导出「学生基本信息表」　② 去综合教务导出「专业成绩单」。<br>
        每一步我都会给你一个按钮，点了直接跳到对应系统。</div></div>
      <div class="wiz-li"><span class="wi-ico">⏱</span><div><b>大约 5 分钟</b><br>
        需要能用<b>统一身份认证</b>登录校内系统（就是平时登录教务那个账号）。</div></div>
      <div class="wiz-li"><span class="wi-ico">🔒</span><div><b>数据只在你这台电脑上</b><br>
        全程不联网、不上传任何服务器，密码也是处理后存储的。</div></div>
    </div>
    ${wizChecklist()}`;
  }else if(wizStep === 1){
    body = `<div class="wiz-body">
      ${wizChecklist()}
      <div class="wiz-do">
        <button class="btn pri" onclick="openSysUrl('${ZUEL_SYS.xsgz.url}')">打开「智慧学工」→</button>
        <span class="wiz-do-t">点了会跳到登录页，用统一身份认证登录</span>
      </div>
      ${gCrumb(ZUEL_SYS.xsgz.menu)}
      ${gSteps(ZUEL_SYS.xsgz.steps)}
      <div class="gwarn" style="margin-top:12px"><b>自定义导出时请把字段「全选」</b> ——
        少勾一列，本工作台里这一列就是空的（用不到的列可以之后在「列设置」里隐藏）。</div>
      <div class="gwarn"><b>存下来的文件要能打开</b> —— 校内系统点「导出」是二次请求，
        请等浏览器<b>真正开始下载</b>再保存；如果 .xlsx 打不开，说明存成了网页，回系统重导一次。</div>
      <div class="wiz-do" style="margin-top:12px">
        <button class="btn" onclick="wizGot('student')">✅ 学生表已经存好了</button>
        <span class="wiz-do-t">勾一下，下一步心里有数</span>
      </div>
    </div>`;
  }else if(wizStep === 2){
    body = `<div class="wiz-body">
      ${wizChecklist()}
      <div class="wiz-do">
        <button class="btn pri" onclick="openSysUrl('${ZUEL_SYS.jwxt.url}')">打开「综合教务系统」→</button>
        <span class="wiz-do-t">同样用统一身份认证登录</span>
      </div>
      ${gCrumb(ZUEL_SYS.jwxt.menu)}
      ${gSteps(ZUEL_SYS.jwxt.steps)}
      <div class="gwarn" style="margin-top:12px"><b>「上课专业」可以多选</b> ——
        你带几个专业就勾几个，一份成绩单能装下全部；本工作台按<b>学号</b>挂到人身上，不会串号。</div>
      <div class="gtip">暂时拿不到成绩也没关系：先只导学生表也能用，成绩以后随时补。</div>
      <div class="wiz-do" style="margin-top:12px">
        <button class="btn" onclick="wizGot('grade')">✅ 成绩单已经存好了</button>
        <span class="wiz-do-t">两份都勾上就可以去导入了</span>
      </div>
    </div>`;
  }else if(wizStep === 3){
    body = `<div class="wiz-body">
      ${wizChecklist()}
      <div class="wiz-list">
        <div class="wiz-li"><span class="wi-ico">①</span><div>点下面这个按钮，选中刚才存的<b>学生基本信息表</b>（.xlsx）。</div></div>
        <div class="wiz-li"><span class="wi-ico">②</span><div>确认页会列出「哪些列认出来了」，再让你选导入方式：<br>
          <b>新增</b>（与现有数据按学号合并，日常用这个）／ <b>覆盖当前批次</b>（整批重来）／ <b>新建批次</b>（另起一份）。</div></div>
      </div>
      <div class="wiz-do" style="margin-top:12px">
        <button class="btn pri" onclick="closeModal();openImport()">现在导入学生表 →</button>
        <span class="wiz-do-t">向导先关掉，导入完到侧栏「导入指引」点「继续：导入成绩单」回来</span>
      </div>
      <div class="gtip">导错了也不怕：每份表都能反复导，不会重复造人；你写过的<b>辅导员备注永远不会被覆盖</b>。</div>
    </div>`;
  }else if(wizStep === 4){
    body = `<div class="wiz-body">
      ${wizChecklist()}
      <div class="wiz-list">
        <div class="wiz-li"><span class="wi-ico">①</span><div>点下面这个按钮，选中刚才存的<b>专业成绩单</b>（.xlsx）。</div></div>
        <div class="wiz-li"><span class="wi-ico">②</span><div>成绩按<b>学号</b>自动挂到学生身上；<br>
          学生表里有、成绩单里没有的，显示「<b>暂无成绩</b>」，不会被丢掉。</div></div>
      </div>
      <div class="wiz-do" style="margin-top:12px">
        <button class="btn pri" onclick="closeModal();openImport('成绩表：按学号绑到学生上，不会改动学生档案')">现在导入成绩单 →</button>
        <span class="wiz-do-t">${S.students.length ? `当前已导入 ${S.students.length} 人` : '还没导学生表的话，先回第 ③ 步'}</span>
      </div>
      <div class="gwarn ok">成绩也可以以后再补：随时点顶栏「<b>导入数据</b>」，选成绩表就行。</div>
    </div>`;
  }else{
    body = `<div class="wiz-hero" style="padding-top:20px">
      <div style="font-size:44px">🎉</div>
      <div class="wh-t">可以开始了</div>
      <div class="wh-s">左侧可以按班级、按关注点筛人；<br>
        列表右上角「列设置」决定看哪些列，学生详情页「字段设置」决定看哪些字段。</div>
    </div>
    <div class="wiz-list">
      <div class="wiz-li"><span class="wi-ico">📘</span><div>忘了路径没关系 —— 侧栏「<b>导入指引</b>」一直留着这份说明，随时重看。</div></div>
      <div class="wiz-li"><span class="wi-ico">💬</span><div>想到什么需求、用着哪里别扭，直接<b>企业微信</b>找我，或邮件
        wuzhangfan110@163.com。</div></div>
    </div>`;
  }

  $('modalRoot').innerHTML = `
  <div class="mask" role="presentation" onclick="if(event.target===this)closeModal()">
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="wizTitle" tabindex="-1" style="max-width:620px" onclick="event.stopPropagation()">
      <div class="modal-head">
        <div class="modal-title" id="wizTitle">${WIZ_TITLES[wizStep]}</div>
        <div class="wiz-dots" style="margin-left:auto;margin-right:12px">
          ${WIZ_TITLES.map((_,i)=>`<i class="${i===wizStep?'on':''}"></i>`).join('')}
        </div>
        <button type="button" class="modal-close" data-wiz-action="close" aria-label="关闭引导">×</button>
      </div>
      <div class="modal-body" style="max-height:min(64vh,560px);overflow:auto">${body}</div>
      <div class="modal-foot">
        <button type="button" class="btn" data-wiz-action="skip">跳过，直接开始</button>
        <span style="flex:1"></span>
        ${wizStep > 0 ? `<button type="button" class="btn" data-wiz-action="prev">上一步</button>` : ''}
        ${last
          ? `<button type="button" class="btn pri" data-wiz-action="finish">开始使用</button>`
          : `<button type="button" class="btn pri" data-wiz-action="next">下一步</button>`}
      </div>
    </div>
  </div>`;
  /* 向导里的校徽：与页面其它 logo 共用同一份 base64 */
  document.querySelectorAll('#modalRoot img.brand-logo').forEach(el=>{ el.src = LOGO_DATA; });
  bindOnboardingControls();
}

/* 桌面 WebView 下不要只依赖模板内联 onclick：按钮需要稳定的 DOM 事件，
   同时把 Tab 键限制在当前引导里，避免焦点穿透到后面的主界面。 */
function bindOnboardingControls(){
  const root = $('modalRoot');
  const modal = root && root.querySelector ? root.querySelector('[role="dialog"]') : null;
  if(!modal) return;

  const run = action => {
    if(action === 'close') closeModal();
    else if(action === 'skip') finishOnboarding(true);
    else if(action === 'prev') wizGo(-1);
    else if(action === 'next') wizGo(1);
    else if(action === 'finish') finishOnboarding(false);
  };

  root.querySelectorAll('[data-wiz-action]').forEach(btn => {
    if(typeof btn.addEventListener !== 'function') return;
    btn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      run(btn.getAttribute('data-wiz-action'));
    });
  });

  const focusables = () => modalFocusables(root);   // v2.2：与全局键盘处理共用同一处实现

  /* v2.2：这里原本还有一段 Esc + Tab 焦点陷阱（只对引导生效）。已抽成全局的
     modalKeydown()/initModalKeyboard()，对**全部弹窗**生效 —— 所以那段删掉，避免两条键盘路径并存。 */

  const initial = root.querySelector('[data-wiz-action="skip"]') || focusables()[0];
  if(initial && typeof initial.focus === 'function') initial.focus();
}

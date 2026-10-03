/* =====================================================================
   导入指引（v0.7 · 中南大定制）
   ---------------------------------------------------------------------
   同一份内容服务两处，避免文案各写一遍后走样：
     ① 首次打开的多步「新手引导」—— openOnboarding()
     ② 侧栏常驻的「导入指引」页 —— gotoGuide() / renderGuide()
   改文案只需要改这里。
   ===================================================================== */

/* 校内两个数据来源。登录地址是「统一身份认证」跳转地址，登录后按各自菜单导出。 */
const ZUEL_SYS = {
  xsgz: {
    name: '智慧学工',
    what: '学生基本信息表',
    url : 'https://ids.zuel.edu.cn/authserver/login?service=https%3A%2F%2Fistu.zuel.edu.cn%2Fxsfw%2Fsys%2Fxggzptapp%2F*default%2Findex.do%3Fmin%3D1#/gzzm',
    menu: ['学生数据', '学生基本信息'],
    steps: [
      '用<b>统一身份认证</b>登录智慧学工',
      '进入 <b>学生数据 → 学生基本信息</b>',
      '点「<b>导出</b>」，选「<b>自定义导出</b>」',
      '把字段<b>全选</b>（少勾一项，对应信息就导不出来）',
      '点「<b>导出</b>」并保存到电脑（.xlsx）'
    ],
    note: '每次都「全选」最省事：本工作台会自动识别列名，用不到的列可以在「列设置」里隐藏，不占地方。'
  },
  jwxt: {
    name: '综合教务系统',
    what: '专业成绩单',
    url : 'https://ids.zuel.edu.cn/authserver/login?service=https%3A%2F%2Fjwxt.zuel.edu.cn%2Fjsxsd%2Fsso.jsp',
    menu: ['成绩管理', '查询分析统计', '专业成绩单'],
    steps: [
      '用<b>统一身份认证</b>登录综合教务系统',
      '进入 <b>成绩管理 → 查询分析统计 → 专业成绩单</b>',
      '确认「<b>上课年级</b>」；「<b>上课专业</b>」按需多选（带几个专业就勾几个）',
      '点「<b>查询</b>」',
      '点「<b>导出</b>」并保存到电脑（.xlsx）'
    ],
    note: '一份成绩单可以同时包含多个专业；本工作台按<b>学号</b>把成绩挂到对应学生身上，不会串号。'
  }
};

function gCrumb(list){
  return `<div class="crumb">${list.map((s,i)=>
    (i? '<i>›</i>' : '') + `<span class="c">${esc(s)}</span>`).join('')}</div>`;
}
function gSteps(list){
  return `<ol class="gsteps">${list.map(s=>`<li>${s}</li>`).join('')}</ol>`;
}
function gCard(no, title, tag, body){
  return `<div class="gcard">
    <div class="gcard-h"><div class="gcard-no">${no}</div><div class="gcard-t">${title}</div>
      ${tag ? `<div class="gcard-tag">${tag}</div>` : ''}</div>
    <div class="gcard-b">${body}</div>
  </div>`;
}
function gSys(sys){
  return `
    ${gCrumb(sys.menu)}
    ${gSteps(sys.steps)}
    <div class="sitelink"><span class="sl-t">入口</span>
      <a href="${sys.url}" target="_blank" rel="noopener" title="点这里用统一身份认证打开${esc(sys.name)}">打开「${esc(sys.name)}」→</a>
      <span class="sl-u" title="${esc(sys.url)}">地址：${esc(sys.url.replace(/^https:\/\//,''))}</span></div>
    <div class="gtip">${sys.note}</div>`;
}
/* 指引正文：向导与指引页共用（wizard 模式少一点装饰） */
function guideBody(mode){
  const bk = mode === 'wizard';
  let h = '';

  h += gCard(1, `取「学生基本信息」→ ${ZUEL_SYS.xsgz.name}`, '第一步', gSys(ZUEL_SYS.xsgz));
  h += gCard(2, `取「成绩单」→ ${ZUEL_SYS.jwxt.name}`, '第二步', gSys(ZUEL_SYS.jwxt));

  h += gCard(3, '导进本工作台', '第三步', `
    <div class="gr"><div class="gk">① 学生表</div><div class="gv">
      点右上角「<b>+ 导入数据</b>」→ 选中刚导出的<b>学生基本信息表</b>。
      确认页会列出「哪些列认出来了、哪些是新字段」，并让你选导入方式：</div></div>
    <div class="g2col">
      <div class="g2i"><b>新增（默认）</b><span>与现有数据按学号合并。日常更新用这个。</span></div>
      <div class="g2i"><b>覆盖当前批次</b><span>整批重来。导入前会自动备份 CSV 并二次确认。</span></div>
      <div class="g2i"><b>新建批次</b><span>另起一份独立快照（如新年级），与老数据完全隔离。</span></div>
    </div>
    <div class="gr" style="margin-top:10px"><div class="gk">② 成绩表</div><div class="gv">
      点右上角「<b>+ 导入成绩</b>」（或侧栏「导入成绩」）→ 选中<b>专业成绩单</b>。
      成绩按<b>学号</b>挂到学生身上；学生表里有、成绩单里没有的，显示「<b>暂无成绩</b>」而不会被丢掉。</div></div>
    <div class="gtip">顺序建议：先导学生表，再导成绩表。两句都可以反复导，重复导入不会重复造人。</div>
  `);

  h += gCard('!', '几个容易踩的坑', '', `
    <div class="gwarn"><b>导出没反应 / 存下来的文件打不开？</b><br>
      校内系统点「导出」后是<b>二次请求</b>，页面会先显示「正在准备导出…」。请等浏览器<b>真正开始下载文件</b>再保存；
      如果保存下来的 .xlsx 打不开（其实是网页文件），回系统里重新导出一次即可。</div>
    <div class="gwarn ok"><b>一份表里的列，本工作台都能收。</b><br>
      不同系统的列名会自动归一（例如「住宿地址」→「宿舍」、「手机号」→「联系电话」），没见过的列原样保留，
      还能在「字段设置」里改成自己的字段（如「家长电话」）。</div>
    <div class="gwarn ok"><b>辅导员备注永远不会被覆盖。</b><br>
      重复导入时，你写过的备注会按学号原样保留；新表里没有的学生也不会被自动删除，只标记「本次未出现」等你确认。</div>
    <div class="gtip">导入后想调整显示？学生列表右上角「<b>列设置</b>」选列与排序；学生详情页「<b>字段设置</b>」隐藏字段或新增自定义字段。</div>
  `);

  /* v1.9.8：原来的页脚「关于」块（软件/作者/反馈/版本号）与「系统设置 → 关于」逐字重复，
     在这一页只增加滚动长度 —— 已删除。需要版本号与联系方式去系统设置看。 */
  return h;
}

/* ---------- 导入指引（一个真正的页面，侧栏可随时进） ---------- */
function gotoGuide(){
  S.view = 'guide';
  renderSidebar(); renderMain(); closeSidebar();
}
function renderGuide(){
  /* v1.9.8 精简：
     · 头部原先把「取数 · 导入指引」+三个长按钮挤在一行，窄一点的窗口就换行；
       现在标题只叫「导入指引」，按钮缩成短词。
     · 下面那条 4 段的流程条（智慧学工→教务→导入→开始用）和后面编号卡片的
       第 1/2/3 步讲的是同一件事，纯冗余 —— 删掉。
     · 页脚的「关于」块与「系统设置 → 关于」完全重复 —— 删掉，只留正文卡片。
     · ⚠️ 原「继续第 ④ 步 · 导入成绩」按钮只要"有学生"就一直挂着（哪怕成绩早导完了），
       而且它的 ④ 是"向导第 4 步"，和页面卡片编号（第 4 张是"踩坑"）对不上，
       看着像 bug。现在只在「学生已导入、成绩还没导」时出现，且改叫「继续：导入成绩单」。 */
  const needGrade = S.students.length > 0 && !hasGrade();
  $('mainArea').innerHTML = `<div class="u-card">
    <div class="guide-head">
      <div>
        <div class="gh-t">导入指引</div>
        <div class="gh-s">先在校园系统里导出两份表，再导进本工作台 —— 第一次用照着做一遍就行</div>
      </div>
      <span style="flex:1"></span>
      ${needGrade ? `<button class="btn pri" onclick="openOnboarding(4)">继续：导入成绩单</button>` : ''}
      <button class="btn" onclick="openOnboarding(0)">🎬 新手引导</button>
      <button class="btn" onclick="startTour()">🔎 页面导览</button>
    </div>
    <div class="guide-body">
      ${guideBody('page')}
    </div>
  </div>`;
}

/* ---------- 图表：竖直柱状图 ---------- */
/* W 由容器真实像素宽度决定（见 chartWidth）。
   viewBox 宽度 == 实际像素宽度，因此 1 单位 = 1px：
   轴字不会被缩放、高度恒定、点击换算也不会错位。 */
/* ── v2.2（片 5）：入场动画的两个开关 ──
   D·阶梯延迟封顶：原先 --delay 随序号线性增长（柱状 i*45ms、环形 i*80ms、横条 i*50ms）——
     12 根柱子会拉到 495ms、20 根 855ms，叠加 .55s 动画后要 1.4s 才 settle，显得拖沓。
     现在统一夹在 ANIM_STAGGER_MAX 以内：保留"依次出现"的节奏，但不拖尾。
   B·入场只播一次：`_animCls` 由 renderDashBody 在**构建 HTML 之前**决定，图表构建器读它。 */
const ANIM_STAGGER_MAX = 240;
const animDelay = (i, step) => Math.min(Math.max(0, i) * step, ANIM_STAGGER_MAX);
let _dashAnimDone = false;      // 总览是否已经渲染过一次（renderDashboard 会重置）
let _animCls = '';              // 本次渲染要带的类：'' 或 ' no-anim'
function dashAnimClass(){ return _animCls; }

function barChart(data, opts={}){
  if(!data.length) return '';
  const W = Math.max(200, Math.round(opts.width || 560));
  const H = 210, PL = 36, PR = 12, PT = 18, PB = 38;
  const iw=W-PL-PR, ih=H-PT-PB;
  const max = Math.max(1, ...data.map(d=>d.value));
  const step = iw / data.length;
  const bw = Math.min(48, step*0.56);
  const ticks = 4;
  const colorOf = opts.colorOf || (()=>'var(--brand)');

  let g = '';
  // y 轴网格 + 刻度
  for(let i=0;i<=ticks;i++){
    const v = Math.round(max*i/ticks);
    const y = PT + ih - ih*i/ticks;
    g += `<line x1="${PL}" y1="${y}" x2="${W-PR}" y2="${y}" class="grid-line"/>`;
    g += `<text x="${PL-8}" y="${y+4}" text-anchor="end" class="axis-text">${v}</text>`;
  }
  data.forEach((d,i)=>{
    const h = ih * d.value / max;
    const x = PL + step*i + (step-bw)/2;
    const y = PT + ih - h;
    const clickable = opts.onClick ? ` class="chart-hit bar-grow${dashAnimClass()}" style="fill:${colorOf(d,i)};--delay:${animDelay(i,45)}ms"` : ` class="bar-grow${dashAnimClass()}" style="fill:${colorOf(d,i)};--delay:${animDelay(i,45)}ms"`;
    if(opts.onClick){
      g += `<rect x="${x}" y="${PT}" width="${bw}" height="${ih}" class="chart-hit-bg"/>`;
    }
    g += `<rect x="${x}" y="${y}" width="${bw}" height="${Math.max(h,1)}" rx="4"${clickable}/>`;
    if(opts.onClick){
      g += `<rect x="${x}" y="${y}" width="${bw}" height="${Math.max(h,1)}" fill="none" stroke="none"><title>${esc(d.label)}：${d.value} 人（点击查看）</title></rect>`;
    }
    g += `<text x="${x+bw/2}" y="${y-7}" text-anchor="middle" class="bar-val">${d.value}</text>`;
    const lab = String(d.label).length>6 ? String(d.label).slice(0,6)+'…' : d.label;
    g += `<text x="${x+bw/2}" y="${H-16}" text-anchor="middle" class="axis-text">${esc(lab)}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" class="chart-svg"
    data-w="${W}" data-pl="${PL}" data-pr="${PR}">${g}</svg>`;
}

/* 当前断点名（与 CSS 的三档一一对应：>1180 / ≤1180 / ≤760） */
function breakpointName(){
  const mq = k => (typeof matchMedia === 'function' ? matchMedia(k).matches : false);
  if(mq('(max-width:760px)'))  return 'narrow';
  if(mq('(max-width:1180px)')) return 'mid';
  return 'wide';
}

/* 给定卡片 span 与断点，它**实际占多少列**（一律折算成 12 格口径）。
   这是 CSS 与图表宽度**唯一的共同口径** —— 改其一必须同步另一（test-v196 §[21] 对两边都断言）：
     · wide  （>1180px） 12 格网格：原样 5 / 7 / 12
     · mid   （≤1180px） 6 格网格：span-5 与 span-7 都占半行（折合 6），span-12 仍整行（12）
     · narrow（≤760px）  单列：一律整行（12）
   v2.2（方案 片 C）：mid 档由"每卡整行"改为"两列" —— 笔记本（1100–1180px）上不再纵排成一长页。 */
function spanToCols(span, bp){
  if(bp === 'narrow') return 12;
  if(bp === 'mid')    return (Number(span) >= 12) ? 12 : 6;
  return Number(span) || 12;
}

/* 图表可用宽度：按 12 列网格与断点折算「卡片内容区」的实际像素宽度。
   量不到（尚未进 DOM / 无头环境）时退回 560，保证不会画出 0 宽度。 */
function chartWidth(spanOf12){
  const host = $('dashBody');
  const w = host ? host.clientWidth : 0;
  if(!w) return 560;
  const n = spanToCols(spanOf12, breakpointName());
  const gap = 14;
  const colW = (w - gap*11) / 12;
  const cardW = colW*n + gap*(n-1);
  return Math.max(240, Math.round(cardW - 36 - 2));   // 36 = .card-body 左右 padding
}

/* ---------- 图表：环形图（stroke-dasharray 方案） ---------- */
function donutChart(data, opts={}){
  if(!data.length) return '';
  const size=200, r=66, sw=26, cx=size/2, cy=size/2;
  const C = 2*Math.PI*r;
  const total = data.reduce((a,b)=>a+b.value,0) || 1;
  const GAP = data.length>1 ? 3 : 0;
  const palette = opts.palette || ['var(--brand)','var(--ok)','var(--warn)','var(--danger)','var(--text-3)','var(--brand-deep)'];

  let segs='', acc=0;
  data.forEach((d,i)=>{
    const frac = d.value/total;
    const len = Math.max(C*frac - GAP, 0.5);
    const off = -(C*acc) - GAP/2;
    const col = d.color || palette[i % palette.length];
    const ttl = `<title>${esc(d.label)}：${d.value} 人（${Math.round(frac*100)}%）</title>`;
    segs += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke-width="${sw}"
      class="donut-seg${dashAnimClass()}" style="stroke:${col};stroke-dasharray:${len} ${C-len};stroke-dashoffset:${off};--delay:${animDelay(i,80)}ms"
      transform="rotate(-90 ${cx} ${cy})">${ttl}</circle>`;
    acc += frac;
  });

  return `<div class="donut-wrap">
    <svg viewBox="0 0 ${size} ${size}" class="donut-svg">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke-width="${sw}" class="donut-track"/>
      ${segs}
      <text x="${cx}" y="${cy-2}" text-anchor="middle" class="donut-center-val">${total}</text>
      <text x="${cx}" y="${cy+19}" text-anchor="middle" class="donut-center-lab">${esc(opts.centerLab||'总计')}</text>
    </svg>
    <div class="donut-legend">
      ${data.map((d,i)=>`<div class="lg-row ${opts.onClick?'lg-click':''}" ${opts.onClick?`onclick="gotoList({filters:{'${opts.field}':'${esc(d.label)}'}})"`:''}>
        <span class="lg-dot" style="background:${d.color||palette[i%palette.length]}"></span>
        <span class="lg-name">${esc(d.label)}</span>
        <span class="lg-val">${d.value}</span>
      </div>`).join('')}
    </div>
  </div>`;
}

/* ---------- 图表：水平条形（纯 CSS） ---------- */
function hBarChart(data, opts={}){
  if(!data.length) return '';
  const max = Math.max(1, ...data.map(d=>d.value));
  return `<div class="hbar-list">` + data.map((d,i)=>`
    <div class="hbar-row">
      <span class="hbar-label" title="${esc(d.label)}">${esc(d.label)}</span>
      <div class="hbar-track"><div class="hbar-fill${dashAnimClass()}" style="width:${(d.value/max*100).toFixed(1)}%;--delay:${animDelay(i,50)}ms"></div></div>
      <span class="hbar-val">${d.value}</span>
    </div>`).join('') + `</div>`;
}

/* ---------- 图表：进度条 ---------- */
function pbar(label, val, total, color){
  const pct = total ? Math.round(val/total*100) : 0;
  return `<div class="pbar-row">
    <div class="pbar-head"><span>${esc(label)}</span><span class="pbar-num">${val} / ${total} · ${pct}%</span></div>
    <div class="pbar"><div class="pbar-fill" style="width:${pct}%;background:${color||'var(--brand)'}"></div></div>
  </div>`;
}

/* ---------- 卡片尺寸：尺寸跟内容走（v2.2 方案 R1，见 docs/数据总览卡片与多端适配-方案.md §3） ----------
   动机：span 原先由调用处写死 —— "3 个班"和"20 个班"拿到同样的 7 格；
   而"10 个民族"的横条被塞进半行。规则：
     · 环形 donut  ≤6 类 → 5；>6 → 7      （⚠️ 环形是**固定 172px**不随卡片放大，所以永不进 12）
     · 横向条形 hbar ≤5 → 5；6–10 → 7；>10 → 12   （hBarChart 是纯 HTML 百分比宽度，天然自适应）
     · 纵向条形 vbar ≤4 → 5；5–12 → 7；>12 → 12   （barChart 是 SVG，图宽必须与 span 同步，故调用处要复用同一个值）
     · 名单 list 固定 5；比例条 pbar 固定 7
   传入的 n 一律是**实际渲染出来的**条数（例如民族只画前 8 条，就传 8 而不是总数）。 */
function spanFor(kind, n){
  const c = Math.max(0, Math.floor(Number(n) || 0));
  if(kind === 'donut') return c > 6 ? 7 : 5;
  if(kind === 'hbar')  return c > 10 ? 12 : (c > 5 ? 7 : 5);
  if(kind === 'vbar')  return c > 12 ? 12 : (c > 4 ? 7 : 5);
  if(kind === 'list')  return 5;
  return 7;                      // pbar 及其他
}

/* ---------- 卡片包装器（含空数据降级） ---------- */
function dashCard(title, subtitle, body, empty, opts={}){
  const span = opts.span ? ` span-${opts.span}` : '';
  return `<div class="card dash-card${span}">
    <div class="u-card-head">
      <div class="u-card-title">${esc(title)}</div>
      <div style="flex:1"></div>
      <span class="tag">${esc(subtitle)}</span>
    </div>
    <div class="u-card-body"${opts.bodyClick?` onclick="${opts.bodyClick}" style="cursor:pointer"`:''}>${
      empty ? `<div class="dash-empty">${esc(opts.emptyText || '暂无数据')}</div>` : body}</div>
  </div>`;
}

/* 字段缺失时统一的降级提示语：说明"本批数据没导出这个字段"，
   而不是含糊的"暂无数据"——避免被误读成"这批学生都是 0" */
function missTip(fields){
  return `本批数据未包含「${fields.join('、')}」字段，无法统计；请从原始系统导出后补充导入`;
}

/* ---------- 总览页主体 ----------
   原先住在 features/search.js —— 那是「搜索」模块，不是页面。
   文件名对应职责是这套架构的基本要求，搬过来是为了让依赖方向自然成立
   （features 不该反过来调页面）。 */
/* ---------- 总览页主体 ---------- */
function renderDashboard(){
  _dashAnimDone = false;      // v2.2（片 5-B）：进入总览 = 一次"视图进入"，入场动画可以再播一次
  const searched = searchList((S._search||'').trim());
  const hasFilter = S.classFilter!=='all' || Object.keys(S.filters).length>0 || S.quickView!=='all' || S._search;

  const title = S.classFilter==='all'
    ? (PRESETS.find(p=>p.id===S.quickView)?.label || '全部学生')
    : S.classFilter;

  $('mainArea').innerHTML = `
  <!-- ① 欢迎条 -->
  <div class="dash-hero">
    <div>
      <div class="hero-hi">${esc(greetWord() + '，' + greetName())} 👋</div>
      <div class="hero-sub">
        当前口径：<b>${esc(title)}</b> · ${searched.length} 人${hasFilter?`（共 ${S.students.length} 人）`:' · 全量数据'}
      </div>
    </div>
    <div class="hero-quote">${esc(S.quote||'')}</div>
  </div>

  <!-- ② 可点击指标卡 -->
  <div class="dash dash-metrics" id="dashMetrics"></div>

  <!-- ②+ 备忘清单（v1.4）：记了就得做完，勾选即完成 -->
  <div class="card dash-card">
    <div class="u-card-head"><div class="u-card-title">📌 备忘清单</div>
      <div style="flex:1"></div>
      <span class="tag">${(S.todos||[]).filter(t=>!t.done).length ? `待办 ${(S.todos||[]).filter(t=>!t.done).length}` : '无待办'}</span></div>
    <div class="u-card-body">
      <div class="memo-row">
        <input id="todoInput" class="input memo-in" placeholder="记一件要跟进的事，回车添加（如：周三前收齐奖学金申请表）"
          onkeydown="if(event.key==='Enter')addTodo(this)">
        <button class="btn memo-add" onclick="addTodo($('todoInput'))">添加</button>
      </div>
      <div id="todoList"></div>
    </div>
  </div>

  <!-- 筛选器 -->
  <div class="card dash-card">
    <div class="u-card-head"><div class="u-card-title">筛选条件</div>
      <div style="flex:1"></div>
      <span class="tag">图表与列表同步</span></div>
    <div class="u-card-body">${dashFilterBar()}</div>
  </div>

  <div id="dashBody"></div>`;

  renderDashMetrics();
  renderTodos();
  renderDashBody();
}

/* 指标卡区（独立渲染，便于筛选时局部刷新） */
function renderDashMetrics(){
  const el = $('dashMetrics');
  if(!el) return;
  const searched = searchList((S._search||'').trim());
  const classes = [...new Set(S.students.map(s=>s['班级']).filter(Boolean))];
  const focus = searched.filter(hasFocus).length;
  const fail = searched.filter(s=>{const g=gradeOf(s); return !!g && gNum(g,'不及格门数')>0;}).length;
  const scores = searched.map(s=>gNum(gradeOf(s),'加权平均成绩')).filter(v=>!isNaN(v));
  const avgScore = scores.length ? (scores.reduce((a,b)=>a+b,0)/scores.length) : 0;
  const gpas = searched.map(s=>gNum(gradeOf(s),'平均学分绩点')).filter(v=>!isNaN(v));
  const avgGpa = gpas.length ? (gpas.reduce((a,b)=>a+b,0)/gpas.length) : 0;
  const noGrade = !hasGrade();

  // 字段缺失降级：本批没导入成绩 / 成绩表没这一项 → 显示「—」并说明，绝不显示 0
  const noFail  = noGrade || !gradeHasData('不及格门数');
  const noScore = noGrade || !gradeHasData('加权平均成绩');
  const noGpa   = noGrade || !gradeHasData('平均学分绩点');
  const gMiss = f => noGrade ? '尚未导入成绩表，请先导入成绩' : missTip([f]);

  /* v2.2（方案 片 A）：整张成绩表没导入时，三张成绩指标卡不再各占 1/6 的版面
     （三张都是「—」+ 同一句提示，等于把同一件事说三遍），收成一张能点进导入的卡。
     ⚠️ 与卡片区同口径：只在**整张表都没导**时收；导了表但缺某一项，仍逐项降级。 */
  const gradeMetrics = noGrade
    ? metricCard('plain','成绩类指标','3 项',
        '导入成绩信息表后自动出现：有不及格 / 平均加权成绩 / 平均学分绩点',
        'openGradeImport()')
    : `${metricCard('danger','有不及格', fail,
        noFail ? gMiss('不及格门数') : (fail?'点击查看名单':'暂无不及格记录'),
        (!noFail && fail) ? `gotoList({preset:'fail'})` : '', noFail || fail===0)}
    ${metricCard('ok','平均加权成绩', avgScore?avgScore.toFixed(1):'—',
        noScore ? gMiss('加权平均成绩') : `${scores.length} 人有成绩 · 点一下看低分`,
        (!noScore && avgScore) ? 'jumpByScore()' : '', noScore || !avgScore)}
    ${metricCard('brand','平均学分绩点', avgGpa?avgGpa.toFixed(2):'—',
        noGpa ? gMiss('平均学分绩点') : `${gpas.length} 人有绩点 · 点一下看偏低名单`,
        (!noGpa && avgGpa) ? 'jumpToLowGpa()' : '', noGpa || !avgGpa)}`;

  el.innerHTML = `
    ${metricCard('brand','在册学生', searched.length, '查看全部学生',
        searched.length?`gotoList({clear:true})`:'')}
    ${metricCard('plain','覆盖班级', classes.length,
        classes.length?'点一下按班级排开':'个班级 · 侧栏可直接选',
        classes.length?'jumpByClass()':'')}
    ${metricCard('warn','需重点关注', focus,
        focus?'点击查看名单':'暂无需要关注的学生',
        focus?`gotoList({preset:'focus'})`:'', focus===0)}
    ${gradeMetrics}`;
}

/* 学籍异常的「为什么」：一句话说清是哪个信号触发的（可能同时命中多条）。
   第三个信号值得单独点出来 —— 人已经不在校、床位还占着，这是最该被辅导员看到的一条。 */
function xjReason(s){
  if(!s) return '';
  const why = [];
  if(s['学籍状态'] && s['学籍状态'] !== '在读') why.push(`学籍状态：${s['学籍状态']}`);
  if(s['是否在校'] === '否') why.push('不在校');
  if(s['是否在校'] === '否' && dormKey(s)) why.push('且仍占床位');
  return why.join(' · ');
}

function renderDashBody(){
  /* v2.2（片 5-B）：在**构建 HTML 之前**决定本次是否静音，构建完就把标记置上。
     于是：进入总览的第一次会播入场动画；之后每次筛选/搜索引起的重绘都带 no-anim、不再重播。 */
  _animCls = _dashAnimDone ? ' no-anim' : '';
  _dashAnimDone = true;
  const searched = searchList((S._search||'').trim());
  const body = $('dashBody');
  if(!body) return;

  /* ---------- 聚合 ---------- */
  const cls      = groupCount(searched, '班级');
  const gender   = groupCount(searched, '性别');
  const pol      = groupCount(searched, '政治面貌');
  const nation   = groupCount(searched, '民族');
  const major    = groupCount(searched, '专业');
  const origins  = groupCount(searched, '生源地').slice(0,10);
  const buckets  = scoreBuckets(searched);
  const risk     = atRiskList(searched);

  // 班级平均加权成绩（只统计有成绩的人；空班级不出现，避免出现 0 柱）
  const byClass = new Map();
  searched.forEach(s=>{
    const v = gNum(gradeOf(s), '加权平均成绩');
    if(isNaN(v)) return;
    const c = s['班级'] || '未填班级';
    if(!byClass.has(c)) byClass.set(c, {sum:0, n:0});
    const o = byClass.get(c); o.sum += v; o.n++;
  });
  const classAvg = [...byClass.entries()]
    .map(([label,o])=>({label, value: Math.round(o.sum/o.n*10)/10, n:o.n}))
    .sort((a,b)=>b.value-a.value);

  const withRemark = searched.filter(s=>s['备注（保密）']).length;
  const scoreN     = searched.filter(s=>gradeOf(s)).length;
  const noScoreN   = searched.length - scoreN;
  const dorms      = dormStats(dormRooms(searched));
  const dormN      = searched.filter(s=>dormKey(s)).length;
  const unDormN    = searched.length - dormN;
  const fail = searched.filter(s=>{const g=gradeOf(s); return !!g && gNum(g,'不及格门数')>0;}).length;
  const lowGpa = searched.filter(s=>{const v=gNum(gradeOf(s),'平均学分绩点'); return !isNaN(v)&&v>0&&v<LOW_GPA;}).length;

  // 关注提醒（只保留"确实有值"的项；缺字段的项不参与，避免显示成 0）
  const alerts = [
    {n:fail, t:'有不及格科目', c:'danger', act: presetAvailable(presetById('fail')) ? `gotoList({preset:'fail'})` : ''},
    {n:lowGpa, t:`绩点偏低（< ${LOW_GPA}）`, c:'warn', act: presetAvailable(presetById('lowgpa')) ? `gotoList({preset:'lowgpa'})` : ''},
    {n:searched.length-withRemark, t:'尚未填写备注', c:'brand', act:`gotoList({preset:'noremark'})`},
    {n:noScoreN, t:'暂无成绩记录', c:'warn',
      act: hasGrade() ? `gotoList({preset:'noscore'})` : ''},
    /* v2.2（升级清单 C）：跟进到期 —— 辅导员真正每天要看的"谁今天该跟" */
    {n:searched.filter(s=>followUpDue(s)).length, t:'该跟进（下次跟进日到了）', c:'warn',
      act: presetAvailable(presetById('followdue')) ? `gotoList({preset:'followdue'})` : ''}
  ].filter(a=>a.n>0);

  // 字段可用性（用于图表降级提示）
  const hasPol    = fieldHasData('政治面貌');
  const hasGender = fieldHasData('性别');
  const hasNation = fieldHasData('民族');
  const hasMajor  = fieldHasData('专业');
  const hasScore  = hasGrade() && gradeHasData('加权平均成绩');
  const hasOrigin = fieldHasData('生源地');
  const hasDorm   = dormN > 0;
  const noAlertField = alerts.length === 0 && !hasScore;
  const scoreTip = hasGrade() ? '暂无数据' : '尚未导入成绩表，请先导入成绩';
  /* v2.2（方案 片 A）：**整张成绩表**都没导入 —— 三张成绩卡合并成一条提示。
     ⚠️ 只在"整张表没导"时合并；导了表但缺某一项，仍按原来的逐项降级（各card 自己说明）。 */
  const noGradeTable = !hasGrade();
  // 只有一类 = 没有信息量 → 不占版面（避免"一个柱子占一整张卡"这种假看板）
  const multi = arr => arr.length > 1;

  /* ---------- 卡片列表 ----------
     选卡原则：只留"辅导员看了会做点什么"的图。
     · 已删除：「宿舍楼分布」（碎成几十根柱，看不出问题）、「毕业学校词云」
       （旧表残留字段，本批全空；就算有值也帮不上忙）
     · 只在真有信息量时出现：某一维度只有 1 类（如全校一个专业）就不占版面 */
  const cards = [];

  const clsSpan = spanFor('vbar', cls.length);
  cards.push(dashCard('班级人数分布', `当前 ${searched.length} 人 · 点击柱查看`,
    barChart(cls, {width:chartWidth(clsSpan), onClick:true, colorOf:(d,i)=>['var(--brand)','var(--brand-deep)','var(--ok)','var(--warn)'][i%4]}),
    !cls.length, {span:clsSpan, bodyClick:'dashBarClick(event)'}));

  cards.push(dashCard('性别构成', hasGender ? `${gender.length} 类 · 也是男/女寝的划分依据` : '字段缺失',
    donutChart(gender, {field:'性别', centerLab:'人', onClick:true, palette:['var(--brand)','var(--warn)','var(--text-3)']}),
    !hasGender || !gender.length, {span:spanFor('donut', gender.length), emptyText: hasGender ? '暂无数据' : missTip(['性别'])}));

  /* v2.2（方案 片 A）：成绩表没导入时，「加权成绩分布 / 学业预警名单 / 班级平均加权成绩」
     三张卡会各占 7/5/12 的版面、却只显示同一句提示（合计近两整行）→ 合并成这一条。
     数据源到位后三张卡自动回来（下面各有 if(!noGradeTable)）。 */
  if(noGradeTable){
    cards.push(dashCard('成绩分析待导入', '3 张卡在等这张表',
      `<div class="dash-empty" style="text-align:left;padding:8px 0 12px">
         本批还没导入 <b>成绩信息表</b> —— 以下三张卡需要它才能出图：<br>
         <span style="color:var(--text-2)">加权成绩分布 · 学业预警名单 · 班级平均加权成绩</span>
       </div>
       <div style="text-align:center"><button class="btn pri" onclick="openGradeImport()">去导入成绩</button></div>`,
      false, {span:7}));
  }
  if(!noGradeTable){
  const scoreSpan = spanFor('vbar', buckets.length);
  cards.push(dashCard('加权成绩分布', hasScore ? `${scoreN} 人已录入${noScoreN ? ` · ${noScoreN} 人暂无成绩` : ''}` : '字段缺失',
    barChart(buckets, {width:chartWidth(scoreSpan), colorOf:(d,i)=>['var(--danger)','var(--warn)','var(--warn)','var(--brand)','var(--brand)','var(--ok)'][i%6]}),
    !hasScore || !buckets.some(b=>b.value), {span:scoreSpan, emptyText: scoreTip}));
  }

  // 学业预警名单：本页最该被看到的东西 —— 直接点名，点一下就能打开该生详情
  if(!noGradeTable){
  cards.push(dashCard('学业预警名单', risk.length ? `共 ${risk.length} 人 · 点名字看详情` : '暂无预警',
    risk.length ? `<div class="warn-list">${risk.slice(0,8).map(r=>`
      <button class="warn-row" onclick="openDetail(${jsq(String(r.s['学号']||''))})">
        <span class="warn-name">${esc(studentName(r.s) || '（无姓名）')}</span>
        <span class="warn-cls">${esc(r.s['班级'] || '')}</span>
        <span class="warn-why">${esc(r.reasons.join(' · '))}</span>
      </button>`).join('')}${
      risk.length > 8 ? `<div style="font-size:11.5px;color:var(--text-3);text-align:center;padding-top:2px">
        还有 ${risk.length - 8} 人，点左侧「有不及格」进列表看全</div>` : ''}</div>` : '',
    !risk.length, {span:spanFor('list', risk.length), emptyText: hasScore ? '本批没有不及格或绩点偏低的学生' : scoreTip}));
  }

  /* ── v2.2（方案 片 D）：学籍异常名单 ──
     真实数据里这类人极少但必须看见：学籍状态 在读187/保留学籍2、是否在校 是187/否2
     （保留学籍的那 2 位同时也不在校，其中 1 位床位还占着）。与「学业预警名单」同一套样式，
     点名字直接进详情；只有 1 类/没有该字段时不出现（不虚报）。 */
  if(fieldHasData('学籍状态') || fieldHasData('是否在校')){
    const xj = searched.filter(s => (s['学籍状态'] && s['学籍状态'] !== '在读') || s['是否在校'] === '否');
    cards.push(dashCard('学籍异常', xj.length ? `共 ${xj.length} 人 · 点名字看详情` : '本批没有',
      xj.length ? `<div class="warn-list">${xj.slice(0,8).map(s=>`
        <button class="warn-row" onclick="openDetail(${jsq(String(s['学号']||''))})">
          <span class="warn-name">${esc(studentName(s) || '（无姓名）')}</span>
          <span class="warn-cls">${esc(s['班级'] || '')}</span>
          <span class="warn-why">${esc(xjReason(s))}</span>
        </button>`).join('')}${
        xj.length > 8 ? `<div style="font-size:11.5px;color:var(--text-3);text-align:center;padding-top:2px">
          还有 ${xj.length - 8} 人</div>` : ''}</div>` : '',
      !xj.length, {span:spanFor('list', xj.length),
        emptyText:'本批学生的学籍状态都是「在读」，且都在校'}));
  }

  /* ── v2.2（方案 片 E）：学制与毕业年份 ──
     真实数据：学制 4 年×164 / 2 年×25，预计毕业年份 2028×188 / 2027×1。
     这两项都不是"越多人越要看"的名单（25 人罗列出来没人会看），所以做成**计数行 + 跳预设**：
     与「关注提醒」同一套样式；沿用该卡口径 —— 计数为 0 的行不出现，两项都为 0 时整卡不出现。 */
  const xzRows = (() => {
    const rows = [];
    if(fieldHasData('学制')){
      const n = searched.filter(s => String(s['学制'] || '') === '2' || /二/.test(String(s['班级'] || ''))).length;
      if(n) rows.push({n, t:'第二学士学位（学制 2 年 / 班级含「二」）', act:`gotoList({preset:'second'})`});
    }
    const cy = batchGradYear(S.students);
    if(fieldHasData('预计毕业年份') && !isNaN(cy)){
      const n = searched.filter(s => isEarlyGrad(s)).length;
      if(n) rows.push({n, t:`提前毕业（早于本批主流 ${cy} 年）`, act:`gotoList({preset:'earlygrad'})`});
    }
    return rows;
  })();
  if(xzRows.length){
    cards.push(dashCard('学制与毕业年份', `${xzRows.length} 项可跟进`,
      `<div class="alert-list">${xzRows.map(a=>`
        <div class="alert-row clickable" onclick="${a.act}">
          <span class="alert-dot" data-c="brand"></span>
          <span class="alert-t">${esc(a.t)}</span>
          <span class="alert-n">${a.n}</span>
          <span class="alert-go">→</span>
        </div>`).join('')}</div>`, false, {span:spanFor('list', xzRows.length)}));
  }

  cards.push(dashCard('关注提醒', `${alerts.length} 项待处理`,
    alerts.length ? `<div class="alert-list">${alerts.map(a=>`
      <div class="alert-row ${a.act?'clickable':''}" ${a.act?`onclick="${a.act}"`:''}>
        <span class="alert-dot" data-c="${a.c}"></span>
        <span class="alert-t">${esc(a.t)}</span>
        <span class="alert-n">${a.n}</span>
        ${a.act?'<span class="alert-go">→</span>':''}
      </div>`).join('')}</div>` : '', !alerts.length,
    {span:spanFor('list', alerts.length), emptyText: noAlertField ? '尚未导入成绩表，暂无可统计项' : '暂无待处理事项'}));

  // 数据完整度：只列"本批真有这个字段"的项 —— 缺字段的项不出现，
  // 否则会显示成「0 / 189」，被误读成"这届学生都没宿舍"
  const cntField = k => searched.filter(s => s && s[k] != null && String(s[k]).trim() !== '').length;
  const pbarRows = [pbar('已填写辅导员备注', withRemark, searched.length, 'var(--brand)')];
  if(hasScore) pbarRows.push(pbar('已录入成绩', scoreN, searched.length, 'var(--ok)'));
  if(hasDorm)  pbarRows.push(pbar('已分配宿舍', dormN, searched.length, 'var(--warn)'));
  /* v2.2（方案 片 E）：把真实模板里"缺失最值得注意"的三列纳进来 ——
     真实数据缺失：微信号 86 人、身份证件号 25 人、家长电话 25 人（原表的列名叫「家庭电话」，
     v2.2 起已归一到「家长电话」，所以这里只认归一名）。
     沿用既有规则：**只列本批真有这个字段的项**，缺字段不虚报「0 / N」（那会被读成"这届学生都没填"）。 */
  if(fieldHasData('证件号码')) pbarRows.push(pbar('已填写证件号码', cntField('证件号码'), searched.length, 'var(--brand-deep)'));
  if(fieldHasData('家长电话')) pbarRows.push(pbar('已填写家长电话', cntField('家长电话'), searched.length, 'var(--warn)'));
  if(fieldHasData('微信号'))   pbarRows.push(pbar('已填写微信号',   cntField('微信号'),   searched.length, 'var(--text-3)'));
  cards.push(dashCard('数据完整度', `备注覆盖 ${withRemark} / ${searched.length} 人`,
    `<div class="pbar-stack">${pbarRows.join('')}</div>`, !searched.length, {span:spanFor('pbar', pbarRows.length)}));

  if(!noGradeTable){
  const avgSpan = spanFor('vbar', classAvg.length);
  cards.push(dashCard('班级平均加权成绩', classAvgPhrase(classAvg, hasScore),
    barChart(classAvg.length>12 ? classAvg.slice(0,12) : classAvg,
      {width:chartWidth(avgSpan), colorOf:(d,i)=>d.value>=85?'var(--ok)':(d.value>=70?'var(--brand)':'var(--warn)')}),
    !classAvg.length, {span:avgSpan, emptyText: scoreTip}));
  }

  // 宿舍分配概览：不画图，只给"够不够住"三个数 + 一个入口
  if(hasDorm){
    cards.push(dashCard('宿舍分配概览', `${dorms.assigned.length} 间 · 每间按 ${S.dormCap} 人估算`,
      dormEntryHtml(dorms, unDormN), false, {span:5, bodyClick:'gotoDorm()'}));   // 非图表卡，固定半行
  }

  if(hasOrigin){
    cards.push(dashCard('生源地 Top 10', `${searched.length} 人 · 覆盖 ${groupCount(searched,'生源地').length} 个地区`,
      hBarChart(origins), !origins.length, {span:spanFor('hbar', origins.length), emptyText: '暂无数据'}));
  }

  if(hasMajor && multi(major)){
    cards.push(dashCard('专业分布', `${major.length} 个专业`,
      hBarChart(major.slice(0,10)), false, {span:spanFor('hbar', Math.min(major.length, 10))}));
  }
  if(hasNation && multi(nation)){
    cards.push(dashCard('民族构成', `${nation.length} 个民族 · 便于民族学生关怀`,
      hBarChart(nation.slice(0,8)), false, {span:spanFor('hbar', Math.min(nation.length, 8))}));
  }
  /* ── v2.2（方案 片 D）：宿舍楼分布 ──
     v0.5 曾以"一栋楼装百余人、太碎"删掉它 —— 但那是**旧表**从「宿舍」键硬解析楼栋的结果。
     这份模板**直接给了「宿舍楼」列**（真实数据 4 类：132/41/13/1），分布合理、看得懂，
     所以恢复；楼栋口径一律走 dormBuilding()，与宿舍看板同源（不另造一套切分规则）。
     旧表形态（只有「宿舍」= 100栋-101）也能解析出楼栋 ✓。只有 1 栋时不出现（没有分布可言）。 */
  const blds = (() => {
    const c = {};
    searched.forEach(s => { const b = dormBuilding(dormKey(s)); if(b) c[b] = (c[b] || 0) + 1; });
    return Object.keys(c).map(k => ({label:k, value:c[k]}))
                 .sort((a,b) => b.value - a.value || natCmp(a.label, b.label));
  })();
  if(multi(blds)){
    cards.push(dashCard('宿舍楼分布', `${blds.length} 栋 · 覆盖 ${blds.reduce((a,b)=>a+b.value,0)} 人`,
      hBarChart(blds), false, {span:spanFor('hbar', blds.length)}));
  }

  /* ── v2.2（方案 片 E）：管理老师 ──
     真实数据 2 类：吴章凡(辅导员)×179 / 吴章凡(辅导员),周怡(辅导员)×10。
     ⚠️ 这个字段的值是**逗号分隔的多人**（见 MULTIVALUE_FIELDS）。这里按**完整值**分组成类，
     也就是"谁和谁一起管"；点图例筛选时走包含匹配，所以选「吴章凡(辅导员)」不会漏掉共管的那批人。 */
  const teachers = groupCount(searched, '管理老师');
  if(fieldHasData('管理老师') && multi(teachers)){
    cards.push(dashCard('管理老师', `${teachers.length} 类 · 点击图例筛选`,
      donutChart(teachers, {field:'管理老师', centerLab:'人', onClick:true}), false,
      {span:spanFor('donut', teachers.length)}));
  }

  /* ── v2.2（方案 片 D）：户口性质 ── 资助认定常用（真实数据 非农84 / 农业80）。
     字段名是「入学前户口性质」，显示名用简称；点图例可按它筛选（FILTER_FIELDS 里同键同标签）。 */
  const hukou = groupCount(searched, '入学前户口性质');
  if(fieldHasData('入学前户口性质') && multi(hukou)){
    cards.push(dashCard('户口性质', `${hukou.length} 类 · 点击图例筛选`,
      donutChart(hukou, {field:'入学前户口性质', centerLab:'人', onClick:true}), false,
      {span:spanFor('donut', hukou.length)}));
  }

  if(hasPol && multi(pol)){
    cards.push(dashCard('政治面貌构成', `${pol.length} 类 · 点击图例筛选`,
      donutChart(pol, {field:'政治面貌', centerLab:'人', onClick:true}), false, {span:spanFor('donut', pol.length)}));
  }

  body.innerHTML = `<div class="dash">${cards.join('')}</div>`;
}

/* 学业预警名单：不及格 或 绩点偏低。
   排序＝先看不及格门数（多者在前），再看加权成绩（低者在前）——
   这样"挂 5 门"的一定排在"挂 1 门"前面，辅导员从上往下处理就不会漏。 */
function atRiskList(list){
  const out = [];
  (list || []).forEach(s=>{
    const g = gradeOf(s);
    if(!g) return;
    const f = gNum(g, '不及格门数');
    const gpa = gNum(g, '平均学分绩点');
    const w = gNum(g, '加权平均成绩');
    const reasons = [];
    if(!isNaN(f) && f > 0) reasons.push(`不及格 ${gShow(f)} 门`);
    if(!isNaN(gpa) && gpa > 0 && gpa < LOW_GPA) reasons.push(`绩点 ${gShow(gpa)}`);
    if(!reasons.length) return;
    out.push({ s, reasons, sev: (isNaN(f) ? 0 : f) * 100 + (isNaN(w) ? 0 : (100 - w)) });
  });
  return out.sort((a,b)=> b.sev - a.sev);
}

/* 宿舍分配概览卡片的主体：够不够住，一眼看完 */
function dormEntryHtml(st, unDormN){
  const un = unDormN == null ? (st.unassigned ? st.unassigned.members.length : 0) : unDormN;
  return `<div class="dorm-entry">
    <div class="de-cell"><div class="de-v" style="color:var(--brand)">${st.assigned.length}</div><div class="de-l">宿舍间数</div></div>
    <div class="de-cell"><div class="de-v">${st.people}</div><div class="de-l">已分配住宿</div></div>
    <div class="de-cell"><div class="de-v" style="color:${un ? 'var(--warn)' : 'var(--text-3)'}">${un}</div><div class="de-l">未分配宿舍</div></div>
    <div class="de-cell"><div class="de-v" style="color:var(--ok)">${st.free}</div><div class="de-l">空床位（估算）</div></div>
    <div style="width:100%;font-size:12px;color:var(--text-3);line-height:1.6">
      点本卡片进入<b>宿舍看板</b>：看每个房间住了谁、有没有空位、是男寝还是女寝。<br>
      床位容量按每间 ${S.dormCap} 人估算（数据里没有容量列，可在看板里调整）。
    </div>
  </div>`;
}

/* 班级平均成绩卡片的副标题文案 */
function classAvgPhrase(classAvg, hasScore){
  if(!classAvg.length) return hasScore ? '暂无数据' : '尚未导入成绩';
  return `共 ${classAvg.length} 个班级 · 柱高为该班平均加权成绩（按班级依次排列）`;
}

/* 柱状图点击：定位到具体柱子所属班级。
   宽度与内边距必须从 SVG 上读（绘制时写进 data-*），
   否则容器宽度一变、而这里还写死 560，点击就会错位。 */
function dashBarClick(ev){
  const svg = ev.target.closest('svg');
  if(!svg) return;
  const rect = svg.getBoundingClientRect();
  if(!rect.width) return;
  const W  = Number(svg.dataset.w)  || 560;
  const PL = Number(svg.dataset.pl) || 36;
  const PR = Number(svg.dataset.pr) || 12;
  const data = groupCount(searchList((S._search||'').trim()), '班级');
  if(!data.length) return;
  const step = (W-PL-PR)/data.length;
  const x = (ev.clientX - rect.left) / rect.width * W;   // 像素 → viewBox 坐标
  const idx = Math.floor((x - PL)/step);
  if(idx>=0 && idx<data.length) gotoList({classFilter:data[idx].label});
}

/* 成绩分档：按真实数据范围（加权平均成绩约 65–94）铺满，
   而不是只想高分段的 81–100 —— 否则低分段全被丢掉。 */
function scoreBuckets(list){
  const B = [
    [0,69.99,'<70'], [70,79.99,'70-79'], [80,84.99,'80-84'],
    [85,89.99,'85-89'], [90,94.99,'90-94'], [95,100,'95-100']
  ];
  const out = B.map(([lo,hi,label])=>({label, value:0, lo, hi}));
  list.forEach(s=>{
    const v = gNum(gradeOf(s),'加权平均成绩');
    if(isNaN(v)) return;
    const b = out.find(x=>v>=x.lo && v<=x.hi);
    if(b) b.value++;
  });
  return out;
}

/* 指标卡
   isEmpty：计数为 0 或本批数据缺该字段 → 数字显示「—」并淡化。
   注意 hint 直接原样渲染，不再统一替换成「暂无」——
   否则「字段缺失降级」的 missTip 永远显示不出来（缺字段会被误读成 0）。 */
function metricCard(tone, label, val, hint, action, isEmpty){
  const cls = action ? 'metric clickable' : 'metric';
  const emptyCls = isEmpty ? ' is-empty' : '';
  return `<div class="${cls}${emptyCls}" ${action?`onclick="${action}"`:''}>
    <div class="metric-val ${tone}">${isEmpty?'—':val}</div>
    <div class="metric-lab">${esc(label)}</div>
    <div class="metric-hint">${esc(hint||'')}</div>
  </div>`;
}

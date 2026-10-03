/* ---------- 新手引导与金句轮换 ----------
   金句数据（QUOTES）已移入 src/data/quotes.js —— 它是启动时就要用的纯数据，
   放在这里会撞上「onboarding 排在加载链之后」的顺序坑（详见那份文件的说明）。 */


function pickQuote(){
  // 避免连续两次抽到同一条
  let q = S.quote, n = 0;
  while(q === S.quote && n < 8){ q = QUOTES[Math.floor(Math.random()*QUOTES.length)]; n++; }
  return q;
}
function renderQuote(animate){
  const el = $('quoteText');
  if(!el) return;
  el.textContent = S.quote || '';
  if(animate){
    el.style.animation = 'none';
    void el.offsetWidth;            // 强制 reflow 以重放动画
    el.style.animation = '';
  }
}
function nextQuote(){ S.quote = pickQuote(); renderQuote(true); }

/* v1.7：顶栏金句自动换一句；间隔可在系统设置里改；鼠标悬停时暂停，移开继续 */
function quoteIntervalMs(){
  const n = Number(S.quoteSec) || 5;
  return Math.min(Math.max(n, 3), 120) * 1000;
}
function startQuoteRotation(){
  if(S.quoteAuto === false) return;             // v1.8：用户在设置里关掉了自动轮换
  if(nextQuote._timer) return;
  nextQuote._paused = false;
  nextQuote._timer = setInterval(()=>{
    if(nextQuote._paused) return;
    if(!$('quoteText')) return;                 // 已退出应用
    nextQuote();
    renderDashGreeting();                       // 总览页那句也跟着换
  }, quoteIntervalMs());
  const qb = $('quoteBar');
  if(qb && qb.addEventListener){
    qb.addEventListener('mouseenter', ()=>{ nextQuote._paused = true; });
    qb.addEventListener('mouseleave', ()=>{ nextQuote._paused = false; });
  }
}
/* v1.8：开关或间隔变了要立刻按新间隔重新起一轮 */
function restartQuoteRotation(){
  if(nextQuote._timer){ clearInterval(nextQuote._timer); nextQuote._timer = null; }
  startQuoteRotation();
}

/* v1.7：按时段问候 —— 05-11 早上好 / 11-13 中午好 / 13-18 下午好 / 18-23 晚上好 / 23-05 夜深了 */
function greetWord(d){
  const h = (d || new Date()).getHours();
  if(h >= 5  && h < 11) return '早上好';
  if(h >= 11 && h < 13) return '中午好';
  if(h >= 13 && h < 18) return '下午好';
  if(h >= 18 && h < 23) return '晚上好';
  return '夜深了';
}
/* v1.7：称呼取个人中心的姓名，没填则回落「辅导员」 */
function greetName(){
  const n = String((S.profile && S.profile.name) || '').trim();
  return n || '辅导员';
}
/* v1.7：只更新总览页那句问候，不整页重绘（否则会打断输入/滚动） */
function renderDashGreeting(){
  const el = document.querySelector('.hero-hi');
  if(!el) return;
  el.textContent = greetWord() + '，' + greetName() + ' 👋';
}

/* ---------- 登录 / 锁定 ----------
   v2.x 改法（辅导员 2026-10-02 要求）：
   · 启动**不再强制设密码、也不拦着输密码** —— 打开就是工作台，密码这事儿不再挡路；
   · 什么时候锁由你自己定：顶栏那把锁，点了才锁；
   · 忘了自己设的密码也不会被关在外面 —— 万能解锁码 8838 任何时候都能解开。
     数据本来就只存本机、不联网，这把锁防的是"路过的人顺手翻一眼"，不是防黑客。 */
const DEFAULT_PW = '8838';      // 万能解锁码：忘记自设密码时的兜底

function initLogin(){
  enterApp();                   // ★ 启动直接进应用，不再弹密码页
}
function lockApp(){
  if(!S.password){
    showNotice('还没设置密码',
      `锁定需要一个密码。先到<b>个人中心 → 安全</b>设一个，之后就能用顶栏那把锁随时锁屏。<br>
       <span style="font-size:12.5px;color:var(--text-3)">忘了也没关系 —— 解锁码 <b>${DEFAULT_PW}</b> 任何时候都有效。</span>`);
    return;
  }
  $('appPage').classList.add('hidden');
  $('loginPage').classList.remove('hidden');
  $('loginTitle').textContent = '已锁定';
  $('loginSub').textContent = `输入访问密码解锁（忘记密码可用解锁码 ${DEFAULT_PW}）`;
  $('pw2Field').classList.add('hidden');
  $('pw1').placeholder = '请输入密码';
  $('pw1').value = ''; $('pw2').value = ''; $('loginErr').textContent = '';
  $('loginBtn').textContent = '解锁';
  setTimeout(()=>{ try{ $('pw1').focus(); }catch(e){} }, 60);
}
function unlockApp(){
  const p1 = $('pw1').value;
  if(!p1){ $('loginErr').textContent = '请输入密码'; return; }
  /* 解锁码优先：8838 一定进得去，防止把自己锁在外面 */
  if(p1 === DEFAULT_PW || hash(p1) === S.password){ $('loginErr').textContent=''; enterApp(); return; }
  $('loginErr').textContent = `密码错误，请重试（忘记密码可用解锁码 ${DEFAULT_PW}）`;
}
$('loginBtn').onclick = unlockApp;
document.addEventListener('keydown', e=>{ if(e.key==='Enter' && !$('loginPage').classList.contains('hidden')) unlockApp(); });

function enterApp(){
  $('loginPage').classList.add('hidden');
  $('appPage').classList.remove('hidden');
  S.classFilter = 'all'; S.filters = {}; S.quickView = 'all'; S._search = '';
  S.quote = pickQuote();        // 每次进入应用只随机一次，绝不放在 renderMain 里
  applyTheme(S.theme || 'light');
  S.view = 'list';
  renderBatchBar(); renderSidebar(); renderMain(); renderQuote();
  renderTopbarWeek();                                  // v1.5：顶栏日期 + 周次
  if(!renderTopbarWeek._timer) renderTopbarWeek._timer = setInterval(renderTopbarWeek, 60000);  // 跨周/跨天自动刷新
  startQuoteRotation();                                                        // v1.7：金句自动换
  applyDesktopPrefs();                                                         // v1.8：托盘常驻偏好同步给外壳
  /* 首次进入弹一次新手引导（走完或点「跳过」就不再弹）。延后一点，
     让主界面先画出来，避免"一进来就是一堵弹窗"。 */
  if(!S.guideSeen) setTimeout(()=>{ if(!S.guideSeen) openOnboarding(); }, 420);
}

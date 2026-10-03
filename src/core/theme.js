/* ---------- 主题 ---------- */
const THEMES = [
  {id:'light', icon:'☀', label:'明亮'},
  {id:'dark',  icon:'☾', label:'暗黑'},
  {id:'eye',   icon:'◑', label:'护眼'}
];

function applyTheme(t){
  if(!THEMES.some(x=>x.id===t)) t = 'light';
  S.theme = t;
  if(t === 'light') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
  // 同步顶栏与设置弹层两处控件的高亮态
  document.querySelectorAll('[data-theme-btn]').forEach(b=>{
    b.classList.toggle('on', b.getAttribute('data-theme-btn') === t);
  });
}
function setTheme(t){
  applyTheme(t);
  // 双写：S.theme 走主存储，cw_theme 供首屏预载脚本使用
  try{ localStorage.setItem('cw_theme', t); }catch(e){}
  syncThemeUI(t);
  save();
}
/* v1.6：窄屏只有「一个显示模式按钮」，宽屏是三选一 —— 两处状态都要跟着当前主题走 */
const THEME_NEXT = { light:'dark', dark:'eye', eye:'light' };
function syncThemeUI(t){
  document.querySelectorAll('[data-theme-btn]').forEach(b=>{
    b.classList.toggle('on', b.getAttribute('data-theme-btn') === t);
  });
  const b = $('themeCycle');
  if(b){
    const cur = THEMES.find(x=>x.id===t) || THEMES[0];
    const nxt = THEMES.find(x=>x.id===THEME_NEXT[t]) || THEMES[0];
    b.textContent = cur.icon;
    b.title = `显示模式：当前「${cur.label}」· 点击切换为「${nxt.label}」`;
  }
}
function cycleTheme(){
  const next = THEME_NEXT[S.theme] || 'light';
  const label = (THEMES.find(x=>x.id===next) || THEMES[0]).label;
  setTheme(next);
  toast('显示模式：' + label);
}

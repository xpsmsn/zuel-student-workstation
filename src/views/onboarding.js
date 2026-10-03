/* ---------- 首次打开的分步实操向导（v1.9 重做：每一步都有一个"现在就点"的动作） ----------
   设计原则：只读文字的引导没人跟着做。所以每一步都配一个可点的按钮
   ——「打开系统」「现在导入」—— 照着点完，两份文件就到手并进来了。 */
const WIZ_TITLES = ['开始之前', '① 取学生信息', '② 取成绩单', '③ 导入学生表', '④ 导入成绩单', '好了'];
let wizStep = 0;

/* 进度清单：让用户随时知道"还差哪份文件" */
function wizChecklist(){
  const ok1 = !!S._wizGotStudent, ok2 = !!S._wizGotGrade;
  const li = (on, txt) => `<div class="ck-li ${on?'on':''}"><span class="ck-box">${on?'✓':''}</span>${txt}</div>`;
  return `<div class="wiz-ck">
    ${li(ok1, '学生基本信息表（智慧学工）')}
    ${li(ok2, '专业成绩单（综合教务）')}
  </div>`;
}
function wizGot(what){
  if(what === 'student') S._wizGotStudent = true;
  if(what === 'grade')   S._wizGotGrade = true;
  renderOnboarding();
}

/* 传 step 可从指定一步继续（例如导完学生后接着看"导入成绩单"那一步） */
function openOnboarding(step){
  wizStep = Number(step) || 0;
  if(!step){ S._wizGotStudent = false; S._wizGotGrade = false; }
  renderOnboarding();
}
function wizGo(d){ wizStep = Math.max(0, Math.min(WIZ_TITLES.length-1, wizStep + d)); renderOnboarding(); }
function finishOnboarding(skipped){
  S.guideSeen = true; save();
  closeModal();
  toast(skipped ? '已跳过 —— 侧栏「导入指引」随时可以再看' : '搞定！侧栏「导入指引」里还留着这份说明');
  /* v1.9.2：引导关了之后，接着在界面上浮出一圈「批注」，
     把新人最容易卡住的几个位置点一遍。没看过才弹；老用户（tourSeen 缺省）不弹。 */
  if(!S.tourSeen) setTimeout(()=>{ if(!S.tourSeen && !$('tourLayer')) startTour(); }, 460);
}

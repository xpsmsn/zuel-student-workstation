/* ---------- 演示数据补全（仅内置样例，真实数据由导入决定） ----------
   为 12 列表头的两个新字段做演示：
   · 电子信箱：由学号推导（纯演示）
   · 室友：按「宿舍」分组推导，同宿舍的其他学生姓名。语义正确。 */
/* 演示数据的床位编组（v1.9）
   内置样例 80 人原本各占一间房（100栋-101 … 180），于是宿舍看板看上去是
   「80 间 / 每间只住 1 人 / 全部空 3 床」、室友列全空 —— 一眼就很假，
   新用户第一次点开「查寝打分表」也会看到满屏 1 人的房间。
   这里把演示学生按性别重新编组：每间 2~4 人、床位从 01 床连续编号、男女不混寝，
   只为让首次打开的样子接近真实数据。**仅影响内置演示批次**，
   真实数据一律由「导入学生表」决定，与这里无关。 */
function demoDorms(list){
  const plan = new Map();                       // 学号 → { 宿舍, 床位 }
  const sizes = [4, 3, 4, 2];                   // 2~4 人的循环，避免每间都一样整齐
  let roomSeq = 100;                            // 房号从 101 起
  ['男', '女'].forEach(g=>{
    const bucket = list.filter(s => String(s['性别'] || '') === g);
    let i = 0, k = 0;
    while(i < bucket.length){
      const n = Math.min(sizes[k % sizes.length], bucket.length - i);
      const room = '100栋-' + (++roomSeq);
      for(let b = 0; b < n; b++){
        plan.set(bucket[i + b]['学号'], { '宿舍': room, '床位': String(b + 1).padStart(2, '0') + '床' });
      }
      i += n; k++;
    }
  });
  // 保持原顺序（演示批次列表仍按样例顺序），只换掉宿舍与床位
  return list.map(s => Object.assign({}, s, plan.get(s['学号']) || {}));
}
function decorateDemo(list){
  const byDorm = new Map();
  list.forEach(s=>{
    const d = s['宿舍'];
    if(!d) return;
    if(!byDorm.has(d)) byDorm.set(d, []);
    byDorm.get(d).push(studentName(s));
  });
  return list.map(s=>{
    const me = studentName(s);
    const mates = (byDorm.get(s['宿舍'])||[]).filter(n=>n !== me);
    return Object.assign({}, s, {
      '室友': mates.length ? mates.join('、') : null,
      '电子信箱': s['学号'] ? (String(s['学号']) + '@stu.example.edu.cn') : null
    });
  });
}

/* ---------- 演示成绩（仅内置样例） ----------
   用样例里已有的「加权平均成绩」推导出一份成绩层数据，让首次安装就能看到
   「学生画像 × 成绩」的绑定效果。真实数据一律由「导入成绩」决定，这里不参与。 */
function demoGrades(students){
  const rows = students.filter(s=>{
    const v = Number(s['加权平均成绩']);
    return s['加权平均成绩'] != null && s['加权平均成绩'] !== '' && !isNaN(v);
  });
  const scores = rows.map(s=>Number(s['加权平均成绩'])).sort((a,b)=>b-a);
  const rankOf = v => scores.indexOf(v) + 1;
  return rows.map(s=>{
    const score = Number(s['加权平均成绩']);
    const idx = scores.indexOf(score);
    return {
      '学号': String(s['学号'] == null ? '' : s['学号']),
      '姓名': studentName(s),
      '班级': s['班级'] || '',
      '排名': rankOf(score),
      '加权平均成绩': score,
      '平均学分绩点': Math.max(0, Math.min(4, Math.round((score-50)/10*100)/100)),
      '平均分': score,
      '课程门数': 40 + (idx % 15),
      '不及格门数': score < 60 ? 1 : 0,
      '总分': Math.round(score * 45),
      '所得学分': 100 + (idx % 20)
    };
  });
}

/* ════════════════════════════════════════════════════════════════════════
   启动 —— 整份文件的**最后一个**模块
   ────────────────────────────────────────────────────────────────────────
   为什么它排在最后：boot() 会调用 renderSidebar / renderMain /
   startQuoteRotation… 也就是**任何模块**的函数。

   为什么它现在可以排在最后而不需要人工固定：
   manifest 里给它标了 `entry: true`，构建器会把 entry 模块钉在最后一位。
   以前这靠手写一条几十项的 .module-order.json —— 漏一项就白屏，
   而且没人说得清「第 47 个位置为什么不能动」。

   ⚠️ 这里仍是一个立即执行的 IIFE，所以 manifest 必须记：
       entry: true
   改成 K.ready(...) 也可以，那样连 entry 都不需要 ——
   但启动里有 await（磁盘镜像恢复），走 ready 钩子要多包一层 Promise。
   现在这样更直白，代价只是 manifest 里一个字段。
   ════════════════════════════════════════════════════════════════════════ */
(async function boot(){
  let has = load();
  // v1.5：localStorage 为空（首次使用 / 浏览器缓存被清）且在桌面版里 → 先试磁盘镜像。
  // 注意：只在 Tauri 环境才 await，浏览器/测试环境保持完全同步的灌底时序。
  if(!has && (window.__TAURI__ && window.__TAURI__.core)){
    const restored = await restoreFromDisk();
    if(restored) has = load();
  }
  if(!has){
    // 首次安装：建一个「演示数据」批次，便于直接体验（可在批次管理中一键删除）
    // demoDorms 先把 80 人编进 2~4 人/间，宿舍看板与查寝打分表才像真实数据
    const students = decorateDemo(demoDorms(SEED_DATA.map(d=>({...d}))));
    S.batches = [makeBatch('演示数据', 'demo', students, '', demoGrades(students))];
    S.activeBatchId = S.batches[0].id;
    S.students = students;
    // 成绩也要指向该批次，否则 save() 的自检会报「脱钩」
    S.grades = S.batches[0].grades;
    invalidateGradeMap();
    save();
  }
  _seedLibraries();   // 内容库灌底：三条路径（v2 读回 / v1 迁移 / 首次安装）都会拿到预置，已有内容不动
  // 兜底：任何情况下都要保证 S.students 与当前批次一致
  if(S.batches.length){ attachBatch(activeBatch().id); } else { S.activeBatchId = null; S.students = []; S.grades = []; invalidateGradeMap(); }
  // 首屏主题已由 head 预载脚本设置，此处做一次一致性校正
  const pre = localStorage.getItem('cw_theme');
  if(pre && pre !== S.theme){ try{ localStorage.setItem('cw_theme', S.theme);}catch(e){} }
  applyTheme(S.theme || 'light');
  initResponsive();
  initModalKeyboard();   // v2.2：弹窗的 Esc 关闭 + Tab 焦点陷阱（全局一处，覆盖所有弹窗）
  initShortcuts();       // v2.2：搜索快捷键（⌘/Ctrl+K、/ 唤起，Esc 清空）
  initLogin();
})();
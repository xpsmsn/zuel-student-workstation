/* 内容库三件（校务导航/常用模板/制度速查）+ 工作笔记 回归测试
   用法: node .build/test-library.js 中南大学生工作台.html
   桩设计沿用 test-delete-backup.js：DOM 元素按 id 缓存（同一 id 读到同一对象），
   askConfirm 抓 onOk 回调，window.open 记录到 __opened。 */
const fs = require('fs'), vm = require('vm');
const html = fs.readFileSync(process.argv[2], 'utf8');

let failN = 0;
const fail = m => { console.error('  ✗ ' + m); failN++; };
const pass = m => console.log('  ✓ ' + m);

/* ── 沙盒骨架 ── */
function el(){ return {
  innerHTML:'', textContent:'', value:'', placeholder:'', checked:false, files:null,
  offsetWidth:0, clientWidth:0, style:{}, dataset:{}, result:'', _h:null,
  classList:{ add(){}, remove(){}, toggle(){}, contains(){ return false; } },
  setAttribute(){}, removeAttribute(){}, getAttribute(){ return null; },
  addEventListener(){}, removeEventListener(){},
  appendChild(){}, removeChild(){}, click(){}, scrollTo(){}, focus(){}, select(){}, closest(){ return null; },
  querySelector(){ return null; }, querySelectorAll(){ return []; }
};}
function fresh(){
  const store = new Map();
  const cache = new Map();
  let confirmCb = null;
  const mk = id => { const e = el(); e.id = id; cache.set(id, e); return e; };
  const opened = [];
  const timers = [];
  const sandbox = {
    console, setTimeout, clearTimeout,
    /* setInterval 换成录像机：既能断言"挂了 5s 轮换"，又不会留活定时器拖住进程 */
    setInterval:(fn, ms)=>{ timers.push({ fn, ms }); return timers.length; },
    clearInterval(){},
    document: {
      getElementById: id => cache.has(id) ? cache.get(id) : mk(id),
      querySelector: () => el(), querySelectorAll: () => [],
      createElement: () => el(), addEventListener(){}, execCommand: () => true,
      body: mk('__body'),
      documentElement:{ setAttribute(){}, removeAttribute(){}, getAttribute(){ return null; } }
    },
    localStorage:{
      getItem:k=>store.has(k)?store.get(k):null,
      setItem:(k,v)=>store.set(k,String(v)),
      removeItem:k=>store.delete(k)
    },
    location:{ reload(){} },
    /* 导出打印页要用到；Node 里没有 Blob，给个最小替身（只验「有没有走这条路」） */
    Blob:function(parts, opts){ this.parts = parts; this.type = (opts && opts.type) || ''; },
    URL:{ createObjectURL:()=> 'blob:test', revokeObjectURL(){} },
    confirm:()=>{ throw new Error('系统 confirm() 被调用 —— 应使用 askConfirm'); },
    prompt:()=>{ throw new Error('系统 prompt() 被调用'); },
    alert:()=>{},
    open:(u)=>{ opened.push(u); return null; },
    matchMedia:()=>({ matches:false, addEventListener(){}, removeEventListener(){}, addListener(){} }),
    ResizeObserver:function(){ this.observe=()=>{}; this.disconnect=()=>{}; },
    navigator:{ userAgent:'node' },
    __confirmYes(){ const cb = confirmCb; confirmCb = null; if(cb) cb(); },
    __setConfirmCb(cb){ confirmCb = cb; },
    __opened: opened,
    __timers: timers,
    __store: store
  };
  sandbox.window = sandbox;
  return { sandbox, store, opened };
}

/* 抽应用 script 块（含 function doImport 的最大块） */
const blocks = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
const appSrc = blocks.filter(s=>s.includes('function doImport')).sort((a,b)=>b.length-a.length)[0];
if(!appSrc){ console.error('找不到应用脚本块'); process.exit(1); }

const hooked = appSrc
  .replace('function askConfirm(opts){',
    'function askConfirm(opts){ __setConfirmCb(opts.onOk||null); if(window.__lastAsk) window.__lastAsk(opts);');

const { sandbox, store, opened } = fresh();
vm.createContext(sandbox);
try{
  vm.runInContext(hooked, sandbox, { filename:'app.js' });
  pass('应用脚本语法通过（vm 编译无错）');
}catch(e){ fail('应用脚本编译失败：' + e.message); process.exit(1); }

const R = k => vm.runInContext(k, sandbox);

console.log('\n[1] 启动灌底：预置库数量与关键条目');
const nNav = () => R('S.navLinks.length'), nTpl = () => R('S.templates.length');
if(nNav() >= 80) pass(`校务导航预置 ${nNav()} 条（9 分区）`); else fail(`校务导航 = ${nNav()}，应 ≥ 80`);
if(R(`S.navLinks.some(x=>x.name.includes('智慧学工'))`) === true) pass('含智慧学工入口'); else fail('缺智慧学工');
if(R(`S.navLinks.some(x=>x.name.includes('智慧教务'))`) === true) pass('含智慧教务入口'); else fail('缺智慧教务');
if(R(`S.navLinks.some(x=>x.url.includes('istu.zuel.edu.cn'))`) === true) pass('智慧学工指向 istu.zuel.edu.cn'); else fail('智慧学工 URL 不对');
if(R(`new Set(S.navLinks.map(x=>x.url)).size`) === R('S.navLinks.length')) pass('预置链接无重复'); else fail('预置链接有重复');
if(nTpl() === 12) pass('常用模板预置 12 条'); else fail(`常用模板 = ${nTpl()}，应为 12`);
if(R('typeof S.policies') === 'undefined') pass('policies 字段已移除'); else fail('policies 仍存在');
if(R('typeof S.notes') === 'string' && R('S.notes') === '') pass('老笔记字段初始为空（兼容保留）');
else fail('S.notes 初始值异常: ' + R('JSON.stringify(S.notes)'));
if(Array.isArray(R('S.todos'))) pass('备忘清单 todos 已灌底为数组'); else fail('todos 未灌底: ' + R('typeof S.todos'));
if(R('S.backupRemind') === true) pass('备份提醒开关默认开启'); else fail('backupRemind 默认值异常');
if(R('typeof S.profile') === 'object' && R('typeof S.sideFold') === 'object') pass('profile / sideFold 字段就绪');
else fail('profile/sideFold 初始化异常');

console.log('\n[2] 用户改过内容后 save→load 不被预置覆盖');
R(`S.templates[0].body = '我改过的内容'; S.sideCollapsed = true; save();`);
const okLoad = R('load()');
if(okLoad === true) pass('load() 返回 true');
else fail('load() 返回 ' + okLoad);
if(nTpl() === 12 && R('S.templates[0].body') === '我改过的内容')
  pass('用户修改的模板正文保留（未被重新灌底）');
else fail('用户模板被覆盖: ' + R('S.templates[0].body'));
if(R('S.sideCollapsed') === true) pass('侧栏收缩偏好已持久化'); else fail('sideCollapsed 丢失');
const navN2 = nNav();
if(navN2 >= 80) pass(`导航数量不变（${navN2} 条）`); else fail('导航数量异常: ' + navN2);

console.log('\n[3] 删除预置 → 恢复预置只补缺');
R(`delLibItem('templates', S.templates[3].id);`);
R('__confirmYes()');
if(nTpl() === 11) pass('删除一条模板 → 11 条'); else fail('删除后数量 = ' + nTpl());
const restored = R(`restoreLibraryPresets('templates')`);
if(nTpl() === 12 && restored === 1) pass('恢复预置补回 1 条 → 12 条');
else fail(`恢复预置异常：restored=${restored}, n=${nTpl()}`);
R(`S.templates.push({id:'x1', title:'我的自定义模板', tag:'日常事务', body:'自定义'}); save();`);
const restored2 = R(`restoreLibraryPresets('templates')`);
if(nTpl() === 13 && restored2 === 0) pass('自定义模板不受恢复影响（不重复）');
else fail(`再次恢复异常：restored=${restored2}, n=${nTpl()}`);

console.log('\n[4] 校务导航新增校验 + 删除确认');
const navBefore = nNav();
R(`$('nvName').value = ''; saveNav('');`);
if(nNav() === navBefore) pass('空名称被拦截（不新增）'); else fail('空名称竟然新增了');
R(`$('nvName').value = '测试链接'; $('nvUrl').value = 'javascript:alert(1)'; saveNav('');`);
if(nNav() === navBefore) pass('非 http/https 网址被拦截'); else fail('危险网址被放行');
R(`$('nvName').value = '测试链接'; $('nvUrl').value = 'https://www.example.com'; $('nvCat').value = '测试分组'; $('nvDesc').value = '说明'; saveNav('');`);
if(nNav() === navBefore + 1) pass('合法链接新增成功'); else fail('合法链接未新增');
const navUrlOk = R(`S.navLinks[S.navLinks.length-1].url`);
if(navUrlOk === 'https://www.example.com') pass('新链接字段正确'); else fail('新链接字段异常: ' + navUrlOk);
R(`delNav(S.navLinks[S.navLinks.length-1].id);`);
R('__confirmYes()');
if(nNav() === navBefore) pass('删除链接（经确认框）成功'); else fail('删除失败');

console.log('\n[5] 页面渲染：导航 / 模板 / AI 辅导员 / 校历 / 个人中心');
let threw = null;
try{ R(`gotoNav()`); }catch(e){ threw = e; }
const navHtml = R(`$('mainArea').innerHTML`);
if(!threw && navHtml.includes('校务导航') && navHtml.includes('常用系统')) pass('renderNav 渲染正常且带分区');
else fail('renderNav 异常: ' + (threw && threw.message));
try{ R(`S._navCat={nav:'学工线'}; renderNav();`); }catch(e){ threw = e; }
const navHtml2 = R(`$('mainArea').innerHTML`);
if(!threw && navHtml2.includes('学生资助管理中心') && !navHtml2.includes('信息门户（融合门户）</div>'))
  pass('分类 chip 过滤生效'); else fail('分类过滤异常');
R(`S._navCat={nav:''};`);
try{ R(`gotoTpl()`); }catch(e){ threw = e; }
const tplHtml = R(`$('mainArea').innerHTML`);
if(!threw && tplHtml.includes('常用模板') && tplHtml.includes('我的自定义模板'))
  pass('renderTpl 渲染正常且含自定义项'); else fail('renderTpl 异常: ' + (threw && threw.message));
try{ R(`gotoPol()`); }catch(e){ threw = e; }
const polHtml = R(`$('mainArea').innerHTML`);
/* v1.9.3：AI 辅导员页重排 —— 左「鹿晓南」右「综合评定答疑机器人」两卡并列，
   两张二维码统一外框（纯码 + 白底），每张下面各有「复制链接」；
   原「什么问题适合问鹿晓南」说明卡按要求删掉（内容并进左卡）。 */
{
  const nQr   = (polHtml.match(/class="qr-box"/g) || []).length;
  const nCopy = (polHtml.match(/copyPlain\(/g) || []).length;
  const ok = !threw
    // v2.1.0：这一页改名「AI 助理」并收三个入口（新增「学工工作助理」）
    && polHtml.includes('鹿晓南') && polHtml.includes('综合评定答疑机器人') && polHtml.includes('学工工作助理')
    && polHtml.includes('辅导员专用')
    && polHtml.includes('data:image/png;base64')
    && !polHtml.includes('notesArea')
    && !polHtml.includes('什么问题适合问鹿晓南')                  // 已删
    && nQr === 3 && nCopy === 3                                   // 三张码 / 三个复制按钮
    && polHtml.includes('24e2c0d19f4e8fee5bcfc17372ce897e8b')      // 鹿晓南链接
    && polHtml.includes('24d1d5d6dbbc9966888e83992af4e857fc')      // 答疑机器人链接
    && polHtml.includes('249890243394250fb32122a8eb23103ecc');     // 学工工作助理链接（v2.1.0）
  ok ? pass('AI 助理页：三卡并列 + 三张二维码同款外框 + 各自「复制链接」')
     : fail(`renderAssistant 落点不对（qr-box ${nQr} 个 / 复制按钮 ${nCopy} 个）`
            + (threw ? ' 异常:' + threw.message : ''));
}
try{ R(`gotoCal()`); }catch(e){ threw = e; }
const calHtml = R(`$('mainArea').innerHTML`);
if(!threw && calHtml.includes('校历作息') && calHtml.includes('2026-2027') && calHtml.includes('data:image/gif;base64'))
  pass('校历作息页：学年校历 + 课堂时间表'); else fail('renderCalendar 异常: ' + (threw && threw.message));
try{ R(`gotoProfile()`); }catch(e){ threw = e; }
const pfHtml = R(`$('mainArea').innerHTML`);
if(!threw && pfHtml.includes('个人中心') && pfHtml.includes('pfAvatar') && pfHtml.includes('oldPw'))
  pass('个人中心页：头像/姓名/改密/数据管理'); else fail('renderProfile 异常: ' + (threw && threw.message));
opened.length = 0;
R(`openLinkExternal('javascript:alert(1)')`);
if(opened.length === 0) pass('javascript: 链接被前端白名单拦截'); else fail('危险链接被放行: ' + opened[0]);
R(`openLinkExternal('https://istu.zuel.edu.cn')`);
if(opened.length === 1 && opened[0] === 'https://istu.zuel.edu.cn') pass('https 链接走 window.open（浏览器回退）');
else fail('外链打开异常: ' + JSON.stringify(opened));

console.log('\n[5.5] 个人信息保存 + 分组折叠');
R(`saveProfileField('name', '张老师')`);
if(R(`S.profile.name`) === '张老师') pass('姓名可保存'); else fail('姓名保存失败: ' + R(`S.profile.name`));
const folded = R(`toggleSideFold('tools')`);
if(R(`S.sideFold.tools`) === true) pass('常用工具分组可折叠'); else fail('折叠失败');
R(`toggleSideFold('tools')`);
if(R(`S.sideFold.tools`) === false) pass('再次点击可展开'); else fail('展开失败');
R(`S.sideCollapsed = true; renderSidebar();`);
const sbHtml = R(`$('sidebar').innerHTML`);
if(sbHtml.includes('side-item') || sbHtml.includes('collapsed')) pass('收缩态侧栏仍渲染图标项'); else fail('收缩态侧栏异常');
R(`S.sideCollapsed = false; renderSidebar();`);

console.log('\n[6] 备忘清单 + 数据迁移 + 备份提醒');
// 老笔记 → 备忘清单的一次性迁移（模拟 v1.3 老数据）
R(`S.notes = '明天收奖学金材料\\n周四下午谈心：小李'; S.todos = []; S._notesMigrated = false; _seedLibraries();`);
if(R('S.todos.length') === 2) pass('老工作笔记按行迁移为 2 条备忘'); else fail('笔记迁移异常: ' + R('JSON.stringify(S.todos)'));
if(R('S._notesMigrated') === true) pass('迁移标记已置位（不会重复迁移）'); else fail('迁移标记未置位');
// CRUD
R(`S.todos = []; _notesMigratedFix = 0;`);
R(`addTodo('周三前收齐奖学金申请表');`);
if(R('S.todos.length') === 1 && R('S.todos[0].text') === '周三前收齐奖学金申请表') pass('addTodo 可添加');
else fail('addTodo 异常: ' + R('JSON.stringify(S.todos)'));
R(`toggleTodo(S.todos[0].id);`);
if(R('S.todos[0].done') === true) pass('toggleTodo 可勾选完成'); else fail('toggleTodo 异常');
R(`delTodo(S.todos[0].id);`);
if(R('S.todos.length') === 0) pass('delTodo 可删除'); else fail('delTodo 异常');
// 备份提醒链路
R(`S.backupRemind = false; markDataChanged();`);
if(R('S.backupRemind') === true) pass('导入数据后 markDataChanged 置位提醒'); else fail('markDataChanged 未生效');
R(`S.backupRemind = true; showBackupRemind();`);
if(R(`!!document.getElementById('brMask')`) === true) pass('备份提醒弹窗可弹出'); else fail('提醒弹窗未出现');
R(`closeBackupRemind(); S.backupRemind = false;`);
if(R('_brMaskEl === null') === true) pass('提醒弹窗可关闭'); else fail('提醒弹窗未关闭');

console.log('\n[6.5] v1.5：班级排序 / 周次 / 系统设置 / 导入历史');
// 班级排序：classOrder 优先，新班级排后
R(`S.classOrder = ['会计2202'];`);
const ordered = R(`JSON.stringify(orderClasses(['会计2201','会计2202','会计2203']))`);
if(ordered === JSON.stringify(['会计2202','会计2201','会计2203'])) pass('orderClasses：置顶班级优先、新班级排后');
else fail('orderClasses 异常: ' + ordered);
R(`S.classOrder = [];`);
// 周次计算：以今天为第 1 周周一
R(`const __d=new Date(); S.semester={name:'测试学期', start:__d.getFullYear()+'-'+String(__d.getMonth()+1).padStart(2,'0')+'-'+String(__d.getDate()).padStart(2,'0'), weeks:18};`);
if(R('semesterWeek().raw') === 1) pass('semesterWeek：开始日当周记为第 1 周');
else fail('semesterWeek 异常: ' + R('JSON.stringify(semesterWeek())'));
R(`renderTopbarWeek();`);
const chip = R(`$('weekChip').innerHTML`);
if(chip.includes('周') && (chip.includes('第 1 周') || chip.includes('测试学期'))) pass('顶栏周次徽章渲染');
else fail('周次徽章异常: ' + chip);
// 系统设置页
R(`gotoSettings();`);
const setHtml = R(`$('mainArea').innerHTML`);
if(setHtml.includes('系统设置') && setHtml.includes('setName') && setHtml.includes('数据固化')) pass('系统设置页渲染');
else fail('renderSettings 异常');
// 导入历史：记录 + 页面渲染 + 复原按钮
R(`S.importHistory = [{ id:'hT1', ts:'2026/09/22 08:00:00', type:'成绩', file:'成绩信息.xlsx', batch:'演示数据', batchId:S.activeBatchId, added:1, updated:2, skipped:0, status:'已生效', snap:null }];`);
R(`gotoImportLog();`);
const logHtml = R(`$('mainArea').innerHTML`);
if(logHtml.includes('导入历史') && logHtml.includes('成绩信息.xlsx') && logHtml.includes('restoreImport'))
  pass('导入历史页渲染（含复原按钮）');
else fail('renderImportLog 异常');
R(`readSnapshot(S.importHistory[0]).then(v=>{ window.__snapNull = (v === null); });`);
console.log('\n[6.6] v1.6：顶栏响应式 / 系统设置重构 / 备份时间');
// 显示模式循环切换：一个按钮走完三档
R(`S.theme='light'; syncThemeUI('light'); cycleTheme();`);
if(R('S.theme') === 'dark') pass('窄屏单按钮：明亮 → 暗黑'); else fail('cycleTheme 异常: ' + R('S.theme'));
R(`cycleTheme();`);
if(R('S.theme') === 'eye') pass('暗黑 → 护眼'); else fail('cycleTheme 第二档异常: ' + R('S.theme'));
R(`cycleTheme();`);
if(R('S.theme') === 'light') pass('护眼 → 明亮（循环闭合）'); else fail('cycleTheme 循环异常: ' + R('S.theme'));
// 侧栏不再有「数据管理」组，只剩系统组
R(`renderSidebar();`);
const sb16 = R(`$('sidebar').innerHTML`);
if(!sb16.includes('>数据管理<') && sb16.includes('系统设置') && sb16.includes('个人中心'))
  pass('侧栏：数据管理已收起，仅剩系统组'); else fail('侧栏分组异常');
// 系统设置页：外观 + 学期 + 数据管理 + 关于
R(`gotoSettings();`);
const set16 = R(`$('mainArea').innerHTML`);
// v1.9.7.1：数据管理按「你要干什么」分三组；「打开备份文件夹」等四个备份类入口
// 收进了「备份与恢复」弹窗（不再平铺在页面上），所以这里断言的是分组与入口本身，
// 并单独校验弹窗里确实还有"打开备份文件夹"。
const hasGroups = set16.includes('把数据取进来') && set16.includes('备份与搬运') && set16.includes('出问题回退');
const hasAuto = set16.includes('自动保护');
if(set16.includes('外观与主题') && set16.includes('学期与周次') && set16.includes('数据管理')
   && hasGroups && hasAuto && set16.includes('openBackupRestore') && set16.includes('关于'))
  pass('系统设置页：外观 / 学期 / 数据管理（三组 + 自动保护）/ 关于 齐全');
else fail(`renderSettings 异常（分组:${hasGroups} 自动保护:${hasAuto}）`);
R('openBackupRestore();');
const dlg16 = R(`$('modalRoot').innerHTML`);
if(dlg16.includes('打开备份文件夹') && dlg16.includes('openDownloadsFolder') && dlg16.includes('我导出的备份文件'))
  pass('「备份与恢复」弹窗内含：打开备份文件夹 / 我导出的备份文件清单');
else fail('备份弹窗里少了并入的入口');
R(`closeModal();`);
// 个人中心：只留个人资料与安全
R(`gotoProfile();`);
const pf16 = R(`$('mainArea').innerHTML`);
if(pf16.includes('姓名') && pf16.includes('安全') && !pf16.includes('备份与恢复') && pf16.includes('系统设置'))
  pass('个人中心：只留资料与安全，其余引导到系统设置');
else fail('renderProfile 精简异常');
// 备份时间：未备份 → 提示文案
R(`S.lastBackupAt = '';`);
if(R('backupAgeText()') === '还没有导出过备份') pass('未备份时给出明确提示'); else fail('backupAgeText 异常: ' + R('backupAgeText()'));
R(`S.lastBackupAt = new Date().toLocaleString('zh-CN',{hour12:false});`);
if(R('backupAgeText()').indexOf('上次备份') === 0) pass('已备份时显示备份时间'); else fail('backupAgeText 异常: ' + R('backupAgeText()'));
// 备份时间要能落库（导出动作本身在沙盒里没文件下载，这里验证持久化链路）
R(`S.lastBackupAt='2026/09/22 08:00:00'; save();`);
if(R('JSON.parse(localStorage.getItem(STORE_KEY)).lastBackupAt') === '2026/09/22 08:00:00')
  pass('备份时间已持久化'); else fail('lastBackupAt 未落库');

console.log('\n[6.7] v1.7：时段问候 / 金句轮换 / 手机端适配');
// ① 时段问候边界（把假时间直接喂给 greetWord）
const gw = h => R(`greetWord(new Date(2026,8,22,${h},0,0))`);
const gCases = [[5,'早上好'],[9,'早上好'],[10,'早上好'],[11,'中午好'],[12,'中午好'],
                [13,'下午好'],[17,'下午好'],[18,'晚上好'],[22,'晚上好'],[23,'夜深了'],[2,'夜深了']];
const gBad = gCases.filter(c => gw(c[0]) !== c[1]);
if(gBad.length === 0) pass('时段问候：05-10 早上好 / 11-12 中午好 / 13-17 下午好 / 18-22 晚上好 / 23-04 夜深了');
else fail('greetWord 边界异常：' + JSON.stringify(gBad.map(c => [c[0], gw(c[0])])));
// ② 称呼同步个人中心姓名
R(`S.profile = { name:'吴章凡', dept:'', phone:'', avatar:'' };`);
if(R('greetName()') === '吴章凡') pass('称呼取个人中心姓名'); else fail('greetName 未取姓名: ' + R('greetName()'));
R(`S.profile = { name:'', dept:'', phone:'', avatar:'' };`);
if(R('greetName()') === '辅导员') pass('姓名留空时回落「辅导员」'); else fail('greetName 回落异常: ' + R('greetName()'));
// ③ 总览页问候 = 时段 + 姓名
R(`S.profile = { name:'吴章凡', dept:'', phone:'', avatar:'' }; S.view='dashboard'; renderMain();`);
const d17 = R(`$('mainArea').innerHTML`);
if(/(早上好|中午好|下午好|晚上好|夜深了)/.test(d17) && d17.includes('吴章凡'))
  pass('总览页问候 = 时段 + 个人中心姓名');
else fail('总览页问候未同步姓名或时段');
// 总览问候改为局部更新，不能整页重绘（否则输入/滚动被打断）
R(`renderDashGreeting()`);
pass('renderDashGreeting 局部更新不报错');
// ④ 金句 5 秒自动轮换
R('startQuoteRotation()');
if(R('__timers.filter(t=>t.ms===5000).length') >= 1) pass('金句自动轮换：已挂 5000ms 定时器');
else fail('未见 5000ms 定时器：' + R('JSON.stringify(__timers.map(t=>t.ms))'));
R('startQuoteRotation()');
if(R('__timers.filter(t=>t.ms===5000).length') === 1) pass('重复进入应用不叠加定时器');
else fail('定时器被重复挂载');
// ⑤ 顶栏周次：学期名单独包一层，手机端才藏得掉
R(`S.semester = { name:'2026-2027 学年第一学期', start:'2026-09-07', weeks:18 }; renderTopbarWeek();`);
if(R(`$('weekChip').innerHTML`).includes('wk-sem')) pass('周次徽章：学期名带 wk-sem 标记');
else fail('周次徽章缺 wk-sem 标记');
// ⑥ 手机端样式（源码级断言，防止以后被误删）
const css = (html.match(/<style[^>]*>[\s\S]*?<\/style>/gi) || []).join('');
const cssNeed = [
  ['.logo-text{display:none}', 2, '≤820px / ≤560px 顶栏省掉校名文字'],
  ['.week-chip .wk-sem,.week-chip .wk-dot{display:none}', 1, '手机端周次只留「第 N 周」'],
  ['.week-chip{flex:0 1 auto;min-width:0}', 1, '周次徽章可收缩，不把右侧按钮顶出屏幕'],
  ['.sem-grid{grid-template-columns:1fr;max-width:none}', 1, '学期设置表单手机端单列'],
  ['.memo-in{flex:1;min-width:0}', 1, '备忘输入框允许收缩，按钮不换行']
];
cssNeed.forEach(([needle, min, label]) => {
  const n = css.split(needle).length - 1;
  if(n >= min) pass('手机适配：' + label); else fail('手机适配缺失：' + label + `（${needle} 命中 ${n} 次）`);
});

console.log('\n[6.8] v1.8：托盘常驻 / 开机启动 / 金句可配置');
// ① 默认值：金句开·5 秒·托盘开·开机启动关
if(R('S.quoteAuto') === true && R('S.quoteSec') === 5 && R('S.trayMin') === true && R('S.autoStart') === false)
  pass('运行偏好默认值：金句开 / 5 秒 / 托盘常驻开 / 开机启动关');
else fail('v1.8 默认值异常：' + R('JSON.stringify({a:S.quoteAuto,s:S.quoteSec,t:S.trayMin,u:S.autoStart})'));
// ② 间隔换算与上下限夹取
if(R('quoteIntervalMs()') === 5000) pass('默认间隔 5000ms'); else fail('quoteIntervalMs 默认异常：' + R('quoteIntervalMs()'));
R('S.quoteSec = 10;');
if(R('quoteIntervalMs()') === 10000) pass('设为 10 秒 → 10000ms'); else fail('间隔换算异常');
R('S.quoteSec = 1;');
if(R('quoteIntervalMs()') === 3000) pass('间隔下限夹到 3 秒'); else fail('间隔下限未夹取：' + R('quoteIntervalMs()'));
R('S.quoteSec = 999;');
if(R('quoteIntervalMs()') === 120000) pass('间隔上限夹到 120 秒'); else fail('间隔上限未夹取：' + R('quoteIntervalMs()'));
// ③ 关掉自动轮换后不再挂定时器；改间隔后按新间隔重启
R('S.quoteSec = 5; __timers.length = 0; S.quoteAuto = false; restartQuoteRotation();');
if(R('__timers.length') === 0) pass('关闭自动轮换：不再挂定时器'); else fail('关闭后仍挂了定时器');
R('S.quoteAuto = true; setQuoteSec(15);');
if(R('__timers.some(t=>t.ms===15000)') === true) pass('改间隔后按新间隔重启定时器（15000ms）');
else fail('改间隔未重启：' + R('JSON.stringify(__timers.map(t=>t.ms))'));
// ④ 设置页：常驻与开机分区 + 金句开关/间隔控件
R('gotoSettings();');
const s18 = R(`$('mainArea').innerHTML`);
if(s18.includes('常驻与开机启动') && s18.includes('setTrayMin') && s18.includes('setAutoStart')
   && s18.includes('hideToTray') && s18.includes('data-quote-auto') && s18.includes('quoteSecSel'))
  pass('系统设置：常驻与开机分区 + 金句开关/间隔齐全');
else fail('renderSettings v1.8 异常');
// ⑤ 浏览器版点这些开关必须给出明确提示（不能默默无反应）
R('window.__toastMsg = null; var _oldToast = toast; toast = function(m){ window.__toastMsg = m; };');
R('setTrayMin(false);');
if(String(R('window.__toastMsg') || '').includes('桌面版')) pass('浏览器版点托盘开关：提示用桌面版');
else fail('托盘开关无提示：' + R('String(window.__toastMsg)'));
R('window.__toastMsg = null; setAutoStart(true);');
if(String(R('window.__toastMsg') || '').includes('桌面版')) pass('浏览器版点开机启动：提示用桌面版');
else fail('开机启动无提示：' + R('String(window.__toastMsg)'));
R('window.__toastMsg = null; hideToTray();');
if(String(R('window.__toastMsg') || '').includes('桌面版')) pass('浏览器版缩到托盘：提示用桌面版');
else fail('缩托盘无提示：' + R('String(window.__toastMsg)'));
R('toast = _oldToast;');
// ⑥ 源码断言：四个外壳命令名都真的被前端调用
['set_tray_minimize', 'set_autostart', 'is_autostart', 'hide_to_tray'].forEach(cmd => {
  if(html.includes(`'${cmd}'`)) pass('已调用外壳命令：' + cmd); else fail('缺少外壳命令调用：' + cmd);
});

console.log('\n[6.9] v1.9：新手引导可再进入 + 分步实操');
// ① 回归：v1.6 删「数据管理」分组时连唯一入口一起删了 → 侧栏必须常驻导入指引入口
//    v1.9.7.2：名称从「取数 · 导入指引」简化为「导入指引」（太长会换行，用户反馈）
R(`S.sideCollapsed = false; renderSidebar();`);
const sb19 = R(`$('sidebar').innerHTML`);
if(sb19.includes('gotoGuide()') && sb19.includes('导入指引'))
  pass('侧栏常驻「导入指引」入口（防再次被删）');
else fail('侧栏缺「导入指引」入口');
// ② 入口页按钮：重看引导 / 页面导览
R(`gotoGuide();`);
const g19 = R(`$('mainArea').innerHTML`);
if(g19.includes('openOnboarding(0)') && g19.includes('新手引导'))
  pass('指引页：可从第 0 步重看整份引导');
else fail('指引页缺「新手引导」按钮');
if(g19.includes('startTour()'))
  pass('指引页：可重看页面导览');
else fail('指引页缺「页面导览」按钮');
/* ③ v1.9.7.2 关键回归：原来「继续第 ④ 步 · 导入成绩」只要"有学生"就一直挂着
   （哪怕成绩早导完了），而且编号与页面卡片对不上，用户以为是 bug。
   现在必须满足两个条件才出现：有学生、且还没有成绩。 */
/* ⚠️ 下面几条要临时改 S 的状态来渲染不同场景 —— 必须先存后还。
   否则会把学生清空，污染后面【宿舍】等分段（踩过一次：宿舍断言 rows=0 all=0）。 */
R(`window.__libKeep = JSON.stringify({b:S.batches, a:S.activeBatchId, s:S.students, g:S.grades});
   S.batches=[]; S.activeBatchId=null; S.students=[]; S.grades=[]; renderGuide();`);
const gNoStu = R(`$('mainArea').innerHTML`);
if(!gNoStu.includes('继续：导入成绩单'))
  pass('没学生时不出现「继续：导入成绩单」');
else fail('没学生时仍出现续看按钮');
R(`S.batches.push(makeBatch('测试批次','demo',[])); attachBatch(S.batches[0].id);`);
const gStuNoGrade = (()=>{ R(`setStudents([{'学号':'2026001','姓名':'张三'}]); renderGuide();`);
  return R(`$('mainArea').innerHTML`); })();
if(gStuNoGrade.includes('继续：导入成绩单'))
  pass('★ 有学生但没成绩时，才出现「继续：导入成绩单」');
else fail('有学生没成绩时缺续看按钮');
const gBoth = (()=>{ R(`S.grades=[{'学号':'2026001','加权平均成绩':'88'}]; renderGuide();`);
  return R(`$('mainArea').innerHTML`); })();
if(!gBoth.includes('继续：导入成绩单'))
  pass('★ 成绩已导入后按钮消失（旧版会一直挂着，被当成 bug）');
else fail('成绩已导入仍显示续看按钮');
if(!gBoth.includes('数据固化（防清缓存丢失）') && !gBoth.includes('about-box'))
  pass('指引页不再重复页脚的「关于」块（与系统设置重复）');
else fail('指引页仍有重复的关于块');
// 还原现场
R(`(function(){ var k=JSON.parse(window.__libKeep); S.batches=k.b; S.activeBatchId=k.a;
     S.students=k.s; S.grades=k.g; if(k.a) attachBatch(k.a); delete window.__libKeep; })();`);
// ③ 个人中心也留一个重看入口（用户最容易找不到的地方）
R(`gotoProfile();`);
if(R(`$('mainArea').innerHTML`).includes('openOnboarding(0)'))
  pass('个人中心也带引导重看入口');
else fail('个人中心缺引导重看入口');
// ④ 向导共 6 步，四步都是有动作的实操步
if(R('WIZ_TITLES.length') === 6 && /①/.test(R(`WIZ_TITLES[1]`)) && /④/.test(R(`WIZ_TITLES[4]`)))
  pass('向导 6 步：开始之前 / ①取学生信息 / ②取成绩单 / ③导入学生表 / ④导入成绩单 / 好了');
else fail('向导步数或标题异常：' + R('JSON.stringify(WIZ_TITLES)'));
// ⑤ 每一步都配了「现在就点」的按钮（只读文字没人会照着做）
R(`openOnboarding(1);`);
const w1 = R(`$('modalRoot').innerHTML`);
if(w1.includes("openSysUrl(") && w1.includes('智慧学工') && w1.includes('wizGot'))
  pass('第 ① 步：可点「打开智慧学工」+ 勾选「已存好」');
else fail('第 ① 步缺可点按钮');
R(`openOnboarding(2);`);
if(R(`$('modalRoot').innerHTML`).includes('综合教务系统')) pass('第 ② 步：可点「打开综合教务系统」');
else fail('第 ② 步异常');
R(`openOnboarding(3);`);
if(R(`$('modalRoot').innerHTML`).includes('openImport()')) pass('第 ③ 步：可点「现在导入学生表」直达导入框');
else fail('第 ③ 步缺导入按钮');
R(`openOnboarding(4);`);
if(R(`$('modalRoot').innerHTML`).includes('openGradeImport()')) pass('第 ④ 步：可点「现在导入成绩单」直达成绩导入');
else fail('第 ④ 步缺导入按钮');
// ⑥ 进度清单：勾一份、另一份仍是空的
R(`openOnboarding(0); wizGot('student');`);
const wc = R(`$('modalRoot').innerHTML`);
if(wc.includes('ck-li on') && /学生基本信息表/.test(wc) && /专业成绩单/.test(wc))
  pass('进度清单：已存好的那份打勾，另一份留空');
else fail('进度清单未按状态渲染');
// ⑦ 重看整份引导时必须清掉旧的勾（否则用户以为已经做过了）
R(`openOnboarding(0);`);
if(R('S._wizGotStudent') === false && R('S._wizGotGrade') === false) pass('从第 0 步重看：进度清单重置');
else fail('重看时清单未重置');
// ⑧ 走完 / 跳过都置位 guideSeen 并落盘
R(`openOnboarding(0); finishOnboarding(true);`);
if(R('S.guideSeen') === true) pass('跳过引导 → guideSeen 置位（不再打扰）');
else fail('guideSeen 未置位');
if(JSON.parse(R(`__store.get(${JSON.stringify(R('STORE_KEY'))})`) || '{}').guideSeen === true)
  pass('guideSeen 已落盘');
else fail('guideSeen 未落盘');
// ⑨ 新用户仍会看到引导；老数据（无该字段）不打扰 —— 源码级断言
if(/if\(!S\.guideSeen\) setTimeout\(\(\)=>\{ if\(!S\.guideSeen\) openOnboarding\(\); \}, 420\)/.test(html))
  pass('新用户：进入应用后自动弹一次引导');
else fail('自动弹引导的条件被改动');
if(html.includes('S.guideSeen = d.guideSeen === undefined ? true : !!d.guideSeen'))
  pass('老数据无 guideSeen 字段 → 视为看过（不打扰老用户）');
else fail('老数据兼容逻辑被改动');

console.log('\n[6.95] v1.9：宿舍查寝卫生打分表（A4 横版）');
// ① 默认值
const dcDef = R('dormCheckDefaults()');
if(dcDef.items.length === 8 && dcDef.full === 10 && dcDef.withNames === true && dcDef.scope === 'view')
  pass('打分表默认：8 项打分 × 每项 10 分 / 打印名单 / 当前筛选');
else fail('打分表默认值异常：' + JSON.stringify(dcDef));
if(R(`S.profile.name`) === '吴章凡' || dcDef.checker === R(`S.profile.name`))
  pass('检查人默认取个人中心姓名');
else fail('检查人未取个人中心姓名');
// ② 让宿舍页处于「全部宿舍」状态，作为导出基数
R(`gotoDorm();`);
const dormRows = R(`dormView().length`);
const dormAll  = R(`dormRooms(S.students).filter(r=>r.key!=='').length`);
if(dormRows > 0 && dormAll >= dormRows) pass(`宿舍看板可导出基数：当前筛选 ${dormRows} 间 / 全部 ${dormAll} 间`);
else fail(`宿舍基数异常：rows=${dormRows} all=${dormAll}`);
// ③ 宿舍看板卡片头必须有导出按钮
if(R(`$('mainArea').innerHTML`).includes('openDormCheckExport()') && R(`$('mainArea').innerHTML`).includes('🖨 查寝打分表'))
  pass('宿舍看板卡片头：🖨 查寝打分表按钮');
else fail('宿舍看板缺打分表按钮');
// ④ 弹窗：范围切换显示两个数量
R(`dormCheckOpt = null; openDormCheckExport();`);
const m19 = R(`$('modalRoot').innerHTML`);
if(m19.includes('A4') && m19.includes('横向') && m19.includes('当前筛选') && m19.includes('本批全部'))
  pass('导出弹窗：标题/日期/检查人/打分项/范围/名单开关齐全，并说明 A4 横向');
else fail('打分表弹窗渲染异常');
// ⑤ 生成独立打印页：A4 横向 + 表头重复 + 列数与项数对齐
const o19 = Object.assign(R('dormCheckDefaults()'), { scope:'all', title:'测试打分表', date:'2026-09-22', checker:'吴章凡' });
R(`dormCheckOpt = ${JSON.stringify(o19)};`);
const dcHtml = R(`buildDormCheckHtml(dormCheckOpt)`);
if(dcHtml.includes('@page { size: A4 landscape;')) pass('打印页声明 A4 横向（A4 landscape）');
else fail('打印页未声明 A4 横向');
if(dcHtml.includes('display:table-header-group')) pass('每页表头自动重复'); else fail('表头未设置重复');
if(dcHtml.includes('window.print()')) pass('打印页自带「打印」按钮'); else fail('打印页缺打印按钮');
const colN = (dcHtml.match(/<col /g) || []).length;
const wantColN = 3 + 1 + 1 + 8 + 2;      // 序号/楼/房 + 名单 + 人数 + 8 项 + 总分/备注
if(colN === wantColN) pass(`列数 ${colN} 与「8 项打分 + 名单」对齐`);
else fail(`列数错：${colN}，应为 ${wantColN}`);
const rowN = (dcHtml.match(/<tr>\s*<td class="c idx"/g) || []).length;
if(rowN === dormAll) pass(`行数 ${rowN} = 本批全部宿舍数`);
else fail(`行数错：${rowN}，应为 ${dormAll}`);
// ⑤b 「本批全部」必须按楼栋+房号自然序（打印表顺序乱了会漏查）
const sheetRooms = (dcHtml.match(/<td class="c room">([^<]*)<\/td>/g) || []).map(m=>m.replace(/<[^>]*>/g,''));
const sortedRooms = sheetRooms.slice().sort((a,b)=>String(a).localeCompare(String(b),'zh',{numeric:true}));
if(sheetRooms.length === dormAll && sheetRooms.join('|') === sortedRooms.join('|'))
  pass('本批全部：按房号自然序排列（101 → 102 → …）');
else fail('打印表房号未排序：' + sheetRooms.slice(0,6).join('、'));
// ⑥ 姓名列不能被裁：不能 overflow:hidden，且每位学生是一个不可断开的标签
if(/td\.names \{[^}]*\}/.test(dcHtml) && !/td\.names \{[^}]*overflow:hidden/.test(dcHtml)
   && /td\.names \.nm \{[^}]*white-space:nowrap/.test(dcHtml)
   && dcHtml.includes('<td class="names">') && !dcHtml.includes('<td class="c names">'))
  pass('住宿人员列：不裁名字，姓名按「不可断开标签」整组换行');
else fail('住宿人员列可能裁剪姓名或把「(4床)」劈成两行');
// ⑦ 多人间（真实场景）每个人都得出现；演示数据每间 1 人，这里补 3 名舍友造一个 4 人间
R(`S.students.push(
  {'姓名1':'欧阳志远','学号':202625429001,'宿舍楼':'100栋','房间号':'101','床位号':2,'性别':'男','班级':'金融2401'},
  {'姓名1':'司马海棠','学号':202625429002,'宿舍楼':'100栋','房间号':'101','床位号':3,'性别':'男','班级':'金融2401'},
  {'姓名1':'上官云清','学号':202625429003,'宿舍楼':'100栋','房间号':'101','床位号':4,'性别':'男','班级':'金融2401'}
);`);
const o19full = Object.assign({}, o19, { scope:'view' });
R(`dormCheckOpt = ${JSON.stringify(o19full)};`);
const dcFull = R(`buildDormCheckHtml(dormCheckOpt)`);
const room4 = ['方雨涵','欧阳志远','司马海棠','上官云清'];
const miss4 = room4.filter(n => !dcFull.includes(n));
if(miss4.length === 0) pass('4 人间：4 位住宿人员姓名全部落表（不被裁掉）');
else fail('4 人间有成员姓名缺失：' + miss4.join('、'));
R(`S.students.length -= 3;`);
// ⑧ 关掉名单 → 名单列与列宽一起消失
const o19b = Object.assign({}, o19, { withNames:false });
R(`dormCheckOpt = ${JSON.stringify(o19b)};`);
const dcNoName = R(`buildDormCheckHtml(dormCheckOpt)`);
if(!dcNoName.includes('<th>住宿人员</th>') && !dcNoName.includes('width:45mm')
   && (dcNoName.match(/<col /g)||[]).length === wantColN - 1)
  pass('取消「打印名单」→ 名单列与列宽同步移除');
else fail('取消名单后列未同步');
// ⑨ 自定义打分项与满分联动
const o19c = Object.assign({}, o19, { items:['地面','床铺','违规电器'], full:5 });
R(`dormCheckOpt = ${JSON.stringify(o19c)};`);
const dcC = R(`buildDormCheckHtml(dormCheckOpt)`);
if(dcC.includes('违规电器') && dcC.includes('满分 15 分') && (dcC.match(/<col /g)||[]).length === 3+1+1+3+2)
  pass('自定义 3 项 × 5 分 → 表头/列数/满分合计全部联动');
else fail('自定义打分项未联动');
// ⑩ 浏览器版导出走 window.open，不静默失败
opened.length = 0;
R(`dormCheckOpt = null;`);
R(`window.__toastMsg = null; var _t2 = toast; toast = function(m){ window.__toastMsg = m; }; doDormCheckExport();`);
if(opened.length === 1 && String(opened[0]).startsWith('blob:')) pass('浏览器版：新标签页打开打印页（blob）');
else fail('浏览器版导出未开新页：' + JSON.stringify(opened));
// ⑪ 打分项被清空时必须拦住
R(`dormCheckOpt = Object.assign(dormCheckDefaults(), { items:[] }); window.__toastMsg = null; doDormCheckExport();`);
if(String(R('window.__toastMsg')).includes('打分项')) pass('打分项为空 → 拦住并提示');
else fail('空打分项未被拦截');
R(`toast = _t2; dormCheckOpt = null;`);
// ⑫ 桌面版导出链路：写下载目录 → 自动打开（外壳命令必须都在）
['save_to_downloads', 'open_local_file'].forEach(cmd => {
  if(html.includes(`'${cmd}'`)) pass('导出链路已调用外壳命令：' + cmd); else fail('缺少外壳命令调用：' + cmd);
});

console.log('\n[6.97] 演示数据的床位编组（v1.9）');
/* 内置样例 80 人原本各占一间房 → 宿舍看板「80 间每间 1 人」、室友列全空、查寝表满屏 1 人房间。
   demoDorms 按性别编成 2~4 人/间；这里把编组结果统计成纯量再断言。 */
R(`window.__demoSum = (function(){
  var demo = demoDorms(SEED_DATA.map(function(d){ return Object.assign({}, d); }));
  var deco = decorateDemo(demo);
  var m = new Map();
  demo.forEach(function(s){ var k = dormKey(s); if(!m.has(k)) m.set(k, []); m.get(k).push(s); });
  var rooms = [...m.values()];
  return {
    rooms: rooms.length,
    min: Math.min.apply(null, rooms.map(function(r){ return r.length; })),
    max: Math.max.apply(null, rooms.map(function(r){ return r.length; })),
    mixed: rooms.filter(function(r){ return new Set(r.map(function(s){ return String(s['性别']); })).size > 1; }).length,
    matesNull: deco.filter(function(s){ return !s['室友']; }).length,
    bedsOk: rooms.every(function(r){
      var bs = r.map(function(s){ return bedNo(s); }).sort(function(a,b){ return a-b; });
      return bs.every(function(b, i){ return b === i + 1; });
    })
  };
})();`);
const ds = R('window.__demoSum');
if(ds.rooms >= 15 && ds.rooms <= 40) pass(`演示学生编成 ${ds.rooms} 间房（原本 80 间，每间 1 人）`);
else fail(`演示房间数异常：${ds.rooms}`);
if(ds.min >= 2 && ds.max <= 4) pass(`每间 ${ds.min}~${ds.max} 人（真实寝室规模）`);
else fail(`每间人数异常：${ds.min}~${ds.max}`);
if(ds.mixed === 0) pass('没有男女混寝');
else fail(`有 ${ds.mixed} 间男女混寝`);
if(ds.bedsOk === true) pass('床位号从 01 床连续编号');
else fail('床位号不连续');
if(ds.matesNull === 0) pass('「室友」列不再全空（按同宿舍推导）');
else fail(`仍有 ${ds.matesNull} 人室友列是空的`);
const demoSeedN = html.split('decorateDemo(demoDorms(SEED_DATA.map').length - 1;
if(demoSeedN === 2) pass('首次安装与「恢复演示数据」两条路径都走同一份编组逻辑');
else fail(`编组逻辑接入点数量异常：${demoSeedN}（应为 2）`);

setTimeout(()=>{
  if(R('window.__snapNull') === true) pass('快照缺失时复原降级为提示（readSnapshot 返回 null）');
  else fail('readSnapshot 异常: ' + R('window.__snapNull'));

  console.log('\n[7] 视图分流：内容页不依赖批次');
  R(`S.view = 'nav'; renderMain();`);
  const h2 = R(`$('mainArea').innerHTML`);
  if(h2.includes('校务导航')) pass('空批次假设下（有演示数据时跳过）renderMain 分支正常');
  else fail('renderMain 未走 nav 分支');

  console.log('\n────────────────────────');
  if(failN === 0){ console.log('全部通过 ✅'); process.exit(0); }
  else { console.error(`失败 ${failN} 项 ❌`); process.exit(1); }
}, 800);

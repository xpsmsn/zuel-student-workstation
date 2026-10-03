/* ======== 数据安全提醒（v1.4 引入 · v1.9.6 重写降频） ========
   数据存在本机浏览器存储里：清浏览器缓存 / 重置应用 / 换电脑都会丢。
   旧版的问题：只要导入过数据且尚未备份，S.backupRemind 一直是 true，
   于是**每次导入都弹**，点「稍后再说」也没用 —— 用户反馈"太频繁、很打扰"。
   新版三层闸门（宁可少弹，也不打扰）：
   ① 总开关：系统设置 → 数据管理 → 「导入后提醒备份」，关了就永不弹（"上次备份"状态行照常显示）。
   ② 频率闸：弹过一次（含被关掉）→ 至少隔 7 天才可能再弹。
   ③ 必要性闸：从没备份过 → 该提醒；备份过但超过 30 天 → 该再提醒一次。 */
const BACKUP_REMIND_INTERVAL = 7 * 86400000;    // 两次提醒之间至少隔 7 天
const BACKUP_STALE_AFTER     = 30 * 86400000;   // 距上次备份超过 30 天 = 值得再提醒一次

function backupRemindDue(){
  if(S.backupRemindEnabled === false) return false;                     // ① 总开关
  if(Date.now() < (S.backupRemindSnoozeUntil || 0)) return false;       // ② 频率闸
  if(!S.lastBackupAt) return true;                                      // ③ 从没备份过
  const t = new Date(String(S.lastBackupAt).replace(/-/g, '/'));
  return isNaN(t) || (Date.now() - t.getTime()) > BACKUP_STALE_AFTER;   //    或太久没备了
}
function markDataChanged(){
  S.backupRemind = true;   // 旧字段保留（老数据兼容）；是否弹窗由 backupRemindDue() 决定
}
function showBackupRemind(){
  if(!backupRemindDue()) return;
  if(typeof document === 'undefined' || !document.body) return;   // 环境未就绪（异常调用）直接跳过
  if(_brMaskEl) return;   // 已在弹就不重复
  // 弹出即进入 7 天静默：无论之后点"稍后再说"还是直接关掉，都不会连着几天反复弹
  S.backupRemindSnoozeUntil = Date.now() + BACKUP_REMIND_INTERVAL;
  save();
  const mask = document.createElement('div');
  mask.id = 'brMask';
  mask.style.cssText = 'position:fixed;inset:0;z-index:9998;background:rgba(15,18,26,.6);display:flex;align-items:center;justify-content:center;padding:20px';
  mask.innerHTML = `
  <div style="background:var(--panel);border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow-md);max-width:430px;width:100%;padding:26px 26px 20px" onclick="event.stopPropagation()">
    <div style="font-size:16px;font-weight:680;margin-bottom:10px">🔐 数据安全提醒</div>
    <div style="font-size:13.2px;line-height:1.9;color:var(--text-2)">
      您的数据保存在<b style="color:var(--text)">本机浏览器存储</b>中——
      <b style="color:var(--warn)">清理浏览器缓存、重置应用或更换电脑，这些数据不会自动带走，可能全部丢失。</b><br>
      刚导入了新数据，建议现在就导出一份备份文件（一个 JSON，可随时导回）保存到 U 盘或网盘。<br>
      <span style="color:var(--text-3)">点「稍后再说」后 7 天内不会再弹；也可以在 系统设置 → 数据管理 里关掉这个提醒。</span>
    </div>
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px">
      <button class="btn" onclick="closeBackupRemind()">稍后再说</button>
      <button class="btn-primary" onclick="closeBackupRemind();openBackupRestore()">立即备份</button>
    </div>
  </div>`;
  mask.onclick = () => closeBackupRemind();
  _brMaskEl = mask;
  document.body.appendChild(mask);
}
let _brMaskEl = null;
function closeBackupRemind(){
  if(_brMaskEl && typeof _brMaskEl.remove === 'function') _brMaskEl.remove();
  _brMaskEl = null;
}
/* 导入成功后延时弹提醒：给导入完成弹窗留出展示时间。
   是否真的弹由 backupRemindDue() 决定（总开关 / 7 天频率闸 / 30 天必要性闸）。 */
function maybeBackupRemind(){
  if(!backupRemindDue()) return;
  setTimeout(showBackupRemind, 1200);
}
/* 系统设置 → 数据管理：「导入后提醒备份」开关 */
function toggleBackupRemind(){
  S.backupRemindEnabled = S.backupRemindEnabled === false;
  if(S.backupRemindEnabled === false) S.backupRemindSnoozeUntil = 0;   // 关了就清掉静默期，语义更直白
  save(); renderSettings();
  toast(S.backupRemindEnabled === false ? '已关闭备份提醒弹窗（"上次备份"状态仍会显示）' : '已开启备份提醒（最多每 7 天一次）');
}

/* ======== 系统设置 · 学期与周次（v1.5） ======== */
/* 取某天所在那一周的**周一**（周次一律以周一为界，避免周中校准产生半周偏移） */
function weekMonday(d){
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const w = x.getDay();               // 0=周日 … 6=周六
  x.setDate(x.getDate() - (w===0 ? 6 : w-1));
  return x;
}
function todayStrOf(d){ const t = d||new Date();
  const p = n => String(n).padStart(2,'0');
  return `${t.getFullYear()}-${p(t.getMonth()+1)}-${p(t.getDate())}`;
}
/* ★ 周次校准锚点（辅导员 2026-10-02 的主意）：
   按开学日算出来的是"理论周"，学校实际常因国庆/中秋/临时停课对不上。
   与其去猜假期规则，不如让辅导员**直接把本周改成正确的周数** ——
   系统记下「X 日那一周 = 第 N 周」这个锚点，往后每周自动 +1。
   以后再有变化（下一个假期、停课一周），再校准一次就行，周数永远是对的。 */
function weekAnchor(){
  const sem = S.semester || {};
  if(!sem.calAt || !sem.calWeek) return null;
  const a = new Date(String(sem.calAt) + 'T00:00:00');
  if(isNaN(a)) return null;
  return { mon: weekMonday(a), week: Number(sem.calWeek) || 1, at: String(sem.calAt) };
}
function semesterWeek(now){
  const sem = S.semester || {};
  const n = now ? new Date(now) : new Date();
  const weeks = Number(sem.weeks) || 18;
  const anchor = weekAnchor();
  if(anchor){
    /* 已校准：以锚点那一周为基准，隔几周就加几周 */
    const k = Math.round((weekMonday(n) - anchor.mon) / 7 / 86400000);
    return { raw: anchor.week + k, weeks, calibrated:true, anchorAt:anchor.at };
  }
  if(!sem.start) return null;
  const start = new Date(sem.start + 'T00:00:00');
  if(isNaN(start)) return null;
  const day = 86400000;
  const diff = Math.floor((new Date(n.getFullYear(),n.getMonth(),n.getDate()) - new Date(start.getFullYear(),start.getMonth(),start.getDate())) / day);
  return { raw: Math.floor(diff / 7) + 1, weeks, calibrated:false };
}
/* 把「本周」校正成第 N 周：锚点记在本周一，之后自动往后走 */
function calibrateWeek(n){
  const v = parseInt(n, 10);
  if(!isFinite(v)){ toast('请输入第几周'); return; }
  ensureSemesterObj();
  S.semester.calAt   = todayStrOf(weekMonday(new Date()));   // 锚在**本周一**，周中哪天校都一样
  S.semester.calWeek = v;
  save();
  closeModal();
  renderTopbarWeek();
  if(S.view === 'settings') renderSettings();
  toast(`本周已校正为第 ${v} 周，下周起自动顺延`);
}
function clearWeekCalibration(){
  ensureSemesterObj();
  if(!S.semester.calAt){ toast('当前没有校正记录'); return; }
  S.semester.calAt = null; S.semester.calWeek = null;
  save();
  closeModal();
  renderTopbarWeek();
  if(S.view === 'settings') renderSettings();
  toast('已取消校正，恢复按开学日期推算');
}
function ensureSemesterObj(){
  if(!S.semester || typeof S.semester !== 'object'){
    S.semester = { name:'', start:'', weeks:18 };
  }
}
/* 点顶栏周数 → 快速校正 */
function openWeekCalibrate(){
  const sem = S.semester || {};
  const w = semesterWeek();
  if(!w){ gotoSettings(); return; }
  const cur = w.raw;
  $('modalRoot').innerHTML = `
  <div class="mask" onclick="if(event.target===this)closeModal()">
    <div class="modal" onclick="event.stopPropagation()" style="max-width:420px">
      <div class="modal-head"><div class="modal-title">校正当前周次</div>
        <div class="modal-close" onclick="closeModal()">×</div></div>
      <div class="modal-body">
        <div style="font-size:13px;color:var(--text-2);line-height:1.8;margin-bottom:12px">
          按<b>开学日期</b>算，本周是<b>第 ${cur} 周</b>${w.calibrated?`（已按 ${esc(w.anchorAt||'')} 那次校正推算）`:''}。<br>
          如果学校实际的周次对不上（国庆中秋放假、临时停课、运动会冲掉课等），
          直接把本周改成正确的周数 —— <b>下周起自动 +1</b>，以后再有变化再改一次就行。
        </div>
        <div class="field">
          <label>本周实际是第几周</label>
          <input class="input" type="number" id="calWeekInput" min="1" max="60" style="width:120px" value="${cur}">
        </div>
        ${w.calibrated ? `<div style="font-size:12.3px;color:var(--text-3);margin-top:8px">
          已有校正：${esc(w.anchorAt)} 那周 = 第 ${esc(String(sem.calWeek))} 周。
          <a style="color:var(--brand);cursor:pointer" onclick="clearWeekCalibration()">取消校正</a>
        </div>` : ''}
      </div>
      <div class="modal-foot">
        <button class="btn" onclick="closeModal()">取消</button>
        <button class="btn" onclick="gotoSettings()">改学期信息</button>
        <button class="btn pri" onclick="calibrateWeek($('calWeekInput').value)">按此校正</button>
      </div>
    </div>
  </div>`;
}
function renderTopbarWeek(){
  const el = $('weekChip');
  if(!el) return;
  const sem = S.semester || {};
  const t = new Date();
  const dateStr = `${t.getMonth()+1}月${t.getDate()}日 周${'日一二三四五六'[t.getDay()]}`;
  const w = semesterWeek();
  let seg = '';
  if(w && sem.name){
    if(w.raw < 1) seg = '<span style="color:var(--text-3)">未开学</span>';
    else if(w.raw > w.weeks) seg = '<span style="color:var(--text-3)">假期中</span>';
    else seg = `<span class="wk-sem">${esc(sem.name)}</span><span class="wk-dot" style="opacity:.45">·</span><b>第 ${w.raw} 周</b>`
             + (w.calibrated ? '<span title="已手动校正过，往后自动顺延" style="font-size:11px;opacity:.6"> ✎</span>' : '');
  }
  el.innerHTML = `<span class="week-date">${esc(dateStr)}</span>${seg ? '<span class="week-date" style="opacity:.45">｜</span>' + seg : ''}`;
  el.title = w && w.calibrated
    ? `当前周次已校正（${w.anchorAt} 那周 = 第 ${sem.calWeek} 周）· 点击可重新校正`
    : '当前学期与周次 · 点击可校正周数（放假/停课导致对不上时）';
  syncThemeUI(S.theme || 'light');   // v1.6：显示模式按钮状态跟着初始化一次
}
function gotoSettings(){ S.view = 'settings'; renderSidebar(); renderMain(); closeSidebar(); }

/* v1.9.7 顶栏「⋯」菜单：导出 / 备份 / 批次管理 / 系统设置 等不常点的入口。
   点击外侧关闭菜单；点菜单项后自动关闭。 */
function toggleTopMenu(ev){
  if(ev) ev.stopPropagation();
  const m = $('topMenu');
  if(m){ closeTopMenu(); return; }
  const btn = ev && ev.currentTarget ? ev.currentTarget : $('moreMenuBtn');
  const rect = btn.getBoundingClientRect();
  const items = [
    { icon:'⬇',  label:'导出当前结果（CSV）',     act:"exportData(); closeTopMenu();" },
    { icon:'📊', label:'导出 Excel（维护用）', act:"exportDataXlsx(); closeTopMenu();" },
    { sep:true },
    { icon:'📂', label:'导出当前批次全部',        act:"if(activeBatch()){exportBatchCsv(activeBatch()); closeTopMenu();}else toast('当前没有批次');" },
    { sep:true },
    { icon:'📜', label:'备份历史',                 act:"gotoBackupHistory(); closeTopMenu();" },
    { icon:'🕘', label:'导入历史（可复原）',        act:"gotoImportLog(); closeTopMenu();" },
    { icon:'💾', label:'导出完整备份（.json）',     act:"exportBackupFile(); closeTopMenu();" },
    { icon:'📁', label:'打开备份文件夹',            act:"openDownloadsFolder(); closeTopMenu();" },
    { sep:true },
    { icon:'📋', label:'批次管理',                  act:"openBatchManager(); closeTopMenu();" },
    { icon:'⚙',  label:'系统设置',                  act:"gotoSettings(); closeTopMenu();" }
  ];
  const html = `<div class="dropdown-menu top-menu" id="topMenu" style="position:fixed;top:${rect.bottom+6}px;right:${Math.max(8, window.innerWidth - rect.right)}px;z-index:9000">
    ${items.map(it => it.sep
      ? '<div class="dd-sep"></div>'
      : `<div class="dd-item" onclick="${it.act.replace(/"/g,'&quot;')}"><span class="dd-i">${it.icon}</span><span>${it.label}</span></div>`
    ).join('')}
  </div>`;
  const root = document.createElement('div');
  root.innerHTML = html;
  document.body.appendChild(root.firstChild);
  setTimeout(() => document.addEventListener('click', closeTopMenu, { once:true }), 0);
}
function closeTopMenu(){
  const m = $('topMenu');
  if(m) m.remove();
}

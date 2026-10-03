/* ================= v1.8 · 运行偏好（金句 / 托盘常驻 / 开机启动） =================
   这三项都是「只有桌面壳做得到」的能力，浏览器里点了要给出明确说明，不能默默无反应。 */
function isDesktopApp(){ return !!(window.__TAURI__ && window.__TAURI__.core); }

function setQuoteAuto(v){
  S.quoteAuto = !!v; save(); restartQuoteRotation(); syncQuoteSeg();
  toast(S.quoteAuto ? '顶栏金句已开启自动轮换' : '顶栏金句已停止自动轮换（仍可点击手动换）');
}
function setQuoteSec(v){
  const n = Math.min(Math.max(Math.round(Number(v) || 5), 3), 120);
  S.quoteSec = n; save(); restartQuoteRotation();
  toast(`金句轮换间隔已设为 ${n} 秒`);
}
/* 开关与间隔只改按钮状态，不整页重绘 —— 学期输入框里没保存的字不会被冲掉 */
function syncQuoteSeg(){
  const on = S.quoteAuto !== false;
  document.querySelectorAll('[data-quote-auto]').forEach(b=>{
    b.classList.toggle('on', (b.getAttribute('data-quote-auto') === '1') === on);
  });
  const sel = $('quoteSecSel'); if(sel) sel.disabled = !on;
}

function setTrayMin(v){
  S.trayMin = !!v; save(); syncTraySeg();
  if(!isDesktopApp()){ toast('浏览器版没有系统托盘，请用桌面版（绿色版 / 安装版）'); return; }
  tauriInvoke('set_tray_minimize', { enable: S.trayMin });
  toast(S.trayMin ? '已开启：点关闭时缩到托盘继续运行' : '已关闭：点关闭即退出程序');
}
function syncTraySeg(){
  const on = S.trayMin !== false;
  document.querySelectorAll('[data-tray-min]').forEach(b=>{
    b.classList.toggle('on', (b.getAttribute('data-tray-min') === '1') === on);
  });
}
function hideToTray(){
  if(!isDesktopApp()){ toast('浏览器版没有系统托盘，请用桌面版'); return; }
  tauriInvoke('hide_to_tray');
  toast('已缩到系统托盘 —— 左键单击托盘图标即可唤回');
}
function setAutoStart(v){
  if(!isDesktopApp()){ toast('浏览器版不支持开机启动，请用桌面版'); return; }
  const r = tauriInvoke('set_autostart', { enable: !!v });
  if(!r){ toast('调用失败：桌面外壳未响应'); return; }
  Promise.resolve(r).then(()=>{
    S.autoStart = !!v; save(); syncAutoSeg();
    toast(S.autoStart ? '已设为开机自动启动' : '已取消开机自动启动');
  }).catch(e=>{ toast('设置失败：' + ((e && e.message) || e)); });
}
function syncAutoSeg(){
  const on = !!S.autoStart;
  document.querySelectorAll('[data-auto-start]').forEach(b=>{
    b.classList.toggle('on', (b.getAttribute('data-auto-start') === '1') === on);
  });
}
/* 打开设置时，用系统里的真实状态校准开关（用户可能在系统设置里改过） */
function syncAutoStart(){
  if(!isDesktopApp()) return;
  const r = tauriInvoke('is_autostart');
  if(!r) return;
  Promise.resolve(r).then(on=>{ S.autoStart = !!on; syncAutoSeg(); }).catch(()=>{});
}
/* 进应用时把「托盘常驻」偏好同步给外壳（不打开设置页也要生效） */
function applyDesktopPrefs(){
  if(!isDesktopApp()) return;
  tauriInvoke('set_tray_minimize', { enable: S.trayMin !== false });
}

/* v1.6：打开导出文件夹（桌面版走系统资源管理器；浏览器版无此能力） */
function openDownloadsFolder(){
  if(window.__TAURI__ && window.__TAURI__.core){
    window.__TAURI__.core.invoke('open_downloads_dir')
      .then(()=>toast('已打开「下载」文件夹（备份与导出文件都在里面）'))
      .catch(e=>toast('打开失败：' + e));
  }else{
    toast('浏览器版无法打开系统文件夹，请用桌面版；导出文件一般在「下载」目录');
  }
}
/* 备份时间的人话提示：多久没备份了 */
function backupAgeText(){
  if(!S.lastBackupAt) return '还没有导出过备份';
  const t = new Date(String(S.lastBackupAt).replace(/-/g,'/'));
  if(isNaN(t)) return '上次备份：' + S.lastBackupAt;
  const days = Math.floor((Date.now() - t.getTime()) / 86400000);
  if(days <= 0) return '上次备份：今天 ' + S.lastBackupAt.slice(-8);
  if(days === 1) return '上次备份：昨天 · 已 1 天未备份';
  return `上次备份：${S.lastBackupAt} · 已 ${days} 天未备份`;
}

function renderSettings(){
  const sem = S.semester || { name:'', start:'', weeks:18 };
  const solid = !!(window.__TAURI__ && window.__TAURI__.core);
  const w = semesterWeek();
  const preview = w
    ? (w.raw < 1 ? '按此日期还没开学（第 1 周从开始日当周算起）'
      : w.raw > w.weeks ? `已超出 ${w.weeks} 周，显示「假期中」`
      : `按当前配置，今天是 <b style="color:var(--brand)">第 ${w.raw} 周</b> / 共 ${w.weeks} 周`
        + (w.calibrated ? `（已按 <b>${esc(w.anchorAt)}</b> 那次校正往后推算）` : ''))
    : '请先选择学期开始日期（第 1 周的周一）';
  const THEME_DESC = { light:'白天办公、教室投影', dark:'夜间值班、不刺眼', eye:'长时间看屏幕、柔和护眼' };
  $('mainArea').innerHTML = `
  <div class="page-head">
    <div><div class="page-title">系统设置</div>
    <div class="page-sub">外观 · 学期与周次 · 数据管理 · 数据固化 —— 个人资料在「个人中心」</div></div>
    <button class="btn" onclick="gotoProfile()">个人中心 →</button>
  </div>

  <div class="card" style="margin-bottom:16px"><div class="card-body">
    <div style="font-weight:660;font-size:14.5px;margin-bottom:12px">📌 左侧「关注视图」显示哪些</div>
    <div class="opt-row">
      <div class="opt-l">
        <div class="opt-t">本批暂时用不了的视图</div>
        <div class="opt-d">例如还没导成绩表时的「有不及格」「绩点偏低」。收起后侧栏只留一行提示（点它能看是哪几个），不占地方</div>
      </div>
      <div class="opt-c">
        <div class="seg">
          <button class="${S.hideUnavailable!==false?'on':''}" onclick="setHideUnavailable(true)">收起</button>
          <button class="${S.hideUnavailable===false?'on':''}" onclick="setHideUnavailable(false)">显示为灰色</button>
        </div>
      </div>
    </div>
    <div style="display:flex;align-items:baseline;gap:10px;margin:10px 0 6px;flex-wrap:wrap">
      <span style="font-size:12.5px;color:var(--text-2)">点一下切换（灰 = 不显示；虚线 = 本批用不了，悬停看原因）</span>
      <span style="flex:1"></span>
      <button class="btn" style="padding:2px 8px;font-size:12px" onclick="showAllPresets(true)">全选</button>
      <button class="btn" style="padding:2px 8px;font-size:12px" onclick="showAllPresets(false)">全不选</button>
    </div>
    <div class="preset-chips">
      ${PRESETS.filter(p=>p.id!=='all').map(p=>{
        const on = !isHiddenPreset(p.id), okA = presetAvailable(p);
        // 只有"本批用不了"的标签才挂 title（能用的没必要，也省字符）
        return `<button class="pchip${on?' on':''}${okA?'':' unavail'}"${
          okA ? '' : ` title="${esc(p.label)}：${esc(presetMissText(p))}"`} onclick="togglePresetVisible(${jsq(p.id)}, ${on?'false':'true'}, this)">${on?'✓ ':''}${esc(p.label)}</button>`;
      }).join('')}
    </div>
  </div></div>

  <div class="card" style="margin-bottom:16px"><div class="card-body">
    <div style="font-weight:660;font-size:14.5px;margin-bottom:12px">🎨 外观与主题</div>
    <div class="theme-pick">
      ${THEMES.map(t=>`<button class="theme-card ${S.theme===t.id?'on':''}" onclick="setTheme('${t.id}')">
        <span class="tc-ico">${t.icon}</span>
        <span class="tc-name">${t.label}模式</span>
        <span class="tc-desc">${THEME_DESC[t.id]}</span>
      </button>`).join('')}
    </div>
    <div class="opt-row" style="margin-top:6px">
      <div class="opt-l">
        <div class="opt-t">💬 顶栏金句自动轮换</div>
        <div class="opt-d">开启后按下面间隔自动换一句；鼠标停在金句上会暂停，移开继续</div>
      </div>
      <div class="opt-c">
        <div class="seg">
          <button data-quote-auto="1" class="${S.quoteAuto!==false?'on':''}" onclick="setQuoteAuto(true)">开</button>
          <button data-quote-auto="0" class="${S.quoteAuto===false?'on':''}" onclick="setQuoteAuto(false)">关</button>
        </div>
        <select id="quoteSecSel" class="input" style="width:auto;padding:6px 8px"
          ${S.quoteAuto===false?'disabled':''} onchange="setQuoteSec(this.value)">
          ${[3,5,10,15,30,60].map(s=>`<option value="${s}" ${Number(S.quoteSec||5)===s?'selected':''}>${s} 秒</option>`).join('')}
        </select>
      </div>
    </div>
  </div></div>

  <!-- v1.8：托盘常驻 + 开机启动 -->
  <div class="card" style="margin-bottom:16px"><div class="card-body">
    <div style="font-weight:660;font-size:14.5px;margin-bottom:8px">🖥 常驻与开机启动</div>
    <div class="opt-row">
      <div class="opt-l">
        <div class="opt-t">最小化到系统托盘</div>
        <div class="opt-d">开启后点窗口右上角「×」不退出，程序缩到托盘继续跑；左键单击托盘图标唤回，右键菜单可退出</div>
      </div>
      <div class="opt-c">
        <div class="seg">
          <button data-tray-min="1" class="${S.trayMin!==false?'on':''}" onclick="setTrayMin(true)">开</button>
          <button data-tray-min="0" class="${S.trayMin===false?'on':''}" onclick="setTrayMin(false)">关</button>
        </div>
        <button class="btn" onclick="hideToTray()">立即缩到托盘</button>
      </div>
    </div>
    <div class="opt-row">
      <div class="opt-l">
        <div class="opt-t">开机自动启动</div>
        <div class="opt-d">开机登录后自动在后台启动，直接缩在托盘里不弹窗（写入当前用户的「启动」目录，不需要管理员权限）</div>
      </div>
      <div class="opt-c">
        <div class="seg">
          <button data-auto-start="1" class="${S.autoStart?'on':''}" onclick="setAutoStart(true)">开</button>
          <button data-auto-start="0" class="${!S.autoStart?'on':''}" onclick="setAutoStart(false)">关</button>
        </div>
      </div>
    </div>
    ${isDesktopApp() ? '' : `<div style="font-size:12.3px;color:var(--text-3);margin-top:10px">
      当前在浏览器中打开，上面两项需要桌面版（绿色版 / 安装版）才生效。</div>`}
  </div></div>

  <div class="card" style="margin-bottom:16px"><div class="card-body">
    <div style="font-weight:660;font-size:14.5px;margin-bottom:12px">📅 学期与周次</div>
    <div class="sem-grid">
      <div><div class="lbl">学期名称（顶栏显示）</div>
        <input class="input" id="setName" style="width:100%" value="${esc(sem.name||'')}" placeholder="如：2026-2027 学年第一学期"></div>
      <div><div class="lbl">第 1 周开始日期（周一）</div>
        <input class="input" id="setStart" type="date" style="width:100%" value="${esc(sem.start||'')}"></div>
      <div><div class="lbl">本学期总周数</div>
        <input class="input" id="setWeeks" type="number" min="1" max="30" style="width:100%" value="${Number(sem.weeks)||18}"></div>
      <div><div class="lbl">效果预览</div>
        <div id="setPreview" style="font-size:12.8px;color:var(--text-2);padding:8px 0">${preview}</div></div>
    </div>
    <div style="margin-top:14px"><button class="btn-primary" style="width:auto;padding:0 26px;margin-top:0" onclick="saveSemester()">保存学期信息</button></div>

    <!-- 周次校正：放假/停课让周数对不上时，直接把本周改成正确的，往后自动顺延 -->
    <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--line)">
      <div style="font-weight:620;font-size:13.2px;margin-bottom:6px">🎯 周次校正</div>
      <div style="font-size:12.5px;color:var(--text-3);line-height:1.8;margin-bottom:10px">
        国庆中秋放假、临时停课、运动会冲课……都可能让"按开学日算的周数"和学校实际对不上。
        不用去配假期规则 —— 直接把<b>本周</b>改成正确的周数，系统记下这个锚点，
        <b>下周起自动 +1</b>；以后再有变化，再改一次就行。
      </div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <span style="font-size:12.8px;color:var(--text-2)">本周是第</span>
        <input class="input" type="number" id="calWeekSet" min="1" max="60" style="width:90px"
               value="${w ? w.raw : ''}">
        <span style="font-size:12.8px;color:var(--text-2)">周</span>
        <button class="btn" onclick="calibrateWeek($('calWeekSet').value)">按此校正</button>
        ${w && w.calibrated
          ? `<span style="font-size:12.3px;color:var(--text-3)">已校正：${esc(w.anchorAt)} 那周 = 第 ${esc(String(sem.calWeek))} 周</span>
             <a style="font-size:12.3px;color:var(--brand);cursor:pointer" onclick="clearWeekCalibration()">取消校正</a>`
          : `<span style="font-size:12.3px;color:var(--text-3)">当前按开学日期推算，尚未校正</span>`}
      </div>
    </div>
  </div></div>

  <!-- v1.9.7.1：数据管理按「你要干什么」分三组，不再把 10 个入口平铺 ——
       原来的「完整备份 / 从备份恢复」其实正是「备份与恢复」弹窗里的两个按钮，
       「备份文件夹」「备份历史」也属同一件事：四个入口收成一个，页面才不糊。
       「数据固化」原来单独占一张卡片，和「导入历史」并排看着像两套重复机制，
       现在降级成一行状态说明，并写明"这不是备份、带不走"。 -->
  <div class="card" style="margin-bottom:16px"><div class="card-body">
    <div style="font-weight:660;font-size:14.5px;margin-bottom:12px;display:flex;align-items:center;gap:8px">
      📦 数据管理
      <span style="font-weight:400;font-size:12px;color:${S.lastBackupAt ? 'var(--text-3)' : 'var(--warn)'};margin-left:auto">${esc(backupAgeText())}</span>
    </div>

    <div class="dm-group">
      <div class="dm-group-t">① 把数据取进来</div>
      <div class="ops-grid ops-grid-6">
        <button class="op" onclick="gotoGuide()"><span class="op-i">🧭</span><span class="op-t">导入指引</span><span class="op-d">不知道从哪导先看</span></button>
        <button class="op" onclick="openImport()"><span class="op-i">⬇</span><span class="op-t">导入数据</span><span class="op-d">学生表 / 成绩表都认</span></button>
        <button class="op" onclick="${hasGrade() ? openImport('成绩表：按学号绑到学生上，不会动学生档案') : openImport('成绩要按学号绑到学生上，所以要先有学生批次 —— 选一份学生信息表开始')}"><span class="op-i">📑</span><span class="op-t">补成绩</span><span class="op-d">${hasGrade()?(S.grades.length+' 条'):'需先有学生批次'}</span></button>
      </div>
    </div>

    <div class="dm-group">
      <div class="dm-group-t">② 备份与搬运 <span class="dm-group-s">能带走的都在这里（都导出到「下载」文件夹）</span></div>
      <div class="ops-grid ops-grid-6">
        <button class="op" onclick="openBackupRestore()"><span class="op-i">💾</span><span class="op-t">备份与恢复</span><span class="op-d">导出 .json / 还原 / 打开文件夹 / 备份清单</span></button>
        <button class="op" onclick="exportDataXlsx()"><span class="op-i">📊</span><span class="op-t">导出 Excel</span><span class="op-d">维护用，改完可导回</span></button>
      </div>
    </div>

    <div class="dm-group" style="margin-bottom:0">
      <div class="dm-group-t">③ 出问题回退 <span class="dm-group-s">本机自动存的，不用你管、但带不走</span></div>
      <div class="ops-grid ops-grid-6">
        <button class="op" onclick="gotoImportLog()"><span class="op-i">🕘</span><span class="op-t">导入历史</span><span class="op-d">${(S.importHistory||[]).length || 0} 条 · 可回退到导入前</span></button>
        <button class="op" onclick="openBatchManager()"><span class="op-i">📋</span><span class="op-t">批次管理</span><span class="op-d">${S.batches.length} 个批次</span></button>
      </div>
    </div>

    <div class="dm-auto">
      <span class="dm-auto-t">🛡 自动保护</span>
      ${solid
        ? `已开启 —— 每次保存都在本机应用数据目录留一份最新镜像（workstation-data.json），
           <b>清浏览器缓存 / 重装程序后打开会自动恢复</b>；导入前的快照也写在这里，供上面「导入历史」回退。
           <b>它不是备份：换电脑带不走</b>，要带走请用「备份与恢复」。
           <button class="btn" style="margin-left:6px;padding:2px 10px;font-size:12px" onclick="forceMirror()">立即固化一份</button>`
        : `当前在浏览器里打开，<b>自动保护未开启</b> —— 数据只存浏览器本地存储，清缓存会丢。
           用桌面版（绿色版 / 安装版）即可获得；或勤用「备份与恢复」导出文件。`}
    </div>

    <div style="margin-top:10px;padding-top:10px;border-top:1px dashed var(--line);display:flex;align-items:center;gap:10px;font-size:12.5px;color:var(--text-2)">
      <span style="flex-shrink:0">导入后提醒备份</span>
      <button class="btn" style="padding:3px 12px;font-size:12.5px" onclick="toggleBackupRemind()">${S.backupRemindEnabled===false?'已关闭（不再弹窗）':'已开启（最多每 7 天一次）'}</button>
      <span style="color:var(--text-3);font-size:11.5px">「上次备份」状态始终显示，不受开关影响</span>
    </div>
  </div></div>

  <div class="card"><div class="card-body">
    <div style="font-weight:660;font-size:14.5px;margin-bottom:10px">ℹ️ 关于</div>
    <div class="about-box">
      <div class="about-row"><span class="ak">软件</span><span class="av"><b>中南大学生工作台</b> · 本地单机运行，全程离线</span></div>
      <div class="about-row"><span class="ak">存储</span><span class="av">${S.batches.length} 个批次 · 全部数据仅存于本机${solid ? '（含磁盘镜像固化）' : ''}</span></div>
      <div class="about-row"><span class="ak">作者</span><span class="av"><b>吴章凡</b> · 企业微信或邮件
        <a href="mailto:wuzhangfan110@163.com">wuzhangfan110@163.com</a></span></div>
      <!-- v1.9.3：原来在「关于」里再放一份答疑机器人二维码（含复制链接按钮），已删。
           理由：① 桌面版用户就在「AI 助理」页，二维码在那里更好找，设置页再放一份是重复；
                 ② 那里的小图带边框，和 AI 页的大图观感不一致，看着像两个不同的东西。
           现在三张二维码 + 各自的「复制链接」都集中在「AI 助理」页，关于页只保留软件/存储/作者信息。 -->
      <div class="about-ver">${APP_VER}</div>
    </div>
  </div></div>`;
  syncAutoStart();          // v1.8：用系统里真实的开机启动状态校准开关
}
function saveSemester(){
  const name = ($('setName').value || '').trim() || '本学期';
  const start = $('setStart').value || '';
  const weeks = Math.min(Math.max(Math.round(Number($('setWeeks').value) || 18), 1), 30);
  if(!start){ toast('请选择第 1 周的开始日期（周一）'); return; }
  /* ★ 校正锚点要留着：改学期名称/开始日期不该把辅导员校正过的周次冲掉
     （改了开学日期之后若周数不对，他会再校正一次） */
  const prev = S.semester && typeof S.semester === 'object' ? S.semester : {};
  S.semester = { name, start, weeks, calAt: prev.calAt || null, calWeek: prev.calWeek || null };
  save(); renderTopbarWeek();
  const w = semesterWeek();
  const pv = $('setPreview');
  if(pv) pv.innerHTML = w
    ? (w.raw < 1 ? '按此日期还没开学（第 1 周从开始日当周算起）'
      : w.raw > w.weeks ? `已超出 ${weeks} 周，将显示「假期中」`
      : `按当前配置，今天是 <b style="color:var(--brand)">第 ${w.raw} 周</b> / 共 ${weeks} 周`)
    : '日期无效';
  toast('学期信息已保存，顶栏周次已更新');
}
function forceMirror(){
  if(!(window.__TAURI__ && window.__TAURI__.core)){ toast('浏览器版不支持磁盘固化，请用「备份与恢复」导出文件'); return; }
  clearTimeout(_mirrorTimer);
  window.__TAURI__.core.invoke('save_data_file', { name: DISK_MAIN, content: JSON.stringify(buildSavePayload()) })
    .then(()=>toast('已固化到磁盘 · 清缓存后下次打开自动恢复'))
    .catch(e=>toast('固化失败：' + e));
}

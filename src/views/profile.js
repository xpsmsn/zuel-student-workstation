/* ======== ⑤ 辅导员个人中心（v1.3） ========
   把「设置」弹层里的个人化功能整合成一页：个人信息（姓名/头像等）+ 外观 + 安全 + 数据。 */
function renderProfile(){
  const p = S.profile || {};
  const initial = (p.name || '辅').trim().charAt(0) || '辅';
  $('mainArea').innerHTML = `
  <div class="page-head">
    <div><div class="page-title">个人中心</div>
    <div class="page-sub">个人信息与常用设置 · 全部保存在本机</div></div>
  </div>
  <div class="card" style="margin-bottom:16px"><div class="card-body">
    <div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap">
      <div class="avatar-big" onclick="$('pfAvatar').click()" title="点击更换头像">
        ${p.avatar ? `<img src="${p.avatar}" alt="头像">` : initial}
      </div>
      <input type="file" id="pfAvatar" accept="image/*" style="display:none" onchange="pickAvatar(this)">
      <div style="flex:1;min-width:260px;display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div><div class="lbl">姓名</div>
          <input class="input" style="width:100%" value="${esc(p.name||'')}" placeholder="您的姓名"
            onchange="saveProfileField('name', this.value)"></div>
        <div><div class="lbl">学院 / 部门</div>
          <input class="input" style="width:100%" value="${esc(p.dept||'')}" placeholder="如：财政税务学院"
            onchange="saveProfileField('dept', this.value)"></div>
        <div><div class="lbl">联系电话</div>
          <input class="input" style="width:100%" value="${esc(p.phone||'')}" placeholder="方便写进通知模板里"
            onchange="saveProfileField('phone', this.value)"></div>
        <div><div class="lbl">负责班级</div>
          <input class="input" style="width:100%" disabled
            value="${[...new Set(S.students.map(s=>s['班级']).filter(Boolean))].join('、')||'（导入学生数据后自动带出）'}"></div>
      </div>
    </div>
    <div style="font-size:12px;color:var(--text-3);margin-top:10px">
      头像与姓名会用在通知短信模板、谈话记录等处（后续版本逐步打通）· 负责班级来自当前批次数据，导入后自动更新</div>
  </div></div>

  <div class="card"><div class="card-body">
    <div style="font-size:13px;color:var(--text-2);line-height:1.9">
      <b>找其他设置？</b>外观主题、学期周次、数据管理（导入 / 备份 / 历史 / 打开文件夹）都在
      <button class="btn" style="padding:3px 10px;font-size:12.5px" onclick="gotoSettings()">系统设置 →</button>
    </div>
    <div style="font-size:13px;color:var(--text-2);line-height:1.9;margin-top:8px">
      <b>第一次用 / 想再看一遍？</b>从校内系统导出到导入本工作台，一步步照着点就行 ——
      <button class="btn" style="padding:3px 10px;font-size:12.5px" onclick="openOnboarding(0)">🎬 重看新手引导</button>
    </div>
    <!-- v1.9.2：界面本身的"贴纸式"说明，随时可重看 -->
    <div style="font-size:13px;color:var(--text-2);line-height:1.9;margin-top:8px">
      <b>界面上每块东西是干什么的？</b>在界面上浮出一圈批注、逐块点给你看 ——
      <button class="btn" style="padding:3px 10px;font-size:12.5px" onclick="startTour()">🔎 重看页面导览</button>
    </div>
  </div></div>`;
}

function saveProfileField(k, v){
  S.profile = S.profile || { name:'',dept:'',phone:'',avatar:'' };
  S.profile[k] = String(v||'').trim();
  save();
  if(k === 'name') renderProfile();   // 名字变了，头像占位字母同步
  toast('已保存');
}

/* 头像：选图 → 等比缩到 160px → JPEG 压缩成 dataURL 存本机（避免撑爆本地存储） */
function pickAvatar(input){
  const f = input.files && input.files[0];
  if(!f) return;
  const reader = new FileReader();
  reader.onload = function(){
    const img = new Image();
    img.onload = function(){
      try{
        const cv = document.createElement('canvas');
        const side = Math.min(img.width, img.height);
        cv.width = 160; cv.height = 160;
        const ctx = cv.getContext('2d');
        ctx.drawImage(img, (img.width-side)/2, (img.height-side)/2, side, side, 0, 0, 160, 160);
        S.profile = S.profile || { name:'',dept:'',phone:'',avatar:'' };
        S.profile.avatar = cv.toDataURL('image/jpeg', 0.85);
        save(); renderProfile(); toast('头像已更新');
      }catch(e){ toast('头像处理失败，请换一张图片'); }
    };
    img.onerror = function(){ toast('图片读取失败'); };
    img.src = reader.result;
  };
  reader.readAsDataURL(f);
}

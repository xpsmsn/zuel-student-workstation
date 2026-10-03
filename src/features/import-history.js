/* ======== 导入历史与复原（v1.5） ========
   每次导入前拍全量快照：桌面版写磁盘（不受清缓存影响），浏览器版写 localStorage 兜底。
   「复原」= 回到该次导入之前的数据；复原前会自动再备份一份当前数据，绝不越复原越丢。 */
let _snapSeq = 0;
async function recordImport(type, file, stats, snapshot){
  const id = 'h' + Date.now().toString(36) + (++_snapSeq);
  const rec = { id, ts: new Date().toLocaleString('zh-CN', { hour12:false }),
    type, file: file || '（未记录文件名）', batch: stats.batch || '', batchId: stats.batchId || '',
    added: stats.added || 0, updated: stats.updated || 0, skipped: stats.skipped || 0,
    status: stats.status || '已生效', snap: null };
  const payload = JSON.stringify(snapshot);
  if(window.__TAURI__ && window.__TAURI__.core){
    try{
      await window.__TAURI__.core.invoke('save_data_file', { name: 'snap-' + id + '.json', content: payload });
      rec.snap = 'disk:snap-' + id + '.json';
    }catch(e){ console.warn('[历史] 快照写盘失败', e); }
  }
  if(!rec.snap){
    try{ localStorage.setItem('ws-snap-' + id, payload); rec.snap = 'local:ws-snap-' + id; }
    catch(e){ rec.snap = null; }   // 空间不足存不下：记录保留，复原按钮置灰
  }
  S.importHistory = [rec, ...(S.importHistory || [])];
  pruneOldSnapshots();          // v1.9.7.1：超出上限的旧快照要从磁盘一起删掉
  save(); renderSidebar();
}

/* v1.9.7.1：导入历史快照的自动清理。
   ⚠️ 原来只把列表截断到 30 条，**磁盘上的 snap-*.json 一份都不删**：
   用久了会在应用数据目录里堆下几十上百份完整数据副本（每份都是全部批次+成绩的 JSON），
   既占空间、又让"哪些快照还有用"无从判断。现在列表与磁盘同步，只保留最近 MAX_SNAPS 份。 */
const MAX_SNAPS = 20;
function pruneOldSnapshots(){
  const list = S.importHistory || [];
  if(list.length <= MAX_SNAPS) return;
  list.slice(MAX_SNAPS).forEach(rec=>{
    if(!rec || !rec.snap) return;
    if(rec.snap.startsWith('disk:') && window.__TAURI__ && window.__TAURI__.core){
      try{ window.__TAURI__.core.invoke('delete_data_file', { name: rec.snap.slice(5) }); }catch(e){}
    }else if(rec.snap.startsWith('local:')){
      try{ localStorage.removeItem(rec.snap.slice(7)); }catch(e){}
    }
  });
  S.importHistory = list.slice(0, MAX_SNAPS);
}

/* ======== 备份历史（v1.9.7） ========
   每次成功导出/自动备份一条记录：JSON 完整备份、覆盖批次前的 CSV 自动备份、手动导出 CSV。
   · 列表只展示文件名 + 时间 + 类型，不复制文件内容（文件一直在「下载」目录里）
   · 支持「在文件夹中显示」（资源管理器里高亮该文件）和「删除」（真从磁盘删）
   · 桌面版走 Rust 命令；浏览器版只展示记录，「在文件夹中显示」按钮置灰 */
function recordBackup({ type, fileName, batchName, batchId, bytes }){
  if(!fileName) return;
  // 同一文件名多次出现 = 真的生成了多份（重名 (1) (2) ...）—— 允许重复条目
  const rec = {
    id: 'b' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
    ts: new Date().toLocaleString('zh-CN', { hour12:false }),
    type,                              // 'json' | 'csv-auto' | 'csv-batch'
    fileName,                          // 在「下载」目录里的文件名（不含路径）
    batchName: batchName || '',        // 关联批次名（JSON 完整备份为空）
    batchId: batchId || '',            // 关联批次 id（JSON 完整备份为空）
    bytes: Number(bytes) || 0          // 文件字节数（仅桌面版有，浏览器版 0）
  };
  S.backupHistory = [rec, ...(S.backupHistory || [])].slice(0, 100);
  save();
}

function gotoBackupHistory(){ S.view = 'backuphistory'; renderSidebar(); renderMain(); closeSidebar(); }

async function readSnapshot(rec){
  if(!rec || !rec.snap) return null;
  try{
    if(rec.snap.startsWith('disk:')){
      if(!(window.__TAURI__ && window.__TAURI__.core)) return null;
      const raw = await window.__TAURI__.core.invoke('load_data_file', { name: rec.snap.slice(5) });
      return raw ? JSON.parse(raw) : null;
    }
    const raw = localStorage.getItem(rec.snap.slice(7));
    return raw ? JSON.parse(raw) : null;
  }catch(e){ return null; }
}
function gotoImportLog(){ S.view = 'importlog'; renderSidebar(); renderMain(); closeSidebar(); }
function renderImportLog(){
  const list = S.importHistory || [];
  const solid = !!(window.__TAURI__ && window.__TAURI__.core);
  const rows = list.length ? list.map(r=>`
    <tr>
      <td style="white-space:nowrap">${esc(r.ts||'')}</td>
      <td><span class="tag ${String(r.type||'').includes('成绩')?'orange':'blue'}">${esc(r.type||'')}</span></td>
      <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(r.file||'')}">${esc(r.file||'')}</td>
      <td>${esc(r.batch||'—')}</td>
      <td style="color:var(--brand);font-weight:640">${r.added||0}</td>
      <td style="color:var(--ok)">${r.updated||0}</td>
      <td>${r.skipped?`<span style="color:var(--danger)">${r.skipped}</span>`:'0'}</td>
      <td><span class="tag">${esc(r.status||'已生效')}</span></td>
      <td style="white-space:nowrap">
        <button class="btn" style="padding:3px 10px;font-size:12px" ${r.snap?'':'disabled title="快照缺失，无法复原"'}
          onclick="restoreImport('${r.id}')">复原</button>
        <button class="btn" style="padding:3px 8px;font-size:12px;color:var(--text-3)" title="删除记录"
          onclick="deleteImport('${r.id}')">✕</button>
      </td>
    </tr>`).join('')
    : `<tr><td colspan="9" style="text-align:center;padding:34px 0;color:var(--text-3);font-size:13px">
        还没有导入记录。每次导入学生数据或成绩后，这里会自动记一笔，并可一键复原到导入之前。</td></tr>`;
  $('mainArea').innerHTML = `
  <div class="page-head">
    <div><div class="u-title">导入历史</div>
    <div class="u-sub">每次导入自动留档 · 可一键复原到该次导入之前的状态</div></div>
    <span class="tag">${solid ? '本地固化：已开启（桌面版）' : '本地固化：未开启（浏览器版）'}</span>
  </div>
  <div class="u-card"><div class="u-card-body" style="overflow-x:auto">
    <table class="list-table"><thead><tr>
      <th>导入时间</th><th>类型</th><th>文件</th><th>批次</th>
      <th>新增</th><th>更新</th><th>异常</th><th>状态</th><th>操作</th>
    </tr></thead><tbody>${rows}</tbody></table>
    <div style="font-size:12px;color:var(--text-3);margin-top:10px">
      · 「复原」会把对应批次的数据回退到该次导入之前，复原前会自动把当前数据备份成 CSV，放心操作<br>
      ${solid ? '· 快照保存在应用数据目录的磁盘文件里，清浏览器缓存不影响' : '· 快照暂存浏览器本地存储（浏览器版能力有限），建议换用桌面版'}
    </div>
  </div></div>`;
}
async function restoreImport(hid){
  const rec = (S.importHistory||[]).find(x=>x.id===hid);
  if(!rec) return;
  const snap = await readSnapshot(rec);
  if(!snap){ toast('快照不存在或已被清理，无法复原'); return; }
  askConfirm({
    title:'复原到导入前',
    html:`将把数据回退到 <b>${esc(rec.ts)}</b>「${esc(rec.type)}」之前的状态。<br>
      <span style="font-size:12.5px;color:var(--text-3)">复原前会自动把当前数据备份成 CSV，放心操作。</span>`,
    okText:'复原',
    onOk(){
      try{ if(activeBatch()) exportBatchCsv(activeBatch(), true); }catch(e){}
      const b = S.batches.find(x=>x.id === snap.batchId);
      if(!b){ toast('原批次已删除，无法复原'); return; }
      if(snap.kind === 'students'){
        b.students = snap.students; b.studentCount = snap.students.length;
        if(S.activeBatchId === b.id){ S.students = b.students; invalidateGradeMap(); }
      }else if(snap.kind === 'grades'){
        b.grades = snap.grades;
        if(S.activeBatchId === b.id){ S.grades = b.grades; invalidateGradeMap(); }
      }else{ toast('快照类型未知，无法复原'); return; }
      save(); renderBatchBar(); renderSidebar(); renderMain();
      toast('已复原到导入前状态（复原前的数据已自动备份为 CSV）');
    }
  });
}
function deleteImport(hid){
  const rec = (S.importHistory||[]).find(x=>x.id===hid);
  if(!rec) return;
  askConfirm({
    title:'删除导入记录',
    html:`删除「${esc(rec.ts)}」这条记录？${rec.snap && rec.snap.startsWith('disk:')
      ? '<br><span style="font-size:12.5px;color:var(--text-3)">对应的快照文件也会一并删除，删除后无法再复原到该时间点。</span>'
      : ''}`,
    okText:'删除',
    danger:true,
    onOk(){
      if(rec.snap && rec.snap.startsWith('disk:') && window.__TAURI__ && window.__TAURI__.core){
        try{ window.__TAURI__.core.invoke('delete_data_file', { name: rec.snap.slice(5) }); }catch(e){}
      }
      if(rec.snap && rec.snap.startsWith('local:')){ try{ localStorage.removeItem(rec.snap.slice(7)); }catch(e){} }
      S.importHistory = (S.importHistory||[]).filter(x=>x.id!==hid);
      save(); renderImportLog(); renderSidebar();
      toast('记录已删除');
    }
  });
}

/* ======== 备份历史（v1.9.7） ========
   列出历次导出的备份文件（JSON 完整备份、覆盖批次前的 CSV 自动备份、手动导出批次 CSV）。
   备份文件本身一直在「下载」目录里 —— 这里只展示清单和提供"快速跳到那个文件"的入口。
   · 「在文件夹中显示」= 文件资源管理器里高亮该文件（桌面版）/ 仅打开目录（浏览器版）
   · 「删除」= 真从磁盘删（仅桌面版可执行，浏览器版置灰） */
function renderBackupHistory(){
  const list = S.backupHistory || [];
  const solid = !!(window.__TAURI__ && window.__TAURI__.core);
  const rows = list.length ? list.map(r => {
    const typeLab = r.type === 'json' ? 'JSON 完整备份'
      : r.type === 'csv-auto' ? 'CSV 自动备份'
      : r.type === 'csv-batch' ? 'CSV 批次导出'
      : r.type || '备份';
    const typeColor = r.type === 'json' ? 'blue'
      : r.type === 'csv-auto' ? 'orange'
      : 'green';
    const sizeTxt = r.bytes ? ` · ${(r.bytes/1024).toFixed(1)} KB` : '';
    const batchTxt = r.batchName ? esc(r.batchName) : '<span style="color:var(--text-3)">—</span>';
    return `<tr>
      <td style="white-space:nowrap">${esc(r.ts||'')}</td>
      <td><span class="tag ${typeColor}">${typeLab}</span></td>
      <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(r.fileName||'')}">${esc(r.fileName||'')}${sizeTxt}</td>
      <td>${batchTxt}</td>
      <td style="white-space:nowrap">
        <button class="btn" style="padding:3px 10px;font-size:12px" ${solid?'':'disabled title="浏览器版不支持,请用桌面版"'}
          onclick="revealBackup('${r.id}')">📂 在文件夹中显示</button>
        <button class="btn" style="padding:3px 10px;font-size:12px;color:var(--danger)" ${solid?'':'disabled title="浏览器版不支持,请用桌面版"'}
          onclick="deleteBackup('${r.id}')">删除</button>
      </td>
    </tr>`;
  }).join('') : `<tr><td colspan="5" style="text-align:center;padding:34px 0;color:var(--text-3);font-size:13px">
    还没有备份记录。导出过 JSON 完整备份、或做过覆盖/删批次操作后，会自动记到这里。</td></tr>`;
  $('mainArea').innerHTML = `
  <div class="page-head">
    <div><div class="u-title">备份历史</div>
    <div class="u-sub">所有备份文件都在「下载」目录 · 这里只是清单 + 快捷入口</div></div>
    <div style="display:flex;gap:8px">
      <button class="btn" onclick="openDownloadsFolder()">📂 打开备份文件夹</button>
      <button class="btn pri" onclick="exportBackupFile()">+ 导出一份完整备份</button>
    </div>
  </div>
  <div class="u-card"><div class="u-card-body" style="overflow-x:auto">
    <table class="list-table"><thead><tr>
      <th>备份时间</th><th>类型</th><th>文件名</th><th>关联批次</th><th>操作</th>
    </tr></thead><tbody>${rows}</tbody></table>
    <div style="font-size:12px;color:var(--text-3);margin-top:10px">
      · 「在文件夹中显示」会在文件资源管理器中定位到该备份文件（macOS 在访达里高亮）<br>
      · 「删除」是真从「下载」目录里删，删完就找不回来了 —— 谨慎使用<br>
      · 备份文件命名规则：完整备份「工作台完整备份_YYYY-MM-DD.json」、批次 CSV「学生数据_批次名_YYYY-MM-DD.csv」
    </div>
  </div></div>`;
}

async function revealBackup(bid){
  const rec = (S.backupHistory || []).find(x => x.id === bid);
  if(!rec){ toast('记录不存在'); return; }
  if(!(window.__TAURI__ && window.__TAURI__.core)){ toast('浏览器版不支持，请用桌面版'); return; }
  try{
    await window.__TAURI__.core.invoke('reveal_in_downloads', { name: rec.fileName });
  }catch(e){ toast('打开失败：' + ((e && e.message) || e)); }
}

async function deleteBackup(bid){
  const rec = (S.backupHistory || []).find(x => x.id === bid);
  if(!rec){ toast('记录不存在'); return; }
  if(!(window.__TAURI__ && window.__TAURI__.core)){ toast('浏览器版不支持，请用桌面版'); return; }
  askConfirm({
    title:'删除备份文件',
    html:`将从「下载」目录中删除 <b>${esc(rec.fileName)}</b>。<br>
      <span style="font-size:12.5px;color:var(--text-3)">删了就找不回来了。如果这是某次操作唯一留下的回退依据，请先复制一份到别处。</span>`,
    okText:'删除',
    danger:true,
    onOk: async () => {
      try{
        await window.__TAURI__.core.invoke('delete_download', { name: rec.fileName });
      }catch(e){ toast('删除失败：' + ((e && e.message) || e)); return; }
      S.backupHistory = (S.backupHistory || []).filter(x => x.id !== bid);
      renderBackupHistory();
      toast('已删除');
    }
  });
}

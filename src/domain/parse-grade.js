/* ════════════════════════════════════════════════════════════════════════
   domain/parse-grade.js —— 成绩表解析（纯函数）
   ────────────────────────────────────────────────────────────────────────
   原先住在 features/grade-import.js，与「导入学生表」是**两套独立的 UI 流程**。
   v2.3（2026-10-03）把两个入口合并成「选文件 → 自动认表 → 确认 → 写进去」之后，
   这里只剩下**解析**这一件纯逻辑 —— UI 与写入都搬进了 features/import-unified.js。

   之所以能这样拆：解析不碰 DOM、不读状态、不写数据（真实数据实证）：
     · 第 1–2 行是合并的标题带（A1:K2 = "成绩信息"），真正的表头在第 3 行
     · 末尾有「162人 / 不及格」这类合计行，必须剔除
   纯函数住在 domain 层，可以在 node 里直接测。
   ════════════════════════════════════════════════════════════════════════ */

function parseGradeSheet(arr){
  // ① 定位表头行：第一处出现「学号」的行（容忍前后空格与标题带）
  let headerIdx = -1;
  for(let i=0;i<Math.min(arr.length,20);i++){
    const row = arr[i] || [];
    if(row.some(c=>String(c==null?'':c).trim() === '学号')){ headerIdx = i; break; }
  }
  if(headerIdx < 0) return { ok:false, reason:'没找到「学号」列，这可能不是成绩表' };

  const header = (arr[headerIdx]||[]).map(h=>String(h==null?'':h).trim());
  const rows = [], dropped = [];
  for(let i=headerIdx+1;i<arr.length;i++){
    const raw = arr[i] || [];
    if(!raw.some(c=>c!=null && c!=='')) continue;          // 空行
    const o = {};
    header.forEach((h,j)=>{ if(h) o[h] = (raw[j]==null ? '' : raw[j]); });
    const id = String(o['学号'] == null ? '' : o['学号']).trim();
    // ② 只认「学号是纯数字」的行 → 合计行（162人/不及格）与说明行在此剔除并留痕
    if(!/^\d{6,}$/.test(id)){
      const text = Object.values(o).filter(v=>v!=='').slice(0,3).join(' / ');
      dropped.push({ row:i+1, text });
      continue;
    }
    o['学号'] = id;
    rows.push(o);
  }
  return { ok:true, headerIdx, header, rows, dropped };
}

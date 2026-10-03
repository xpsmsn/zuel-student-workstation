/* ======== 导入 ======== */
/* 综合测评的全部分项（SHIGAKU 系统口径）。只在这**一处**定义。 */
const SCORE_PART_KEYS = [
  '基本素质评价','知识水平评价','能力评价','体测成绩',
  '科研创新B1','专业技能B2','文体特长B3','社会工作B4','社会实践B5',
  '思想政治表现评分项','道德品质修养评分项','组织纪律观念评分项','身心健康素质评分项'
];
/* 别名表按**真实表头**写死：
   申报情况表 学号/姓名/学院/班级/专业/批次/评定学年/评定学期/志愿顺序/志愿顺序内容/…/总成绩
   审核表   审核状态/学号/姓名/学院/专业/班级/现在年级/总成绩/各分项评分
   ★ 奖项不在独立列 —— 它在「志愿顺序」里，是「5.国家奖学金(不分等级) 6.…」这种拼接串。 */
const AWARD_FIELD_ALIASES = {
  '学号':     ['学号','职工号','学号（职工号）','sid','id'],
  '姓名':     ['姓名','学生姓名','名字','name'],
  '学院':     ['学院','所在学院','二级学院','dept'],
  '班级':     ['班级','所在班级','行政班','cls','class'],
  '专业':     ['专业','所在专业','major'],
  '批次':     ['批次','评选批次','batch'],
  '年级':     ['现在年级','年级','当前年级'],
  '评定学年': ['评定学年','学年'],
  '评定学期': ['评定学期','学期'],
  '奖项':     ['志愿顺序','志愿顺序内容','奖项','申报奖项','申请奖项','志愿奖项','奖项志愿','award'],
  '备注':     ['备注','申请理由','说明','note'],
  '来源':     ['来源','申请材料','材料','材料链接'],
  '提交日期': ['提交日期','申报日期','推荐日期','submitAt'],
  '总成绩':   ['总成绩','综合成绩','测评总分','总评分','综合测评','score','total'],
  '审核状态': ['审核状态','状态','status','结果']
};
function normalizeAwardHeader(h){
  const k = String(h==null?'':h).trim();
  for(const canonical in AWARD_FIELD_ALIASES){
    const list = AWARD_FIELD_ALIASES[canonical];
    if(Array.isArray(list) && list.includes(k)) return canonical;   // 空值/占位项跳过
  }
  return null;
}
function openAwardsImporter(type){
  const tip = type==='apps'
    ? `<div class="imp-steps">
        <div class="imp-step"><b>1</b><span>智慧学工 → <b>奖学金</b> → 志愿申报情况</span></div>
        <div class="imp-step"><b>2</b><span>点<b>导出</b> → <b>自定义导出</b></span></div>
        <div class="imp-step"><b>3</b><span>字段<b>全选</b>后点「导出」</span></div>
       </div>
       <div style="font-size:13px;color:var(--text-2);line-height:1.8;margin-top:10px">
        导入后<b>一个学生就是列表里的一行</b>；「志愿顺序」一格里写了几个奖项就并列显示几个。<br>
        <span class="muted" style="font-size:12.3px">表头需含：学号 / 姓名 / 志愿顺序（有批次列会按批次归档，没有就归到「未标注批次」）</span>
       </div>`
    : `<div class="imp-steps">
        <div class="imp-step"><b>1</b><span>智慧学工 → <b>综合测评</b> → 测评审核</span></div>
        <div class="imp-step"><b>2</b><span>点<b>导出</b> → <b>自定义导出</b></span></div>
        <div class="imp-step"><b>3</b><span>字段<b>全选</b>后点「导出」</span></div>
       </div>
       <div style="font-size:13px;color:var(--text-2);line-height:1.8;margin-top:10px">
        取的是<b>总成绩 / 知识水平评价 / B1~B5</b>这些分，用来排序和评单项奖学金。<br>
        <span class="muted" style="font-size:12.3px">表里的「审核状态」是<b>综合测评材料</b>的审核状态，不是奖学金评定结果，导入时会跳过。</span>
       </div>`;
  if(typeof XLSX === 'undefined'){ toast('当前环境缺少表格解析库'); return; }
  $('modalRoot').innerHTML = `
  <div class="mask" onclick="if(event.target===this)closeModal()">
    <div class="modal" onclick="event.stopPropagation()" style="max-width:480px">
      <div class="modal-head"><div class="modal-title">${type==='apps'?'导入申报情况':'导入综合测评分数'}</div>
        <div class="modal-close" onclick="closeModal()">×</div></div>
      <div class="modal-body">
        <div style="font-size:13.5px;color:var(--text-2);margin-bottom:12px;line-height:1.75">${tip}</div>
        <div class="drop-zone" onclick="$('awardFileInput').click()"
             ondragover="event.preventDefault();this.classList.add('drag')"
             ondragleave="this.classList.remove('drag')"
             ondrop="event.preventDefault();this.classList.remove('drag');handleAwardDrop(event,'${type}')">
          <div style="font-size:14px;font-weight:650;color:var(--brand);margin-bottom:6px">点击选择文件 / 拖入 .xlsx</div>
          <div class="muted" style="font-size:12.5px">支持 .xlsx / .xls</div>
          <input type="file" id="awardFileInput" accept=".xlsx,.xls" style="display:none" onchange="handleAwardFile(event,'${type}')">
        </div>
      </div>
      <div class="modal-foot"><button class="btn" onclick="closeModal()">取消</button></div>
    </div>
  </div>`;
}
function handleAwardDrop(ev, type){
  const f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
  if(f) readAwardFile(f, type);
}
function handleAwardFile(ev, type){
  const f = ev.target && ev.target.files && ev.target.files[0];
  if(f) readAwardFile(f, type);
}
function readAwardFile(file, type){
  if(!/\.(xlsx|xls)$/i.test(file.name)){ toast('请选择 .xlsx / .xls 文件'); return; }
  const reader = new FileReader();
  reader.onload = ev=>{
    try{
      const wb = XLSX.read(new Uint8Array(ev.target.result), {type:'array', cellDates:true});
      const ws = wb.Sheets[wb.SheetNames[0]];
      const arr = XLSX.utils.sheet_to_json(ws, {header:1, defval:null, raw:false}) || [];
      if(type==='apps')    ingestAwardsApps(arr, file.name);
      else                 ingestAwardsScores(arr, file.name);
      closeModal();
    }catch(e){ toast('读不了这个文件：'+e.message); }
  };
  reader.onerror = ()=>toast('文件读取失败');
  reader.readAsArrayBuffer(file);
}
function detectHeaderRow(arr){
  /* 取前 10 行里"非空单元格最多"的那行作表头 */
  let best = 0, bestN = -1;
  for(let i=0;i<Math.min(10, arr.length);i++){
    const row = arr[i] || [];
    const n = row.filter(c=>String(c==null?'':c).trim()!=='').length;
    if(n > bestN){ bestN = n; best = i; }
  }
  return best;
}
function mapHeaders(headerRow){
  const map = {};
  (headerRow||[]).forEach((h,i)=>{
    const canon = normalizeAwardHeader(h);
    if(canon && map[canon]===undefined) map[canon] = i;
  });
  return map;
}
/* 奖项名归一：吃空格与全半角括号；命中不到 → null（由调用方动态入库，不丢数据） */
function awardIdFromName(raw){
  const s = String(raw || '').replace(/[\s （）()\[\]]/g, '');
  if(!s) return null;
  if(/国家励志/.test(s))  return 'gzjl';
  if(/^国家奖学金|^国奖/.test(s)) return 'gj';
  if(/比亚迪/.test(s))    return 'byd';
  if(/紫光/.test(s))      return 'zglxj';
  if(/优秀学生.*一等奖|一等奖.*优秀学生|校一等奖/.test(s)) return 'yxxs1';
  if(/优秀学生.*二等奖|二等奖.*优秀学生|校二等奖/.test(s)) return 'yxxs2';
  if(/优秀学生.*三等奖|三等奖.*优秀学生|校三等奖/.test(s)) return 'yxxs3';
  if(/文体佳绩/.test(s)) return 'wtjj';
  if(/社会实践/.test(s)) return 'shsj';
  if(/社会工作/.test(s)) return 'shgz';
  if(/科研创新/.test(s)) return 'kcyc';
  return null;
}
/* ★ 核心：把「志愿顺序」单元格拆成多个奖项志愿。
   真实格式（空格分隔，序号可选，结尾统一挂 (不分等级)）：
     `5.国家奖学金(不分等级) 8.优秀学生奖学金(一等奖)(不分等级) 文体佳绩奖学金(不分等级)`
   → ['国家奖学金', '优秀学生奖学金（一等奖）', '文体佳绩奖学金']
   只去掉「序号.」前缀与结尾「(不分等级)」这类等级说明，
   **保留 (一等奖)/(二等奖)/(三等奖)** —— 一二三等在评选里是三个独立奖项，不能并成一个。 */
var AWARD_LEVEL_TAIL = /[（(](不分?等级|不限等级|无等级|统一等级)[）)]\s*$/;
function splitVolunteers(raw){
  const s = String(raw || '').trim();
  if(!s) return [];
  const seen = {}, out = [];
  s.split(/\s+/).forEach(function(item){
    if(!item) return;
    let nm = item.replace(/^\d+\s*\.?\s*/, '');   // 去「5.」序号前缀
    nm = nm.replace(AWARD_LEVEL_TAIL, '');        // 去结尾等级说明
    nm = nm.trim();
    if(!nm) return;
    if(!seen[nm]){ seen[nm] = 1; out.push(nm); }  // 同一单元格内去重
  });
  return out;
}
function _awardNewId(){ return _libId(); }
/* 奖项名 → 字典 id（字典里没有就自动入库，标成综合类；辅导员可后续调整） */
function awardEnsureId(vnm){
  let awardId = awardIdFromName(vnm);
  if(awardId) return awardId;
  const exist = S.awards.awards.find(a=>a.name===vnm || a.name===vnm.slice(0,40));
  if(exist) return exist.id;
  awardId = 'other_'+(S.awards.awards.length+1)+'_'+Date.now().toString(36);
  S.awards.awards.push({ id:awardId, name:vnm.slice(0,40), quota:null, type:'general' });
  return awardId;
}
/* 导入申报情况 —— 一个学生一行，志愿聚合进 vols */
function ingestAwardsApps(arr, fileName){
  ensureAwards();
  const hRow = detectHeaderRow(arr);
  const headers = arr[hRow] || [];
  const cols = mapHeaders(headers);
  if(cols['学号']===undefined || cols['姓名']===undefined){
    toast('表头缺少「学号」「姓名」两个关键列');
    return;
  }
  if(cols['奖项']===undefined){
    toast('没找到「志愿顺序」(或「奖项」)列 —— 奖项信息在这个列里，请保留不要删');
    return;
  }
  let added=0, updated=0, skipped=0, newAwards=0;
  let lastBid='', lastBatchName='';
  const pick = (row, key) => (cols[key]!==undefined ? String(row[cols[key]]==null?'':row[cols[key]]).trim() : '');
  const before = S.awards.awards.length;
  for(let i=hRow+1;i<arr.length;i++){
    const row = arr[i] || [];
    if(!row.some(c=>String(c||'').trim()!=='')) continue;
    const sid   = pick(row,'学号');
    const name  = pick(row,'姓名');
    if(!sid || !name){ skipped++ ; continue; }
    const batchName = pick(row,'批次')
      || [pick(row,'评定学年'), pick(row,'评定学期')].filter(Boolean).join('学年第')
      || AWARD_BATCH_UNTITLED;
    const bid = awardRegisterBatch(batchName);
    lastBid = bid; lastBatchName = batchName;
    const vols = splitVolunteers(pick(row,'奖项')).map((nm,order)=>({ awardId:awardEnsureId(nm), volName:nm, order }));
    if(!vols.length){ skipped++ ; continue; }
    let stu = (S.awards.students||[]).find(s=>String(s.sid)===sid && s.batchId===bid);
    if(stu){
      /* 同批次重复导入 → 合并志愿，不新增行 */
      let grew = 0;
      vols.forEach(v=>{ if(!stu.vols.some(x=>x.awardId===v.awardId)){ stu.vols.push(v); grew++; } });
      stu.name = name; stu.cls = pick(row,'班级') || stu.cls; stu.dept = pick(row,'学院') || stu.dept;
      stu.major = pick(row,'专业') || stu.major; stu.grade = pick(row,'年级') || stu.grade;
      updated++ ;
    }else{
      S.awards.students.push({
        id: bid + '_' + sid + '_' + _awardNewId(),
        sid, name, cls:pick(row,'班级'), dept:pick(row,'学院'), major:pick(row,'专业'),
        grade:pick(row,'年级'), batchId:bid, batchName,
        score:{}, vols, draft:null, final:[], importedAt:Date.now()
      });
      added++ ;
    }
  }
  newAwards = S.awards.awards.length - before;
  S.awardImportLog.unshift({
    ts:Date.now(), type:'apps', file:fileName, added, skipped, students:added, newAwards, batchName:lastBatchName
  });
  if(lastBid){ S.awards.activeBatch = lastBid; }
  S.awardFilter = '';
  save();
  renderAward();
  toast(`申报情况：新增 ${added} 人${updated?` / 合并 ${updated}`:''}${newAwards?` / 新奖项 ${newAwards}`:''}${lastBatchName?` —— 已归入「${lastBatchName}」`:''}`);
}
/* 导入综合测评分数 —— 只取分数，不取「审核状态」（那是材料审核，不是评定结果） */
function ingestAwardsScores(arr, fileName){
  ensureAwards();
  const hRow = detectHeaderRow(arr);
  const headers = arr[hRow] || [];
  const cols = mapHeaders(headers);
  if(cols['学号']===undefined){ toast('表头缺少「学号」关键列'); return; }
  /* 分项目录（知识水平评价 / 科研创新B1 …）认**原始表头名**，不在别名表里，字面命中就收 */
  const spCols = {};
  (arr[hRow]||[]).forEach((h,i)=>{
    const k = String(h==null?'':h).trim();
    if(SCORE_PART_KEYS.indexOf(k)>=0) spCols[k] = i;
  });
  let scored=0, skipped=0, orphan=0;
  const pick = (row, key) => (cols[key]!==undefined ? String(row[cols[key]]==null?'':row[cols[key]]).trim() : '');
  const resolveBatch = sid => {
    const act = awardActiveBatchId();
    if(act && (S.awards.students||[]).some(s=>s.batchId===act && String(s.sid)===sid)) return act;
    const ids = [...new Set((S.awards.students||[]).filter(s=>String(s.sid)===sid && s.batchId).map(s=>s.batchId))];
    if(ids.length===1) return ids[0];
    return act || awardRegisterBatch(AWARD_BATCH_UNTITLED);
  };
  for(let i=hRow+1;i<arr.length;i++){
    const row = arr[i] || [];
    if(!row.some(c=>String(c||'').trim()!=='')) continue;
    const sid = pick(row,'学号');
    if(!sid){ skipped++ ; continue; }
    const bid = resolveBatch(sid);
    let stu = (S.awards.students||[]).find(s=>String(s.sid)===sid && s.batchId===bid);
    if(!stu){
      /* 只导了分数表、还没导申报表 → 也建一行（没有志愿，筛选奖项时不会出现） */
      stu = { id:bid+'_'+sid+'_'+_awardNewId(), sid, name:pick(row,'姓名'), cls:pick(row,'班级'),
              dept:pick(row,'学院'), major:pick(row,'专业'), grade:pick(row,'年级'),
              batchId:bid, batchName:((S.awards.batches||[]).find(b=>b.id===bid)||{}).name||'',
              score:{}, vols:[], draft:null, final:[], importedAt:Date.now() };
      S.awards.students.push(stu);
      orphan++ ;
    }
    /* 总成绩 + 全部分项 */
    const total = pick(row,'总成绩');
    if(total!==''){ const n = Number(total); if(isFinite(n)){ stu.score['总成绩'] = n; scored++; } }
    Object.keys(spCols).forEach(k=>{
      const v = String(row[spCols[k]]==null?'':row[spCols[k]]).trim();
      if(v!=='') stu.score[k] = v;
    });
  }
  S.awardImportLog.unshift({
    ts:Date.now(), type:'reviews', file:fileName, added:scored, skipped, scored
  });
  save();
  renderAward();
  toast(`综合测评分数：${scored} 人${orphan?` / 未申报也建行 ${orphan}`:''}${skipped?` / 跳过 ${skipped}`:''}`);
}
function exportAwardsXlsx(){
  if(typeof XLSX === 'undefined'){ toast('表格组件没加载起来，导不了 Excel'); return; }
  ensureAwards();
  const bid = awardActiveBatchId();
  const bName = ((S.awards.batches||[]).find(b=>b.id===bid)||{}).name || '';
  const scope = ((S.awards.students)||[]).filter(s=>s.batchId===bid);
  const wb = XLSX.utils.book_new();
  /* 表 1：拟定名单 */
  const aoa1 = [['奖项','名额','学号','姓名','专业','综合测评','知识水平','B1','B2','B3','B4','B5']];
  (S.awards.awards||[]).forEach(a=>{
    const got = scope.filter(s=>(s.final||[]).indexOf(a.id)>=0)
      .slice().sort((x,y)=>(scoreVal(y,'总成绩')||0)-(scoreVal(x,'总成绩')||0));
    got.forEach((s,i)=>{
      aoa1.push([
        i===0 ? a.name : '', i===0 ? (a.quota||'') : '', s.sid, s.name, s.major||'',
        nz(scoreVal(s,'总成绩')), nz(scoreVal(s,'知识水平评价')),
        nz(scoreVal(s,'科研创新B1')), nz(scoreVal(s,'专业技能B2')), nz(scoreVal(s,'文体特长B3')),
        nz(scoreVal(s,'社会工作B4')), nz(scoreVal(s,'社会实践B5'))
      ]);
    });
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa1), '拟定名单');
  /* 表 2：候选明细（一个学生一行） */
  const aoa2 = [['#','学号','姓名','专业','综合测评','知识水平','B1','B2','B3','B4','B5','申报志愿','已定奖项']];
  scope.slice().sort((x,y)=>(scoreVal(y,'总成绩')||-1)-(scoreVal(x,'总成绩')||-1)).forEach((s,i)=>{
    aoa2.push([
      i+1, s.sid, s.name, s.major||'',
      nz(scoreVal(s,'总成绩')), nz(scoreVal(s,'知识水平评价')),
      nz(scoreVal(s,'科研创新B1')), nz(scoreVal(s,'专业技能B2')), nz(scoreVal(s,'文体特长B3')),
      nz(scoreVal(s,'社会工作B4')), nz(scoreVal(s,'社会实践B5')),
      (s.vols||[]).slice().sort((a,b)=>(a.order||0)-(b.order||0)).map(v=>awardNameById(v.awardId)).join(' / '),
      (s.final||[]).map(awardNameById).join(' / ')
    ]);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa2), '候选明细');
  /* 表 3：按奖项汇总 */
  const aoa3 = [['奖项','类型','名额','候选人数','已定人数']];
  (S.awards.awards||[]).forEach(a=>{
    const st = awardQuotaStat(a.id);
    aoa3.push([a.name, awardTypeOf(a.id)==='single'?'单项（可兼得）':'综合（不兼得）',
               st.quota||'', st.cand, st.final]);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa3), '按奖项汇总');
  const bytes = XLSX.write(wb, { bookType:'xlsx', type:'array' });
  const file = `奖学金拟定名单_${bName||'未命名批次'}_${todayStr()}.xlsx`;
  function nz(v){ return (v===null||v===undefined) ? '' : v; }
  try{
    if(window.__TAURI_INTERNALS__){
      const u8 = new Uint8Array(bytes);
      window.__TAURI_INTERNALS__.invoke('plugin:opener|save_to_downloads', { filename:file, bytes:Array.from(u8) })
        .then(()=>toast('已导出到下载：'+file))
        .catch(()=>fallbackDownload(bytes, file));
    }else{
      fallbackDownload(bytes, file);
    }
  }catch(e){ fallbackDownload(bytes, file); }
}
function fallbackDownload(bytes, file){
  const blob = new Blob([bytes], { type:'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = file;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
  toast('已导出：'+file);
}

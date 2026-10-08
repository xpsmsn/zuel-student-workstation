/* 用辅导员给的真实文件《20260706附件6 入党积极分子名册(1).xls》做端到端导入核对：
   走的就是 handleFile 里那条解析路径（locateHeaderRow → buildRawRows → buildImportState → doImport）。
   用法: node .build/real-roster-check.js <页面URL> <xls路径> */
const fs = require('fs'), path = require('path');
const NODE_WS = 'C:/Users/xpsms/.workbuddy/binaries/node/workspace/node_modules';
const { chromium } = require(path.join(NODE_WS, 'playwright'));

const URL = process.argv[2];
const XLS = process.argv[3];
if(!URL || !XLS){ console.error('用法: node .build/real-roster-check.js <URL> <xls>'); process.exit(1); }

let failN = 0;
const fail = m => { console.error('  ✗ ' + m); failN++; };
const pass = m => console.log('  ✓ ' + m);

(async () => {
  const b64 = fs.readFileSync(XLS).toString('base64');
  const browser = await chromium.launch({ channel: 'msedge' });
  const page = await browser.newPage({ viewport:{ width:1440, height:900 } });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(URL, { waitUntil:'load' });
  await page.waitForTimeout(700);
  await page.evaluate(() => { enterApp(); S.guideSeen = true; S.tourSeen = true; save(); });

  const r = await page.evaluate(async (b64) => {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for(let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const wb = XLSX.read(arr, { type:'array', cellDates:true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const grid = XLSX.utils.sheet_to_json(ws, { header:1, defval:null, raw:false });
    const headerIdx = locateHeaderRow(grid);
    const rawHeader = (grid[headerIdx] || []).map(h => h == null ? '' : String(h));
    const p = buildRawRows(grid, headerIdx, rawHeader);
    buildImportState(rawHeader, p.rows, '20260706附件6  入党积极分子名册(1).xls', headerIdx, p.rowNos);

    /* 独立算一遍「第一条真数据在 Excel 第几行」：不依赖 rowNos，直接回原表扫。
       这份名册的表头在第 4 行，第 5 行压着「培养联系人 1 | 2」的子表头，第 6 行才是
       序号 1 —— 所以偏移是 headerIdx+3 而不是 headerIdx+2。用扫描结果当真值，
       公式写错也不会漏。 */
    const iName = rawHeader.findIndex(h => normalizeKey(h) === '姓名');
    const iId   = rawHeader.findIndex(h => normalizeKey(h) === '学号');
    const nonEmpty = (row, i) => i >= 0 && row[i] != null && String(row[i]).trim() !== '';
    let trueRow0 = null;
    for(let i = headerIdx + 1; i < grid.length; i++){
      const row = grid[i] || [];
      if(nonEmpty(row, iName) || nonEmpty(row, iId)){ trueRow0 = i + 1; break; }
    }
    /* 表头与首数据之间夹着的行（应当只有那条子表头，且必须被 buildRawRows 剔掉） */
    const gapRows = [];
    for(let i = headerIdx + 1; i < (trueRow0 || 0) - 1; i++){
      const row = grid[i] || [];
      const cells = [];
      row.forEach((v, c)=>{ if(v != null && String(v).trim() !== '') cells.push(rawHeader[c] + '=' + String(v)); });
      gapRows.push('Excel第' + (i + 1) + '行: ' + (cells.join(' ') || '（整行空白）'));
    }

    const before = S.students.length;
    const snap = {
      sheet: wb.SheetNames[0], totalRows: grid.length, headerIdx,
      kind: importState.kind, rows: importState.rows.length,
      cols: importState.cols.slice(0, 24),
      rowNos: importState.rowNos.slice(0, 3).concat(['…'], importState.rowNos.slice(-2)),
      excelRow0: excelRowNo(0), excelRowLast: excelRowNo(importState.rows.length - 1),
      trueRow0, gapRows,
      first: importState.rows[0], emptyCols: importState.emptyCols
    };
    importState.mode = 'append';
    doImport();
    snap.before = before;
    snap.res = { added: importState.result.added, updated: importState.result.updated,
                 skipped: importState.result.skipped, badRows: importState.result.badRows,
                 rosterSynced: importState.result.rosterSynced, rosterKept: importState.result.rosterKept };
    snap.after = S.students.length;
    const one = S.students.find(s => String(s['学号']) === '202521140060') || {};
    snap.sample = { 姓名: one['姓名'], 政治面貌: one['政治面貌'], 所在党支部: one['所在党支部'],
                    担任职务: one['班委'], 出生日期: one['出生日期'],
                    递交入党申请书时间: one['递交入党申请书时间'],
                    确定为入党积极分子时间: one['确定为入党积极分子时间'], 性别: one['性别'], 民族: one['民族'] };
    return snap;
  }, b64);

  console.log('\n[真实名册解析]');
  console.log('  工作表:', r.sheet, '| 总行数', r.totalRows);
  console.log('  表头下标:', r.headerIdx, '(Excel 第', r.headerIdx + 1, '行)');
  console.log('  识别类型:', r.kind);
  console.log('  有效数据行:', r.rows, '| Excel 行号', JSON.stringify(r.rowNos));
  console.log('  首条真数据: Excel 第', r.trueRow0, '行');
  console.log('  表头与首数据之间夹着的行:', r.gapRows.length ? r.gapRows.join(' || ') : '（无）');
  console.log('  列名:', r.cols.join(' / '));
  console.log('  首行:', JSON.stringify(r.first).slice(0, 320));
  console.log('  本列全空:', JSON.stringify(r.emptyCols));

  r.headerIdx === 3 ? pass('表头定位到第 4 行（真实文件的表头就在第 4 行）') : fail('表头定位错了：' + r.headerIdx);
  r.kind === 'roster' ? pass('识别为「入党积极分子名册」') : fail('没认出名册：' + r.kind);
  r.cols.indexOf('学号') >= 0 ? pass('「学号/职工号」归一为「学号」主键') : fail('学号列没认出来');
  r.cols.indexOf('班委') >= 0 ? pass('「担任职务」归一为「班委」') : fail('担任职务没归一');
  r.rows >= 70 ? pass(`解析出 ${r.rows} 条有效记录（老代码这里是 0 条）`) : fail('有效行太少：' + r.rows);
  r.excelRow0 === r.trueRow0
    ? pass(`首行报错行号指向 Excel 第 ${r.excelRow0} 行（与回原表扫出来的真值一致）`)
    : fail(`行号不对：报 ${r.excelRow0}，原表真值是 ${r.trueRow0}`);
  /* 表头下面夹着的那几行（本例是「培养联系人 1|2」子表头）必须一行都不进数据 */
  const gapNo = [];
  for(let i = r.headerIdx + 2; i < r.trueRow0; i++) gapNo.push(i);      // 1-based 行号
  const leaked = gapNo.filter(n => r.rowNos.indexOf(n) >= 0);
  !leaked.length
    ? pass(`表头下夹着的 ${gapNo.length} 行（第 ${gapNo.join('/')} 行）已剔除，没混进数据`)
    : fail('夹在表头下的非人员行漏进了数据：Excel 第 ' + leaked.join('/') + ' 行');

  console.log('\n[导入结果]');
  console.log('  导入前人数', r.before, '→ 导入后', r.after);
  console.log('  新增', r.res.added, '| 更新', r.res.updated, '| 异常行', r.res.skipped, JSON.stringify(r.res.badRows));
  console.log('  政治面貌同步', r.res.rosterSynced, '人 | 因已是党员/发展对象而保住', r.res.rosterKept, '人');
  console.log('  抽样（刘丽轩 202521140060）:', JSON.stringify(r.sample));
  r.res.added + r.res.updated > 0 ? pass('确实导进来了（不再是「导入 0 人」）') : fail('还是 0 人');
  r.res.skipped === 0 && r.res.badRows.length === 0
    ? pass('没有把"培养联系人 1|2"子表头行误报成异常行')
    : fail(`仍有 ${r.res.skipped} 行被当成异常行：` + JSON.stringify(r.res.badRows));
  r.sample['政治面貌'] === '入党积极分子' ? pass('政治面貌已同步为「入党积极分子」') : fail('政治面貌没同步：' + r.sample['政治面貌']);
  /* 日期只要求「读成了日期文本」，不要求统一成 YYYY-MM-DD：
     这份名册里各列的单元格格式本来就不一样（出生日期 yyyy/m/d、递交入党申请书时间 m/d/yy），
     产品按原样保留是刻意的（导入不改写辅导员的数据）。
     真正要防的是 SheetJS 把日期读成 45938 这种 Excel 序列号。 */
  const dateVals = ['出生日期', '递交入党申请书时间', '确定为入党积极分子时间']
    .map(k => [k, String(r.sample[k] == null ? '' : r.sample[k])]);
  const serial = dateVals.filter(([, v]) => /^\d+(\.\d+)?$/.test(v));      // 纯数字 = 大概率是序列号
  const hasDateShape = dateVals.filter(([, v]) => /\d/.test(v) && /\D/.test(v)); // 含数字也含符号
  if(!serial.length && hasDateShape.length >= 2)
    pass('日期列读成了日期文本，不是 45938 这种序列号 —— ' + dateVals.map(([k,v]) => k + '=' + v).join(' / '));
  else
    fail('日期列有问题：' + JSON.stringify(dateVals));

  if(errs.length){ errs.slice(0,5).forEach(e => fail('页面报错：' + e)); } else pass('运行期无 JS 报错');

  await browser.close();
  console.log(failN ? `\n共 ${failN} 项问题` : '\n全部通过 ✅');
  process.exit(failN ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

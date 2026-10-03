/* ---------- v1.9.2：认出「入党积极分子名册」这类表 ----------
   识别到以后，导入时除了正常按列合并，还会把匹配到学生的「政治面貌」
   同步为「入党积极分子」，省得几百人一个个手点。 */
const ROSTER_MARKS = ['所在党支部', '确定为入党积极分子时间', '递交入党申请书时间'];
function detectSheetKind(cols){
  return (cols || []).some(c => ROSTER_MARKS.indexOf(c) >= 0) ? 'roster' : 'student';
}

/* ---------- v1.9.2：积极分子名册 → 自动同步「政治面貌」 ----------
   辅导员拿到「入党积极分子名册」后，真正想干的往往不是"存下这份表"，
   而是"把这几百人的政治面貌改成入党积极分子"。既然名册本身就已经是
   权威名单了，就让程序顺手把这活干掉，省下几百次手点。

   但"改身份"这件事是有风险的，所以加两道闸：
     ① 不降级：已经是中共党员 / 中共预备党员 / 发展对象 的，一律不动
        （名册是"曾经是积极分子"的存底，不该把已经入党的人拉回来）；
     ② 不覆盖：名册里本身就带「政治面貌」列且写了值的，尊重名册的值。

   返回 true 表示"这次真的改了"，用于在结果页统计「同步 N 人」。 */
const RECRUIT_STATUS = '入党积极分子';
const ROSTER_PROTECT  = /党员|发展对象/;   // 命中即视为"比积极分子更进一步"，不降级

function applyRosterRule(rec, kind){
  if(kind !== 'roster' || !rec) return false;
  const cur = String(rec['政治面貌'] == null ? '' : rec['政治面貌']).trim();
  if(ROSTER_PROTECT.test(cur)) return false;   // 闸①：已入党/发展对象 → 不动
  if(cur === RECRUIT_STATUS) return false;     // 已经是了 → 不重复统计
  rec['政治面貌'] = RECRUIT_STATUS;
  return true;
}
/* 名册同步时被闸①挡下来的人（用来说明"为什么有人没被改"） */
function rosterProtected(rec){
  const cur = String((rec && rec['政治面貌']) == null ? '' : rec['政治面貌']).trim();
  return ROSTER_PROTECT.test(cur);
}

/* ---------- v1.9.2：从「整张表的二维数组」里挑出真正的数据行 ----------
   名册这类表在表头正下方常压着一行「培养联系人 1 | 2」的子表头，末尾还可能吊着
   「合计 · 162人」这类统计行 —— 它们在「学号」和「姓名」两列上都是空的。留着它们会被
   当成"异常行"报给辅导员，白吓一跳（"有 1 行学号为空"），所以这里就剔掉。
   如果这张表压根没有学号/姓名列（拿不准），就不做这层过滤，宁可多报也不漏。

   同时把每行在原表里的 Excel 行号一并带出来：中途剔过行之后，行号不能靠
   「下标 + 表头行 + 2」推算，必须逐行记，否则报给辅导员的"第几行有问题"会错位。 */
function buildRawRows(arr, headerIdx, rawHeader){
  const idCols = [], nameCols = [];
  (rawHeader || []).forEach((h, i)=>{
    const n = normalizeKey(h);
    if(n === '学号') idCols.push(i);
    if(n === '姓名' || n === '姓名1') nameCols.push(i);
  });
  const cellOn = (r, cols) => cols.some(i => r[i] != null && String(r[i]).trim() !== '');
  const canJudge = idCols.length > 0 || nameCols.length > 0;

  const rows = [], rowNos = [];
  for(let i = headerIdx + 1; i < arr.length; i++){
    const r = arr[i] || [];
    if(!r.some(c => c != null && c !== '')) continue;                        // 整行空白
    if(canJudge && !(cellOn(r, idCols) || cellOn(r, nameCols))) continue;    // 非人员行
    rows.push(r);
    rowNos.push(i + 1);          // Excel 真实行号（1-based）
  }
  return { rows, rowNos };
}

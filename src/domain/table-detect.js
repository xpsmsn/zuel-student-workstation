/* ---------- v1.9.2：找到「真正的表头」在哪一行 ----------
   各校导出的表，前面常压着 1~3 行标题带、盖章栏、填报日期。
   例如「入党积极分子名册」真正的表头在第 4 行，第 1 行只有「附件6：」。
   以前这里写死拿 arr[0] 当表头，于是这类表整体错位：列名成了「附件6：」，
   学号列识别不出来，所有行都因「学号为空」被跳过 —— 辅导员看到的是「导入 0 人」。

   判据（宁可退回第 1 行，也不乱猜，保证老表完全不受影响）：
     ① 优先「同时含学号与姓名」的那一行；
     ② 其次「含学号」的那一行；
     ③ 都没有 → 退回第 1 行。 */
function locateHeaderRow(arr){
  const limit = Math.min(arr.length, 20);
  let onlyId = -1;
  for(let i = 0; i < limit; i++){
    const keys = (arr[i] || []).map(c => normalizeKey(c));
    const hasId   = keys.indexOf('学号') >= 0;
    const hasName = keys.indexOf('姓名') >= 0 || keys.indexOf('姓名1') >= 0;
    if(hasId && hasName) return i;
    if(hasId && onlyId < 0) onlyId = i;
  }
  return onlyId >= 0 ? onlyId : 0;
}

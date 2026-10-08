// 周次校准回归：按开学日推算 / 手动校正成第 N 周 / 之后自动 +1 / 取消校正 / 存档不丢
// 用法: node .build/test-week-calib.js 中南大学生工作台.html
const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');
const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const big = scripts.sort((a, b) => b.length - a.length)[0].replace(/\r\n/g, '\n');

const helpers = `
  var S = { semester:{ name:'2026-2027 学年第一学期', start:'2026-09-07', weeks:20, calAt:null, calWeek:null } };
  var save=()=>{}; var toast=()=>{}; var closeModal=()=>{}; var renderTopbarWeek=()=>{};
  var renderSettings=()=>{}; var gotoSettings=()=>{}; var esc=s=>String(s==null?'':s);
  var $=()=>({ innerHTML:'', value:'', textContent:'' });
`;
const names = ['weekMonday', 'todayStrOf', 'weekAnchor', 'semesterWeek',
  'calibrateWeek', 'clearWeekCalibration', 'ensureSemesterObj'];
const snippets = [], missed = [];
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
names.forEach(n => {
  const m = big.match(new RegExp('(function\\s+' + escRe(n) + '\\s*\\([\\s\\S]*?\\n\\})'));
  if (m) { snippets.push(m[1]); return; }
  missed.push(n);
});
if (missed.length) { console.error('未抓到: ' + missed.join(', ')); process.exit(2); }

const tests = `
let pass=0, fail=0;
const ok=(l,c,e)=>{ c?(pass++,console.log('  ✓',l,e||'')):(fail++,console.log('  ✗',l,e||'')); };
const D = s => new Date(s + 'T00:00:00');

console.log('\\n[1] 基础：按开学日连续推算');
S.semester = { name:'T', start:'2026-09-07', weeks:20 };
ok('开学当天 = 第 1 周', semesterWeek(D('2026-09-07')).raw===1, 'got='+semesterWeek(D('2026-09-07')).raw);
ok('开学后第 7 天 = 第 2 周', semesterWeek(D('2026-09-14')).raw===2);
ok('周日 9/13 仍算第 1 周（周一为界）', semesterWeek(D('2026-09-13')).raw===1);
ok('今天 10/2 = 第 4 周', semesterWeek(D('2026-10-02')).raw===4, 'got='+semesterWeek(D('2026-10-02')).raw);
ok('国庆后 10/9 = 第 5 周', semesterWeek(D('2026-10-09')).raw===5, 'got='+semesterWeek(D('2026-10-09')).raw);
ok('未校正时 calibrated=false', semesterWeek(D('2026-10-02')).calibrated===false);

console.log('\\n[2] ★ 手动校正：把本周改成第 N 周');
// 假装在 10/2（周五）校正成本学期第 3 周（学校因国庆少算了一周）
const fakeNow = D('2026-10-02');
S.semester = { name:'T', start:'2026-09-07', weeks:20 };
S.semester.calAt = '2026-09-28';      // 锚在**本周一**（10/2 所在周的周一）
S.semester.calWeek = 3;
ok('校正当天 = 第 3 周', semesterWeek(fakeNow).raw===3, 'got='+semesterWeek(fakeNow).raw);
ok('标记 calibrated=true', semesterWeek(fakeNow).calibrated===true);
ok('同一周内的周日 10/4 也是第 3 周', semesterWeek(D('2026-10-04')).raw===3);
ok('同一周内的周一 9/28 也是第 3 周', semesterWeek(D('2026-09-28')).raw===3);

console.log('\\n[3] ★ 校正后：往后自动 +1');
ok('下周 10/5 → 第 4 周', semesterWeek(D('2026-10-05')).raw===4, 'got='+semesterWeek(D('2026-10-05')).raw);
ok('10/9（国庆后上课）→ 第 4 周', semesterWeek(D('2026-10-09')).raw===4);
ok('再下一周 10/12 → 第 5 周', semesterWeek(D('2026-10-12')).raw===5);
ok('一个月后 11/2 → 第 8 周', semesterWeek(D('2026-11-02')).raw===8, 'got='+semesterWeek(D('2026-11-02')).raw);
ok('往前回溯 9/21 → 第 2 周（不越界乱跳）', semesterWeek(D('2026-09-21')).raw===2, 'got='+semesterWeek(D('2026-09-21')).raw);
// 校正成「9/28 = 第 3 周」，等于告诉系统"学校的编号比开学日整体少一周"，
// 所以顺着新时间轴往前推，9/7 就是第 0 周（页面显示「未开学」）—— 这是诚实的推算，不是 bug
ok('校正后的时间轴往前推会低于 1 → 页面显示「未开学」',
   semesterWeek(D('2026-09-07')).raw===0, 'got='+semesterWeek(D('2026-09-07')).raw);

console.log('\\n[4] 再校正一次（以后有变化照样能掰回来）');
S.semester.calAt = '2026-10-12'; S.semester.calWeek = 6;   // 11 周那阵又停课一周
ok('重新锚定当天 = 第 6 周', semesterWeek(D('2026-10-14')).raw===6, 'got='+semesterWeek(D('2026-10-14')).raw);
ok('再往后一周 = 第 7 周', semesterWeek(D('2026-10-19')).raw===7);
ok('锚点之前一周 = 第 5 周', semesterWeek(D('2026-10-08')).raw===5);

console.log('\\n[5] 取消校正 → 回到按开学日推算');
clearWeekCalibration();
ok('calAt 已清空', !S.semester.calAt);
ok('回到 10/2 = 第 4 周', semesterWeek(D('2026-10-02')).raw===4, 'got='+semesterWeek(D('2026-10-02')).raw);
ok('calibrated=false', semesterWeek(D('2026-10-02')).calibrated===false);

console.log('\\n[6] 边界与健壮性');
S.semester = { name:'T', start:'', weeks:18 };
ok('没填开学日 → null（不崩）', semesterWeek(D('2026-10-02'))===null || typeof semesterWeek(D('2026-10-02'))==='object');
S.semester = { name:'T', start:'2026-09-07', weeks:20, calAt:'bad-date', calWeek:5 };
ok('坏锚点日期不炸', typeof semesterWeek(D('2026-10-02')).raw==='number');
ok('超出总周数仍返回数字（页面显示「假期中」）', typeof semesterWeek(D('2027-02-01')).raw==='number');
// weekMonday 必须永远落在周一
['2026-09-07','2026-10-02','2026-10-04','2026-10-09','2026-10-12'].forEach(d=>{
  ok('weekMonday(' + d + ') 是周一', weekMonday(D(d)).getDay()===1);
});

console.log('\\n=========================');
console.log('  通过：'+pass+' / 失败：'+fail);
process.exit(fail===0?0:1);
`;

const code = helpers + snippets.join('\n\n') + '\n' + tests;
try { new Function(code)(); }
catch (e) { console.error('运行时错误：', e.message); console.error(e.stack.split('\n').slice(0, 4).join('\n')); process.exit(2); }

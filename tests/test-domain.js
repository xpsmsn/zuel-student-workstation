#!/usr/bin/env node
// tests/test-domain.js —— domain 层单测（不加载整份 HTML）
//
// 为什么这一份测试和别的不一样：别的测试把 2.4MB 的产物灌进 vm 沙盒跑，
// 慢且脆。这里的 domain 层是**零 DOM 纯函数**，直接 require 就能测——
// 快、稳、定位准。
//
// 这才是把铁律抽出来的真正收益：以前这些规则只能被间接覆盖。
//
//   node tests/test-domain.js
'use strict';
const path = require('path');
const fs = require('fs');

let pass = 0, fail = 0;
const ok = (cond, label, extra) => {
  if (cond) { pass++; }
  else { fail++; console.log(`  ✗ ${label}${extra !== undefined ? ' = ' + JSON.stringify(extra) : ''}`); }
};
const eq = (a, b, label) => ok(JSON.stringify(a) === JSON.stringify(b), label, a);

// 把 domain 源文件塞进沙盒跑（它是纯函数，不需要 DOM）
const vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'domain', 'import-rules.js'), 'utf8');
// ⚠️ 顶层 const/let 在 vm.createContext 的沙箱里**不会**自动挂到 context 上
//（只有 function 声明会）。所以跑完再把需要的名字取出来。
const sandbox = { studentName: s => (s && (s['姓名1'] || s['姓名'])) || '' };
vm.createContext(sandbox);
vm.runInContext(src + '\n;globalThis.__out = { domainMergeRowInto, domainMergeRowsById, domainFilterSkipped, domainUnmatched, domainDedupeById };', sandbox);
const {
  domainMergeRowInto: mergeRowInto,
  domainMergeRowsById: mergeRowsById,
  domainFilterSkipped: filterSkippedCols,
  domainUnmatched: unmatchedStudents,
  domainDedupeById: dedupeById,
} = sandbox.__out;

// ─────────────────────────────────────────────────────
console.log('\n— 铁律①备注永不覆盖 —');
{
  const old = { '学号': '001', '备注（保密）': '辅导员写的', '民族': '汉族' };
  mergeRowInto(old, { '学号': '001', '备注（保密）': '表里带来的', '民族': '苗族' }, null);
  eq(old['备注（保密）'], '辅导员写的', '  导入表带备注也覆盖不了');
  eq(old['民族'], '苗族', '  其余列正常更新');
}

console.log('— 铁律②空值不覆盖 —');
{
  const old = { '学号': '001', '民族': '汉族', '政治面貌': '共青团员' };
  mergeRowInto(old, { '学号': '001', '民族': null, '政治面貌': '' }, null);
  eq(old['民族'], '汉族', '  null 不覆盖');
  eq(old['政治面貌'], '共青团员', '  空串不覆盖');
}

console.log('— 铁律③未出现的列保留（最易丢数据处）—');
{
  // 模拟真实事故：12 列新表并进 22 字段旧表
  const old = {
    '学号': '001', '备注（保密）': '跟进中', '班级': '英语2401', '专业': '英语',
    '宿舍': '滨湖1栋-634', '床位': '01床', '家长电话': '13800000000',
    '生源地': '湖南长沙', '毕业学校': '中南大学', '政治面貌': '中共党员'
  };
  const cols = ['学号', '姓名', '班级', '宿舍', '床位'];   // 本次表只有这 5 列
  mergeRowInto(old, { '学号': '001', '姓名': '张三', '班级': '英语2402', '宿舍': '滨湖2栋-101', '床位': '03床' }, cols);
  eq(old['专业'], '英语', '  本次表没有的列没被抹掉');
  eq(old['家长电话'], '13800000000', '  家长电话没被抹掉');
  eq(old['生源地'], '湖南长沙', '  生源地没被抹掉');
  eq(old['备注（保密）'], '跟进中', '  备注没被抹掉');
  eq(old['班级'], '英语2402', '  本次表有的列正常更新');
}

console.log('— 铁律④不静默删除 + 点名 —');
{
  const old = [{ '学号': '001', '姓名': '甲' }, { '学号': '002', '姓名': '乙' }, { '学号': '003', '姓名': '丙' }];
  const rows = [{ '学号': '001' }, { '学号': '003' }];
  const un = unmatchedStudents(old, rows);
  eq(un.map(x => x.姓名), ['乙'], '  本次没出现的那个被点名');
}

console.log('— 合并：命中 / 新增 —');
{
  const old = [{ '学号': '001', '民族': '汉族', '备注（保密）': 'x' }, { '学号': '002', '民族': '苗族' }];
  const rows = [{ '学号': '001', '民族': '' }, { '学号': '009', '民族': '回族' }];
  const r = mergeRowsById(old, rows, ['学号', '民族']);
  eq(r.matched, 1, '  命中 1 人');
  eq(r.added, 1, '  新增 1 人');
  eq(r.list.length, 3, '  总数 3（原有 2 + 新增 1，未删任何��）');
  eq(r.list[0]['民族'], '汉族', '  空值没覆盖掉旧值');
  eq(r.list[2]['学号'], '009', '  新学号进来了');
}

console.log('— CSV 内部同学号去重（v2.1.x 曾在这里丢铁律③）—');
{
  const rows = [
    { '学号': '001', '姓名': '张三', '民族': '汉族' },
    { '学号': '001', '姓名': '张三改', '民族': '' }       // 同号第二行
  ];
  const r = mergeRowsById([], rows, ['学号', '姓名', '民族']);
  eq(r.list.length, 1, '  同一学号只剩一条');
  eq(r.list[0]['姓名'], '张三改', '  后一行的非空值补上了');
}

console.log('— 排除字段：学号永远保留 —');
{
  const rows = [{ '学号': '001', '姓名': '甲', '民族': '汉族' }];
  const r = filterSkippedCols(rows, ['学号', '姓名', '民族'], new Set(['学号', '民族']));
  eq(Object.keys(r.rows[0]), ['学号', '姓名'], '  民族被排除，学号被强制保回');
  ok(r.cols.includes('学号'), '  列清单里学号仍在');
  ok(!r.cols.includes('民族'), '  民族已排除');

  // 只有「学号」被排除时：行与列清单都必须留着它，且不能凭空造出别的键
  const only = filterSkippedCols(rows, ['学号', '姓名', '民族'], new Set(['学号']));
  eq(Object.keys(only.rows[0]), ['学号', '姓名', '民族'], '  只排学号时行不变');
  eq(only.cols, ['学号', '姓名', '民族'], '  只排学号时列清单不变');
}

console.log('— 去重：同号只留一条，无学号行保留 —');
{
  const r = dedupeById([{ '学号': '001' }, { '学号': '001' }, { '学号': '' }, { '学号': '002' }]);
  eq(r.list.length, 3, '  4 行 → 3 行');
  eq(r.dropped, 1, '  丢了 1 条重复');
}

console.log('— 空输入不炸 —');
{
  eq(mergeRowsById(null, null, null).list.length, 0, '  mergeRowsById(null,null)');
  eq(unmatchedStudents(null, null).length, 0, '  unmatchedStudents(null,null)');
  eq(dedupeById(null).list.length, 0, '  dedupeById(null)');
  eq(mergeRowInto({}, {}, []), {}, '  mergeRowInto 空行');
}

console.log(`\n[domain] ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
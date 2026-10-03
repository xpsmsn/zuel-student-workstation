#!/usr/bin/env node
// tests/run.js —— 全量回归入口。改完代码跑这一个就够。
//
// 为什么要有统一入口：以前测试脚本散在 .build/ 且要逐个手敲，
// 漏跑一个就等于没测。现在一个命令跑全部，任何人（或任何 Agent）都跑同一条。
//
//   node tests/run.js            跑全部
//   node tests/run.js --only import    只跑名字含 import 的
//   node tests/run.js --list          只看清单
'use strict';
const path = require('path');
const { execFileSync } = require('child_process');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const HTML = path.join(ROOT, '中南大学生工作台.html');

// 顺序即依赖的分组：语法 → 数据铁律 → 功能 → 周次
const SUITE = [
  { f: 'test-domain.js',        n: 'domain 纯函数' },   // 不加载产物，最快最准
  { f: 'check-syntax.js',       n: '语法与按钮类名' },
  { f: 'test-import.js',        n: '导入铁律' },
  { f: 'test-library.js',       n: '内容库' },
  { f: 'test-v196.js',          n: 'v1.9.6 综合' },
  { f: 'test-delete-backup.js', n: '删除与备份' },
  { f: 'test-week-calib.js',    n: '周次校准' },
];

const argv = process.argv.slice(2);
if (argv.includes('--list')) {
  SUITE.forEach(s => console.log(`  ${s.f.padEnd(24)} ${s.n}`));
  process.exit(0);
}
const only = (() => { const i = argv.indexOf('--only'); return i >= 0 ? argv[i + 1] : null; })();
const list = only ? SUITE.filter(s => s.f.includes(only)) : SUITE;

if (!fs.existsSync(HTML)) { console.error('[test] ✗ 找不到产物，请先 node tools/build.js'); process.exit(1); }

// 先确认产物既新鲜（不旧于任何源文件）又与基线一致 ——
// 不一致说明构建没跑，测的是旧代码。
// ⚠️ 这里**不自己跑构建**：测试只读产物，构建是开发者的动作，
// 而且派生构建子进程去写同一个文件在本机会被火绒拦成 EBUSY。
const BASE = path.join(ROOT, 'baseline', '中南大学生工作台.baseline.html');
if (!fs.existsSync(HTML)) { console.error('[test] ✗ 找不到产物，请先 node tools/build.js'); process.exit(1); }
{
  const now = fs.statSync(HTML).mtimeMs;
  const stale = [];
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(js|css|html|json)$/.test(e.name) && fs.statSync(p).mtimeMs > now) stale.push(path.relative(ROOT, p));
  });
  walk(path.join(ROOT, 'src'));
  if (stale.length) {
    console.error(`[test] ✗ 产物比源文件旧，改完没构建：${stale.slice(0, 5).join(', ')}${stale.length > 5 ? ` … 另有 ${stale.length - 5} 个` : ''}`);
    process.exit(1);
  }
  if (!fs.existsSync(BASE)) {
    console.error('[test] ✗ 找不到基线 baseline/中南大学生工作台.baseline.html');
    process.exit(1);
  }
  const a = fs.readFileSync(BASE), b = fs.readFileSync(HTML);
  if (!a.equals(b)) {
    const al = a.toString('utf8').split('\n'), bl = b.toString('utf8').split('\n');
    let first = -1;
    for (let i = 0; i < Math.max(al.length, bl.length); i++) if (al[i] !== bl[i]) { first = i; break; }
    console.error(`[test] ✗ 产物与基线不一致（首个差异在第 ${first + 1} 行）—— 先跑 node tools/build.js 再刷新基线`);
    process.exit(1);
  }
}

let pass = 0, fail = 0;
for (const s of list) {
  const p = path.join(__dirname, s.f);
  if (!fs.existsSync(p)) { console.log(`  ${s.f.padEnd(24)} ✗ 缺文件`); fail++; continue; }
  let ok = false, tail = '';
  // domain 层不加载产物，所以不传 HTML 参数；其余需要产物路径
  const args = s.f === 'test-domain.js' ? [] : [HTML];
  try {
    const out = execFileSync(process.execPath, args.length ? [p, ...args] : [p],
      { cwd: ROOT, encoding: 'utf8', stdio: 'inherit' });
    ok = true; tail = String(out).trim().split('\n').pop().slice(0, 70);
  } catch (e) {
    tail = String(e.message || '').trim().split('\n').pop().slice(0, 70);
  }
  ok ? pass++ : fail++;
  console.log(`  ${s.f.padEnd(24)} ${ok ? '✓' : '✗'} ${s.n.padEnd(12)} ${tail}`);
}
console.log(`\n[test] ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
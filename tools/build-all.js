// build-all.js — 一键构建：src/ → 产物 → 桌面版前端
// 出包前跑这一个就够，不会出现"改了原型忘了同步桌面版"这种坑
//   （那个坑真的踩过：npx tauri build 不会重新生成 app/src/index.html，
//     结果页面右下角显示的还是旧版本号）
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const run = (script, args) => {
  console.log(`\n=== ${script} ${(args || []).join(' ')} ===`);
  execFileSync(process.execPath, [path.join(__dirname, script)].concat(args || []),
    { cwd: ROOT, stdio: 'inherit' });
};

run('build.js', ['--verify']);                       // src/ → 中南大学生工作台.html（+ 边界校验 + 逐字节比对）
run(path.join('..', '.build', 'build-desktop.js'), []); // 产物 → app/src/index.html（注入桌面适配层）
console.log('\n[all] 完成。产物：' + path.join(ROOT, '中南大学生工作台.html'));

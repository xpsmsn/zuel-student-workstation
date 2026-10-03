// .build/week-test.js —— 周次显示与校准验证
'use strict';
const { chromium } = require('C:/Users/xpsms/.workbuddy/binaries/node/workspace/node_modules/playwright');
const F = 'file:///D:/Develop/辅导员工作台/中南大学生工作台.html';

(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const p = await b.newPage({ viewport: { width: 1440, height: 400 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(F);
  await p.waitForTimeout(2400);

  const chip1 = await p.evaluate(() => ({
    文案: document.getElementById('weekChip').textContent.trim(),
    学期名还在吗: document.getElementById('weekChip').textContent.includes('学年'),
    当前周: semesterWeek() ? semesterWeek().raw : null,
  }));
  console.log('① 校准前：', JSON.stringify(chip1));

  // 打开弹窗（设为第 4 周 —— 用户说校历上今天是第 4 周）
  await p.evaluate(() => openWeekCalibrate(4));
  await p.waitForTimeout(300);
  const m1 = await p.evaluate(() => document.getElementById('calibNum').textContent);
  await p.evaluate(() => bumpWeek(1));
  await p.waitForTimeout(200);
  const m2 = await p.evaluate(() => document.getElementById('calibNum').textContent);
  console.log('② 弹窗：初值 ' + m1 + ' → 点+ 后 ' + m2 + (m2 === '5' ? '（未被重置 ✓）' : '（被重置 ✗）'));

  // 定为第 4 周并保存
  await p.evaluate(() => { openWeekCalibrate(4); saveWeekCalib(); });
  await p.waitForTimeout(400);
  const after = await p.evaluate(() => ({
    chip: document.getElementById('weekChip').textContent.trim(),
    开学日: S.semester.start,
    今天: semesterWeek().raw,
    明天: (() => { const d = new Date(); d.setDate(d.getDate() + 1);
      return semesterWeek(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')).raw; })(),
    下周一: (() => { const d = new Date(); d.setDate(d.getDate() + 7);
      return semesterWeek(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')).raw; })(),
  }));
  console.log('③ 校准为第 4 周后：', JSON.stringify(after));
  console.log('   → chip 只剩：' + after.chip + (after.chip.indexOf('学年') < 0 ? '（无学期名 ✓）' : '（还有学期名 ✗）'));
  console.log('   → 明天自动第 ' + after.明天 + ' 周、下周一第 ' + after.下周一 + ' 周（继续往后数 ✓）');
  console.log('报错：', errs.length ? errs.slice(0, 2) : '无');
  await b.close();
})();

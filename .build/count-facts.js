/* 从原型里静态核出「手册里要写的数字」，避免文档与实现不一致。
   用法: node .build/count-facts.js [中南大学生工作台.html] */
const fs = require('fs');
const file = process.argv[2] || '中南大学生工作台.html';
const html = fs.readFileSync(file, 'utf8');
const blocks = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
const app = blocks.find(s => s.includes('function doImport'));

const grab = (name) => {
  const i = app.indexOf(`const ${name} = [`);
  if (i < 0) return null;
  // 配平到对应的 ];（简单括号计数，够用）
  let d = 0, j = app.indexOf('[', i);
  for (let k = j; k < app.length; k++) {
    if (app[k] === '[') d++;
    else if (app[k] === ']') { d--; if (d === 0) return app.slice(j, k + 1); }
  }
  return null;
};

const arr = grab('PRESET_TPL') || grab('PRESET_TEMPLATES');
console.log('常用模板预置条数:', arr ? (arr.match(/\{/g) || []).length : '（没找到 PRESET_TPL）');
if (arr) {
  const tags = [...arr.matchAll(/tag:\s*['"]([^'"]+)['"]/g)].map(m => m[1]);
  console.log('  模板标签:', [...new Set(tags)].join('、'));
}

const nav = grab('PRESET_NAV') || grab('PRESET_NAVLINKS');
if (nav) {
  const items = (nav.match(/\{/g) || []).length;
  const cats = [...nav.matchAll(/cat:\s*['"]([^'"]+)['"]/g)].map(m => m[1]);
  console.log('校务导航预置条数:', items);
  console.log('校务导航分区数:', new Set(cats).size, '→', [...new Set(cats)].join('、'));
} else {
  console.log('校务导航: 没找到 PRESET_NAV');
}

const wiz = grab('WIZ_TITLES');
console.log('新手向导步数:', wiz ? (wiz.match(/'/g) || []).length / 2 : '?');

const presets = grab('PRESETS');
if (presets) {
  const ids = [...presets.matchAll(/id:\s*'([^']+)'/g)].map(m => m[1]);
  const labels = [...presets.matchAll(/label:\s*'([^']+)'/g)].map(m => m[1]);
  console.log('关注视图预设:', ids.join(', '));
  console.log('关注视图名称:', labels.join('、'));
}

const tour = grab('TOUR_STEPS');
console.log('导览步数:', tour ? (tour.match(/\{ sel:/g) || []).length : '?');

// 内联库在**另一个** script 块里，所以这两个要在整份 HTML 上找（曾在 app 块里找→误判成"没有"）
console.log('SheetJS 有 parse_xlscfb（完整版）:', html.includes('parse_xlscfb'));
console.log('SheetJS 有 CFB:', /(^|[^\w])CFB([^\w]|$)/.test(html));
console.log('内联 SheetJS 版本:', (html.match(/version\s*[:=]\s*["'](\d\.\d\.\d)["']/) || ['?', '?'])[1]);
console.log('storage key:', (html.match(/counselor_workstation_v\d+/) || ['?'])[0]);
const av = html.match(/const APP_VER = '([^']+)'/);
console.log('APP_VER:', av ? av[1] : '?');
// 系统设置里都有哪些区
const secs = [...html.matchAll(/📦 数据管理|🖥 常驻与开机启动|🎨 外观与主题|📅 学期与周次|🔒 数据固化|ℹ️ 关于/g)]
  .map(m => m[0]);
console.log('系统设置分区:', [...new Set(secs)].join(' / '));

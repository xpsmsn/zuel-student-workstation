#!/usr/bin/env node
// tools/analyze.js —— 依赖图分析器（重构期的 X 光片）
//
// 作用：算出每个模块「定义了什么顶层符号」+「引用了哪些别处的符号」，
// 输出一张真实的依赖图。manifest.json 的 deps 字段照着它填，不靠猜。
//
//   node tools/analyze.js            人读的依赖图
//   node tools/analyze.js --json     机器读（供构建器/校验器用）
//   node tools/analyze.js --layer    按层分组统计
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const rd = p => fs.readFileSync(p, 'utf8');

const manifestPath = path.join(SRC, 'manifest.json');
const manifest = JSON.parse(rd(manifestPath));
const mods = manifest.modules;

/** 顶层定义符号 */
function defs(code) {
  const out = new Set();
  const re = /^(?:function\s+([A-Za-z_$][\w$]*)|(?:const|let|var)\s+([A-Za-z_$][\w$]*)|class\s+([A-Za-z_$][\w$]*))/gm;
  let m;
  while ((m = re.exec(code)) !== null) out.add(m[1] || m[2] || m[3]);
  return out;
}

/** 剥离注释与字符串字面量，避免注释里提到的词被当成引用 */
function strip(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/`(?:\\.|[^`\\])*`/g, '``');
}

/** 收集所有被「裸引用」的名字（不是属性访问、不是局部定义、不是对象字面量的键） */
function refs(code, own) {
  const s = strip(code);
  // 屏蔽 `键:` 形式 —— 那是对象字面量的字段名，不是变量引用
  const masked = s.replace(/([{,\s])([A-Za-z_$][\w$]*)\s*:(?!:)/g, (m, p1, p2) => p1 + ' '.repeat(p2.length));
  const out = new Set();
  const re = /(?<![.\w$])([A-Za-z_$][\w$]*)/g;
  let m;
  while ((m = re.exec(masked)) !== null) {
    const n = m[1];
    if (!own.has(n)) out.add(n);
  }
  return out;
}

const BUILTIN = new Set(['window','document','console','Object','Array','String','Number','Boolean','Math','JSON',
  'Date','Map','Set','WeakMap','Promise','RegExp','Error','Symbol','Proxy','Reflect','parseInt','parseFloat',
  'isNaN','isFinite','undefined','null','true','false','this','typeof','instanceof','new','function','return',
  'if','else','for','while','do','switch','case','break','continue','var','let','const','class','extends','super',
  'try','catch','finally','throw','void','delete','in','of','yield','async','await','static','get','set',
  'Intl','Uint8Array','ArrayBuffer','Blob','File','FileReader','localStorage','sessionStorage','navigator',
  'location','history','setTimeout','clearTimeout','setInterval','clearInterval','requestAnimationFrame',
  'cancelAnimationFrame','fetch','URL','URLSearchParams','TextEncoder','TextDecoder','atob','btoa',
  'alert','confirm','prompt','globalThis','arguments','eval','require','module','exports','XLSX','ResizeObserver',
  'matchMedia','Element','HTMLElement','Node','CSS','CustomEvent','Event','structuredClone','queueMicrotask',
  'AbortController','DOMParser','ClipboardItem','Option','FormData','URLSearchParams','Infinity','NaN','Intl']);

const missing = mods.filter(m => !fs.existsSync(path.join(SRC, m.file)));
if (missing.length) {
  console.error('[analyze] manifest 里登记了但文件不存在：');
  missing.forEach(m => console.error('  ' + m.id + ' → ' + m.file));
  console.error('         删掉这些条目，或把文件补回来。\n');
  process.exit(1);
}

const info = mods.map(m => {
  const code = rd(path.join(SRC, m.file));
  const own = defs(code);
  const used = refs(code, own);
  return { id: m.id, layer: m.layer, file: m.file, decl: m.declares || [], own, used };
});

// 符号 → 提供它的模块
const owner = new Map();
for (const i of info) for (const s of i.own) if (!owner.has(s)) owner.set(s, i.id);

const asJson = process.argv.includes('--json');
const wantLayer = process.argv.includes('--layer');

const edges = [];
for (const i of info) {
  const deps = new Set();
  const unknown = new Set();
  for (const s of i.used) {
    if (BUILTIN.has(s)) continue;
    if (i.own.has(s)) continue;
    const o = owner.get(s);
    if (o && o !== i.id) deps.add(o);
    else if (!o) unknown.add(s);
  }
  edges.push({ ...i, deps: [...deps].sort(), unknown: [...unknown].sort() });
}

if (asJson) {
  console.log(JSON.stringify(edges.map(e => ({
    id: e.id, layer: e.layer, file: e.file, decl: e.decl,
    own: [...e.own].sort(), deps: e.deps, unknown: e.unknown
  })), null, 2));
  process.exit(0);
}

console.log('\n══════ 依赖图（机器算出，非人工排列）══════\n');
for (const e of edges.sort((a, b) => a.layer.localeCompare(b.layer) || a.id.localeCompare(b.id))) {
  const n = rd(path.join(SRC, e.file)).split('\n').length;
  console.log(`[${e.layer}] ${e.id.padEnd(22)} ${String(n).padStart(5)} 行  ${e.file}`);
  if (e.deps.length) console.log(`      需要: ${e.deps.join(', ')}`);
  if (e.unknown.length) console.log(`      ⚠ 未归属符号 ${e.unknown.length} 个: ${e.unknown.slice(0, 8).join(', ')}${e.unknown.length > 8 ? ' …' : ''}`);
}

// 校验：manifest 声明的 deps 与实测是否一致
console.log('\n══════ 声明 vs 实测 ══════');
let bad = 0;
for (const e of edges) {
  const m = mods.find(x => x.id === e.id);
  const declared = (m.deps || []).slice().sort();
  const actual = e.deps.filter(d => !declared.includes(d));
  const missing = declared.filter(d => !e.deps.includes(d));
  if (actual.length) { console.log(`  ✗ ${e.id} 实际还依赖: ${actual.join(', ')}`); bad++; }
  if (missing.length) { console.log(`  ⚠ ${e.id} 声明了但没用: ${missing.join(', ')}`); }
}
if (!bad) console.log('  ✓ 所有实际依赖都已声明');
console.log('');
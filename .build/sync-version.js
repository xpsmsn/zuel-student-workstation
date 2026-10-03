#!/usr/bin/env node
/**
 * 版本号同步 —— 三处以 app/package.json 为唯一来源
 *
 * 为什么需要这个（2026-10-04）：
 *   辅导员在「系统设置 → 关于」里发现版本号还是 v2.1.0。
 *   根因是版本号散在 4 个文件里**手动维护**，每次升版总有落下的 —— 这次连漏两轮。
 *   本脚本在 build-desktop.js 之前跑，出包前自动对齐，不会再漏。
 *
 * 用法：
 *   node .build/sync-version.js               单独跑（幂等）
 *   require('./sync-version').syncVersion()    出包前由 build-desktop.js 调用
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const write = (p, s) => fs.writeFileSync(path.join(ROOT, p), s, 'utf8');

function syncVersion() {
  /* 唯一来源 */
  const pkg = JSON.parse(read('app/package.json'));
  const ver = String(pkg.version || '').trim();
  if (!/^\d+\.\d+\.\d+$/.test(ver)) {
    console.error('[sync-version] app/package.json 的 version 不合法：' + ver);
    return { version: ver, changed: [] };
  }
  const now = new Date();
  const dateStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  const changed = [];

  /* ① HTML 的 APP_VER —— 正则替换，保留上方的说明注释 */
  {
    const p = '中南大学生工作台.html';
    const s = read(p);
    const re = /(const APP_VER = ')[^']*(';)/;
    if (re.test(s)) {
      const next = s.replace(re, '$1v' + ver + ' · ' + dateStr + '$2');
      if (next !== s) { write(p, next); changed.push('HTML APP_VER → v' + ver + ' · ' + dateStr); }
    } else {
      console.warn('[sync-version] 在 ' + p + ' 里找不到 const APP_VER（跳过）');
    }
  }

  /* ② tauri.conf.json */
  {
    const p = 'app/src-tauri/tauri.conf.json';
    const s = read(p);
    const next = s.replace(/("version":\s*")[^"]*(")/, '$1' + ver + '$2');
    if (next !== s) { write(p, next); changed.push('tauri.conf.json version → ' + ver); }
  }

  /* ③ Cargo.toml —— 只改 [package] 段那一行，别动依赖里的 version */
  {
    const p = 'app/src-tauri/Cargo.toml';
    const s = read(p);
    let next = s.replace(/^(\[package\][\s\S]*?^\s*version\s*=\s*")[^"]*(")/m, '$1' + ver + '$2');
    if (next === s) next = s.replace(/^(version\s*=\s*")[^"]*(")/m, '$1' + ver + '$2');
    if (next !== s) { write(p, next); changed.push('Cargo.toml version → ' + ver); }
  }

  console.log('[sync-version] 唯一来源 app/package.json = ' + ver);
  if (changed.length) changed.forEach(c => console.log('  ↻ ' + c));
  else console.log('  · 三处已一致，无需改动');
  return { version: ver, date: dateStr, changed };
}

if (require.main === module) syncVersion();
module.exports = { syncVersion };

# `.build/` 工具脚本

> 本目录是**构建/测试工具**，**不参与运行时**。产品逻辑在根目录的
> `中南大学生工作台.html`（单文件原型）与 `app/src/index.html`（桌面版，
> 由 `sync/build-desktop.js` 自动生成）。

## 目录结构

按职能分 4 个子目录：

| 子目录 | 作用 | 典型入口 |
| --- | --- | --- |
| `sync/` | 同步：把原型同步成桌面版，并对齐版本号 | `node .build/sync/build-desktop.js` |
| `pack/` | 出包：图标 / 安装包 / 用户手册 / GitHub Release | `python .build/pack/pack-release.py` |
| `test/` | 测试：语法 / 导入 / 内容库 / 桌面适配层 / 真实数据回归 | `node .build/test/check-syntax.js 中南大学生工作台.html` |
| `archive/` | 历史残留：`award-fix.css` / `aw-now.png` —— 主代码已无引用，按方案说明 L1036 先例归档 | （不主动调用） |

顶层还留 4 个资源文件，不放脚本：

- `manual-chapters.md` / `manual-full.md` — 用户手册 Markdown 源
- `release-notes.md` — 历史发布说明存档
- `sites.json` — 出包时的镜像源配置

## 调用关系

```
[ 出包链路 ]
sync-version.js  ←── build-desktop.js ──→ app/src/index.html
                              │
                              ├──→ tauri build  （cd app && npx tauri build）
                              └──→ pack/pack-release.py ──→ 发布/

[ 改图链路 ]  （改二维码后必跑）
用户裁 PNG → test/qr-check.js 用 jsQR 解码验证可扫
            → 手工 base64 内联进 HTML

[ 改模板链路 ]  （换内置模板后必跑）
源文件 (.xlsx/.docx) → test/embed-templates.py 重新 base64 内联
                     → sync/build-desktop.js 重新同步桌面版

[ 验收链路 ]  （发版前跑一遍）
test/check-syntax.js
test/test-library.js
test/test-import.js
test/test-v196.js
test/test-delete-backup.js
test/test-desktop.js
```

## 关键约定

- **`app/src/index.html` 由 `sync/build-desktop.js` 自动生成，禁止手改**。
  改完原型跑一次 `node .build/sync/build-desktop.js` 即可。
- **`build-desktop.js` 内部用 `__dirname` 调 `sync-version.js`**，目录移动后仍然自洽。
- **`test/qr-check.js` 的 require 写的是绝对路径**（指向本机 workbuddy 的 `node_modules`），
  跟它在 `.build/` 里的位置无关，**不要改 require 路径**。
- **`test/read-real-tables.js` / `test/real-roster-check.js` 走 Playwright**，
  同样用绝对路径 require，**不要改 require 路径**。
- **`test/test-v196.js` 115 KB** 是 v1.9.6 三处修改的回归测试，保留。
- **`test/verify-real.js`** 是真实数据回归（189 人学生表 + 162 条成绩表端到端），保留。
- **`archive/award-fix.css` / `archive/aw-now.png`** 在主代码（`app/src/index.html`、
  `中南大学生工作台.html`、其他所有脚本、README、CHANGELOG）里 grep 均 0 命中，
  按方案说明 L1036 「合并进 test-library.js」的同款先例，归档保留。

## v1.9 首发

面向高校辅导员的**本机学生工作台**：把系统里导出的学生信息表 + 成绩单放进来，自动拼出每个人的画像、成绩、宿舍与预警。**数据只存本机，全程不联网、不上传服务器。**

### 📥 下载哪个？（三个文件内容一样，只是安装方式不同）

| Assets 里的文件名 | 对应本机文件 | 适合谁 |
| --- | --- | --- |
| `ZUEL-StudentWorkstation-Portable-v1.9.exe` | 中南大学生工作台-绿色版.exe | 想直接用：复制到任意文件夹双击即可，**不用安装** |
| `ZUEL-StudentWorkstation-Setup-v1.9.exe` | 中南大学生工作台-安装程序.exe | 日常使用：装到开始菜单/桌面。默认按当前用户安装，**不需要管理员权限** |
| `ZUEL-StudentWorkstation-v1.9.msi` | 中南大学生工作台-单位部署.msi | 学校统一部署用，通常需要管理员权限 |

> 文件名是英文的，是因为 GitHub 的 Release 附件不支持中文名（会被清成 `-.exe`）；下载后建议改回中文名再分发。

### ✨ 本次更新（v1.9）

- **新手引导重做为"跟着点一遍就能完成"的分步实操向导**：6 步，每步都配可执行按钮
  （打开智慧学工 / 打开综合教务 / 直达导入框），并带两份文件的进度清单，随时知道还差哪份。
- **宿舍看板新增「查寝打分表」导出**：A4 横向打印页，表头跨页自动重复、按楼栋房号排序、
  住宿人员姓名+床位不会被裁；打分项可自由增删改，满分自动合计。
- **修复「引导找不到」**：引导页的侧栏入口此前被误删，只剩首次自动弹一次；
  现在侧栏常驻入口 + 指引页 / 个人中心两处重看按钮。
- **演示数据更真实**：80 名学生按性别编组为 25 间 2~4 人寝室、床位连续编号、男女不混寝，
  「室友」列不再全空。

### 🖥 运行环境

Windows 10/11 64 位，需要 Microsoft Edge WebView2 运行时（Win11 与多数装过 Edge 的 Win10 已有；
安装器内嵌引导程序，缺的机器会自动装）。**不需要** Node.js / Rust / .NET。

详细用法见仓库内的 `中南大学生工作台-用户使用手册.docx`。

### 🔧 开发者说明

- 仓库里**不含**安装包本体与构建产物（`node_modules`、`src-tauri/target`、`app/src/index.html` 均已 gitignore）。
- clone 后要先跑 `node .build/build-desktop.js` 生成 `app/src/index.html`，再 `cd app && npm install && npx tauri build`。
- 回归测试：`node .build/check-syntax.js <原型.html>`、`test-library.js`、`test-delete-backup.js`、
  `test-desktop.js app/src/index.html`（共 128+ 条断言）。

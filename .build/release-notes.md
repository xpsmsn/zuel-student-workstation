## v1.9.5 —— 新增 macOS 版 · 手册补齐两个平台

面向高校辅导员的**本机学生工作台**：把系统里导出的学生信息表 + 成绩单放进来，自动拼出每个人的画像、成绩、宿舍与预警。**数据只存本机，全程不联网、不上传服务器。**

> 本版除新增 macOS 版外，**没有数据格式变更**，升级不动你已有的数据。

### 🍎 新增 macOS 版

同一个 dmg **同时支持 Intel 芯片与 Apple 芯片（M 系列）**，要求 macOS 10.15 及以上。

装法：双击 dmg → 把程序拖进「应用程序」→ **右键点它 → 选「打开」**（只需放行这一次）。

> ⚠️ **为什么第一次要右键打开？**
> 本软件没有购买苹果开发者账号（每年 99 美元），所以安装包做的是**临时签名**。
> macOS 对这类程序会拦一下、提示"无法验证开发者"——**这不是文件损坏**。
> 右键选「打开」放行一次即可，以后正常双击。
> 也可以在「系统设置 → 隐私与安全性」页面下方点「仍要打开」。

**这次移植几乎没改代码**：前端是同一个单文件页面，界面早就适配过窄屏，一行未动；
Rust 外壳里打开外链、打开本地文件、数据读写、系统托盘本来就跨平台，
**开机启动甚至早就写好了 macOS 的 LaunchAgent 分支**。

真正修掉的是一处会在 Mac 上现形的缺口：

| 问题 | 后果 | 修法 |
|---|---|---|
| `downloads_dir()` 只读 `USERPROFILE`（**Windows 专有的环境变量**） | 在 macOS 上取不到 → 静默退回系统临时目录 → 导出文件落在 `/tmp`，辅导员永远找不到（表现为"点了导出没反应"） | 改为优先用 Tauri 的跨平台路径解析（`app.path().download_dir()`），再退回 `HOME`/`USERPROFILE`，最后才退临时目录 |

> **怎么编出来的**：苹果的工具链只能在 macOS 上跑，Windows 上编不出 Mac 程序
> —— 这是苹果的限制，不是配置问题。所以改用 **GitHub 的 macOS 跑器**来编译（公开仓库免费）：
> 推代码或点一下按钮就自动出一个通用二进制的 dmg。

### 📖 手册补齐两个平台

《用户使用手册》新增 macOS 的安装与首次打开、两平台运行环境差异、macOS 下的数据目录，
以及 `⌘ + Q`（直接退出，不走"缩到托盘"）和 `⌘ + P`（打印）这类按键习惯的提醒。

### 📥 下载哪个？（四个文件内容一样，只是平台与安装方式不同）

| Assets 里的文件名 | 对应本机文件 | 适合谁 |
| --- | --- | --- |
| `ZUEL-StudentWorkstation-v1.9.7-Portable.exe` | 中南大学生工作台-v1.9.7-绿色版.exe | 想直接用：复制到任意文件夹双击即可，**不用安装** |
| `ZUEL-StudentWorkstation-v1.9.7-Setup.exe` | 中南大学生工作台-v1.9.7-安装程序.exe | 日常使用：装到开始菜单/桌面。默认按当前用户安装，**不需要管理员权限** |
| `ZUEL-StudentWorkstation-v1.9.7-Deploy.msi` | 中南大学生工作台-v1.9.7-单位部署.msi | 学校统一部署用，通常需要管理员权限 |
| `ZUEL-StudentWorkstation-v1.9.5-macOS.dmg` | 中南大学生工作台-v1.9.5-macOS.dmg | **苹果电脑**：Intel 与 Apple 芯片（M 系列）通用。装法见上「新增 macOS 版」 |

> 文件名是英文的，是因为 GitHub 的 Release 附件不支持中文名（会被清成 `-.exe`）；下载后建议改回中文名再分发。
> **文件名里都带版本号**（`v1.9.5`），拿到手就知道是哪一版，不会和旧版搞混。

### ⬆️ 从旧版升级

直接覆盖安装、或换用新版绿色版即可 —— 数据存在本机应用数据目录里（桌面版每次保存都会自动镜像一份 `workstation-data.json`），**升级不会丢数据**。
在「系统设置 → 数据固化」能看到当前状态（桌面版应显示**已开启**）；想手动再固化一份，点「立即固化一份到磁盘」。

### 🙏 致谢

特别鸣谢 [辅导员 AI 工作台 · counselor-ai-workbench v1.1.0](https://github.com/L-uo/counselor-ai-workbench/releases/tag/v1.1.0)
提供的产品思路（免费使用 · 本地数据优先 · 无需注册账号，以及校务导航 / 常用模板 / 制度库 /
批量导入向导 / 备份恢复这类"把零散事务收进一个工作台"的组织方式）。本项目为独立实现，非其 fork。

上一版（v1.9.2）修的是"二次导入名册一个人都进不来"的两个根因（内置表格库是精简版读不了 `.xls` + 写死表头在第 1 行），修法与细节见完整版本历史 `CHANGELOG.md`。

### 🖥 运行环境

Windows 10/11 64 位，需要 Microsoft Edge WebView2 运行时（Win11 与多数装过 Edge 的 Win10 已有；
安装器内嵌引导程序，缺的机器会自动装）。**不需要** Node.js / Rust / .NET。

详细用法见仓库内的 `中南大学生工作台-用户使用手册.docx`。

### 🔧 开发者说明

- **AI 辅导员页**：`renderAssistant()` 用一个局部 `botCard()` 生成两张同构卡片；两张码的内联常量是
  `QR_XIAOLUNAN`（378×378 纯码、16 色、约 9.2KB）与 `QR_ROBOT`（284×284、约 5.3KB），
  对应链接是 `LU_URL` / `BOT_URL`。**改图后必须用 `node .build/qr-check.js <png>` 验一遍"扫得出来"**
  —— 二维码压缩过头会失效（这两种格式的外框样式统一为 `.qr-box`，白底是硬编码的，别改成 `var(--card)`）。
- **筛选**：`filterDrop()/toggleFilterDrop()/paintFilterDrop()/toggleFilterValue()/clearFilterField()`，
  "哪个面板开着"记在模块级 `_fdOpen` 里 —— 列表页每次筛选整页重绘，靠它恢复；总览页只重绘图表区、
  面板没被重建，就由 `paintFilterDrop()` 就地同步。两种路径共用同一个函数，**改的时候别只顾一条路径**。
  点面板外面收起靠一个 capture 阶段的 document `click` 监听（面板内点击要 `stopPropagation`）。
- ⚠️ **按钮主样式叫 `.btn.pri`，不是 `.btn.primary`**。写错不会报任何错，只是按钮变白。
  `node .build/check-syntax.js <html>` 现在会扫出所有"用了但 CSS 里没定义"的按钮类名并直接失败。
- 「AI 辅导员」页的旧版式留了注释说明（`renderAssistant` 上方），**不要再用
  `document.body.innerHTML` 去断言"某段文字不存在"** —— body 的 innerHTML 会把 `<script>` 里的
  注释一起算进来，注释里引用了被删卡片的名字就会误报。
- 回归测试：`node .build/test-import.js 中南大学生工作台.html`（**38 条**：表头定位 / 非人员行过滤 /
  Excel 真实行号 / 名册同步与不降级 / 班委与学号同义词 / 老表不受影响）；
  `node .build/test-library.js 中南大学生工作台.html`（**128 条**）；
  `node .build/test-delete-backup.js 中南大学生工作台.html`（含 v1.9.3 新增的**筛选复选框面板 6 条**）；
  真实文件端到端 `node .build/real-roster-check.js <页面URL> <真实.xls>`（**9 条**）；
  真机核对 `node .build/shot-v193.js <页面URL> .build`（AI 页两卡并排 / 二维码同框同底色 / 关于无码 /
  筛选面板 6 项 / 零 JS 报错，并把两张码落盘交给 `qr-check.js` 真解）。
- **浮窗导览**：`TOUR_STEPS` 现在 **11 步**，锚点全用 `data-tour` 属性。
  ⚠️ 「常用工具」那四步（`nav`/`tpl`/`pol`/`cal`）的锚点会随侧栏分组折叠而消失，
  所以 `startTour()` 会**临时展开**该分组、`tourEnd()` 再**还原**（原来没设过这个键的话，
  收尾要把临时写的键删掉，别在用户数据里留脏值）。改这块务必跑 `shot-v192.js` 的 §[1b]。
- **用户手册是生成的**，不要再手工往里加"版本更新说明"：
  内容源 `.build/manual-full.md`（只写当前版本）→ `python .build/md2html-manual.py <md> <html>`
  → html-review 门禁 → `html-to-docx` 出 `.docx`。手册里的数字请用
  `node .build/count-facts.js` 从代码里核出来再写，别凭记忆。
- **macOS 版由 CI 构建，不在本机出**：Windows 上编不出 Mac 程序（苹果工具链限制，
  Tauri 也不支持从 Windows 交叉编译到 macOS）。工作流 `.github/workflows/build-macos.yml`
  跑在 GitHub 的 macOS 跑器上，用 `--target universal-apple-darwin` 出通用二进制（Intel + Apple 芯片），
  **必须带 `APPLE_SIGNING_IDENTITY="-"`**（临时签名）—— 否则 Apple 芯片上程序根本起不来。
  下载产物：`python .build/ci-fetch.py artifact <run_id> .build/ci-out`。
  ⚠️ 该接口会 302 到预签名地址，**第二跳不能再带 Authorization**，否则 401（脚本里已处理）。
- **macOS 打包配置在 `app/src-tauri/tauri.macos.conf.json`**（平台配置，只在 macOS 生效；
  Windows 的 `tauri.conf.json` 不要动）。macOS 打包**必需** `icons/icon.icns`，
  由 `.build/make-icns.py` 生成 —— 别用 `tauri icon`，它会把整套 Windows 图标重新生成一遍。
- 出包后跑 `python .build/pack-release.py`：按 `中南大学生工作台-v<版本>-<用途>.<扩展名>`
  的统一规则把三个产物放进「发布」目录，并同步安装说明 / README 里的文件名（自带 `--selftest`，13 条）。
  macOS 的 dmg 需单独放进「发布」目录（本机出不了它），`publish-release.py` 会一并上传。

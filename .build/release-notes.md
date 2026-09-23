## v2.0.0 —— 里程碑版本：功能定型的稳定性更新

面向高校辅导员的**本机学生工作台**：把系统里导出的学生信息表 + 成绩单放进来，自动拼出每个人的画像、成绩、宿舍与预警。**数据只存本机，全程不联网、不上传服务器。**

> 本版**没有数据格式变更，升级不动你已有的数据**。Windows 与 macOS 两个平台都有新包。

**关于这个版本号**：2.0.0 标记的是"功能形态定了，重心从加功能转向更稳、更清楚"这个节点。
相对上一个发布版 v1.9.8，**代码改动很小**（一处加固 + 清理），但功能清单已相当完整，
新用户可以把它当作一个稳定的起点。

### 🛡 本次改了什么（两处，都在稳健性上）

**① 加固一条关键不变量 —— 防止"录进去了，重开却没了"**

按「Karpathy 行为准则」做了一轮代码审查，发现这样一条隐患：

> 内存里的成绩数据，有可能与"批次里那一份"**不是同一个数组**（旧数据迁移等场景会出现）。
> 此时在详情页录入成绩，数据只活在内存里 —— 而存档存的是批次，于是**重开程序就没了**。

这与 v1.9.6 修的"无批次导入丢数据"是同一个源头。现在录入成绩后会把这份数据重新挂回批次
（正常路径下这一步没有任何副作用）。

并且补了 4 条断言把这个不变量钉死 —— **比的是"是不是同一份"，而不是只比人数**：
按照规矩，先故意让它失败（红）证明这条断言真的有效，再修到通过（绿）。

**② 清掉 3 个没人调用的函数（59 行）**

`openSettings`（旧「设置/导出」弹窗，自 v1.6 把数据管理并入系统设置后再没被打开过）、
`addFilter`、`setFilter`。

### 📌 这一版已经具备的能力（新用户速览）

- **导入**：系统导出的学生表、成绩单**原样丢进来**就行；表头不在第 1 行也能认、旧版 `.xls` 也能读；
  确认页可以**逐列勾选**哪些要、哪些不要；一个学号不会重复造人
- **导出 Excel（维护用）**：一个文件两张表，在 Excel 里大批量改完再导回来
- **关注标签**：🎭心理 / 👩‍👦单亲 / ⛄人际，可自定义；列表里只显示图标；「需重点关注」也认它
- **表单模板（内置 8 份）**：证明、介绍信、登记表、报销单，随程序打包，点一下另存即得干净原件
- **宿舍看板 / 查寝打分表**：床位、空位、调宿拖拽，一键生成 A4 横向可打印的打分表
- **数据安全**：备份（能带走）/ 自动保护（防清缓存）/ 回退点（导错了能退回）三层分清

### 🖥 macOS 版

同一个 dmg 通吃 **Intel 芯片与 Apple 芯片（M 系列）**，要求 macOS 10.15 及以上。

> ⚠️ **第一次打开要「右键 → 打开」放行一次**：本软件没有购买苹果开发者账号（每年 99 美元），
> 安装包做的是临时签名，macOS 会拦一下、提示"无法验证开发者"。**这不是文件损坏**。
> 在「应用程序」里右键点它 → 选「打开」→ 再点一次「打开」即可；以后正常双击。

### 📖 手册已同步

《用户使用手册》已更新到 2.0.0，含全部新功能与「三种保命机制的区别」对照表。

### 📥 下载哪个？

| Assets 里的文件名 | 对应本机文件 | 适合谁 |
| --- | --- | --- |
| `ZUEL-StudentWorkstation-v2.0.0-Setup.exe` | 中南大学生工作台-v2.0.0-安装程序.exe | **Windows 推荐**：装到开始菜单/桌面。按当前用户安装，**不需要管理员权限** |
| `ZUEL-StudentWorkstation-v2.0.0-Portable.exe` | 中南大学生工作台-v2.0.0-绿色版.exe | Windows 免安装：复制到任意文件夹（或 U 盘）双击即可 |
| `ZUEL-StudentWorkstation-v2.0.0-Deploy.msi` | 中南大学生工作台-v2.0.0-单位部署.msi | Windows 学校统一部署用，通常需要管理员权限 |
| `ZUEL-StudentWorkstation-v2.0.0-macOS.dmg` | 中南大学生工作台-v2.0.0-macOS.dmg | **苹果电脑**：Intel 与 Apple 芯片通用；首次打开需「右键 → 打开」 |

> 文件名是英文的，是因为 GitHub 的 Release 附件**不支持中文名**（会被清成 `-.exe`）；
> 下载后建议改回中文名再分发。文件名里都带版本号，拿到手就知道是哪一版。

### ⬆️ 从旧版升级

直接覆盖安装、或换用新版绿色版即可 —— 数据存在本机应用数据目录里（桌面版每次保存都会自动镜像一份 `workstation-data.json`），**升级不会丢数据**。
在「系统设置 → 数据固化」能看到当前状态（桌面版应显示**已开启**）；想手动再固化一份，点「立即固化一份到磁盘」。

### 🙏 致谢

**鸣谢**：产品思路受 [辅导员 AI 工作台](https://github.com/L-uo/counselor-ai-workbench/releases/tag/v1.1.0) 启发；本项目为独立实现，非其 fork。每一版改了什么，见仓库里的 `CHANGELOG.md`。


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

# 架构契约 · 中南大学生工作台

> 这份文档是**给人和 AI 共同看的接口说明书**。
> 改代码前先读「三条铁律」和「分层图」；不确定某个函数归谁管，就查模块表。
> 违反契约的后果不是"不好看"，而是**构建直接失败**。

```
src/  ──tools/build.js──▶  中南大学生工作台.html  ──.build/build-desktop.js──▶  app/src/index.html  ──tauri build──▶  安装包
```

---

## 一、三条铁律

### 1. 唯一产物

全仓库只有一个产物：`中南大学生工作台.html`。
它**不手工编辑** —— 由 `src/` 构建生成。手改产物会在下次构建被覆盖。

### 2. 顺序由依赖图算出，不由人排

`src/manifest.json` 是**唯一真相源**。构建器读它、拓扑排序、拼出产物。

- ❌ 永远不要加 `.module-order.json` 那样的手工顺序文件
- ❌ 永远不要为了"归类好看"把不相邻的段落合并成一个文件
- ✅ 想调整结构，就改 manifest + 移动文件，让机器算顺序

**为什么这条最重要**：重构前整个项目被一条「顺序即依赖」铁律锁死 ——
`students` 被切成 6 个文件、`list` 切成 5 个、`core` 切成 9 个，
因为它们在原始代码里被别的功能隔开。移动一个文件就可能改坏执行时序，
于是「移动 / 合并 / 分解一个模块」成了危险操作。

现在顺序由依赖图算出来，这个限制解除了。

### 3. 分层只允许向下

L0 → L1 → L2 → L3 → L5，箭头方向就是依赖方向。反向依赖构建直接报错。

唯一例外：**L3 外壳调用 L5 页面**是设计如此（路由必须知道有哪些页面），
但必须显式写在 `routeDeps` 里 —— 声明了就合法，不声明就报错。
这样「碰巧用了某个 feature 的内部函数」和「这是我要路由的页面」能区分开：
前者是架构腐化，后者是设计。

---

## 二、分层图

```
  L0 kernel          内核。不依赖任何人
     │                注册表 / 事件总线 / 页面表 / 生命周期 / 纯工具
     ▼
  L1 core           状态 · 持久化 · 主题 · 通用零件 · 预置内容
     │                谁都能用，不认识任何业务
     ▼
  L2 domain         纯业务规则。零 DOM，可在 node 里直接单测
     │                导入铁律 / 字段元数据 / 宿舍解析
     ▼
  L3 shell          外壳：路由 · 页面注册表 · 侧栏
     │                可以调用页面（须写在 routeDeps）
     ▼
  L5 feature        页面与功能
```

**为什么 domain 层是关键**：它把「合并导入会不会弄丢备注」这种
最不该出错的逻辑，从界面代码里剥了出来，变成可以逐条断言的纯函数。
重构前这些规则只能被端到端测试间接覆盖，而端到端覆盖不到
「CSV 内部合并」这种路径 —— v2.1.x 正是在那里漏掉了铁律③。

---

## 三、模块表

50 个模块。`id` = 路径去掉 `.js` 后把 `/` 换成 `.`（可从路径反推）。

### L0 kernel — 内核

| id | 目录 | 职责 |
|---|---|---|
| `kernel.00-kernel` | kernel/ | 注册表 `K.provide/use`、事件 `K.on/emit`、页面表 `K.registerPage`、生命周期 `K.def/ready`、纯工具（`$` `esc` `fmtDate` `studentName`） |

### L1 core — 地基

| id | 目录 | 职责 |
|---|---|---|
| `core.state` | core/ | 全局状态 `S`、批次助手、成绩层读写入口 |
| `core.persist` | core/ | `load()` / `save()` / 老存档迁移 / 磁盘镜像 |
| `core.theme` | core/ | 三套主题的切换与同步 |
| `core.ui-kit` | core/ | 确认框、通知、弹层键盘、焦点陷阱 |
| `data.app-meta` | data/ | `APP_VER`（构建时注入） |
| `data.seed` | data/ | 演示学生数据、预置链接与模板、二维码 |
| `data.presets` | data/ | 预置常量（奖学金分项等） |
| `data.quotes` | data/ | 育人金句库 |

### L2 domain — 纯规则（**重点：可直接单测**）

| id | 目录 | 职责 |
|---|---|---|
| `domain.import-rules` | domain/ | **四条铁律**：按列合并、去重、排除字段、点名未匹配。`tests/test-domain.js` 逐条断言 |
| `domain.field-schema` | domain/ | 字段分组、别名归一、空值哨兵、筛选字段池 |
| `domain.dorm` | domain/ | 房间 key 与床位号解析（三种表结构都要吃下） |
| `domain.roster` | domain/ | 识别「入党积极分子名册」这类表 + 政治面貌同步规则 |
| `domain.table-detect` | domain/ | 表头行定位（标题带 / 盖章栏 / 填报日期的干扰） |

### L3 shell — 外壳

| id | 目录 | 职责 |
|---|---|---|
| `shell.router` | shell/ | `renderMain()`：从 13 分支 if 链换成查注册表 |
| `shell.page-registry` | shell/ | **全部页面的声明式清单**：id / 标题 / 图标 / 导航组 / 徽标 / 是否需要数据 |
| `shell.app-shell` | shell/ | 响应式断点、侧栏渲染、批次条 |

### L5 feature — 页面与功能

**views/**（一页一文件）

| id | 职责 |
|---|---|
| `views.dashboard` | 数据总览（手写 SVG 图表） |
| `views.list` | 学生列表 + 侧栏渲染 |
| `views.student-detail` | 学生详情、编辑、跟进记录区块 |
| `views.dorm` | 宿舍看板、查寝打分表 |
| `views.calendar` | 校历作息 |
| `views.guide` | 导入指引 |
| `views.onboarding` | 首次打开的分步向导 |
| `views.profile` | 个人中心 |
| `views.dash-filter` | 总览页筛选器 |
| `views.topbar` | 顶栏交互（金句点击） |

**features/**（功能片段）

| id | 职责 |
|---|---|
| `features.import` | 合并入库的三种模式 |
| `features.import-wizard` | 导入向导状态机 |
| `features.grade-import` | 成绩导入（表头在第 3 行） |
| `features.multisheet` | 一份导出里多张表的处理 |
| `features.export` | 导出 CSV / xlsx |
| `features.backup` | 完整备份与恢复 |
| `features.import-history` | 导入历史与快照复原 |
| `features.batch-manager` | 批次管理弹层 |
| `features.filter` | 筛选状态与操作 |
| `features.custom-filter` | 自定义筛选与保存 |
| `features.modals` | 弹层关闭（未保存改动拦截 / 导入结果页补刷） |
| `features.list-toolbar` | 列表顶部统计条 |
| `features.search` | 防抖搜索 + ⌘K 快捷键 |
| `features.tags` | 关注视图预设 · 关注标签 · 跟进记录 |
| `features.delete` | 撤销快照 · 删除学生 · 勾选批量 |
| `features.award` | 奖学金评选 |
| `features.settings` | 系统设置（外观 / 学期 / 数据管理） |
| `features.password` | 改密码 |
| `features.lock` | 锁屏与解锁 |
| `features.runtime-prefs` | 托盘常驻 / 开机启动 |
| `features.quote-rotation` | 顶栏金句轮换 |
| `features.tour` | 页面浮窗导览 |
| `features.library` | 内容库（导航 / 模板 / 制度） |
| `data.demo` | 演示数据编组（宿舍按性别编组、推导室友） |

---

## 四、四道门禁（构建时强制）

`node tools/build.js` 不只是拼接，它是**架构门禁**。失败即架构被破坏。

| 门禁 | 拦什么 | 为什么它阴 |
|---|---|---|
| **1 无重复符号** | 跨模块同名顶层定义 | JS 允许同名，后定义的**静默覆盖**先定义的 |
| **2 分层方向** | 低层依赖高层；routeDeps 指向已删模块 | 地基反过来依赖墙皮，改一个勾选框会炸掉持久化层 |
| **3 依赖已声明** | 用了别层的符号却没写进 `deps` | 「我以为不依赖」是分层腐化的起点 |
| **4 加载期依赖** | 顶层 `const` 的初始化式引用了别处符号 | 只有这种才受拼接顺序影响，其余全是运行时依赖 |

门禁 4 是这套架构能成立的关键。它区分了两种依赖：

- **运行时依赖**（A 的函数调 B 的函数）—— function 声明会提升，与顺序**无关**
- **加载期依赖**（`const X = f()`）—— 加载那一刻就求值，顺序**有关**

实测：全仓库 639 个顶层符号、335 条依赖边，**加载期依赖只有 7 条**。
这就是「顺序无关」的全部秘密 —— 不是代码变干净了，
而是**排序只看真正需要排序的那部分**。

`deps` 由 `--fix-deps` 自动回填（实测事实，不是判断）；
`id` / `layer` / `file` / `entry` 由人决定。

---

## 五、模块之间怎么通信

**只允许通过内核（K）通信，模块之间不互相调用。**

```
              ┌──────────────┐
              │              │  ← 只有内核能被依赖
              │    kernel    │
              │  K.provide   │
              │  K.use       │
              │  K.on/emit   │
              │  K.registerPage │
              └──────┬───────┘
                     │  读 S、调 save()、用 toast()、发事件
       ┌──────┬──────┼──────┬──────┐
       ▼      ▼      ▼      ▼      ▼
    award  dorm  import  list  dorm …
```

- ✅ 模块 A 读 `S.xxx`、改完调 `save()`、用 `toast()` / `askConfirm()`
- ✅ 模块 A 触发 `renderMain()` / `renderSidebar()` 之类的公共入口
- ✅ 需要别的模块做事时**发事件**：`K.emit('data:batches-changed', ...)`
- ❌ 模块 A 直接调用模块 B 的内部函数（那会在 manifest 里露出跨层边）

**为什么**：模块间一旦互相调用，就形成隐藏依赖网。
并行开发时「我只改了我的文件」就不再成立 —— 改 A 会炸 B，
而 A 的文件里看不出这一点。

### 已有的三处软依赖（用能力注册表达，不是硬引用）

| 谁提供 | 提供什么 | 谁在用 | 为什么必须这样 |
|---|---|---|---|
| `features.award` | `K.provide('award.sortKeys')` | `core.persist` 读存档时校验排序键 | core 反向依赖 feature 是分层倒置 |
| `core.ui-kit` | `K.provide('ui.closeConfirm')` | 自己的弹层栈 | 同上 |
| `features.modals` | `K.provide('ui.closeModal')` | `core.ui-kit` 的弹层栈 | 同上 |

**软依赖 = 「有没有都行，有就用更好的」**。内核给的是
`K.has(name)` 探测 + `K.use(name)` 取用，不强制存在。
所以这类依赖不会让模块加载失败，但**少注册一次就会静默降级**
（例：`award.sortKeys` 漏了 → 存档里的非法排序键悄悄回退成「总成绩」，
表现为「我明明按绩点排的，刷新就变了」）。所以注释里会写明漏掉的后果。

---

## 六、并行开发工作流

每个任务只做三件事：

1. **认领** —— 在上面的表里找到负责模块，只改它的文件
2. **自测** —— 跑该模块的测试
3. **构建** —— 跑全量校验，通过就完

```bash
node tools/build.js                # 构建 + 四道门禁
node tools/build.js --verify       # 再与基线逐字节比对
node tools/build.js --fix-deps     # 自动回填实测依赖
node tools/analyze.js              # 打印真实依赖图（人读的）
node tests/run.js                  # 全量回归（400+ 断言）
node tests/test-domain.js          # 只测 domain 纯函数（快）
NODE_PATH=.../node_modules node .build/smoke.js   # 真实浏览器冒烟
```

`--verify` 在重构期最有用：只要产物与基线不一致，构建就红。
改坏了会立刻知道，而不是等到用户点开才发现。

**并行开发时的冲突面**：不同模块 = 不同文件 = 物理上不冲突。
构建器的门禁 1 兜住「两个 Agent 各自加了同名函数」这种情况
——那在 JS 里是静默覆盖，测试也可能全绿。

---

## 七、怎么新增一个模块

1. 在对应目录下建 `<name>.js`（目录 = 层，见第二节）
2. 在 `src/manifest.json` 里加一条：`{ id, file, layer, deps: [] }`
   - `id` = 路径去掉 `.js` 后把 `/` 换成 `.`
   - `deps` 先留空，下一步自动填
3. `node tools/build.js --fix-deps` —— 自动算出实测依赖
4. `node tools/build.js` —— 四道门禁应该全绿
5. 如果它是个**页面**：在 `shell/page-registry.js` 加一条声明

### 如果是个新页面

在 `shell/page-registry.js` 加：

```js
K.registerPage({ id:'newpage', title:'新页面', icon:'doc', nav:'work', order:60,
  needsData:true, render: renderNewPage, goto: gotoNewPage });
```

**router 和侧栏都不用改** —— 这是页面注册表化的全部意义。
`needsData:false` 的页面在零数据时也能打开，这个语义在重构前
是靠「在 if 链里排得够靠前」实现的，而那是一种谁也看不出意图的隐式约定。

---

## 八、这份架构要能撑住什么

模型会越来越强，但**边界不清才是协作的真正瓶颈**。
这套结构给未来任何一个更强的模型（GPT-6 / Claude / Codex …）同一份契约：

- 它能**自己判断**这活归谁、能不能碰别人的文件
- 它能**在动手前**跑构建，拿到机器反馈而不是猜
- 它不需要"读完一万行"才能定位 —— 读这份文档就够了
- 它**不需要问"这个函数该放哪"** —— 第二节的分层图给了答案

换句话说：**规模不再是限制，契约才是。** 这也是这套架构真正的目的。
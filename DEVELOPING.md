# 跨校迁移与二次开发指南

> 这份文档写给**另一个学校的老师 / 二次开发者**：
> 你想把这个工作台改成你们学校的版本，或者想改里面的功能、样式、流程。
>
> 我们假设你是非全职开发者 —— 可能是辅导员本人、学工处同事，
> 或者学校信息办临时被叫来"帮个忙"的工程师。

---

## 这份产品的一个特点

**整个产品就一个 HTML 文件**：`中南大学生工作台.html`（约 1.2 万行）。

- 没有 `node_modules`，没有 `package.json` 在产品代码里（桌面版 `app/` 才有，但那是壳）
- 没有构建步骤 —— 改完双击 .html 就能跑
- 没有框架 —— 原生 HTML + CSS + JS
- 数据存浏览器 localStorage，**不上传**

> 这意味着：**你不用懂 webpack/vite/react/vue 也能改它**。所有改动都在一个文件里搜索替换。

桌面版（Tauri）做的事情很薄：在浏览器版基础上加一层"适配层"（导出落盘、外链走系统浏览器、关右键）。**改界面 / 改业务逻辑都只改原型**，`app/src/index.html` 会自动同步。

---

## 第一步：拿到代码

```bash
git clone https://github.com/xpsmsn/zuel-student-workstation.git
cd zuel-student-workstation
```

打开你熟悉的编辑器（VSCode / Cursor / Trae / WebStorm都行）。

---

## 第二步：确认你能跑通

桌面版需要 Node + Rust：

- Node 18+ ：<https://nodejs.org/>
- Rust：<https://rustup.rs/>

浏览器版**什么都不用装**：

- 直接双击 `中南大学生工作台.html` 就能用（推荐 Chrome / Edge）
- 想看桌面版效果？跑下面这行：

```bash
cd app
npm install
npm run dev   # 桌面版开发模式（带热重载）
```

---

## 第三步：改 5 个地方改成你们学校的版本

> 找词提示：本项目里的校名简称是 **`中南大`**（正式校名「中南财经政法大学」）。
> 搜 `中南大学` 会**连带命中**「中南大学生工作台」这个产品名 —— 那是产品名，不是校名，别误改。

### 1. 产品名 / 英文缩写

打开 `中南大学生工作台.html`，**搜索替换**：

| 搜索 | 替换成 | 说明 |
|---|---|---|
| `ZUEL 辅导员工作台` | `<你们学校> 辅导员工作台` | 界面标题、窗口标题 |
| `中南大学生工作台` | `<新校全称>辅导员工作台` | 文件名、产品名 |
| `ZUEL` | `<你们学校的英文缩写>` | 顶栏 LOGO 区、学工系统链接前缀 |

> 例子：`SDNU 辅导员工作台` / `山东师大辅导员工作台` / `SDNU`

### 2. Tauri 桌面配置

打开 `app/src-tauri/tauri.conf.json`：

```json
{
  "productName": "<你们学校> 辅导员工作台",
  "identifier": "cn.edu.<你们学校>.counselor",   // ⚠️ 见下方警告
  "publisher": "<你们学校全称>"
}
```

> ### ⚠️ `identifier` 千万注意
>
> `identifier` 决定**用户电脑上数据存在哪个文件夹**。
> 一旦发给老师用上了，**改这个 = 老师所有数据"找不到" = 数据丢**。
>
> **新学校必须一开始就改，改完永远不再动**。

### 3. 校务系统地址

打开 `中南大学生工作台.html`，搜 `ZUEL_SYS`。这是几个**真实系统链接**的占位符，按下表替换：

| 旧值 | 替换成 |
|---|---|
| `https://zuel-sa.zuel.edu.cn` | 你们学校智慧学工 / 学工系统登录地址 |
| `https://jw.zuel.edu.cn` | 你们学校教务系统登录地址 |
| `https://library.zuel.edu.cn` | 图书馆 / 其它常用入口 |

### 4. 字段别名表（你们学校成绩表列名不一样时）

打开 `中南大学生工作台.html`，搜 **「字段别名表」**。这是软件识别 Excel 列名的规则表。

每行像这样：
```js
{ from: '学号',  to: 'sid' }   // 我们学校教务导出叫「学号」→ 软件内部字段 sid
{ from: '姓名',  to: 'name' }  // 「姓名」→「name」
```

你们学校叫「StudentID」、「学生编号」、「学 号」？**直接加一行**：
```js
{ from: 'StudentID',  to: 'sid' }
```

> 不会搜「字段别名表」？按 Ctrl+F 搜 `from: '学号'` —— 关键字就是这个。

### 5. 校徽图标

替换 `assets/校徽.ico`（桌面版要用）和 `app/src-tauri/icons/icon.ico`（Tauri 打包用）。

新校徽图标要 .ico 格式（Windows）和 .icns 格式（Mac）。可以用现成工具：

- ICO：<https://convertio.co/zh/png-ico/>
- ICNS：<https://iconutil.com/>

跑这个脚本批量切尺寸：

```bash
python .build/pack/make-icons.py   # 从新校徽 PNG 切 32/128/256/512/ico
python .build/pack/make-icns.py    # 同上 .icns
```

---

## 第四步：验收

改完之后必须跑一遍：

```bash
node .build/test/check-syntax.js     中南大学生工作台.html
node .build/test/test-library.js     中南大学生工作台.html
node .build/test/test-import.js      中南大学生工作台.html
node .build/test/test-v196.js        中南大学生工作台.html
node .build/test/test-delete-backup.js 中南大学生工作台.html
node .build/test/test-desktop.js     app/src/index.html
```

全部通过才能发给老师。再**自己手动点一遍**：导入两份表 → 看总览 → 看宿舍看板 → 试一次奖学金评选 → 导出查寝表。

---

## 第五步：出包（可选）

```bash
node .build/sync/build-desktop.js      # 同步桌面版
cd app && npm run build                 # 出 .msi 与 .exe
```

产物在 `app/src-tauri/target/release/bundle/`。Mac 版需要苹果机器或 GitHub Actions（仓库里已配好 `.github/workflows/build-macos.yml`）。

---

# 🤖 用 WorkBuddy 这类 AI 工具二次开发

> 这一节写给**完全不想看代码、只想用对话改东西**的老师 / 同事。

[WorkBuddy](https://www.workbuddy.cn) 这类工具**支持直接打开本地文件夹**，跟它对话就行。下面的写法你照搬、把占位符换成自己的就行。

## 用对话改产品名

```
请把 ZUEL 辅导员工作台 全部改成 SDNU 辅导员工作台，
并把 ZUEL 全部改成 SDNU。
```

> 它会自己搜、自己改。
> **改完一定要看 CHANGELOG.md（更新日志）** 那一节"两个地方千万别乱动"——别让 AI 误改 `identifier`。

## 用对话改列名

```
我们的教务系统导出的成绩表列名叫 StudentID / FullName / Major，
软件原来认的是 学号 / 姓名 / 专业。请帮我加上字段别名。
提示：搜 中南大学生工作台.html 里的「字段别名表」，在那个数组里加 3 行。
```

## 用对话改样式

界面有**硬性规则**，先让 AI 读规范：

```
请先读 docs/design/视觉设计规范.md 全文（共 12 条铁律），然后告诉我
"已读完，准备就绪"，我再告诉你具体要改什么。
```

> 12 条铁律是**硬性约束**，不是建议。AI 不读就改容易违反。

## 用对话加新功能

```
我想在侧栏「常用工具」里加一项「学生证补办登记」，点进去能看到
一个表格（姓名 / 学号 / 补办时间 / 备注），能新增、删除、导出 CSV。
请按现有内容库三页（校务导航 / 常用模板 / 制度速查）的样式实现。
```

> 内容库三件（校务导航 / 常用模板 / 制度速查）是**模板化设计**——复制其中一件的代码改字段最快。
> 但要注意：本项目**强约定 12 条铁律**（栅格、字号、圆角、hover 规则），AI 必须先读 `docs/design/视觉设计规范.md` 才能写对。

## 用对话出包

```
请帮我出 v1.0 安装包：
1. 把 app/src-tauri/tauri.conf.json 的 version 改成 1.0.0
2. 跑 npm run build（cd app && npm run build）
3. 用 python .build/pack/pack-release.py 把产物放进 发布/
4. 提示我人工 commit + push（git push 你可能没权限）
```

> 出包会构建 Rust（第一次慢、之后快）。**别在老旧机器上跑**，编译会卡死。

---

# 排错指南

| 现象 | 原因 | 怎么办 |
|---|---|---|
| 桌面版改了原型没生效 | `app/src/index.html` 没同步 | 跑 `node .build/sync/build-desktop.js` |
| 改了样式浏览器没变化 | 浏览器缓存 | Ctrl+F5 强制刷新 / 关掉重开 |
| 改完点按钮报错 | JS 写错了 | 跑 `node .build/test/check-syntax.js 中南大学生工作台.html` 看哪一行错 |
| 改了 `identifier` 后旧数据找不到了 | `identifier` 决定数据文件夹，改了就找不到 | ⚠️ **永远不要改 identifier**（除非你一开始就没发过包） |
| 改了样式但被旧规则盖住 | 样式层叠顺序 | 看 `docs/design/视觉设计规范.md` 第 14-15 行 —— 加在文件末尾的 `<style id="award-notion-fix">` 覆盖层里 |

---

# 想更深入？

- [QUICKSTART.md](QUICKSTART.md) —— 第一次用？3 分钟走完
- [README.md](README.md) —— 项目概览 + 下载
- [CHANGELOG.md](CHANGELOG.md) —— 历史改了什么
- [docs/design/视觉设计规范.md](docs/design/视觉设计规范.md) —— 12 条铁律
- [.build/README.md](.build/README.md) —— 构建 / 测试脚本说明
- [.build/test/](.build/test/) —— 28 个真实数据回归测试，看断言就能学怎么用 API

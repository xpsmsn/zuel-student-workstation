# 第一轮整改 · 核验记录（静态）

对象：`app/src/index.html`（构建产物；源文件为 `中南大学生工作台.html`）

## ① 焦点环：新规则能否压过历史那些 `outline:none`

新规则选择器：`:focus-visible:not(#dsh-a11y-guard)`　特异性 **(1,1,0)**

| 历史规则（关掉了焦点环） | 来源 style 块 | 特异性 | !important | 新规则是否压过 |
|---|---|---|---|---|
| `input` | (anonymous) | (0,0,1) | 无 | ✅ 压过 |
| `select` | (anonymous) | (0,0,1) | 无 | ✅ 压过 |
| `textarea` | (anonymous) | (0,0,1) | 无 | ✅ 压过 |
| `.aw-split-row input:focus` | (anonymous) | (0,2,1) | 无 | ✅ 压过 |
| `.aw-q-num:focus` | (anonymous) | (0,2,0) | 无 | ✅ 压过 |
| `.aw-select:focus` | (anonymous) | (0,2,0) | 无 | ✅ 压过 |
| `.aw-select:focus` | (anonymous) | (0,2,0) | 无 | ✅ 压过 |
| `.input` | (anonymous) | (0,1,0) | 无 | ✅ 压过 |
| `.aw-select:focus` | notion-system | (0,2,0) | 无 | ✅ 压过 |
| `table select:focus` | notion-system | (0,1,2) | 无 | ✅ 压过 |
| `input:focus` | notion-system | (0,1,1) | 无 | ✅ 压过 |
| `select:focus` | notion-system | (0,1,1) | 无 | ✅ 压过 |
| `textarea:focus` | notion-system | (0,1,1) | 无 | ✅ 压过 |
| `.input:focus` | notion-system | (0,2,0) | 无 | ✅ 压过 |
| `.input:focus` | award-notion-fix | (0,2,0) | 有 | ✅ 压过 |
| `.lock-input:focus` | lock-screen-style | (0,2,0) | 无 | ✅ 压过 |
| `.aw-bulk-pick:focus` | award-workbench-v2 | (0,2,0) | 无 | ✅ 压过 |
| `.aw-split-row .aw-split-bot input[type="number"]:focus` | award-workbench-v2 | (0,4,1) | 有 | ✅ 压过 |

**结论：全部压过。** 历史规则里特异性最高的是 `.aw-split-row .aw-split-bot input[type="number"]:focus` (0,4,1)，
仍低于新规则 (1,1,0)；两边都是作者样式时，层叠按「特异性 → 源序」判定，而 `round1-a11y` 又是文档里最后一个 style 块。

## ② 对比度（WCAG 2.1 AA，正文与辅助文字 ≥ 4.5:1）

| 主题 | 用途 | 前景 | 背景 | 对比度 | 判定 |
|---|---|---|---|---|---|
| light | 二级文字 | #6b6a66 | card #ffffff | 5.41 | ✅ |
| light | 二级文字 | #6b6a66 | page #ffffff | 5.41 | ✅ |
| light | 二级文字 | #6b6a66 | thead #f1f1ef | 4.79 | ✅ |
| light | 二级文字 | #6b6a66 | hover #f7f6f3 | 5.01 | ✅ |
| light | 三级/辅助文字 | #616d82 | card #ffffff | 5.23 | ✅ |
| light | 三级/辅助文字 | #616d82 | page #ffffff | 5.23 | ✅ |
| light | 三级/辅助文字 | #616d82 | thead #f1f1ef | 4.62 | ✅ |
| light | 三级/辅助文字 | #616d82 | hover #f7f6f3 | 4.84 | ✅ |
| light | 危险色文字 | #b3302f | 危险浅底 #fdebeb | 5.4 | ✅ |
| light | 警告色文字 | #a35f00 | 警告浅底 #fef3e6 | 4.57 | ✅ |
| light | 成功色文字 | #0f7a3d | 成功浅底 #e6f4ea | 4.78 | ✅ |
| light | 主按钮白字 | #ffffff | accent-solid #1c72c6 | 4.92 | ✅ |
| light | 强调文字（链接） | #1c72c6 | card #ffffff | 4.92 | ✅ |
| dark | 二级文字 | #c0bfba | card #373c3f | 6.06 | ✅ |
| dark | 二级文字 | #c0bfba | page #2f3437 | 6.84 | ✅ |
| dark | 二级文字 | #c0bfba | thead #3d4245 | 5.53 | ✅ |
| dark | 二级文字 | #c0bfba | hover #42474a | 5.11 | ✅ |
| dark | 三级/辅助文字 | #b3bfd1 | card #373c3f | 6 | ✅ |
| dark | 三级/辅助文字 | #b3bfd1 | page #2f3437 | 6.77 | ✅ |
| dark | 三级/辅助文字 | #b3bfd1 | thead #3d4245 | 5.47 | ✅ |
| dark | 三级/辅助文字 | #b3bfd1 | hover #42474a | 5.06 | ✅ |
| dark | 危险色文字 | #f09090 | 危险浅底 #4a2c2c | 5.39 | ✅ |
| dark | 警告色文字 | #e0a94a | 警告浅底 #4a3a24 | 5.17 | ✅ |
| dark | 成功色文字 | #5cc98a | 成功浅底 #2c3f33 | 5.45 | ✅ |
| dark | 主按钮白字 | #ffffff | accent-solid #1f6fb8 | 5.22 | ✅ |
| dark | 强调文字（链接） | #6cb0f2 | card #373c3f | 4.85 | ✅ |
| eye | 二级文字 | #4f5d47 | card #eaefdd | 5.98 | ✅ |
| eye | 二级文字 | #4f5d47 | page #dfe6d5 | 5.49 | ✅ |
| eye | 二级文字 | #4f5d47 | thead #dde3d0 | 5.34 | ✅ |
| eye | 二级文字 | #4f5d47 | hover #d3dcc6 | 4.96 | ✅ |
| eye | 三级/辅助文字 | #52604a | card #eaefdd | 5.71 | ✅ |
| eye | 三级/辅助文字 | #52604a | page #dfe6d5 | 5.24 | ✅ |
| eye | 三级/辅助文字 | #52604a | thead #dde3d0 | 5.1 | ✅ |
| eye | 三级/辅助文字 | #52604a | hover #d3dcc6 | 4.73 | ✅ |
| eye | 危险色文字 | #9c3f39 | 危险浅底 #efd9d6 | 4.89 | ✅ |
| eye | 警告色文字 | #7a5518 | 警告浅底 #efe3c8 | 5.25 | ✅ |
| eye | 成功色文字 | #3f6a4b | 成功浅底 #d7e3cb | 4.66 | ✅ |
| eye | 强调文字（链接） | #3f6a4b | card #eaefdd | 5.3 | ✅ |

**全部达标（≥4.5:1）。**

## ③ 本机没做成的两项验收

沙箱禁止子进程打开命名管道（`mojo platform_channel: 拒绝访问`），Edge/Chromium 无法在本会话启动，
所以「真实截图」和「axe 自动扫描」需要人在浏览器里跑一次。可直接粘贴到 DevTools Console：

```js
// 1) 焦点环是否真的画出来：自动聚焦每个可聚焦元素并读 outline
[...document.querySelectorAll("input,select,textarea,button,a[href],[tabindex]")].forEach((el,i)=>{
  el.focus({focusVisible:true});
  const cs=getComputedStyle(el);
  if(cs.outlineStyle==="none"||parseFloat(cs.outlineWidth)<2) console.warn("焦点不可见 #"+i, el, cs.outlineStyle, cs.outlineWidth);
});
console.log("焦点检查完成：没有 warn 即全部可见");
```
```js
// 2) 窄屏统计条：把窗口调到 412px 宽后执行，期望两列
getComputedStyle(document.querySelector(".stats-4")).gridTemplateColumns
```
```js
// 3) 全站对比度：需要 axe-core（把 axe.min.js 内容粘进来后）
axe.run(document,{runOnly:["color-contrast"]}).then(r=>console.log(r.violations))
```
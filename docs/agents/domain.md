# Domain Docs

本仓库的工程类 skill 在探索代码库时应如何消费领域文档。

## 探索之前先读这些

- 仓库根目录的 **`CONTEXT.md`**，或
- 仓库根目录的 **`CONTEXT-MAP.md`**（如果存在）：它指向每个 context 各一份 `CONTEXT.md`。挑与当前话题相关的读。
- **`docs/adr/`**：读与你要动的区域相关的 ADR。多 context 仓库还要看 `src/<context>/docs/adr/` 里 context 级决策。

这些文件不存在就**静默继续**。不要指出它们缺失，也不要一上来就建议创建。`domain-modeling` skill（经 `grill-with-docs` 与 `improve-codebase-architecture` 到达）会在术语或决策真正定下来时按需创建。

## 文件结构

单 context 仓库（本仓库属于这一类）：

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-xxx.md
│   └── 0002-xxx.md
├── 中南大学生工作台.html
├── app/
└── .build/
```

多 context 仓库（根目录有 `CONTEXT-MAP.md`）：

```
/
├── CONTEXT-MAP.md
├── docs/adr/                          ← 系统级决策
└── src/
    ├── ordering/
    │   ├── CONTEXT.md
    │   └── docs/adr/                  ← context 级决策
    └── billing/
        ├── CONTEXT.md
        └── docs/adr/
```

## 用 glossary 的词汇

output 里一旦出现领域概念（issue 标题、重构提案、假设、测试名），就用 `CONTEXT.md` 里定义的词。不要漂移到 glossary 明确避开的同义词。

如果你需要的概念还没进 glossary，这是个信号：要么你在发明项目根本不用的说法（重新考虑），要么真有缺口（记下来交给 `domain-modeling`）。

## ADR 冲突要显式标出

如果 output 与已有 ADR 矛盾，明确摆出来，不要默默覆盖：

> _与 ADR-0007（event-sourced orders）冲突，但值得重开，因为……_

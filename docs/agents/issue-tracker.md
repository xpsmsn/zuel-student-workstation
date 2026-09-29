# Issue tracker：GitHub

本仓库的 issue 与 spec 都以 GitHub issue 的形式存在。所有操作使用 `gh` 命令行。

## 约定

- **新建 issue**：`gh issue create --title "..." --body "..."`。多行正文用 heredoc。
- **读 issue**：`gh issue view <number> --comments`，用 `jq` 过滤评论，并一并取回标签。
- **列 issue**：`gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'`，配合相应的 `--label` 与 `--state` 过滤。
- **评论**：`gh issue comment <number> --body "..."`
- **加 / 去标签**：`gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **关闭**：`gh issue close <number> --comment "..."`

仓库从 `git remote -v` 推断；在 clone 目录里运行 `gh` 时会自动识别。

## PR 是否作为 triage 入口

**PRs as a request surface: no.**（若本仓库把外部 PR 当作需求提交，改成 `yes`；`triage` 会读这个开关。）

设为 `yes` 时，PR 与 issue 走同一套标签与状态，命令换成 `gh pr` 对应项：

- **读 PR**：`gh pr view <number> --comments`；diff 用 `gh pr diff <number>`。
- **列待 triage 的外部 PR**：`gh pr list --state open --json number,title,body,labels,author,authorAssociation,comments`，只保留 `authorAssociation` 为 `CONTRIBUTOR`、`FIRST_TIME_CONTRIBUTOR`、`NONE` 的（丢掉 `OWNER`/`MEMBER`/`COLLABORATOR`）。
- **评论 / 打标 / 关闭**：`gh pr comment`、`gh pr edit --add-label`/`--remove-label`、`gh pr close`。

GitHub 的 issue 与 PR 共用一个编号空间，所以光看 `#42` 分不清是哪种：先 `gh pr view 42`，不行再退回 `gh issue view 42`。

## 当某个 skill 说 "publish to the issue tracker"（发布到 issue tracker）

创建一个 GitHub issue。

## 当某个 skill 说 "fetch the relevant ticket"（取回相关工单）

运行 `gh issue view <number> --comments`。

## Wayfinding 操作

供 `wayfinder` 使用。**map** 是一个 issue，**child** issue 是它的 ticket。

- **Map**：单个 issue，标签 `wayfinder:map`，正文装 Notes / Decisions-so-far / Fog。`gh issue create --label wayfinder:map`。
- **Child ticket**：作为 GitHub sub-issue 挂到 map 上（`gh api` 调 sub-issues 端点）。不支持 sub-issue 时，把 child 加进 map 正文的任务列表，并在 child 正文顶部写 `Part of #<map>`。标签：`wayfinder:<type>`（`research`/`prototype`/`grilling`/`task`）。认领后 assign 给执行的 dev。
- **Blocking**：用 GitHub 原生 issue dependencies（规范、UI 可见）。加边：`gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`，其中 `<blocker-db-id>` 是阻塞者的数字 **database id**（`gh api repos/<owner>/<repo>/issues/<n> --jq .id`，**不是** `#number` 也不是 `node_id`）。GitHub 用 `issue_dependencies_summary.blocked_by` 报告（只算未关闭的阻塞者，是真正的放行闸门）。不支持 dependencies 时，退回在 child 正文顶部写 `Blocked by: #<n>, #<n>`。所有阻塞者关闭后，ticket 才算解锁。
- **Frontier query**：列出 map 下所有未关闭的 child（`gh issue list --state open`，范围限定在该 map 的 sub-issue / 任务列表内），丢掉任何有未关闭阻塞者（`issue_dependencies_summary.blocked_by > 0`，或 `Blocked by` 行内有未关闭 issue）或已有 assignee 的；按 map 顺序取第一个。
- **Claim**：`gh issue edit <n> --add-assignee @me`，本会话的第一次写入。
- **Resolve**：`gh issue comment <n> --body "<answer>"`，然后 `gh issue close <n>`，再把一条上下文指针（gist + 链接）追加到 map 的 Decisions-so-far。

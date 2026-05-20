<!--
This file is a verbatim copy of docs/integrations/galley-supervisor-sop.md
shipped inside the `galley-supervisor` Claude Skill so the skill stays
self-contained when installed at ~/.claude/skills/.

CANONICAL SOURCE: docs/integrations/galley-supervisor-sop.md in the
github.com/wangjc683/galley repository.

Last synced: 2026-05-20 (M5 T5.2 ship).

If you find divergence between this copy and the canonical file, the
canonical version wins. Re-sync this copy when you update the canonical.
-->

# Galley Supervisor SOP

> **For GA bots and IM frontends.** This file lives in your GA `memory/`
> folder. When the user asks you to do something that involves managing
> Galley sessions ("帮我看看 Galley 上跑了什么"、"开个 session 让 Galley
> 跑 X"、"把那个对话归档"), you are acting as a **Galley Supervisor**.
> Follow this SOP.
>
> Status: v0.5 draft. Schema version: 1.

## 0. 你的角色

你是 **Supervisor**。Human user 在 IM 里跟你聊天；你的副业是远程帮 ta
管理桌面 Galley 跑的 session team。Galley 是本地 agent 编排器，每个
session 是一段独立的 agent 工作（写代码、读文档、跑分析）。

你能通过 `galley` CLI 远程操作那台机器的 Galley，但**你看不到**
session 内部对话内容（除非显式 `galley session show`）；你也**不能**
帮 user 写 prompt——你的工作是 orchestration，不是 ghostwriting。

**Three rules of thumb:**

1. **Inventory before action**：先 `galley sessions list` / `status` 看
   全局，再决定开什么、停什么。盲下命令容易开重复 session。
2. **Destructive 操作 ≠ 默默执行**：`archive` / `delete` / `stop`
   是 user 的决定，不是你的。先 brief，user 确认后再 invoke。
3. **Origin 永远填**：`--supervisor=<your-id>` + `--reason=<为什么>`
   是 Galley 的审计来源。Audit log 里清楚是谁、为什么做了 X。

---

## 1. Discovery · 找到 galley CLI

Galley 把 CLI 二进制的绝对路径写在 discovery file 里。**第一步永远读
这个文件**——不要假设 `galley` 在 PATH 上（多数 user 没装 PATH
symlink）。

### macOS / Linux

```bash
cat ~/.config/galley/cli-path
# /Applications/Galley.app/Contents/MacOS/galley
```

### Windows

```powershell
type "$env:APPDATA\galley\cli-path"
# C:\Program Files\Galley\galley.exe
```

### 文件不存在怎么办

User 还没装 Galley，或者装了没启动过。回复 user：

> 「找不到 `~/.config/galley/cli-path`——看起来你还没启动过 Galley，或者
> 是旧版没有写 discovery file。先打开 Galley 一次，让它建好路径，然后
> 我再继续。」

不要尝试硬编码常见安装路径——版本升级会换路径。

### 把 CLI 路径存进变量

之后每次调命令都用绝对路径。Shell 风格示例：

```bash
GALLEY="$(cat ~/.config/galley/cli-path)"
"$GALLEY" sessions list
```

后面所有命令示例都用 `galley` 缩写指代「discovery file 给的那个
binary 路径」，不是 PATH 上的 `galley`。

---

## 2. 命令速查

完整 schema 见 `agent-api.md`（绑定 schema_version=1，additive-only）。
本节按 noun group 列 v0.5 surface。所有命令支持 `--help`。

### 2.1 Inventory（read）

| 命令 | 用途 | 典型场景 |
|---|---|---|
| `galley sessions list` | 列出 sessions（非 archived） | "现在有什么 session 在跑" |
| `galley sessions list --all` | 含 archived | "把上周归档的也找出来" |
| `galley sessions list --project=<id>` | 只看某 project | "MyApp 项目下的对话" |
| `galley sessions list --status=running` | 只看运行中 | "现在 agent 正在干活的" |
| `galley sessions search "<kw>"` | FTS5 全文搜 | "找上次提过 'cache invalidation' 的对话" |
| `galley session brief <id>` | 单 session 一行摘要 | 派任务前看一眼状态 |
| `galley session show <id> --tail=20` | 末 20 message | 想了解 session 在聊什么 |
| `galley status` | 全局计数 | "现在总共有几个 session" |
| `galley health` | 健康检查 | user 报怪问题时排查 |
| `galley project list` | 列 projects | "有哪些项目分组" |
| `galley llm list` | 列可用 LLM | 切 LLM 前先看选项 |
| `galley version` | CLI + schema 版本 | debug 时用 |

读命令**不要求 Galley Core 在跑**（除了 watch）——直读 SQLite，
随时可调。

### 2.2 Operate session（write）

| 命令 | 用途 | 备注 |
|---|---|---|
| `galley session new "<task>" --supervisor=<x> --reason=<y>` | 创建 session 并放第一条任务 | **atomic**：要么 session + 消息都建，要么都不建 |
| `galley session send <id> "<text>" --supervisor=<x> --reason=<y>` | 给已有 session 加一条 user 消息 | 不 wait agent 跑完，立即返回 |
| `galley session btw <id> "<question>"` | "顺便问一句" 不进主线 | **不持久化**——重开 session 就丢；只 work 当 bridge alive |
| `galley session stop <id>` | 打断当前 turn | 不杀 bridge，user 下次 send 能继续 |
| `galley session archive <id> --supervisor=<x>` | 归档（从 sidebar 隐藏） | 可逆，`session restore` 撤销 |
| `galley session restore <id>` | 解档 | |
| `galley session move <id> --to=<project-id>` | 移到 project | 不带 `--to` 等于拆出 project |
| `galley session watch <id>` | 实时事件流（NDJSON） | 长连接，看 agent 干啥 |

### 2.3 Project + LLM（write）

| 命令 | 用途 | 备注 |
|---|---|---|
| `galley project create "<name>" --root-path=...` | 新建 project | id server 端 mint |
| `galley project delete <id> --supervisor=<x> --reason=<y>` | **destructive**——删 project；子 sessions 自动拆出 | 不可逆。返回 `detachedSessions` 计数 |
| `galley llm set <session> <llm-name>` | 切 session 的 LLM | 名字 case-insensitive，对照 `galley llm list` |

---

## 3. 常用 scenario

下面是典型 user 请求 → SOP 反应。命令都用 `"$GALLEY"`（discovery file
解出的绝对路径）。

### 3.1 "看看 Galley 现在跑了什么"

```bash
"$GALLEY" status                                     # 一句话总览
"$GALLEY" sessions list | head -20                   # 最近的
```

把结果归纳给 user。**不要**把 raw NDJSON 倒给 user——挑相关字段
（title / status / lastActivityAt）讲。

### 3.2 "帮我开个 session 让 Galley 跑 X 任务"

先看有没有重复的：

```bash
"$GALLEY" sessions search "<关键词>" | head
```

确认无冲突后建：

```bash
"$GALLEY" session new "<task 的完整描述>" \
    --supervisor=ga-im-bot \
    --reason="user requested via wechat"
```

返回 `{session, message, dispatch}`。把 `session.id` 记给 user：
"已建 session `s-xxxx`，task 已发出。需要看进度告诉我。"

**注意**：`dispatch: "persisted_only"` 是正常的——CLI 不 spawn
bridge，user 在 GUI 激活 session 才会真跑。**不要**因为
`persisted_only` 就重发 —— 重发只会重复入队同一条消息。

### 3.3 "Galley 那边的 X 任务怎么样了"

```bash
"$GALLEY" session brief <id>                         # 摘要
"$GALLEY" session show <id> --tail=10                # 最近 10 条
```

session brief 的 `status` 告诉你 agent 状态（running / idle /
waiting_approval）。`summary` 是 agent 自己写的最新 turn 摘要。
转译成自然语言给 user。

### 3.4 "再给那个 session 加个要求 / 提问"

```bash
"$GALLEY" session send <id> "<新指令>" \
    --supervisor=ga-im-bot \
    --reason="user follow-up in wechat"
```

**Side question 用 btw 不用 send**：

```bash
"$GALLEY" session btw <id> "顺便问一下当前的内存占用是多少？"
```

`/btw` 不进主消息流，agent 直接回复后继续主线 task。但 `/btw`
**不持久化**——下次 session 重开就丢。

### 3.5 "把那个 session 归档" / "停掉 / 删掉"

**先 brief，再确认，再执行**——destructive 操作。

```bash
# Step 1: brief
"$GALLEY" session brief <id>
# 回 user: "session 'xxx' 是 [title]，最后活动 [time]，要 archive 吗？"
```

User 确认后：

```bash
"$GALLEY" session archive <id> \
    --supervisor=ga-im-bot \
    --reason="user said archive in wechat"
```

`session stop` 是「打断这个 turn」，不是 destructive——但 user 可能
是想 `archive`，**主动澄清**。

### 3.6 "切 LLM"

```bash
"$GALLEY" llm list                                   # 看选项
"$GALLEY" llm set <id> "<llm-name>"                  # 按名字（case-insensitive）
```

返回 `dispatch: "dispatched" / "persisted_only"`——前者表示当前 bridge
也切了，后者表示 DB 写了但要 bridge 重启才生效。不用区分给 user
讲，直接说"切成功"。

**Edge case**: `galley llm list` 返回空 → cache 未热。让 user 在 GUI
开一次 session 让 cache warmup，再回来重试。

### 3.7 "把这几个 session 都搬到 X 项目"

```bash
for SID in s-a s-b s-c; do
    "$GALLEY" session move "$SID" --to=proj_xxx \
        --supervisor=ga-im-bot \
        --reason="bulk move requested in wechat"
done
```

PRD §11.2 grammar rule: **session 是 move 的 subject**——`session
move`，不是 `project move`。

### 3.8 "Galley 出错了 / 那个 session agent 卡住了"

```bash
"$GALLEY" health                                     # 检查 db / GA path / Python
"$GALLEY" session brief <id>                         # 看 status
"$GALLEY" session show <id> --tail=5                 # 看最后几条
```

如 status=running 但 lastActivityAt 是 5 分钟前 → agent 可能 hang。
建议 user `session stop` 后重新 send；不要自己 stop——user 可能正
等结果。

---

## 4. Destructive 命令 confirm 守则

以下命令**必须**先 brief、user 确认、再 invoke：

| 命令 | 后果 | 可逆？ |
|---|---|---|
| `session archive <id>` | 隐藏 session 从 active 列表 | ✅ `session restore` |
| `session stop <id>` | 打断当前 turn | ✅ user 再 send 能继续 |
| `project delete <id>` | **永久**删 project；子 sessions 拆出但 sessions 留 | ❌ 不可逆 |

**Confirm pattern**：

```text
User: "把那个写 README 的 session 删了"
You:  「Session 'sess_xxx'（title: '写 README'，最后活动 3 小时前，
       已 12 turns）。你是想 archive（可以恢复）还是 delete（永久
       删）？」
User: "archive 就行"
You:  [调 galley session archive ...]
```

**不要自作主张**用 archive 替换 user 的 "delete"——可能 user 真的
想清场。**也不要不问就 delete**——可能 user 口误。

`project delete` **必须**提示「会拆出 N 个 sessions」——`detachedSessions`
字段在 response 里：

```text
You:  「project 'demo'（包含 5 个 sessions：xxx / yyy / ...）。删了
       这些 sessions 会拆到 ungrouped。确认？」
```

---

## 5. Origin 字段约定

每个 write 命令都接 `--supervisor=<id>` + `--reason=<text>`。Galley 把
这俩存进 audit log（per-session 行动日志），human user 在 GUI 能看到
"3 分钟前 ga-im-bot 发了消息，reason: user said go"。

### 5.1 `--supervisor=`

**自由 freeform string**——你自己定。Galley 不校验、不注册。约定：

- IM bot：`ga-wechat-bot` / `ga-feishu-bot` / `ga-telegram-bot`
- 多实例区分：`ga-wechat-bot/jc-personal` / `ga-wechat-bot/team-default`
- Claude Skill：`claude-skill-galley-mgr/v1.2`（Skill version 跟 supervisor id 绑）

**永远填**——空的 `--supervisor` Galley 当成 `via=cli`（普通终端
用户），跟你 supervisor 身份混淆。

### 5.2 `--reason=`

**自由 freeform**。一句话讲为什么做这个动作。例子：

| Reason | 例子 |
|---|---|
| 转述 user 意图 | `"user said tldr"` / `"user wants archive via wechat"` |
| 你的自主判断 | `"detected duplicate session, auto-archive older"` |
| 系统触发 | `"daily cleanup of >30-day idle sessions"` |

**何时**必填？严格说不必填，但 destructive 操作（§4 表）+ 自主判断
**应该**填——给 human user 一个回看历史的钩子。

### 5.3 Audit 怎么看

GUI 内 session timeline 里穿插 supervisor 动作 entry（M7 落地）。User
看到："3 分钟前 ga-im-bot archive 了 sess_xxx，reason: user said
archive in wechat"。

---

## 6. Error handling

每个 CLI 命令出错都返回：

```json
{"error": "<code>", "message": "<human readable>", ...}
```

到 stdout（**不是 stderr**——agent 读一个 stream），exit code 是 §6.1
的分类。

### 6.1 Exit code 分类

| Code | Category | 含义 | 你应该怎么办 |
|---|---|---|---|
| `0` | success | OK | 继续 |
| `1` | `internal` | sqlx / FS race 等罕见 bug | 报给 user "Galley 内部错误" + 不重试 |
| `2` | `invalid_args` | 参数有问题 | **修参数**重试（如 `--llm=nonexistent` → 先 `llm list`） |
| `3` | `not_found` | session/project id 不存在 | **不要重试**——先 `sessions list` 找正确 id |
| `4` | `db_unavailable` | Galley Core 没跑 / DB 文件坏 | 告诉 user "打开 Galley app" |
| `5` | `runner_error` | bridge 没 alive / IPC 失败 | 看是否需要 user 在 GUI 激活 session 让 bridge spawn |

### 6.2 常见错误 + 处理

#### `exit 4 db_unavailable: Galley Core not running`

User 没打开 Galley app，或者 app 崩了。

```text
You: "Galley app 看起来没在跑。打开 Galley，然后告诉我，我接着帮你
     处理。"
```

**不要**反复重试——user 不开 app 你重试 10 次也没用。

#### `exit 5 runner_error: no live runner for session`

`session btw` / `llm set` 这类需要 bridge alive 的命令踩到的。Session
存在但 bridge 没 spawn（user 没在 GUI 激活过）。

```text
You: "这个 session 的 agent 还没启动。在 Galley 里点开这个 session
     一下，让它 warmup，然后再回来。"
```

#### `exit 2 invalid_args: unknown llm '<name>'`

```text
You: [运行 galley llm list]
You: "当前可选 LLM 是 [xxx, yyy, zzz]。要切哪个？"
```

#### `exit 3 not_found: session 'sess_xxx' does not exist`

**不要**重试——id 错了。先 `sessions list` / `sessions search`
找正确 id 再做。

### 6.3 Retry policy

- `exit 4` Galley Core 没跑 → **不自动重试**，告诉 user
- `exit 5` runner_error → **不自动重试**，告诉 user warmup
- `exit 2` invalid_args → **修参数后重试一次**
- `exit 3` not_found → **不重试**，重新查 id
- `exit 1` internal → **不重试**，报给 user
- `exit 0` 但 `dispatch: "persisted_only"` → **不重试**（这不是错误）

---

## 7. 不在 v0.5 surface 的事

下列功能不存在或不要替 user 做，遇到就**不接**：

- **修 GA 配置**：`galley config get / set` 不存在。Settings 是 GUI 的
  事。
- **改 GA memory**：「帮我往 GA memory 写点什么」——拒绝。GA memory
  是 GA 自己管的，宪法约束。
- **写 prompt**：你不替 user 写 session 任务的 prompt。User 给你
  什么 task 描述，原样传给 `session new`。
- **Approval 自动通过**：v0.1 默认 YOLO；如果 user 关了 YOLO，approval
  让 user 自己点，supervisor 不替决策。
- **跨机器**：Galley 是 localhost only——你只能管 user 当前打开 IM
  那台机器的 Galley。多机器协作要分开 supervisor 实例。

---

## 8. 常见错误模式（self-check）

发出命令前问自己：

- [ ] discovery file 读过吗？用绝对路径吗？
- [ ] 这是 inventory 还是 mutate？mutate 之前 brief 过 user 吗？
- [ ] `--supervisor=<我的 id>` 加了吗？
- [ ] `--reason=` 写了用 user 原话还是我的转述？
- [ ] Destructive（§4 表）的命令，user 显式确认了吗？
- [ ] exit code 不是 0 时，分类对了吗？该重试 vs 不该重试想清楚了吗？

---

## 9. See also

- **PRD**：`https://github.com/wangjc683/galley/blob/main/docs/PRD.md` §11
- **完整 schema**：`https://github.com/wangjc683/galley/blob/main/docs/agent-api.md`
- **架构原则**：`https://github.com/wangjc683/galley/blob/main/CLAUDE.md`「Galley 架构原则」
- **Galley 报错**：先看 `galley health`，再问 user

---

**Version**: v0.5 draft · schema_version=1 · 2026-05-20

调用本 SOP 时如发现 agent-api.md schema 跟本文档不一致——以
agent-api.md 为准（schema 是契约，本 SOP 是 SOP）。

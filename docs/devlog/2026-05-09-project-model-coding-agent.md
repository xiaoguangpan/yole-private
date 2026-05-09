# Project 模型 · coding agent 用户的归类容器

> Date: 2026-05-09
> Status: aligned — PRD §7.3 / §8.2 + DESIGN.md §4.2 + desktop types/migration 同步落地
> Related: [PRD §7.3](../PRD.md) · [PRD §8.2](../PRD.md) · [DESIGN.md §4.2](../DESIGN.md) · [Stage 2 收尾](./2026-05-08-stage2-desktop-skeleton-complete.md)

## Context

Stage 3 V0.1 polish 启动前，JC 跟一批 GA 真实用户沟通，发现**相当部分用户把 GA 当 coding agent 用**——这跟 PRD 早期"通用 Agent 工作台"的隐含定位相符，但 V0.1 PRD §7.3 当前的 Project 模型对 coding agent 场景**明显偏薄**。讨论目的：在不破坏 non-invasive 原则、不让 Project 滑成 Custom GPT 的前提下，定下 V0.1 Project 模型的最终形态 + sidebar Project section 的细节交互。

讨论触发的隐性问题：Cursor / Claude Code / Cline 等 ADE 在用户心智里植入了"项目"概念——cwd 绑定 / 项目 instructions（`.cursor/rules` / `CLAUDE.md`）/ 项目知识库 / 项目级 approval / 项目文件树。这 5 块原子能力哪些进 V0.1，哪些保持 non-goal，是这次讨论的实质内容。

## Decisions

### 核心定调：Project = 纯归类抽屉

- **不绑定 project instructions / system prompt**——即使是 Cursor `.cursor/rules` / Claude Code `CLAUDE.md` 那种"项目事实与约束"也不做
- 唯一 binding 仍然是 **A. 归类 + B. cwd（可选）**，跟 PRD §7.3 v0.2 初版定义一致
- 关键判断：**Project 必须完全不改变用户对 GA Agent 内核的使用体验**。GA 在 cwd `~/code/foo` 跟在 cwd `~/code/bar` 的行为完全一致，不因属于哪个 Project 而表现不同
- "把同一个项目文件夹相关的所有 sessions 统一管理"——这一句是 Project 在 V0.1 的全部价值主张，仅此而已
- PRD §7.3 改写：原"避免变成 Custom GPT 心智"为单点理由，现在升级为"完全不改变 GA 内核体验"的更宽边界，把 V0.2 的 RAG / project 默认 LLM 也一并明确不绑

### Project schema 扩展

PRD §8.2 / `desktop/src/types/session.ts` Project 加两个字段：

- `pinned: boolean` — sidebar PROJECTS section 置顶
- `lastActivityAt: string` — `max(sessions.lastActivityAt where projectId = this.id)`，无 session 时回退到 `createdAt`

排序规则：`pinned desc, lastActivityAt desc`（反映 coding agent 用户"最近用过的项目最容易再用"的真实模式）。

### Sidebar Project Section 设计（DESIGN.md §4.2 新增 7 段 spec）

Project section 仍保持在 timeline 之下的次要位置（不升格为主体），但内部交互细化为 A-G 七段 + Project View 二级页面规格：

- **A. 折叠行为**：默认 collapsed，active session 所属 project 自动展开；其他手动展开不持久化
- **B. 展开后限 5 条 session + `View all N sessions →`**：超过 5 条进入 Project View（V0.1 唯一的"sidebar 不变、主区切到次级页面"模式）
- **C. Hover affordance**：行尾 `Plus`（新建 session in this project）+ `DotsThree`（rename / change cwd / pin / delete 菜单）
- **D. Session 双重显示**：timeline 内 session row 行尾带 project emoji tag（hover 显 project name），project section 内不带（避免冗余）
- **E. 移动 session 到 project**：V0.1 仅右键菜单 `Move to project ▸`，drag/drop 留 V0.2
- **F. 排序**：`pinned desc, lastActivityAt desc`，无手动拖拽
- **G. New Project 流程**：PROJECTS section header `+` icon → Radix Dialog（name required + folder picker + emoji），唯一入口（不做"git repo 隐式发现"）

Project View 是 V0.1 唯一一个二级页面（sidebar 不变、主区换内容），ESC 或点击 sidebar 任意 session 退出。导航栈深度 = 1，不嵌套。

### Active Session 高亮：默认走 X

active session 在 timeline + project section 两处都 highlighted（杏沙背景 4% + 左侧 2px brand 竖条）——跟 Claude 网页版一致。

- Rationale：用户从任一 view 都能立刻定位"我在哪"
- 反对意见已知：sidebar 两处同时亮起视觉噪声偏大
- **此为内测前默认假设**——X / Y（仅 project 高亮）/ Z（仅 timeline 高亮）三者都合理。等真实使用收集到具体抱怨再切换

### 实现层同步落地

跟设计决策同 commit 内同步：

- `desktop/src/types/session.ts` Project 加 `pinned: boolean` + `lastActivityAt: string`
- `desktop/src/types/db.ts` ProjectRow 加 `pinned: 0 | 1` + `last_activity_at: string`
- `desktop/src-tauri/migrations/001_init.sql` projects 表加两列（理由见下 "Rejected"）
- `desktop/src/lib/db.ts` `loadProjects` ORDER BY 改为 `pinned DESC, last_activity_at DESC`；`persistProject` INSERT 9 列；`projectFromRow` mapper 加字段
- `pnpm typecheck` 0 error

## Rejected alternatives

- **加 Project instructions（V0.1 或 V0.2）**：本次讨论核心争点。最终被否的理由是 JC 的核心判断："不要改变用户对 GA Agent 内核的使用体验"——这条比"避免 Custom GPT 心智"更宽，也更准。Cursor 那种 `.cursor/rules` 在 GA Workbench 里没有合适的位置：GA 的 prompt 模板和 memory 都是全局的，注入项目级 instructions 等于 in-flight 修改 GA 行为，破坏了"GA 在哪个 cwd 都一样"的纯粹性
- **Project 知识库 / RAG**：V0.1 太重，V0.2 也只能算候选。RAG 一旦做就要做对（embedding / 检索 / 引用），半成品 RAG 比没有更糟
- **Project 默认 LLM**：Composer 内 LLM dropdown 已覆盖 per-session 切换，per-project 默认模型属于"为不存在的痛点加配置"
- **项目级 approval rules**（"Always allow in this Project"）：DESIGN.md 历史版本提过，但本次决定**不写进 Project schema**——approval 仍是 session-level 决策 + global 规则两层，不引入 project 维度（避免审批语义碎片化）。DESIGN.md §327 / §636 的相关行作为 V0.1 文案残留暂保留，等 Inspector Approvals 真实做时一并清理
- **进入 project 切 sidebar 为 focus mode**（隐藏 timeline）：考虑过 Claude 网页版那种"全屏 project view"模式，但跟 V0.1 "sidebar = 全局导航 + 主区 = 当前 session" 的二元结构冲突。改为：sidebar 不变 + 主区切 Project View 二级页面，保留 sidebar 始终可见，导航成本最低
- **拖拽移动 session 到 project**：sidebar drag/drop 工程坑深（hit zones / drag preview / drop indicators），V0.1 用右键菜单足够，drag 留 V0.2
- **PROJECTS section 升格为 sidebar 主体**：JC 明确反对——"通用 Agent 工作台 80%+ 对话本就 free-floating，时间分组就是主体"（DESIGN.md §4.2 现有判断）。即使 coding agent 用户增多，也走"次要 section 但内部细化"的路径，不升格
- **加 002_projects_columns.sql migration 而非改 001_init.sql**：Stage 2 #9 SQLite migration 刚 ship，无 prod 用户，没有真实数据需要保护。直接改 001 比加 002 干净——schema diff 集中在一处，避免 V0.1 release 前 migration 文件碎片化。Stage 2 收尾 devlog 已把"DB migration 策略"列为 open question，本次讨论做出第一次明确决定：**V0.1 release 前所有 schema 改动直接改 001_init.sql；V0.1 release 后所有改动加 NNN_topic.sql migration**
- **加 `projects(pinned, last_activity_at)` 复合索引**：projects 表数量级（< 100）不需要 index，TableScan 即可。如未来 project 数量异常增长再补
- **"git repo 隐式发现"作为 New Project 第二入口**：考虑过 TopBar 提示"看起来在 ~/code/foo 工作，要不要保存为 Project？"，但 V0.1 入口收敛到 `+` 按钮一个，避免隐式行为引入心智复杂度

## Open questions

- **Active session 高亮 X/Y/Z 三选一**：默认走 X（两处都亮），等内测真实抱怨再校准。如果发现两处同亮视觉噪声明显大于"立刻定位"的好处，切 Y（仅 project 亮）；如果用户反馈"我都在 timeline 看，project section 反而干扰"，切 Z
- **Session 在 timeline 的 project tag 视觉重量**：当前定 12px emoji 行尾，hover tooltip 显 project name。视觉权重待真实渲染验证——如果 6 个 session 都带 tag 时 sidebar 像彩色弹珠，需要降级为更克制的 2px 色块或 1 字符 mono
- **Project View 二级页面跟 Settings modal 的导航栈关系**：Settings 是 Radix Dialog（modal），Project View 是非模态主区切换。两者并存时（用户在 Project View 里点 Settings）是否需要隐式退出 Project View？倾向不退出（Settings close 后回到 Project View），但需在实装时确认
- **Empty Project 状态**：当前 spec 定 "No sessions yet · [+ New session here]" 杏沙 ghost button。视觉权重需在真实组件里验证——不能比有 session 的 project 行更显眼
- **删除 project 的 confirm modal 文案**：当前定 "Delete project? Its N sessions will be moved back to timeline." 待 i18n 真实落地时再 review

## Next

本次讨论纯设计 + schema 同步，无 UI 实装。落地步骤回到 [Stage 2 收尾](./2026-05-08-stage2-desktop-skeleton-complete.md) "Next" 列表第 1 项：

> 端到端真跑 `pnpm tauri dev` + spawn bridge → user message → turn_end 全链路验证

Project section UI 实装属于 Stage 3 Multi-session 之后的 polish 任务（依赖 store 改造）：

- Stage 3 #1：端到端真跑（不依赖 Project 改动）
- Stage 3 #2：Multi-session 状态分布（store `Map<sessionId, ...>` 改造）
- Stage 3 #3：Session 恢复
- **Stage 3 #X（新增）**：Project section UI 实装
  - Sidebar PROJECTS section 重构（A-G 七段交互 + 折叠 + hover affordance）
  - Project View 二级页面（主区切换路由）
  - New Project Dialog（Radix）
  - Right-click `Move to project ▸` submenu
  - Timeline session row project tag 渲染
  - 排序逻辑 + pinned 切换
- 优先级：在 #2 multi-session 之后，#4 onboarding validation 之前——理由是 multi-session 改 store 时如果一并考虑 project 维度的 state slicing，可以省一次 store schema 重构

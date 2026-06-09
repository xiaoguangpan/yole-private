# 首次体验三连 + LLM 切换功能

> Date: 2026-05-08
> Status: aligned (设计层) + shipped (LLM 切换工程层)
> Related: PRD §6.1 / §17.8 · [docs/DESIGN.md](../DESIGN.md) draft · [docs/ipc-protocol.md](../ipc-protocol.md) §4.1 / §4.12 / §5.7

## Context

接续 [2026-05-07 设计方向转向](./2026-05-07-design-direction-pivot.md) 的进度。今天聊 DESIGN.md v0.2 第二批：

1. **Onboarding flow** —— 首次启动到进入主界面的流程
2. **Empty state** —— 主界面没有 session 时怎么显示
3. **Health Check Card** —— Attach GA 流程中的核心组件，也用作其他场合的常驻 health 视图

聊到尾声，作者注意到 GA 官方前端（Streamlit / launch.pyw）有对话中切换 LLM 的能力，提议跟 Claude / ChatGPT / Cursor 一样在 Composer 附近加 LLM 切换器——这是个值得纳入 V0.1 的小功能（Claude/ChatGPT 用户已经形成肌肉记忆），且 GA 已经原生支持（`agent.list_llms()` + `agent.next_llm(idx)`，切换时自动迁移 history），bridge 接通成本极小。当场把 IPC 协议补完、bridge 实现 + 单测 + e2e 测试也跑通了。

## Decisions

### Onboarding：4 步多页 wizard

形态选了多页 wizard 而不是单页 scroll —— 每步只关注一件事。整体气质要 Linear / Raycast 的极简首次启动，不教学、不讲故事。

- **Step 0 欢迎页**：大标题 `Yole` + 衬线副标题 + 三件事简列（多 session / 审批 / 历史恢复）+ charcoal `开始` CTA + footer 一行 muted 文案"不会修改你的 GA，删除 Yole 后 GA 独立可用"
- **Step 1 Attach GA**：路径输入框（预填 `~/Documents/GenericAgent`，可改）+ 文件夹选择器 + 实时反馈（路径存在/找不到 agentmain.py/路径不存在）+ "继续" CTA + 弱链接 "还没装 GenericAgent？→ 在这里安装"
- **Step 2 Health Check**：跑 5 项检查（路径 / Python / agentmain import / mykey.py 存在 / 至少一个 LLM 配置可解析）。**全过才能继续**——Yole 没 LLM 什么都做不了，不允许"以只读模式进入"
- **Step 3 进入主界面**：本质是"Onboarding 消失"。用户被带到主界面，看到 Empty state hero composer

### Empty state：Hero Composer 居中

主界面没 session 时不放大段欢迎文案，**Composer 浮在视口中部**（不在底部正常位置）。提交第一条后滑到底部。这是 Claude.ai / ChatGPT / Cursor 的标准模式，跟"对话工作台"心智一致。

- 上方：衬线 italic muted "你想做什么？"
- Composer 居中
- 下方 4 条 quick prompts（翻译 / 整理会议笔记 / 论文查询 / 写脚本）—— 故意不偏 coding，体现"通用 Agent"心智
- Sidebar 极简版（只 New Chat + Search，时间分组 section header 不显示）
- Inspector 默认 hide（虽然 PRD 默认展开，首次没 session 时收起更干净）

### Health Check Card 独立组件

不是 onboarding 专属。**5 个出场场合**：onboarding Step 2 / Inspector → Runtime tab / Top Bar runtime row 点击弹 popover / Settings → Runtime 手动重检 / 系统检测 GA 异常时主动弹。

- 左侧 16px Phosphor icon + 状态色（pending muted dot / running CircleNotch 杏沙 / success Check muted 灰 / failed X 深红 / warning Warning 深琥珀 / blocked Pause muted）
- 失败项 expand 显示错误简要 + inline action button（"打开 GA 安装指南" / "选择其他路径" / "View details"）
- 全过：顶部 "All checks passed"
- failed：阻断 onboarding 必须 fix；其他场合允许查看但 Top Bar runtime indicator 显示 unhealthy

**故意决策：跳过 LLM session dry-run**。原 PRD §9.6 的 Health Check 含"dry-run 启动 GA 子进程验证 LLM session 可初始化"——但 dry-run 真发 API 请求会消耗 quota。改为仅检查 mykey.py 可读 + 至少能解析出一个 LLM 配置。第一次发 message 时如有问题再报错（用户能容忍），比 onboarding 烧 quota 好。

### LLM 切换（V0.1 加入）

PRD §6.1 Goals 从 6 件加到 **7 件**，新增"对话中切换 LLM"。同时 §17 新增 17.8 acceptance criteria。

**架构层（已实现）**：

- `ReadyEvent` 加 `availableLLMs: LLMInfo[]` 字段（每项 `{index, name, displayName, isCurrent}`）
- 新事件 `llm_changed`（`{index, name, displayName}`）
- 新命令 `set_llm`（`{llmIndex}`）
- bridge 端 `_simplify_llm_name`：把 GA 的 raw name `ClassName/model-name` 转成人话 displayName（"NativeClaudeSession/glm-5.1" → "GLM 5.1"）。Brand 标准化字典覆盖 GLM/GPT/Claude/Gemini/Llama/Mistral/DeepSeek/Qwen/Kimi/MiniMax/Doubao/Yi/Phi 等
- bridge 端 `_handle_set_llm`：检查 idle 状态 + 越界保护 → `agent.next_llm(idx)` → emit `llm_changed`。GA 内部把 history 从旧 client 复制到新 client，**对话上下文不丢**
- 新增 3 个 unit test + 2 个 e2e test。e2e `test_set_llm_switches_active_model` 在用户 mykey.py 配置 ≥2 个 LLM 时跑（已验证），单 LLM 时 skip

**视觉层（待实现，DESIGN.md draft）**：

- 位置：Composer **内部左下**，跟 + button 并列。Top Bar 是另一种主流做法（Claude.ai 那样），但会让 Top Bar 失去当前的简洁
- 形态：Phosphor `Cube` thin icon + displayName + `CaretDown` thin / Ghost button，hover `#F2EDE3` / 13px Inter / 28px 高
- 点击展开 popover：`surface-elevated` 背景 + shadow / 圆角 12px / 内边距 8px / 每行 32px / current 项右侧杏沙 ✓ / 切换中 `Check` 替换为 `CircleNotch` 旋转
- Empty state hero composer 也有 LLM 选择器
- agent running / waiting approval 时 dropdown disabled（hover 显示 tooltip "Wait for the current run to finish"）

**持久化（待 desktop 阶段实现）**：

- Per-session：恢复历史 session 时使用上次的 LLM index（SQLite 记录）。失效时 fallback 到默认 + warning
- Per-app：新建 session 时使用用户上次选择的 LLM（不是 GA default 0）

## Rejected alternatives

- **Onboarding 单页 scroll**：4 步 wizard 在 onboarding 信息少时反而比单页清晰
- **跳过 Onboarding 直接进主界面**：不允许，必须 Health Check 通过才能确保 LLM 可用
- **Empty state 大标题 "Welcome to Yole"**：onboarding 已经说过，empty state 应该激发输入而不是再次 welcome
- **Composer 一开始就在底部 + 上方静态引导文案**：失去"邀请输入"的姿态。Claude.ai / ChatGPT 的 hero composer 模式更对
- **Health Check 真发 dry-run API**：消耗 quota；用 mykey.py 解析 + 至少一个 LLM 配置可识别即可
- **Health Check 失败时允许"以只读模式进入"**：Yole 没 LLM 什么都做不了，应该一步到位 fix
- **LLM 切换器放 Top Bar**（Claude.ai 模式）：会让我们当前的简洁 Top Bar（只 session title + traffic light + 几个 chrome icon）失去焦点。Composer 内部左下更贴近"输入"动作
- **LLM displayName 由 desktop 简化**：bridge 已经知道 GA 的内部命名规则，desktop 不应该重复这套逻辑。Settings → Custom display name 留 V0.2
- **新建 session 总是用 GA default `llm_no=0`**：用户的实际预期是"我上次选了什么，新对话也用什么"，per-app preference 更直觉
- **历史 session 恢复时不记忆 LLM**：用户预期"我之前怎么聊的，回来还怎么聊"。SQLite 记录 per-session LLM index
- **运行中也允许切换 LLM**：GA 的 `next_llm()` 在 agent 跑动时切换会破坏 history 引用，明确禁止
- **加 LLM 切换功能放到 V0.2**：Claude/ChatGPT 用户已经形成肌肉记忆，缺它会困惑。GA framework 已经原生支持，bridge 接通成本极小，工程上没理由推迟

## Open questions

- DESIGN.md v0.2 还需要：**Error Card / Command Palette UI / Settings**——下次 session 继续聊
- LLM displayName 标准化字典的覆盖范围（当前 13 个 brand keyword）够不够？实际跑 e2e 验证用户 mykey.py 里的所有 LLM 都能 prettify 后再扩
- Inspector default 展开 vs Empty state Inspector 隐藏的状态切换：用户首次完成 onboarding → 第一次进入主界面（empty state，Inspector 隐藏）→ 发了第一条消息后（Inspector 应该展开还是仍隐藏？用户偏好持久化？）—— 暂未决定，下次聊
- Onboarding 走完后下次启动是否每次跑 Health Check：建议**后台**重新跑一次（不阻塞 UI），失败时弹 toast。但这是 V0.2 desktop 阶段才能验证的
- Composer LLM dropdown 在 long LLM list 下的 UX（用户配置 10+ LLM 时 popover 形态）：V0.1 不做特殊处理，超过 8 个加 scroll

## Next

- 下次 session 继续聊：**Error Card / Command Palette UI / Settings**（剩余三个组件）
- 全部对齐后一次性合并到 [docs/DESIGN.md](../DESIGN.md) 作为 v0.2 完整版
- Stage 2 桌面端骨架启动前，DESIGN.md v0.2 必须完成
- LLM 切换的视觉层（Composer dropdown + popover）在 desktop 阶段实施

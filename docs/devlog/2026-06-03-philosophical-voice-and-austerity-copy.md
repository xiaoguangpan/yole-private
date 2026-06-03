# 2026-06-03 · 哲学气质定位 · philosophical-voice probe + austerity 文案重写

> 一个偏 brainstorm + 文案的 session：给 Galley 注入一层受后期维特根斯坦
> 影响的哲学气质，作为对一众 programmer 向 coding agent 的差异化。产物分两
> 块：(1) `philosophical-voice` spec 的 MVP 实现（题词 + Composer 三寄存器
> + 删空状态 prompt 建议）；(2) 全 UI 文案的 austerity 重写第一轮（7 批）+
> 一份新准则文档。

## 背景与定位决策

Founder（哲学背景，维特根斯坦研究方向）希望 Galley 在品牌质感上跳出
coding agent 的同质竞争，走"思考的、人文的、语言哲学的"路线。关键的取舍：

- **以后期维氏为主体**（《哲学研究》：综观 / 用法 / 语言游戏 / 治疗式廓清），
  *Tractatus* 只取 "凡不可说的，应当沉默"（命题 7）作单点点睛。
- **哲学必须承重**：解释设计为什么如此，而不是贴金句。UI 表层说人话，
  德文 / 引文 / 显眼哲学只留在"重音位"。
- **拒绝"哲学模式"沙龙引擎做 MVP**：那是最难调、最易空转（维氏说的"语言
  在度假"）的形态。改为**一处小设计**先验证气质，再谈大功能。

## philosophical-voice：做了什么

新建 spec `.kiro/specs/philosophical-voice/`（requirements / design / tasks）。
MVP 两部分共享一个声音、扮演不同寄存器：

- **A 题词（accent）**：空状态 Composer 正上方一行状态绑定的维氏题词，译文
  跟随软件语言（zh/en），德文原句作**常驻副行**。v1 绑定 Tractatus 7 →
  `fresh`/default（空屏即沉默，*sagen* 与 *zeigen* 合一）。
- **B Composer 声音（base layer）**：同一输入框按语言游戏改变意义（*meaning
  is use*, PI §43）——委派 / 接续 / by-the-way。运行中（`stopMode`）新增
  by-the-way 寄存器，**兼教被埋没的 `/btw`**（此前运行中 placeholder 文案
  根本不变，是个空槽）。

实现把哲学沉到**两个纯函数 + 一份策展数据**：

- `gui/src/lib/epigraphs.ts`：`Epigraph` 类型 + `resolveEpigraph`（全函数、
  非空、跨字段降级）+ dev-only 完整性守卫（即便不上测试框架也兜住数据属性）。
- `gui/src/lib/composer-register.ts`：`resolveComposerRegister`（确定、运行
  优先）+ `composerRegisterCopyKey`。
- `gui/src/components/screens/Epigraph.tsx`：serif、ink-muted、明显次于
  Composer；i18n 加 `CopyProvider` 旁挂的 `useLanguage()` hook。

**Task 7（vitest 属性测试）按 owner 决定不做**——给 GUI 引入新 devDependency，
Task 1 的 dev-time 守卫已兜住最关键的数据属性，不上测试框架也能安全 ship。

## 删空状态 prompt 建议（post-dogfood follow-on）

dogfood 后发现题词落地后，Composer 下方那 4 句斜体 serif 引导 prompt 与题词
**互相打架**：两坨相似的安静 serif 夹住 Composer 稀释焦点；且在 Tractatus 7
"沉默"题词正下方放 4 句"快说点什么"的邀请，自拆其台。它们本质是 onboarding
脚手架，却对回头用户每次 New Chat 都重现。**决策：整段删除**（EmptyState
props/类型/渲染、App.tsx handler、`empty.prompt*` i18n keys）。新人能力发现
留给独立的、非空状态的机制（未来单独想）。回写进 spec design/tasks。

## austerity 文案重写

新建 [copy-austerity-principles.md](../copy-austerity-principles.md)：定义 UI
文案的**声音**（克制、朴素、操作性，受后期维氏影响），与既有
[copy-language-guidelines.md](../copy-language-guidelines.md) 分工——前者管
"怎么说"，后者管"说什么词"，冲突时术语优先。一条红线：**清楚 > 简洁 >
气质**，austerity 是删到只剩必要、不是删到看不懂；功能键 / 报错 / 高风险确认
清楚永远第一。调子确认走 **B（冷峻）**。

按 UI 区域**分批、可逆、逐批 owner 过目**重写 `gui/src/lib/i18n.tsx`（2096
行双语），共 7 批：

1. Composer + 全局控件（多数已 austere，只收 `enterHint` / `cannotSwitchRunning`）
2. Empty state + Onboarding（人格核心句：`attachTrust` / `healthSubtitle`
   统一用 "modify/不修改" 一个声音）
3. Errors + Toasts（描述不说教；保留可执行的下一步）
4. Approval（YOLO 高危确认按"清楚优先"边界保留；"已开启"统一）
5. Settings 各页 subtitle + 长说明句
6. Sidebar + TopBar + Command Palette（含术语修正 sessions→对话）
7. Models 连接报错 7 条（术语 模型密钥→API Key）

**过程中拍板、写进准则文档的既定约定**：

- **保留"请"**，不全局删除（austerity 删冗词，不删基本礼貌）。
- YOLO 状态统一说**"已开启"**。
- **`API Key`** 作字段名统一英文（标签 `模型密钥`→`API Key`；正文可说「密钥」）。
- 中文用户文案用**「对话」**，`session` 仅限 Settings → Agent 术语语境。

## 验证

每批改完 `pnpm --dir gui typecheck` + `pnpm --dir gui lint` 全过（全程
exit 0）。`git diff --check` 干净。代码 diff 经审查仅含目标改动，无调试残留。
未跑 Rust 检查——本 session 零 Rust / CLI / runner 改动。

## Rejected / Deferred

- Rejected：「哲学模式」沙龙对话引擎做 MVP（空转风险）；把功能命名成
  "Language Game" 等行话（晦涩 + 炫技，违背维氏反行话）；placeholder 里塞
  维氏语录（挤 + 装，B 的哲学在结构不在文案）；`attachTrust` 用 "touch/碰"
  （字面过头，Galley 确实会**读** GA，改用更精确的 "modify/不修改"）；
  全局清洗"请"字（去基本礼貌，过冷）。
- Deferred：philosophical-voice Task 7（vitest 属性测试）；新人能力发现的
  独立机制；候选 §133（zur Ruhe，配 all-idle）/ §66（Denk nicht sondern
  schau，配 busy）作为后续题词条件（加一条数据 + 一行绑定即可，不动渲染）。

## Open

- 题词目前只 1 条 / 1 个条件（`fresh`）。是否扩到 idle / busy 等更多状态绑定，
  待 dogfood 信号。
- austerity 重写是"第一轮"。onboarding 教学长正文、managed-model 边缘 case、
  update-channel 边缘状态等仍按准则边界保留，未来可再收。
- 哲学气质的更大形态（格式塔 aspect 切换的"看见之变"视觉、治疗式廓清）仍是
  未来方向，本 session 只落了"小设计先验证气质"这一步。

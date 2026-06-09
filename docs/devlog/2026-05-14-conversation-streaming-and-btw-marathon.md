# Conversation polish marathon: streaming, /btw, Desktop Pet UX, fence filter

**Date**: 2026-05-14
**Status**: 18 commits shipped, V0.1 conversation experience hardened
**Related**:
- [2026-05-14 rootPath rollback](./2026-05-14-project-rootpath-rollback-ga-memory-coupling.md) — separate devlog, the morning's work
- Commits `1849a71` → `631e448` (this entry covers everything after rootPath rollback through fence filter)
- [DESIGN.md §4.3](../DESIGN.md) — Conversation spec, updated inline through the session
- [docs/ipc-protocol.md §4.16](../ipc-protocol.md) — new SystemMessageEvent

## Context

Session opened with a discussion about GA's idle-autonomous-action feature (launch.pyw's `[AUTO]` injection), which led to discovering the static GA memory/ coupling problem (separate devlog above). After landing that fix and the small "加入项目" copy tweak, the remaining hours turned into a long polish pass on the main conversation area — JC's framing: "用户 99% 时间都在这里，应该更细打磨".

Each round of dogfood feedback fed the next change. Trying to maintain the "user just opt-in to look, then guide me by reaction" cadence: I'd propose a focused fix with 2-3 options, JC would pick or push back, I'd implement and ship, JC would react with the next observation. Most commits landed within 30-90 minutes of the observation that triggered them.

The session also re-opened design decisions around:
- What does "streaming" actually mean when GA's `agent.verbose` flag mixes two orthogonal concerns (per-token LLM stream + decoration noise)?
- How should non-agent-loop UI moments (side questions, system confirmations) integrate with a per-turn `turns[]` array that was designed for the agent loop?
- When is "save user from themselves" the right move (Composer stopMode gate) vs "trust the user knows what they're doing" (let /btw through)?

## Decisions

### Conversation visual register — user message as the apricot anchor

**Problem**: in long conversations users scroll back primarily to find their own questions. The previous `MessageUser` styling (2px muted-grey bar, no fill) blended into the document; scanning past 50+ turns was a slow visual scan.

**Decision** (`c7a4e42`): Promote user message to a document-level callout matching the "I'm in focus" visual vocabulary already established in Sidebar active row / filter banner / ApprovalDock — solid `bg-brand-soft` fill + 3px `border-brand-strong` left bar + 6px right corner. AI replies stay plain prose; "question (highlighted anchor) → answer (the reading content)" hierarchy emerges naturally.

Started at `bg-brand-soft/30` (30% opacity), JC pushed back that the effect was too faint to land as a scan anchor — bumped to solid `bg-brand-soft`, aligning with the existing brand-soft usages elsewhere in the product.

### Conversation cleanup pass — three small things compounded by the user-msg change

After the apricot user-msg landed, three related issues surfaced from visual hierarchy shifts (`02b8294`):

- **ThinkingSummary** was using `bg-brand/[0.06]` + `border-brand` — a faded echo of the user-msg's brand vocabulary. Moved to neutral `bg-surface + border-ink-soft` so the four conversation tiers now read cleanly: apricot solid = user voice / surface+brand-bar = agent action / surface+neutral-bar = agent reasoning / no chrome = agent final answer.
- **InlineToolPill** had a leading CheckCircle that was redundant — the inline tier only renders for already-succeeded tools, so the check carried no signal. Removed.
- **AskUserBubble** had 2px bar + different padding than the new user-msg. Aligned to 3px / `rounded-r-[6px]` / `px-4 py-2.5` — both are "yours to act on" attention blocks and should share geometry.

### Keyboard nav — ⌥↑ / ⌥↓ between user messages

With user-msg promoted to a strong visual anchor, the natural next ask: keyboard navigation between them (`ec072b9`). Bound to document-level keydown, skips when focus is in input/textarea/contenteditable (macOS Option+Up keeps its native paragraph-cursor behaviour inside Composer). Reuses the existing 32px-top-padding anchor logic from scroll-on-submit so jumped-to messages land in the same viewport position as freshly submitted ones.

Documented in `SettingsShortcuts.tsx` under a new "Conversation" group + `DESIGN.md §10` canonical table (`7af4f9f`). The Composer-focus carve-out is spelled out in the row's `note` so users don't think the shortcut is flaky when it's silently right-thing-doing.

### TurnMarker thinking mode + drop 💭

The "第 N 步 · 思考中···" placeholder was using the full ThinkingSummary callout chrome (~50px tall, bg-surface + bar + 14px italic + 💭 emoji) for a 10-character "still working" signal. Massive chrome / content mismatch.

**Decision** (`64d21ca`): the placeholder becomes a TurnMarker thinking mode — same italic serif 12px ink-muted register as the settled marker, just with "· 思考中" + TypingDots in place of the summary. Visual weight drops from ~50px to ~16px. The marker's before/after for a single step now share visual language (one component, two time states).

Same commit also drops the 💭 emoji from ThinkingSummary entirely. This was the deliberate "Phosphor-only icon set exception" called out in DESIGN.md §2.3 — revisiting it: the bg-surface + ink-soft bar + italic serif typography already do the "this is an aside callout" work; the emoji was decorative. DESIGN.md §2.3 / §4.3 updated to reflect Phosphor-only product-wide.

### Elapsed-time counter for long thinking waits

Complex tasks and reasoning models can sit on "思考中···" for 30s, a minute, sometimes multiple minutes. Pure TypingDots tell the user "UI isn't frozen" but not "system is still doing real work" — past 20 seconds users start wondering whether the app hung.

**Decision** (`3e4f7fd`): surface elapsed time after a 5-second delay. Three thresholds:

```
0-4s   → 思考中···                (untouched — short waits stay minimal)
5-59s  → 思考中··· · 23 秒
60s+   → 思考中··· · 已 1 分 23 秒
```

The "已" prefix appears only past the minute boundary — that's where the wait stops being routine and the language should acknowledge it. Per-step independent clock: `key={currentTurnIndex}` on the placeholder makes each new step a fresh component instance with a clock that resets to 0.

`useElapsedSeconds(active)` hook centralises the 1Hz interval logic. Returns 0 when `active=false` (e.g. settled marker passes `thinking=false`).

Hit a `react-hooks/set-state-in-effect` lint speedbump (synchronous `setSec(0)` inside the effect body is disallowed); resolved by trusting `useState(0)` initial state + per-step remount via key, no in-effect reset needed.

A follow-up bug fix (`eb61f22`): tightening the placeholder render gate to `currentTurnIndex != null` left a 50-200ms window where `agentRunning` was already true (set synchronously on submit) but the bridge's first `turn_start` IPC hadn't landed — placeholder vanished for short prompts where this window covered the entire pre-first-token wait. Fix: `index` becomes optional on TurnMarker; when absent the "第 N 步" prefix is skipped and the marker renders "思考中" alone. Same degradation path the old ThinkingSummary version had.

### Follow-bottom on every step commit

Multi-step runs revealed a gap in sticky-bottom mode (`b65910a`). The existing `useLayoutEffect` for stream-follow only watched `[typedPartial, atBottom]`. In tool-heavy runs the partial stays empty for stretches (LLM emits structured tool_use; dispatch markers stripped), so deps don't change and the effect doesn't re-run when the new AgentTurn lands — user couldn't see steps progressing without manually scrolling. Only the final turn's streaming naturally triggered the snap.

Widened the deps to also watch `turns.length`, `pendingApprovals.length`, `pendingAskUser`. Every source of bottom-anchored growth now re-triggers the snap. The `atBottom` guard still applies — if the user has scrolled up to read history, follow-mode is correctly disengaged.

### Streaming: flip `agent.verbose = True`

Yole shipped with `agent.verbose = False` since day one. JC noticed responses arriving as whole blobs instead of streaming and asked why. Tracing: `agent.verbose = False` makes `agent_loop.py` drain the LLM client generator silently and yield the full response in one chunk at turn end — that's why long answers appeared all-at-once and why "思考中" sat for many seconds while the LLM was actively producing tokens we never saw.

**Decision** (`0126f76`): flip to `verbose=True`. The cost is decorative yields verbose adds for GA's terminal frontends — the multi-line `🛠️ Tool: ... 📥 args: ... ` block before each dispatch, and 5-backtick fences wrapping each tool's stdout. New cleanPartialContent strippers handle them (complete blocks + partial-truncation at chunk boundaries). The pre-existing strippers for the compact `🛠️ name(args)` marker stay as a backstop.

Initial trade-off accepted: tool stdout between 5-fences also gets stripped. During tool execution the partial stream visually pauses for a few seconds, but ToolCallout's structured render lands on turn_end. Worse than ideal but better than rendering raw stdout as Newsreader prose.

### Strip the "当前阶段：" preamble that GA's prompt template induces

GA's `sys_prompt.txt:4` instructs the LLM to write a "当前阶段、上步结果、下步策略" preamble before every tool call AND emit a structured `<summary>` tag covering the same ground. The `<summary>` becomes the TurnMarker副标题 ("第 N 步 · …") — the prose preamble that comes alongside is a verbose duplicate that streams in front of the actual answer every step.

With streaming now enabled, the duplication was loud: every step showed TurnMarker + tool callout + "当前阶段：…" block + next TurnMarker, in lockstep.

**Decision** (`85714d7`): a targeted regex stripper `PHASE_PREAMBLE` matches "当前阶段：…" paragraphs up to the next blank line (with `**…**` and full/half-width colon tolerance) and drops them. Side benefit: when the LLM's intermediate-turn prose is *only* the preamble, stripping leaves the partial empty → ThinkingMarker's "思考中" placeholder takes over for the rest of the streaming window. Tight live signal beats verbose redundancy.

Not stripping the other two prompt tokens ("上步结果" / "下步策略") yet — dogfood shows the LLM merging all three into one 当前阶段-prefixed paragraph. If a future model decides to split, add to the regex alternation then.

### /btw — side question support

GA ships a `/btw <question>` slash command (frontends/btw_cmd.py) that lets the user ask a quick aside without interrupting the main agent. Implementation walks a tightrope on top of GA's task queue model.

**Architecture choice** (`197f63e`): GA's btw_cmd ships two entry points — `install()` patches the agent's task-queue dispatch (which queues /btw behind the running task, defeating the "interruption-free side question" UX), and `handle_frontend_command()` is a synchronous entry that calls `backend.raw_ask` directly. Use the latter, bypass `agent.run()`'s queue entirely. With agent mid-run, /btw still returns an answer in seconds rather than waiting for the main task.

New IPC event `SystemMessageEvent { content, variant }` mirrors the bridge's `display_queue` → desktop. `variant` discriminates rendering: `"side_question"` (yellow callout, AskUserBubble color family) vs `"system"` (neutral surface bubble, catch-all).

New `SystemTurn` type added to the Turn union. `appendSystemTurn` (transient, no DB write for V0.1) appends to `runtime.turns` when the IPC handler fires. `appendSideQuestionUserTurn` (transient sibling of `appendUserTurn`) skips `agentRunning` / `inFlightContent` / `currentTurnIndex` / `pendingAskUser` mutations so the side-question path doesn't disturb the main agent's render state.

App.tsx MainView onSubmit detects `/btw` prefix and dispatches to the transient path.

**Trade-off accepted**: /btw exchanges are ephemeral for V0.1. On session reopen the side question + reply are gone — consistent with "side, not main" mental model. Promote to persisted (messages.role='system' rows + rowsToTurns handling) if dogfood demands.

**Composer follow-up** (`58fe85e`): /btw was technically wired end-to-end but couldn't actually be SENT while the main agent was running. The Composer's `stopMode` (driven by `isRunning`) replaced the submit button with Stop AND made `handleSubmit` no-op for Enter. Fix: Composer detects /btw at the input level. Staged /btw flips the submit button back from Stop to Send and lets Enter through.

### Bridge fence-state filter — performance fix for verbose=True

After /btw shipped, JC reported the [Action] line (GA tool yields like `[Action] Running bash in temp: ...`) was flashing as Newsreader prose for a few seconds during step 3 of multi-tool runs. Added a defensive line-level strip first (`447bb13`) — `[Action] [^\n]*` matches any tool yield first line regardless of fence state. Cheap belt-and-suspenders.

Then JC raised the broader concern: response speed had slowed perceptibly since verbose=True flipped. Diagnosis: verbose mode makes GA stream ALL tool stdout through `display_queue` → IPC → desktop's `appendInFlightDelta` → React rerender → cleanPartialContent regex on growing buffer → MarkdownView re-render. For tools producing kilobytes of stdout (code_run with a long script, web_scan grabbing a page), hundreds of pointless IPC events per tool call. The chunks get stripped on desktop anyway, but only after burning the cost.

**Decision** (`631e448`): filter at the bridge. New `_FenceFilter` is a small state machine — `inside: bool`, `carry: str` (≤ 5 chars for fence markers split across deltas). Each delta is fed through; outside-fence content passes, markers + inside-fence content drop. Empty filtered output = no `TurnProgressEvent` emitted at all.

One filter per drain (= per put_task), so fence state never leaks across tasks. The marker rejoin via carry handles the common chunk-boundary case where GA's display_queue throttle splits a `\`\`\`\`\`\n` across two pushes.

End-to-end effect: tool-output chunks no longer touch the IPC pipe, `inFlightContent` stays small (LLM stream + decoration only), `cleanPartialContent` runs cheap, React render count during tool execution drops to near-zero. LLM streaming UX preserved — that's still emitted byte-for-byte.

Desktop's own `FIVE_BACKTICK_BLOCK` / `TOOL_ACTION_LINE` strippers stay as defense-in-depth in case the user is running against an older bridge that doesn't filter.

### Desktop Pet UX overhaul — sidebar badge + implicit migration

The Pet was bound to one session at a time but **users had no way to see WHICH session** from anywhere except the holder's title menu. With multi-session workflows, "I forgot where I put the pet" was a real failure mode. The menu item label "桌面宠物 · 已附着" was status-not-action, and toggling from a non-holder session detached the pet from an invisible location.

**Decision** (`1849a71`): two-part fix.

**Sidebar Cat badge** on the holder session row: 12px thin Phosphor Cat, `text-ink-soft`, sits between title and unread/ask dot. Pure status indicator (not clickable — fights the row's "click to switch" affordance). Tooltip "桌面宠物附着中 · 进入此对话可关闭".

**Menu label flips per current-session state**:
- Active session holds pet → `关闭桌面宠物`
- Otherwise → `桌面宠物`

Clicking `桌面宠物` from a non-holder session **implicitly migrates** the pet — detach fires first, then the `pet_detached` IPC handler relays an `attach_pet` to the staged target (via new `pendingPetMigrationTo` store field). Avoids the port-collision race that would occur if both commands fired back-to-back, since detach blocks on subprocess termination.

Mental model after: pet is a singleton that follows the user. Sidebar badge always tells you where it lives. Closing requires being in the holder session — which the badge guides you to.

### Smaller polishes

- **加入项目 menu copy** (`90130c8`): "归入项目" → "加入项目" + same word in three other places. The old wording shared "归" prefix with the adjacent "归档" entry making the menu cluster harder to scan; "加入" is everyday phrasing and breaks the prefix rhyme.
- **🛠️ dispatch marker strip** (`e848c25`): GA's `agent_loop.py:73` yields a compact `🛠️ tool_name(args)` line to `display_queue` in verbose=False mode for terminal frontends. Stripped in cleanPartialContent (plus partial-truncation for chunk boundaries split mid-marker). Now mostly defensive since verbose=True doesn't use this form.

## Rejected alternatives

### Always-show seconds on the thinking placeholder

Variant A from the elapsed-counter discussion: show "X 秒" from second 1. Rejected — feels mechanical and impatient for the common 2-5s wait. The 5-second delay before surfacing matches Yole's "low chrome until needed" register.

Long-form reassurance text past 3 minutes (variant C, "任务较复杂，仍在运行") also rejected — the "已 X 分 Y 秒" wording already acknowledges the duration without spelling it out, and for thinking-model users 3+ minutes is routine.

### Persist /btw exchanges to SQLite

Considered for the /btw work but punted to V0.2. The trade-off: side question + answer survives session reopen, but adds either a new `system_messages` table or a turn-index allocation strategy that doesn't conflict with the main agent's loop. For V0.1 ephemeral is fine — /btw is "ask while I'm thinking, then keep working", not "permanent thread fork".

### `btw_cmd.install()` path for /btw

GA's btw_cmd offers two routes; `install()` monkey-patches `_handle_slash_cmd` which would queue /btw behind the currently-running task. Rejected because that defeats /btw's whole point. Used `handle_frontend_command()` (sync, bypasses agent.run queue) in a bridge-spawned worker thread instead.

### Render tool stdout as collapsible blocks during streaming

Considered for the verbose=True noise problem before settling on the bridge fence filter. Would mean keeping fence content in the partial render with its own visual chrome (e.g., grey collapsed block "Tool running…"). Rejected as over-engineering — ToolCallout already renders the structured result at turn_end, and "live raw stdout" is rarely user-relevant for the tools GA ships.

### Strip `[Action]` lines at bridge level

Considered after the user noticed [Action] flashes. Decided to do BOTH: desktop-side `TOOL_ACTION_LINE` strip (defense in depth, in case bridge is older) AND bridge-side fence filter (the structural fix). The two layers don't conflict; if bridge catches it, desktop strip is a no-op.

## Open questions

- **/rewind not yet implemented**. Scoped + designed but not built — 4-commit breakdown (bridge IPC + migration 005 / right-click 回退 / hover edit-and-resubmit / `/rewind N` slash compat). Estimated ~400 LOC. Carries forward to a future session.
- **`/btw` persistence**: revisit after dogfood. If users want side questions to survive reopen, promote to `messages.role='system'` rows with a separate sequence space so they don't collide with main-agent turn_index.
- **Streaming `setSec(0)` lint fight**: the elapsed-counter hook had to drop the synchronous in-effect state reset to satisfy `react-hooks/set-state-in-effect`. Currently relies on `useState(0)` initial state + per-step remount. If the active flag ever needs to toggle false→true on the same instance (currently not the case), a stale `sec` would briefly show.
- **`当前阶段` regex is exact-match**: if a user customises GA's sys_prompt to use a different wording (JC mentioned doing this), the stripper won't catch the new preamble. Could be widened to an alternation but currently no demand signal.
- **Bridge fence filter handles 5-backtick fences only**. If GA changes its tool-output wrapper (e.g., to 6 backticks or a different marker), the filter needs updating. Couple-point flagged in CLAUDE.md's "关于读取" section — re-audit each baseline upgrade.

## Next

- /rewind C1 onwards: bridge IPC `RewindCommand` + migration 005 (`messages.rewound` column), then GUI affordances (right-click "回退到这里", user-msg hover edit-and-resubmit), then `/rewind N` slash compat. Four discrete commits.
- /branch deferred until V0.2 per session-opening discussion.
- Idle autonomous deferred to V0.2 per same discussion.
- Dogfood the cumulative effect: multi-step task with heavy tool calls, /btw mid-run, scroll-back navigation, elapsed counter on a slow LLM. If the perceived response speed feels closer to pre-verbose-flip, the bridge fence filter is doing its job.

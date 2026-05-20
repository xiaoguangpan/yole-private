# Galley

> **本地 agent team 编排器 —— GUI 给人，CLI 给 supervisor agent。**

> *Galley started as a workbench for [GenericAgent](https://github.com/lsdefine/GenericAgent). The first two letters of our name are a quiet bow to where we came from.*

[English README](./README_en.md) (legacy v0.1 — v0.5 rewrite TBD)

<p align="center">
  <img src="docs/screenshots/screenshot_05.png" alt="Galley 主对话界面" width="800" />
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT" /></a>
  <a href="https://github.com/wangjc683/galley/releases"><img src="https://img.shields.io/github/v/release/wangjc683/galley?include_prereleases" alt="Latest Release" /></a>
  <a href="https://github.com/wangjc683/galley/releases"><img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows-blue" alt="Platform" /></a>
  <a href="https://github.com/wangjc683/galley/stargazers"><img src="https://img.shields.io/github/stars/wangjc683/galley?style=social" alt="Stars" /></a>
</p>

## Galley 是什么

Galley 是一个本地 agent team orchestrator —— 同一台机器上跑多个 AI agent session，左边 GUI 给坐在电脑前的你，右边 CLI 给另一个 **Supervisor Agent** 来远程编排（出门后还能通过手机 IM 让 supervisor agent 帮你监管 session team）。

**Supervisor Agent** —— 跑在你电脑或手机 IM 上的另一个 agent，通过 `galley` 命令给你电脑里的 session team 派任务、看进度、改 LLM 配置。

Galley 是 **dual-native** —— GUI 给人 / CLI 给 agent，两边对等访问同一份本地数据。

Galley 是 **local-first** —— 你的数据不离开你的机器。**远程访问**由 Supervisor 在外部传输层（GA IM frontend / SSH / 其他）负责，不是 Galley 的责任。

Galley 不会修改用户已有的 [GenericAgent](https://github.com/lsdefine/GenericAgent)。随时可以删 Galley，GenericAgent 独立运行不受影响。

> **v0.1 (历史)**：Galley 最初只是 GenericAgent 的桌面工作台（multi-session 并行 + 工具时间线 + 审批系统）。v0.5 引入 [Galley Core](./docs/refactor/) (Rust 写的本地权威层) + [Galley CLI](./docs/agent-api.md)，工作台 + 编排器 一体。

## 功能

- 🪟 **多 session 并行** —— 每个 session 独立 GenericAgent 子进程，最多 5 个 alive
- 🔧 **结构化工具时间线** —— 工具调用、参数、结果、时延都在对话流内联展示
- 🛡️ **审批系统 + YOLO 模式** —— 高风险动作（file_patch / code_run...）可拦审批，或者干脆全程信任 agent
- 💾 **会话持久化 + 全文搜索** —— 关掉 Galley 几天后回来续聊；SQLite FTS5 trigram 跨对话搜索
- 📁 **项目分组** —— 按项目组织 session
- 🤖 **per-session LLM 切换** —— 对话中途换模型，不丢上下文
- 🐍 **内置 Python** —— Galley 自带 CPython 3.11.15 + GA core deps，零 Python 配置可用
- ⚙️ **Galley CLI** —— `galley sessions list / new / send / btw / archive / project / llm ...` 给 Supervisor Agent 用
- 📡 **Agent API schema v1** —— 19 个命令版本化 JSON schema，下游 supervisor 集成长期稳定
- 🍱 **Background mode** —— 关窗不退出，留在 macOS menubar
- 🔄 **Pre-migration backup** —— schema 升级自动备份你的数据目录，零数据丢失风险

## 给 Supervisor Agent 用 · 集成 v0.5

Galley 出厂自带 **两份现成集成**：

- **GenericAgent bot 集成**：[`docs/integrations/galley-supervisor-sop.md`](./docs/integrations/galley-supervisor-sop.md) —— 装到 GA 的 `memory/` 后，GA 实例自动学会用 `galley` 命令编排其它 session
- **Claude Code 集成**：[`.claude/skills/galley-supervisor/`](./.claude/skills/galley-supervisor/) —— symlink 到 `~/.claude/skills/`，Claude Code 自动识别 trigger 词「帮我看看 Galley」「galley 跑啥」等

Settings → Integration tab 提供一键安装按钮（macOS sudo 加 PATH + 装 SOP 到你的 GA `memory/`）。详 [agent-api.md](./docs/agent-api.md) (schema v1 frozen)。

## 截图

| | |
|---|---|
| ![](docs/screenshots/screenshot_01.png) | ![](docs/screenshots/screenshot_02.png) |
| ![](docs/screenshots/screenshot_03.png) | ![](docs/screenshots/screenshot_04.png) |

## 架构

```
              ┌─────────────────┐  ┌─────────────────────────┐
              │  Galley GUI     │  │  Galley CLI             │
              │  (Tauri+React)  │  │  (Rust)                 │
              └────────┬────────┘  └────────┬────────────────┘
                       └────────┬───────────┘
                          localhost only
                       (Unix socket / named pipe)
                                ↓
                       ┌────────────────────────┐
                       │  Galley Core           │
                       │  (Rust)                │
                       │  • Session 生命周期    │
                       │  • SQLite 写            │
                       │  • Runner 管理         │
                       │  • Event 广播          │
                       └────────┬───────────────┘
                                ↓
                       ┌────────────────────────┐
                       │  Runner (Python)       │
                       │  每 session 一个        │
                       │  GenericAgent 子进程    │
                       └────────────────────────┘
```

具体重构执行计划见 [refactor playbook](./docs/refactor/)。

**技术栈：**

- **前端** —— Tauri v2 + React 19 + TypeScript 5.8 + Tailwind v4
- **后端** —— Rust (Galley Core + Galley CLI) + Python (runner，包装 GenericAgent)
- **本地数据库** —— SQLite (FTS5 trigram 搜索)
- **IPC** —— GUI / CLI 共用同一 Unix socket (macOS/Linux) / named pipe (Windows) 走 Galley Core
- **平台** —— macOS + Windows（Linux 候选 · v0.6+）

## 安装

### 前置条件

Galley 需要 [GenericAgent](https://github.com/lsdefine/GenericAgent) 先装好。按 [GA 的安装说明](https://datawhalechina.github.io/hello-generic-agent/part1/chapter1/) 走。最少需要：

- GenericAgent 仓库 clone 到 `~/Documents/GenericAgent/`（或任意路径，Galley 首次启动让你选）
- `mykey.py` 配置好至少一个 LLM provider（Galley dogfood 主要用 Claude Opus 4.6 / Sonnet 4.6，GPT 5.5 和 GLM 5.1）

**Python 已内置** —— Galley 自带 CPython 3.11.15 + GA core deps（`requests` / `beautifulsoup4` / `bottle` / `simple-websocket-server`）。无需自己装 Python 或配 venv。Settings → Runtime 有「使用外部 Python」escape hatch 给 GA fork 用户。

Galley 首次启动会跑健康检查，缺什么会明确告诉你。

### macOS

1. 从 [Releases](https://github.com/wangjc683/galley/releases) 下载 `Galley_v0.5.x_macOS_aarch64.dmg`（Apple Silicon）或 `Galley_v0.5.x_macOS_x64.dmg`（Intel）
2. 打开 .dmg，把 **Galley.app** 拖到 **应用程序** 文件夹
3. Galley 暂时没有 Apple code signing 证书。首次打开请在 Terminal 跑：
   ```bash
   xattr -d com.apple.quarantine /Applications/Galley.app
   ```
   然后双击 Galley.app 启动。*（替代方案：右键应用 → 打开 → 再点打开。最近 macOS 版本上 `xattr` 命令更稳。）*

### Windows

1. 从 [Releases](https://github.com/wangjc683/galley/releases) 下载 `Galley_v0.5.x_Windows_x64-setup.exe`
2. 跑安装程序。Windows SmartScreen 会提示发布者未知（Galley 没买 EV 签名证书）：
   - 点 **"更多信息"** → **"仍要运行"**
3. 从开始菜单启动 Galley

### CLI 集成

GUI 启动后 Settings → Integration tab：

- **Install to PATH**：把 `galley` 命令装到 `/usr/local/bin/` 让 supervisor agent 直接调用（macOS sudo，Windows 用户级 PATH）
- **Install Supervisor SOP**：把 `galley-supervisor-sop.md` 装到你 GA 的 `memory/` —— GA bot 自动学会编排 Galley
- **Claude Skill**：手动 `ln -s $(pwd)/.claude/skills/galley-supervisor ~/.claude/skills/galley-supervisor`（v0.6 自动化）

## 贡献 / 从源码构建

```bash
git clone https://github.com/wangjc683/galley
cd galley

# Python runner（测试）
python3 -m venv .venv
.venv/bin/pip install -e ".[dev]"
.venv/bin/python -m pytest          # unit tests
GA_PATH=/path/to/GenericAgent BRIDGE_PYTHON=/path/to/python .venv/bin/python -m pytest -m e2e

# 桌面应用（开发 / 构建）
cd gui
pnpm install
pnpm tauri dev                       # macOS / Windows 桌面开发模式
pnpm tauri build                     # 出 .app / .dmg / .exe

# Galley CLI（独立构建）
cd ../core
cargo build --release -p galley-cli  # 出 target/release/galley
```

CI release 流程见 [docs/release-workflow.md](./docs/release-workflow.md)；手动 Windows build 见 [docs/windows-build-checklist.md](./docs/windows-build-checklist.md)。

## 致谢

[**lsdefine/GenericAgent**](https://github.com/lsdefine/GenericAgent) —— Galley 建立在其之上的 agent framework —— 是一个自演化的 LLM agent，围绕单一原则设计：**上下文信息密度最大化（contextual information density maximization）**。它不追求 raw context 长度，而是通过四个互锁机制——最小原子工具集、默认只暴露浅层 high-level 视图的分层按需记忆、把过往轨迹蒸馏成可复用 SOP 和可执行代码的自演化层、以及在长执行中维持密度的 context 截断/压缩层——让 active context 保持小巧且决策相关。推理、工具调度、记忆固化、SOP 系统全部来自 GA。Galley 提供桌面工作台和让外部 agent 编排的 CLI，但严格 non-invasive：删掉 Galley，GA 独立运行不受影响。

论文：[GenericAgent: A Token-Efficient Self-Evolving LLM Agent via Contextual Information Density Maximization (arXiv:2604.17091)](https://arxiv.org/abs/2604.17091)

## License

[MIT](./LICENSE)

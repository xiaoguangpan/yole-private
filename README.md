<p align="center">
  <img src="docs/assets/yole-icon.png" alt="Yole logo" width="96" />
</p>

<h1 align="center">Yole</h1>

<p align="center">
  <strong>在自己的电脑上同时运行多个 AI Agent 会话，随时切换、管理和继续</strong>
  <br/>
  自带 GenericAgent 内核 · GUI / CLI 双原生 · 本地优先
</p>

<p align="center">
  <a href="https://na.itxgp.com/yole-downloads/windows/Yole_0.0.1_x64-setup.exe"><strong>Download</strong></a>
  ·
  <a href="#quick-start">Quick Start</a>
  ·
  <a href="https://github.com/xiaoguangpan/yole">GitHub</a>
  ·
  <a href="./docs/README.md">Docs</a>
  ·
  <a href="./README_en.md">English</a>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT" /></a>
  <a href="https://github.com/xiaoguangpan/yole/releases"><img src="https://img.shields.io/github/v/release/xiaoguangpan/yole?include_prereleases" alt="Latest Release" /></a>
  <a href="https://github.com/xiaoguangpan/yole/releases"><img src="https://img.shields.io/badge/platform-Windows-blue" alt="Platform" /></a>
  <a href="https://github.com/xiaoguangpan/yole/stargazers"><img src="https://img.shields.io/github/stars/xiaoguangpan/yole?style=social" alt="Stars" /></a>
</p>

<p align="center">
  <img src="docs/screenshots/screenshot_05.png" alt="Yole 主对话界面" width="800" />
</p>

---

## Yole 是什么

Yole 在你的电脑上并行运行多个 AI agent session。Human 用 GUI 看进度、发指令、做审批；Supervisor Agent 用 CLI 编排同一支 session team。

| 给人用 | 给 agent 用 | 默认开箱即用 |
|---|---|---|
| GUI 管 session、项目、工具时间线和审批 | `yole` CLI 是公开契约，方便 Supervisor Agent 调度 | 内置 GenericAgent runtime、CPython 3.11、运行依赖和浏览器控制插件目录 |

已有 [GenericAgent](https://github.com/lsdefine/GenericAgent) 用户也可以在 **Settings → Runtime** 接入外部 GA；Yole 不修改外部 GA 代码、memory、SOP 或 `mykey.py`。

---

## Highlights

| | |
|---|---|
| 📦 **开箱即用**<br/>内置 GenericAgent runtime、bundled CPython 3.11 和运行依赖。 | 🪟 **多 session + Project 编排**<br/>多任务并行跑；复杂目标可由 Supervisor Agent 拆到一个 Project 下统一汇总。 |
| ⚙️ **GUI + CLI 双原生**<br/>人在 GUI 里操作，Supervisor Agent 通过稳定的 `yole` CLI 操作；两边共享同一份 session 和历史。 | 💬 **Channels**<br/>在 **Settings → Channels** 扫码接入微信；Yole 运行时，可以直接从微信给 Yole 发消息。更多聊天软件后续扩展。 |
| 🔒 **Localhost-only**<br/>Core 只监听 Unix socket / Windows named pipe；远程传输交给 Supervisor Agent。 | 🔧 **工具时间线 + 审批**<br/>工具调用、参数、结果、时延内联展示；高风险动作可审批、白名单或 YOLO。 |
| 🌐 **浏览器控制**<br/>连接 Chrome / Edge / Chromium 后，agent 可以操作你已登录的浏览器。发挥你的想象空间。 | 💾 **持久化 + 搜索 + 后台常驻**<br/>关窗不退出，远程通过 Supervisor Agent 调度，回来继续聊、搜索历史会话。 |

---

## Quick Start

你需要先准备好可用的 LLM 服务：API Key、Base URL 和模型名。

| 1. 下载 Yole | 2. 配置模型 | 3. 开始使用 |
|---|---|---|
| 从 [官方下载](https://na.itxgp.com/yole-downloads/windows/Yole_0.0.1_x64-setup.exe) 下载 Windows 安装包；[GitHub Releases](https://github.com/xiaoguangpan/yole/releases) 作为备用入口。 | 首次启动会自动领取体验额度；也可以在 Settings 里切换自己的模型配置。 | 点击「测试并开始使用 Yole」，进入主对话界面。 |

| 平台 | 安装包 |
|---|---|
| Windows x64 | `Yole_0.0.1_x64-setup.exe` |

<details>
<summary>安装提示</summary>

macOS 暂未代码签名，首次开启如被系统拦截，可运行：

```bash
xattr -dr com.apple.quarantine /Applications/Yole.app
```

Windows SmartScreen 提示发布者未知时，点「更多信息」→「仍要运行」。

已有 GenericAgent 环境时，在 **Settings → Runtime → 接入外部 GA** 选择 GA 目录。

</details>

---

## Supervisor / Channels

GUI 启动后进 **Settings → Agent**：

| 按钮 | 做什么 |
|---|---|
| **复制 SOP** | 复制 [`yole-supervisor-sop.md`](./docs/integrations/yole-supervisor-sop.md)，发给你的 Agent，让它学会在单 session、已有 session 跟进、Project-backed session group 之间选择 |
| **查看 Agent API 文档** | 打开完整命令清单、JSON schema 和 exit code |

用户无需学习 CLI，直接用自然语言告诉 Supervisor Agent，让它安排 Yole 做什么即可。复杂任务不会直接变成一个“大 prompt”：Supervisor SOP 会先选择编排模式，简单问题直接读或跟进一个 session，复杂目标用 Project 承载一组 sessions 并行跑，结束后汇总。也可以在 **Settings → Channels** 接入微信，扫码后从微信给 Yole 发消息。

<details>
<summary>展开 CLI 示例</summary>

Yole 运行时，Supervisor Agent 可以在同一台机器上调用 `yole` 派任务：

```bash
# 看现在跑啥
yole status
yole sessions list

# 开个新 session 跟进 PR
yole session new --project=proj_work \
  --supervisor=ga-claude-1 --reason="跟进 PR review" \
  "看下 #1234 的反馈"

# 复杂目标：用一个 Project 承载一组 sessions
yole project create "Release readiness review" \
  --supervisor=ga-claude-1 --reason="并行检查发布风险"

yole session new "只读检查 app identity、数据目录、SQLite migration 和备份风险。输出风险清单和证据。" \
  --project=proj_from_create --supervisor=ga-claude-1 --reason="检查数据安全"

yole session new "只读检查 packaging、release workflow、bundled resources 和版本号。输出 release blocker checklist。" \
  --project=proj_from_create --supervisor=ga-claude-1 --reason="检查发布打包"

yole project follow proj_from_create --tail=80 --until-idle --final-show

# 长连接看一个 session 的事件流
yole session watch <id>

# 切 LLM / 归档 / 重启
yole llm set <id> "另一个模型名"
yole session archive <id> --supervisor=ga-claude-1 --reason="done"
```

每个命令都自动携带 origin 三元组 (`via=supervisor`, `supervisor=ga-claude-1`, `reason=...`)，GUI 端时间线上会标注「@ga-claude-1 · 跟进 PR review · 2 分钟前」让 human 一眼看到 supervisor 做过什么。

完整命令清单 + JSON schema + exit code 见 [`docs/agent-api.md`](./docs/agent-api.md)。

</details>

---

## Architecture

GUI 和 CLI 都接到同一个 Rust Core；Core 管 session 生命周期、SQLite 写入和 runner 事件广播。

```text
+----------------+                  +----------------+
|   Yole GUI   |---+          +---|   Yole CLI   |
|  Tauri/React   |   |          |   |      Rust      |
+----------------+   |          |   +----------------+
                     v          v
              +------------------------+        localhost only
              |      Yole Core       | <----  unix socket / named pipe
              |          Rust          |        0600 / no token / no TLS
              |  - session lifecycle   |
              |  - SQLite authority    |
              |  - runner + events     |
              +-----------+------------+
                          |
             +------------+------------+
             v                         v
       +------------+             +------------+
       | Runner #1  |     ...     | Runner #N  |        one per session
       |  Python    |             |  Python    |
       +-----+------+             +------+-----+
             |                           |
             +------------+--------------+
                          v
              +------------------------+
              |   Yole-managed GA    |
              | - GenericAgent kernel  |
              | - Yole prompt profile|
              | - bundled CPython 3.11 |
              | - bundled dependencies |
              +------------------------+
```

(1) GUI 跟 CLI 是**对等前端**，不是 GUI 包 CLI；

(2) **Rust core 是权威层**，session 状态、SQLite 写、runner 生命周期都归它管；

(3) 默认路径是 **Yole-managed GA**：GenericAgent 是内置 agent 内核。

**技术栈：** Tauri v2 + React 19 + TypeScript 5.8 + Tailwind v4 / Rust (Yole Core + Yole CLI) / Python (runner，包装 GenericAgent) / SQLite + FTS5 trigram

更多文档入口：
[架构说明](./docs/architecture.md) ·
[贡献指南](./CONTRIBUTING.md) ·
[文档索引](./docs/README.md)

---

## Why "Yole"?

船上的 yole 是厨房，也是工作台。每个人来这里都有自己的事，**但桌子是同一张**。

Yole 也是这张桌子：human 在 GUI 推进工作，Supervisor Agent 通过 CLI 管理 agent team。两边共享同一份 session、历史和决策日志，不是各开各的 tab。

## Screenshots

| | |
|---|---|
| ![](docs/screenshots/screenshot_01.png) | ![](docs/screenshots/screenshot_02.png) |
| ![](docs/screenshots/screenshot_03.png) | ![](docs/screenshots/screenshot_04.png) |

<sub>*部分截图来自早期版本，界面仍在快速迭代。*</sub>

## 反馈 / 发布

Yole 当前使用公开仓库承接下载、更新日志和问题反馈：

- GitHub: [xiaoguangpan/yole](https://github.com/xiaoguangpan/yole)
- 下载: [Yole_0.0.1_x64-setup.exe](https://na.itxgp.com/yole-downloads/windows/Yole_0.0.1_x64-setup.exe)
- 反馈: [Issues](https://github.com/xiaoguangpan/yole/issues)

源码暂未公开。公开仓库用于产品介绍、安装包分发、路线图和用户反馈。

## 致谢

[**lsdefine/GenericAgent**](https://github.com/lsdefine/GenericAgent) 是 Yole 当前的 agent 内核。Yole 的内置 runtime 基于 GenericAgent，并保留外部 GA attach 兼容路径；Yole 额外提供本地编排、GUI / CLI 对等前端、session 持久化、审批、搜索和打包后的开箱即用体验。

相关论文：[GenericAgent: A Token-Efficient Self-Evolving LLM Agent via Contextual Information Density Maximization (arXiv:2604.17091)](https://arxiv.org/abs/2604.17091)

## License

[MIT](./LICENSE)

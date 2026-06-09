<p align="center">
  <img src="docs/assets/yole-icon.png" alt="Yole logo" width="96" />
</p>

<h1 align="center">Yole</h1>

<p align="center">
  <strong>Run, manage, and resume multiple AI agent sessions on your own computer</strong>
  <br/>
  Bundled GenericAgent kernel · GUI / CLI dual-native · Local-first
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
  <a href="./README.md">中文</a>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT" /></a>
  <a href="https://github.com/xiaoguangpan/yole/releases"><img src="https://img.shields.io/github/v/release/xiaoguangpan/yole?include_prereleases" alt="Latest Release" /></a>
  <a href="https://github.com/xiaoguangpan/yole/releases"><img src="https://img.shields.io/badge/platform-Windows-blue" alt="Platform" /></a>
  <a href="https://github.com/xiaoguangpan/yole/stargazers"><img src="https://img.shields.io/github/stars/xiaoguangpan/yole?style=social" alt="Stars" /></a>
</p>

<p align="center">
  <img src="docs/screenshots/screenshot_05.png" alt="Yole main conversation view" width="800" />
</p>

---

## What Is Yole

Yole runs multiple AI agent sessions in parallel on your own computer. Humans use the GUI to watch progress, send instructions, and approve actions; Supervisor Agents use the CLI to orchestrate the same session team.

| For Humans | For Agents | Ready By Default |
|---|---|---|
| Manage sessions, projects, tool timelines, and approvals in the GUI | The `yole` CLI is a stable contract for Supervisor Agents | Bundled GenericAgent runtime, CPython 3.11, runtime dependencies, and Browser Control setup assets |

Already have your own [GenericAgent](https://github.com/lsdefine/GenericAgent) environment? Connect it from **Settings -> Runtime**. Yole does not modify your external GA code, memory, SOP, or `mykey.py`.

---

## Highlights

| | |
|---|---|
| 📦 **Out of the box**<br/>Bundled GenericAgent runtime, CPython 3.11, and runtime dependencies. | 🪟 **Multi-session + Project orchestration**<br/>Run multiple tasks in parallel; complex goals can be split into one Project and synthesized by a Supervisor Agent. |
| ⚙️ **GUI + CLI dual-native**<br/>Humans operate in the GUI; Supervisor Agents operate through the stable `yole` CLI. Both share the same sessions and history. | 💬 **Channels**<br/>Connect WeChat from **Settings -> Channels** by scanning a QR code; while Yole is running, you can message Yole from WeChat. More messaging apps can be added later. |
| 🔒 **Localhost-only**<br/>Core listens only on a Unix socket / Windows named pipe; remote transport belongs to the Supervisor Agent. | 🔧 **Tool timeline + approvals**<br/>Tool calls, args, results, and timing are shown inline; risky actions can use approval, allowlists, or YOLO mode. |
| 🌐 **Browser Control**<br/>After connecting Chrome / Edge / Chromium, the agent can operate your signed-in browser. There is a lot of room to explore. | 💾 **Persistence + search + background mode**<br/>Close the window, keep working via a Supervisor Agent, then come back to continue or search past sessions. |

---

## Quick Start

Prepare a usable LLM service first: API Key, Base URL, and model name.

| 1. Download Yole | 2. Configure a model | 3. Start using it |
|---|---|---|
| Download the Windows installer from the [official download URL](https://na.itxgp.com/yole-downloads/windows/Yole_0.0.1_x64-setup.exe); [GitHub Releases](https://github.com/xiaoguangpan/yole/releases) is the backup entry. | First launch can provision trial credit automatically; you can also switch to your own model config in Settings. | Click "Test and start using Yole" to enter the main conversation view. |

| Platform | Installer |
|---|---|
| Windows x64 | `Yole_0.0.1_x64-setup.exe` |

<details>
<summary>Install notes</summary>

Yole is not code-signed yet. If macOS blocks the first launch, run:

```bash
xattr -dr com.apple.quarantine /Applications/Yole.app
```

On Windows, when SmartScreen says the publisher is unknown, choose "More info" -> "Run anyway".

If you already have a GenericAgent environment, choose the GA folder from **Settings -> Runtime -> Connect external GA**.

</details>

---

## Supervisor / Channels

In the running GUI, open **Settings -> Agent**:

| Button | What it does |
|---|---|
| **Copy SOP** | Copies [`yole-supervisor-sop.md`](./docs/integrations/yole-supervisor-sop.md), so your Agent can choose between one session, an existing-session follow-up, or a Project-backed session group |
| **Open Agent API docs** | Opens the full command reference, JSON schemas, and exit codes |

You do not need to learn the CLI yourself. Tell your Supervisor Agent what you want in natural language, and let it decide how to operate Yole. Complex work does not become one giant prompt: the Supervisor SOP first chooses an orchestration mode, follows one session for simple requests, and uses a Project-backed group of sessions for independent work that needs synthesis. You can also connect WeChat from **Settings -> Channels**, scan the QR code, and message Yole from WeChat.

<details>
<summary>Show CLI examples</summary>

When Yole is running, a Supervisor Agent on the same machine can dispatch tasks through `yole`:

```bash
# What's running right now?
yole status
yole sessions list

# Start a new session to follow up on a PR
yole session new --project=proj_work \
  --supervisor=ga-claude-1 --reason="follow up on PR review" \
  "look at the feedback on #1234"

# Complex goal: use one Project to hold a group of sessions
yole project create "Release readiness review" \
  --supervisor=ga-claude-1 --reason="parallel release-risk review"

yole session new "Read-only check of app identity, data directory, SQLite migrations, and backup risks. Output risks with evidence." \
  --project=proj_from_create --supervisor=ga-claude-1 --reason="check data safety"

yole session new "Read-only check of packaging, release workflow, bundled resources, and version bumps. Output a release blocker checklist." \
  --project=proj_from_create --supervisor=ga-claude-1 --reason="check release packaging"

yole project follow proj_from_create --tail=80 --until-idle --final-show

# Watch one session's event stream
yole session watch <id>

# Switch model / archive / restart
yole llm set <id> "another model name"
yole session archive <id> --supervisor=ga-claude-1 --reason="done"
```

Every command carries an origin triple (`via=supervisor`, `supervisor=ga-claude-1`, `reason=...`). The GUI timeline annotates supervisor-issued work with "@ga-claude-1 · follow up on PR review · 2 min ago" so the human can see what happened at a glance.

Full command reference, JSON schemas, and exit codes live in [`docs/agent-api.md`](./docs/agent-api.md).

</details>

---

## Architecture

Both GUI and CLI talk to the same Rust Core. Core owns session lifecycle, SQLite writes, runner management, and event broadcasting.

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

1. GUI and CLI are **peer frontends**, not GUI wrapping CLI.
2. **Rust Core is authoritative** for session state, SQLite writes, and runner lifecycle.
3. The default path is **Yole-managed GA**: GenericAgent is the bundled agent kernel.

**Tech stack:** Tauri v2 + React 19 + TypeScript 5.8 + Tailwind v4 / Rust (Yole Core + Yole CLI) / Python (runner, wraps GenericAgent) / SQLite + FTS5 trigram

More docs:
[Architecture](./docs/architecture.md) ·
[Contributing](./CONTRIBUTING.md) ·
[Docs index](./docs/README.md)

---

## Why "Yole"?

A ship's yole is both kitchen and yole. Everyone comes there for a different reason, but **the table is the same table**.

Yole is that shared table: humans drive work from the GUI, while Supervisor Agents manage the team through the CLI. Both share the same sessions, history, and decision log instead of living in separate tabs.

## Screenshots

| | |
|---|---|
| ![](docs/screenshots/screenshot_01.png) | ![](docs/screenshots/screenshot_02.png) |
| ![](docs/screenshots/screenshot_03.png) | ![](docs/screenshots/screenshot_04.png) |

<sub>*Some screenshots are from earlier versions while the interface is still moving quickly.*</sub>

## Feedback / Releases

Yole uses the public repository for downloads, release notes, and user feedback:

- GitHub: [xiaoguangpan/yole](https://github.com/xiaoguangpan/yole)
- Download: [Yole_0.0.1_x64-setup.exe](https://na.itxgp.com/yole-downloads/windows/Yole_0.0.1_x64-setup.exe)
- Feedback: [Issues](https://github.com/xiaoguangpan/yole/issues)

The full source code is not public at this stage. The public repository is for
product information, installers, roadmap, and feedback.

## Acknowledgments

[**lsdefine/GenericAgent**](https://github.com/lsdefine/GenericAgent) is Yole's current agent kernel. Yole's bundled runtime is built on GenericAgent while preserving compatibility with external GA environments; Yole adds local orchestration, peer GUI / CLI frontends, session persistence, approvals, search, and an out-of-the-box packaged experience.

Paper: [GenericAgent: A Token-Efficient Self-Evolving LLM Agent via Contextual Information Density Maximization (arXiv:2604.17091)](https://arxiv.org/abs/2604.17091)

## License

[MIT](./LICENSE)

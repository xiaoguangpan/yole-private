# Architecture

Yole is a local agent team orchestrator with two first-class frontends:

- **Yole GUI** for the human operator at the desktop.
- **Yole CLI** for trusted Agent / Supervisor automation on the same machine.

Both frontends talk to the same Rust-side authority layer: Yole Core.

```text
Yole GUI (Tauri/React)        Yole CLI (Rust)
          \                         /
           \                       /
            v                     v
              Yole Core (Rust)
              - session lifecycle
              - SQLite writes
              - runner ownership
              - local socket / named pipe
                       |
                       v
          Runner processes (Python, one per session)
                       |
                       v
              GenericAgent subprocesses
```

## Design Goals

Yole is built around four ideas:

1. **Local-first orchestration.** Yole runs on the user's machine and keeps
   data local.
2. **Human and agent parity.** A person can use the GUI; another trusted agent
   can use the CLI.
3. **Non-invasive GenericAgent integration.** Yole wraps GA without modifying
   GA files, memory, venv, or tool internals.
4. **Stable agent-facing contract.** The CLI and socket schema are treated as a
   public API for downstream agents and SOPs.

## Core Components

### GUI

The GUI lives in `gui/` and is built with Tauri, React, TypeScript, and
Tailwind. It presents sessions, messages, approvals, settings, and supervisor
activity. It does not own business authority; it invokes Rust commands and
subscribes to events.

### CLI

The CLI lives in `cli/` and exposes the `yole` command. Agents use it to list
sessions, inspect context, create sessions, send messages, move sessions,
switch LLMs, and archive or restore work.

The CLI contract is documented in [agent-api](./agent-api.md). For `v0.2.0`,
`schemaVersion: 1` is frozen.

### Yole Core

Yole Core lives in `core/`. It owns:

- SQLite reads and writes
- migrations and pre-migration backup
- session lifecycle
- runner process lifecycle
- local socket / named pipe listener
- Tauri command surface

This is the authoritative layer. New write behavior should be modeled here
first, then exposed to GUI and CLI.

### Runner

The runner lives in `runner/`. It is the Python bridge into GenericAgent. It
starts GA as a child process, registers supported hooks, captures events, and
keeps the integration non-invasive.

Each Yole session maps to its own GenericAgent subprocess.

## Localhost Only

Yole Core accepts local control through:

- AF_UNIX socket on macOS/Linux
- Windows named pipe on Windows

It does not expose a TCP server, HTTP API, token auth, OAuth flow, or remote
login. Remote workflows belong to the user's trusted Supervisor Agent or IM
transport; Yole stays local.

## Data Boundaries

Yole stores:

- session metadata
- messages inside Yole sessions
- tool and approval state
- supervisor action origin fields, such as who issued a command and why

Yole does not store the conversation between the user and their external
Supervisor Agent. That history belongs to the supervisor platform.

## Document Map

- [architecture demo](./architecture-demo.md): code-level proof and grep gates
  for the architecture principles
- [agent-api](./agent-api.md): CLI and socket contract
- [engineering workflow](./engineering-workflow.md): repo map, commands, IPC
  workflow, and contribution conventions
- [desktop runtime](./desktop-runtime.md): Tauri identifier, bundled Python,
  release artifacts, signing policy
- [PRD](./PRD.md): product definition and roadmap

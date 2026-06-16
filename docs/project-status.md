# Project Status

> Maintainer-facing document. For a user-facing overview, read
> [README](../README.md). For architecture, read [architecture](./architecture.md).

This document tracks the current working state of Yole. Long historical
decision trails live in [devlog](./devlog/README.md); implementation playbooks
live in [refactor](./refactor/README.md).

## Current Target

- Package version: `0.0.9`.
- Git tag / GitHub Release: `v0.0.9` is the current release target; the Windows
  package is served by the VPS-hosted stable update channel.
- Agent API schema: `schemaVersion: 1`
- Release tier: VPS stable update channel with a signed Windows update manifest.
- Product shape: dual-native local agent team orchestrator

Yole GUI and Yole CLI are peer frontends over Rust-side Yole Core. The
GUI is for the human operator at the desk; the CLI is for trusted Agent /
Supervisor automation on the same machine.

## Current Release State

`v0.0.9` is the current Windows package target. The signed NSIS package
is produced locally, copied to the release-package handoff folder, uploaded to
the VPS-hosted stable update endpoint, and mirrored into the public distribution
repository release folder.

Current local-test focus:

1. Confirm the Yole points ledger opens from the balance dropdown and renders
   correctly in light, dark, and system themes.
2. Confirm the provisioner `/api/account/ledger` endpoint returns only
   user-safe account and point-history fields.
3. Confirm generated images render inline in the conversation, and attached
   image edit requests use the image-edit endpoint with all current images.
4. Confirm Yole's bundled OfficeCLI is present in the Windows package and the
   managed runtime can call it without global install, PATH writes, auto-update,
   MCP registration, or watch-server commands.
5. Confirm disaster-level root/system-drive destructive commands are blocked
   even when auto-execute mode is enabled.
6. Confirm update relaunch / second launch focuses the existing Yole window
   instead of opening duplicate windows.
7. Confirm ordinary Settings hides managed GA runtime details while preserving
   practical account, points, update, channel, approval, and About controls.

## Status Dashboard

| Area | Status | Read More |
|---|---|---|
| Core architecture | Rust Yole Core is authoritative | [architecture demo](./architecture-demo.md) |
| CLI / Agent API | Feature-complete for v0.2; schema frozen | [agent-api](./agent-api.md) |
| Agent surface | Settings -> Agent, copy-first SOP, Claude Skill | [Supervisor SOP](./integrations/yole-supervisor-sop.md) |
| Managed GA runtime | Bundled runtime remains the current baseline; GUI / CLI split, Provider / Model config, and local encrypted SQLite credentials are active | [managed GA runtime](./managed-ga-runtime.md) |
| Data migration | Backup mechanism exists; runtime identity and managed model config migrations are in dogfood | [B4 M8](./refactor/B4-M8-sub-plan.md) |
| Release path | v0.0.9 uses the VPS-hosted Windows download and update endpoints | [release / update SOP](./release-update-sop.md), [demand pool](./demand-pool.md) |
| Windows | v0.0.9 Windows NSIS package is built locally for manual testing | [Windows checklist](./windows-build-checklist.md) |
| GA baseline | Locked to audited upstream `5d122e20` | [GA baseline](./ga-baseline.md) |

## Compact Timeline

| Phase | Status | Notes |
|---|---|---|
| Stage 0-2 | Complete | Infrastructure, bridge POC, desktop skeleton |
| Stage 3 | Complete | v0.1 desktop yole, multi-session, projects, polish |
| v0.1.1 release path | Shipped | Bundled Python, macOS DMG, Windows NSIS artifact path |
| Bridge-owner prototype | Complete | Validated Rust-side process ownership direction |
| B1 | Complete | Rust core skeleton + read-only CLI |
| B2 | Complete | Bridge ownership moved to Rust + local socket / named pipe |
| B3 | Complete | `useAppStore.ts` removed; state split into domain stores |
| B4 | Shipped with v0.2.0 | CLI writes, schema freeze, discovery file, Settings -> Agent, SOP, Claude Skill, activity UI, backup mechanism |

Detailed phase narratives are intentionally not duplicated here. Use:

- [refactor README](./refactor/README.md) for B-phase execution state
- [devlog README](./devlog/README.md) for chronological decision history
- [PRD](./PRD.md) for product intent and roadmap

## Release Version Rules

- Current package metadata uses `0.0.9`. For the next release, update:
  - `package.json`
  - `core/tauri.conf.json`
  - `core/Cargo.toml`
  - `cli/Cargo.toml`
  - `gui/package.json`
- Use `vX.Y.Z` for Git tag and GitHub Release title.
- Keep Agent API at `schemaVersion: 1`.
- A breaking Agent API change requires `schemaVersion: 2`, with explicit
  compatibility notes in [agent-api](./agent-api.md).

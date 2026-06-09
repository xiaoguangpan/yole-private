# Project Status

> Maintainer-facing document. For a user-facing overview, read
> [README](../README.md). For architecture, read [architecture](./architecture.md).

This document tracks the current working state of Yole. Long historical
decision trails live in [devlog](./devlog/README.md); implementation playbooks
live in [refactor](./refactor/README.md).

## Current Target

- Package version: `0.0.1`.
- Git tag / GitHub Release: `v0.0.1` is not published yet; the current Windows
  package is a local manual-test build.
- Agent API schema: `schemaVersion: 1`
- Release tier: local manual test; no update channel promotion yet.
- Product shape: dual-native local agent team orchestrator

Yole GUI and Yole CLI are peer frontends over Rust-side Yole Core. The
GUI is for the human operator at the desk; the CLI is for trusted Agent /
Supervisor automation on the same machine.

## Current Release State

`v0.0.1` is the current local manual-test package line. It is not published to
GitHub and is not promoted to an app update channel. The Windows NSIS package is
produced locally for hands-on validation before any public release process.

Current local-test focus:

1. Validate first-run Yole account provisioning through the VPS provisioner.
2. Confirm the balance entry, balance refresh button, low-balance warning, and
   QR/contact support flow in the chat surface.
3. Confirm the new Yole app icon and Windows installer metadata.
4. Decide the signed VPS-hosted update channel design before enabling automatic
   client updates.

## Status Dashboard

| Area | Status | Read More |
|---|---|---|
| Core architecture | Rust Yole Core is authoritative | [architecture demo](./architecture-demo.md) |
| CLI / Agent API | Feature-complete for v0.2; schema frozen | [agent-api](./agent-api.md) |
| Agent surface | Settings -> Agent, copy-first SOP, Claude Skill | [Supervisor SOP](./integrations/yole-supervisor-sop.md) |
| Managed GA runtime | Bundled runtime remains the current baseline; GUI / CLI split, Provider / Model config, and local encrypted SQLite credentials are active | [managed GA runtime](./managed-ga-runtime.md) |
| Data migration | Backup mechanism exists; runtime identity and managed model config migrations are in dogfood | [B4 M8](./refactor/B4-M8-sub-plan.md) |
| Release path | v0.0.1 is local manual-test only; VPS-hosted updates are in the demand pool and not enabled yet | [release / update SOP](./release-update-sop.md), [demand pool](./demand-pool.md) |
| Windows | v0.0.1 Windows NSIS package is built locally for manual testing | [Windows checklist](./windows-build-checklist.md) |
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

- Current package metadata uses `0.0.1`. For the next release, update:
  - `package.json`
  - `core/tauri.conf.json`
  - `core/Cargo.toml`
  - `cli/Cargo.toml`
  - `gui/package.json`
- Use `vX.Y.Z` for Git tag and GitHub Release title.
- Keep Agent API at `schemaVersion: 1`.
- A breaking Agent API change requires `schemaVersion: 2`, with explicit
  compatibility notes in [agent-api](./agent-api.md).

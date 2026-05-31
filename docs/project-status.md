# Project Status

> Maintainer-facing document. For a user-facing overview, read
> [README](../README.md). For architecture, read [architecture](./architecture.md).

This document tracks the current working state of Galley. Long historical
decision trails live in [devlog](./devlog/README.md); implementation playbooks
live in [refactor](./refactor/README.md).

## Current Target

- Package version: `0.2.0`
- Git tag / GitHub Release: `v0.2.0`
- Agent API schema: `schemaVersion: 1`
- Release tier: first stable release; published as GitHub Latest and promoted
  to the beta update channel on 2026-05-31.
- Product shape: dual-native local agent team orchestrator

Galley GUI and Galley CLI are peer frontends over Rust-side Galley Core. The
GUI is for the human operator at the desk; the CLI is for trusted Agent /
Supervisor automation on the same machine.

## Current Release State

`v0.2.0` is published as Galley's first stable release. It includes the
alpha.2 build plus post-alpha.2 dogfood fixes: small-screen onboarding,
external-GA runtime probing, clearer model probe copy, unified tooltip
behavior, compact bottom-left toasts, and the managed-mode Channels TopBar
entry.

For the next release:

1. Monitor post-release feedback, especially Windows path handling, selected GA
   virtualenv / user-Python probing, bundled runtime startup, `960x600`
   minimum window behavior, Browser Control, Channels entry, and IM QR refresh.
2. Use `v0.2.1` for focused P0 / P1 bug fixes; do not bundle broad feature
   work into a hotfix.
3. Run release/update dry-run if packaging, signing, updater config, or bundled
   Python dependencies changed.
4. Keep GitHub Release publishing and update-channel promotion as separate
   gates, even for stable releases.
5. Run the standard verification set:
   - `cargo check --workspace`
   - `cargo test --workspace`
   - `pnpm typecheck`
   - `pnpm lint`
   - `git diff --check`

## Status Dashboard

| Area | Status | Read More |
|---|---|---|
| Core architecture | Rust Galley Core is authoritative | [architecture demo](./architecture-demo.md) |
| CLI / Agent API | Feature-complete for v0.2; schema frozen | [agent-api](./agent-api.md) |
| Agent surface | Settings -> Agent, copy-first SOP, Claude Skill | [Supervisor SOP](./integrations/galley-supervisor-sop.md) |
| Managed GA runtime | Shipped in v0.2.0; GUI / CLI split, Provider / Model config, and local encrypted SQLite credentials are the current baseline | [managed GA runtime](./managed-ga-runtime.md) |
| Data migration | Backup mechanism exists; runtime identity and managed model config migrations are in dogfood | [B4 M8](./refactor/B4-M8-sub-plan.md) |
| Release path | v0.2.0 published; macOS DMG + Windows NSIS + gated updater channel are live | [release / update SOP](./release-update-sop.md) |
| Windows | v0.2.0 artifact shipped; post-release feedback should especially watch path / probe / min-window / IM flows | [Windows checklist](./windows-build-checklist.md) |
| GA baseline | Locked to audited upstream commit | [GA baseline](./ga-baseline.md) |

## Compact Timeline

| Phase | Status | Notes |
|---|---|---|
| Stage 0-2 | Complete | Infrastructure, bridge POC, desktop skeleton |
| Stage 3 | Complete | v0.1 desktop workbench, multi-session, projects, polish |
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

- Current package metadata uses `0.2.0`. For the next release, update:
  - `package.json`
  - `core/tauri.conf.json`
  - `core/Cargo.toml`
  - `cli/Cargo.toml`
  - `gui/package.json`
- Use `vX.Y.Z` for Git tag and GitHub Release title.
- Keep Agent API at `schemaVersion: 1`.
- A breaking Agent API change requires `schemaVersion: 2`, with explicit
  compatibility notes in [agent-api](./agent-api.md).

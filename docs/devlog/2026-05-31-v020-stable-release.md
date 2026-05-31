# 2026-05-31 — v0.2.0 stable release

**Date:** 2026-05-31
**Status:** Shipped; GitHub Release published and beta update channel promoted
**Related:** [project status](../project-status.md), [release / update SOP](../release-update-sop.md), [alpha.2 dogfood UX polish](./2026-05-31-alpha2-dogfood-ux-polish.md)

## Context

After the `v0.2.0-alpha.2` dogfood pass, Galley had enough product surface to
ship its first stable release: bundled GA for new users, external GA for
existing users, a stable Agent / CLI contract, Browser Control, and WeChat
Channels. The remaining question was not whether to make another alpha, but
whether the public release should be a clean stable `v0.2.0`.

We chose `v0.2.0` directly. The release workflow built macOS Apple Silicon,
macOS Intel, and Windows artifacts, created a draft GitHub Release, then the
draft was published and the beta update channel was promoted so installed users
can upgrade through Galley's update UI.

## Decisions

- `v0.2.0` is the first stable Galley release, not another alpha or date-based
  release version.
- Release notes stay compact and user-facing: `What's New` plus an
  `Installation Guide`, Chinese first and English second.
- Installer links point directly at release assets so users do not need to hunt
  through the GitHub asset list.
- The GitHub Release was published as non-draft and non-prerelease, then marked
  by GitHub as Latest.
- The beta update channel was promoted to `v0.2.0` only after the Release
  existed and the live manifest verifier passed.
- A release CI failure caused by duplicate pnpm version configuration was fixed
  by letting `pnpm/action-setup` read the root `packageManager` field instead
  of also passing `with.version`.

## Rejected Alternatives

- **Use a date version such as `2026.5.31-alpha`** — less useful for Galley's
  release semantics than semver, and it would make patch releases harder to
  reason about.
- **Ship another prerelease (`v0.2.0-alpha.3` or `v0.2.1-alpha.1`)** — the
  scope is the first stable product milestone, not a narrow alpha follow-up.
- **Leave the Release as manual-download only** — old installed users would not
  see the update, which defeats the point of having the updater path working.
- **Keep GitHub's auto-generated release notes** — they describe commits and
  contributors, but not what a user should download or why this release matters.

## Open Questions

- The live update endpoint is still named `beta`; decide later whether Galley
  needs a separate stable channel or whether the existing channel name is just
  an implementation detail for early installed builds.
- Watch post-release Windows reports closely, especially external GA paths,
  selected Python environments, bundled startup, minimum window size, Browser
  Control, and Channels.
- Code signing, Homebrew, and package-manager distribution remain future
  release-quality work.

## Next

Monitor feedback. If a P0 / P1 regression appears, ship a focused `v0.2.1`
hotfix and promote the update channel again after the normal release gates pass.

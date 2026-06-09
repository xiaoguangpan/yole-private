# Alpha release prep and Browser Control dogfood closeout

**Date**: 2026-05-28  
**Status**: Implemented; `v0.2.0-alpha.1` tag pushed and release workflow running  
**Related**: [release workflow](../release-workflow.md) · [release / update SOP](../release-update-sop.md) · [Windows checklist](../windows-build-checklist.md)

## Context

Windows 11 dogfood after the database-path hotfix confirmed the first-run
onboarding path was repaired: model setup, model test, main UI entry, and
basic UI interactions worked. It then exposed a second layer of Windows-only
release blockers:

- Managed GA could start but fail when asset paths were joined as POSIX-style
  paths inside Windows Python.
- The bridge could surface confusing errors or lose startup feedback while the
  managed runtime was being launched.
- Browser Control setup had moved from an overly forceful modal to a top-bar
  entry, but that made the feature too easy to ignore even though it is central
  to Yole's intended experience.
- Release naming was still pointing at `v0.2.0-beta.1`, while the actual plan
  was a smaller invited-tester build before any broad public beta.

## Decisions

- Fixed Windows managed GA asset path joins in the managed runtime patch set
  and added payload checks so the same class of packaged path bug fails before
  dogfood.
- Hardened Windows bridge startup handling so process failures are surfaced as
  actionable UI state instead of leaving the user in a silent "thinking" or
  crashed-bridge state.
- Changed Browser Control from a blocking first-run modal to a persistent
  product-surface prompt: the TopBar gets a stronger pending state, and the
  main surface can show a non-modal guidance bar. This keeps Browser Control
  hard to ignore without making Yole feel like malware.
- Polished Browser Control setup copy and flow for Windows and macOS:
  "extension page" language became "extension management", Edge opens the
  correct management URL, the folder reveal path works for drag-install, and
  the automated demo button provides immediate running feedback instead of
  feeling frozen.
- Bumped the release target from `v0.2.0-beta.1` to `v0.2.0-alpha.1` for an
  invited-tester prerelease. The top release-note warning is:

  ```text
  仅供内测用户使用，alpha 版本存在稳定性风险，不建议普通用户安装。
  For invited testers only. This alpha build may be unstable and is not recommended for general users.
  ```

- Kept automatic updates separate from the alpha GitHub Pre-release. The alpha
  is for manual downloads only unless we explicitly decide to promote it to the
  existing beta update channel.

## Rejected Alternatives

- **Keep the Browser Control first-run modal**: it made the feature impossible
  to miss, but the interaction felt coercive and could freeze the user's first
  main-screen experience on Windows.
- **Only use a subtle TopBar button**: too quiet for a core capability. New
  users may never understand why Browser Control matters.
- **Ship as `v0.2.0-beta.1` immediately**: the code is close, but the release
  still needs broader Windows artifact dogfood. Calling this alpha sets the
  right expectation.
- **Use `canary` instead of `alpha`**: canary is recognizable to developers,
  but alpha is clearer to invited non-developer testers and sorts correctly
  before a future `0.2.0-beta.1`.
- **Promote the alpha to `updates/beta/latest.json` by default**: that would
  turn an invited-tester release into an update for everyone already pointed at
  the beta channel.

## Open Questions

- The `v0.2.0-alpha.1` release workflow still needs to finish and create the
  draft GitHub Release before publish decisions.
- Draft artifacts need fresh macOS and Windows smoke. Windows should cover:
  clean install, onboarding, managed model chat, Browser Control setup, browser
  task demo, relaunch, and Settings -> About update check.
- Full app-updater E2E remains untested for this alpha unless we create an
  internal public HTTPS update channel or intentionally promote this alpha.

## Next

Wait for the release workflow, inspect the draft assets and generated
`latest.json`, then run manual artifact dogfood. If smoke passes, publish the
GitHub Pre-release with the bilingual alpha warning at the top and keep the
beta update channel untouched.

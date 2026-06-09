# 2026-06-03 - stable release update-channel default

## Date / Status / Related

- Date: 2026-06-03
- Status: Release SOP updated
- Related:
  - [Release / update SOP](../release-update-sop.md)
  - [Release workflow](../release-workflow.md)
  - [Project status](../project-status.md)

## Context

After `v0.2.5` was published as a stable GitHub Release, the update channel was
promoted in a separate step. That was technically correct, but the wording and
workflow made promotion feel like optional cleanup. For installed users, the
release is not truly available until Yole's app updater can see it.

## Decision

Stable and patch releases now treat update-channel promotion as part of the
default release finish line:

1. publish the GitHub Release;
2. promote the default update channel in the same release session;
3. verify the live manifest.

Skipping promotion now requires an explicit `manual-download only` or
`hold updater` marker in the release notes and project status. Tester /
early-adopter releases still default to manual download only.

## Why

- GitHub Release visibility and app-update availability are different surfaces.
- Existing users should not need to watch GitHub to receive stable patches.
- Treating promotion as a Done Criteria prevents "published but not updatable"
  drift.

## Rejected alternatives

- **Promote every release automatically at publish time** — too aggressive for
  alpha, RC, beta tester, or partially smoked builds.
- **Leave promotion as an optional follow-up** — easy to forget, and it creates
  a confusing gap between GitHub Latest and Yole's update UI.

## Next

Use the updated SOP for future stable and patch releases. Keep the `stable`
manifest as the default endpoint and `beta` as the legacy alias for older
installed builds.

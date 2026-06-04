# 2026-06-04 - v0.2.7 Windows runtime hotfix prep

## Date / Status / Related

- Date: 2026-06-04
- Status: `v0.2.7` patch candidate prepared locally; not yet published.
- Related:
  - [GitHub issue #9](https://github.com/wangjc683/galley/issues/9)
  - [Project status](../project-status.md)
  - [Release / update SOP](../release-update-sop.md)
  - [Managed GA patch stack](../../managed-ga/patches/manifest.md)
  - [App updater](../../core/src/app_update.rs)
  - [Settings update control](../../gui/src/components/screens/settings/SettingsUpdateControl.tsx)

## Context

GitHub issue #9 grouped three Windows reports: update checking failed, images
could not be pasted into the dialog, and Python subprocess execution could hang
until stdin was closed. The reports came from Galley `0.2.6` on Windows 10 with
WebView2 and Python 3.13.

The release channel itself was healthy: GitHub Latest was `v0.2.6`, the Windows
setup asset existed, and both `stable` and legacy `beta` manifests reported
`0.2.6`. That moved the updater work from release-channel repair to better
failure diagnostics for user environments where GitHub raw / proxy / TLS access
can fail.

## Decisions

- Ship the Python subprocess fix as a managed GA patch, not as a Windows-only
  special case. `code_run` is non-interactive by design, so child processes
  should receive `stdin=subprocess.DEVNULL` on every platform.
- Keep the fix inside Galley-managed GA only. External / Attach GA remains
  user-owned and must not be modified by Galley.
- Add a regression test that monkeypatches `subprocess.Popen` and asserts the
  child stdin is closed, instead of trying to reproduce the Windows hang in CI.
- Preserve updater's friendly one-line status, but add copyable diagnostics
  with phase, endpoint, and raw detail for troubleshooting.
- Add a manual download link beside update-check errors so users blocked by
  network / proxy / TLS issues still have a clear next action.
- Defer image paste. Galley React/Tauri currently lacks the full image
  paste/send/render/model path, and the issue's referenced file belongs to the
  upstream GenericAgent desktop frontend rather than Galley's main UI.

## Verification

- `cargo check --manifest-path core/Cargo.toml`
- `cargo test --manifest-path core/Cargo.toml`
- `pnpm --dir gui typecheck`
- `pnpm --dir gui lint`
- `.venv/bin/python -m pytest`
- `.venv/bin/python -m mypy runner`
- `.venv/bin/ruff check runner`
- `node scripts/check-managed-ga-payload.mjs`
- `git diff --check`

## Rejected alternatives

- Closing the Rust runner stdin: rejected because RunnerManager needs a piped
  stdin for the bridge IPC protocol.
- Treating update-check failure as failed channel promotion: rejected because
  live manifests and GitHub Release state verified as healthy.
- Sending a public GitHub reply before publishing: rejected because a post-
  release reply can give the reporter a concrete fixed version to install and
  retest.
- Bundling image paste into this patch: rejected because it spans GUI preview,
  storage / limits, IPC, managed GA multimodal content, and conversation
  rendering. It should be a dedicated feature / bugfix.

## Open questions

- Whether Windows updater diagnostics should eventually expose a first-class
  "copy details" button instead of inline truncated diagnostics.
- Whether image paste should be implemented as a Galley-native multimodal
  attachment path or deferred until the managed GA multimodal contract is
  tightened upstream.

## Next

Create the `v0.2.7` release commit, generate a draft GitHub Release, review the
macOS / Windows artifacts, publish only after smoke, then promote `stable` and
the legacy `beta` alias. Reply to issue #9 after the published release is
available to users.

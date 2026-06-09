# Desktop Runtime

> Maintainer-facing document for packaging, app data, and runtime policy.
> For a general architecture overview, read [architecture](./architecture.md).

This document covers desktop packaging and runtime invariants: Tauri app data,
identifier safety, unsigned releases, bundled Python, and Mac / Windows notes.

## Tauri Identifier

Tauri `identifier` binds Yole's app directories on all supported platforms.
The main SQLite DB follows `tauri-plugin-sql` and lives in the app config
directory:

- macOS: `~/Library/Application Support/{identifier}/`
- Linux: `$XDG_CONFIG_HOME/{identifier}/` or `~/.config/{identifier}/`
- Windows: `%APPDATA%/{identifier}/`

Yole currently uses `app.yole`. SQLite data for sessions, projects,
tool events, prefs, and migrations lives under that identifier-controlled
directory.

Changing the identifier without migration makes user data appear to vanish,
because the app starts reading an empty new directory.

## Identifier Change Rule

Do not change the Tauri identifier unless the same change includes:

1. Rust-side startup migration from old data directory to new data directory.
2. Fallback copy / rename behavior if the new DB is missing but the old DB
   exists.
3. Dogfood using a manually seeded old data directory.
4. Release notes explaining the one-time migration.

Historical lesson: an earlier 2026-05-13 identifier rename to `app.yole`
made sessions appear missing during dogfood. The data was not lost; the app was
looking at a new directory.

## Signing Strategy

Pre-v1.0 Yole ships unsigned:

- macOS `.app` / `.dmg` are not codesigned or notarized.
- Windows `.exe` / NSIS installer is not signed with an EV certificate.
- Release notes must explain first-launch friction.

Current decision, 2026-05-18: unsigned is acceptable for the current personal
open-source stage. Re-evaluate before v1.0 or when user scale makes manual
Gatekeeper / SmartScreen bypass too costly.

Expected user flow:

- macOS: right click the app, choose Open, then confirm the Gatekeeper dialog.
- Windows: SmartScreen -> More info -> Run anyway.

Any PR adding `codesign`, `notarytool`, or `signtool.exe` should also update
this policy and [release workflow](./release-workflow.md).

## Auto Update Runtime

Yole checks for app updates on startup and exposes the current update state in
Settings -> About / Runtime. Update delivery is enabled only for builds that
provide both compile-time variables:

- `YOLE_UPDATER_PUBKEY`: Tauri updater public key embedded in the app.
- `YOLE_UPDATER_ENDPOINT`: HTTPS URL for the updater manifest.

Current stable endpoint:

```text
https://na.itxgp.com/yole-updates/stable/latest.json
```

VPS-hosted updates are the current release path for Windows manual-test builds.
GitHub Releases may be used as a backup distribution surface, but installed
apps should read the explicit VPS manifest above unless a future release plan
changes this document.

Without both values, the app reports that this build is not connected to an
update channel and local development keeps working. This is intentional: Tauri
updater package verification is mandatory and should not be bypassed just
because Yole itself is still unsigned at the OS level.

Update installation is task-protected. If any session is actively running,
Yole may remember that an update is available, but it will not download,
install, or relaunch for that update until the session is idle. This avoids
turning a background maintenance action into a lost-task event.

## Background Mode

Yole runs in Background Mode by default on macOS and Windows. Closing the
main window hides the window; it does not quit the app or shut down Yole Core.
This keeps local socket access alive for the CLI, Supervisor automation, and
external IM / agent frontends while the desktop window is out of the way.

The first time the window is hidden to background on a device, Yole shows a
one-time native dialog explaining that closing only hides the window and that
true exit happens via `Quit Yole`. The dialog is informational (single OK
button); it never offers to quit and never blocks the hide. The seen state is
persisted in the `close_to_background_hint_seen` pref: written by the Rust close
handler on first show, and read back during Rust `setup` (right after
migrations) to arm an in-process guard before the window can be closed. Seeding
in `setup` rather than at GUI hydrate is deliberate — it keeps the hint
at-most-once-per-device even if the user closes the window before the GUI
finishes hydrating. The dialog copy is localized: the GUI pushes the
active-language title / body into Yole Core at hydrate and on language change
(the close handler runs synchronously and cannot reach GUI i18n itself).

Platform behavior:

- macOS: window close and `Cmd+W` hide the main window. The Dock icon remains,
  and a right-side menu bar status item can reopen or hide Yole.
- Windows: the window close button and `Alt+F4` hide Yole to the system tray.
  The tray menu can reopen or hide Yole.

True application exit is explicit:

- The tray / status item exposes `Quit Yole`.
- macOS also exposes `Quit Yole` from the app menu with `Cmd+Q`.
- If any Agent task is running, true quit asks for confirmation before shutting
  down the app and interrupting active work.

The tray / status item provides the small set of actions useful while Yole is
running in the background:

- `Open Yole` / `Hide Yole`: mirror the current simple window state.
- `New Chat`: reopen Yole and start a new conversation.
- `Settings`: reopen Yole and open Settings.
- `Check for Updates...`: reopen Yole to Settings -> About and check the
  update channel.
- `Quit Yole`: explicitly exit the app.

The first version intentionally has no running / approval badge; task state
remains inside the main UI.

Tauri updater signing is separate from macOS codesigning / Windows Authenticode.
The private updater key must stay in release secrets; only the public key is
safe to embed in app builds.

Release builds opt into signed updater artifacts by generating
`core/tauri.updater.generated.conf.json` inside CI. The default
`tauri.conf.json` intentionally does not enable `createUpdaterArtifacts`, so
local Dev and unsigned local builds do not require `TAURI_SIGNING_PRIVATE_KEY`.

The release workflow can create a candidate `latest.json` as a draft Release
asset. For the current VPS-hosted channel, the final signed package and
`latest.json` are uploaded to the VPS paths documented in
[repository and release topology](./repository-and-release-topology.md).

## Bundled Python

Since v0.1.1, Yole release builds embed CPython 3.11.15 plus GenericAgent core
dependencies. Users do not need to configure Python or a venv for normal use.

Runtime policy:

- Managed / bundled GA must be open-and-run from Yole's own Python and
  packaged dependencies. A release that needs the user's Python to start the
  managed runtime is not release-ready.
- Attach / external GA also defaults to Yole's bundled Python in release
  builds. This gives user-owned GenericAgent checkouts the same baseline
  dependencies without letting Yole modify the checkout, venv, PATH, or state.
- External Python is an explicit escape hatch (`gaConfig.useExternalPython =
  true`) for user-added dependencies, unsupported upstream frontends, or users
  who deliberately want their own interpreter.
- Dev mode uses external Python because `$RESOURCE` does not point at the final
  bundle resource directory during `pnpm tauri dev`.

Implementation notes:

- Source: `python-build-standalone` install-only stripped builds.
- Script: `scripts/bundle-python.sh`.
- Output: `core/python-bundle/python/` generated per target arch.
- Tauri resource: `python-bundle/python/` is bundled as `$RESOURCE/python/`.
- Tauri aliases:
  - `python-bundled` for macOS / Linux (`bin/python3`)
  - `python-bundled-win` for Windows (`python.exe`)
- Release gate: `scripts/check-bundled-python-managed-ga.sh` verifies that the
  generated bundle can import `managed-ga/code` and Yole-owned runtime deps.

Bundled GenericAgent core deps are audited during baseline upgrades. See
[GA baseline](./ga-baseline.md).

## Managed GenericAgent Runtime

Managed / bundled GA keeps code and state separate:

- App resources contain `managed-ga/manifest.json`, `managed-ga/code/`, and
  `managed-ga/patches/`.
- Application Support contains `managed-ga-state/` and
  `managed-model-config/`.
- For unsigned release builds, `yole.db` contains encrypted managed model
  API key payloads plus the local encryption key. Generated runtime config stores
  only `apiKeyRef`, never plaintext API keys.

Yole may replace the managed code payload during an app update, but it must
not overwrite managed state. Startup may create missing state directories only.
Advanced diagnostics can show managed runtime paths, baseline commit, patch
stack status, and generated config presence; diagnostics must never display API
keys.

Backups of Application Support are expected to restore sessions, managed GA
state, non-secret model metadata, and encrypted managed model credentials for
unsigned release builds.

The managed-runtime product and upgrade rules live in
[managed GA runtime](./managed-ga-runtime.md).

Release builds run `node scripts/check-managed-ga-payload.mjs` before packaging.
That gate verifies the Tauri resource mapping, managed GA manifest, prompt
files, patch stack, and absence of generated / local / secret-bearing artifacts
inside `managed-ga/code`.

## Release Artifacts

Current release path:

- macOS Apple Silicon DMG via CI.
- macOS Intel DMG via CI cross-compile path where available, local fallback if
  needed.
- Windows x64 NSIS installer via CI.

The release-day checklist lives in [release / update SOP](./release-update-sop.md).
The detailed release process lives in [release workflow](./release-workflow.md).
Windows manual smoke lives in [windows build checklist](./windows-build-checklist.md).

## Platform Terminology

- `macOS` means the operating system. Use for platform names, system
  requirements, and release titles.
- `Mac` means the hardware family or user device.
- Release title example: `Yole v0.2.0`.

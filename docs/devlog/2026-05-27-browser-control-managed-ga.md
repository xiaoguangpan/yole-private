# 2026-05-27 — Browser Control as a managed GA completion item

**Date:** 2026-05-27
**Status:** Implemented first version
**Related:** `docs/managed-ga-runtime.md`, `docs/DESIGN.md`, `managed-ga/code/assets/tmwd_cdp_bridge`

## Context

GA's real-browser capabilities (`web_scan` / `web_execute_js`) are a key part
of the intended experience. Attach-mode users historically handled the
Chromium extension themselves, but managed / bundled GA is now Galley's
recommended path. That makes Browser Control a Galley onboarding problem, not
an upstream tutorial footnote.

The upstream tutorial asks users to load `tmwd_cdp_bridge` and then try a
browser task such as searching Baidu weather. We decided Galley should not just
link that tutorial. It should prepare the `tmwd_cdp_bridge` folder, guide the
user through opening the Chromium extensions page and dragging / loading that
folder, test the connection, and then offer a simple demo.

## Decisions

- Browser Control is a core managed-GA completion item, not an optional
  Settings preference.
- The main entry lives in TopBar as a persistent Browser Control indicator.
  Missing state is intentionally high-attention and cannot be dismissed.
- The first implementation supports Chromium-family browsers. Chrome and Edge
  get one-click extension-page buttons; other Chromium browsers can manually
  load the same unpacked extension folder. Safari / Firefox stay out of scope
  because the bridge is CDP / Chrome extension based.
- Galley syncs the shipped extension into a stable app-data directory. Users do
  not load the extension from inside `Galley.app/Contents/Resources` or from a
  developer checkout path.
- Galley owns the upstream "run GA once before installing" prerequisite in
  managed mode. It prepares missing `tmwd_cdp_bridge/config.js` automatically;
  if that preparation fails, setup remains on step 1 with a retry action.
- Setup steps should keep opening the extensions page and installing the folder
  as separate actions. Chrome / Edge users can drag the prepared
  `tmwd_cdp_bridge` folder into the extensions page; if drag-and-drop fails,
  selecting the same folder through "Load unpacked" is the fallback.
- The official Datawhale tutorial has useful screenshots and motion examples,
  so setup can include a lightweight `图文指南` link near the folder-install
  step. It should be an auxiliary visual guide rather than the primary CTA, and
  should link directly to the Chrome install anchor instead of the chapter top
  so Galley users do not first see upstream-only prerequisites.
- Extension-page buttons use Galley's backend platform opener instead of the
  generic Tauri opener: `chrome://` / `edge://` are browser-internal pages, not
  ordinary web URLs. macOS uses browser bundle IDs, Windows checks standard
  Chrome / Edge install paths and falls back to `cmd /C start`, and direct
  browser binary launches must not wait for the browser process to exit.
- On each launch, if Browser Control is not connected, Galley can show the setup
  dialog once. Closing it suppresses only the modal for that launch; TopBar
  remains in the missing state.
- The connection test is deterministic and model-free: extension layout,
  TMWebDriver connection, tab discovery, and minimal JS execution.
- If a user already installed a compatible GA browser extension, a successful
  Galley probe counts as ready. The UI should not force reinstalling from the
  Galley-managed folder; that folder is the repair / install source.
- Once Browser Control is verified, the TopBar entry becomes quiet: icon-only
  with no status dot and no motion. Use a `PuzzlePiece` icon rather than a
  browser/window icon so the entry reads as extension capability instead of an
  unread browser notification. Place it next to Settings, after the conversation
  width toggle. Strong guidance resumes only when the connection is missing or
  broken.
- In the success dialog, the modal title owns the "available" conclusion. The
  connection evidence ("已连接浏览器" plus detected operable tabs) should be
  visually quiet rather than a persistent green success card, while maintenance
  actions such as "重新测试" and "重新加载插件" live together in the bottom action
  row.
- The post-success demo is explicit and Chinese-safe: use Baidu rather than
  Google search, avoiding network reachability confusion for mainland users.
  The demo should prove the model can drive the browser: Galley checks that the
  extension is connected, then asks managed GA to open Baidu through Browser
  Control. Managed GA must use the existing `web_execute_js` extension protocol
  (`tabs.create`) for new tabs, not page-level `window.open`, and must not fall
  back to code or external weather APIs. The button label is "试用浏览器控制" so
  the task reads as an experience demo rather than a weather feature; demo
  results do not write back to Browser Control connection status.

## Rejected Alternatives

- **Put it only in Settings** — too weak for a capability that defines the
  managed GA experience.
- **Rely on scenario-triggered Composer interception first** — higher coupling
  to prompt submission, pending prompt recovery, and tool-failure explanation.
  TopBar strong guidance is lighter and matches Galley's chrome-led product
  philosophy.
- **Repeated modal spam / flashing alert** — it would force attention but make
  Galley feel out of control. The chosen design is persistent and intentionally
  unfinished, not hostile.
- **Silent automatic extension install** — not a normal-user Chromium path.
  Enterprise policy can force-install extensions, but Galley cannot rely on
  that for ordinary desktop users.
- **Use Google for the beginner demo** — reachable for many users but brittle
  for mainland China. The demo's job is to show Browser Control, not test search
  engine access.
- **Patch the extension or add a new GA tool for tab opening now** — heavier
  than needed for the first pass. The shipped extension already exposes a
  `tabs.create` protocol through `web_execute_js`, so Galley can first steer the
  managed prompt and demo through that existing path.

## Dogfood Evidence

- The `试试搜索天气` demo was tested from the connected Browser Control dialog
  before the CTA was renamed to `试用浏览器控制`.
  Managed GA opened a new browser tab, searched Baidu for today's weather, and
  returned the result successfully.
- This confirms the first-pass approach: do not modify extension source and do
  not add a new GA tool. Steering managed GA toward the existing `web_execute_js`
  / `tabs.create` protocol is enough for active tab creation in the current
  Chromium extension.
- CDP `Runtime.evaluate(userGesture=true)`, popup allowlists, and extension
  source patches should remain fallback ideas, not the default implementation
  path, unless future dogfood finds a real compatibility gap.

## Open Questions

- Whether TopBar-only strong guidance is enough in dogfood, or whether we later
  add scenario-triggered Composer interruption for browser tasks.
- Whether browser-control-specific approval policy is needed once users turn
  YOLO off and expect more granular browser action confirmation.

## Next

Continue dogfooding the setup flow in real Chrome / Edge profiles and, when
available, another Chromium browser: load the stable extension directory, run
the deterministic test, and confirm the same `tabs.create` demo behavior across
profiles and browsers.

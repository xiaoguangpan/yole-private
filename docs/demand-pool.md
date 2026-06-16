# Yole Demand Pool

This file is the lightweight backlog for ideas that should be collected first,
then implemented and released together when the package is ready.

## Intake Rules

- Add the date, requirement, value, and current status.
- Keep product decisions here short; move larger design notes into a focused
  doc when implementation begins.
- Before a release, review this pool and mark each included requirement with
  the target version.

## Requirements

| ID | Date | Requirement | Value | Status | Target |
|---|---|---|---|---|---|
| R-001 | 2026-06-08 | Add a manual refresh button to the balance dropdown. | After an admin updates a user's balance, the user can refresh immediately without starting another action. | Implemented | 0.0.1 |
| R-002 | 2026-06-08 | Support a VPS-hosted app update channel without publishing artifacts to GitHub first. | Early releases can be tested and distributed from the VPS while keeping the existing Tauri updater flow. | Implemented | 0.0.1 |
| R-003 | 2026-06-09 | Rename user-facing "YOLO mode" copy to a clearer Chinese label such as "自动执行". | Avoid confusion between "Yolo" and the product name "Yole" while keeping the approval-bypass meaning understandable to ordinary users. | Implemented | 0.0.2 |
| R-004 | 2026-06-09 | Remove the extra dollar icon from the balance top-bar button. | The formatted amount already includes `$`, so the button should not show two dollar signs. | Implemented | 0.0.2 |
| R-005 | 2026-06-09 | Fix customer-service WeChat QR rendering in the balance dropdown and quota error card. | Users should be able to see the QR code directly when balance is low or exhausted. | Implemented | 0.0.2 |
| R-006 | 2026-06-09 | Change overseas support label to `Telegram` and display the Telegram username directly. | Make the contact method explicit and reduce wording noise in the small support panel. | Implemented | 0.0.2 |
| R-007 | 2026-06-09 | Stop exposing sequential NewAPI user IDs as support identifiers; use the random username as the visible support ID. | Sequential IDs are guessable and reveal account-management internals; random usernames are safer for support lookup. | Implemented | 0.0.2 |
| R-008 | 2026-06-09 | Simplify browser-control extension setup for non-technical users. | Current setup requires finding the extension page, enabling developer mode, and loading an unpacked folder; this is too much friction for ordinary users. | Deferred; existing guide retained | Later |
| R-009 | 2026-06-09 | Make browser-control page opening create or use a safe new tab instead of redirecting a random existing tab. | Avoid overwriting pages the user already cares about. | Implemented | 0.0.2 |
| R-010 | 2026-06-09 | Keep project sessions and unprojected temporary sessions visible in the sidebar at the same time. | Users should not lose access to normal conversations when opening project navigation; behavior should match the Codex-style mixed list. | Implemented | 0.0.2 |
| R-011 | 2026-06-09 | Fix project sidebar counts/list rendering where expanded/collapsed project view shows inconsistent session rows. | A project with two sessions must show both sessions consistently, and temporary sessions should not depend on collapsing the project list. | Implemented | 0.0.2 |
| R-012 | 2026-06-09 | Hide model configuration affordances from ordinary managed-Yole users. | The default model is built in; exposing a "configure model" button creates confusion and an unusable path. | Implemented | 0.0.2 |
| R-013 | 2026-06-09 | Support pasting images into the chat composer and sending them through the existing multimodal path. | Multimodal models are available, but the desktop composer currently blocks a core AI workflow. | Implemented | 0.0.2 |
| R-014 | 2026-06-09 | Add a product-level image-generation capability using a configured image model such as GPT-Image-2. | Local Pillow/PIL drawing is not good enough for user-facing generation; image generation should call a real image model and fit the NewAPI quota model. | Implemented | 0.0.2 |
| R-015 | 2026-06-09 | Add a first-class Skills / capability hub, with selected skills promotable to top-level menu entries. | Some packaged skills, such as ecommerce image sets, video, or voice generation, are product subsystems and need their own focused UI rather than only chat prompts. | Shelved; keep product simple | Later |
| R-016 | 2026-06-09 | Replace the Windows tray icon so minimized Yole no longer shows the old Galley `G`. | Branding should remain consistent after the app is minimized to the system tray. | Implemented | 0.0.2 |
| R-017 | 2026-06-09 | Normalize the Telegram support value before display and add copy support in the balance panel and quota card. | Server contact values can be edited without rebuilds, but the client should hide config-style prefixes such as `TelegramUsername:` and make the username easy to copy. | Implemented | 0.0.3 |
| R-018 | 2026-06-09 | Remove model-switching/configuration hints from the simplified commercial composer surface. | Ordinary Yole users should not see `mykey.py`, LLM switching, or internal model-management wording. | Implemented | 0.0.3 |
| R-019 | 2026-06-09 | Render pasted user images as thumbnails in the composer and conversation, with click-to-preview. | Sending a local image path as visible chat text breaks the multimodal mental model; users should see the actual image. | Implemented | 0.0.3 |
| R-020 | 2026-06-09 | Prefer direct multimodal image understanding before OCR/tool fallback in managed GA prompts. | When Yole has already passed image content to the model, GA should not treat the image as only a local path. | Implemented | 0.0.3 |
| R-021 | 2026-06-09 | Change auto-update behavior from surprise install to prompt-first, user-triggered download/install. | Updating while the user is working feels abrupt; startup should only notify, with manual update actions in the toast and system management. | Implemented | 0.0.3 |
| R-022 | 2026-06-10 | Move pasted-image thumbnails above the composer text input. | The attachment strip should read as input context before the user types, not as a footer below the input. | Implemented | 0.0.4 |
| R-023 | 2026-06-10 | Fix managed GA dropping pasted image blocks before the LLM request. | The UI and IPC could carry images, but the managed native tool client filtered non-text blocks, causing multimodal prompts to behave like text-only prompts. | Implemented | 0.0.4 |
| R-024 | 2026-06-10 | Rework the project sidebar into a Codex-style project section that coexists with normal chats. | Project rows should expand inline, show all project sessions flat, provide hover actions, and keep unprojected conversations visible below. | Implemented | 0.0.4 |
| R-025 | 2026-06-10 | Hide session-title menu entries for Reinject Tools and Desktop Pet in simplified commercial UI. | Ordinary users should only see Rename from the title menu; internal/debug controls create unnecessary confusion. | Implemented | 0.0.4 |
| R-026 | 2026-06-10 | Refine the project sidebar to match the Codex-style section exactly: label row actions only on label hover, project-row actions only on that folder row, light indented project sessions, and separate expand/collapse-all icons. | Project navigation should feel like a lightweight grouping label, not a heavy menu section, and hover actions should not appear while hovering unrelated chat rows. | Implemented | 0.0.5 |
| R-027 | 2026-06-10 | Allow starting a new project conversation while another temporary or project conversation is still answering. | Users should be able to branch into a new project chat without waiting for an existing run to finish. | Implemented | 0.0.5 |
| R-028 | 2026-06-10 | Prevent Yole account status from falling back to a fake `$0.00` balance with missing contact fields. | Balance UI must preserve the last complete server status and use the built-in provisioner endpoint so users do not see a version-regression account panel. | Implemented | 0.0.5 |
| R-029 | 2026-06-10 | Hide the long active conversation title from the top bar. | Long generated titles crowd the chrome and make the app look unpolished; the sidebar already carries the conversation title. | Implemented | 0.0.5 |
| R-030 | 2026-06-11 | Clean bundled runtime folders and selected app data reliably during uninstall. | Users should not see `managed-ga` or `python` left behind after uninstalling, and the delete-user-data checkbox should remove known Yole app-data paths. | Implemented | 0.0.6 |
| R-031 | 2026-06-11 | Prevent uninstall/reinstall from granting another free trial balance on the same Windows device. | Trial quota should be tied to a server-side account record keyed by a hashed device identifier, not only local app data. | Implemented | 0.0.6 |
| R-032 | 2026-06-12 | Extend trial anti-abuse device hashing to all desktop platforms. | macOS and Linux builds should get the same reinstall/delete-data protection as Windows while still sending only privacy-preserving hashed device identifiers. | Implemented | 0.0.7 |
| R-033 | 2026-06-12 | Support dragging image files into the chat composer as uploads. | Users should be able to add multimodal image context by dragging files into the input area, not only by copy/paste. | Implemented | 0.0.7 |
| R-034 | 2026-06-12 | Add server-managed model routing for primary, fallback, vision, and image-generation models. | Yole should be able to switch away from an unstable default chat model, use multiple fallback chat models, route image understanding to a multimodal model when the active chat model is text-only, and rotate image-generation models without shipping a new desktop build. | Deprecated; replaced by explicit model selection | 0.0.8 |
| R-035 | 2026-06-12 | Refresh server-managed model routing before each user request while keeping the UI as a single Yole model. | Admin-side model changes should take effect on the next user message without relying on balance refresh or exposing model choices to ordinary users. | Dropped; hurt latency and predictability | 0.0.8 |
| R-036 | 2026-06-12 | Show consumption as Yole points without smoothing model-specific prices. | Different upstream models can consume points at different rates; short-term fallback is treated as an exceptional reliability path rather than a unified retail tariff. | Implemented | 0.0.7 |
| R-037 | 2026-06-12 | Replace user-facing USD balance with Yole points. | Ordinary users should see trial/top-up balance as product points instead of dollars or tokens, with the initial 30 balance-unit trial presented as a simple 3000-point grant. | Implemented | 0.0.7 |
| R-038 | 2026-06-12 | Standardize the managed GA patch stack and reject unregistered direct edits. | Managed GA changes must be replayable on top of an upstream baseline so future GA upgrades do not silently lose Yole features such as image input, image generation, and browser-control recovery. | Implemented | 0.0.7 |
| R-039 | 2026-06-12 | Remove Claude Code client impersonation from the managed Anthropic path. | Commercial builds must not send Claude Code user-agent, beta, app, or system-prompt fingerprints when using Anthropic-compatible models. | Deferred; keep GA behavior unless it causes channel risk | Later |
| R-040 | 2026-06-12 | Put image generation behind the existing approval gate. | Image generation spends quota and should not bypass user approval just because it was added after the original approval table. | Implemented | 0.0.7 |
| R-041 | 2026-06-12 | Directly block disaster-level commands that cannot be bypassed by auto-execute mode. | High-confidence system-destructive commands such as recursive root/system-drive deletes, system-drive formatting, or whole-disk wiping should be blocked and reported as blocked, not sent back for user confirmation. | Implemented | 0.0.9 |
| R-042 | 2026-06-12 | Detect repeated identical tool calls and force a strategy change or user handoff. | Repeated retries are often useful agent behavior, and GA already has turn-count strategy hints; Yole should not inject prompt feedback or block repeats unless a concrete loop bug appears. | Deferred; observe only | Later |
| R-043 | 2026-06-12 | Make stop/interruption requests responsive while GA is actively running. | If the user presses stop or sends a clear stop message during execution, Yole should interrupt promptly instead of waiting for the current long run to drift. | Deferred; current Stop button is enough for now | Later |
| R-044 | 2026-06-12 | Verify managed default models use native tool calling when the provider supports it. | Yole should avoid fragile text-tool JSON protocols for the default managed model path, while keeping explicit fallback behavior for providers that do not pass tools correctly. | Deferred; revisit only if tool parsing becomes a real failure mode | Later |
| R-045 | 2026-06-12 | Standardize truncation notices for long tool results. | When file, browser, code, or web results are truncated, GA should be told exactly that the content is partial and how to fetch the remaining content. | Deferred; GA compression is acceptable for now | Later |
| R-046 | 2026-06-12 | Allow editing the latest user message after a stopped run. | A stopped latest user message should offer both copy and edit actions; edit pre-fills the composer, truncates later history, and resends from that point. | Implemented | 0.0.7 |
| R-047 | 2026-06-12 | Sync Galley v0.2.8 Browser Control MV3 reconnect timing fix. | Yole keeps the Browser Control probe server alive through the Chromium MV3 alarm reconnect window and the managed extension retries quickly while its service worker is awake, reducing false "browser not connected" failures. | Implemented | 0.0.7 |
| R-048 | 2026-06-12 | Audit and selectively sync Galley v0.2.8 managed GA baseline updates after patch-stack standardization. | The newer bundled GA baseline contains upstream fixes, but Yole should replay and test its managed image, browser, and NewAPI/Codex patches before adopting it. | Dropped; do not sync unless current baseline breaks | Later |
| R-049 | 2026-06-13 | Simplify installation into a one-step default install flow across platforms. | Users should be able to double-click the installer and finish without choosing paths or options: Windows defaults to the current-user install location, creates a desktop shortcut by default, keeps required environment wiring inside the installer/app, launches Yole after passive/silent install, and macOS/Linux follow the same no-choice principle for their native installer conventions. | Implemented | 0.0.7 |
| R-050 | 2026-06-14 | Add a server-side model management admin surface for Yole routing. | The operator should be able to choose the current conversation model, image-understanding model, image-generation model, and fallback order from one page instead of editing client code or scattered config. | Dropped; explicit user model selection is the product direction | Later |
| R-051 | 2026-06-14 | Add model health and capability probing for routing decisions. | The admin surface should show whether a model is healthy, supports image input, supports tool calling, and can generate images so Yole can route by capability rather than by hardcoded model names. | Dropped with server-side routing | Later |
| R-052 | 2026-06-14 | Route image understanding automatically with point-based charging instead of user-facing unsupported-model errors. | When a user sends an image, Yole should use the primary model if it accepts image input, otherwise call the configured vision model and charge the appropriate points without exposing model limitations to ordinary users. | Implemented | 0.0.7 |
| R-053 | 2026-06-15 | Set explicit NewAPI pricing ratios for Yole route model aliases. | Custom model aliases such as `deepseek-v4-pro` and `qwen3.7-plus` fell through to NewAPI's high default model ratio, making the ordinary default route much more expensive than the VIP route. | Implemented | 0.0.7 |
| R-054 | 2026-06-15 | Simplify Yole point conversion to 1 NewAPI balance unit = 100 points. | Operators can grant and explain balances directly: 30 balance units equals the 3000-point trial, and low balance is 300 points. | Implemented | 0.0.7 |
| R-055 | 2026-06-15 | Force managed route and default model refresh after account tier changes. | When an operator promotes or downgrades a user in NewAPI, the next balance refresh or user message should apply the new route without requiring a full Yole quit. | Deprecated with server-side routing | 0.0.8 |
| R-056 | 2026-06-15 | Avoid model, endpoint, and protocol self-disclosure in ordinary chat. | Users can ask what Yole is, but the assistant should answer at product level instead of exposing route aliases, NewAPI endpoints, or API protocols. | Implemented | 0.0.7 |
| R-057 | 2026-06-15 | Remove avoidable archive-delete stutter. | Deleting archived conversations should not wait for a nonexistent runner shutdown before the lightweight SQLite delete. | Implemented | 0.0.7 |
| R-058 | 2026-06-15 | Replace hidden VIP routing with explicit model selection. | Users choose DeepSeek V4 Pro or GPT-5.5 directly; NewAPI handles pricing and access, while Yole keeps fixed image-generation and vision-assist models instead of refreshing hidden route state before each request. | Implemented | 0.0.8 |
| R-059 | 2026-06-16 | Add a single-instance guard so app update relaunch cannot open multiple Yole windows. | Updating from an installed build can temporarily leave the old process alive while a new one launches; a second launch should focus the existing window or exit instead of creating duplicate windows. | Implemented | 0.0.9 |
| R-060 | 2026-06-16 | Review approval policy for unknown newly added GA tools. | Yole is intentionally low-friction once the user chooses to run it; do not add generic unknown-tool approval prompts. New Yole-owned spending/account tools can get explicit approval requirements case by case. | Dropped; avoid extra interaction | Later |
| R-061 | 2026-06-16 | Integrate OfficeCLI as a first-class Yole Office capability. | Early users may be office workers; Word, Excel, and PowerPoint work should use a Yole-controlled OfficeCLI sidecar/tool layer so GA can read, generate, render, validate, and repair Office files without ad hoc Python scripts. | Implemented | 0.0.9 |
| R-062 | 2026-06-16 | Render generated image outputs inline in the conversation. | Image generation currently saves a local file path, but users expect the new image to appear just like pasted/sent images. | Implemented | 0.0.9 |
| R-063 | 2026-06-16 | Route image-edit requests with attached images to the image editing endpoint. | Requests like "edit this image" should send the attached source image to the provider's image edit API instead of creating an unrelated text-to-image result. | Implemented | 0.0.9 |
| R-064 | 2026-06-16 | Add a user-facing Yole points ledger. | Users should be able to inspect recent point additions and consumption, especially per-request model name and points spent, through a lightweight server-backed history view. | Implemented | 0.0.9 |
| R-065 | 2026-06-16 | Hide managed GA runtime details from ordinary Settings. | Yole should not foreground that the bundled runtime is GA until the product is ready to expose that implementation detail again. | Implemented | 0.0.9 |

## Notes

### R-002 VPS-Hosted Updates

This is feasible with the current updater architecture because the client reads
an HTTPS manifest endpoint and verifies signed update artifacts. GitHub is only
the current hosting path, not a hard requirement.

Minimum design:

- Generate and protect a Tauri updater private signing key.
- Embed the matching public key and a VPS HTTPS manifest URL at build time.
- Upload the Windows updater package, installer, signature, and `latest.json`
  to the VPS.
- Serve `latest.json` and package files over HTTPS.
- Keep the manifest format compatible with Tauri updater so the client can
  check, download, verify, and install directly.

Current decision:

- The updater private key is stored on the VPS under the release secret path
  documented in [repository and release topology](./repository-and-release-topology.md).
- The Windows `0.0.7` manual-test channel is hosted at the VPS stable endpoint.
- GitHub Releases remain a public backup/archive surface; the live installed
  app channel reads the VPS manifest unless a future release plan changes that.

### R-014 Image Generation Model

The first implementation mounts a managed GA tool named `yole_image_generate`.
It defaults to `gpt-image-2` and calls the same NewAPI-compatible endpoint as
the managed model account. Changing the model globally can be done by changing
the NewAPI model routing/pricing. A future server-driven Yole config can expose
the exact default image model without requiring a desktop release.

### R-034 / R-035 Routing Retrospective

Server-managed automatic routing made the product harder to reason about and
increased latency without delivering a clearer user experience. The product
direction is now explicit user model selection:

- Users choose the conversation model directly, such as DeepSeek V4 Pro or
  GPT-5.5.
- Yole keeps fixed support models for vision assist and image generation.
- Do not reintroduce per-request route refresh, hidden VIP routing, or a
  server-side routing admin surface unless the product constitution is updated
  with a new decision.

Compatibility-only route metadata may remain in the provisioner for old
clients, but it should not become the primary product path again.

### R-041 Disaster Command Protection

This protection is not a broad command-keyword blacklist. It should block only
high-confidence catastrophic actions, report the block in the conversation, and
return a blocked tool result to GA. Do not ask the user to confirm execution
for this class of command.

### R-061 Office Capability Direction

Office work is a likely early-user workflow. Yole should include the complete
OfficeCLI binary for the current platform and expose its full document
processing capability through a controlled Yole wrapper. The "phase" boundary
is about product polish and default workflows, not about artificially limiting
the underlying OfficeCLI feature set.

- Treat Office as a Yole product capability, not only a GA SOP.
- Prefer a Yole-controlled OfficeCLI sidecar/tool layer that GA can call.
- Include the full OfficeCLI capability surface by default: create, view, get,
  query, set, add, remove, move, validate, batch, dump, merge, and advanced
  Office operations should be reachable through the wrapper where safe.
- Block or wrap commands that would violate Yole's product contract, such as
  global install, PATH writes, auto-update, external AI-tool skill install,
  or unmanaged MCP/server registration.
- Do not let OfficeCLI auto-install skills into the user's other AI tools.
- Keep the Yole install clean and portable: no PATH writes, no global install,
  no user-managed dependency setup, and unpacked builds should still work.
- Bundle only the current platform's OfficeCLI binary in each installer when
  possible; use a Yole-managed post-install/download fallback only if bundle
  size, licensing, or distribution constraints make bundling impractical.
- UI and default SOP polish can start with high-frequency workflows, but the
  low-level wrapper should not forget or hide the rest of OfficeCLI.

### R-063 Image Editing Direction

Image editing must pass the user's attached source images to the provider's
image-edit endpoint, not only a text prompt. Multi-image edits are a first-class
case: if the user attaches several images and asks to combine background,
subject, scenery, or style from different references, Yole should submit all
available current-message image files to the edit request.

### R-064 Points Ledger Direction

The client should not receive or store NewAPI admin credentials. Add a
provisioner/VPS account-history endpoint authenticated by Yole's existing
`account_token`, then have that endpoint query NewAPI logs or a Yole-owned
ledger and return a small, user-safe shape: time, type, model, points delta,
status, and optional request id. Fetch on demand, paginate, and cache briefly
so it never blocks chat or the main UI.

UI direction:

- In the balance dropdown, make the displayed balance number open Settings.
- Add a Settings tab for the points ledger.
- Put the current total balance at the top of that tab.
- Show a paginated list below it.
- Keep the first implementation list-focused: no charts, exports, or complex
  filters until users ask for them.

### R-065 Settings Runtime Visibility

Hide the ordinary Settings runtime tab and any content that explains or
foregrounds the bundled GA runtime for ordinary users. Keep necessary
diagnostics accessible only if they are needed for support or developer builds.
The main user-facing Settings surface should focus on account, points, updates,
channels, approval, and practical controls.

/**
 * Platform detection for OS-conditional UI:
 *
 *   - Window chrome (Win: custom controls, Mac: traffic-light overlay)
 *   - Keyboard shortcut display labels (⌘K vs Ctrl+K)
 *   - Tutorial / onboarding command examples (zsh vs PowerShell)
 *
 * We read `navigator.userAgent` rather than pulling in
 * `@tauri-apps/plugin-os` because the latter requires a Rust crate,
 * permission entry, and async init — too much ceremony for "is this
 * macOS?". The webview UA is set by the host OS, so the tokens
 * `Macintosh` / `Windows` are authoritative for what the user is
 * running. Detection happens at module load and is constant for the
 * lifetime of the app — there's no scenario where this changes after
 * boot.
 *
 * Behavioural rule: every conditional that reads these flags MUST
 * leave the Mac path byte-identical to current behaviour. Mac is the
 * v0.1 release platform; Windows support is purely additive prep work.
 */
const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";

export const isMac = ua.includes("Macintosh");
export const isWindows = ua.includes("Windows");

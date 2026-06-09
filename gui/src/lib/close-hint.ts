/**
 * Background-mode close hint — GUI side.
 *
 * Yole hides to the background instead of quitting when the user
 * closes the window (see core/src/lib.rs `CloseRequested`). The first
 * time that happens on a device, Rust shows a one-time native dialog
 * explaining where the window went and how to truly quit.
 *
 * That dialog fires synchronously inside the window-event callback, so
 * Rust can't reach into GUI i18n. This module's sole job is to push the
 * localized copy into Yole Core so the dialog has the right strings
 * ready before any close:
 *
 *   - `pushCloseHintCopy` runs once at hydrate and again whenever the
 *     UI language changes.
 *
 * The seen flag is owned entirely by Rust: seeded from the persisted
 * pref during `setup` (before the window can be closed) and written by
 * the close handler on first show. The GUI never touches it — that's
 * what keeps the hint genuinely once-per-device regardless of hydrate
 * timing.
 */

import { setCloseHintCopy } from "@/lib/db";
import { copyForLanguage } from "@/lib/i18n";
import {
  resolveLanguagePreference,
  type LanguagePreference,
} from "@/lib/language";
import { isWindows } from "@/lib/platform";

/**
 * Resolve the localized title + platform-appropriate body for the
 * given language preference. Windows points at the system tray;
 * everything else (macOS) points at the menu bar.
 */
function resolveCopy(preference: LanguagePreference): {
  title: string;
  body: string;
} {
  const copy = copyForLanguage(resolveLanguagePreference(preference));
  const hint = copy.app.closeBackgroundHint;
  return {
    title: hint.title,
    body: isWindows ? hint.bodyWindows : hint.bodyMac,
  };
}

/**
 * Push the current-language copy to Yole Core. Called at hydrate and
 * on every UI language change so a hint shown later renders in the
 * active language. Best-effort: a failure only means the dialog falls
 * back to its English default.
 */
export async function pushCloseHintCopy(
  preference: LanguagePreference,
): Promise<void> {
  const { title, body } = resolveCopy(preference);
  try {
    await setCloseHintCopy(title, body);
  } catch (e) {
    console.warn("[close-hint] pushCloseHintCopy failed.", e);
  }
}

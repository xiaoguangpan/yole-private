/**
 * Hand-rolled fixtures used by the Zustand stores' initial state plus
 * the DevScreenToggle dev tools. Two distinct flavors live here:
 *
 *   - **Production defaults** (DEMO_GA_CONFIG / DEMO_APPROVAL_CONFIG /
 *     DEMO_LLMS / DEMO_LLM_DISPLAY_NAME / DEMO_RUNTIME_INFO) — fall-
 *     back values consumed before the bridge / SQLite hydrate
 *     populates real state. Misleadingly prefixed `DEMO_` for legacy
 *     reasons; they are load-bearing in prod.
 *   - **Dev-only toast variants** (DEMO_TOAST_VARIANTS / makeDemoToast)
 *     — wired through `DevScreenToggle` (DEV-gated) so style review
 *     can trigger every toast variant without contriving real errors.
 *
 * The original V0.1 demo conversation fixtures (DEMO_SESSIONS,
 * DEMO_USER_PROMPT, DEMO_PATCH_NEW_CONTENT, buildDemoTurns,
 * buildDemoPending) are gone — they fed an `activeSessionId == null`
 * fallback path in App.tsx that became unreachable once the empty
 * state took over for "no session selected".
 */

import type { ApprovalConfig } from "@/components/screens/settings/Settings";
import { isWindows } from "@/lib/platform";
import { type AppError, makeAppError } from "@/types/app-error";
import type { RuntimeInfo } from "@/types/inspector";

// ---------------- Static fixtures ----------------

/**
 * Hard-coded path + python + bridge cwd used by the multi-session
 * spawn flow. sessionId is supplied per-spawn from the session row
 * the user is activating (so each session's bridge has its own
 * process keyed by its own id).
 *
 * V0.2 (Settings path picker — Stage 3 #4) will replace these with
 * a prefs lookup so users can point Workbench at their own GA
 * install without editing source.
 */
export const DEMO_GA_CONFIG = {
  // Windows ships `python.exe` (no version suffix); macOS / Linux
  // commonly expose `python3` while bare `python` may still point at
  // a stale Python 2 on older systems. Use the right alias per OS.
  // Only consulted when useExternalPython is true — v0.1.1+ defaults
  // to the Galley-bundled interpreter, so this field is just the
  // escape-hatch target.
  python: isWindows ? "python" : "python3",
  gaPath: "/Users/inkstone/Documents/GenericAgent",
  bridgeCwd: "/Users/inkstone/Documents/genericagent-webui",
  // v0.1.1+: prefer the Galley-bundled Python at $RESOURCE/python/.
  // Flip to true (Settings → Runtime advanced toggle) to spawn from
  // the `python` field above instead — useful when the user's GA
  // fork adds deps the bundle doesn't carry, or when iterating on
  // GA in a custom venv.
  useExternalPython: false,
};

export const DEMO_LLM_DISPLAY_NAME = "Claude Sonnet 4.5";

export const DEMO_LLMS = [
  { index: 0, displayName: "GLM 5.1", isCurrent: false },
  { index: 1, displayName: "Claude Sonnet 4.5", isCurrent: true },
  { index: 2, displayName: "GPT 4o", isCurrent: false },
  { index: 3, displayName: "Gemini 2.5 Pro", isCurrent: false },
];

export const DEMO_APPROVAL_CONFIG: ApprovalConfig = {
  requiredTools: [
    "code_run",
    "file_write",
    "file_patch",
    "start_long_term_update",
  ],
  alwaysAllowProject: ["file_read", "web_scan"],
  alwaysAllowGlobal: [],
};

export const DEMO_RUNTIME_INFO: RuntimeInfo = {
  gaPath: "~/Documents/GenericAgent",
  pythonVersion: "3.11.9 (system)",
  llmDisplayName: DEMO_LLM_DISPLAY_NAME,
  bridgePid: 48213,
  gaCommit: "cf6551516fcc836f21dcdad592b07c703d09e1d8",
  // Matches cf65515's actual `git log -1 --format=%cI` so the demo
  // fixture doesn't lie before bridge connects. Bump alongside the
  // baseline pin in CLAUDE.md whenever the baseline moves.
  gaCommitDate: "2026-05-12T12:59:30+08:00",
  gaBaseline: "cf6551516fcc836f21dcdad592b07c703d09e1d8",
  workbenchVersion: "0.1.0",
};

// ---------------- Toast variants ----------------

let demoToastCounter = 0;
const DEMO_TOAST_VARIANTS: Array<
  Pick<AppError, "category" | "severity" | "message" | "hint" | "retryable">
> = [
  {
    category: "business",
    severity: "error",
    message: "Authentication failed: invalid api_key",
    hint: "check_llm_config",
    retryable: true,
  },
  {
    category: "bridge",
    severity: "error",
    message: "Connection refused by api.anthropic.com after 30s",
    hint: "network",
    retryable: true,
  },
  {
    category: "business",
    severity: "warning",
    message: "Rate limit exceeded for current LLM",
    hint: "quota_exceeded",
    retryable: false,
  },
  {
    category: "bridge",
    severity: "error",
    message: "IPC protocol mismatch: bridge expects 0.1, got 0.0.9",
    hint: null,
    retryable: false,
  },
];

export function makeDemoToast(): AppError {
  const variant =
    DEMO_TOAST_VARIANTS[demoToastCounter % DEMO_TOAST_VARIANTS.length];
  demoToastCounter += 1;
  return makeAppError({
    ...variant,
    context: "demo",
    traceback:
      "Traceback (most recent call last):\n" +
      '  File "/path/to/bridge/handlers.py", line 142, in dispatch\n' +
      '    raise BridgeError("...")\n',
  });
}

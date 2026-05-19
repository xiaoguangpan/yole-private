import { create } from "zustand";

import type { ApprovalConfig } from "@/components/screens/settings/Settings";
import {
  backfillFtsIfEmpty,
  deleteDemoSessions,
  deleteEmptyNewSessions,
  getPref,
  setPref,
} from "@/lib/db";
import { DEMO_APPROVAL_CONFIG, DEMO_GA_CONFIG } from "@/stores/demo";
import { useRuntimeStore } from "@/stores/runtime";
import { useSessionsStore } from "@/stores/sessions";
import { useUiStore } from "@/stores/ui";
import { makeAppError } from "@/types/app-error";

import type { LLMOption } from "./runtime";

// What lives here after B3 M5: prefs lifecycle + global config
// (gaConfig, approvalConfig, yoloMode, yoloIntroSeen, conversationWidth)
// + the cold-start `hydrateFromDB` orchestrator. M6 prefsStore is the
// natural next step — it can absorb all five fields and their actions,
// at which point this file shrinks to ~50 lines (just the hydrate
// orchestrator) or disappears entirely.
//
// What previously lived here:
//   - Session list / projects (M4b → sessionsStore)
//   - Per-session LLM list + display name + bridge lifecycle (M3a/b
//     → runtimeStore)
//   - Per-session conversation state — turns / approvals / askUser /
//     in-flight streaming (M5 → messagesStore)
//   - activateSession orchestrator (M5 → sessionsStore)

interface State {
  /**
   * GA subprocess spawn config. `python` + `gaPath` are user-editable
   * via Settings → Runtime path pickers; `bridgeCwd` is internal
   * (workbench repo root in dev / app bundle resources dir in
   * production — set by the macOS bundle Task).
   *
   * Falls back to DEMO_GA_CONFIG on first launch before the user has
   * opened Settings. Persists to prefs key `ga_config` (JSON).
   */
  gaConfig: {
    python: string;
    gaPath: string;
    bridgeCwd: string;
    /**
     * v0.1.1+: Galley ships its own Python interpreter at
     * `$RESOURCE/python/` (see scripts/bundle-python.sh + tauri.conf
     * bundle.resources). The default is to spawn that bundle. Flip
     * this to `true` from Settings → Runtime → advanced to fall back
     * to the user-configured `python` field — the escape hatch for
     * users with custom GA forks that need deps the bundle doesn't
     * carry, or for live-iterating on GA in a venv.
     */
    useExternalPython: boolean;
  };

  approvalConfig: ApprovalConfig;
  /**
   * YOLO mode (PRD §11.5). When true, every tool dispatch on every
   * alive bridge bypasses the approval gate. Persisted to prefs
   * (sticky across launches). Global, not per-session — flipping
   * this notifies every alive bridge.
   *
   * Default `true` for v0.1 — Galley's first-batch users are GA
   * heavy users who run agents without approval. The first-launch
   * `YoloIntroDialog` discloses this state and offers a one-click
   * revert to approval mode for those who want it.
   */
  yoloMode: boolean;
  /**
   * Has the user dismissed the first-launch YOLO disclosure modal?
   * Persisted to prefs (`yolo_intro_seen`). Initial state defaults
   * to `true` so the modal stays hidden during cold start; the
   * hydrate step flips it to `false` when the pref is missing,
   * which is the only case that should surface the modal. Set
   * back to `true` by either CTA on the modal.
   */
  yoloIntroSeen: boolean;
  /**
   * Conversation reading column width. Notion-style two-mode toggle:
   *   - "compact": 760px max-width — typographic sweet spot
   *     (~70-78 chars/line at 16.5px Newsreader), preserves the
   *     "document you're reading" feel that anchors the product
   *     register. The default on first launch.
   *   - "wide":   1400px max-width — for wide-monitor users who
   *     don't want most of the screen to be empty margin, and for
   *     sessions with lots of long code blocks / tool callouts /
   *     file_read outputs that get cramped at 760.
   *
   * Applies ONLY to the scrollable conversation column. The bottom
   * stack (ApprovalDock + Composer + hint) stays at 760 regardless
   * — the input zone is fixed-width so the textarea doesn't grow
   * into hard-to-track horizontal sweep when toggled wide.
   *
   * Global preference, not per-session: your monitor doesn't change
   * between sessions so your preference shouldn't either. Persisted
   * to prefs `conversation_width`.
   */
  conversationWidth: "compact" | "wide";
}

interface Actions {
  setApprovalRequiredTools: (tools: string[]) => void;
  removeAlwaysAllow: (scope: "project" | "global", tool: string) => void;
  /**
   * Set the YOLO mode flag. Persists to prefs and broadcasts the new
   * state to **every** alive bridge over IPC.
   */
  setYoloMode: (enabled: boolean) => Promise<void>;
  /**
   * Dismiss the first-launch YOLO disclosure modal. Optionally
   * reverts YOLO to off when the user picked "改回审批模式".
   */
  acknowledgeYoloIntro: (revertToApproval?: boolean) => Promise<void>;
  setConversationWidth: (mode: "compact" | "wide") => Promise<void>;
  /**
   * Update the GA spawn config and persist to prefs. Also re-triggers
   * the LLM warmup so the picker reflects the new mykey.py without
   * requiring a Galley restart (existing alive bridges still need a
   * restart — their bridges are already running).
   */
  setGAConfig: (
    partial: Partial<{
      python: string;
      gaPath: string;
      bridgeCwd: string;
      useExternalPython: boolean;
    }>,
  ) => Promise<void>;

  /**
   * Cold-start orchestrator. Loads sessions + projects + prefs +
   * runtime caches into their respective slices. Routes the user to
   * Onboarding when `ga_config` is missing.
   */
  hydrateFromDB: () => Promise<void>;
  /**
   * DEV-only: seed a batch of mock sessions across all sidebar
   * buckets (forwarded to sessionsStore). Kept here so the
   * `__store.getState().seedMockSessions()` DevTools shortcut keeps
   * working without callers updating their muscle memory.
   */
  seedMockSessions: () => Promise<void>;
}

export type AppStore = State & Actions;

export const useAppStore = create<AppStore>((set, get) => ({
  // ---- Initial state (demo fixtures) ----
  gaConfig: DEMO_GA_CONFIG,
  approvalConfig: DEMO_APPROVAL_CONFIG,
  yoloMode: true,
  yoloIntroSeen: true,
  conversationWidth: "compact",

  // ---- Approval ----
  setApprovalRequiredTools: (tools) =>
    set((state) => ({
      approvalConfig: { ...state.approvalConfig, requiredTools: tools },
    })),

  removeAlwaysAllow: (scope, tool) =>
    set((state) => ({
      approvalConfig:
        scope === "project"
          ? {
              ...state.approvalConfig,
              alwaysAllowProject:
                state.approvalConfig.alwaysAllowProject.filter(
                  (t) => t !== tool,
                ),
            }
          : {
              ...state.approvalConfig,
              alwaysAllowGlobal: state.approvalConfig.alwaysAllowGlobal.filter(
                (t) => t !== tool,
              ),
            },
    })),

  setYoloMode: async (enabled) => {
    set({ yoloMode: enabled });
    // Best-effort persist: SQLite may be absent in Vite-only dev. The
    // in-memory state still drives UI + IPC for the current launch.
    try {
      await setPref("yolo_mode", enabled);
    } catch (e) {
      console.warn("[store] setYoloMode: pref persistence failed.", e);
    }
    // YOLO is global — notify every alive bridge. Sessions spawned
    // later sync via the on-`ready` handler in ipc-handlers.ts.
    const runtimeSlots = useRuntimeStore.getState().byId;
    for (const sid of Object.keys(runtimeSlots)) {
      try {
        await useRuntimeStore
          .getState()
          .sendIPCCommand(sid, { kind: "set_yolo_mode", enabled });
      } catch (e) {
        console.warn(`[store] setYoloMode: bridge ${sid} notify failed.`, e);
      }
    }
  },

  acknowledgeYoloIntro: async (revertToApproval = false) => {
    // Order matters: flip YOLO before marking the modal seen so
    // bridges receive the new state alongside the prefs write.
    if (revertToApproval) {
      await get().setYoloMode(false);
    }
    set({ yoloIntroSeen: true });
    try {
      await setPref("yolo_intro_seen", true);
    } catch (e) {
      console.warn(
        "[store] acknowledgeYoloIntro: pref persistence failed.",
        e,
      );
    }
  },

  setConversationWidth: async (mode) => {
    set({ conversationWidth: mode });
    try {
      await setPref("conversation_width", mode);
    } catch (e) {
      console.warn(
        "[store] setConversationWidth: pref persistence failed.",
        e,
      );
    }
  },

  setGAConfig: async (partial) => {
    const merged = { ...get().gaConfig, ...partial };
    // Translate the python alias (Tauri shell-capability `name` like
    // "python-framework-3-14") to its resolved display path for the
    // Settings → Runtime "Python" field. Falls back to the raw alias
    // for unknown values so Settings never shows an empty field.
    const { findCandidateByAlias } = await import("@/lib/python-probe");
    const displayCandidate = await findCandidateByAlias(merged.python);
    const pythonDisplay = displayCandidate?.displayPath ?? merged.python;
    set({ gaConfig: merged });
    // Reflect into runtimeInfo so the Settings → Runtime tab and
    // Inspector → Runtime card show the new path immediately.
    useRuntimeStore.getState().patchRuntimeInfo({
      gaPath: merged.gaPath,
      pythonVersion: pythonDisplay,
    });
    // Reset the warmup flag so a new gaPath (or python interpreter)
    // re-triggers a one-shot LLM list refresh against the new
    // mykey.py. TRANSITIONAL (M6 prefsStore): when gaConfig moves to
    // prefsStore, this becomes runtimeStore's listener on a
    // prefs-updated event.
    useRuntimeStore.getState().resetWarmup();
    try {
      await setPref("ga_config", merged);
    } catch (e) {
      console.warn("[store] setGAConfig: pref persistence failed.", e);
    }
    // Existing alive bridges keep their old config. Tell the user
    // that the change takes effect on next launch.
    const changedField = Object.entries(partial).find(
      ([, v]) => v !== undefined && v !== "",
    );
    if (changedField) {
      useUiStore.getState().pushToast(
        makeAppError({
          category: "business",
          severity: "info",
          title: "已保存路径配置",
          message: "重启 Galley 才能让现有对话生效",
          hint: null,
          retryable: false,
          context: "setGAConfig",
          traceback: null,
        }),
      );
      // Retrigger warmup with the new gaConfig so the LLM picker
      // reflects mykey.py from the new GA install without requiring
      // a Workbench restart.
      void useRuntimeStore.getState().warmupLLMList();
    }
  },

  hydrateFromDB: async () => {
    // Replace the demo fixture's hardcoded workbenchVersion ("0.1.0",
    // a lie since alpha.1) with the real value baked into tauri.conf.json
    // at build time. Failing fetch keeps the demo value — not worth
    // blocking hydration on this.
    try {
      const { getVersion } = await import("@tauri-apps/api/app");
      const realVersion = await getVersion();
      useRuntimeStore
        .getState()
        .patchRuntimeInfo({ workbenchVersion: realVersion });
    } catch (e) {
      console.debug("[store] hydrateFromDB: app.getVersion failed.", e);
    }
    try {
      // Sweep accumulated empty "新对话" rows from prior launches —
      // each auto-created session that the user never typed into
      // would otherwise stick around forever and crowd the sidebar.
      try {
        const removed = await deleteEmptyNewSessions();
        if (removed > 0) {
          console.info(
            `[store] hydrateFromDB: pruned ${removed} empty 新对话 row(s).`,
          );
        }
      } catch (e) {
        console.debug(
          "[store] hydrateFromDB: deleteEmptyNewSessions failed.",
          e,
        );
      }
      // One-time cleanup of the v0.1 demo placeholder sessions
      // (s-today-* / s-week-* / s-earlier-* from stores/demo.ts).
      try {
        const removed = await deleteDemoSessions();
        if (removed > 0) {
          console.info(
            `[store] hydrateFromDB: pruned ${removed} legacy demo session(s).`,
          );
        }
      } catch (e) {
        console.debug(
          "[store] hydrateFromDB: deleteDemoSessions failed.",
          e,
        );
      }
      // sessions + projects hydrate moved to sessionsStore (M4b).
      await useSessionsStore.getState().hydrate();
      // One-time backfill of the FTS index for users upgrading
      // past the 004 migration. Idempotent — returns immediately
      // when the index is already in sync.
      try {
        const indexed = await backfillFtsIfEmpty();
        if (indexed > 0) {
          console.info(
            `[store] hydrateFromDB: backfilled ${indexed} message(s) into messages_fts.`,
          );
        }
      } catch (e) {
        console.debug("[store] hydrateFromDB: backfillFtsIfEmpty failed.", e);
      }
    } catch (e) {
      console.warn(
        "[store] hydrateFromDB: SQLite unavailable, using demo seed.",
        e,
      );
    }
    // YOLO mode — sticky preference. Best-effort load.
    let userHasYoloPref = false;
    try {
      const yolo = await getPref<boolean>("yolo_mode");
      if (typeof yolo === "boolean") {
        set({ yoloMode: yolo });
        userHasYoloPref = true;
      }
    } catch (e) {
      console.warn("[store] hydrateFromDB: yolo pref load failed.", e);
    }
    // YOLO intro modal — surfaces once for true-new users to disclose
    // that YOLO is the default. Initial state is `true` (hidden) so
    // the modal doesn't flash during cold start; only flip to `false`
    // when both prefs say "user has never expressed a YOLO opinion on
    // this device".
    if (!userHasYoloPref) {
      try {
        const seen = await getPref<boolean>("yolo_intro_seen");
        if (seen !== true) set({ yoloIntroSeen: false });
      } catch (e) {
        console.warn(
          "[store] hydrateFromDB: yolo_intro_seen pref load failed.",
          e,
        );
      }
    }
    try {
      const width = await getPref<"compact" | "wide">("conversation_width");
      if (width === "wide" || width === "compact") {
        set({ conversationWidth: width });
      }
    } catch (e) {
      console.warn(
        "[store] hydrateFromDB: conversation_width pref load failed.",
        e,
      );
    }
    // Restore cached LLM list (written by replaceLLMs whenever a
    // bridge's `ready` event arrives). Lets cold-start cosmetics show
    // the user's real GA-configured models instead of DEMO_LLMS
    // before any bridge has spawned in this session.
    try {
      const cachedLLMs = await getPref<LLMOption[]>("llm_list");
      if (cachedLLMs && cachedLLMs.length > 0) {
        useRuntimeStore.getState().seedCachedLLMs(cachedLLMs);
      }
    } catch (e) {
      console.warn("[store] hydrateFromDB: llm_list pref load failed.", e);
    }
    // GA spawn config. When `ga_config` pref is absent the user is
    // fresh-from-install: route them to Onboarding so they can pick a
    // GA path + run health checks.
    let hasGAConfig = false;
    try {
      const saved = await getPref<{
        python: string;
        gaPath: string;
        bridgeCwd: string;
        useExternalPython?: boolean;
      }>("ga_config");
      if (saved && saved.gaPath) {
        hasGAConfig = true;
        const { findCandidateByAlias } = await import("@/lib/python-probe");
        const displayCandidate = await findCandidateByAlias(saved.python);
        const pythonDisplay = displayCandidate?.displayPath ?? saved.python;
        // Migrate legacy alpha.2 configs (no useExternalPython field).
        // Default to false so upgrading users automatically pick up
        // the bundled Python — they keep their old `python` alias on
        // file as the escape hatch if anything goes sideways.
        const migrated = {
          ...saved,
          useExternalPython: saved.useExternalPython ?? false,
        };
        set({ gaConfig: migrated });
        useRuntimeStore.getState().patchRuntimeInfo({
          gaPath: saved.gaPath,
          pythonVersion: pythonDisplay,
        });
      }
    } catch (e) {
      console.warn("[store] hydrateFromDB: ga_config pref load failed.", e);
    }
    if (!hasGAConfig) {
      // First launch — surface Onboarding. Skip the LLM warmup below
      // because the user hasn't picked their real config yet.
      useUiStore.getState().setScreen("onboarding");
      return;
    }

    // After hydrate completes, kick off a warmup bridge to refresh
    // the LLM list from mykey.py. Fire-and-forget — warmup runs in
    // the background and doesn't block hydrate completion.
    void useRuntimeStore.getState().warmupLLMList();
  },

  seedMockSessions: async () => {
    await useSessionsStore.getState().seedMockSessions();
  },
}));

// Expose the store on `window.__store` in dev so the user can
// inspect / mutate state from the DevTools console without React
// DevTools. Stripped in production by `import.meta.env.DEV`.
//
// Usage in console:
//   __store.getState().gaConfig
//   __store.getState().yoloMode
if (import.meta.env.DEV) {
  (globalThis as { __store?: typeof useAppStore }).__store = useAppStore;
}

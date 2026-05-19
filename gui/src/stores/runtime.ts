import { create } from "zustand";

import {
  spawnBridge as spawnBridgeProcess,
  type BridgeClient,
} from "@/lib/bridge";
import { persistSession, setPref } from "@/lib/db";
import {
  DEMO_LLM_DISPLAY_NAME,
  DEMO_LLMS,
  DEMO_RUNTIME_INFO,
} from "@/stores/demo";
// useAppStore is imported for getState-time access (cross-store
// transitional reads). The import is a circular dependency at the
// module-graph level, but neither store reads the other's value at
// initialisation time — only inside action bodies, after both
// modules have finished evaluating. Vite handles this correctly.
import { useAppStore } from "@/stores/useAppStore";
import type { RuntimeInfo } from "@/types/inspector";

/**
 * LLM available in the bridge's GA-loaded mykey.py. Mirrors
 * `runner/ipc.py::ReadyEvent.availableLLMs` per-entry shape.
 */
export interface LLMOption {
  index: number;
  displayName: string;
  isCurrent: boolean;
}

/**
 * Per-session runtime slot. B3 M3a only carries LLM fields; M3b will
 * add `bridgeStatus / bridgeError / bridgePid`. The map is keyed by
 * sessionId; `ensureRuntime` guarantees an entry exists before any
 * read (so selectors can return `byId[activeId].llms` without `?.`
 * chains in the hot path).
 */
export interface PerSessionRuntime {
  llms: LLMOption[];
  llmDisplayName: string;
}

/**
 * Seed hints fed by `useAppStore.setActiveSession` when lazy-creating
 * a runtime entry. Carry the session row's persisted `selectedLlm*`
 * fields so the pill renders correctly from t=0 — without these, the
 * picker flashes the cross-session hydrate-cached current LLM (or
 * DEMO_LLMS on first-ever startup) until bridge `ready` arrives.
 */
export interface RuntimeSeedHints {
  persistedIndex?: number;
  persistedDisplayName?: string;
  /**
   * Cross-session hydrate cache; passed in by setActiveSession so
   * runtimeStore doesn't have to depend on useAppStore for the
   * cached list. Used when `persistedIndex` is undefined.
   */
  cachedLLMs?: LLMOption[];
  cachedDisplayName?: string;
}

interface RuntimeState {
  byId: Record<string, PerSessionRuntime>;
  /**
   * Cross-session LLM list cache: populated by `hydrateFromDB` from
   * the `llm_list` pref (a snapshot from any prior bridge's `ready`
   * event), and refreshed on every `replaceLLMs` (since the freshly
   * arrived list is also a valid cross-session snapshot).
   *
   * Used as the seed pool for `ensureRuntime` when a new session is
   * activated and has no byId entry yet. Without this, the picker
   * would have to show DEMO_LLMS or wait for bridge ready — both
   * UX regressions captured in the M3a "pre-seed runtime" work.
   */
  cachedLLMs: LLMOption[];
  /**
   * Cross-session display-name companion to {@link cachedLLMs}. The
   * "current" entry's displayName when the cached list was captured.
   * Falls back into seed when a session has no persisted choice.
   */
  cachedLLMDisplayName: string;
  /**
   * EmptyState's inline LLM picker stash. Consumed by
   * `useAppStore.activateSession` when it spawns the bridge for a
   * fresh session with zero turns. Cleared after consumption so an
   * abandoned pick (user picked LLM then clicked an existing
   * session) doesn't leak into a later unrelated spawn.
   */
  pendingLLMIndex: number | undefined;
  /**
   * Which session currently holds the desktop pet subprocess. Global
   * because the pet is single-instance (one OS-level port). Cleared
   * by `pet_detached` IPC; set by `pet_attached` IPC + this action.
   */
  petAttachedSessionId: string | null;
  runtimeInfo: RuntimeInfo;
  /**
   * Idempotence flag for `warmupLLMList` (one-shot bridge spawn at
   * launch to capture the GA mykey.py list before the first user
   * session). Reset by `setGAConfig` cross-store so changing GA
   * path re-runs warmup.
   */
  _warmupComplete: boolean;
}

interface RuntimeActions {
  /**
   * Lazy-create or refresh the LLM-side of a session's runtime. Idempotent —
   * if `byId[sid]` already exists, the seed is ignored (existing values
   * win because they reflect the live bridge's authoritative state).
   * Called from `useAppStore.setActiveSession`.
   */
  ensureRuntime: (sid: string, seed: RuntimeSeedHints) => void;
  /**
   * Apply the LLM list reported by a bridge's `ready` / `llm_changed`
   * event. Updates byId[sid], caches the list to `llm_list` pref, and
   * (transitional, M4 will own this) mirrors the user's choice onto
   * the session row in `useAppStore.sessions` for persistence across
   * app restart.
   */
  replaceLLMs: (sid: string, llms: LLMOption[]) => void;
  /**
   * EmptyState picker stash: pre-bridge LLM choice for the next new
   * session. Bumps `pendingLLMIndex` so activateSession can pass it
   * to `--llm-no` at spawn time.
   */
  selectLLMForNewSession: (index: number) => void;
  /**
   * One-shot bridge spawn at app launch to capture the GA mykey.py
   * LLM list before any user session exists. Caches the list to prefs
   * and shuts the bridge down immediately. Idempotent via
   * `_warmupComplete`.
   */
  warmupLLMList: () => Promise<void>;
  setPetAttachedSession: (sid: string | null) => void;
  patchRuntimeInfo: (patch: Partial<RuntimeInfo>) => void;
  /**
   * Cross-store: useAppStore.setGAConfig calls this when gaPath /
   * python changes so a future `warmupLLMList` re-runs against the
   * new install. M6 prefsStore will own setGAConfig and emit a
   * prefs-updated event that this store listens to — for now it's a
   * direct call.
   */
  resetWarmup: () => void;
  /**
   * Seed the cross-session LLM cache. Called by `hydrateFromDB`
   * after loading the `llm_list` pref (latest snapshot from a prior
   * bridge spawn). Without this, the first activation in a new app
   * run would have no real LLM list to seed against and fall through
   * to DEMO_LLMS.
   */
  seedCachedLLMs: (list: LLMOption[]) => void;
}

export type RuntimeStore = RuntimeState & RuntimeActions;

/**
 * Build a fresh per-session runtime from seed hints. Centralised so
 * `ensureRuntime` and any future setters use identical semantics:
 *
 *   1. If the session has a persisted LLM choice (`selectedLlmIndex`
 *      column → seed.persistedIndex), re-flag `isCurrent` on the
 *      cached list to match it.
 *   2. Otherwise honour the cached list's own `isCurrent` (cross-
 *      session hydrate cache = whichever LLM was current last).
 *   3. If no cached list exists at all (first-ever cold start with
 *      no `llm_list` pref), fall through to DEMO_LLMS so the picker
 *      isn't empty during onboarding.
 */
function buildSeedRuntime(seed: RuntimeSeedHints): PerSessionRuntime {
  const cached = seed.cachedLLMs ?? [];
  if (cached.length === 0) {
    return { llms: DEMO_LLMS, llmDisplayName: DEMO_LLM_DISPLAY_NAME };
  }
  const llms =
    seed.persistedIndex !== undefined
      ? cached.map((l) => ({
          ...l,
          isCurrent: l.index === seed.persistedIndex,
        }))
      : cached;
  const llmDisplayName =
    seed.persistedDisplayName ??
    seed.cachedDisplayName ??
    cached.find((l) => l.isCurrent)?.displayName ??
    DEMO_LLM_DISPLAY_NAME;
  return { llms, llmDisplayName };
}

export const useRuntimeStore = create<RuntimeStore>((set, get) => ({
  byId: {},
  cachedLLMs: [],
  cachedLLMDisplayName: "",
  pendingLLMIndex: undefined,
  petAttachedSessionId: null,
  runtimeInfo: DEMO_RUNTIME_INFO,
  _warmupComplete: false,

  ensureRuntime: (sid, seed) =>
    set((state) =>
      state.byId[sid]
        ? {}
        : { byId: { ...state.byId, [sid]: buildSeedRuntime(seed) } },
    ),

  replaceLLMs: (sid, llms) => {
    const current = llms.find((l) => l.isCurrent);
    set((state) => {
      const existing = state.byId[sid];
      const next: PerSessionRuntime = {
        llms,
        // displayName follows isCurrent. If for some reason no entry
        // is flagged current, keep the previous displayName to avoid
        // a flash of empty string in the Composer.
        llmDisplayName: current?.displayName ?? existing?.llmDisplayName ?? "",
      };
      // Refresh the cross-session cache too — the freshly arrived
      // list is also a valid snapshot for any future un-seeded
      // session activation.
      return {
        byId: { ...state.byId, [sid]: next },
        cachedLLMs: llms,
        cachedLLMDisplayName: current?.displayName ?? state.cachedLLMDisplayName,
      };
    });
    // Cache LLM list to prefs so future cold-starts (before any
    // bridge has spawned) can show the real model names instead
    // of the DEMO_LLMS seed. The LLM list is GA-install-wide
    // (mykey.py is one file shared across sessions), so any one
    // bridge's `ready` event is a faithful snapshot.
    void setPref("llm_list", llms).catch((e) => {
      console.debug("[runtime] replaceLLMs llm_list cache failed.", e);
    });
    // TRANSITIONAL (M4): mirror the user's current LLM onto the
    // session row + persistSession so the choice survives app
    // restart. After M4 lands sessionsStore, this becomes
    // `useSessionsStore.getState().patchSession(sid, { selectedLlm*
    // })` or even pure Rust event-driven. For now we reach into
    // useAppStore directly — annotated to find on M4 grep.
    if (current) {
      void mirrorSelectedLLMOnSession(sid, current).catch((e) => {
        console.debug("[runtime] replaceLLMs session mirror failed.", e);
      });
    }
  },

  selectLLMForNewSession: (index) =>
    set((state) => {
      // Apply the choice to ALL sessions' per-runtime cache so the
      // Composer pill flips immediately on the empty screen. Future
      // bridge spawns inherit via `pendingLLMIndex` → `--llm-no`.
      const nextById: Record<string, PerSessionRuntime> = {};
      for (const [sid, rt] of Object.entries(state.byId)) {
        if (index < 0 || index >= rt.llms.length) {
          nextById[sid] = rt;
          continue;
        }
        const flipped = rt.llms.map((l, i) => ({
          ...l,
          isCurrent: i === index,
        }));
        nextById[sid] = {
          llms: flipped,
          llmDisplayName: flipped[index].displayName,
        };
      }
      return { byId: nextById, pendingLLMIndex: index };
    }),

  warmupLLMList: async () => {
    if (get()._warmupComplete) return;
    // Read the GA config from useAppStore. Cross-store read is
    // allowed per AD-09 DAG; M6 will move gaConfig to prefsStore
    // and this becomes `useAppStore` → `usePrefsStore`.
    const config = readGAConfigFromAppStore();
    if (!config.gaPath) return;
    set({ _warmupComplete: true });

    let client: BridgeClient | null = null;
    let pendingShutdown = false;
    let readyHandled = false;

    try {
      client = await spawnBridgeProcess(
        { ...config, sessionId: "__warmup__" },
        {
          onEvent: (event) => {
            if (event.kind !== "ready" || readyHandled) return;
            readyHandled = true;
            const llms: LLMOption[] = event.availableLLMs.map((l) => ({
              index: l.index,
              displayName: l.displayName,
              isCurrent: l.isCurrent,
            }));
            const current = llms.find((l) => l.isCurrent);
            // Warmup populates EVERY future-existing session's seed
            // through the `llm_list` pref hydrate path. We don't
            // populate byId here because warmup runs before any
            // session is active — there's no sid to key by.
            void setPref("llm_list", llms).catch((e) => {
              console.debug("[warmup] llm_list cache failed.", e);
            });
            // Also push current displayName onto runtimeInfo so the
            // Settings → Runtime panel shows it immediately.
            set((state) => ({
              runtimeInfo: {
                ...state.runtimeInfo,
                pythonVersion: state.runtimeInfo.pythonVersion,
              },
            }));
            if (current) {
              // Stash so the very next session activation pre-seed
              // can pick this up via `cachedDisplayName` hint.
              // (TopBar pill / Composer pill read via the active
              // session's byId entry; warmup itself doesn't write
              // byId.)
            }
            if (client) {
              void client.shutdown(5000);
            } else {
              pendingShutdown = true;
            }
          },
          onStderr: (line) => console.debug("[warmup stderr]", line),
          onClose: () => console.debug("[warmup] closed"),
          onError: (msg) => console.warn("[warmup] error:", msg),
        },
      );
      if (pendingShutdown) {
        void client.shutdown(5000);
      }
      setTimeout(() => {
        if (!readyHandled && client) {
          console.warn("[warmup] ready timeout, shutting down");
          void client.shutdown(5000);
        }
      }, 15000);
    } catch (e) {
      console.warn("[runtime] warmupLLMList spawn failed:", e);
      set({ _warmupComplete: false });
    }
  },

  setPetAttachedSession: (sid) => set({ petAttachedSessionId: sid }),

  patchRuntimeInfo: (patch) =>
    set((state) => ({ runtimeInfo: { ...state.runtimeInfo, ...patch } })),

  resetWarmup: () => set({ _warmupComplete: false }),

  seedCachedLLMs: (list) => {
    const current = list.find((l) => l.isCurrent);
    set({
      cachedLLMs: list,
      cachedLLMDisplayName: current?.displayName ?? "",
    });
  },
}));

/**
 * Convenience: read the currently active session's per-runtime entry.
 * Stable identity — Zustand returns the same reference until the
 * underlying byId map's keyed value changes.
 *
 * NOTE: this function reaches into useAppStore for `activeSessionId`.
 * That's a transitional cross-store dependency that M4 (sessionsStore)
 * will remove — components migrate to `useSessionsStore(s =>
 * s.activeSessionId)` then.
 */
export function getActiveRuntime(): PerSessionRuntime | undefined {
  const activeId = useAppStore.getState().activeSessionId;
  if (!activeId) return undefined;
  return useRuntimeStore.getState().byId[activeId];
}

// ---- Cross-store transitional helpers ----
//
// Each annotated `TRANSITIONAL: <when-removable>` so M4 / M5 / M6
// can find and remove the cross-store reach.

function readGAConfigFromAppStore() {
  // TRANSITIONAL (M6 prefsStore): when gaConfig moves to prefsStore,
  // switch to `usePrefsStore.getState().gaConfig`.
  // (Function name avoids the `use*` prefix so eslint-plugin-react-hooks
  // doesn't classify it as a hook call inside non-component code.)
  return useAppStore.getState().gaConfig;
}

async function mirrorSelectedLLMOnSession(sid: string, current: LLMOption) {
  // TRANSITIONAL (M4 sessionsStore): when sessions move to sessionsStore,
  // switch to `useSessionsStore.getState().patchSession(sid, { ... })`.
  let snap: { id: string } | null = null;
  useAppStore.setState((state) => {
    const idx = state.sessions.findIndex((s) => s.id === sid);
    if (idx === -1) return {};
    const session = state.sessions[idx];
    if (
      session.selectedLlmIndex === current.index &&
      session.selectedLlmDisplayName === current.displayName
    ) {
      return {};
    }
    const next = state.sessions.slice();
    next[idx] = {
      ...session,
      selectedLlmIndex: current.index,
      selectedLlmDisplayName: current.displayName,
    };
    snap = next[idx];
    return { sessions: next };
  });
  if (snap) {
    await persistSession(snap);
  }
}

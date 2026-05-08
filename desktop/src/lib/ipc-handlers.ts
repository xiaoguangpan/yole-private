import { fromIPCError } from "@/types/app-error";
import type { IPCEvent } from "@/types/ipc";

import type { useAppStore } from "@/stores/useAppStore";

/**
 * Routes an IPC event from the bridge into store actions.
 *
 * #10a wires the five most user-facing events:
 *
 *   ready             — bridge is up and reported runtime/llm info
 *   turn_end          — conversation advanced one turn (logged for now)
 *   tool_call_pending — approval needed (logged for now)
 *   error             — converted to AppError + pushed as toast
 *   llm_changed       — refreshes the llms[] currentness
 *
 * #10b rounds out the rest (turn_start / tool_call_start /
 * tool_call_end / tool_call_progress / ask_user / run_complete /
 * history_loaded) and replaces the "logged for now" stubs with real
 * conversation/approval state writes + SQLite double-writes.
 *
 * The store handle is passed in so we can call typed actions without
 * an import cycle (bridge → ipc-handlers → store → bridge).
 */
export function dispatchIPCEvent(
  event: IPCEvent,
  store: typeof useAppStore,
): void {
  const s = store.getState();

  switch (event.kind) {
    case "ready": {
      console.info("[ipc] ready", {
        sessionId: event.sessionId,
        ga: event.gaCommit,
        llm: event.llmName,
        availableLLMs: event.availableLLMs.length,
      });
      // Update LLM list with the bridge-reported displayName +
      // current flag. runtimeInfo refresh stays as a #10b polish.
      s.replaceLLMs(
        event.availableLLMs.map((l) => ({
          index: l.index,
          displayName: l.displayName,
          isCurrent: l.isCurrent,
        })),
      );
      s.setBridgeStatus("connected");
      return;
    }

    case "llm_changed": {
      console.info("[ipc] llm_changed", {
        index: event.index,
        displayName: event.displayName,
      });
      s.replaceLLMs(
        s.llms.map((l) => ({
          ...l,
          isCurrent: l.index === event.index,
        })),
      );
      return;
    }

    case "error": {
      console.warn("[ipc] error", event);
      s.pushToast(fromIPCError(event));
      return;
    }

    case "turn_end": {
      // #10b: append the assistant turn to a real messages[] in store
      // and persist via INSERT messages + UPDATE sessions. For now
      // log so we can verify the wire is alive.
      console.info("[ipc] turn_end", {
        turnIndex: event.turnIndex,
        summary: event.summary,
        toolCount: event.toolCalls.length,
      });
      return;
    }

    case "tool_call_pending": {
      // #10b: append to pendingApprovals state + show in Inspector
      // approvals tab + flash the conversation callout. For now log.
      console.info("[ipc] tool_call_pending", {
        approvalId: event.approvalId,
        toolName: event.toolName,
        risk: event.riskLevel,
      });
      return;
    }

    // The remaining events get noop logging until #10b promotes them
    // to real state writes.
    case "turn_start":
    case "tool_call_start":
    case "tool_call_end":
    case "tool_call_progress":
    case "ask_user":
    case "run_complete":
    case "history_loaded": {
      console.debug(`[ipc] ${event.kind}`, event);
      return;
    }

    default: {
      const exhaustive: never = event;
      console.warn("[ipc] unknown event kind", exhaustive);
    }
  }
}

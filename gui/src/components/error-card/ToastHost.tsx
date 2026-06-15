import { useEffect } from "react";

import {
  ErrorCard,
  type ErrorCardActions,
} from "@/components/error-card/ErrorCard";
import type { AppError } from "@/types/app-error";
import type { YoleAccountStatus } from "@/lib/managed-models";

interface ToastHostProps extends ErrorCardActions {
  /** Active toasts (typically AppErrors with category bridge / business). */
  toasts: AppError[];
  onDismiss: (id: string) => void;
  /** Auto-dismiss duration in ms. Default 6000. Set 0 to disable. */
  autoDismissMs?: number;
  yoleAccount?: YoleAccountStatus | null;
  isYoleManagedSession?: (sessionId?: string) => boolean;
}

/**
 * Top-level toast container for non-runtime errors. DESIGN.md §6.2.
 *
 * Bridge / business errors render here so they don't fight for space
 * inside the conversation document. Stacks toasts in the bottom-left
 * corner so system feedback has one stable home without covering the
 * Settings close button or the Composer controls. Compact info toasts
 * should feel like quiet system feedback, while warning/error toasts
 * keep the fuller ErrorCard chrome.
 *
 * Toasts sit above modal dialogs because they are system feedback,
 * not content inside the active dialog. The container stays
 * pointer-events-none so it remains visually present without stealing
 * the surrounding interaction surface.
 *
 * Each toast auto-dismisses after `autoDismissMs` (default 6s) unless
 * the user dismisses it manually first.
 */
export function ToastHost({
  toasts,
  onDismiss,
  autoDismissMs = 6000,
  yoleAccount,
  isYoleManagedSession,
  ...actions
}: ToastHostProps) {
  return (
    <div className="pointer-events-none fixed bottom-3 left-3 z-[90] flex w-[320px] max-w-[calc(100vw-24px)] flex-col gap-2">
      {toasts.map((t) => (
        <ToastFrame
          key={t.id}
          toast={t}
          onDismiss={onDismiss}
          autoDismissMs={autoDismissMs}
          yoleAccount={yoleAccount}
          isYoleManagedSession={isYoleManagedSession}
          actions={actions}
        />
      ))}
    </div>
  );
}

function ToastFrame({
  toast,
  onDismiss,
  autoDismissMs,
  yoleAccount,
  isYoleManagedSession,
  actions,
}: {
  toast: AppError;
  onDismiss: (id: string) => void;
  autoDismissMs: number;
  yoleAccount?: YoleAccountStatus | null;
  isYoleManagedSession?: (sessionId?: string) => boolean;
  actions: ErrorCardActions;
}) {
  useEffect(() => {
    const dismissMs = toast.autoDismissMs ?? autoDismissMs;
    if (dismissMs <= 0) return;
    const t = setTimeout(() => onDismiss(toast.id), dismissMs);
    return () => clearTimeout(t);
  }, [toast.id, toast.autoDismissMs, onDismiss, autoDismissMs]);

  return (
    <div className="pointer-events-auto animate-fade-in">
      <ErrorCard
        error={toast}
        variant="toast"
        yoleAccount={
          toast.hint === "quota_exceeded" &&
          (isYoleManagedSession?.(toast.sessionId) ?? false)
            ? yoleAccount
            : null
        }
        onDismiss={() => onDismiss(toast.id)}
        {...actions}
        onRestartChannels={
          actions.onRestartChannels
            ? () => {
                onDismiss(toast.id);
                actions.onRestartChannels?.();
              }
            : undefined
        }
        onRestartAppUpdate={
          actions.onRestartAppUpdate
            ? () => {
                onDismiss(toast.id);
                actions.onRestartAppUpdate?.();
              }
            : undefined
        }
        onInstallAppUpdate={
          actions.onInstallAppUpdate
            ? () => {
                onDismiss(toast.id);
                actions.onInstallAppUpdate?.();
              }
            : undefined
        }
      />
    </div>
  );
}

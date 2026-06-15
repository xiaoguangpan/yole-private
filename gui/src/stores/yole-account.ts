import { create } from "zustand";

import {
  getStoredYoleAccountStatus,
  getYoleAccountStatus,
  normalizeTelegramUsername,
  type YoleAccountStatus,
} from "@/lib/managed-models";
import { useMessagesStore } from "@/stores/messages";
import { useSessionsStore } from "@/stores/sessions";

interface YoleAccountState {
  status: YoleAccountStatus | null;
  loading: boolean;
  error: string | null;
  lowBalanceNotifiedSessionIds: Record<string, true>;
}

interface YoleAccountActions {
  setStatus: (status: YoleAccountStatus | null) => void;
  loadCached: () => Promise<YoleAccountStatus | null>;
  refresh: () => Promise<YoleAccountStatus | null>;
  notifyLowBalanceInActiveChat: () => void;
  notifyQuotaExceeded: (sessionId: string) => void;
}

export const useYoleAccountStore = create<
  YoleAccountState & YoleAccountActions
>((set, get) => ({
  status: null,
  loading: false,
  error: null,
  lowBalanceNotifiedSessionIds: {},

  setStatus: (status) => {
    set({ status, error: null });
    if (status?.lowBalance) {
      get().notifyLowBalanceInActiveChat();
    }
  },

  loadCached: async () => {
    try {
      const status = await getStoredYoleAccountStatus();
      if (status) {
        set({ status, error: null });
        if (status.lowBalance) {
          get().notifyLowBalanceInActiveChat();
        }
      }
      return status;
    } catch (e) {
      console.debug("[yole-account] cached status read failed:", e);
      return get().status;
    }
  },

  refresh: async () => {
    set({ loading: true, error: null });
    if (!get().status) {
      await get().loadCached();
    }

    try {
      const status = await getYoleAccountStatus(true);
      set({ status, loading: false, error: null });
      if (status?.lowBalance) {
        get().notifyLowBalanceInActiveChat();
      }
      return status;
    } catch (e) {
      set({ loading: false, error: extractErrorMessage(e) });
      return get().status;
    }
  },

  notifyLowBalanceInActiveChat: () => {
    const status = get().status;
    if (!status?.lowBalance) return;
    const sessionId = useSessionsStore.getState().activeSessionId;
    if (!sessionId) return;
    if (get().lowBalanceNotifiedSessionIds[sessionId]) return;
    useMessagesStore.getState().appendSystemTurn(sessionId, {
      role: "system",
      variant: "system",
      content: yoleAccountSupportMessage(status, "low"),
    });
    set((state) => ({
      lowBalanceNotifiedSessionIds: {
        ...state.lowBalanceNotifiedSessionIds,
        [sessionId]: true,
      },
    }));
  },

  notifyQuotaExceeded: (sessionId) => {
    const status = get().status;
    useMessagesStore.getState().appendSystemTurn(sessionId, {
      role: "system",
      variant: "system",
      content: status
        ? yoleAccountSupportMessage(status, "empty")
        : "AI 积分不足。联系客服可追加 3000 积分体验额度。",
    });
  },
}));

function extractErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function yoleAccountSupportMessage(
  status: YoleAccountStatus,
  kind: "low" | "empty",
): string {
  const unit = status.pointsUnit?.trim() || "积分";
  const grant = formatPointAmount(status.initialGrantPoints || 3000);
  const fallback =
    kind === "empty"
      ? `AI ${unit}不足。联系客服可追加 ${grant} ${unit}体验额度。`
      : `AI ${unit}较低，可提前联系客服追加体验${unit}。`;
  const lines = [
    kind === "empty" ? (status.contact.topUpMessage ?? fallback) : fallback,
  ];
  if (status.contact.wechatId) {
    lines.push(`微信号：${status.contact.wechatId}`);
  }
  if (status.contact.wechatQrUrl) {
    lines.push(`![微信客服二维码](${status.contact.wechatQrUrl})`);
  }
  const telegram = normalizeTelegramUsername(status.contact.overseas);
  if (telegram) {
    lines.push(`Telegram：${telegram}`);
  }
  lines.push(`支持ID：${status.supportId}`);
  return lines.join("\n\n");
}

function formatPointAmount(value: number): string {
  if (!Number.isFinite(value)) return "3000";
  if (Math.abs(value - Math.round(value)) < 0.05) {
    return Math.round(value).toLocaleString("zh-CN");
  }
  return value.toLocaleString("zh-CN", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

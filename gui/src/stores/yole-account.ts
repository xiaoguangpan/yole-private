import { create } from "zustand";

import {
  getYoleAccountStatus,
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

  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const status = await getYoleAccountStatus();
      set({ status, loading: false, error: null });
      if (status?.lowBalance) {
        get().notifyLowBalanceInActiveChat();
      }
      return status;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      set({ loading: false, error: message });
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
        : "AI 余额不足。联系客服可追加 50 美元体验额度。",
    });
  },
}));

export function yoleAccountSupportMessage(
  status: YoleAccountStatus,
  kind: "low" | "empty",
): string {
  const fallback =
    kind === "empty"
      ? "AI 余额不足。联系客服可追加 50 美元体验额度。"
      : "AI 余额较低，可提前联系客服追加体验额度。";
  const lines = [kind === "empty" ? (status.contact.topUpMessage ?? fallback) : fallback];
  if (status.contact.wechatId) {
    lines.push(`微信号：${status.contact.wechatId}`);
  }
  if (status.contact.wechatQrUrl) {
    lines.push(`![微信客服二维码](${status.contact.wechatQrUrl})`);
  }
  if (status.contact.overseas) {
    lines.push(`海外联系方式：${status.contact.overseas}`);
  }
  lines.push(`支持ID：${status.supportId}`);
  return lines.join("\n\n");
}

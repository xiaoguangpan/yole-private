import { CaretLeft, CaretRight, CircleNotch } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";

import {
  SettingsPanelHeader,
  SettingsSectionLabel,
} from "@/components/screens/settings/settings-ui";
import {
  getYolePointsLedger,
  type YolePointsLedger,
  type YolePointsLedgerItem,
} from "@/lib/managed-models";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;

export function SettingsPointsLedger() {
  const [page, setPage] = useState(1);
  const [ledger, setLedger] = useState<YolePointsLedger | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getYolePointsLedger(page, PAGE_SIZE)
      .then((result) => {
        if (cancelled) return;
        setLedger(result);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [page]);

  const totalPages = useMemo(() => {
    if (!ledger) return 1;
    return Math.max(1, Math.ceil(ledger.total / ledger.pageSize));
  }, [ledger]);

  const account = ledger?.account;
  const unit = account?.pointsUnit?.trim() || "积分";
  const loading = !ledger || ledger.page !== page;
  const visibleError = loading ? null : error;

  return (
    <div className="space-y-7">
      <SettingsPanelHeader
        title="积分记录"
        subtitle="查看余额变化、模型请求和积分消耗"
      />

      <section className="rounded-md border border-line bg-elevated px-5 py-4 shadow-card">
        <div className="text-[12px] text-ink-muted">当前余额</div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-[28px] font-semibold leading-none text-ink">
            {formatPoints(account?.balancePoints ?? 0)}
          </span>
          <span className="text-[13px] text-ink-muted">{unit}</span>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between gap-3">
          <SettingsSectionLabel>明细</SettingsSectionLabel>
          {loading && (
            <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-muted">
              <CircleNotch size={13} weight="thin" className="spin" />
              正在刷新
            </span>
          )}
        </div>

        <div className="mt-3 overflow-hidden rounded-md border border-line bg-elevated">
          <div className="grid h-9 grid-cols-[132px_86px_minmax(128px,1fr)_104px_86px] items-center gap-3 border-b border-line bg-app px-4 text-[11px] font-medium text-ink-muted">
            <span>时间</span>
            <span>类型</span>
            <span>模型 / 请求</span>
            <span className="text-right">积分</span>
            <span className="text-right">状态</span>
          </div>

          {visibleError && (
            <div className="px-4 py-8 text-center text-[13px] text-warning">
              积分记录加载失败：{visibleError}
            </div>
          )}

          {!visibleError && ledger?.items.length === 0 && !loading && (
            <div className="px-4 py-8 text-center text-[13px] text-ink-muted">
              暂无积分记录
            </div>
          )}

          {!visibleError &&
            ledger?.items.map((item) => (
              <LedgerRow key={`${item.id}-${item.createdAt}`} item={item} unit={unit} />
            ))}
        </div>

        <div className="mt-3 flex items-center justify-between text-[12px] text-ink-muted">
          <span>
            共 {ledger?.total ?? 0} 条，第 {ledger?.page ?? page} / {totalPages} 页
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              disabled={page <= 1 || loading}
              className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-ink-muted hover:bg-hover hover:text-ink disabled:cursor-default disabled:opacity-45"
              aria-label="上一页"
            >
              <CaretLeft size={14} weight="thin" />
            </button>
            <button
              type="button"
              onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
              disabled={page >= totalPages || loading}
              className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-ink-muted hover:bg-hover hover:text-ink disabled:cursor-default disabled:opacity-45"
              aria-label="下一页"
            >
              <CaretRight size={14} weight="thin" />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function LedgerRow({ item, unit }: { item: YolePointsLedgerItem; unit: string }) {
  return (
    <div className="grid min-h-12 grid-cols-[132px_86px_minmax(128px,1fr)_104px_86px] items-center gap-3 border-b border-line/70 px-4 py-2 text-[12.5px] last:border-b-0">
      <span className="text-ink-muted">{formatDate(item.createdAt)}</span>
      <span className="text-ink">{typeLabel(item.type)}</span>
      <span className="min-w-0">
        <span className="block truncate font-medium text-ink">
          {item.model?.trim() || item.summary?.trim() || "Yole"}
        </span>
        {item.requestId && (
          <span className="block truncate font-mono text-[11px] text-ink-muted">
            {item.requestId}
          </span>
        )}
      </span>
      <span
        className={cn(
          "text-right font-medium",
          (item.pointsDelta ?? 0) < 0
            ? "text-ink"
            : item.pointsDelta
              ? "text-success"
              : "text-ink-muted",
        )}
      >
        {formatDelta(item.pointsDelta, unit)}
      </span>
      <span
        className={cn(
          "text-right",
          item.status === "error" ? "text-warning" : "text-ink-muted",
        )}
      >
        {item.status === "error" ? "异常" : "完成"}
      </span>
    </div>
  );
}

function formatDate(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "-";
  return new Date(timestamp * 1000).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatPoints(value: number): string {
  const normalized = Number.isFinite(value) ? value : 0;
  return Math.abs(normalized - Math.round(normalized)) < 0.05
    ? Math.round(normalized).toLocaleString("zh-CN")
    : normalized.toLocaleString("zh-CN", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      });
}

function formatDelta(value: number | null | undefined, unit: string): string {
  if (value === null || value === undefined) return "-";
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatPoints(value)} ${unit}`;
}

function typeLabel(type: string): string {
  switch (type) {
    case "consume":
      return "消耗";
    case "topup":
      return "增加";
    case "refund":
      return "退回";
    case "manage":
      return "调整";
    case "system":
      return "系统";
    case "error":
      return "异常";
    case "login":
      return "登录";
    default:
      return "记录";
  }
}

function errorMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  return "未知错误";
}

import { PlugsConnected } from "@phosphor-icons/react";

import { IconTooltip } from "@/components/ui/tooltip";
import { useCopy, type AppCopy } from "@/lib/i18n";
import { cn } from "@/lib/utils";

import type {
  RuntimeIndicatorView,
  SidebarRuntimeIndicator,
} from "./types";


// ---------- subcomponents ----------

export function SidebarHeader({
  runtimeIndicator,
  onOpenRuntimeSettings,
  onOpenModelsSettings,
  onOpenAgentSettings,
}: {
  runtimeIndicator: SidebarRuntimeIndicator;
  onOpenRuntimeSettings?: () => void;
  onOpenModelsSettings?: () => void;
  onOpenAgentSettings?: () => void;
}) {
  const copy = useCopy();
  // Single-line header (refactored 2026-05-13): the "Yole" wordmark
  // is short (~50px at 16px serif), which left ~200px of dead space
  // to the right at the typical 20% sidebar width. Status indicator
  // moved up here right-aligned to use that space and reclaim one
  // line of vertical room for the session list below.
  //
  // No top padding for traffic light: the full-width TopBar above
  // the shell already covers it. The sidebar starts at y=44px (below
  // the TopBar's bottom border).
  //
  const runtimeIndicatorView = renderRuntimeIndicator(
    runtimeIndicator,
    copy.sidebar,
  );
  const indicator =
    runtimeIndicator === "external-ready" ? null : runtimeIndicatorView;
  const externalRuntimeBadge =
    runtimeIndicator === "external-ready" ? runtimeIndicatorView : null;
  const supervisorSopLabel = copy.sidebar.supervisorSop;
  const supervisorSopTooltip = copy.sidebar.supervisorSopTooltip;
  const showSupervisorSop =
    (runtimeIndicator === "hidden" || runtimeIndicator === "external-ready") &&
    Boolean(onOpenAgentSettings);
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line/70 px-4 py-3">
      {/* Product mark: sentence-case Yole keeps the name legible as
          a product rather than an acronym. */}
      <div className="flex min-w-0 items-center gap-2">
        <div className="shrink-0 font-serif text-[17px] font-medium italic tracking-[0.005em] text-ink">
          Yole
        </div>
        {externalRuntimeBadge ? (
          <IconTooltip text={externalRuntimeBadge.title} side="bottom">
            <div className="flex min-w-0 items-center gap-1.5 text-[11.5px] text-ink-soft">
              <RuntimeDot tone={externalRuntimeBadge.tone} />
              <span className="min-w-0 truncate">
                {externalRuntimeBadge.label}
              </span>
            </div>
          </IconTooltip>
        ) : null}
      </div>
      {indicator?.action === "models" ? (
        <IconTooltip text={indicator.title} side="bottom">
          <button
            type="button"
            onClick={onOpenModelsSettings}
            aria-label={indicator.ariaLabel}
            className="flex min-w-0 items-center gap-1.5 rounded-sm px-1 py-0.5 text-[11.5px] text-ink-soft transition-colors hover:bg-hover hover:text-ink"
          >
            <RuntimeDot tone={indicator.tone} />
            <span className="min-w-0 truncate">{indicator.label}</span>
          </button>
        </IconTooltip>
      ) : indicator?.action === "runtime" ? (
        <IconTooltip text={indicator.title} side="bottom">
          <button
            type="button"
            onClick={onOpenRuntimeSettings}
            aria-label={indicator.ariaLabel}
            className="flex min-w-0 items-center gap-1.5 rounded-sm px-1 py-0.5 text-[11.5px] text-ink-soft transition-colors hover:bg-hover hover:text-ink"
          >
            <RuntimeDot tone={indicator.tone} />
            <span className="min-w-0 truncate">{indicator.label}</span>
          </button>
        </IconTooltip>
      ) : showSupervisorSop ? (
        <IconTooltip text={supervisorSopTooltip} side="bottom">
          <button
            type="button"
            onClick={onOpenAgentSettings}
            aria-label={copy.sidebar.openSupervisorSop}
            className="inline-flex min-w-0 max-w-[132px] items-center gap-1.5 rounded-sm px-1.5 py-0.5 text-[11.5px] text-ink-soft transition-colors hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
          >
            <PlugsConnected size={13} weight="thin" className="shrink-0" />
            <span className="min-w-0 truncate">{supervisorSopLabel}</span>
          </button>
        </IconTooltip>
      ) : indicator ? (
        <IconTooltip text={indicator.title} side="bottom">
          <div className="flex min-w-0 items-center gap-1.5 text-[11.5px] text-ink-soft">
            <RuntimeDot tone={indicator.tone} />
            <span className="min-w-0 truncate">{indicator.label}</span>
          </div>
        </IconTooltip>
      ) : (
        <span aria-hidden="true" />
      )}
    </div>
  );
}


function renderRuntimeIndicator(
  indicator: SidebarRuntimeIndicator,
  copy: AppCopy["sidebar"],
): RuntimeIndicatorView | null {
  switch (indicator) {
    case "configure-models":
      return {
        label: copy.configureModels,
        title: copy.bundledNeedsModel,
        ariaLabel: copy.openModelsForBundled,
        tone: "muted",
        action: "models",
      };
    case "external-ready":
      return {
        label: copy.externalGA,
        title: copy.usingExternalGA,
        ariaLabel: copy.usingExternalGAAria,
        tone: "success",
      };
    case "external-unconfigured":
      return {
        label: copy.connectExternalGA,
        title: copy.chooseExistingGAFolder,
        ariaLabel: copy.openRuntimeForExternal,
        tone: "muted",
        action: "runtime",
      };
    case "hidden":
      return null;
  }
}


function RuntimeDot({ tone }: { tone: RuntimeIndicatorView["tone"] }) {
  const map: Record<RuntimeIndicatorView["tone"], string> = {
    success: "bg-success ring-2 ring-success/20",
    muted: "bg-ink-muted",
  };
  return <span className={cn("size-2 rounded-full", map[tone])} />;
}

import * as Popover from "@radix-ui/react-popover";
import {
  ArrowRight,
  ArrowsClockwise,
  ArrowsInLineHorizontal,
  ArrowsOutLineHorizontal,
  Check,
  ChatCircleText,
  CircleNotch,
  Copy,
  Gear,
  Lightning,
  PuzzlePiece,
  QrCode,
  Warning,
} from "@phosphor-icons/react";
import { useState, type ReactNode } from "react";

import { getCurrentWindow } from "@tauri-apps/api/window";

import { Button, IconButton } from "@/components/ui/button";
import { ThemePreferenceMenu } from "@/components/theme/ThemePreferenceMenu";
import { TooltipLabel } from "@/components/ui/tooltip";
import { copyTextToClipboard } from "@/lib/clipboard";
import { useCopy } from "@/lib/i18n";
import { isMac, isWindowActionTarget } from "@/lib/platform";
import { formatShortcutReadable } from "@/lib/shortcuts";
import type { ResolvedTheme, ThemePreference } from "@/lib/theme";
import { cn } from "@/lib/utils";
import type { BrowserControlStatus } from "@/lib/browser-control";
import type { ImSupervisorState } from "@/lib/im-supervisor";
import {
  normalizeTelegramUsername,
  type YoleAccountStatus,
} from "@/lib/managed-models";

import { WindowControls } from "./WindowControls";

export interface TopBarProps {
  /**
   * Current session title to display in the center-left.
   * Empty / undefined = no session active (Empty State); we render an
   * italic muted "新对话" placeholder so the bar always has a title slot.
   */
  sessionTitle?: string;
  /**
   * YOLO mode (PRD §11.5). When true, render a persistent badge in
   * the right cluster — clicking it opens a popover with a one-click
   * disable. Required for V0.1 release; without it users forget the
   * mode is on and trigger high-risk operations unintentionally
   * (DESIGN.md §4.1 YOLO Indicator).
   */
  yoloMode?: boolean;
  onDisableYolo?: () => void;
  onOpenSettings?: () => void;
  /** YOLO popover link: opens Settings directly on the Approval tab. */
  onOpenApprovalSettings?: () => void;
  browserControlStatus?: BrowserControlStatus | null;
  onOpenBrowserControl?: () => void;
  channelsState?: ImSupervisorState | null;
  channelsLoadError?: string | null;
  onOpenChannelsSettings?: () => void;
  showYoleAccount?: boolean;
  yoleAccount?: YoleAccountStatus | null;
  yoleAccountLoading?: boolean;
  yoleAccountError?: string | null;
  onRefreshYoleAccount?: () => void;
  /**
   * Conversation column width mode. "compact" = 760px (default), "wide"
   * = 1400px. Renders an icon button next to Settings that flips
   * between the two modes.
   */
  conversationWidth?: "compact" | "wide";
  onToggleConversationWidth?: () => void;
  themePreference?: ThemePreference;
  resolvedTheme?: ResolvedTheme;
  onChangeThemePreference?: (preference: ThemePreference) => void;
  /** Kept for older hosts; commercial Yole does not render a top-title menu. */
  onReinjectTools?: () => void;
  onTogglePet?: () => void;
  currentSessionHasPet?: boolean;
  /**
   * Rename the active session. When provided, the title menu shows a
   * "重命名" entry that flips the title block into an inline input —
   * mirrors the right-click rename in Sidebar so users have two
   * equally-discoverable rename paths.
   */
  onRenameSession?: (newTitle: string) => void;
  /**
   * Left chrome padding.
   *
   *   - macOS: 70px to clear the traffic light cluster (positioned at
   *     {16, 16} via tauri.conf.json titleBarStyle "Overlay";
   *     three buttons × 12px + gaps + safety).
   *   - Windows: 12px breathing room — no native chrome on the left
   *     under our custom-chrome plan (Y), so the title floats nearly
   *     flush with the window edge.
   *
   * Default resolves from `isMac`; consumers rarely override.
   */
  trafficLightPadding?: number;
}

/**
 * Top bar — full-window-width, 44px tall. Per DESIGN.md §4.1.
 *
 *   [ traffic light reserved │  ─── title (centered) ───  │ ⌘K  ... ]
 *
 * Layout — three flex sections; the title sits centered in the
 * remaining space between the traffic-light reserve (left) and the
 * action cluster (right). This is the standard macOS pattern (Safari,
 * Notion, Mail.app, Pages, Finder): the document title floats centered
 * in the chrome, not glued to the traffic-light cluster.
 *
 * Why not just left-align with extra padding: with paddingLeft = 70px
 * the title sat 2px from the traffic light's right edge — visually it
 * read as a single cramped cluster. Adding more padding helps the
 * spacing but the asymmetry (title left, actions right) still feels
 * off. Centering produces the symmetric chrome the OS conditions us to
 * expect.
 *
 * Sidebar toggle lives inside Sidebar.tsx header (next to the logo).
 * Co-locating an affordance with its target avoids visual collision
 * with the traffic-light cluster (16-68px) and matches Notion / Linear
 * / Arc / Cursor convention.
 *
 * Window dragging:
 *   - Tauri v2 only honours `data-tauri-drag-region` when the
 *     `core:window:allow-start-dragging` permission is granted —
 *     `core:default` does NOT include it. We add it explicitly in
 *     capabilities/default.json.
 *   - The attribute is non-bubbling (the element receiving mousedown
 *     must carry it). We mark the root, the title slot, and the title
 *     span / placeholder. Buttons are auto-excluded by Tauri.
 *
 * V0.1 #2: title is read-only display; inline edit lands in #3 when
 * conversation state has a place to live. The editing <input> will
 * need to opt out of drag region (otherwise mousedown gets captured by
 * the OS for window drag instead of focusing the input).
 */
export function TopBar({
  sessionTitle,
  yoloMode = false,
  onDisableYolo,
  onOpenSettings,
  onOpenApprovalSettings,
  browserControlStatus = null,
  onOpenBrowserControl,
  channelsState = null,
  channelsLoadError = null,
  onOpenChannelsSettings,
  showYoleAccount = false,
  yoleAccount = null,
  yoleAccountLoading = false,
  yoleAccountError = null,
  onRefreshYoleAccount,
  conversationWidth = "compact",
  onToggleConversationWidth,
  themePreference = "system",
  resolvedTheme = "light",
  onChangeThemePreference,
  trafficLightPadding = isMac ? 70 : 12,
}: TopBarProps) {
  const copy = useCopy();
  return (
    <div
      data-tauri-drag-region
      // Windows custom chrome: double-click anywhere draggable on the
      // TopBar toggles maximize, mirroring native title-bar behavior.
      // Mac's Overlay style hands this to the OS, so we early-exit.
      onDoubleClick={(e) => {
        if (isMac) return;
        if (!isWindowActionTarget(e.target)) return;
        try {
          void getCurrentWindow().toggleMaximize();
        } catch {
          // No Tauri host (e.g. plain Vite browser dev) — ignore.
        }
      }}
      className={cn(
        "flex h-11 shrink-0 items-stretch border-b border-line/70 bg-app text-[13px]",
        // Windows reserves no right padding here — WindowControls
        // (Step 3) will own the right edge and hug the corner per
        // Win 11 convention. Mac keeps its 12px breathing room.
        isMac && "pr-3",
      )}
    >
      {/* Left: traffic-light reserve. Pure spacer, draggable. */}
      <div
        data-tauri-drag-region
        className="shrink-0"
        style={{ width: trafficLightPadding }}
      />

      {/* Center: hidden title only. Long titles and session actions live in the sidebar. */}
      <div
        data-tauri-drag-region
        className="flex min-w-0 flex-1 items-center justify-center px-3"
      >
        {sessionTitle && <span className="sr-only">{sessionTitle}</span>}
      </div>

      {/* Right: action cluster. Global controls only — session-level
          actions live next to the title (see comment above). Buttons
          are auto-excluded from drag region by Tauri so they remain
          clickable. */}
      <div className="flex shrink-0 items-center gap-2">
        {yoloMode && (
          <YoloIndicator
            onDisable={onDisableYolo}
            onOpenSettings={onOpenApprovalSettings ?? onOpenSettings}
          />
        )}
        <div className="flex items-center gap-1">
          {/* No Search button here — the Sidebar's Quick Actions has
              its own search affordance, and ⌘K opens the palette from
              anywhere. Two click affordances for the same thing was
              chrome clutter without payoff. */}
          <WidthToggleButton
            mode={conversationWidth}
            onToggle={onToggleConversationWidth}
          />
          {browserControlStatus && (
            <BrowserControlIndicator
              status={browserControlStatus}
              onOpen={onOpenBrowserControl}
            />
          )}
          {onOpenChannelsSettings && (
            <ChannelsIndicator
              state={channelsState}
              loadError={channelsLoadError}
              onOpen={onOpenChannelsSettings}
            />
          )}
          {showYoleAccount && (
            <YoleBalanceIndicatorSafe
              account={yoleAccount}
              loading={yoleAccountLoading}
              error={yoleAccountError}
              onRefresh={onRefreshYoleAccount}
            />
          )}
          {onChangeThemePreference && (
            <ThemePreferenceMenu
              preference={themePreference}
              resolvedTheme={resolvedTheme}
              onChange={onChangeThemePreference}
              variant="topbar"
            />
          )}
          <IconButton
            title={copy.topbar.settingsShortcut(
              formatShortcutReadable("Mod+,"),
            )}
            onClick={onOpenSettings}
            ariaLabel={copy.topbar.openSettings}
          >
            <Gear size={16} weight="thin" />
          </IconButton>
        </div>
        {/* Windows-only custom chrome: min / max-restore / close. Hugs
            the window's right edge (TopBar drops pr-3 on Win for this).
            Mac path renders nothing — the traffic light on the left
            already owns the window-control role. */}
        {!isMac && <WindowControls />}
      </div>
    </div>
  );
}

function ChannelsIndicator({
  state,
  loadError,
  onOpen,
}: {
  state: ImSupervisorState | null;
  loadError?: string | null;
  onOpen?: () => void;
}) {
  const copy = useCopy().topbar;
  const status = channelsTopbarStatus(state, loadError);
  const title = {
    setup: copy.channelsSetup,
    connecting: copy.channelsConnecting,
    waitingScan: copy.channelsWaitingScan,
    connected: copy.channelsConnected,
    needsAttention: copy.channelsNeedsAttention,
  }[status];

  return (
    <IconButton
      title={title}
      onClick={onOpen}
      ariaLabel={title}
      className={cn(
        status === "needsAttention" &&
          "text-error hover:bg-error/10 hover:text-error",
      )}
    >
      <ChatCircleText size={16} weight="thin" />
    </IconButton>
  );
}

function YoleBalanceIndicatorSafe({
  account,
  loading,
  error,
  onRefresh,
}: {
  account: YoleAccountStatus | null;
  loading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<
    "support" | "wechat" | "telegram" | null
  >(null);
  const wechatId = account?.contact.wechatId?.trim();
  const qrUrl = account?.contact.wechatQrUrl?.trim();
  const telegram = normalizeTelegramUsername(account?.contact.overseas);
  const points = account
    ? formatYolePoints(account.balancePoints, account.pointsUnit)
    : "AI 积分";
  const needsAttention = Boolean(error) || Boolean(account?.lowBalance);

  const copyValue = (
    kind: "support" | "wechat" | "telegram",
    value: string,
  ) => {
    void copyTextToClipboard(value).then(() => {
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 1400);
    });
  };

  return (
    <Popover.Root
      onOpenChange={(open) => {
        setOpen(open);
      }}
    >
      <TooltipLabel text="AI 积分" side="bottom">
        <Popover.Trigger asChild>
          <button
            type="button"
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-sm border px-2 text-[12px]",
              "transition-[background-color,border-color,color,transform] duration-[120ms]",
              "active:translate-y-[0.5px]",
              open
                ? "border-line bg-elevated text-ink shadow-card"
                : needsAttention
                  ? "border-transparent bg-transparent font-medium text-warning hover:bg-hover"
                  : "border-transparent bg-transparent text-ink-soft hover:bg-hover hover:text-ink",
            )}
            aria-label={`AI 积分 ${points}`}
          >
            <span>{points}</span>
          </button>
        </Popover.Trigger>
      </TooltipLabel>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className={cn(
            "z-50 w-[300px] rounded-md border border-line bg-elevated p-4 shadow-elevated",
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[12px] text-ink-muted">AI 积分</div>
              <div className="mt-0.5 text-[22px] font-semibold leading-none text-ink">
                {points}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {account?.lowBalance && (
                <span className="rounded-sm border border-warning/30 bg-warning/10 px-1.5 py-0.5 text-[11px] font-medium text-warning">
                  积分较低
                </span>
              )}
              {onRefresh && (
                <TooltipLabel
                  text={loading ? "正在刷新积分" : "刷新积分"}
                  side="top"
                >
                  <button
                    type="button"
                    onClick={() => onRefresh()}
                    disabled={loading}
                    className={cn(
                      "inline-flex size-6 items-center justify-center rounded-sm text-ink-muted",
                      "hover:bg-hover hover:text-ink disabled:cursor-default disabled:opacity-60",
                    )}
                    aria-label="刷新积分"
                  >
                    <ArrowsClockwise
                      size={13}
                      weight="thin"
                      className={cn(loading && "spin")}
                    />
                  </button>
                </TooltipLabel>
              )}
            </div>
          </div>

          {error && (
            <div
              title={error}
              className="mt-3 rounded-sm border border-warning/30 bg-warning/10 px-2.5 py-2 text-[12px] leading-relaxed text-warning"
            >
              积分刷新失败，请稍后再试。
            </div>
          )}

          {!account && !error && (
            <div className="mt-3 rounded-sm border border-line bg-app px-2.5 py-2 text-[12px] leading-relaxed text-ink-muted">
              暂未读取到积分状态，可点击刷新重试。
            </div>
          )}

          {account && (
            <div className="mt-3 space-y-2 text-[12px]">
              <YoleAccountRow label="支持ID" value={account.supportId}>
                <button
                  type="button"
                  onClick={() => copyValue("support", account.supportId)}
                  className="inline-flex size-6 items-center justify-center rounded-sm text-ink-muted hover:bg-hover hover:text-ink"
                  aria-label="复制支持ID"
                >
                  {copied === "support" ? (
                    <Check size={13} weight="thin" />
                  ) : (
                    <Copy size={13} weight="thin" />
                  )}
                </button>
              </YoleAccountRow>
              {wechatId && (
                <YoleAccountRow label="微信号" value={wechatId}>
                  <button
                    type="button"
                    onClick={() => copyValue("wechat", wechatId)}
                    className="inline-flex size-6 items-center justify-center rounded-sm text-ink-muted hover:bg-hover hover:text-ink"
                    aria-label="复制微信号"
                  >
                    {copied === "wechat" ? (
                      <Check size={13} weight="thin" />
                    ) : (
                      <Copy size={13} weight="thin" />
                    )}
                  </button>
                </YoleAccountRow>
              )}
              {telegram && (
                <YoleAccountRow label="Telegram" value={telegram}>
                  <button
                    type="button"
                    onClick={() => copyValue("telegram", telegram)}
                    className="inline-flex size-6 items-center justify-center rounded-sm text-ink-muted hover:bg-hover hover:text-ink"
                    aria-label="复制 Telegram"
                  >
                    {copied === "telegram" ? (
                      <Check size={13} weight="thin" />
                    ) : (
                      <Copy size={13} weight="thin" />
                    )}
                  </button>
                </YoleAccountRow>
              )}
            </div>
          )}

          {qrUrl && (
            <div className="mt-3 rounded-sm border border-line bg-app p-2">
              <div className="mb-2 flex items-center gap-1.5 text-[11.5px] text-ink-muted">
                <QrCode size={13} weight="thin" />
                微信客服二维码
              </div>
              <img
                src={qrUrl}
                alt="微信客服二维码"
                className="mx-auto size-32 rounded-sm object-contain"
              />
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function YoleAccountRow({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <div className="text-[11px] text-ink-muted">{label}</div>
        <div className="truncate font-medium text-ink">{value}</div>
      </div>
      {children}
    </div>
  );
}

function formatYolePoints(value: number, unit?: string | null): string {
  const normalized = Number.isFinite(value) ? value : 0;
  const label = unit?.trim() || "积分";
  const amount =
    Math.abs(normalized - Math.round(normalized)) < 0.05
      ? Math.round(normalized).toLocaleString("zh-CN")
      : normalized.toLocaleString("zh-CN", {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        });
  return `${amount} ${label}`;
}

function channelsTopbarStatus(
  state: ImSupervisorState | null,
  loadError?: string | null,
) {
  if (loadError || state === "expired" || state === "error") {
    return "needsAttention";
  }
  if (state === "running") return "connected";
  if (state === "starting") return "connecting";
  if (state === "waiting_scan") return "waitingScan";
  return "setup";
}

function BrowserControlIndicator({
  status,
  onOpen,
}: {
  status: BrowserControlStatus;
  onOpen?: () => void;
}) {
  const copy = useCopy().topbar;
  const connected = status === "connected";
  const connectedNoTabs = status === "connected_no_tabs";
  const offline = status === "offline";
  const bridgeReady = connected || connectedNoTabs;
  const checking = status === "unknown";
  const missing = status === "not_connected";
  const error = status === "error";
  const needsAttention = missing || error;
  const label = checking
    ? copy.browserControlChecking
    : error
      ? copy.browserControlError
      : copy.browserControlPending;
  const title = connected
    ? copy.browserControlConnectedTitle
    : connectedNoTabs
      ? copy.browserControlNoTabsTitle
      : offline
        ? copy.browserControlOfflineTitle
        : error
          ? copy.browserControlErrorTitle
          : copy.browserControlPendingTitle;
  if (bridgeReady || offline) {
    return (
      <TooltipLabel text={title}>
        <button
          type="button"
          onClick={onOpen}
          className={cn(
            "relative flex size-7 items-center justify-center rounded-sm border border-transparent text-ink-muted",
            "transition-[background-color,border-color,color,transform] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)]",
            "hover:border-line hover:bg-hover hover:text-ink active:translate-y-[0.5px]",
          )}
          aria-label={title}
        >
          <PuzzlePiece size={16} weight="thin" />
        </button>
      </TooltipLabel>
    );
  }

  return (
    <TooltipLabel text={title}>
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "flex h-7 items-center gap-1.5 rounded-sm border px-2 text-[12px] transition-[background-color,border-color,color,box-shadow,transform]",
          "duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] active:translate-y-[0.5px]",
          error
            ? "border-warning/40 bg-warning/15 font-medium text-warning hover:bg-warning/25"
            : checking
              ? "border-line bg-elevated text-ink-muted hover:bg-hover hover:text-ink"
              : "border-warning/40 bg-warning/15 font-medium text-warning hover:bg-warning/25",
          needsAttention && "browser-control-attention",
        )}
        aria-label={title}
      >
        {checking ? (
          <CircleNotch size={14} weight="thin" className="spin" />
        ) : error ? (
          <Warning size={14} weight="thin" />
        ) : (
          <PuzzlePiece size={14} weight="thin" />
        )}
        <span>{label}</span>
      </button>
    </TooltipLabel>
  );
}

/**
 * Persistent YOLO indicator (DESIGN.md §4.1 / PRD §11.5).
 *
 * Visible only while yoloMode is true. Click → Radix Popover with:
 *   - Status line ("YOLO 模式已开启")
 *   - "立即关闭" warning-tinted button (calls onDisable)
 *   - Secondary link to Settings → Approval tab
 *
 * Visual: warning-tinted pill, 1px border, Lightning icon. No animation —
 * users tune out blinking; static colour reads "this is a state, be
 * aware" without becoming background noise.
 */
function YoloIndicator({
  onDisable,
  onOpenSettings,
}: {
  onDisable?: () => void;
  onOpenSettings?: () => void;
}) {
  const copy = useCopy();
  return (
    <Popover.Root>
      <TooltipLabel text={copy.topbar.yoloTooltip} side="bottom">
        <Popover.Trigger asChild>
          <button
            type="button"
            aria-label={copy.topbar.yoloView}
            className={cn(
              "inline-flex items-center gap-1 rounded-md border border-warning/30 bg-warning/10 px-2 py-1",
              "text-[12px] font-medium uppercase text-warning",
              "transition-colors hover:bg-warning/20",
            )}
          >
            <Lightning size={14} weight="thin" />
            自动执行
          </button>
        </Popover.Trigger>
      </TooltipLabel>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className={cn(
            "z-50 w-[280px] rounded-md border border-line bg-elevated p-4 shadow-elevated",
          )}
        >
          <div className="flex items-center gap-2">
            <Lightning size={16} weight="thin" className="text-warning" />
            <div className="text-[13px] font-medium text-ink">
              {copy.topbar.yoloOn}
            </div>
          </div>
          <p className="mt-1.5 text-[12px] text-ink-muted">
            {copy.topbar.yoloDetail}
          </p>
          <Button
            variant="warning"
            size="md"
            onClick={onDisable}
            className="mt-3 w-full"
            leadingIcon={<Lightning size={14} weight="thin" />}
          >
            {copy.topbar.turnOffNow}
          </Button>
          {onOpenSettings && (
            <Popover.Close asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={onOpenSettings}
                className="mt-2 w-full"
                trailingIcon={<ArrowRight size={12} weight="thin" />}
              >
                {copy.topbar.viewInSettings}
              </Button>
            </Popover.Close>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/**
 * Conversation width toggle.
 *
 * Icon direction expresses the action (expand while compact, collapse
 * while wide). Tooltip and aria-label carry the text so this stays a
 * light topbar tool instead of a status pill.
 */
function WidthToggleButton({
  mode,
  onToggle,
}: {
  mode: "compact" | "wide";
  onToggle?: () => void;
}) {
  const copy = useCopy();
  const isWide = mode === "wide";
  const tooltip = isWide
    ? copy.topbar.compactWidthTitle
    : copy.topbar.wideWidthTitle;
  return (
    <TooltipLabel text={tooltip}>
      <button
        type="button"
        onClick={onToggle}
        aria-label={isWide ? copy.topbar.compactWidth : copy.topbar.wideWidth}
        className={cn(
          "inline-flex size-7 items-center justify-center rounded-md transition-colors",
          isWide
            ? "border border-brand/30 bg-brand/10 text-brand-strong hover:bg-brand/20"
            : "border border-transparent text-ink-soft hover:bg-hover hover:text-ink",
        )}
      >
        {isWide ? (
          <ArrowsInLineHorizontal size={14} weight="thin" />
        ) : (
          <ArrowsOutLineHorizontal size={14} weight="thin" />
        )}
      </button>
    </TooltipLabel>
  );
}

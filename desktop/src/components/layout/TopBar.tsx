import * as Popover from "@radix-ui/react-popover";
import {
  Gear,
  Lightning,
  MagnifyingGlass,
} from "@phosphor-icons/react";

import { cn } from "@/lib/utils";

export interface TopBarProps {
  /**
   * Current session title to display in the center-left.
   * Empty / undefined = no session active (Empty State); we render an
   * italic muted "新对话" placeholder so the bar always has a title slot.
   */
  sessionTitle?: string;
  onOpenCommandPalette?: () => void;
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
  /**
   * Padding on the left to clear the macOS traffic light (which is
   * positioned at {16, 16} via tauri.conf.json titleBarStyle "Overlay").
   * Three buttons × 12px + gaps + safety = ~70px.
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
  onOpenCommandPalette,
  yoloMode = false,
  onDisableYolo,
  onOpenSettings,
  trafficLightPadding = 70,
}: TopBarProps) {
  return (
    <div
      data-tauri-drag-region
      className="flex h-11 shrink-0 items-stretch border-b border-line bg-app pr-3 text-[13px]"
    >
      {/* Left: traffic-light reserve. Pure spacer, draggable. */}
      <div
        data-tauri-drag-region
        className="shrink-0"
        style={{ width: trafficLightPadding }}
      />

      {/* Center: title centered in remaining space. flex-1 so it
          consumes whatever the action cluster doesn't. */}
      <div
        data-tauri-drag-region
        className="flex min-w-0 flex-1 items-center justify-center px-3"
      >
        {sessionTitle ? (
          <span
            data-tauri-drag-region
            className="truncate font-medium text-ink"
          >
            {sessionTitle}
          </span>
        ) : (
          <span
            data-tauri-drag-region
            className="truncate font-serif italic text-ink-muted"
          >
            新对话
          </span>
        )}
      </div>

      {/* Right: action cluster. Buttons are auto-excluded from drag
          region by Tauri so they remain clickable. */}
      <div className="flex shrink-0 items-center gap-2">
        {yoloMode && (
          <YoloIndicator
            onDisable={onDisableYolo}
            onOpenSettings={onOpenSettings}
          />
        )}
        <div className="flex items-center gap-1">
          <IconButton
            title="Search · ⌘K"
            onClick={onOpenCommandPalette}
            ariaLabel="Open command palette"
          >
            <MagnifyingGlass size={16} weight="thin" />
          </IconButton>
          <IconButton
            title="Settings · ⌘,"
            onClick={onOpenSettings}
            ariaLabel="Open settings"
          >
            <Gear size={16} weight="thin" />
          </IconButton>
        </div>
      </div>
    </div>
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
 * Visual: warning-tinted pill, 1px border, ⚡ icon. No animation —
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
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label="YOLO 模式已开启 · 点击查看"
          className={cn(
            "inline-flex items-center gap-1 rounded-md border border-warning/30 bg-warning/10 px-2 py-1",
            "text-[12px] font-medium uppercase text-warning",
            "transition-colors hover:bg-warning/20",
          )}
        >
          <Lightning size={14} weight="thin" />
          YOLO
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className={cn(
            "z-50 w-[280px] rounded-[10px] border border-line bg-elevated p-4 shadow-elevated",
          )}
        >
          <div className="flex items-center gap-2">
            <Lightning size={16} weight="thin" className="text-warning" />
            <div className="text-[13px] font-medium text-ink">
              YOLO 模式已开启
            </div>
          </div>
          <p className="mt-1.5 text-[12px] text-ink-muted">
            所有 tool 调用跳过审批直接执行
          </p>
          <button
            type="button"
            onClick={onDisable}
            className={cn(
              "mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-sm bg-warning px-3 py-2",
              "text-[12.5px] font-medium text-elevated transition-colors hover:bg-warning/90",
            )}
          >
            <Lightning size={14} weight="thin" />
            立即关闭
          </button>
          {onOpenSettings && (
            <button
              type="button"
              onClick={onOpenSettings}
              className="mt-2 w-full rounded-sm px-3 py-1.5 text-[12px] text-ink-soft transition-colors hover:bg-hover hover:text-ink"
            >
              在 Settings 中查看 →
            </button>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function IconButton({
  children,
  onClick,
  title,
  ariaLabel,
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  title?: string;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={ariaLabel}
      onClick={onClick}
      className={cn(
        "flex size-7 items-center justify-center rounded-sm text-ink-soft transition-colors hover:bg-hover hover:text-ink",
        className,
      )}
    >
      {children}
    </button>
  );
}

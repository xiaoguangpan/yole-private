import { ArrowSquareOut, BookOpen, Folder, Terminal } from "@phosphor-icons/react";
import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { usePrefsStore } from "@/stores/prefs";

/**
 * Outcome enum mirrored from Rust core/src/sop_install.rs. serde
 * tag = "outcome" with snake_case rename, so the wire shape is
 *   { outcome: "installed", path: "/…" } | { outcome: "already_exists", path: "/…" }
 *   | { outcome: "ga_path_invalid", reason: "…" }
 *   | { outcome: "write_failed", path: "/…", reason: "…" }
 */
type SopInstallOutcome =
  | { outcome: "installed"; path: string }
  | { outcome: "already_exists"; path: string }
  | { outcome: "ga_path_invalid"; reason: string }
  | { outcome: "write_failed"; path: string; reason: string };

type SopInstallState =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "already_exists"; path: string }
  | { kind: "installed"; path: string }
  | { kind: "error"; reason: string };

/**
 * Settings → Integration tab. PRD §12 / B4 M3 surface — the screen
 * supervisors / IM bots route through to wire Galley into their world.
 *
 * Three concerns live here:
 *
 * 1. **Galley Supervisor SOP** — install the `galley-supervisor-sop.md`
 *    bundled with Galley into the user's GA `memory/` so a GA bot
 *    auto-picks it up as a system-prompt addendum. CLAUDE.md SOP-install
 *    exception covers the write path; the button enforces a fixed
 *    target (memory/galley-supervisor-sop.md).
 *
 * 2. **`galley` PATH escape hatch** — by default supervisors use the
 *    discovery file (~/.config/galley/cli-path) to find the absolute
 *    binary path; humans typing `galley` in a terminal need a PATH
 *    symlink. macOS shows a sudo prompt, Windows writes user-level
 *    PATH.
 *
 * 3. **Agent API reference** — link to the canonical schema doc on
 *    GitHub. Plain external link; no install step.
 *
 * For this scaffolding pass (T3.2 + T3.5), only #3 is wired. #1 and #2
 * render as disabled buttons with a "实现中" sublabel so users see
 * what's coming without confusion about whether the row works today.
 * T3.3 and T3.4 follow in subsequent commits.
 */
export function SettingsIntegration() {
  const gaPath = usePrefsStore((s) => s.gaConfig.gaPath);
  const [sopState, setSopState] = useState<SopInstallState>({ kind: "idle" });

  const openExternal = (url: string) => {
    // Tauri exposes the OS shell via the plugin-shell capability;
    // an in-page anchor with target=_blank does the same in dev mode
    // when the page is served by Vite + opens via the OS's URL
    // handler (Chrome / Safari). For both dev and packaged builds
    // window.open is the simplest portable hook.
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const installSop = async (overwrite: boolean) => {
    if (!gaPath) return;
    setSopState({ kind: "pending" });
    try {
      const result = await invoke<SopInstallOutcome>("install_supervisor_sop", {
        gaPath,
        overwrite,
      });
      switch (result.outcome) {
        case "installed":
          setSopState({ kind: "installed", path: result.path });
          break;
        case "already_exists":
          setSopState({ kind: "already_exists", path: result.path });
          break;
        case "ga_path_invalid":
        case "write_failed":
          setSopState({ kind: "error", reason: result.reason });
          break;
      }
    } catch (e) {
      // Invoke-level failure — Tauri command threw / wasn't registered.
      // Surface the raw message; this branch is rare and indicates a
      // backend regression rather than a user-fixable problem.
      setSopState({
        kind: "error",
        reason: e instanceof Error ? e.message : String(e),
      });
    }
  };

  return (
    <div className="space-y-7">
      <div>
        <h2 className="m-0 font-serif text-[20px] font-semibold uppercase tracking-[0.04em] text-ink">
          Integration
        </h2>
        <p className="mt-1 font-serif text-[14px] italic text-ink-soft">
          把 Galley 接进你的 supervisor / IM bot / Claude Skill
        </p>
      </div>

      {/* Discovery file row. Informational, not interactive — the file
          is written automatically at Galley startup (B4 M3 T3.1) and
          supervisors read it without needing user input. Listing the
          path here is a tooltip-substitute so the documented contract
          is visible from Settings.

          Display format mirrors SettingsAbout's <dl> rhythm: 120px
          label column + monospace value. PathHint groups the two
          platform-specific paths because most users only need one,
          but a dev moving between OSes might want both. */}
      <section>
        <SubLabel>Discovery file</SubLabel>
        <p className="mt-2 text-[12.5px] leading-[1.6] text-ink-soft">
          Galley 启动时把 CLI 二进制的绝对路径写到这个文件。Supervisor
          SOP 第一步读它来定位 <code className="font-mono text-ink">galley</code>。
        </p>
        <dl className="mt-3 grid grid-cols-[120px_1fr] gap-x-3 gap-y-2 text-[12.5px]">
          <dt className="text-ink-muted">macOS / Linux</dt>
          <dd className="m-0 break-all font-mono text-ink">
            ~/.config/galley/cli-path
          </dd>
          <dt className="text-ink-muted">Windows</dt>
          <dd className="m-0 break-all font-mono text-ink">
            %APPDATA%\galley\cli-path
          </dd>
        </dl>
      </section>

      {/* Supervisor SOP install (T3.4). Reads gaConfig.gaPath from
          prefs + invokes the Rust install_supervisor_sop command.
          On AlreadyExists, surfaces an inline 3-button choice
          (保留 / 覆盖 / 取消) rather than a modal — single-shot decision,
          local to this section, modal would overweight the moment.

          Disabled when gaPath is empty (user hasn't configured GA
          location yet in Runtime tab) — the inline hint redirects
          there. */}
      <section>
        <SubLabel>Galley Supervisor SOP</SubLabel>
        <p className="mt-2 text-[12.5px] leading-[1.6] text-ink-soft">
          把 SOP 装进你的 GA <code className="font-mono">memory/</code>，
          下次 GA 启动时它会作为系统提示一部分读到。固定路径
          <code className="font-mono">memory/galley-supervisor-sop.md</code>
          ，不替换同名文件（首次提示）。
        </p>
        {!gaPath ? (
          <p className="mt-3 text-[12px] text-ink-muted">
            先在{" "}
            <span className="text-ink-soft">Settings → Runtime</span>{" "}
            配置 GA Path
          </p>
        ) : sopState.kind === "already_exists" ? (
          <SopAlreadyExistsRow
            path={sopState.path}
            onKeep={() => setSopState({ kind: "idle" })}
            onOverwrite={() => void installSop(true)}
            onCancel={() => setSopState({ kind: "idle" })}
          />
        ) : (
          <div className="mt-3 flex items-center gap-3">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={sopState.kind === "pending"}
              onClick={() => void installSop(false)}
            >
              <Folder size={14} weight="thin" />
              装到 GA memory/
            </Button>
            <SopStatus state={sopState} />
          </div>
        )}
      </section>

      {/* PATH escape hatch — disabled stub for T3.2; T3.3 wires the
          osascript sudo / Windows registry write. */}
      <section>
        <SubLabel>命令行 PATH</SubLabel>
        <p className="mt-2 text-[12.5px] leading-[1.6] text-ink-soft">
          Supervisor 用 discovery file 找 CLI 不需要 PATH。这个按钮是给
          人类用户的便利——装完可以直接在终端敲
          <code className="font-mono">galley</code>。可逆，再点一次可以卸载。
        </p>
        <div className="mt-3 flex items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled
            title="T3.3 实现中"
          >
            <Terminal size={14} weight="thin" />
            把 galley 装到 PATH
          </Button>
          <span className="text-[11px] text-ink-muted">实现中</span>
        </div>
      </section>

      {/* Docs link. T3.5 — pure external link, no install. */}
      <section>
        <SubLabel>Agent API 参考</SubLabel>
        <p className="mt-2 text-[12.5px] leading-[1.6] text-ink-soft">
          完整 CLI 命令 / socket schema / exit code 分类。Schema 版本
          锁在 v1，additive-only。
        </p>
        <div className="mt-3">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() =>
              openExternal(
                "https://github.com/wangjc683/galley/blob/main/docs/agent-api.md",
              )
            }
          >
            <BookOpen size={14} weight="thin" />
            在 GitHub 上查看 agent-api.md
            <ArrowSquareOut size={11} weight="thin" />
          </Button>
        </div>
      </section>
    </div>
  );
}

function SubLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
      {children}
    </div>
  );
}

/**
 * Inline status line next to the install button. Stays low-emphasis
 * ([11px], ink-muted) so the SubLabel and prose dominate; the install
 * button is the visual anchor.
 */
function SopStatus({ state }: { state: SopInstallState }) {
  switch (state.kind) {
    case "idle":
      return null;
    case "pending":
      return <span className="text-[11px] text-ink-muted">安装中…</span>;
    case "installed":
      return (
        <span
          className="break-all text-[11px] text-ink-soft"
          title={state.path}
        >
          已安装 ✓
        </span>
      );
    case "error":
      return (
        <span
          className="break-all text-[11px] text-error"
          title={state.reason}
        >
          安装失败：{state.reason.slice(0, 80)}
          {state.reason.length > 80 && "…"}
        </span>
      );
    case "already_exists":
      // Handled by the dedicated row component; the button itself
      // shouldn't render in this state.
      return null;
  }
}

/**
 * Three-way decision row that replaces the install button when the
 * target file already exists. Mirrors macOS Finder's "Replace /
 * Keep Both / Cancel" pattern but for a single file the choice
 * collapses to 保留 / 覆盖 / 取消 (no "keep both" — the SOP filename
 * is fixed per CLAUDE.md exception). 覆盖 is the destructive option;
 * variant=danger makes that visually explicit.
 */
function SopAlreadyExistsRow({
  path,
  onKeep,
  onOverwrite,
  onCancel,
}: {
  path: string;
  onKeep: () => void;
  onOverwrite: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mt-3 space-y-2">
      <p
        className="break-all text-[12px] text-ink-soft"
        title={path}
      >
        已存在：<code className="font-mono">{path}</code>
      </p>
      <div className="flex items-center gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={onKeep}>
          保留现有
        </Button>
        <Button
          type="button"
          variant="destructive-soft"
          size="sm"
          onClick={onOverwrite}
        >
          覆盖
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          取消
        </Button>
      </div>
    </div>
  );
}

import { MagnifyingGlass, Plus } from "@phosphor-icons/react";

import { useCopy } from "@/lib/i18n";
import { formatShortcut } from "@/lib/shortcuts";


export function SidebarQuickActions({
  onNewChat,
  onSearch,
  activeProjectName,
}: {
  onNewChat?: () => void;
  onSearch?: () => void;
  /** When set, the "+ New Chat" label appends project context so the
   * user knows the first message will be filed into that project.
   * Without this hint the action was technically correct but
   * invisibly so. */
  activeProjectName?: string;
}) {
  const copy = useCopy();
  const newChatLabel = activeProjectName
    ? copy.sidebar.newConversationInProject(activeProjectName)
    : copy.sidebar.newConversation;
  return (
    <div className="border-b border-line/70 py-1">
      <QuickAction
        icon={<Plus size={14} weight="thin" />}
        label={newChatLabel}
        hint={formatShortcut("Mod+N")}
        onClick={onNewChat}
      />
      <QuickAction
        icon={<MagnifyingGlass size={14} weight="thin" />}
        label={copy.sidebar.search}
        hint={formatShortcut("Mod+K")}
        onClick={onSearch}
      />
    </div>
  );
}


function QuickAction({
  icon,
  label,
  hint,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mx-1.5 flex w-[calc(100%-12px)] cursor-pointer items-center gap-2.5 rounded-sm px-3 py-2 text-left text-[13px] text-ink transition-colors hover:bg-hover"
    >
      <span className="shrink-0 text-ink-soft">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {hint && (
        <span className="shrink-0 text-[11px] text-ink-muted">{hint}</span>
      )}
    </button>
  );
}

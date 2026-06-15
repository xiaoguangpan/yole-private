import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  ArrowDown,
  ArrowsInLineVertical,
  ArrowsOutLineVertical,
  CaretDown,
  CaretRight,
  Check,
  Clock,
  DotsThree,
  Folder,
  FolderOpen,
  FolderPlus,
  ListBullets,
  PencilSimple,
  Plus,
  PushPin,
  PushPinSlash,
  SortAscending,
  Trash,
} from "@phosphor-icons/react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import type { ReactNode } from "react";

import { IconTooltip } from "@/components/ui/tooltip";
import { useCopy } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { Project, Session } from "@/types/session";

import { SidebarSessionRow } from "./SidebarSessionRow";
import type { ProjectScopePhase } from "./types";

export function SidebarProjectReviewPresence({
  phase,
  children,
}: {
  phase: ProjectScopePhase;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none",
        phase === "entered" && "translate-y-0 opacity-100",
        phase === "entering" && "-translate-y-1 opacity-0",
        phase === "exiting" && "-translate-y-1 opacity-0",
      )}
    >
      {children}
    </div>
  );
}

export function SidebarProjectReview({
  projects,
  sessionsByProjectId,
  open,
  allProjectSessionsExpanded,
  expandedProjectIds,
  activeId,
  petAttachedSessionId,
  onToggleOpen,
  onToggleAllProjectSessions,
  onNewProject,
  onToggleProjectExpanded,
  onStartProjectConversation,
  onSelectSession,
  onArchiveSession,
  onTogglePinSession,
  onAssignSessionToProject,
  editingSessionId,
  onRequestRename,
  onConfirmRename,
  onCancelRename,
  onTogglePinProject,
  onEditProject,
  onDeleteProject,
}: {
  projects: Project[];
  sessionsByProjectId: Map<string, Session[]>;
  open: boolean;
  allProjectSessionsExpanded: boolean;
  expandedProjectIds: Set<string>;
  activeId?: string;
  petAttachedSessionId?: string | null;
  onToggleOpen?: () => void;
  onToggleAllProjectSessions?: () => void;
  onNewProject?: () => void;
  onToggleProjectExpanded?: (id: string) => void;
  onStartProjectConversation?: (id: string) => void;
  onSelectSession?: (id: string) => void;
  onArchiveSession?: (id: string) => void;
  onTogglePinSession?: (id: string) => void;
  onAssignSessionToProject?: (
    sessionId: string,
    projectId: string | null,
  ) => void;
  editingSessionId?: string | null;
  onRequestRename?: (id: string) => void;
  onConfirmRename: (id: string, newTitle: string) => void;
  onCancelRename: () => void;
  onTogglePinProject?: (id: string) => void;
  onEditProject?: (id: string) => void;
  onDeleteProject?: (id: string) => void;
}) {
  const copy = useCopy();
  const toggleAllLabel = allProjectSessionsExpanded
    ? copy.sidebar.collapseProjectConversations
    : copy.sidebar.expandProjectConversations;
  const ToggleAllIcon = allProjectSessionsExpanded
    ? ArrowsInLineVertical
    : ArrowsOutLineVertical;

  return (
    <section className="pb-2 pt-1">
      <div className="group/project-header flex h-8 items-center gap-1 px-3">
        <button
          type="button"
          onClick={onToggleOpen}
          aria-expanded={open}
          className={cn(
            "flex min-w-0 items-center gap-1 rounded-sm py-1 text-left text-[12px] font-medium text-ink-muted",
            "transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30",
          )}
        >
          <span>{copy.sidebar.projects}</span>
          <CaretDown
            size={11}
            weight="bold"
            className={cn("transition-transform", !open && "-rotate-90")}
          />
        </button>
        <div
          className={cn(
            "ml-auto flex items-center gap-0.5 opacity-0 transition-opacity",
            "group-hover/project-header:opacity-100 focus-within:opacity-100",
          )}
        >
          <IconTooltip text={toggleAllLabel}>
            <button
              type="button"
              onClick={onToggleAllProjectSessions}
              disabled={!open || projects.length === 0}
              aria-label={toggleAllLabel}
              className={cn(
                "inline-flex size-6 items-center justify-center rounded-sm text-ink-muted transition-colors",
                "hover:bg-hover hover:text-ink disabled:cursor-default disabled:opacity-40",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30",
              )}
            >
              <ToggleAllIcon size={13} weight="thin" />
            </button>
          </IconTooltip>
          <ProjectMoreMenu />
          <IconTooltip text={copy.sidebar.newProject}>
            <button
              type="button"
              onClick={onNewProject}
              aria-label={copy.sidebar.newProject}
              className={cn(
                "inline-flex size-6 items-center justify-center rounded-sm text-ink-muted transition-colors",
                "hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30",
              )}
            >
              <FolderPlus size={14} weight="thin" />
            </button>
          </IconTooltip>
        </div>
      </div>

      {open &&
        (projects.length === 0 ? (
          <div className="px-5 py-2 text-[12px] italic text-ink-muted">
            {copy.sidebar.noProjects}
          </div>
        ) : (
          <div className="space-y-0.5">
            {projects.map((project) => {
              const expanded = expandedProjectIds.has(project.id);
              return (
                <div key={project.id}>
                  <SidebarProjectRow
                    project={project}
                    expanded={expanded}
                    onClick={() => onToggleProjectExpanded?.(project.id)}
                    onStartConversation={
                      onStartProjectConversation
                        ? () => onStartProjectConversation(project.id)
                        : undefined
                    }
                    onTogglePin={
                      onTogglePinProject
                        ? () => onTogglePinProject(project.id)
                        : undefined
                    }
                    onEdit={
                      onEditProject ? () => onEditProject(project.id) : undefined
                    }
                    onDelete={
                      onDeleteProject
                        ? () => onDeleteProject(project.id)
                        : undefined
                    }
                  />
                  <SidebarProjectSessionList
                    expanded={expanded}
                    project={project}
                    projects={projects}
                    sessions={sessionsByProjectId.get(project.id) ?? []}
                    activeId={activeId}
                    petAttachedSessionId={petAttachedSessionId}
                    onSelectSession={onSelectSession}
                    onArchiveSession={onArchiveSession}
                    onTogglePinSession={onTogglePinSession}
                    onAssignSessionToProject={onAssignSessionToProject}
                    editingSessionId={editingSessionId}
                    onStartProjectConversation={
                      onStartProjectConversation
                        ? () => onStartProjectConversation(project.id)
                        : undefined
                    }
                    onRequestRename={onRequestRename}
                    onConfirmRename={onConfirmRename}
                    onCancelRename={onCancelRename}
                  />
                </div>
              );
            })}
          </div>
        ))}
    </section>
  );
}

function ProjectMoreMenu() {
  const copy = useCopy();
  const itemClass = cn(
    "flex cursor-pointer items-center gap-2 rounded-sm px-2.5 py-1.5 text-[12.5px] text-ink-soft outline-none transition-colors",
    "data-[highlighted]:bg-hover data-[highlighted]:text-ink",
  );
  const subContentClass =
    "z-50 min-w-[160px] rounded-md border border-line bg-elevated p-1 shadow-elevated";

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={copy.sidebar.projectMenu}
          className={cn(
            "inline-flex size-6 items-center justify-center rounded-sm text-ink-muted transition-colors",
            "hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30",
            "data-[state=open]:bg-hover data-[state=open]:text-ink",
          )}
        >
          <DotsThree size={16} weight="bold" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={5}
          className="z-50 min-w-[176px] rounded-md border border-line bg-elevated p-1 shadow-elevated"
        >
          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger
              className={cn(
                itemClass,
                "data-[state=open]:bg-hover data-[state=open]:text-ink",
              )}
            >
              <ListBullets size={13} weight="thin" />
              {copy.sidebar.organizeSidebar}
              <CaretRight size={10} weight="thin" className="ml-auto" />
            </DropdownMenu.SubTrigger>
            <DropdownMenu.Portal>
              <DropdownMenu.SubContent
                sideOffset={4}
                className={subContentClass}
              >
                <DropdownMenu.Item className={itemClass}>
                  <Folder size={13} weight="thin" />
                  {copy.sidebar.organizeByProject}
                  <Check size={11} weight="bold" className="ml-auto" />
                </DropdownMenu.Item>
                <DropdownMenu.Item className={itemClass}>
                  <FolderOpen size={13} weight="thin" />
                  {copy.sidebar.organizeRecentProjects}
                </DropdownMenu.Item>
                <DropdownMenu.Item className={itemClass}>
                  <Clock size={13} weight="thin" />
                  {copy.sidebar.organizeByTime}
                </DropdownMenu.Item>
                <DropdownMenu.Item className={itemClass}>
                  <ArrowDown size={13} weight="thin" />
                  {copy.sidebar.organizeMoveDown}
                </DropdownMenu.Item>
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </DropdownMenu.Sub>
          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger
              className={cn(
                itemClass,
                "data-[state=open]:bg-hover data-[state=open]:text-ink",
              )}
            >
              <SortAscending size={13} weight="thin" />
              {copy.sidebar.sortSidebar}
              <CaretRight size={10} weight="thin" className="ml-auto" />
            </DropdownMenu.SubTrigger>
            <DropdownMenu.Portal>
              <DropdownMenu.SubContent
                sideOffset={4}
                className={subContentClass}
              >
                <DropdownMenu.Item className={itemClass}>
                  <Clock size={13} weight="thin" />
                  {copy.sidebar.sortByCreatedAt}
                </DropdownMenu.Item>
                <DropdownMenu.Item className={itemClass}>
                  <Clock size={13} weight="thin" />
                  {copy.sidebar.sortByUpdatedAt}
                  <Check size={11} weight="bold" className="ml-auto" />
                </DropdownMenu.Item>
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </DropdownMenu.Sub>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function SidebarProjectRow({
  project,
  expanded,
  onClick,
  onStartConversation,
  onTogglePin,
  onEdit,
  onDelete,
}: {
  project: Project;
  expanded?: boolean;
  onClick?: () => void;
  onStartConversation?: () => void;
  onTogglePin?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const copy = useCopy();
  const ProjectIcon = expanded ? FolderOpen : Folder;
  const newConversationTitle = copy.sidebar.newConversationInProjectTitle(
    project.name,
  );

  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
      className={cn(
        "group/project-row mx-1.5 grid min-h-8 w-[calc(100%-12px)] cursor-pointer grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-2 rounded-md px-2.5 py-1",
        "text-left text-[13px] text-ink-soft outline-none transition-[background-color,color]",
        "hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-brand/30",
      )}
    >
      <ProjectIcon
        size={15}
        weight="thin"
        className={cn(
          "shrink-0 transition-colors",
          expanded ? "text-ink-soft" : "text-ink-muted",
        )}
      />
      <span className="min-w-0 truncate">{project.name}</span>
      <div
        className={cn(
          "flex items-center gap-0.5 opacity-0 transition-opacity",
          "group-hover/project-row:opacity-100 focus-within:opacity-100",
        )}
      >
        <ProjectRowMenu
          project={project}
          onTogglePin={onTogglePin}
          onEdit={onEdit}
          onDelete={onDelete}
        />
        {onStartConversation && (
          <IconTooltip text={newConversationTitle}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onStartConversation();
              }}
              aria-label={newConversationTitle}
              className="inline-flex size-6 items-center justify-center rounded-sm text-ink-muted transition-colors hover:bg-selected hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
            >
              <PencilSimple size={13} weight="thin" />
            </button>
          </IconTooltip>
        )}
      </div>
    </div>
  );
}

function ProjectRowMenu({
  project,
  onTogglePin,
  onEdit,
  onDelete,
}: {
  project: Project;
  onTogglePin?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const copy = useCopy();
  const itemClass = cn(
    "flex cursor-pointer items-center gap-2 rounded-sm px-2.5 py-1.5 text-[12.5px] text-ink-soft outline-none transition-colors",
    "data-[highlighted]:bg-hover data-[highlighted]:text-ink",
    "data-[disabled]:cursor-default data-[disabled]:opacity-45",
  );
  const destructiveItemClass = cn(
    "flex cursor-pointer items-center gap-2 rounded-sm px-2.5 py-1.5 text-[12.5px] text-error outline-none transition-colors",
    "data-[highlighted]:bg-error/10 data-[highlighted]:text-error",
  );
  const openProjectFolder = () => {
    const rootPath = project.rootPath?.trim();
    if (!rootPath) return;
    void revealItemInDir(rootPath);
  };

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={copy.sidebar.projectMenu}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "inline-flex size-6 items-center justify-center rounded-sm text-ink-muted transition-colors",
            "hover:bg-selected hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30",
            "data-[state=open]:bg-selected data-[state=open]:text-ink",
          )}
        >
          <DotsThree size={16} weight="bold" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={5}
          onClick={(e) => e.stopPropagation()}
          className="z-50 min-w-[176px] rounded-md border border-line bg-elevated p-1 shadow-elevated"
        >
          {onTogglePin && (
            <DropdownMenu.Item onSelect={onTogglePin} className={itemClass}>
              {project.pinned ? (
                <PushPinSlash size={13} weight="thin" />
              ) : (
                <PushPin size={13} weight="thin" />
              )}
              {project.pinned ? copy.sidebar.unpinProject : copy.sidebar.pinProject}
            </DropdownMenu.Item>
          )}
          <DropdownMenu.Item
            onSelect={openProjectFolder}
            disabled={!project.rootPath?.trim()}
            className={itemClass}
          >
            <FolderOpen size={13} weight="thin" />
            {copy.sidebar.openProjectInExplorer}
          </DropdownMenu.Item>
          {onEdit && (
            <DropdownMenu.Item onSelect={onEdit} className={itemClass}>
              <PencilSimple size={13} weight="thin" />
              {copy.sidebar.renameProject}
            </DropdownMenu.Item>
          )}
          {onDelete && (
            <>
              <DropdownMenu.Separator className="my-1 h-px bg-line" />
              <DropdownMenu.Item
                onSelect={onDelete}
                className={destructiveItemClass}
              >
                <Trash size={13} weight="thin" />
                {copy.sidebar.removeProject}
              </DropdownMenu.Item>
            </>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function SidebarProjectSessionList({
  expanded,
  project,
  projects,
  sessions,
  activeId,
  petAttachedSessionId,
  onSelectSession,
  onArchiveSession,
  onTogglePinSession,
  onAssignSessionToProject,
  editingSessionId,
  onStartProjectConversation,
  onRequestRename,
  onConfirmRename,
  onCancelRename,
}: {
  expanded: boolean;
  project: Project;
  projects: Project[];
  sessions: Session[];
  activeId?: string;
  petAttachedSessionId?: string | null;
  onSelectSession?: (id: string) => void;
  onArchiveSession?: (id: string) => void;
  onTogglePinSession?: (id: string) => void;
  onAssignSessionToProject?: (
    sessionId: string,
    projectId: string | null,
  ) => void;
  editingSessionId?: string | null;
  onStartProjectConversation?: () => void;
  onRequestRename?: (id: string) => void;
  onConfirmRename: (id: string, newTitle: string) => void;
  onCancelRename: () => void;
}) {
  return (
    <div
      className={cn(
        "grid overflow-hidden transition-[grid-template-rows] duration-150 ease-out motion-reduce:transition-none",
        expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
      )}
    >
      <div className="min-h-0 overflow-hidden">
        <div
          className={cn(
            "pb-1",
            "transition-opacity duration-100",
            expanded ? "opacity-100" : "pointer-events-none opacity-0",
          )}
        >
          {sessions.length === 0 ? (
            <SidebarProjectEmptyHint
              project={project}
              onStartProjectConversation={onStartProjectConversation}
            />
          ) : (
            sessions.map((session) => (
              <SidebarSessionRow
                key={session.id}
                session={session}
                active={session.id === activeId}
                petAttached={session.id === petAttachedSessionId}
                projects={projects}
                nestedProject
                onClick={() => onSelectSession?.(session.id)}
                onArchive={
                  onArchiveSession
                    ? () => onArchiveSession(session.id)
                    : undefined
                }
                onTogglePin={
                  onTogglePinSession
                    ? () => onTogglePinSession(session.id)
                    : undefined
                }
                onRemoveFromProject={
                  onAssignSessionToProject
                    ? () => onAssignSessionToProject(session.id, null)
                    : undefined
                }
                isEditing={editingSessionId === session.id}
                onRequestRename={
                  onRequestRename
                    ? () => onRequestRename(session.id)
                    : undefined
                }
                onConfirmRename={(newTitle) =>
                  onConfirmRename(session.id, newTitle)
                }
                onCancelRename={onCancelRename}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function SidebarProjectEmptyHint({
  project,
  onStartProjectConversation,
}: {
  project: Project;
  onStartProjectConversation?: () => void;
}) {
  const copy = useCopy();
  const label = copy.sidebar.newProjectConversation;
  const newConversationTitle = copy.sidebar.newConversationInProjectTitle(
    project.name,
  );
  if (!onStartProjectConversation) {
    return (
      <div className="mx-1.5 flex h-8 w-[calc(100%-12px)] items-center gap-2 rounded-md py-1 pl-8 pr-2.5 text-[12px] text-ink-muted">
        <Plus size={12} weight="thin" className="shrink-0" />
        <span className="min-w-0 flex-1 truncate">{label}</span>
      </div>
    );
  }

  return (
    <IconTooltip text={newConversationTitle}>
      <button
        type="button"
        onClick={onStartProjectConversation}
        aria-label={newConversationTitle}
        className={cn(
          "mx-1.5 flex h-8 w-[calc(100%-12px)] cursor-pointer items-center gap-2 rounded-md py-1 pl-8 pr-2.5 text-left",
          "text-[12px] font-medium text-ink-muted transition-colors hover:bg-hover hover:text-ink",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30",
        )}
      >
        <Plus size={12} weight="thin" className="shrink-0" />
        <span className="min-w-0 flex-1 truncate">{label}</span>
      </button>
    </IconTooltip>
  );
}

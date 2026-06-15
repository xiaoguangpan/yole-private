import { useMemo, useState } from "react";

import { useCopy } from "@/lib/i18n";
import { sortProjectsForNavigation } from "@/lib/projects";
import { groupSessions } from "@/lib/sessions";
import type { Project, Session } from "@/types/session";

import { SidebarFooter } from "./sidebar/SidebarFooter";
import { SidebarHeader } from "./sidebar/SidebarHeader";
import { SidebarQuickActions } from "./sidebar/SidebarQuickActions";
import {
  SidebarProjectReview,
  SidebarProjectReviewPresence,
} from "./sidebar/SidebarProjectReview";
import {
  SidebarSectionLabel,
  SidebarTimelineBuckets,
} from "./sidebar/SidebarTimeline";
import type { SidebarRuntimeIndicator } from "./sidebar/types";

export type { SidebarRuntimeIndicator } from "./sidebar/types";

export interface SidebarProps {
  sessions: Session[];
  projects?: Project[];
  activeId?: string;
  activeProjectFilter?: string;
  projectViewOpen?: boolean;
  expandedProjectIds?: string[];
  runtimeIndicator?: SidebarRuntimeIndicator;
  onSelectSession?: (id: string) => void;
  onNewChat?: () => void;
  onSearch?: () => void;
  onNewProject?: () => void;
  onToggleProjectView?: () => void;
  onToggleProjectExpanded?: (id: string) => void;
  onToggleAllProjectSessions?: () => void;
  onStartProjectConversation?: (id: string) => void;
  onArchiveSession?: (id: string) => void;
  onRenameSession?: (id: string, newTitle: string) => void;
  onTogglePinSession?: (id: string) => void;
  onAssignSessionToProject?: (
    sessionId: string,
    projectId: string | null,
  ) => void;
  onTogglePinProject?: (id: string) => void;
  onEditProject?: (id: string) => void;
  onDeleteProject?: (id: string) => void;
  onOpenEarlier?: () => void;
  onOpenArchived?: () => void;
  archivedCount?: number;
  onOpenRuntimeSettings?: () => void;
  onOpenModelsSettings?: () => void;
  onOpenAgentSettings?: () => void;
  petAttachedSessionId?: string | null;
}

export function Sidebar({
  sessions,
  projects = [],
  activeId,
  activeProjectFilter,
  projectViewOpen = false,
  expandedProjectIds = [],
  runtimeIndicator = "hidden",
  onSelectSession,
  onNewChat,
  onSearch,
  onNewProject,
  onToggleProjectView,
  onToggleProjectExpanded,
  onToggleAllProjectSessions,
  onStartProjectConversation,
  onArchiveSession,
  onRenameSession,
  onTogglePinSession,
  onAssignSessionToProject,
  onTogglePinProject,
  onEditProject,
  onDeleteProject,
  onOpenEarlier,
  onOpenArchived,
  archivedCount = 0,
  onOpenRuntimeSettings,
  onOpenModelsSettings,
  onOpenAgentSettings,
  petAttachedSessionId,
}: SidebarProps) {
  const copy = useCopy();
  const activeProject = activeProjectFilter
    ? projects.find((p) => p.id === activeProjectFilter)
    : undefined;

  const navigationProjects = useMemo(
    () => sortProjectsForNavigation(projects, sessions),
    [projects, sessions],
  );
  const projectSessionsById = useMemo(() => {
    const byId = new Map<string, Session[]>();
    for (const session of sessions) {
      if (!session.projectId) continue;
      const group = byId.get(session.projectId);
      if (group) group.push(session);
      else byId.set(session.projectId, [session]);
    }
    return byId;
  }, [sessions]);
  const expandedProjectIdSet = useMemo(
    () => new Set(expandedProjectIds),
    [expandedProjectIds],
  );
  const allProjectSessionsExpanded =
    navigationProjects.length > 0 &&
    navigationProjects.every((project) => expandedProjectIdSet.has(project.id));
  const conversationSessions = useMemo(
    () => sessions.filter((session) => !session.projectId),
    [sessions],
  );
  const conversationBuckets = useMemo(
    () => groupSessions(conversationSessions),
    [conversationSessions],
  );
  const conversationEmpty = conversationSessions.length === 0;
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);

  const requestRename = onRenameSession
    ? (id: string) => setEditingSessionId(id)
    : undefined;
  const confirmRename = (id: string, newTitle: string) => {
    onRenameSession?.(id, newTitle);
    setEditingSessionId(null);
  };
  const cancelRename = () => setEditingSessionId(null);

  return (
    <div className="flex h-full flex-col bg-app text-[13px] text-ink">
      <SidebarHeader
        runtimeIndicator={runtimeIndicator}
        onOpenRuntimeSettings={onOpenRuntimeSettings}
        onOpenModelsSettings={onOpenModelsSettings}
        onOpenAgentSettings={onOpenAgentSettings}
      />
      <SidebarQuickActions
        onNewChat={onNewChat}
        onSearch={onSearch}
        activeProjectName={activeProject?.name}
      />

      <div className="min-h-0 flex-1 overflow-y-auto pb-2">
        <SidebarProjectReviewPresence phase="entered">
          <SidebarProjectReview
            projects={navigationProjects}
            sessionsByProjectId={projectSessionsById}
            open={projectViewOpen}
            allProjectSessionsExpanded={allProjectSessionsExpanded}
            expandedProjectIds={expandedProjectIdSet}
            activeId={activeId}
            petAttachedSessionId={petAttachedSessionId}
            onToggleOpen={onToggleProjectView}
            onToggleAllProjectSessions={onToggleAllProjectSessions}
            onNewProject={onNewProject}
            onToggleProjectExpanded={onToggleProjectExpanded}
            onStartProjectConversation={onStartProjectConversation}
            onSelectSession={onSelectSession}
            onArchiveSession={onArchiveSession}
            onTogglePinSession={onTogglePinSession}
            onAssignSessionToProject={onAssignSessionToProject}
            editingSessionId={editingSessionId}
            onRequestRename={requestRename}
            onConfirmRename={confirmRename}
            onCancelRename={cancelRename}
            onTogglePinProject={onTogglePinProject}
            onEditProject={onEditProject}
            onDeleteProject={onDeleteProject}
          />
        </SidebarProjectReviewPresence>

        <SidebarSectionLabel>{copy.sidebar.conversations}</SidebarSectionLabel>
        {conversationEmpty ? (
          <div className="px-5 py-2 text-[12.5px] italic text-ink-muted">
            {copy.sidebar.emptySessions}
          </div>
        ) : (
          <SidebarTimelineBuckets
            buckets={conversationBuckets}
            activeId={activeId}
            projects={navigationProjects}
            petAttachedSessionId={petAttachedSessionId}
            collapseEarlier={false}
            hideBucketLabels
            onSelectSession={onSelectSession}
            onArchiveSession={onArchiveSession}
            onTogglePinSession={onTogglePinSession}
            onAssignSessionToProject={onAssignSessionToProject}
            editingSessionId={editingSessionId}
            onOpenEarlier={onOpenEarlier}
            onRequestRename={requestRename}
            onConfirmRename={confirmRename}
            onCancelRename={cancelRename}
          />
        )}
      </div>

      <SidebarFooter count={archivedCount} onOpenArchived={onOpenArchived} />
    </div>
  );
}

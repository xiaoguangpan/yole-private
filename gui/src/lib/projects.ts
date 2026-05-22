import type { Project, Session } from "@/types/session";

/**
 * Project recency is content recency, not management recency.
 * Empty projects use createdAt so a newly created drawer stays visible;
 * archived sessions do not keep a project artificially fresh.
 */
export function effectiveProjectActivityAt(
  project: Project,
  sessions: Session[],
): string {
  let activityAt = project.createdAt;
  for (const session of sessions) {
    if (session.projectId !== project.id || session.status === "archived") {
      continue;
    }
    if (session.lastActivityAt > activityAt) {
      activityAt = session.lastActivityAt;
    }
  }
  return activityAt;
}

export function sortProjectsForNavigation(
  projects: Project[],
  sessions: Session[],
): Project[] {
  const activityById = new Map(
    projects.map((project) => [
      project.id,
      effectiveProjectActivityAt(project, sessions),
    ]),
  );

  return [...projects].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    const activityCompare = (
      activityById.get(b.id) ?? b.createdAt
    ).localeCompare(activityById.get(a.id) ?? a.createdAt);
    if (activityCompare !== 0) return activityCompare;
    return a.name.localeCompare(b.name, undefined, {
      sensitivity: "base",
    });
  });
}

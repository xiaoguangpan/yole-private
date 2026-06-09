# Project Review sidebar UX

**Date**: 2026-05-22
**Status**: Implemented and dogfood-reviewed
**Related**: [DESIGN.md](../DESIGN.md), [agent-api](../agent-api.md)

## Context

This session started as a visual consistency pass for Yole: fonts, button
styles, Settings buttons, sidebar affordances, and conversation controls. The
largest product decision emerged around Projects.

The old Projects surface treated a project click as a sidebar filter. That
worked while project count was small, but it created several UX problems:

- the project row and filter banner repeated the same name;
- the inline Projects list was capped and would not scale to many projects;
- clicking a project with an already-open empty new chat could feel like a
  broken button;
- project creation, project expansion, and project-scoped conversation creation
  were mixed together;
- users needed a way to monitor several projects at once, not just enter one
  project as a single selected filter.

## Decisions

- Projects are now entered through the top quick action row, alongside New Chat
  and Search. The old inline Projects section and ProjectsDialog are removed.
- Project Review is a sidebar mode. Entering it hides the ordinary timeline and
  shows the complete project list; clicking the same quick action exits it.
- Project rows expand and collapse independently. Multiple projects can stay
  open at once so the user can monitor work across projects.
- Project Review groups projects by activity: pinned or recently active
  projects are shown under Active Projects, while older projects live under a
  collapsed Older Projects group.
- Project activity means content activity, not management activity. Sorting and
  API output use non-archived session `lastActivityAt`; empty projects fall back
  to `createdAt`.
- Creating a project opens Project Review and expands that new project. It does
  not implicitly create a conversation.
- Creating a project conversation is a separate action: the project row's
  contextual `+` or the empty-project CTA opens a project-aware EmptyState.
- Project-aware EmptyState hides the global prompt suggestions. Inside a
  project, the user already has context; generic showcase prompts add noise.
- The project-scoped new-chat context is one-shot. The first submitted message
  creates the session inside that project, then App clears the pending project
  context. Normal New Chat and opening existing sessions also clear it.
- Assigning an existing conversation to a project now gives a toast with a
  "View project" action, so users get immediate confirmation instead of needing
  to manually inspect the project list.
- The right-side project `+` uses a lightweight bare-icon style with a larger
  transparent hit area. The top Project quick action `+` follows the same visual
  rule.
- Project Review mode transitions are animated as a sidebar mode switch:
  Project Review lightly expands/fades in while the ordinary timeline fades
  down; exit keeps Project Review mounted briefly so it can collapse/fade out.

## Rejected Alternatives

- **Keep the old Project filter banner** — rejected because it duplicated the
  selected project row and made one-project states look stacked.
- **Limit sidebar projects to 8 plus "view all"** — rejected because Project
  Review should be the full monitoring surface, not a truncated shortcut.
- **Use the Projects header as the Project View toggle** — rejected after review;
  moving the entry into Quick Actions gives it the same mental level as New Chat
  and Search.
- **Use visible helper copy such as "click again to exit"** — rejected as
  tutorial text that becomes permanent noise. The quick action uses selected
  state plus tooltip / aria-label instead.
- **Change the active quick action label to "Exit Project View"** — rejected for
  now because the row should remain a stable navigation item. The label stays
  "项目"; hover/title communicates the exit action.
- **Keep the row `+` as a boxed soft button** — rejected because a full column
  of boxed `+` buttons made the sidebar feel heavy. The final style keeps a
  larger hit area without visual bulk.
- **Show global prompt suggestions in project new chat** — rejected because
  project entry already carries intent, and the generic suggestions compete with
  that intent.

## Open Questions

- The active project row highlight currently also indicates the right pane's
  project-aware new-chat context. Dogfood accepted this once explained, but if
  future users read it as "expanded," the visual language may need a subtler
  secondary indicator.
- Project Review transition timing may need one more tuning pass after daily
  use; current timing favors a quiet yole over a pronounced page-change
  animation.
- If projects grow into dozens or hundreds, Older Projects may need search
  inside Project Review rather than a separate dialog.

## Next

- Continue dogfooding Project Review with several real projects and running
  sessions.
- If the project-aware new-chat context remains visually ambiguous, test a small
  inline context marker that does not compete with expansion state.

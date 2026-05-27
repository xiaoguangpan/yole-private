# Project Batch Follow

**Date:** 2026-05-27  
**Status:** Implemented  
**Related:** `cli/src/main.rs`, `docs/agent-api.md`, `docs/integrations/galley-supervisor-sop.md`

## Context

Supervisor agents need a reliable way to split one complex user goal into
several Galley sessions, watch progress, and synthesize the results. Galley
already has Projects, so adding a separate Task Group concept would create
product vocabulary before dogfood proves it is needed.

## Decisions

- Use Project as the visible batch container for Supervisor-created parallel
  work.
- Keep `session watch` live-only. Its low-level meaning stays "events after
  subscribe time".
- Add `session follow` as the supervisor-friendly wrapper: initial SQLite
  snapshot, live events if available, final snapshot.
- Add `project brief` and `project show` so supervisors can get batch state
  and transcript tails without hand-written loops.
- Add `project follow` to merge live events for sessions in a Project while
  keeping quiet not-live results from idle/completed sessions out of the stream.
- Treat no live runner as a stream outcome, not a process failure, for
  `follow` commands.

## Rejected Alternatives

- New `TaskGroup` / `Batch` data model: rejected until Project-based dogfood
  shows a concrete UX problem.
- Backlog inside `session watch`: rejected because mixing historical and live
  events would make low-level stream semantics ambiguous.
- `project archive`: deferred because it needs DB migration and GUI lifecycle
  design; batch monitoring should not pull in project lifecycle refactor.

## Open Questions

- Whether one-off Supervisor batch Projects need a future `kind` or
  lightweight archive after real usage.
- Whether `project follow` should eventually subscribe by runner registry
  instead of persisted live-status candidates.
- Whether GUI should surface Project batch summaries or leave synthesis to
  Supervisor agents.

## Next

Dogfood with a real multi-session Supervisor batch and watch whether Project
navigation stays understandable after several temporary batches accumulate.

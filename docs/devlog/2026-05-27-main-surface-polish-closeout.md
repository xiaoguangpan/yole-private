# 2026-05-27 — Main surface polish closeout

**Date:** 2026-05-27
**Status:** Implemented and dogfooded
**Related:** `docs/DESIGN.md`, `docs/devlog/2026-05-27-browser-control-managed-ga.md`, commits `90ee8c5`, `78f3a08`, `63120e3`, `940b908`

## Context

After Browser Control shipped as a managed-GA completion item, the main surface
needed a second pass. The first pass made core capabilities visible; dogfood
then exposed a different problem: once a capability is configured, the chrome
should become quiet again. Galley also had a few small but visible jumps in
conversation rendering and sidebar rhythm that made the app feel less settled
than the underlying behavior.

## Decisions

- Configured Browser Control should be almost silent. The TopBar entry uses the
  `PuzzlePiece` icon and removes the status dot once ready, so it reads as an
  available extension capability rather than an unread notification.
- Supervisor Agent entry belongs in the managed-mode sidebar header, not hidden
  only inside Settings. It is icon-only, tooltip-led, and jumps directly to
  Settings -> Agent because the actual setup artifact is the SOP copy, not a
  separate modal. Attach mode keeps the header space free for the external
  runtime indicator.
- Assistant narration and tool-call text should not visibly jump from body copy
  into final styling while streaming. The interim rendering now uses the same
  quiet typographic family as the final state.
- Diagnostic and setup text blocks should remain selectable. Users need to copy
  paths, errors, and permission messages; preventing selection makes repair
  flows feel broken.
- Product naming is sentence-case `Galley` across UI, docs, comments, and
  commit messages. The earlier all-caps wordmark made the sidebar feel heavier
  than the rest of the interface and created a second naming convention without
  enough benefit.
- Sidebar chrome should be lighter and denser: the header height, quick-action
  band, archive footer, TopBar bottom line, and sidebar/main divider now use
  quieter spacing and `border-line/70`-level separators.

## Rejected Alternatives

- **Keep configured capability indicators visually active** — helpful during
  onboarding, but after setup it keeps asking for attention when no action is
  needed.
- **Add a separate Supervisor modal** — heavier than the job. The user's next
  action is to copy the SOP, and Settings -> Agent already owns that content.
- **Preserve the all-caps `GALLEY` wordmark** — distinctive, but too loud in the
  current sidebar scale and inconsistent with the naming rules elsewhere.
- **Use explanatory text to justify every small control** — rejected in favor of
  quiet icons, tooltips, and stable placement. Main chrome should guide without
  reading like documentation.

## Dogfood Evidence

- Browser Control was configured, tested, and used to run the browser demo
  successfully. After that, removing the ready-state dot made the TopBar feel
  less like it had a pending notification.
- The assistant-message streaming style change reduced the visible transition
  when a response resolves from in-progress text to final answer styling.
- The sidebar header and divider changes were reviewed visually in the running
  app and felt calmer without reducing discoverability.

## Open Questions

- Whether the managed-mode Supervisor entry should eventually show readiness
  state after Galley can observe external agents actually using the SOP.
- Whether the sidebar product mark wants a custom drawn wordmark later, once
  the app has enough brand surface to justify it.

## Next

Keep dogfooding the quiet-ready principle across TopBar and sidebar controls:
strong guidance before setup, calm presence after success, and no permanent
attention markers unless the user has something actionable to do.

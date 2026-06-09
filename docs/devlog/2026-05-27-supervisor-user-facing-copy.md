# Supervisor User-Facing Copy

**Date:** 2026-05-27  
**Status:** Implemented  
**Related:** `docs/integrations/yole-supervisor-sop.md`, `gui/src/components/screens/settings/SettingsIntegration.tsx`

## Context

The Supervisor SOP is copy-first: users often paste it into an external Agent
without reading it themselves. That means the external Agent needs stable
user-facing language for explaining what "using Yole through me" means. The
Settings -> Agent page also needed a tiny affordance so users can try the flow
without reading the full SOP.

## Decisions

- Treat "Yole mode" as user-facing shorthand, not a real system mode or
  state machine.
- Add a `User-Facing Yole Mode Copy` section to the Supervisor SOP with
  short intro copy, examples, safety boundaries, and "do not say" guidance.
- Use one name for the copied document in user-facing UI:
  `Yole Supervisor SOP`. Avoid mixing `Supervisor SOP` and `Agent SOP`.
- Define the target as a "local Supervisor Agent": GA behind an IM bot,
  OpenClaw, Hermes, Claude Code, Codex, or another trusted local Agent that can
  run commands on the same machine as Yole.
- Present WeChat, Feishu/Lark, Telegram, Discord, and similar services as chat
  entry points, not as the execution location. A purely cloud-hosted Agent
  cannot operate Yole CLI directly without a local runner or bridge.
- Revise the Settings -> Agent layout into two default sections:
  `Yole Supervisor SOP` explains what the copied SOP is and how to use it;
  `可以这样说` is a standalone example list.
- Add four copyable examples covering status check, continue with a non-coding
  work requirement, start one bounded coding investigation, and split a general
  travel-planning task. The example set should reflect Yole as a local
  agent-team orchestrator, not a coding-only product.
- Keep the prompt example copy buttons directly after each sentence, because
  the action is "copy this exact thing" rather than "manage a row."
- Fold Discovery file, CLI shortcut, and API docs under "Advanced options" by
  default. They are useful integration material, but ordinary users do not need
  them for the first successful Agent handoff.
- Keep Settings copy sparse. The page should help the user try the flow, not
  explain CLI, Project, session, or runner internals.

## Rejected Alternatives

- A real "Enter Yole Mode" product state: rejected because the Supervisor
  already has a SOP; a fake mode would confuse implementation and user
  expectations.
- A long tutorial inside Settings: rejected because the actual training
  material belongs in the copied SOP, not in the user-facing setup surface.
- Saying "I can control your computer": rejected as too broad and scarier than
  the actual boundary. The correct language is "manage local Agent sessions
  through Yole."

## Open Questions

- Whether the two Settings examples should later become personalized from
  recent Projects or sessions.
- Whether external IM adapters need their own shorter first-run copy.

## Next

Dogfood with a new user path: copy SOP, paste into an external Agent, then try
one Settings example verbatim.

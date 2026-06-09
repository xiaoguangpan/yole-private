# Session Progress + Model Settings Polish

## Date / Status / Related

- Date: 2026-05-26
- Status: implemented; closeout verification run in the same session
- Related:
  - `docs/DESIGN.md`
  - `docs/managed-ga-runtime.md`
  - `docs/agent-api.md`
  - `docs/ipc-protocol.md`
  - `core/migrations/013_session_llm_key.sql`

## Context

This session started from a subtle sidebar trust bug: a completed-unread dot
could appear before the model's final answer was actually visible. The product
question quickly widened into the whole multi-session scan surface: when users
run multiple tasks in parallel, the sidebar must make progress, completion,
and unread state legible at a glance without pretending to know exact model
progress.

The second half of the session moved through Settings -> Models polish. The
managed model setup had become functionally rich but visually noisy: provider
rows showed too many normal-state badges, edit forms jumped to the top, fetched
models used native selects and heavy enable buttons, and the configured-models
header mixed title, count, and explanatory text. The deeper correctness issue
was that sessions persisted selected models by list index, so model reorder or
provider config changes could make an old session point at the wrong model.

## Decisions

- Sidebar session state uses honest liveness rather than fake progress. Running
  sessions show activity; completed sessions only show unread once the run is
  actually complete.
- Conversation waiting feedback shows elapsed time after 3 seconds, but waits
  until 60 seconds before adding `仍在运行`. The timer is a liveness cue, while
  "still running" is a stronger long-wait reassurance.
- Settings toast is a top-level system feedback layer above Settings modals.
  It should confirm background state changes without being clipped by the
  current modal surface.
- Settings -> Models now treats Provider rows as quiet maintenance surfaces:
  no normal-state key icon, no `Key 已保存` badge, protocol badges are muted,
  and `检查` is secondary.
- `当前配置模型` keeps the header compact. The "new sessions use new models,
  active sessions need restart" rule lives in an Info tooltip and short toast,
  not as permanent body copy in the card header.
- Provider display name is a first-class optional field in both Settings and
  Onboarding. It is not hidden in "more", because it helps users distinguish
  official APIs, compatible endpoints, and relay providers.
- OpenAI and Anthropic provider picker entries explicitly mention official API
  or compatible endpoint. This matches real usage where many third-party
  endpoints speak those protocols.
- Fetched model selection uses Yole's custom dropdown, not the browser native
  select. Add / added states share the same row slot and visual weight so a
  long fetched list does not become a wall of buttons.
- Existing provider edit opens in place under that provider. New-provider
  creation stays at the top.
- Session model persistence now uses stable identity: managed sessions store
  `managed_models.id`; external sessions store the raw GA LLM name. Numeric
  index remains only as bridge command compatibility and old-row fallback.
- Model advanced config is deliberately narrow. First exposed fields are
  retry / timeout / stream plus protocol-specific compatibility knobs:
  OpenAI-compatible `api_mode` and `reasoning_effort`; Anthropic-compatible
  `thinking_type`, `reasoning_effort`, and `Claude Code 兼容透传`.
- `read_timeout` is standardized at 180 seconds. `thinking_budget_tokens` is
  not exposed yet, so Anthropic-compatible `thinking_type` does not offer
  `enabled` in the first UI.
- Managed GA now reads `connect_timeout` explicitly; otherwise exposing that
  family of settings would give users a control that does not actually work.

## Rejected Alternatives

- A progress bar for sessions. It would look precise while the app cannot know
  real model progress; that creates a trust problem.
- A permanent explanatory sentence in the configured-models header. It made the
  card feel busy and forced a setup rule into the primary scan surface.
- Showing "Key saved" as a normal-state badge. The absence of credential
  problems should be quiet; only missing or invalid key states deserve visual
  attention.
- Persisting only the model index because it was already present. Index is a
  transport detail, not durable identity.
- Exposing the full `mykey.py` surface in Settings. That would turn the model
  editor into a config-file UI and make ordinary setup feel technical.
- Opening `thinking_type=enabled` without `thinking_budget_tokens`. GA ignores
  that combination, so the UI would invite a setting that silently fails.

## Open Questions

- Provider ordering is not user-editable yet. Keep it until real usage shows
  that provider order, not model order, is the pain.
- Advanced config may eventually need provider-specific presets beyond protocol
  defaults, but only after enough failures show which knobs matter.
- Onboarding still intentionally hides advanced model parameters; this should
  hold unless first-run setup starts failing for common compatible endpoints.

## Next

- Dogfood with several simultaneous sessions to confirm sidebar unread and
  running state feels reliable.
- Dogfood model reorder and app restart to confirm old sessions keep the
  intended model identity.
- Revisit advanced model config after real provider failures, not before.

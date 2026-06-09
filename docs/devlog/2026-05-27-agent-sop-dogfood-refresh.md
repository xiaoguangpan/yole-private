# Agent SOP dogfood refresh

## Date / Status / Related

- **Date**: 2026-05-27
- **Status**: Dogfood found and fixed three Agent API contract leaks; Supervisor
  SOP and Claude Skill guidance refreshed.
- **Related**:
  - [Supervisor SOP](../integrations/yole-supervisor-sop.md)
  - [agent-api](../agent-api.md)
  - [Supervisor provenance dogfood](./2026-05-21-supervisor-provenance-delegation-dogfood.md)

## Context

The goal was to test Yole's Agent surface end to end as a real Supervisor:
resolve the CLI through the discovery file, inspect current state, create a
dedicated test project/session, exercise session and project lifecycle commands,
verify error paths, and then tighten the Agent SOP based on what actually
happened.

This pass used the live `schemaVersion: 1` CLI and current local Yole data. It
created one dedicated managed test session and deleted the temporary project
after validating `project delete` detaches sessions instead of deleting them.

## Decisions

1. **SOP origin rule needs an exception**. Most write commands should include
   `--supervisor` and `--reason`, but `llm set` intentionally has no origin
   flags. The SOP now says "origin whenever supported" instead of "origin
   always".
2. **`session watch` must be taught as live-only**. Watch has no backlog and
   returns `not_found` when there is no live runner. The SOP now tells agents to
   run `session show --tail=20` first and fall back to `show` on no-runner.
3. **`persisted_only` is a user-facing distinction**. A Supervisor must report
   that the message or LLM choice was saved but not consumed by a runner, and
   must not resend the same instruction blindly.
4. **The Claude Skill hot path must not drift from the SOP**. The embedded
   reference SOP was refreshed, and `SKILL.md` now uses first-line discovery,
   current `session new` semantics, origin exceptions, and watch guidance.

## Fixes

- `session show` now projects message `origin` metadata from
  `created_via/supervisor/origin_note`, so CLI transcripts can prove which
  prompts came from a Supervisor.
- `session watch` no-runner errors now emit one CLI error envelope instead of
  printing both the socket envelope and the mapped CLI error.
- CLI/user messages written through `session send` and `session new` are now
  indexed into `messages_fts`, so `sessions search` can find Supervisor-created
  or Supervisor-sent prompts.
- The canonical SOP, the Claude Skill reference copy, and the Claude Skill hot
  path were updated together.

## Dogfood coverage

- Discovery file resolved to `core/target/debug/yole`, with
  `schema_version=1`; `yole version` returned `schemaVersion: 1`.
- Inventory covered `status`, `sessions list`, `sessions search`, `project
  list`, `llm list`, and `health`.
- `project create`, `session new --runtime=managed --project=... --llm=glm-5.1`,
  `session show`, `session send`, `session btw`, `session stop`, `llm set`,
  `session archive`, `session restore`, `session move`, and `project delete`
  were exercised on dedicated dogfood objects.
- Error paths covered schema mismatch, missing session, invalid status, unknown
  LLM, invalid `--runtime=all` for `session new`, no live runner for `watch`,
  and no live bridge for `/btw`.
- Successful `session watch` was validated with a managed session that ran
  `sleep 12; echo YOLE_WATCH_OK`; the stream delivered `turn_start`, tool
  progress, `turn_end`, `run_complete`, and the final answer. The watcher stayed
  open as designed until the client stopped the subscription.

## Rejected alternatives

- **Teach agents to parse around duplicate `watch` errors** — rejected. The CLI
  contract promises one error shape; the implementation should keep that promise.
- **Leave FTS indexing to assistant replies only** — rejected. Inventory before
  action depends on finding prompts the Supervisor previously created or sent.
- **Keep only the canonical SOP updated** — rejected because the Claude Skill
  reads its own hot path and embedded reference before a user ever opens the
  repository docs.

## Open questions

- The live Yole Core process needs a restart before the new user-message FTS
  indexing code affects socket writes in that running app instance.

## Next

1. Include this Agent SOP dogfood path in future beta smoke runs.
2. When convenient, restart Yole and re-run one `session send` plus
   `sessions search` check to confirm live Core picks up user-message FTS
   indexing.
3. Add the long-lived `session watch` stop/cleanup expectation to the dogfood
   checklist.

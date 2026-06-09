# 2026-05-22 - GA baseline upgrade b063518 -> 1a8abc4

**Date / Status**: 2026-05-22 / implemented as standalone baseline upgrade
**Related**: [GA baseline](../ga-baseline.md) · [previous upgrade](./2026-05-18-ga-baseline-upgrade-fc6b5ad-to-b063518.md)

## Context

JC asked to move Yole's GenericAgent baseline to the official latest commit.
Per the non-invasive contract, Yole did not fetch or modify
`~/Documents/GenericAgent`; it only read the local checkout and used
`git ls-remote https://github.com/lsdefine/GenericAgent.git` to verify that
official `main` points at `1a8abc4fda00d4324c41e148b64e2f3475114ade`.

The local GA checkout was already on that same commit:

```text
1a8abc4fda00d4324c41e148b64e2f3475114ade
2026-05-22T10:21:25+08:00
keychain: store SecretStr in _d for deep repr masking
```

`b063518..1a8abc4` contains 36 commits. Most are TUI v3, Feishu / Telegram /
WeChat frontend fixes, desktop installer docs, and key/config polish. One core
change matters to Yole: `agent_loop.py` replaced `BaseHandler.dispatch`'s
callback calls with `plugins.hooks`.

## Decisions

- **Lock Yole baseline to `1a8abc4`**, the official upstream `main` HEAD on
  2026-05-22.
- **Add a dispatch compatibility adapter**: approval remains in
  `YoleHandler.dispatch` before `super().dispatch`, so it was not broken.
  But live `turn_start` relied on `tool_before_callback`. Yole now detects
  whether the loaded GA dispatch still calls that callback; if not, it emits the
  same progress signal itself immediately before delegating to GA.
- **Do not adopt GA's new plugin hook system for Yole progress**. Hooks are
  global plugin infrastructure; using the local dispatch wrapper is narrower,
  easier to reason about, and keeps Yole's integration contained to the
  subclass it already owns.
- **No bundled Python dependency change**: `pyproject.toml` did not change in
  this delta.

## Audit

| Surface | File | Change | Verdict |
|---|---|---|---|
| `BaseHandler.dispatch` | `agent_loop.py` | `tool_before_callback` / `tool_after_callback` calls replaced with `plugins.hooks` triggers; signature still includes `tool_num` | **adapter needed** for `turn_start`; approval gate remains safe because it is outside `super()` |
| `agent_runner_loop` | `agent_loop.py` | Adds lifecycle hook triggers around agent / turn / LLM phases | **safe**; Yole ignores them |
| `GenericAgentHandler` binding | `agentmain.py` | Imports hook loader and calls `discover_and_load()` at import time | **safe**; Yole still patches `agentmain.GenericAgentHandler` after import |
| `_turn_end_hooks` | `ga.py` | No relevant change | **safe** |
| `llmclient.backend.history` / model reads | `llmcore.py` | mykey error handling tightened; langfuse load moved out of `reload_mykeys()` | **safe** |
| Dependencies | `pyproject.toml` | No diff | **safe** |
| Internal assets | `assets/tool_usable_history.json`, `frontends/stapp.py`, `desktop_pet*_pyw`, `btw_cmd.py` | Expected paths still exist; `stapp.py` still reinjects `tool_usable_history.json` with `last_tools=''` | **safe** |

## Rejected Alternatives

- **Modify or pull the user's GA checkout**: rejected by the project
  constitution. Baseline tracking is Yole's audit record, not a command to
  mutate `~/Documents/GenericAgent`.
- **Use `plugins.hooks.register('tool_before')`**: rejected because it would add
  global hook registration lifecycle concerns. The dispatch wrapper is already
  the owned integration point.
- **Treat the callback removal as harmless because approval still works**:
  rejected. Product impact would be subtle but real: live per-step progress
  could lag until turn-end prediction, making long multi-step tasks feel less
  responsive.

## Open Questions

- GA's hook system may become a public extension point later. If it stabilizes,
  Yole can re-evaluate whether a hook-based progress signal is cleaner than
  the dispatch wrapper.

## Next

- Run runner tests against the new baseline.
- Run GUI typecheck / lint because the Settings baseline placeholder changed.
- Ship as a standalone baseline upgrade commit.

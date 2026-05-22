# GenericAgent Baseline

> Maintainer-facing document. Contributors touching GenericAgent integration
> should read this; most users do not need it.

Galley integrates with GenericAgent without modifying it. The baseline records
the upstream GenericAgent commit that Galley has audited and tested against.

## Current Baseline

Locked commit: `1a8abc4fda00d4324c41e148b64e2f3475114ade`

- Source: `lsdefine/GenericAgent` upstream `main`
- Date audited: 2026-05-22
- Previous baseline: `b063518`
- Delta: 36 commits
- Result: one compatibility adapter for dispatch callback removal; no schema
  or dependency changes
- Devlog: [GA baseline upgrade b063518 -> 1a8abc4](./devlog/2026-05-22-ga-baseline-upgrade-b063518-to-1a8abc4.md)

Relevant compatibility notes:

- `agent_loop.py`: `BaseHandler.dispatch` replaced
  `tool_before_callback` / `tool_after_callback` calls with
  `plugins.hooks` triggers. Galley now feature-detects this and emits its
  own `turn_start` signal around dispatch when the loaded GA no longer calls
  the callback.
- `agent_loop.py`: `BaseHandler.dispatch` still has the
  `(tool_name, args, response, index=0, tool_num=1)` generator protocol.
- `agentmain.py`: `plugins.hooks.discover_and_load()` now runs at import time;
  Galley still patches `agentmain.GenericAgentHandler` after import.
- `ga.py`: `_turn_end_hooks` stayed compatible.
- `llmcore.py`: mykey import error reporting changed and langfuse plugin
  loading moved to the hook loader. Galley reads `client.backend.model` and
  `llmclient.backend.history`; both stayed compatible.
- `pyproject.toml`: no dependency changes.

## Contract Surface

When auditing a GenericAgent upgrade, focus on these surfaces:

1. `BaseHandler.dispatch` signature and generator protocol
2. Whether `BaseHandler.dispatch` calls callbacks or `plugins.hooks`
3. Galley's `WorkbenchHandler.dispatch` approval gate before `super()`
4. `BaseHandler.turn_end_callback`
5. `agent._turn_end_hooks`
6. `agentmain.GenericAgentHandler` import path
7. `llmclient.backend.history` read/write semantics
8. `agent.list_llms()` behavior

Galley may read GenericAgent public APIs and stable in-memory objects. Galley
must not write GenericAgent source, memory, venv, PATH, or runtime state.

## Upgrade Triggers

Upgrade is event-driven, not calendar-driven.

- Before a Galley minor or patch release, normally audit and bump the baseline.
- If users report that a new GenericAgent behavior does not work in Galley,
  audit immediately.
- If upstream ships a critical stability or security fix, audit immediately.
- Do not upgrade just because time has passed.

## Upgrade Procedure

1. Fetch upstream and inspect the commit range:

```bash
cd ~/Documents/GenericAgent
git fetch upstream
git log <current_baseline>..upstream/main --oneline
```

2. Review the integration files:

```bash
git diff <current_baseline>..upstream/main -- agent_loop.py ga.py agentmain.py llmcore.py pyproject.toml
```

3. If an interface changed, prefer runtime feature detection over hard-binding
   to a single GenericAgent version. `inspect.signature` is the preferred
   pattern for Python callback signature drift.

4. Run the compatibility matrix against both new and old GenericAgent states:

```bash
cd ~/Documents/GenericAgent && git checkout upstream/main
cd ~/Documents/genericagent-webui && .venv/bin/python -m pytest runner/tests/

cd ~/Documents/GenericAgent && git checkout main
cd ~/Documents/genericagent-webui && .venv/bin/python -m pytest runner/tests/
```

5. Start Galley dev mode and run a real multi-step task. Verify streaming,
   thinking state, approvals, tool dispatch, and LLM display.

6. Update this document with the new hash, date, delta summary, and devlog link.

7. Write a devlog entry:

```text
docs/devlog/YYYY-MM-DD-ga-baseline-upgrade-<old>-to-<new>.md
```

8. Keep the baseline upgrade as an independent commit when possible.

## Bundled Python Dependency Audit

Galley releases bundle CPython plus the GenericAgent core runtime dependencies.
Every baseline upgrade must check GenericAgent `pyproject.toml`:

- If `[project.dependencies]` changes, update `scripts/bundle-python.sh`.
- Rebuild bundled Python for release targets.
- `optional-dependencies` for GenericAgent UI/frontends are not automatically in
  Galley scope; Galley provides its own UI.

Current bundled GenericAgent core deps:

- `requests`
- `beautifulsoup4`
- `bottle`
- `simple-websocket-server`

Runtime packaging details live in [desktop runtime](./desktop-runtime.md).

## Things Galley Does Not Do

- Galley does not automatically upgrade a user's GenericAgent checkout.
- Galley does not prompt users to pull GenericAgent just because upstream moved.
- Galley does not policy-manage GenericAgent's release cadence.
- The Settings GA Version state is informational: aligned / user has upgraded /
  user has older checkout.

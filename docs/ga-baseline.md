# GenericAgent Baseline

> Maintainer-facing document. Contributors touching GenericAgent integration
> should read this; most users do not need it.

Galley integrates with GenericAgent without modifying it. The baseline records
the upstream GenericAgent commit that Galley has audited and tested against.

## Current Baseline

Locked commit: `b0635186a52d3119a46efbaab42e7acd08dffb59`

- Source: `lsdefine/GenericAgent` upstream `main`
- Date audited: 2026-05-18
- Previous baseline: `fc6b5ad`
- Delta: 49 commits
- Result: zero breaking changes on Galley's integration surface
- Devlog: [GA baseline upgrade fc6b5ad -> b063518](./devlog/2026-05-18-ga-baseline-upgrade-fc6b5ad-to-b063518.md)

Relevant compatibility notes:

- `agent_loop.py`: `agent_runner_loop` gained additive kwarg
  `yield_info=False`; Galley does not pass it.
- `agentmain.py`: display queue payload gained `turn` / `outputs`; Galley reads
  existing `next` / `done` / `source`.
- `ga.py`: prompt and summary behavior changed internally; `BaseHandler`
  callbacks and `_turn_end_hooks` stayed compatible.
- `llmcore.py`: model property behavior changed internally; Galley reads
  `client.backend.model`.

## Contract Surface

When auditing a GenericAgent upgrade, focus on these surfaces:

1. `BaseHandler.tool_before_callback`
2. `BaseHandler.tool_after_callback`
3. `BaseHandler.turn_end_callback`
4. `BaseHandler.dispatch` generator protocol
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

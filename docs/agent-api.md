# Galley Agent API

The contract between **Galley** and any agent that drives it via the
`galley` CLI binary or (in B4+) the Unix-socket / named-pipe daemon.

> **Status: B1 draft (read-only).** Six read commands ship in v0.5
> alpha. Write commands (`send_message`, `create_session`,
> `archive_session`, …) land in B2 and add to this document
> additively under `schema_version: 1`. See
> [refactor playbook](./refactor/README.md) for the rollout schedule.

## 1 · Stability

The CLI output schema is part of Galley's public contract — supervisor
agents and Skills depend on it. We commit to the rules in
[CLAUDE.md "Galley 架构原则 §2 CLI surface 是公开契约面"](../CLAUDE.md).

- **`schema_version: 1` is additive-only.** New optional fields can
  arrive; existing field names and semantics do not change inside this
  major version.
- **Breaking change requires a bump.** A `schema_version: 2` introduces
  the breaking change, and old SOPs can opt into the v1 view via
  `--schema=1` (B4+).
- **Exit-code categories are stable.** The five exit codes in §3 do not
  get reassigned across `schema_version` bumps — agents can branch on
  them confidently without parsing JSON.
- **Error discriminants are stable.** The `error` field values listed
  in §6 are stable identifiers, not renames.

If a future change feels load-bearing enough to risk these promises, it
gets a `schema_version` bump.

## 2 · Where to find things

- **Database location.** The CLI reads the same SQLite file the Galley
  GUI writes to. Default paths:
  - macOS: `~/Library/Application Support/app.galley/workbench.db`
  - Linux: `$XDG_DATA_HOME/app.galley/workbench.db` or
    `~/.local/share/app.galley/workbench.db`
  - Windows: `%APPDATA%/app.galley/workbench.db`
- **Override.** Set `GALLEY_DB_PATH=<absolute-path>` to point at a
  specific file (snapshots, isolated test fixtures, etc.).
- **Identifier.** `app.galley` is the Tauri bundle identifier — do not
  change without a coordinated migration (see
  [CLAUDE.md "Tauri Identifier 不可随意改"](../CLAUDE.md)).

## 3 · Exit codes

| Code | Category          | When                                                        |
| ---- | ----------------- | ----------------------------------------------------------- |
| `0`  | success           | command completed; output (if any) is on stdout             |
| `1`  | `internal`        | unexpected failure (sqlx bug, FS race, etc.)                |
| `2`  | `invalid_args`    | argument validation failed (unknown `--status` value, …)    |
| `3`  | `not_found`       | requested resource missing (`session brief <id>` no row)    |
| `4`  | `db_unavailable`  | DB file missing / unopenable / corrupted                    |

Exit codes are reserved categories — they do not get reassigned. A new
error class would take the next free code (`5`, `6`, …) without
disturbing `1–4`.

## 4 · Output discipline

- **Success → JSON on stdout.** List-returning commands emit **NDJSON**
  (one object per line) so streaming parsers like `jq -c` work without
  buffering.
- **Errors → JSON on stdout.** Same stream as success, with the
  envelope in §6. Exit code carries the category for SOPs that don't
  want to parse JSON.
- **stderr is reserved.** Only Rust runtime panics / backtraces show up
  there. Safe to pipe `2>/dev/null` when you only care about the
  protocol output.
- **No colour codes / TTY frills.** Output is byte-identical whether
  attached to a TTY or piped.

## 5 · Commands

### 5.1 · `galley version`

Returns the CLI version + the schema version of its output protocol.

```bash
$ galley version
{"galley_version":"0.1.0-dev","schema_version":1}
```

Response fields:

| Field            | Type   | Notes                                              |
| ---------------- | ------ | -------------------------------------------------- |
| `galley_version` | string | semver of the `galley` binary itself               |
| `schema_version` | int    | this document's stability key (1 in B1)            |

### 5.2 · `galley sessions list [--project=X] [--status=Y] [--archived | --all]`

Lists sessions in `pinned DESC, last_activity_at DESC` order. NDJSON,
one `SessionBrief` per line.

| Flag         | Type   | Default      | Notes                                                                                             |
| ------------ | ------ | ------------ | ------------------------------------------------------------------------------------------------- |
| `--project`  | string | (unset)      | restrict to one project id                                                                        |
| `--status`   | string | (unset)      | one of `idle / connecting / running / waiting_approval / error / completed / cancelled / archived` |
| `--archived` | bool   | false        | return only archived sessions                                                                     |
| `--all`      | bool   | false        | include archived alongside active (overrides `--archived`)                                        |

Default behaviour: exclude archived (matches GUI sidebar default).

Example:

```bash
$ galley sessions list --project=proj_demo
{"id":"s-abc","title":"first chat","status":"idle","turnCount":3,"lastActivityAt":"…","createdAt":"…","updatedAt":"…","pinned":false,"hasUnread":false}
{"id":"s-def","title":"second chat","status":"completed","turnCount":12,"lastActivityAt":"…","createdAt":"…","updatedAt":"…","pinned":false,"hasUnread":false}
```

`SessionBrief` fields:

| Field             | Type            | Notes                                                                              |
| ----------------- | --------------- | ---------------------------------------------------------------------------------- |
| `id`              | string          | session identifier (treat as opaque)                                               |
| `projectId`       | string?         | project membership (absent when ungrouped)                                         |
| `title`           | string          | derived from the first user message                                                |
| `status`          | string enum     | one of the values listed under `--status` above                                    |
| `summary`         | string?         | one-line agent-supplied digest of the last turn                                    |
| `turnCount`       | int?            | number of user-message turns so far                                                |
| `lastActivityAt`  | string (ISO8601)| max(timestamps across messages + lifecycle events)                                 |
| `createdAt`       | string (ISO8601)| session creation                                                                   |
| `updatedAt`       | string (ISO8601)| last metadata write                                                                |
| `pinned`          | bool?           | sidebar pin                                                                        |
| `hasUnread`       | bool?           | new content arrived while session was not the active one (GUI signal; B2+ writes)  |

### 5.3 · `galley sessions search <query> [--all]`

FTS5 trigram search over message bodies. Two-character queries fall
back to LIKE substring search. Queries shorter than two characters
return empty.

| Flag     | Default | Notes                                  |
| -------- | ------- | -------------------------------------- |
| `--all`  | false   | include archived sessions in the scan  |

Example:

```bash
$ galley sessions search "ndjson"
{"sessionId":"s-abc","messageId":"m1","snippet":"… emit <mark>ndjson</mark> on stdout …","rank":-1.234}
```

`SearchHit` fields:

| Field        | Type   | Notes                                                                          |
| ------------ | ------ | ------------------------------------------------------------------------------ |
| `sessionId`  | string | the session containing the hit                                                 |
| `messageId`  | string | the matching message id                                                        |
| `snippet`    | string | excerpt with matches wrapped in `<mark>…</mark>`; HTML-safe                    |
| `rank`       | float  | FTS5 BM25 score (lower = better). `0.0` when the LIKE fallback returned the hit |

### 5.4 · `galley session brief <id>`

One `SessionBrief` for the given id, or exit `3 not_found`.

```bash
$ galley session brief s-abc
{"id":"s-abc","title":"…","status":"idle", …}

$ galley session brief sess_missing ; echo "exit: $?"
{"error":"not_found","detail":{"message":"session sess_missing not found"}}
exit: 3
```

### 5.5 · `galley session show <id> [--tail=N]`

Conversation messages for a session, oldest first. NDJSON, one
`MessageBrief` per line.

| Flag     | Default          | Notes                                              |
| -------- | ---------------- | -------------------------------------------------- |
| `--tail` | (full transcript)| return only the last `N` messages (still ordered)  |

`MessageBrief` fields:

| Field         | Type            | Notes                                                                 |
| ------------- | --------------- | --------------------------------------------------------------------- |
| `id`          | string          | message identifier                                                    |
| `sessionId`   | string          | parent session id                                                     |
| `role`        | string enum     | `user / agent / system`. `tool` rows surface as `agent`               |
| `content`     | string          | raw markdown body                                                     |
| `createdAt`   | string (ISO8601)|                                                                       |
| `summary`     | string?         | agent-supplied one-line digest of this turn (assistant rows only)     |
| `turnIndex`   | int?            | which user-message-turn this message belongs to                       |

### 5.6 · `galley status`

Aggregate counts.

```bash
$ galley status
{"total":7,"running":0,"waitingInput":0,"errored":0}
```

`StatusSummary` fields:

| Field           | Type | Notes                                                                                              |
| --------------- | ---- | -------------------------------------------------------------------------------------------------- |
| `total`         | int  | non-archived sessions                                                                              |
| `running`       | int  | sessions in `running` status. Note: B1 surfaces persistence-truth — these counts will usually read as 0 unless caught mid-write, since GUI only persists `archived / completed / cancelled` (transient runtime status coerced to `idle` on save). Real runtime counts arrive in B2+ via the Rust-owned runner manager. |
| `waitingInput`  | int  | sessions with `waiting_approval` status (same persistence caveat)                                  |
| `errored`       | int  | sessions in `error` status (same caveat)                                                           |

### 5.7 · `galley health`

Health probe. B1 ships a partial set — filesystem / SQLite-checkable
rows are real; Python-dependent rows (`agentmain_import`,
`llm_session_init`) report `deferred_b4` until B4 daemon mode ships.

```bash
$ galley health
{"checks":[
  {"id":"db_readable","status":"ok","detail":"/Users/.../workbench.db"},
  {"id":"ga_path","status":"ok","detail":"/Users/.../GenericAgent"},
  {"id":"mykey_py","status":"ok","detail":"/Users/.../mykey.py"},
  {"id":"agentmain_import","status":"deferred_b4","detail":"requires runner spawn — see B4 daemon"},
  {"id":"llm_session_init","status":"deferred_b4","detail":"requires runner spawn — see B4 daemon"}
]}
```

`HealthReport` fields:

| Field    | Type                 | Notes                                  |
| -------- | -------------------- | -------------------------------------- |
| `checks` | `HealthCheck[]`      | one entry per probe                    |

`HealthCheck` fields:

| Field    | Type        | Notes                                                                                                    |
| -------- | ----------- | -------------------------------------------------------------------------------------------------------- |
| `id`     | string      | stable identifier (pattern-match on this, not the `detail` text)                                         |
| `status` | string enum | `ok / warn / fail / deferred_b4`                                                                         |
| `detail` | string?     | human-readable explanation (paths, error messages, deferral reasoning)                                   |

Probe id catalogue (will grow):

| `id`                | Cover                                                                                                |
| ------------------- | ---------------------------------------------------------------------------------------------------- |
| `db_readable`       | `SELECT 1` against the resolved DB path                                                              |
| `ga_path`           | `prefs.ga_config.gaPath` is set + the path resolves to a directory                                   |
| `mykey_py`          | gated on `ga_path`; checks `<ga_path>/mykey.py` is a file                                            |
| `agentmain_import`  | B4 — `python -c "import agentmain"` against the bundled / user Python                                |
| `llm_session_init`  | B4 — instantiate one LLM session, capture the API-key resolution error if any                        |

Pattern: agents should branch on the `status` value (`ok` / `warn` /
`fail` actionable; `deferred_b4` indicates "Galley can't currently check
this — trust other signals or wait for B4").

## 6 · Error envelope

Every error — across every command — uses this shape:

```json
{
  "error":  "not_found" | "invalid_args" | "db_unavailable" | "internal",
  "detail": {
    "message": "<human-readable explanation>"
  }
}
```

- `error` is a stable discriminant (matches the `GalleyError` enum
  variants in [`core/src/error.rs`](../core/src/error.rs)).
- `detail` is an object so we can grow it additively in v1
  (`session_id`, `path`, `expected`, etc.) without breaking parsers
  that already pattern-match on `error`.
- Future error classes get their own discriminant; v1 will not rename
  existing ones.

## 7 · Versioning

Inside `schema_version: 1`:

- Adding a new command, flag, or output field is **non-breaking**.
- Adding a new value to a string enum (status, error, health status,
  …) is **non-breaking** — agents must handle unknown values
  gracefully (default branch).
- Removing or renaming a command / flag / field / enum value is
  **breaking**. Don't.

Inside a future `schema_version: 2`:

- A breaking change can ship.
- B4+ will support `--schema=1` on every command to opt back into the
  v1 view; old SOPs keep working until they choose to migrate.

`galley version` returns the schema version the binary is willing to
speak. Future binaries that speak multiple versions will expose this
as an array.

## 8 · Planned (B2+)

The following are intentionally **not in `schema_version: 1` yet** —
mentioned for context so SOPs can plan their integration shape.

- `galley send-message <session-id> <text>` — agent-side write to a
  session's conversation. Requires runner ownership in Rust (B2).
- `galley create-session [--project=X] [--title=…]` — start a new
  session. (B2.)
- `galley archive-session <session-id>` — persist `status=archived`
  + clear `has_unread`. (B2.)
- `galley btw <session-id> <text>` — out-of-band system message
  injected mid-stream. (B2.)
- `galley project create | rename | delete` — project CRUD. (B2.)
- `galley llm list | switch` — per-session LLM selection. (B2.)
- Daemon transport — Unix-socket / named-pipe, replacing the per-call
  SQLite open. Localhost only; no TLS, no token. (B4.)

All B2 commands will require an `--origin` flag (or analogous
metadata) so audit logs can distinguish human and agent actions. Shape
draft:

```
galley archive-session s-abc --origin-via=cli --origin-supervisor="ga-claude-1" \
       --origin-reason="user said 归档"
```

The CLI surfaces these as flags; underlying Rust struct is
[`Origin`](../core/src/api/origin.rs).

## 9 · See also

- [PRD §11 Agent / CLI surface](./PRD.md) — design rationale.
- [B1 playbook](./refactor/B1-rust-core.md) — implementation cursor.
- [Refactor invariants](./refactor/invariants.md) — including I5
  (API surface single source of truth) which makes this CLI's output
  the same source as the Tauri-invoke output the GUI sees.
- Source for the trait:
  [`core/src/api.rs`](../core/src/api.rs).

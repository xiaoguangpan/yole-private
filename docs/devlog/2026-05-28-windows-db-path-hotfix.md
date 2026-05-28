# Windows DB path hotfix

**Date**: 2026-05-28  
**Status**: Implemented, awaiting fresh Windows artifact dogfood  
**Related**: [desktop runtime](../desktop-runtime.md) · [agent API](../agent-api.md)

## Context

Windows v0.2.0-beta.1 dogfood exposed a release-blocking first-run bug: after
the user configured and successfully tested a managed model, clicking "Start
using Galley" failed with:

```text
opening C:\Users\QW\AppData\Roaming\app.galley\data\workbench.db:
error returned from database: (code: 14) unable to open database file
```

The model path was healthy. The failure happened when Rust Core opened the local
SQLite database.

## Decisions

- The source of truth for `sqlite:workbench.db` is `tauri-plugin-sql`. It opens
  the DB under Tauri's app config directory: `%APPDATA%/app.galley/workbench.db`
  on Windows.
- Rust Core and the CLI now share `core/src/app_paths.rs`, which mirrors that
  Tauri SQL resolver with `directories::BaseDirs`.
- The pre-migration backup gate now probes the same directory as the migration
  runner. This matters because backup must protect the DB that will actually be
  migrated.
- `GALLEY_DB_PATH` remains the test and advanced override path.
- Docs now state the Linux fallback as config-dir based too, matching the same
  resolver instead of the previous data-dir wording.

## Rejected Alternatives

- **Only create `%APPDATA%/app.galley/data`**: that would hide the immediate
  SQLite code 14, but Rust would still read a different DB from the one
  `tauri-plugin-sql` migrates. The user would get a split-brain database.
- **Move the Tauri SQL plugin to `ProjectDirs::data_dir()`**: larger migration
  surface for no product benefit. Existing macOS data and docs already align
  with the plugin path; Windows needed Rust Core to stop using `ProjectDirs`.

## Open Questions

- Fresh Windows artifact dogfood still needs to confirm: install, configure
  model, enter main screen, create a conversation, quit/relaunch, and confirm
  the conversation persists.
- The Windows release smoke checklist should explicitly include "complete
  onboarding into the main screen", not just "model test succeeds".

## Next

Build a new Windows artifact from this commit and rerun the clean-install
dogfood flow before publishing any beta release.

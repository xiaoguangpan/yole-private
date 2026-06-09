# Managed Credentials · Local Encrypted SQLite

## Date / Status / Related

2026-05-26. Implemented.

Related: [managed GA runtime](../managed-ga-runtime.md),
`core/src/credential_store.rs`, `core/migrations/012_managed_model_local_secrets.sql`,
`core/src/db.rs`, `gui/src/lib/managed-model-options.ts`.

## Context

Managed / bundled GA reached dogfood before any public release. The Keychain
design avoided plaintext config, but unsigned macOS builds triggered a scary
system prompt when `yole-core` read `app.yole.managed-models` during a
conversation. That prompt interrupts the core path: configure a model, talk to
Yole.

Because no public release has shipped the managed runtime, there is no real
user migration burden from the Keychain-backed slice.

## Decisions

- Unsigned beta builds use a local encrypted SQLite credential backend for
  managed model API keys.
- `managed_model_secrets` stores encrypted API key payloads by `apiKeyRef`.
- `managed_model_secret_keys` stores the local beta encryption key in the same
  DB so normal Yole backups and machine moves preserve model credentials.
- The generated managed model config still contains only `apiKeyRef`, never
  plaintext API keys.
- Settings and passive list paths can show credential presence from row
  existence (`present` / `missing`) without decrypting the secret.
- The security framing is explicit: this protects generated config,
  diagnostics, logs, and casual DB browsing from plaintext keys; it is not
  equivalent to macOS Keychain or Windows Credential Manager.
- Signed builds can later introduce a system credential backend and migrate
  encrypted SQLite rows after writing to Keychain / Credential Manager.

## Rejected Alternatives

- Keep Keychain and only delay reads: rejected because the prompt moved from
  app startup to the first managed conversation, still breaking the main UX.
- Auto-migrate existing dogfood Keychain entries: rejected because there are no
  public managed-runtime users yet, and reading old entries would trigger the
  same prompt we are removing.
- Store plaintext API keys in SQLite: rejected because encrypted rows are cheap
  and preserve the generated-config / diagnostics no-plaintext invariant.
- User password for credential export: rejected for this beta. It adds product
  surface before there is a real need for cross-user encrypted export.

## Open Questions

- When signed builds arrive, decide whether migration deletes local encrypted
  rows immediately or keeps one-version rollback copies.
- Decide whether a future all-in-one export needs user-supplied encryption.

## Verification

- `cargo fmt --check`
- `cargo check --workspace`
- `cargo test -p yole-core --test db_writes_test`
- `cargo test -p yole-core --test db_test`
- `pnpm --dir gui typecheck`
- `pnpm --dir gui lint`

## Next

Dogfood an unsigned macOS build: save a Provider key, restart Yole, send a
managed conversation, and confirm no Keychain prompt appears.

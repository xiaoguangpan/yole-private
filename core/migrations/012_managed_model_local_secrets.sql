-- 012_managed_model_local_secrets.sql · unsigned-beta local credential store
--
-- Unsigned beta builds store managed model API keys in Galley's SQLite DB as
-- encrypted payloads. The key row lives in the same DB so backups and machine
-- moves carry model credentials with the rest of the managed model config.
-- This is a UX-first beta tradeoff, not OS credential-store strength.

CREATE TABLE managed_model_secret_keys (
  key_id        TEXT PRIMARY KEY,
  key_material  BLOB NOT NULL CHECK (length(key_material) = 32),
  created_at    TEXT NOT NULL
);

CREATE TABLE managed_model_secrets (
  api_key_ref         TEXT PRIMARY KEY,
  key_id              TEXT NOT NULL REFERENCES managed_model_secret_keys(key_id) ON DELETE RESTRICT,
  encryption_version  INTEGER NOT NULL DEFAULT 1,
  algorithm           TEXT NOT NULL,
  nonce               BLOB NOT NULL CHECK (length(nonce) = 12),
  ciphertext          BLOB NOT NULL,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);

CREATE INDEX managed_model_secrets_by_updated_at
  ON managed_model_secrets(updated_at DESC);

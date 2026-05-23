-- 009_managed_models.sql · managed GA M3
--
-- Managed mode owns Galley's model records. The table stores non-secret
-- metadata only; API keys live in the system credential store and are
-- referenced by api_key_ref.

CREATE TABLE managed_models (
  id                 TEXT PRIMARY KEY,
  display_name       TEXT NOT NULL,
  protocol           TEXT NOT NULL CHECK (protocol IN ('anthropic', 'openai')),
  api_base           TEXT NOT NULL,
  model              TEXT NOT NULL,
  api_key_ref        TEXT NOT NULL UNIQUE,
  advanced_options   TEXT NOT NULL DEFAULT '{}',
  is_default         INTEGER NOT NULL DEFAULT 0,
  last_validated_at  TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);

CREATE INDEX managed_models_by_updated_at
  ON managed_models(updated_at DESC);

CREATE UNIQUE INDEX managed_models_one_default
  ON managed_models(is_default)
  WHERE is_default = 1;

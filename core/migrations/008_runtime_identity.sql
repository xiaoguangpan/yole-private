-- 008_runtime_identity.sql · managed GA M1
--
-- Runtime identity is now durable session metadata. Existing sessions
-- came from attach/external GA, so they migrate to `external`.
-- Fresh installs get `active_runtime_kind = "managed"` unless a
-- persisted `ga_config.gaPath` proves the user already attached GA.

ALTER TABLE sessions ADD COLUMN ga_runtime_kind TEXT NOT NULL DEFAULT 'external'
  CHECK (ga_runtime_kind IN ('managed', 'external'));

ALTER TABLE sessions ADD COLUMN ga_runtime_id TEXT;
ALTER TABLE sessions ADD COLUMN prompt_profile TEXT;

CREATE INDEX sessions_by_runtime_last_activity
  ON sessions(ga_runtime_kind, last_activity_at DESC);

INSERT INTO prefs (key, value, updated_at)
SELECT
  'active_runtime_kind',
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM prefs
      WHERE key = 'ga_config'
        AND COALESCE(json_extract(value, '$.gaPath'), '') <> ''
    )
    THEN '"external"'
    ELSE '"managed"'
  END,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE NOT EXISTS (
  SELECT 1 FROM prefs WHERE key = 'active_runtime_kind'
);

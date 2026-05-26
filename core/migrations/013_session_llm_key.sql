-- 013_session_llm_key.sql · stable per-session LLM identity
--
-- `llm_index` is still kept for backwards compatibility and for the
-- bridge's current `next_llm(index)` command surface, but it is not stable
-- across model reordering. New writes also persist `llm_key`:
--   - managed runtime: Galley's managed_models.id
--   - external runtime: GA's raw LLM name from agent.list_llms()

ALTER TABLE sessions ADD COLUMN llm_key TEXT;

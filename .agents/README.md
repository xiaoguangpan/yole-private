# Yole Agent Skills

This directory contains skill packages for Codex / Agents-style runtimes.

## Skills

| Skill | Purpose |
|---|---|
| [`yole-supervisor`](./skills/yole-supervisor/) | Let an agent operate Yole through the local `yole` CLI. |

## Notes

- These files are distribution artifacts for agent runtimes, not Yole runtime
  source code.
- The canonical Supervisor SOP remains
  [`docs/integrations/yole-supervisor-sop.md`](../docs/integrations/yole-supervisor-sop.md).
- Keep provider-specific variants separate from `.claude/skills/` so audit
  identity strings stay clear in Yole's action history.

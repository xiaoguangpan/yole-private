# yole-supervisor — Claude Skill

A Claude Code skill that lets Claude remote-manage your local Yole
desktop orchestrator through the `yole` CLI: list / open / send /
archive / move sessions, switch LLMs, inspect status — all from a
Claude conversation.

> **Need Yole first.** This skill assumes you have Yole installed and
> have launched it at least once (so the CLI discovery file at
> `~/.config/yole/cli-path` exists). Get it at
> https://github.com/wangjc683/yole.

## Install

Claude Code loads skills from `~/.claude/skills/`. Pick whichever you
prefer:

### Symlink (recommended if you cloned this repo)

```bash
ln -sfn "$(pwd)/.claude/skills/yole-supervisor" ~/.claude/skills/yole-supervisor
```

Re-syncs automatically when you `git pull`.

### Copy

```bash
mkdir -p ~/.claude/skills
cp -R .claude/skills/yole-supervisor ~/.claude/skills/yole-supervisor
```

Re-copy after `git pull` to pick up upstream changes.

### Verify

Open a new Claude Code session, run `/help` (or just ask Claude what
skills are loaded). `yole-supervisor` should appear in the available
skills list.

## Usage

Once installed, trigger phrases like these load the skill automatically:

- 「帮我看看 Yole 现在跑什么」
- 「开个 Yole session 跑 X 任务」
- 「把那个 session archive 一下」
- "what's running in Yole?"
- "spin up a Yole session that does X"
- "switch the LLM on session sess_xxx to claude-sonnet-4-6"

The skill resolves the CLI path from the discovery file, runs the
appropriate `yole` subcommand, classifies any error by exit code, and
asks for confirmation before destructive operations (archive / stop /
project delete).

## Files

| Path | What |
|---|---|
| `SKILL.md` | The skill body Claude reads on trigger. |
| `references/yole-supervisor-sop.md` | Full Supervisor SOP (verbatim copy of `docs/integrations/yole-supervisor-sop.md` from the Yole repo). Claude reads this for edge cases. |

## Schema + stability

This skill targets **Yole CLI schema_version=1** (frozen for v0.2.0-beta.1).
Schema is additive-only inside v1; breaking changes bump to v2 and will
ship as a new skill version.

## Updates

The canonical SOP lives in [`docs/integrations/yole-supervisor-sop.md`](https://github.com/wangjc683/yole/blob/main/docs/integrations/yole-supervisor-sop.md)
in the Yole repo. When that updates, the `references/` copy in this
skill is re-synced — pull the latest skill version.

## See also

- [Yole CLI agent-api](https://github.com/wangjc683/yole/blob/main/docs/agent-api.md) — full command schema
- [Yole PRD §11](https://github.com/wangjc683/yole/blob/main/docs/PRD.md) — CLI surface
- [Yole architecture principles](https://github.com/wangjc683/yole/blob/main/AGENTS.md) — why Yole is localhost-only and your data never leaves your machine

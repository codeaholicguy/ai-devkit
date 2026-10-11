---
title: AGENTS.md Best Practices
description: What AGENTS.md is, how to write a good one, and how AI DevKit generates and keeps agent instruction files consistent across tools.
order: 18
---

`AGENTS.md` is the emerging standard file for AI coding agent instructions — the cross-agent equivalent of `CLAUDE.md`. Agents including Codex, Cursor, opencode, Junie, Cline, Devin, and KiloCode read it (or a tool-specific variant) to learn how your project should be built, tested, and reviewed.

## AGENTS.md vs CLAUDE.md

They serve the same purpose for different agents:

- `CLAUDE.md` is read by Claude Code.
- `AGENTS.md` is read by Codex and adopted as the shared convention by several other agents and editors.

If you run multiple agents on one repo, you should not copy-paste `CLAUDE.md` into `AGENTS.md` and hope they stay in sync — the files drift within a week. Keep one source of truth and generate the per-agent files from it.

## What belongs in AGENTS.md

A good agent instructions file is short and operational:

- **Setup commands** — install, build, test, lint (exact commands, not descriptions)
- **Project layout** — where source, tests, and config live
- **Conventions** — naming, formatting, commit style, forbidden patterns
- **Boundaries** — files or directories the agent must not touch
- **Definition of done** — what evidence a finished task needs (tests pass, lint clean)

What to leave out: prose explanations of the product, duplicated docs content, and personal notes. Those belong in docs or in a memory store.

## How AI DevKit manages AGENTS.md

`ai-devkit init` creates the right instruction file for each environment you select — `AGENTS.md` for Codex, opencode, Junie, Cline, Devin, and KiloCode; `CLAUDE.md` for Claude Code; `GEMINI.md` for Gemini CLI; prompts for GitHub Copilot — plus each agent's skill and MCP configuration:

```bash
cd your-project
ai-devkit init
```

Your selections are recorded in `.ai-devkit.json`, which becomes the local source of truth. When your agent stack changes, re-run `ai-devkit init` and the per-agent files are reconciled from that one config instead of edited by hand.

For the full list of what each environment receives, see [Supported AI agents and environments](/docs/2-supported-agents).

## Keep instructions fresh with memory

Instruction files should change slowly; knowledge changes daily. Move churn — bug fixes, gotchas, evolving conventions — into [AI DevKit memory](/docs/6-memory), which agents query on demand through MCP instead of loading in full every session:

```bash
ai-devkit memory store \
  --title "Use pnpm, not npm, in this repo" \
  --content "This monorepo uses pnpm workspaces. 'npm install' breaks the lockfile." \
  --scope "repo:myorg/my-monorepo"
```

## Checklist

- [ ] One `AGENTS.md` at repo root (or per-package in monorepos)
- [ ] Generated from a shared config, not hand-edited per agent
- [ ] Exact commands for build/test/lint
- [ ] Committed to git and reviewed like code
- [ ] Volatile knowledge in memory, not in the file

## Related

- [Supported AI agents and environments](/docs/2-supported-agents)
- [The .ai-devkit.json configuration file](/docs/11-configuration-file)
- [Persistent memory for Claude Code](/faq/claude-code-persistent-memory)
- [CLAUDE.md vs AGENTS.md](/faq/claude-md-vs-agents-md)

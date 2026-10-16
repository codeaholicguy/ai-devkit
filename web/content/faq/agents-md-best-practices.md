---
title: AGENTS.md Best Practices
description: What AGENTS.md is, how to write a good one, and how it fits alongside AI DevKit skills, memory, and workflow docs.
order: 18
category: guide
---

`AGENTS.md` is the emerging standard file for AI coding agent instructions — the cross-agent equivalent of `CLAUDE.md`. Agents including Codex, Cursor, opencode, Junie, Cline, Devin, and KiloCode read it (or a tool-specific variant) to learn how your project should be built, tested, and reviewed.

## AGENTS.md vs CLAUDE.md

They serve the same purpose for different agents:

- `CLAUDE.md` is read by Claude Code.
- `AGENTS.md` is read by Codex and adopted as the shared convention by several other agents and editors.

If you run multiple agents on one repo, avoid duplicating the same long instructions across several files. Keep stable, shared rules in `AGENTS.md`, and add a small tool-specific file only when an agent needs different guidance.

## What belongs in AGENTS.md

A good agent instructions file is short and operational:

- **Setup commands** — install, build, test, lint (exact commands, not descriptions)
- **Project layout** — where source, tests, and config live
- **Conventions** — naming, formatting, commit style, forbidden patterns
- **Boundaries** — files or directories the agent must not touch
- **Definition of done** — what evidence a finished task needs (tests pass, lint clean)

What to leave out: prose explanations of the product, duplicated docs content, and personal notes. Those belong in docs or in a memory store.

## How AGENTS.md fits with AI DevKit

AI DevKit does not generate or overwrite `AGENTS.md`, `CLAUDE.md`, or `GEMINI.md`. You own those repository instructions. `ai-devkit init` records your selected environments, creates phase documentation, and installs any configured project skills and MCP files:

```bash
cd your-project
ai-devkit init
```

Your selections are recorded in `.ai-devkit.json`. When your agent stack changes, re-run `ai-devkit init` or `ai-devkit install` to reconcile the artifacts AI DevKit manages. Maintain the repository's instruction files separately and review them like other source files.

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
- [ ] Shared rules have one source of truth instead of being duplicated across agent files
- [ ] Exact commands for build/test/lint
- [ ] Committed to git and reviewed like code
- [ ] Volatile knowledge in memory, not in the file

## Related

- [Supported AI agents and environments](/docs/2-supported-agents)
- [The .ai-devkit.json configuration file](/docs/11-configuration-file)
- [Persistent memory for Claude Code](/faq/claude-code-persistent-memory)
- [CLAUDE.md vs AGENTS.md](/faq/claude-md-vs-agents-md)

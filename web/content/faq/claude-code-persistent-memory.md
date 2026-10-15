---
title: Persistent Memory for Claude Code
description: Give Claude Code persistent, searchable memory across sessions with AI DevKit's local MCP memory server — no cloud, no prompt bloat.
order: 17
category: guide
---

Claude Code forgets everything between sessions except what lives in `CLAUDE.md` and your repo files. If you want Claude Code to remember conventions, decisions, and fixes across sessions — and across projects — you need a real memory layer.

AI DevKit provides one: a **local SQLite memory service** that Claude Code can read and write through MCP. Nothing leaves your machine.

## Why CLAUDE.md alone is not enough

`CLAUDE.md` is loaded into every session, which makes it great for stable project rules — and a poor fit for everything else:

- It grows until it crowds out real context in the prompt window.
- It mixes project rules with personal knowledge that does not belong in git.
- It cannot be searched; the agent sees all of it or none of it.

A memory store inverts that: knowledge is saved once and retrieved only when relevant to the current task.

## Set up memory for Claude Code

Run machine setup once. It wires the `ai-devkit-memory` MCP server into Claude Code's global MCP config automatically:

```bash
npm install -g ai-devkit
ai-devkit setup
```

Or without a global install:

```bash
npx ai-devkit@latest setup
```

Confirm the wiring with `ai-devkit status`, then restart Claude Code.

## Using memory in Claude Code

Once the MCP server is connected, just ask:

**Storing:**
> "Remember that all API responses must handle BigInt serialization. Save it to memory with the tag #backend."

**Retrieving:**
> "Check memory for any API standards I need to follow before building this endpoint."

Claude Code calls the memory tools on its own, so knowledge from last week — or from a different project in the same scope — surfaces when it matters.

## Using memory from the CLI

You can also manage memory directly:

```bash
# Store a decision
ai-devkit memory store \
  --title "Use BigInt for API responses" \
  --content "Serialize BigInt with BigInt.toString() before sending API responses containing large numbers." \
  --tags "backend,api" \
  --scope "repo:myorg/my-repo"

# Search it later
ai-devkit memory search --query "api serialization"
```

Search is hybrid — lexical matching plus local semantic embeddings — so related entries surface even when the wording differs. See [Memory](/docs/6-memory) for the full command reference.

## Scopes: the right memory for the right place

| Scope | Applies to |
|-------|-----------|
| `global` (default) | Every project on this machine |
| `project:<name>` | One named project |
| `repo:<org/repo>` | One git repository |

Agents automatically prioritize knowledge matching the scope of your current working directory.

## Privacy

Memory is stored in a local SQLite file at `~/.ai-devkit/memory.db` (configurable via `memory.path` in `.ai-devkit.json`). It is never sent to a cloud service, and because it is a single file you can copy it to another machine.

## Bonus: shared memory across agents

The same memory server is wired into every MCP-capable agent AI DevKit detects — Cursor, Codex, Gemini CLI, opencode, and more. A convention Claude Code saves today is available to Codex tomorrow.

## Related

- [Memory documentation](/docs/6-memory)
- [The memory skill](/skills/memory)
- [Supported AI agents and environments](/docs/2-supported-agents)
- [Why AI coding agents forget context](/faq/why-ai-coding-agents-forget-context)

---
title: Memory
description: Give your AI agents long-term memory to prevent repeating mistakes and enforce coding standards.
slug: memory
order: 6
---

Imagine if your AI assistant never made the same mistake twice. 

The **Memory** service allows you to store actionable insights, coding patterns, and project guidelines. Once stored, this knowledge is available to your AI agents (via MCP) and to you directly via the CLI, ensuring consistency across your development workflow.

## Prerequisites

Before using Memory, ensure you have:

- **Node.js 18+** installed
- **AI DevKit CLI** installed: `npm install -g ai-devkit` or use `npx ai-devkit`
- For MCP usage: A compatible AI assistant (Cursor, Claude Code, etc.)

## How It Works

You can interact with Memory in three ways:

1.  **Through your AI Assistant (Recommended):** Connect via MCP so your AI can automatically search for relevant context and save new rules as you work.
2.  **Through the CLI:** Manually store or retrieve knowledge directly from your terminal—perfect for quick lookups or scripting.
3.  **Through Skills:** Install the memory skill to teach your AI agent how to use CLI commands when MCP is unavailable.

## Using with AI Agents (MCP)

This is the most powerful way to use Memory. Your AI (Cursor, Claude, etc.) gains "tools" to save and retrieve information naturally.

### Setup

Add the server to your MCP configuration file:

```json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["@ai-devkit/memory"]
    }
  }
}
```

### Usage Examples

Once connected, you can talk to your AI naturally:

**Storing Knowledge:**
> "We just decided that all API responses must handle BigInt serialization. Please save this rule to memory with the tag #backend."

You can also force your AI agent to store knowledge by using the `/remember` slash command. This command is available if you initialized your project with `ai-devkit init`.

**Example:**
> /remember Always use `BigInt.toString()` before sending API responses containing large numbers.

The AI will prompt you for a title and tags, then save the knowledge to memory.

**Retrieving Knowledge:**
> "I'm building a new endpoint. Check memory for any API standards I need to follow."

The AI will intelligently rank results based on your current task and available tags.

## Using the CLI

You don't need an AI agent to use Memory. The `ai-devkit` CLI has built-in commands to manage your knowledge base.

### Storing Knowledge

Found a solution to a tricky bug? Save it immediately:

```bash
ai-devkit memory store \
  --title "Fix: Docker connection refused on M1 Mac" \
  --content "Enable 'Use Rosetta for x86/amd64 emulation' in Docker Desktop settings." \
  --tags "docker,mac,infra" \
  --scope "global"
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `--title` | Yes | A short, descriptive title |
| `--content` | Yes | The detailed knowledge to store |
| `--tags` | No | Comma-separated tags for categorization |
| `--scope` | No | `global` (default), `project:<name>`, or `repo:<org/repo>` |

> 💡 **Tip:** Run `ai-devkit memory store --help` to see all available options.

### Searching Knowledge

Need to recall a specific command or pattern? Search for it:

```bash
ai-devkit memory search --query "docker m1"
```

**Output:**
```json
[
  {
    "title": "Fix: Docker connection refused on M1 Mac",
    "content": "Enable 'Use Rosetta for x86/amd64 emulation' in Docker Desktop settings.",
    "tags": ["docker", "mac", "infra"],
    "scope": "global",
    "score": 5.2
  }
]
```

> **Note:** If no results are found, an empty array `[]` is returned.

## Using the Memory Skill

If MCP is not available in your environment, you can install the **memory skill** to teach your AI agent how to use memory via CLI commands.

### Installing the Skill

```bash
ai-devkit skill add codeaholicguy/ai-devkit memory
```

This installs the memory skill into your project's skill directory (e.g., `.cursor/skills/memory/`).

### What the Skill Provides

Once installed, your AI agent will have access to:

- **Detailed CLI command reference** for `memory store` and `memory search`
- **Parameter documentation** with examples for all options
- **Best practices** for crafting titles, content, and tags
- **Troubleshooting tips** for common issues

### When to Use the Skill

The memory skill is ideal when:

- MCP is not configured or unavailable
- Your AI agent needs detailed command syntax reference
- You want consistent memory usage patterns across your team

> **Tip:** The skill works with all skill-capable AI environments: Cursor, Claude Code, Codex, OpenCode, and Antigravity.

## Organizing Your Knowledge

To keep your memory effective, use **Tags** and **Scopes**.

### Tags
Categorize your entries so they trigger in the right context.
- `["typescript", "react"]` -> For frontend rules.
- `["deployment", "ci"]` -> For DevOps procedures.

### Scopes

Control where your knowledge applies:

| Scope | CLI Flag | Description |
|-------|----------|-------------|
| Global | `--scope global` | Applies to all your projects (default) |
| Project | `--scope project:my-app` | Specific to a project |
| Repo | `--scope repo:org/repo` | Specific to a git repository |

**Example:**
```bash
ai-devkit memory store \
  --title "Use pnpm for this monorepo" \
  --content "This project uses pnpm workspaces. Always use 'pnpm' instead of 'npm'." \
  --scope "repo:myorg/my-monorepo"
```

> **Note:** AI agents automatically prioritize knowledge matching the scope of your current working directory.

## Privacy & Storage

Your memory is **100% local**. 

All data is stored in a high-performance SQLite database located at `~/.ai-devkit/memory.db`. No data is sent to the cloud, ensuring your proprietary coding patterns remain private.

This is portable so you can just copy the database file to another machine to use it across different machines.

## Next Steps

- **[Skills](/docs/7-skills)**: Learn how to create reusable skill templates
- **[Getting Started](/docs/1-getting-started)**: New to AI DevKit? [Start here](/docs/1-getting-started)

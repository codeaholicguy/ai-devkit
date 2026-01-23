---
title: Memory
description: Give your AI agents long-term memory to prevent repeating mistakes and enforce coding standards.
slug: memory
order: 6
---

Imagine if your AI assistant never made the same mistake twice. 

The **Memory** service allows you to store actionable insights, coding patterns, and project guidelines. Once stored, this knowledge is available to your AI agents (via MCP) and to you directly via the CLI, ensuring consistency across your development workflow.

## How It Works

You can interact with Memory in two ways:

1.  **Through your AI Assistant (Recommended):** Connect via MCP so your AI can automatically search for relevant context and save new rules as you work. When you chat with your AI assistant, it will automatically fallback to the CLI to search for relevant context and save new rules if MCP is not available.
2.  **Through the CLI:** Manually store or retrieve knowledge directly from your terminal—perfect for quick lookups or scripting.

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

You can force your AI agent to store knowledge by using slash commands: `/remember`. This command is available if you init your project with `ai-devkit init`.

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
  --tags "docker,mac,infra"
```

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
    "content": "Enable 'Use Rosetta for x86/amd64 emulation'...",
    "score": 5.2
  }
]
```

## Organizing Your Knowledge

To keep your memory effective, use **Tags** and **Scopes**.

### Tags
Categorize your entries so they trigger in the right context.
- `["typescript", "react"]` -> For frontend rules.
- `["deployment", "ci"]` -> For DevOps procedures.

### Scopes
Control where your knowledge applies.
- **Global** (Default): Applies to all your projects.
- **Project**: `project:my-app` — Specific to a project.
- **Repo**: `repo:org/repo` — Specific to a git repository.

*Note: AI agents will prioritize knowledge that matches the scope of the project you are currently working on.*

## Privacy & Storage

Your memory is **100% local**. 

All data is stored in a high-performance SQLite database located at `~/.ai-devkit/memory.db`. No data is sent to the cloud, ensuring your proprietary coding patterns remain private.

This is portable so you can just copy the database file to another machine to use it across different machines.

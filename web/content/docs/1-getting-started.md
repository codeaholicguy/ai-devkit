---
title: Getting Started
description: Set up AI DevKit for agentic coding with Claude Code, Codex, Cursor, OpenCode, and other AI coding agents.
order: 1
---

**AI DevKit** is a workflow layer for AI coding assistants like Cursor, Claude Code, Codex, Devin, Antigravity, OpenCode, GitHub Copilot, and more. It gives them requirements, design, planning, implementation, testing, verification, memory, and review so they follow your engineering process instead of improvising in chat.

Use it when you want agentic coding to follow a clear software development lifecycle instead of a one-off prompt: initialize the project once, then give every supported AI coding agent the same workflow, memory, skills, and verification gates.

The direction of AI DevKit is to become the **operating system for AI-driven development**: one standard layer for workflows, memory, skills, and execution across agents.

## Why AI DevKit?

When working with AI assistants, you often find yourself:
- Repeating the same instructions across sessions
- Losing context between conversations
- Struggling to maintain consistency across features

AI DevKit solves these problems by giving your AI assistant:
- **Repeatable workflow** — Consistent process from requirements to review
- **Workflow skills** — Reusable process guidance tailored to AI-assisted development
- **Long-term memory** — Rules and patterns that persist across sessions
- **Skills** — Community-contributed capabilities your AI can learn
- **Plugins** — Optional npm packages that add CLI commands
- **Verification gates** — Fresh evidence before completion claims

## Prerequisites

Before you begin, make sure have:
- **Node.js** (version 20.20.0 or higher)
- **npm** or **npx** (comes with Node.js)
- An AI coding assistant (Cursor, Claude Code, Codex, Devin, Antigravity, OpenCode, GitHub Copilot, etc.)

## Installation

Install AI DevKit globally using npm:

```bash
npm install -g ai-devkit
```

Or use it directly with npx (no installation required):

```bash
npx ai-devkit@latest init
```

## Initialize Your Project

Navigate to your project directory and run:

```bash
ai-devkit init
```

You'll be prompted to select which AI environments you use (Cursor, Claude Code, etc.). AI DevKit will then:

1. **Create workflow docs** — A configured AI docs directory, `docs/ai/` by default, for requirements, design, planning, implementation, and testing
2. **Set up AI environment files** — Configuration, skills, and MCP servers where supported
3. **Save your preferences** — Stored in `.ai-devkit.json` for future updates

## Project Structure

After initialization, you'll have workflow docs your agent can use as durable context. The default path is `docs/ai/`; projects can customize it in `.ai-devkit.json`.

```
docs/ai/
├── requirements/    # What you're building and why
├── design/          # Architecture and technical decisions
├── planning/        # Task breakdown and timeline
├── implementation/  # Implementation notes and guides
├── testing/         # Test strategy and cases
├── deployment/      # Deployment procedures
└── monitoring/      # Monitoring and observability
```

This structure gives your AI assistant a clear handoff between phases instead of relying on chat history.

## Using Skills

AI DevKit installs **skills** into your AI environment. Skills are reusable capability packs the agent can load when your request matches a workflow or domain.

Terminal commands still start with `ai-devkit`; skills are used by the agent inside your coding assistant.

### Core Skills

| Skill | Purpose |
|---------|---------|
| `dev-lifecycle` | Orchestrate worktree setup, requirements, design, planning, implementation, testing, and review |
| `dev-worktree`, `dev-requirements`, `dev-design`, `dev-planning`, `dev-implementation`, `dev-testing`, `dev-review` | Run focused lifecycle phases directly |
| `tdd` | Add or change behavior test-first |
| `verify` | Require fresh command output before completion claims |
| `structured-debug` | Debug issues with reproduction, hypotheses, fixes, and verification |
| `document-code` | Document and understand existing code |
| `memory` | Store and retrieve reusable project knowledge |

For detailed usage, see [Development with AI DevKit](/docs/3-development-with-ai-devkit).

## Quick Example

Here's how a typical workflow might look:

```
1. In your terminal:
   $ ai-devkit init

2. In Cursor/Claude Code:
   > Use the dev-lifecycle skill to start requirements for user authentication with OAuth

   AI: "What feature would you like to build?"
   You: "Add user authentication with OAuth"

   AI guides you through requirements → design → planning → implementation → verification → review
```

## Next Steps

1. **Explore your AI editor** — Ask the agent to use `dev-lifecycle` on a small feature
2. **Read the workflows guide** — [Development with AI DevKit](/docs/3-development-with-ai-devkit)
3. **Set up memory** — [Give your AI long-term memory](/docs/6-memory)
4. **Install skills** — [Extend your AI's capabilities](/docs/7-skills)
5. **Install plugins** — [Add optional CLI commands](/docs/14-plugins)

## Need Help?

- Check the [Supported Agents](/docs/2-supported-agents) page for environment-specific setup
- Browse the [Roadmap](/roadmap) to see what's coming
- Open an issue on [GitHub](https://github.com/Codeaholicguy/ai-devkit) for bugs or questions

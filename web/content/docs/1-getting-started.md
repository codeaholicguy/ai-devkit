---
title: Getting Started
description: Set up AI DevKit as a control plane for Claude Code, Codex, Cursor, opencode, and other AI coding agents.
order: 1
---

**AI DevKit** is a control plane for AI coding agents. It gives supported tools like Cursor, Claude Code, Codex, Gemini CLI, opencode, Pi, GitHub Copilot, and others one setup model, one console, local-first memory, cross-agent communication, workflow skills, and verification.

Use it when your AI coding setup has grown from one assistant into multiple agents, terminals, config files, and memory gaps. Initialize the project once, then give every supported coding agent the same operating model.

Workflow skills are part of AI DevKit, but they are not the whole product. The bigger idea is one operating layer for setup, supervision, communication, local-first memory, and verification across the agents you already use.

## Why AI DevKit?

When working with AI coding agents, you often find yourself:
- Managing multiple terminal sessions with no shared control surface
- Copy-pasting prompts, logs, and test output between agents
- Repeating the same instructions across sessions
- Losing context between conversations
- Struggling to maintain consistency across tools and features

AI DevKit solves these problems by giving your coding agents:
- **One local setup** — `.ai-devkit.json` reconciles supported agent files from one source of truth
- **Agent console** — See and supervise running local agent sessions
- **Agent send** — Route prompts, logs, and stdin to the right running agent
- **Local memory** — Decisions and patterns that persist across sessions
- **Workflow skills** — Reusable process guidance tailored to multi-agent coding
- **Skills** — Reusable instruction packs your agents can load for domain-specific work
- **Plugins** — Optional npm packages that add CLI commands
- **Verification gates** — Fresh evidence before completion claims

## Prerequisites

Before you begin, make sure you have:
- **Node.js** (version 20.20.0 or higher)
- **npm** or **npx** (comes with Node.js)
- At least one supported AI coding agent or environment, such as Cursor, Claude Code, Codex, Gemini CLI, opencode, Pi, GitHub Copilot, Devin, or Antigravity

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
npx ai-devkit@latest init
```

You'll be prompted to select which AI environments you use (Cursor, Claude Code, etc.). AI DevKit will then:

1. **Create workflow docs** — A configured AI docs directory, `docs/ai/` by default, for requirements, design, planning, implementation, and testing
2. **Set up AI environment files** — Configuration, skills, and MCP servers where supported
3. **Save your preferences** — Stored in `.ai-devkit.json` for future updates

## First Value Moment

After initialization, open the local agent console:

Start one supported coding agent in this project first, such as Claude Code, Codex, Gemini CLI, or opencode. Then run:

```bash
ai-devkit agent list
ai-devkit agent console
```

Then send one task or log stream to a running agent:

```bash
ai-devkit agent send "summarize current branch and test status" --id <agent-name>
npm test 2>&1 | ai-devkit agent send --id <agent-name> --stdin
```

This is the core loop: see your agents, send work to the right session, and keep memory and verification available when the task needs them.

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

This structure gives your coding agents a clear handoff between phases instead of relying on chat history.

## Using Skills

AI DevKit installs **skills** into your AI environment. Skills are reusable capability packs the agent can load when your request matches a workflow or domain.

Terminal commands still start with `ai-devkit`; skills are used by the agent inside your coding assistant.

### Core Skills

| Skill | Purpose |
|---------|---------|
| `dev-lifecycle` | Orchestrate worktree setup, requirements, design, planning, implementation, testing, and review |
| `dev-worktree`, `dev-requirements`, `dev-design`, `dev-planning`, `dev-implementation`, `dev-testing`, `dev-review`, `dev-pr` | Run focused lifecycle and publish-for-review phases directly |
| `dev-commit` | Commit only intended, verified changes with a conventional message |
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
   $ npx ai-devkit@latest init
   $ ai-devkit agent console

2. In your AI coding agent:
   > Use the dev-lifecycle skill to start requirements for user authentication with OAuth

   AI: "What feature would you like to build?"
   You: "Add user authentication with OAuth"

   AI guides you through requirements -> design -> planning -> implementation -> verification -> review
```

## Next Steps

1. **Explore your AI editor** — Ask the agent to use `dev-lifecycle` on a small feature
2. **Open the agent console** — [Operate running agents](/docs/13-agent-console)
3. **Read the workflows guide** — [Development with AI DevKit](/docs/3-development-with-ai-devkit)
4. **Set up memory** — [Give your AI long-term memory](/docs/6-memory)
5. **Install skills** — [Extend your AI's capabilities](/docs/7-skills) or [browse AI coding agent skills](/skills)
6. **Install plugins** — [Add optional CLI commands](/docs/14-plugins)

## Need Help?

- Check the [Supported Agents](/docs/2-supported-agents) page for environment-specific setup
- Browse the [Roadmap](/roadmap) to see what's coming
- Open an issue on [GitHub](https://github.com/Codeaholicguy/ai-devkit) for bugs or questions

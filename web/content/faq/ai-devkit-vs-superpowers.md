---
title: AI DevKit vs Superpowers
description: A detailed comparison between AI DevKit and Superpowers, two tools that bring structure to AI-assisted software development.
---

Both **AI DevKit** and **Superpowers** solve the same core problem: AI coding agents are powerful, but they need structure. Without a clear process, results become inconsistent, context is lost between sessions, and important engineering steps get skipped.

These tools take different paths to fix that.

## Quick Comparison

| | AI DevKit | Superpowers |
|---|---|---|
| **Type** | CLI toolkit with memory and skills | Opinionated skills framework |
| **Install** | `npm install -g ai-devkit` | Agent-specific setup guide (see official repository) |
| **Approach** | Infrastructure focused: tools, memory, and project scaffolding | Behavior focused: process instructions injected into agent prompts |
| **Memory** | Built-in local SQLite memory system | Relies on plan documents and git history |
| **Skills** | Built-in core skills (`dev-lifecycle`, `debug`, `simplify-implementation`, `capture-knowledge`) plus community registry via `skill add/remove/find` | 14 built-in composable skills |
| **Agents supported** | 11+ (Cursor, Claude Code, Codex, Copilot, Gemini CLI, OpenCode, Antigravity, Windsurf, and more) | 4 (Claude Code, Cursor, Codex, OpenCode) |
| **Documentation** | Phase-based directory structure (`docs/ai/`) | Design docs saved to `docs/plans/` |
| **Execution model** | Single agent per feature with persistent memory | Sub-agent dispatching with two-stage review |
| **License** | MIT | MIT |
| **Best for** | Teams that want flexibility, persistent memory, and broad agent support | Teams that want strict, opinionated, multi-agent workflow enforcement |

> Note: Agent and skill counts can change over time. Check each project's repository for the latest numbers.

## Quick Decision Guide

- Choose **AI DevKit** if you want one agent per feature, persistent local memory, broad agent support, and flexible workflows.
- Choose **Superpowers** if you want strict process gates and sub-agent orchestration.
- Use both if you want AI DevKit as the infrastructure layer and Superpowers as the behavioral layer.

## First 10 Minutes

### AI DevKit

```bash
npm install -g ai-devkit
ai-devkit init
# then in your AI editor
/new-requirement
```

### Superpowers

Follow the official setup guide for your agent at https://github.com/obra/superpowers, then run one planning skill and one implementation skill on a small test feature to evaluate fit.

## How They Work

### AI DevKit

AI DevKit is a **CLI toolkit** that you install globally and initialize per project. It scaffolds documentation, provides slash commands for each development phase, includes built-in skills like `dev-lifecycle`, `debug`, `simplify-implementation`, and `capture-knowledge`, and adds persistent local memory.

```bash
npm install -g ai-devkit
ai-devkit init
```

After initialization, your project gets a `docs/ai/` directory with subdirectories for each phase: requirements, design, planning, implementation, testing, deployment, and monitoring. Your AI agent uses commands like `/new-requirement`, `/execute-plan`, and `/code-review` to move through a structured workflow.

AI DevKit also provides a **local memory system** backed by SQLite. It stores coding standards, patterns, and decisions. This memory persists across sessions, so your AI agent can recall project-specific knowledge without you repeating it.

### Superpowers

Superpowers is an **agentic skills framework** (skills strongly drive how the AI plans and executes work). It provides 14 composable skills across the development lifecycle.

When installed, Superpowers injects skill instructions into your AI agent's context. Skills like `brainstorming`, `writing-plans`, and `test-driven-development` enforce strict process gates. The agent must follow each phase before proceeding to the next.

A distinctive feature is **sub-agent dispatching**. Superpowers can spin up fresh, isolated AI agent instances per task. Each sub-agent's work goes through a two-stage review: first for specification compliance, then for code quality.

## Key Differences

### Memory and Context Persistence

**AI DevKit** includes a dedicated memory system. You can store and search knowledge using MCP tools or CLI commands (`ai-devkit memory store`, `ai-devkit memory search`). Memory is scoped by global, project, or repository level and tagged for easy discovery. This means your AI agent can recall decisions, patterns, and conventions from previous sessions.

**Superpowers** does not have a built-in memory system. Context persists through plan documents saved to `docs/plans/` and git commit history. Each sub-agent starts fresh, which prevents context pollution but also means prior knowledge must be explicitly included in task descriptions.

### Workflow Enforcement

**AI DevKit** provides structure but remains flexible. Built-in skills like `dev-lifecycle` and `debug` encourage consistency, while `simplify-implementation` and `capture-knowledge` keep solutions practical and reusable. You can still use commands in the order that fits your project. The docs structure is guidance, not a hard gate.

**Superpowers** enforces strict process discipline. In its documented methodology, test-first development is treated as mandatory.

### Skills and Extensibility

**AI DevKit** combines built-in workflow skills (`dev-lifecycle`, `debug`, `simplify-implementation`, `capture-knowledge`) with a community-driven skill registry. You can browse, install, and manage additional skills with CLI commands (`ai-devkit skill add`, `ai-devkit skill find`). This gives teams a solid default methodology plus extensibility for domain-specific capabilities.

**Superpowers** comes with 14 built-in skills that form one cohesive methodology. There is a `writing-skills` skill for contributing new skills, but the system is more monolithic, with skills designed to work together in one workflow.

### Agent Support

**AI DevKit** supports 11+ AI coding environments, including Cursor, Claude Code, GitHub Copilot, Gemini CLI, OpenAI Codex, OpenCode, Antigravity, Windsurf, KiloCode, AMP, and Roo Code. Each environment gets tailored configuration.

**Superpowers** focuses on 4 platforms: Claude Code, Cursor, Codex, and OpenCode. Each has a dedicated installation method and configuration directory.

### Execution Model

**AI DevKit** usually runs one agent per feature, enhanced by persistent memory and structured docs. In practice, teams often use the built-in `dev-lifecycle` skill, which creates a new git worktree per feature by default. This lets multiple features run in parallel while each feature stays isolated at the branch/worktree level.

AI DevKit's preferred scaling pattern is to maximize context quality with one agent per feature, then scale out by feature (more worktrees), instead of splitting one feature across many sub-agents. This reduces context fragmentation and avoids extra context pressure from coordinating many agents on the same feature.

**Superpowers** uses a multi-agent architecture. The `subagent-driven-development` skill dispatches fresh sub-agents per task, each with two-stage review. This helps prevent context contamination, but it usually costs more coordination and compute.

## When to Use Which

### Choose AI DevKit if you want:

- A lightweight CLI toolkit that works with your existing workflow
- Persistent memory across sessions without repeating yourself
- Support for a wide range of AI coding environments
- Flexibility to adopt structured practices gradually
- Built-in skills for lifecycle, debugging, simplification, and knowledge capture
- A community skill ecosystem to extend capabilities
- Simple installation via npm

### Choose Superpowers if you want:

- Strict process enforcement with hard gates between phases
- Multi-agent task execution with built-in code review
- An opinionated methodology where TDD is mandatory
- Sub-agent isolation to prevent context pollution
- A self-contained framework with all skills included

### Using Them Together

AI DevKit and Superpowers are not mutually exclusive. AI DevKit can provide the **infrastructure layer** (memory, skill management, scaffolding), while Superpowers can provide the **behavioral layer** (strict process rules and multi-agent orchestration). Teams that want both persistent memory and strict workflow enforcement can combine them.

## Getting Started with AI DevKit

Ready to add structure to your AI-assisted development? Install AI DevKit and initialize your project:

```bash
npm install -g ai-devkit
ai-devkit init
```

Then use commands like `/new-requirement` to start building with a structured workflow, or explore the [documentation](https://ai-devkit.com/docs) to learn more.

## Sources

- AI DevKit repository: https://github.com/codeaholicguy/ai-devkit
- Superpowers repository: https://github.com/obra/superpowers

---
title: What is AI DevKit?
description: An overview of AI DevKit, the open-source toolkit for structured, consistent AI-assisted software development.
slug: what-is-ai-devkit
order: 0
---

AI DevKit is an open-source toolkit that brings structure and consistency to AI-assisted software development. It works alongside AI coding assistants like Cursor, Claude Code, Codex, GitHub Copilot, Gemini CLI, and others, giving them the context, workflows, and memory they need to help you build software more effectively.

AI DevKit is intentionally feature-rich: it combines workflow orchestration, documentation scaffolding, memory, skills, linting, and agent operations in one toolkit. The long-term direction is to become the **operating system for AI-driven development**.

## The Problem

AI coding assistants are powerful, but using them day-to-day often feels inconsistent:

- **Context is lost between sessions.** Your AI forgets past decisions, coding standards, and project conventions every time you start a new conversation.
- **Workflows are ad hoc.** There's no standard way to move from requirements through design, implementation, and testing with AI assistance.
- **Instructions are repeated constantly.** You re-explain the same rules, preferences, and patterns in every session.
- **Knowledge stays siloed.** Lessons learned during development aren't captured in a way your AI assistant can reuse later.

## Platform Direction

AI DevKit is evolving toward an operating system model for AI-driven development:

- **Standard interfaces** for commands, skills, memory, and docs across agents
- **Stateful development context** through phase docs and long-term memory
- **Composable capabilities** via built-in and community skills
- **Operational controls** like lint checks, worktree workflows, and agent management

This means teams can run consistent workflows regardless of which AI coding assistant they use.

## Feature Inventory

AI DevKit includes the following core feature areas:

| Feature Area | What You Get |
|---|---|
| **Project initialization** | `ai-devkit init` wizard to scaffold `docs/ai/`, environment files, and project config |
| **Phase templates** | Requirements, design, planning, implementation, testing, deployment, and monitoring templates |
| **Structured slash commands** | End-to-end development commands installed into supported AI environments |
| **Memory system** | Local SQLite memory with `store`, `search`, and `update` commands plus MCP integration |
| **Skills system** | Built-in skills and community registry support (`add`, `find`, `update`, `list`, `remove`) |
| **Agent management** | Inspect and focus running agents via `ai-devkit agent list` and `ai-devkit agent open` |
| **Workflow linting** | `ai-devkit lint` checks docs, feature conventions, and git/worktree alignment |
| **Global setup** | `ai-devkit setup --global` to install command packs for global agent environments |

## Available Slash Commands

These commands are installed into your AI coding environment:

- `/new-requirement`
- `/review-requirements`
- `/review-design`
- `/execute-plan`
- `/update-planning`
- `/check-implementation`
- `/writing-test`
- `/code-review`
- `/debug`
- `/capture-knowledge`
- `/simplify-implementation`
- `/remember`

## Available CLI Commands

Top-level CLI commands:

- `ai-devkit init`
- `ai-devkit phase`
- `ai-devkit setup --global`
- `ai-devkit lint`
- `ai-devkit skill ...`
- `ai-devkit memory ...`
- `ai-devkit agent ...`

Subcommands:

- `ai-devkit skill add|list|remove|update|find|rebuild-index`
- `ai-devkit memory store|search|update`
- `ai-devkit agent list|open`

## Built-in Skills

AI DevKit includes these built-in skills in the default registry:

| Skill | Purpose |
|---|---|
| `dev-lifecycle` | End-to-end SDLC workflow across requirements, design, planning, implementation, testing, and review |
| `debug` | Structured debugging and root-cause workflow before code changes |
| `simplify-implementation` | Reduce complexity and improve maintainability of existing implementations |
| `capture-knowledge` | Analyze code and capture reusable project knowledge in docs |
| `memory` | Use AI DevKit memory service from CLI workflows |
| `technical-writer` | Improve documentation quality and clarity |

## How AI DevKit Helps

AI DevKit addresses these gaps with four core capabilities:

### Structured Development Workflows

AI DevKit provides a complete set of slash commands that guide you and your AI through each phase of software development:

- **Requirements** - Define what you're building and why
- **Design** - Architect solutions with diagrams and technical decisions
- **Planning** - Break work into actionable tasks
- **Implementation** - Execute tasks step-by-step with AI guidance
- **Testing** - Generate tests and validate your code
- **Code Review** - Review changes before committing

These workflows generate documentation in a `docs/ai/` directory inside your project, so your AI always has up-to-date project context.

### Long-Term Memory

The [Memory](/docs/6-memory) service gives your AI assistant persistent, local storage for coding standards, patterns, and project-specific knowledge. Once stored, this knowledge is automatically available in future sessions, so your AI never makes the same mistake twice.

- 100% local storage (SQLite), no data leaves your machine
- Scoped by project, repository, or global
- Accessible via MCP (Model Context Protocol), CLI, or skills

### Skills System

[Skills](/docs/7-skills) are community-driven plugins that teach your AI new capabilities. Install a skill, and your agent immediately gains specialized knowledge, from frontend design patterns to database optimization to security best practices.

- Install from community registries with one command
- Create and share your own skills
- Automatically available to all configured AI environments

### Multi-Agent Support

AI DevKit isn't tied to a single tool. It supports [many AI coding environments](/docs/2-supported-agents) and sets up the right configuration files, commands, and instructions for each one. Switch between agents or use multiple at the same time. Your workflows, memory, and skills carry across all of them.

## A Typical Workflow

Here's what working with AI DevKit looks like in practice:

1. Run `ai-devkit init` in your terminal to set up your project
2. Open your AI editor and type `/new-requirement`
3. Your AI walks you through defining requirements, designing a solution, and planning tasks
4. Type `/execute-plan` to implement the feature step-by-step
5. Use `/writing-test` to generate tests, then `/code-review` before committing

Each step produces documentation in `docs/ai/` that gives your AI full context for the next step.

## How It Works

1. **Initialize** - Run `ai-devkit init` to set up your project with documentation templates and environment-specific configurations.
2. **Develop** - Use slash commands like `/new-requirement` and `/execute-plan` inside your AI editor to work through structured workflows.
3. **Remember** - Store important decisions and patterns in memory so they persist across sessions.
4. **Extend** - Install skills to give your AI specialized knowledge for your stack and domain.

## Who Is It For?

- **Individual developers** who want more consistent and productive AI-assisted workflows
- **Teams** that need shared coding standards and conventions enforced across AI sessions
- **Open-source maintainers** who want contributors' AI assistants to follow project guidelines automatically

## What's Next?

- **[Getting Started](/docs/1-getting-started)** - Set up AI DevKit in your project
- **[Supported Agents](/docs/2-supported-agents)** - See which AI tools are supported
- **[Development with AI DevKit](/docs/3-development-with-ai-devkit)** - Learn the full development workflow
- **[Memory](/docs/6-memory)** - Give your AI long-term memory

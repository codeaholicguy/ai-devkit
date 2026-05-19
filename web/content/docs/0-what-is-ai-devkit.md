---
title: What is AI DevKit?
description: An overview of AI DevKit, the open-source workflow layer that makes AI coding agents follow your engineering process.
slug: what-is-ai-devkit
order: 0
---

AI DevKit is an open-source workflow layer for AI coding agents. It works alongside Cursor, Claude Code, Codex, GitHub Copilot, Gemini CLI, and others, giving them the process, memory, skills, and verification gates they need to behave less like one-off chatbots and more like disciplined engineering partners.

The purpose is simple: make AI-assisted development reliable. AI DevKit combines workflow orchestration, local memory, skills, verification, review, linting, and agent operations in one toolkit. The long-term direction is to become the **operating system for AI-driven development**.

## The Problem

AI coding assistants are powerful, but using them day-to-day often feels inconsistent:

- **Agents start coding too early.** Requirements and design decisions stay vague until the implementation is already wrong.
- **"Done" is not evidence.** The agent can claim success without fresh test or build output.
- **Context is lost between sessions.** Past decisions, coding standards, and project conventions disappear when a new chat starts.
- **Instructions are repeated constantly.** You re-explain the same rules, preferences, and patterns in every session.
- **Every agent has a different config surface.** Teams rewrite the same workflow for `CLAUDE.md`, Cursor rules, Codex instructions, and other tools.

## Platform Direction

AI DevKit is evolving toward an operating system model for AI-driven development:

- **Standard interfaces** for commands, skills, memory, and docs across agents
- **Stateful development context** through phase docs and long-term memory
- **Composable capabilities** via built-in and community skills
- **Operational controls** like lint checks, worktree workflows, and agent management

This means teams can run the same workflow regardless of which AI coding assistant they use: one config, all agents.

## How AI DevKit Helps

AI DevKit addresses these gaps with four core capabilities:

### Repeatable Engineering Workflow

AI DevKit provides slash commands that make your AI agent plan before code and review before push:

- **Requirements** - Define what you're building and why
- **Design** - Architect solutions with diagrams and technical decisions
- **Planning** - Break work into actionable tasks
- **Implementation** - Execute tasks step-by-step with AI guidance
- **Testing** - Generate tests and validate your code
- **Code Review** - Review changes before committing

These workflows generate documentation in a `docs/ai/` directory inside your project, so your AI has durable context and a clear handoff between phases.

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
6. Require verification output before the agent claims the work is complete

Each step produces documentation in `docs/ai/` that gives your AI full context for the next step.

## How It Works

1. **Initialize** - Run `ai-devkit init` to set up your project with workflow docs and environment-specific agent configuration.
2. **Develop** - Use slash commands like `/new-requirement` and `/execute-plan` inside your AI editor so the agent follows the workflow instead of improvising in chat.
3. **Remember** - Store important decisions and patterns in memory so they persist across sessions.
4. **Extend** - Install skills to give your AI specialized knowledge for your stack and domain.

## Who Is It For?

- **Individual developers** who want AI agents to plan before code and verify before done
- **Teams** that need shared coding standards and conventions enforced across AI sessions
- **Open-source maintainers** who want contributors' AI assistants to follow project guidelines automatically

## What's Next?

- **[Getting Started](/docs/1-getting-started)** - Set up AI DevKit in your project
- **[Supported Agents](/docs/2-supported-agents)** - See which AI tools are supported
- **[Development with AI DevKit](/docs/3-development-with-ai-devkit)** - Learn the full development workflow
- **[Memory](/docs/6-memory)** - Give your AI long-term memory

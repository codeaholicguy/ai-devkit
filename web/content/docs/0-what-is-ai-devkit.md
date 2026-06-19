---
title: What is AI DevKit?
description: An overview of AI DevKit, the control plane for AI coding agents.
slug: what-is-ai-devkit
order: 0
---

AI DevKit is an open-source control plane for AI coding agents. It works alongside Cursor, Claude Code, Codex, GitHub Copilot, Gemini CLI, opencode, Pi, and other tools, giving them shared setup, local-first memory, skills, communication, and verification gates.

The purpose is simple: make multi-agent coding manageable. AI DevKit combines one project-local config, one console, cross-agent communication, local-first memory, workflow skills, verification, review, and linting in one toolkit. Workflow docs are part of the system, but the bigger product is the operating layer above the agents you already use.

## The Problem

AI coding agents are powerful, but using them day-to-day often feels inconsistent:

- **Agents are scattered across terminals.** You have no single view of what is running or where work is happening.
- **Copy-pasting context becomes the workflow.** Logs, prompts, and follow-up tasks move manually between isolated sessions.
- **Agents start coding too early.** Requirements and design decisions stay vague until the implementation is already wrong.
- **"Done" is not evidence.** The agent can claim success without fresh test or build output.
- **Context is lost between sessions.** Past decisions, coding standards, and project conventions disappear when a new chat starts.
- **Instructions are repeated constantly.** You re-explain the same rules, preferences, and patterns in every session.
- **Every agent has a different config surface.** Teams rewrite the same workflow for `CLAUDE.md`, Cursor rules, Codex instructions, and other tools.

## Platform Direction

AI DevKit is evolving toward an operating layer for AI coding agents:

- **Standard interfaces** for setup, skills, memory, and docs across agents
- **Operational controls** for discovering, supervising, and messaging local agent sessions
- **Stateful development context** through phase docs and long-term memory
- **Composable capabilities** via built-in and community skills
- **CLI extensions** through global npm plugins that add optional commands
- **Verification controls** like lint checks, test evidence, worktree workflows, and code review

As teams move from one assistant to many coding agents, AI DevKit keeps setup, memory, communication, and verification consistent across tools. You choose the agents; AI DevKit gives them one operating model.

## How AI DevKit Helps

AI DevKit addresses these gaps with five core capabilities:

### One Config And Agent Console

AI DevKit gives supported agents one project-local setup source and one local console for running sessions:

- `.ai-devkit.json` stores your selected environments, phases, skills, and setup preferences
- `ai-devkit agent list` shows detected local agent sessions
- `ai-devkit agent console` opens a live terminal UI for supervising running agents
- `ai-devkit agent send` routes prompts, logs, and stdin to a running agent or saved group

### Repeatable Engineering Workflow

AI DevKit provides workflow skills that make coding agents plan before code and review before push:

- **Requirements** - Define what you're building and why
- **Design** - Architect solutions with diagrams and technical decisions
- **Planning** - Break work into actionable tasks
- **Implementation** - Execute tasks step-by-step with AI guidance
- **Testing** - Generate tests and validate your code
- **Code Review** - Review changes before committing

These workflows generate documentation in a `docs/ai/` directory inside your project, so your agents have durable context and a clear handoff between phases.

### Long-Term Memory

The [Memory](/docs/6-memory) service gives your coding agents persistent, local storage for coding standards, patterns, and project-specific knowledge. Once stored, this knowledge is available in future sessions, so agents can reuse prior decisions instead of asking you to repeat them.

- 100% local storage (SQLite), no data leaves your machine
- Scoped by project, repository, or global
- Accessible via MCP (Model Context Protocol), CLI, or skills

### Skills System

[Skills](/docs/7-skills) are reusable instruction packs that teach coding agents specific workflows or domain practices. Install a skill, and the selected agent environment can load guidance for work such as frontend design, database optimization, security review, or multi-agent coordination.

- Install from community registries with one command
- Create and share your own skills
- Automatically available to all configured AI environments

### Multi-Agent Support

AI DevKit isn't tied to a single tool. It supports [many AI coding environments](/docs/2-supported-agents) and sets up the right configuration files, skills, and instructions for each one. Switch between agents or use multiple at the same time. Your workflows, memory, skills, and operating model carry across supported environments.

## A Typical Workflow

Here's what working with AI DevKit looks like in practice:

1. Run `npx ai-devkit@latest init` in your terminal to set up your project
2. Open `ai-devkit agent console` to inspect local running agents
3. Use `ai-devkit agent send` to route prompts, logs, or test output to the right session
4. Ask an agent to use the `dev-lifecycle` skill to clarify requirements, design, and implementation tasks
5. Use memory, `tdd`, and `verify` while implementing
6. Require verification output before the agent claims the work is complete

Each step produces documentation in `docs/ai/` that gives your AI full context for the next step.

## How It Works

1. **Initialize** - Run `npx ai-devkit@latest init` to set up your project with workflow docs and environment-specific agent configuration.
2. **Operate** - Use `agent list`, `agent console`, and `agent send` to supervise and route work across running local agents.
3. **Develop** - Ask the agent to use installed workflow skills such as `dev-lifecycle`, `tdd`, and `verify` so it follows the workflow instead of improvising in chat.
4. **Remember** - Store important decisions and patterns in memory so they persist across sessions.
5. **Extend** - Install skills to give your AI specialized knowledge for your stack and domain.
6. **Add tools** - Install plugins when you want optional CLI commands such as dashboards or heavier integrations.

## Who Is It For?

- **Individual developers** who want AI agents to plan before code and verify before done
- **Teams** that need shared coding standards and conventions enforced across AI sessions
- **Open-source maintainers** who want contributors' AI coding agents to follow project guidelines automatically
- **Developers using multiple coding agents** who want one local setup, console, memory layer, and communication path

## What's Next?

- **[Getting Started](/docs/1-getting-started)** - Set up AI DevKit in your project
- **[Supported Agents](/docs/2-supported-agents)** - See which AI tools are supported
- **[Development with AI DevKit](/docs/3-development-with-ai-devkit)** - Learn the full development workflow
- **[Memory](/docs/6-memory)** - Give your AI long-term memory
- **[Plugins](/docs/14-plugins)** - Add optional npm-powered CLI commands

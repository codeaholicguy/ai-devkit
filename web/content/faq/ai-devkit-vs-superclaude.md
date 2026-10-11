---
title: AI DevKit vs SuperClaude
description: A practical comparison of AI DevKit and the SuperClaude framework for developers using Claude Code and other AI coding agents.
order: 14
---

Both **AI DevKit** and **SuperClaude** add structure on top of AI coding agents, but they operate at different layers.

- **AI DevKit** is a control plane for many coding agents: one config, one console, local-first memory, cross-agent communication, workflow skills, and verification.
- **SuperClaude** is a configuration framework for Claude Code only. It installs behavioral instruction files (commands, specialist personas, modes, and MCP presets) into `~/.claude` to make a single agent behave more predictably.

The main difference is scope: SuperClaude deepens what one agent (Claude Code) does. AI DevKit coordinates how many agents work together.

## Quick Comparison

| | AI DevKit | SuperClaude |
|---|---|---|
| **Type** | Control plane for AI coding agents with setup, memory, communication, skills, and verification | Configuration framework that enhances Claude Code |
| **Install** | `npm install -g ai-devkit` | `pipx install SuperClaude && SuperClaude install` (npm option also available) |
| **Approach** | One operating model across agents: config, memory, communication, workflow skills, and verification | Behavioral instruction files (commands, personas, modes, MCP presets) installed into `~/.claude` |
| **Memory** | Built-in local SQLite memory service, shared across agents via MCP | No dedicated memory store; relies on session files and framework docs |
| **Console** | Local console to see and message running agent sessions | No multi-session console |
| **Agents supported** | Many environments: Claude Code, Cursor, Codex, Copilot, Gemini CLI, opencode, and others | Claude Code only |
| **Skills** | Built-in workflow skills plus installable skills from registries | Bundled commands, agents, and modes inside one framework |
| **License** | MIT | MIT |
| **Best for** | Teams running several coding agents that need one operating model | Claude Code users who want a richer single-agent command and persona system |

> Note: Framework contents change between releases. Check each project's repository for current commands and agents.

## Quick Decision Guide

- Choose **AI DevKit** if you run more than one coding agent (or plan to) and need shared setup, supervision, memory, and verification across them.
- Choose **SuperClaude** if Claude Code is your only agent and you want a large, opinionated library of slash commands and specialist personas.
- Use both if you like SuperClaude's Claude Code behaviors but still want AI DevKit's cross-agent memory, console, and verification. They do not conflict: SuperClaude configures Claude Code's behavior, AI DevKit operates the agents around it.

## First 10 Minutes

### AI DevKit

```bash
npm install -g ai-devkit
ai-devkit setup
cd your-project
ai-devkit init
```

Then start a supported agent and run `ai-devkit agent list` to see it in the console.

### SuperClaude

```bash
pipx install SuperClaude
SuperClaude install
```

Then use its `/sc:` commands and `@agent-` personas inside Claude Code.

## Related

- [AI DevKit vs Spec Kit](/faq/ai-devkit-vs-spec-kit)
- [AI DevKit vs Superpowers](/faq/ai-devkit-vs-superpowers)
- [AI DevKit vs Agent OS](/faq/ai-devkit-vs-agent-os)
- [Supported AI agents and environments](/docs/2-supported-agents)

# AI DevKit CLI

The command-line interface for **AI DevKit** — the control plane for AI coding agents.

[![npm version](https://img.shields.io/npm/v/ai-devkit.svg)](https://www.npmjs.com/package/ai-devkit)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

Use this package when you want the `ai-devkit` command to install agent skills, memory, verification gates, MCP configuration, and `docs/ai/` workflow files into a project.

## Features

- **Workflow layer** — Requirements, design, planning, implementation, testing, verification, and review
- **AI environment setup** — One-command configuration for Cursor, Claude Code, Codex, Gemini CLI, Devin, and other agents
- **Skill management** — Install reusable AI skills that change agent behavior
- **Persistent memory** — Store project decisions and conventions so agents can reuse them across sessions

## Installation

```bash
# Run directly (no install needed)
npx ai-devkit@latest init

# Or install globally
npm install -g ai-devkit
```

## Quick Start

```bash
# Set up your project interactively
ai-devkit init

# Set up from template (no step-by-step prompts when template is complete)
ai-devkit init --template ./ai-devkit.init.yaml
```

This will:

1. Create a `.ai-devkit.json` configuration file
2. Set up your AI coding agent environment, including skills and MCP servers where supported
3. Generate `docs/ai/` workflow docs for requirements, design, planning, implementation, and testing
4. Give your agent a repeatable process instead of relying on one-off chat instructions

After initialization, your repo gets project-local files you can review and commit:

```text
your-project/
├── .ai-devkit.json
├── .claude/        # or .cursor/, .codex/, etc. based on selected agents
│   ├── skills/
│   └── settings.json
└── docs/ai/
    ├── requirements/
    ├── design/
    ├── planning/
    ├── implementation/
    └── testing/
```

In your AI editor, ask the agent to use the `dev-lifecycle` skill to clarify the feature before editing code.

## Common Commands

```bash
# Initialize project
ai-devkit init

# Initialize project from YAML/JSON template
ai-devkit init --template ./ai-devkit.init.yaml

# Install/reconcile project setup from .ai-devkit.json
ai-devkit install

# Overwrite all existing install artifacts without extra prompts
ai-devkit install --overwrite

# Add a development phase
ai-devkit phase requirements

# Validate workspace docs readiness
ai-devkit lint

# Validate a feature's docs and git branch/worktree conventions
ai-devkit lint --feature lint-command

# Emit machine-readable output for CI
ai-devkit lint --feature lint-command --json

# Probe capacity for every supported provider (codex, z.ai, OpenAI, Anthropic, Claude, Devin, Antigravity)
ai-devkit capacity

# Probe a single provider's capacity
ai-devkit capacity zai
ai-devkit capacity agy

# Claude uses CLAUDE_CODE_OAUTH_TOKEN, the active profile file, or the
# default-profile macOS Claude Code Keychain item
ai-devkit capacity claude

# Emit the JSON report (single object for one provider, array for many)
ai-devkit capacity codex --json

# Install a skill
ai-devkit skill add <skill-registry> [skill-name]

# List skills installed across known global environment paths
ai-devkit skill list --global

# Limit global listing to selected environments
ai-devkit skill list --global --env claude codex

# Store project knowledge for future agent sessions
ai-devkit memory store
```

On macOS, the operating system may request Keychain access the first time the Claude fallback is used. Custom `CLAUDE_CONFIG_DIR` profiles use only their own credentials file and never the global Keychain item.

## UI Formatting Standards

Shared CLI presentation helpers live in `src/util/`. Commands should use
`status.ts` for status labels and chalk colors, `time-format.ts` for relative
or `Mon D · HH:mm` time labels with an injectable `now` clock, and
`pluralize.ts` for count labels. Keep JSON output independent from these
terminal-only helpers so machine-readable shapes stay stable.

Template example:

```yaml
version: 1
environments:
  - codex
  - claude
phases:
  - requirements
  - design
  - planning
  - implementation
  - testing
skills:
  - registry: codeaholicguy/ai-devkit
    skill: dev-lifecycle
  - registry: codeaholicguy/ai-devkit
    skill: verify
  - registry: codeaholicguy/ai-devkit
    skill: memory
  - registry: codeaholicguy/ai-devkit
    skill: tdd
```

### Durable agents

Create a reusable identity, then send prompts by its name or ID:

```bash
ai-devkit agent start --mode durable --type claude --name reviewer
ai-devkit agent send 'Review the current changes' --id reviewer
ai-devkit agent sessions --all --json
ai-devkit agent session detail --id reviewer --json
```

Durable mode supports Claude, Codex, and Pi. A compatible `devkitd` owns these
agents and their runs in `~/.ai-devkit/daemon.db`; closing the CLI does not cancel
a run. Pass `--debug` to `agent start` or `agent send` to trace daemon capability
negotiation and routing (`ai-devkit:agent:durable`). A nonzero provider exit or
invalid result stream fails the run. After a daemon restart, surviving providers
are monitored by process identity; if their completion cannot be recovered, the
run becomes interrupted with an unknown exit code.

On upgrade, `devkitd` imports existing durable identities from `agents.db` once,
retaining that file for recovery. After ownership transfer, the updated CLI
requires a compatible daemon and refuses local fallback to stale rows. Avoid
running older CLI binaries or downgrading after transfer: later legacy writes
are not imported. If import fails, repair the reported source/conflict and retry;
do not delete the ownership fence (`~/.ai-devkit/durable-owner-v1.json`) to
bypass the error. Corrupt daemon databases are preserved for recovery once
durable ownership has transferred.

## Documentation

📖 **For the full user guide, workflow examples, and best practices, visit:**

**[ai-devkit.com/docs](https://ai-devkit.com/docs/)**

## License

Apache License 2.0

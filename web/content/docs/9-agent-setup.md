---
title: Agent Setup
description: Use `ai-devkit install` to apply or reconcile AI agent setup from your project configuration.
---

The `ai-devkit install` command applies your saved project configuration (`.ai-devkit.json`) to your workspace.  
It is the best command for repeatable setup, onboarding, and syncing agent files after configuration changes.

Before running these commands:
- Install AI DevKit (`npm install -g ai-devkit`) or use `npx ai-devkit@latest ...`
- Run commands from your project root directory

## When to Use `install` vs `init`

Use `ai-devkit init` when:
- You are setting up AI DevKit in a project for the first time
- You want interactive prompts to choose environments and phases
- You want non-interactive bootstrap from a template file (`ai-devkit init --template`)

Use `ai-devkit install` when:
- `.ai-devkit.json` already exists
- You want deterministic setup without re-answering prompts
- You want to reconcile missing agent files or command folders

## Basic Usage

Create a file named `fullstack-engineer.yaml` in your project root with this content:

```yaml
environments:
  - cursor
  - claude
  - codex
phases:
  - requirements
  - design
  - planning
  - implementation
  - testing
skills:
  - registry: codeaholicguy/ai-devkit
    skill: debug
  - registry: codeaholicguy/ai-devkit
    skill: dev-lifecycle
```

Initialize from that template:

```bash
ai-devkit init --template ./fullstack-engineer.yaml
```

If `.ai-devkit.json` already exists in this project, apply setup with:

```bash
ai-devkit install
```

Use a non-default config file if your project stores AI DevKit config elsewhere:

```bash
ai-devkit install --config ./.ai-devkit.team.json
```

Overwrite existing install artifacts without extra prompts:

```bash
ai-devkit install --overwrite
```

## What `ai-devkit install` Sets Up

Based on your configured environments, AI DevKit installs or updates files such as:
- `AGENTS.md` or `CLAUDE.md`
- Environment command folders (for example `.cursor/commands/`, `.claude/commands/`, `.codex/commands/`)
- Agent skill files (for example `.cursor/skills/`, `.claude/skills/`, `.agents/skills/` for Codex, and `.agent/skills/` for Antigravity)
- Other environment-specific templates defined by AI DevKit

The exact artifacts depend on the environments configured in `.ai-devkit.json`.

> **Note:** `ai-devkit install` manages project-local artifacts from `.ai-devkit.json`. For environments that also support global prompt or workflow installation, use `ai-devkit setup --global` separately.

## Typical Agent Setup Flow

1. Initialize once:

```bash
ai-devkit init
```

Or initialize deterministically from template:

```bash
ai-devkit init --template ./fullstack-engineer.yaml
```

2. Commit `.ai-devkit.json` to your repository.

3. On another machine or for another teammate, run:

```bash
ai-devkit install
```

This keeps agent setup consistent across contributors and CI-like automation workflows.

## Troubleshooting

### `.ai-devkit.json` not found

Run:

```bash
ai-devkit init
```

This creates the configuration file used by `install`.

If you prefer non-interactive setup, use the template command shown in Basic Usage.

### Existing files are not updated

If you want to force replacement of install-managed artifacts, run:

```bash
ai-devkit install --overwrite
```

### I changed environments but setup still looks old

Re-run:

```bash
ai-devkit install
```

This re-applies setup using the current `.ai-devkit.json` content.

## Next Steps

- [Supported AI Agents & Environments](/docs/2-supported-agents)
- [Getting Started](/docs/1-getting-started)
- [Development with AI DevKit](/docs/3-development-with-ai-devkit)

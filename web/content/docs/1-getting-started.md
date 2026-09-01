---
title: Getting Started
description: Connect your coding agents once, then initialize AI DevKit's workflow in each project.
order: 1
---

**AI DevKit** gives your coding agents one operating layer for setup, supervision, communication, local-first memory, workflow skills, and verification.

Getting started has two scopes:

1. **Once per machine:** run `setup` to connect detected local agents, install their session integrations, and install AI DevKit's built-in skills globally.
2. **Once per project:** run `init` to create `.ai-devkit.json`, environment-specific project files, and workflow documentation.

Keeping these steps separate makes it clear which changes affect your machine and which files belong in your project.

## Prerequisites

Before you begin, make sure you have:

- **Node.js 20.20.0 or newer**
- **npm** or **npx**, which comes with Node.js
- **tmux** for interactive managed agents (provisional compatibility floor: tmux 2.6+; setup reports but does not reject older versions)
- At least one [supported AI coding agent or environment](/docs/2-supported-agents)

- **Node.js 20.20.0 or newer**
- **npm** or **npx**, which comes with Node.js
- At least one [supported AI coding agent or environment](/docs/2-supported-agents)

Install and launch your coding agent at least once before running `setup`. AI DevKit detects an agent from its home directory, so a newly installed agent that has never started may be reported as skipped.

## Choose How to Run AI DevKit

### Option 1: Install the CLI globally

Install the command, then set up detected agents:

```bash
npm install -g ai-devkit
ai-devkit setup
```

`npm install -g ai-devkit` installs the CLI but does **not** run `setup` for you.

In each project, run:

```bash
cd your-project
ai-devkit init
```

### Option 2: Use npx only

You can use AI DevKit without installing a global command:

```bash
npx ai-devkit@latest setup
```

Then initialize each project with npx too:

```bash
cd your-project
npx ai-devkit@latest init
```

An npx-only installation does not make a permanent `ai-devkit` command available. Prefix every later command with `npx ai-devkit@latest`, including `agent`, `lint`, `memory`, and `skill` commands.

## What the Two Commands Do

### Machine setup

`setup` checks for supported agent home directories. For each detected agent, it installs the available session hook or tracker and the AI DevKit built-in skills in that agent's global skill location.

Read the setup summary carefully. A skipped agent was not changed. If an agent you use is skipped, launch it once and rerun the same setup command.

### Project initialization

Run `init` from the root of the project you want to use:

```bash
ai-devkit init
```

The interactive flow asks which project environments and workflow phases you want. It then:

1. Creates `.ai-devkit.json` with your project choices.
2. Creates environment-specific project templates.
3. Creates workflow documents under `docs/ai/` by default.

If the directory is not already a Git repository and Git is available, `init` also initializes one.

## Verify the First Run

Restart your coding agent after machine setup, then start an agent session in the initialized project. Check discovery before opening the console:

```bash
ai-devkit agent list
```

If the session appears, open the local console:

```bash
ai-devkit agent console
```

Then try sending a small task to the ID shown by `agent list`:

```bash
ai-devkit agent send "summarize the current branch and test status" --id <agent-id>
```

For an npx-only setup, use the same sequence with the npx prefix:

```bash
npx ai-devkit@latest agent list
npx ai-devkit@latest agent console
npx ai-devkit@latest agent send "summarize the current branch and test status" --id <agent-id>
```

## CI and Non-Interactive Initialization

CI normally needs project workflow artifacts, not local session hooks. Supply the project environment and phases explicitly, and use `--built-in` when CI needs project-local copies of the built-in skills:

```bash
npx -y ai-devkit@latest init \
  --yes \
  --environment <environment> \
  --all \
  --built-in
```

`init --built-in` is a CI and non-interactive convenience. For a normal local first run, use `setup` to install built-in skills globally.

For a repeatable team configuration, you can use an [init template](/docs/9-agent-setup#template-based-setup) instead of listing every choice in the command.

## Project Structure

The default workflow documentation path is `docs/ai/`. You can customize it during initialization or in `.ai-devkit.json`.

```text
docs/ai/
├── requirements/    # What you're building and why
├── design/          # Architecture and technical decisions
├── planning/        # Task breakdown and timeline
├── implementation/  # Implementation notes and guides
├── testing/         # Test strategy and cases
├── deployment/      # Deployment procedures
└── monitoring/      # Monitoring and observability
```

These documents give agents durable context between phases instead of relying on chat history alone.

## Try the Workflow

After `agent list` finds your session, ask your coding agent:

> Use the dev-lifecycle skill to start requirements for a small feature.

The installed workflow skills guide requirements, design, planning, implementation, testing, verification, and review. See [Development with AI DevKit](/docs/3-development-with-ai-devkit) for the full workflow.

## Next Steps

1. [Check environment-specific project support](/docs/2-supported-agents)
2. [Learn how project init and install work](/docs/9-agent-setup)
3. [Operate running agents](/docs/13-agent-console)
4. [Give agents long-term memory](/docs/6-memory)
5. [Manage skills](/docs/7-skills)
6. [Install plugins](/docs/14-plugins)

## Need Help?

- If `npx` fails inside Codex, see [Codex sandbox troubleshooting](/faq/codex-sandbox-npx-troubleshooting).
- Open an issue on [GitHub](https://github.com/Codeaholicguy/ai-devkit) for bugs or questions.

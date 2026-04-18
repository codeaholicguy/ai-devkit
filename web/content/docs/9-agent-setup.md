---
title: Agent Setup
description: Use `ai-devkit install` to apply or reconcile AI agent setup from your project configuration.
slug: agent-setup
order: 10
---

AI DevKit provides two commands for agent setup: `ai-devkit init` creates your project configuration (`.ai-devkit.json`), and `ai-devkit install` applies it to your workspace. Together they give you repeatable setup, easy onboarding, and consistent agent files after configuration changes.

Before running these commands:
- Install AI DevKit (`npm install -g ai-devkit`) or use `npx ai-devkit@latest ...`
- Run commands from your project root directory
- Make sure you have permission to create or update agent-related files in the repository

Key concepts:
- **Environment**: An AI coding tool you work with, such as Cursor, Claude Code, or Codex. AI DevKit generates the configuration files each environment expects.
- **Phase**: A stage of the software development lifecycle, such as requirements, design, or testing. AI DevKit provides document templates for each phase.

## When to Use `install` vs `init`

Use `ai-devkit init` when:
- You are setting up AI DevKit in a project for the first time
- You want interactive prompts to choose environments and phases
- You want non-interactive bootstrap from a template file (`ai-devkit init --template`)
- You want to install AI DevKit built-in skills (prompted interactively, or pass `--built-in` for CI)

Use `ai-devkit install` when:
- `.ai-devkit.json` already exists
- You want deterministic setup without re-answering prompts
- You want to restore missing agent files or command folders to match your config

## Basic Usage

The simplest way to get started is the interactive setup. This walks you through choosing environments, phases, and built-in skills:

```bash
ai-devkit init
```

Once `.ai-devkit.json` exists in your project, apply or re-apply the setup with:

```bash
ai-devkit install
```

After install completes successfully, you should usually see:
- `.ai-devkit.json` in your project root
- Environment-specific command or skill folders such as `.cursor/commands/`, `.claude/commands/`, or `.agents/skills/`
- MCP config files such as `.mcp.json` or `.codex/config.toml` if your config includes MCP servers for supported environments

After running, you will see a summary like:

```
✔ Install Summary
  ✔ 3 environment(s) installed
  ✔ 5 phase template(s) installed
  ✔ 2 skill(s) installed
```

Use a non-default config file if your project stores AI DevKit config elsewhere:

```bash
ai-devkit install --config ./.ai-devkit.team.json
```

Overwrite existing install artifacts without extra prompts:

```bash
ai-devkit install --overwrite
```

### What `ai-devkit install` Sets Up

Based on your configured environments, AI DevKit installs or updates files such as:
- Environment command folders (for example `.cursor/commands/`, `.claude/commands/`, `.codex/commands/`)
- Agent skill files (for example `.cursor/skills/`, `.claude/skills/`, `.agents/skills/` for Codex, and `.agent/skills/` for Antigravity)
- MCP server configuration files (`.mcp.json` for Claude Code, `.codex/config.toml` for Codex)
- Other environment-specific templates defined by AI DevKit

The exact artifacts depend on the environments configured in `.ai-devkit.json`.

> **Note:** `ai-devkit install` only manages project-local files generated from `.ai-devkit.json`. Some environments also support separate global setup outside the repository. If you need that, run `ai-devkit setup --global` in addition to this command. If you only want project files committed with your repo, `ai-devkit install` is sufficient.

### Team Onboarding

Once `.ai-devkit.json` is committed to your repository, teammates and CI pipelines can reproduce the same setup with a single command:

```bash
ai-devkit install
```

Each teammate still needs the AI DevKit CLI available locally, either from a global install (`npm install -g ai-devkit`) or by using `npx ai-devkit@latest install`.

### Template-based Setup

For repeatable, non-interactive setup, create a template file. This is useful for sharing a standard configuration across teams or running in CI.

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
paths:
  docs: docs/ai
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

Use a custom directory for AI documentation in either interactive or template mode (default is `docs/ai`):

```bash
ai-devkit init --docs-dir ./ai-docs
```

#### Adding MCP Servers to a Template

Templates can include MCP server definitions. Add a `mcpServers` section to your template:

> **Note:** `mcpServers` support requires AI DevKit `0.23.0` or later.

```yaml
mcpServers:
  memory:
    transport: stdio
    command: npx
    args:
      - -y
      - "@ai-devkit/memory"
```

The `-y` flag lets `npx` run non-interactively, which is recommended for repeatable setup and CI.

After running `ai-devkit init --template`, MCP server definitions are saved to `.ai-devkit.json`. Run `ai-devkit install` to generate the agent-specific MCP config files. For the full `mcpServers` field reference, see [Configuration File](/docs/11-configuration-file).

#### Template Field Reference

| Field | Required | Description |
|-------|----------|-------------|
| `environments` | Yes* | List of AI environments to configure (`cursor`, `claude`, `codex`, etc.) |
| `phases` | Yes* | List of SDLC phases (`requirements`, `design`, `planning`, `implementation`, `testing`) |
| `paths.docs` | No | Custom directory for phase documents (default: `docs/ai`) |
| `skills` | No | List of skills to install, each with `registry` and `skill` fields |
| `mcpServers` | No | MCP server definitions (see [MCP Servers](#mcp-servers) for field details) |

*If omitted, `ai-devkit init` will prompt you to select them interactively. Required for fully non-interactive runs.

## Built-in Skills

When running `ai-devkit init` interactively (without a template), you are prompted to install AI DevKit's built-in skills. In non-interactive environments such as CI, pass `--built-in` to install them automatically:

```bash
ai-devkit init --environment cursor,claude --all --built-in
```

The `--all` flag selects all available phases. Combined with `--environment` and `--built-in`, this gives a fully non-interactive setup.

When using a template with a `skills` section, skills from the template are installed from that configuration instead of using the interactive built-in skills prompt. In that case, avoid combining the template with `--built-in` unless you intentionally want built-in skills added separately.

## MCP Servers

[MCP (Model Context Protocol)](https://modelcontextprotocol.io/) servers give AI agents extended capabilities such as persistent memory, database access, or external tool integrations. Define MCP servers in `.ai-devkit.json` and AI DevKit generates the environment-specific config files for you.

> **Note:** `mcpServers` generation and install flow require AI DevKit `0.23.0` or later.

MCP configuration is currently generated for **Claude Code** (`.mcp.json`) and **Codex** (`.codex/config.toml`).

If your project uses only environments that do not currently support MCP generation, AI DevKit still saves the `mcpServers` definitions in `.ai-devkit.json`, but no environment-specific MCP config files are created.

You can define the same `mcpServers` configuration either in a template file used with `ai-devkit init --template` or directly in `.ai-devkit.json`. Both approaches work. After initialization, `ai-devkit install` always reads the final `mcpServers` values from `.ai-devkit.json`.

For the full `mcpServers` field reference, supported keys, and transport-specific examples, see [Configuration File](/docs/11-configuration-file).

### Example Configuration

Add an `mcpServers` object to `.ai-devkit.json` like this:

```json
{
  "mcpServers": {
    "memory": {
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@ai-devkit/memory"],
      "env": { "DB": "./db" }
    },
    "notion": {
      "transport": "http",
      "url": "https://mcp.notion.com/mcp",
      "headers": { "Authorization": "Bearer token" }
    }
  }
}
```

Then run `ai-devkit install` to generate the MCP config files for each supported environment.

### Conflict Resolution

When `ai-devkit install` finds an existing MCP server with the same name but different configuration:

- **Interactive mode**: You are prompted to skip, overwrite all, or choose per server.
- **Non-interactive mode (CI)**: Conflicts are skipped by default. Pass `--overwrite` to force replacement.

Servers not managed by AI DevKit are preserved and never modified.

## Troubleshooting

### `.ai-devkit.json` not found

Run:

```bash
ai-devkit init
```

This creates the configuration file used by `install`.

If you prefer non-interactive setup, use the template command shown in [Template-based Setup](#template-based-setup).

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

- [Configuration File](/docs/11-configuration-file)
- [Supported AI Agents & Environments](/docs/2-supported-agents)
- [Getting Started](/docs/1-getting-started)
- [Development with AI DevKit](/docs/3-development-with-ai-devkit)

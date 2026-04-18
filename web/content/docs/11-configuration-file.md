---
title: Configuration File
description: Complete reference for the .ai-devkit.json configuration file used by AI DevKit.
slug: configuration-reference
order: 12
---

AI DevKit stores your project settings in a `.ai-devkit.json` file at your project root. This file is created by `ai-devkit init` and read by most other commands.

There is also an optional global config at `~/.ai-devkit/.ai-devkit.json` for settings that apply across all your projects.

Use this page as a reference for fields inside `.ai-devkit.json`. In most cases, prefer AI DevKit commands such as `ai-devkit init`, `ai-devkit phase`, and `ai-devkit skill add` to update the file for you. Edit the JSON directly only when you need to make a manual change that is not covered by a command.

## Project Config (`.ai-devkit.json`)

### Full Example

```json
{
  "version": "0.23.1",
  "environments": ["cursor", "claude", "codex"],
  "phases": [
    "requirements",
    "design",
    "planning",
    "implementation",
    "testing"
  ],
  "paths": {
    "docs": "docs/ai"
  },
  "memory": {
    "path": ".ai-devkit/memory.db"
  },
  "registries": {
    "codeaholicguy/ai-devkit": "https://github.com/codeaholicguy/ai-devkit.git"
  },
  "skills": [
    { "registry": "codeaholicguy/ai-devkit", "name": "debug" },
    { "registry": "codeaholicguy/ai-devkit", "name": "dev-lifecycle" }
  ],
  "mcpServers": {
    "memory": {
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@ai-devkit/memory"]
    }
  },
  "createdAt": "2025-12-28T13:35:45.251Z",
  "updatedAt": "2026-04-18T10:00:00.000Z"
}
```

### Field Reference

#### `version`

- **Type:** `string`
- **Set automatically** when the config is created.
- Records which AI DevKit version created this file.
- You normally should not edit this field manually.

#### `environments`

- **Type:** array of environment codes
- **Required:** yes

List of AI coding tools to generate configuration files for. Valid values:

| Value | Environment |
|-------|-------------|
| `cursor` | Cursor |
| `claude` | Claude Code |
| `github` | GitHub Copilot |
| `gemini` | Gemini |
| `codex` | Codex |
| `windsurf` | Windsurf |
| `kilocode` | Kilocode |
| `amp` | Amp |
| `opencode` | OpenCode |
| `roo` | Roo |
| `antigravity` | Antigravity |

```json
"environments": ["cursor", "claude"]
```

**Set by:** `ai-devkit init` (interactive or `--environment` flag)

#### `phases`

- **Type:** array of phase names
- **Required:** yes

Stages of the software development lifecycle that AI DevKit creates document templates for. Valid values:

| Value | Description |
|-------|-------------|
| `requirements` | Requirements & Problem Understanding |
| `design` | System Design & Architecture |
| `planning` | Project Planning & Task Breakdown |
| `implementation` | Implementation Guide |
| `testing` | Testing Strategy |
| `deployment` | Deployment Strategy |
| `monitoring` | Monitoring & Observability |

```json
"phases": ["requirements", "design", "planning", "implementation", "testing"]
```

**Set by:** `ai-devkit init`, `ai-devkit phase`

#### `paths`

- **Type:** object
- **Optional**

| Sub-field | Type | Default | Description |
|-----------|------|---------|-------------|
| `docs` | `string` | `docs/ai` | Directory for phase document templates. Relative paths resolve from the project root. |

```json
"paths": {
  "docs": "docs/ai"
}
```

**Set by:** `ai-devkit init --docs-dir <path>` or template `paths.docs` field

#### `memory`

- **Type:** object
- **Optional**

| Sub-field | Type | Default | Description |
|-----------|------|---------|-------------|
| `path` | `string` | `.ai-devkit/memory.db` | Path to the SQLite memory database. Absolute paths are used as-is. Relative paths resolve from the directory containing `.ai-devkit.json`. |

```json
"memory": {
  "path": ".ai-devkit/memory.db"
}
```

**Read by:** `ai-devkit memory store`, `ai-devkit memory search`, `ai-devkit memory update`

#### `registries`

- **Type:** `Record<string, string>`
- **Optional**

Maps custom registry IDs (e.g., `owner/repo`) to Git URLs. These are merged with the built-in registries when resolving skills. Project-level registries take priority over global registries, which take priority over built-in defaults.

```json
"registries": {
  "codeaholicguy/ai-devkit": "https://github.com/codeaholicguy/ai-devkit.git",
  "my-org/custom-skills": "https://github.com/my-org/custom-skills.git"
}
```

**Set by:** `ai-devkit init --template` or by editing `.ai-devkit.json` directly

#### `skills`

- **Type:** array of `{ registry, name }`
- **Optional**

List of installed skills. Duplicates are automatically deduplicated.

```json
"skills": [
  { "registry": "codeaholicguy/ai-devkit", "name": "debug" },
  { "registry": "codeaholicguy/ai-devkit", "name": "dev-lifecycle" }
]
```

**Modified by:** `ai-devkit skill add`, `ai-devkit skill remove`, `ai-devkit skill update`, `ai-devkit init --built-in`

#### `mcpServers`

- **Type:** `Record<string, McpServerDefinition>`
- **Optional**

Defines MCP servers that agents can connect to. Each key is the server name. This page covers the `mcpServers` field structure. For setup flow, generated files, and conflict behavior during install, see [Agent Setup — MCP Servers](/docs/agent-setup#mcp-servers).

> **Note:** The `mcpServers` field is supported in AI DevKit `0.23.0` or later.

MCP settings can be stored either by initializing from a template or by editing `.ai-devkit.json` directly. `ai-devkit install` reads the final MCP settings from `.ai-devkit.json` and generates MCP config files only for environments that currently support MCP output.

Every server definition requires a `transport` field set to `stdio`, `http`, or `sse`. The remaining fields depend on the transport type:

**`stdio` transport** — runs a local process:

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `transport` | Yes | `"stdio"` | |
| `command` | Yes | `string` | Command to execute |
| `args` | No | `string[]` | Command arguments |
| `env` | No | `Record<string, string>` | Environment variables |

```json
"memory": {
  "transport": "stdio",
  "command": "npx",
  "args": ["-y", "@ai-devkit/memory"]
}
```

**`http` or `sse` transport** — connects to a remote server:

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `transport` | Yes | `"http"` or `"sse"` | |
| `url` | Yes | `string` | Server URL |
| `headers` | No | `Record<string, string>` | HTTP headers (e.g., for authentication) |

```json
"notion": {
  "transport": "http",
  "url": "https://mcp.notion.com/mcp",
  "headers": {
    "Authorization": "Bearer your-token"
  }
}
```

**Set by:** `ai-devkit init --template` or by editing `.ai-devkit.json` directly
**Read by:** `ai-devkit install`

#### `createdAt` / `updatedAt`

- **Type:** `string` (ISO 8601 timestamp)
- **Set automatically** when the config is created or modified.
- You normally should not edit these fields manually.

## Global Config (`~/.ai-devkit/.ai-devkit.json`)

The global config file has a smaller scope than the project config. It only supports skill registries:

```json
{
  "registries": {
    "codeaholicguy/ai-devkit": "https://github.com/codeaholicguy/ai-devkit.git",
    "my-org/custom-skills": "https://github.com/my-org/custom-skills.git"
  }
}
```

Use the global config when you want the same custom skill registries available in every project on your machine without copying the same registry entries into each repository.

Global registries are merged with any project-level registries. If the same registry ID exists in both, the project-level entry takes priority.

The global config does **not** support `environments`, `phases`, `paths`, `memory`, `skills`, or `mcpServers`.

## Which Commands Use the Config

| Command | Creates | Modifies | Reads |
|---------|---------|----------|-------|
| `ai-devkit init` | Yes | Yes | Yes |
| `ai-devkit install` | No | No | Yes |
| `ai-devkit phase` | No | Yes (adds phase) | Yes |
| `ai-devkit skill add` | No | Yes (adds skill) | Yes |
| `ai-devkit skill remove` | No | Yes (removes skill) | Yes |
| `ai-devkit skill update` | No | Yes | Yes |
| `ai-devkit memory *` | No | No | Yes (reads `memory.path`) |
| `ai-devkit lint` | No | No | Yes |

## Related Pages

- [Agent Setup](/docs/agent-setup) — how `init` and `install` use this config
- [Skills](/docs/skills) — managing skills and registries
- [Memory](/docs/memory) — configuring the memory database path

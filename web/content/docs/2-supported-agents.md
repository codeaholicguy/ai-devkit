---
title: Supported AI Agents & Environments
description: Compare supported AI coding agents and environments for AI DevKit setup, skills, MCP configuration, and local control-plane workflows.
section: start
order: 3
---

AI DevKit works with a variety of AI coding agents and coding environments. This page lists supported environments and explains what AI DevKit installs for each one, so teams can keep setup, skills, memory, and verification consistent across tools.

Before selecting project environments here, complete the once-per-machine setup in [Getting Started](/docs/1-getting-started).

Support levels here describe setup and environment integration. Agent session discovery, `agent console`, and `agent send` depend on whether the local agent exposes a detectable running session. See [Agent Management](/docs/8-agent-management) and [Agent Console](/docs/13-agent-console) for the operational control-plane commands.

## Status Legend

| Status | Meaning |
|--------|---------|
| **Ready** | Stable support for project/global skill paths and documented configuration. |
| **Experimental** | Works but may have issues. We're actively testing and improving support. |

## Ready Environments

These environments have stable setup integrations.

### [Cursor](https://cursor.com/)
**What AI DevKit provides:**
- `.cursor/skills/` — Project-level skills
- `~/.cursor/skills/` — Global skills
- `.cursor/mcp.json` — Project-level MCP server configuration

### [Claude Code](https://www.claude.com/product/claude-code)
**What AI DevKit provides:**
- `.claude/skills/` — Project-level skills
- `~/.claude/skills/` — Global skills
- `.mcp.json` — Project-level MCP server configuration

### [GitHub Copilot](https://github.com/features/copilot)
**What AI DevKit provides:**
- `.github/skills/` — Project-level skills
- `.mcp.json` — Project-level MCP server configuration
- `~/.copilot/skills/` — Global skills

### [Google Gemini CLI](https://geminicli.com/)
**What AI DevKit provides:**
- `.gemini/skills/` — Project-level skills
- `~/.gemini/skills/` — Global skills
- `.gemini/settings.json` — Project-level MCP server configuration

### [Codex](https://chatgpt.com/en-SE/features/codex)
**What AI DevKit provides:**
- `.agents/skills/` — Project-level skills
- `~/.codex/skills/` — Global skills
- `.codex/config.toml` — Project-level MCP server configuration

### [Grok Build CLI](https://x.ai/cli)
**What AI DevKit provides:**
- `.grok/skills/` — Project-level skills
- `~/.grok/skills/` — Global skills

### [opencode](https://opencode.ai/)
**What AI DevKit provides:**
- `.opencode/skills/` — Project-level skills
- `~/.config/opencode/skills/` — Global skills
- `opencode.json` — Project-level MCP server configuration under the `mcp` key

### [Antigravity](https://antigravity.google/)
**What AI DevKit provides:**
- `.agent/skills/` — Project-level skills
- `~/.gemini/antigravity/skills/` — Global skills

### [Antigravity CLI](https://antigravity.google/)
**What AI DevKit provides:**
- `.agents/skills/` — Project-level skills
- `~/.gemini/config/skills/` — Global skills

### [Junie](https://www.jetbrains.com/junie/)
**What AI DevKit provides:**
- `.junie/skills/` — Project-level skills
- `.junie/mcp/mcp.json` — Project-level MCP server configuration
- `~/.junie/skills/` — Global skills

### [Cline](https://cline.bot/)
**What AI DevKit provides:**
- `.cline/skills/` — Project-level skills
- `~/.cline/skills/` — Global skills

### [Devin](https://devin.ai/)
**What AI DevKit provides:**
- `.devin/skills/` — Project-level skills
- `.devin/config.json` — Project-level MCP server configuration; AI DevKit updates only `mcpServers` and preserves other Devin config
- `~/.config/devin/skills/` — Global skills

### [Pi](https://pi.dev/)
**What AI DevKit provides:**
- `.pi/skills/` — Project-level skills
- `~/.pi/agent/skills/` — Global skills

### [Muse Code](https://dev.meta.ai/products/muse-code/)
**What AI DevKit provides:**
- `.agents/skills/` — Project-level skills
- `~/.config/muse/skills/` — Global skills

## Experimental Environments

These environments are under active development. They work, but you may encounter issues.

### [KiloCode](https://kilocode.ai/)

**What AI DevKit provides:**
- `.kilo/skills/` — Project-level skills
- `~/.kilo/skills/` — Global skills
- `.kilo/kilo.jsonc` — Project-level MCP server configuration under the `mcp` key

### [AMP](https://ampcode.com/)

**What AI DevKit provides:**
- `.agents/skills/` — Project-level skills
- `~/.config/agents/skills/` — Global skills

### [Roo Code](https://roocode.com/)

**What AI DevKit provides:**
- `.roo/skills/` — Project-level skills
- `~/.roo/skills/` — Global skills
- `.roo/mcp.json` — Project-level MCP server configuration

## Environment Setup

### Interactive Multi-Selection

When you run `ai-devkit init`, you can select multiple environments at once:

```bash
ai-devkit init
```

This presents an interactive checklist where you can:
- **Spacebar** — Select or deselect an environment
- **Enter** — Confirm your selections
- Select any combination of the supported environments

### Configuration Storage

Your selections are saved in `.ai-devkit.json`:

```json
{
  "version": "0.70.1",
  "environments": ["cursor", "claude", "github"],
  "phases": ["requirements", "design"],
  "createdAt": "2026-10-15T..."
}
```

### Adding More Environments Later

Want to add another environment after initial setup? Just run:

```bash
ai-devkit init
```

AI DevKit will:
1. Detect your existing environments
2. Ask once before replacing the selected environment templates in interactive mode
3. Ask separately before replacing each existing phase document

In non-interactive mode (`--yes`), existing environment templates and phase documents are skipped unless you also pass `--overwrite`. Template-driven initialization overwrites the selected artifacts without prompting.

### Override Protection

When an interactively selected environment is already set up, `ai-devkit init` shows a warning and asks whether to replace the selected environment templates:

```
Warning: The following environments are already set up: cursor, claude

The following environments are already set up and will be overwritten:
  Cursor, Claude Code

Do you want to continue?
```

Existing phase documents use a separate per-phase confirmation. This behavior belongs to `init`; the non-interactive `ai-devkit install` reconciliation flow does not show a general “existing install artifacts” overwrite prompt.

## For Contributors

Want to add support for a new AI environment? We welcome contributions!

1. **Create Environment Definition** — Add to `packages/cli/src/util/env.ts`
2. **Add MCP Support If Needed** — Add and register a generator in `packages/cli/src/services/install/mcp/`
3. **Add Agent Detection If Needed** — Add and register a harness under `packages/agent-manager/src/harnesses/`
4. **Update Documentation** — Add the environment to this guide
5. **Test Integration** — Verify skill paths, generated configuration, and any harness behavior

See our [Contributing Guide](https://github.com/Codeaholicguy/ai-devkit/blob/main/CONTRIBUTING.md) for details.

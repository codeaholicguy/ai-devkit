---
title: Supported AI Agents & Environments
description: Compare supported AI coding agents and environments, including Claude Code, Codex, Cursor, Gemini CLI, Junie, Cline, Devin, OpenCode, and GitHub Copilot.
order: 2
---

AI DevKit works with a variety of AI coding assistants and terminal AI coding agents. This page lists all supported environments and explains what AI DevKit provides for each one, so teams can keep agentic software development workflows consistent across tools.

## Status Legend

| Status | Meaning |
|--------|---------|
| **Ready** | Fully supported and tested. Safe for production use. |
| **Experimental** | Works but may have issues. We're actively testing and improving support. |

## Ready Environments

These environments are fully supported with stable integrations.

### [Cursor](https://cursor.com/)
**What AI DevKit provides:**
- `AGENTS.md` — Agent instructions for [Cursor](https://cursor.com/docs/context/rules)
- `.cursor/skills/` — Project-level skills
- `~/.cursor/skills/` — Global skills
- `.cursor/rules/` — [Editor rules](https://cursor.com/docs/context/rules) for consistent coding standards

### [Claude Code](https://www.claude.com/product/claude-code)
**What AI DevKit provides:**
- `CLAUDE.md` — Claude Code workspace instructions and context
- `.claude/skills/` — Project-level skills
- `~/.claude/skills/` — Global skills
- `.mcp.json` — Project-level MCP server configuration

### [GitHub Copilot](https://github.com/features/copilot)
**What AI DevKit provides:**
- `.github/prompts/` — GitHub Copilot [custom prompts with VSCode](https://code.visualstudio.com/docs/copilot/customization/prompt-files)
- `.github/skills/` — Project-level skills
- `.mcp.json` — Project-level MCP server configuration
- `~/.copilot/skills/` — Global skills

### [Google Gemini CLI](https://geminicli.com/)
**What AI DevKit provides:**
- `GEMINI.md` — [Context file](https://geminicli.com/docs/cli/gemini-md/) for providing instructional context to the Gemini model
- `.gemini/skills/` — Project-level skills
- `~/.gemini/skills/` — Global skills

### [OpenAI Codex](https://chatgpt.com/en-SE/features/codex)
**What AI DevKit provides:**
- `AGENTS.md` — Codex-specific configuration and context
- `.agents/skills/` — Project-level skills
- `~/.codex/skills/` — Global skills
- `.codex/config.toml` — Project-level MCP server configuration

### [OpenCode](https://opencode.ai/)
**What AI DevKit provides:**
- `AGENTS.md` — OpenCode [custom instructions](https://opencode.ai/docs/rules/)
- `.opencode/skills/` — Project-level skills
- `~/.config/opencode/skills/` — Global skills

### [Antigravity](https://antigravity.google/)
**What AI DevKit provides:**
- `.agent/skills/` — Project-level skills
- `~/.gemini/antigravity/skills/` — Global skills

### [Junie](https://www.jetbrains.com/junie/)
**What AI DevKit provides:**
- `AGENTS.md` — Junie project instructions and context
- `.junie/skills/` — Project-level skills
- `.junie/mcp/mcp.json` — Project-level MCP server configuration
- `~/.junie/skills/` — Global skills

### [Cline](https://cline.bot/)
**What AI DevKit provides:**
- `AGENTS.md` — Cline project instructions and context
- `.cline/skills/` — Project-level skills
- `~/.cline/skills/` — Global skills

### [Devin](https://devin.ai/)
**What AI DevKit provides:**
- `AGENTS.md` — Devin project instructions and context
- `.devin/skills/` — Project-level skills
- `.devin/config.json` — Project-level MCP server configuration; AI DevKit updates only `mcpServers` and preserves other Devin config
- `~/.config/devin/skills/` — Global skills

### [Pi](https://pi.dev/)
**What AI DevKit provides:**
- `.pi/skills/` — Project-level skills
- `~/.pi/agent/skills/` — Global skills

## Experimental Environments

These environments are under active development. They work, but you may encounter issues.

### [KiloCode](https://kilocode.ai/)

**What AI DevKit provides:**
- `AGENTS.md` — KiloCode configuration for large project handling
- `.kilo/skills/` — Project-level skills
- `~/.kilo/skills/` — Global skills
- `.kilo/kilo.jsonc` — Project-level MCP server configuration under the `mcp` key

### [AMP](https://ampcode.com/)

**What AI DevKit provides:**
- `AGENTS.md` — AMP configuration for accelerated workflows
- `.agents/skills/` — Project-level skills
- `~/.config/agents/skills/` — Global skills

### [Roo Code](https://roocode.com/)

**What AI DevKit provides:**
- `AGENTS.md` — Roo Code configuration and context
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
  "version": "0.21.1",
  "environments": ["cursor", "claude", "github"],
  "phases": ["requirements", "design"],
  "createdAt": "2026-04-04T...",
  "updatedAt": "2026-04-04T..."
}
```

### Adding More Environments Later

Want to add another environment after initial setup? Just run:

```bash
ai-devkit init
```

AI DevKit will:
1. Detect your existing environments
2. Ask before overwriting any existing configurations
3. Add new environments alongside existing ones

### Override Protection

When re-running `ai-devkit init`, you'll see a warning before any existing files are overwritten:

```
Warning: The following environments are already set up: cursor, claude

Do you want to continue?
```

## For Contributors

Want to add support for a new AI environment? We welcome contributions!

1. **Create Environment Definition** — Add to `src/util/env.ts`
2. **Add Templates** — Create `templates/env/{code}/` directory
3. **Update Documentation** — Add to this guide
4. **Test Integration** — Ensure proper initialization and configuration

See our [Contributing Guide](https://github.com/Codeaholicguy/ai-devkit/blob/main/CONTRIBUTING.md) for details.

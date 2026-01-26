---
title: Supported AI Agents & Environments
description: Environments supported by AI DevKit
order: 2
---

AI DevKit works with a variety of AI coding assistants. This page lists all supported environments and explains what AI DevKit provides for each one.

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
- `.cursor/commands/` — Custom [slash commands](https://cursor.com/docs/context/commands) for structured development workflows
- `.cursor/rules/` — [Editor rules](https://cursor.com/docs/context/rules) for consistent coding standards

### [Claude Code](https://www.claude.com/product/claude-code)
**What AI DevKit provides:**
- `AGENTS.md` — [Claude workspace configuration](https://www.anthropic.com/engineering/claude-code-best-practices) and context
- `.claude/commands/` — Custom [slash commands](https://code.claude.com/docs/en/slash-commands)

### [GitHub Copilot](https://github.com/features/copilot)
**What AI DevKit provides:**
- `.github/prompts/` — GitHub Copilot [custom prompts with VSCode](https://code.visualstudio.com/docs/copilot/customization/prompt-files)

### [Google Gemini CLI](https://geminicli.com/)
**What AI DevKit provides:**
- `GEMINI.md` — [Context file](https://geminicli.com/docs/cli/gemini-md/) for providing instructional context to the Gemini model
- `.gemini/commands/` — Gemini [custom commands](https://geminicli.com/docs/cli/commands/)

### [OpenAI Codex](https://chatgpt.com/en-SE/features/codex)
> **Note:** Codex requires global setup because it reads commands from a system-wide location rather than your project directory.
>
> ```bash
> ai-devkit setup --global
> ```

**What AI DevKit provides:**
- `AGENTS.md` — Codex-specific configuration and context
- `.codex/commands/` — Commands tailored for Codex's code-focused capabilities

### [OpenCode](https://opencode.ai/)
**What AI DevKit provides:**
- `AGENTS.md` — OpenCode [custom instructions](https://opencode.ai/docs/rules/)
- `.opencode/commands/` — OpenCode [custom commands](https://opencode.ai/docs/commands/)

### [Antigravity](https://antigravity.google/)
> **Note:** Antigravity requires global setup.
>
> ```bash
> ai-devkit setup --global
> ```

**What AI DevKit provides:**
- `.agent/workflows/` — Workflow for [Antigravity](https://codelabs.developers.google.com/getting-started-google-antigravity#8)'s advanced features

## Experimental Environments

These environments are under active development. They work, but you may encounter issues.

### [Windsurf](https://windsurf.com/)

**What AI DevKit provides:**
- `AGENTS.md` — Windsurf environment configuration
- `.windsurf/commands/` — Commands optimized for Windsurf's interface

### [KiloCode](https://kilocode.ai/)

**What AI DevKit provides:**
- `AGENTS.md` — KiloCode configuration for large project handling
- `.kilocode/commands/` — Commands designed for large-scale development

### [AMP](https://ampcode.com/)

**What AI DevKit provides:**
- `AGENTS.md` — AMP configuration for accelerated workflows
- `.agents/commands/` — Commands optimized for rapid development cycles

### [Roo Code](https://roocode.com/)

**What AI DevKit provides:**
- `AGENTS.md` — Roo Code configuration and context
- `.roo/commands/` — Commands optimized for Roo's advanced features

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
  "version": "0.4.0",
  "environments": ["cursor", "claude", "github"],
  "initializedPhases": ["requirements", "design"],
  "createdAt": "2025-10-31T...",
  "updatedAt": "2025-10-31T..."
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
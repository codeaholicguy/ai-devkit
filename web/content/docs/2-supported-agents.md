---
title: Supported AI Agents & Environments
description: Environments supported by AI DevKit
order: 2
---

## Supported Environments

### [Cursor](https://cursor.com/)
**Status:** Ready
**What AI DevKit provides:**
- `AGENTS.md` - Agent instructions for [Cursor](https://cursor.com/docs/context/rules)
- `.cursor/commands/` - Custom [slash commands](https://cursor.com/docs/context/commands) for structured development workflows
- `.cursor/rules/` - [Editor rules](https://cursor.com/docs/context/rules) for consistent coding standards

### [Claude Code](https://www.claude.com/product/claude-code)
**Status:** Ready
**What AI DevKit provides:**
- `AGENTS.md` - [Claude workspace configuration](https://www.anthropic.com/engineering/claude-code-best-practices) and context
- `.claude/commands/` - Custom [slash commands](https://code.claude.com/docs/en/slash-commands)

### [GitHub Copilot](https://github.com/features/copilot)
**Status:** Ready
**What AI DevKit provides:**
- `.github/prompts/` - GitHub Copilot [custom prompts with VSCode](https://code.visualstudio.com/docs/copilot/customization/prompt-files)

### [Google Gemini](https://geminicli.com/)
**Status:** Ready
**What AI DevKit provides:**
- `GEMINI.md` - [Context file](https://geminicli.com/docs/cli/gemini-md/) for providing instructional context to the Gemini model
- `.gemini/commands/` - Gemini [custom commands](https://geminicli.com/docs/cli/commands/)

### [OpenAI Codex](https://chatgpt.com/en-SE/features/codex)
**Status:** Testing
**What AI DevKit provides:**
- `AGENTS.md` - Codex-specific configuration and context
- `.codex/commands/` - Commands tailored for Codex's code-focused capabilities

### [Windsurf](https://windsurf.com/)
**Status:** Testing
**What AI DevKit provides:**
- `AGENTS.md` - Windsurf environment configuration
- `.windsurf/commands/` - Commands optimized for Windsurf's interface

### [KiloCode](https://kilocode.ai/)
**Status:** Testing
**What AI DevKit provides:**
- `AGENTS.md` - KiloCode configuration for large project handling
- `.kilocode/commands/` - Commands designed for large-scale development

### [AMP](https://ampcode.com/)
**Status:** Testing
**What AI DevKit provides:**
- `AGENTS.md` - AMP configuration for accelerated workflows
- `.agents/commands/` - Commands optimized for rapid development cycles

### [OpenCode](https://opencode.ai/)
**Status:** Ready
**What AI DevKit provides:**
- `AGENTS.md` - OpenCode [custom instructions](https://opencode.ai/docs/rules/)
- `.opencode/commands/` - OpenCode [custom commands](https://opencode.ai/docs/commands/)

### [Roo Code](https://roocode.com/)
**Status:** Testing
**What AI DevKit provides:**
- `AGENTS.md` - Roo Code configuration and context
- `.roo/commands/` - Commands optimized for Roo's advanced features

### [Antigravity](https://antigravity.google/)
**Status:** Ready
**What AI DevKit provides:**
- `.agent/workflows/` - Workflow for [Antigravity](https://codelabs.developers.google.com/getting-started-google-antigravity#8)'s advanced features

## Environment Setup

### Interactive Multi-Selection

When you run `ai-devkit init`, you can select multiple environments simultaneously:

```bash
ai-devkit init
```

This presents an interactive checklist where you can:
- Use spacebar to select/deselect environments
- Press Enter to confirm your selections
- Choose any combination of the 10 supported environments

### Configuration Storage

Your selections are stored in `.ai-devkit.json`:

```json
{
  "version": "0.4.0",
  "environments": ["cursor", "claude", "github"],
  "initializedPhases": ["requirements", "design"],
  "createdAt": "2025-10-31T...",
  "updatedAt": "2025-10-31T..."
}
```

### Re-running Setup

If you want to add more environments later:

```bash
ai-devkit init
```

AI DevKit will:
1. Detect existing environments
2. Show confirmation prompts for overwriting
3. Add new environments alongside existing ones

### Override Protection

When re-running `ai-devkit init`, you'll be prompted before overwriting existing environment configurations:

```
Warning: The following environments are already set up: cursor, claude

Do you want to continue?
```

## Contributing New Environments

AI DevKit welcomes contributions for new AI development environments. To add support for a new environment:

1. **Create Environment Definition**: Add to `src/util/env.ts`
2. **Add Templates**: Create `templates/env/{code}/` directory
3. **Update Documentation**: Add to this guide
4. **Test Integration**: Ensure proper initialization and configuration
---
title: Supported AI Agents & Environments
description: Environments supported by AI DevKit
order: 2
---

## Supported Environments

### [Cursor](https://cursor.com/)

**What AI DevKit provides:**

- `AGENTS.md` - Context file with AI agent configurations
- `.cursor/commands/` - Custom slash commands for structured development workflows
- `.cursor/rules/` - Editor rules for consistent coding standards

### [Claude Code](https://www.claude.com/product/claude-code)

**What AI DevKit provides:**

- `AGENTS.md` - Claude workspace configuration and context
- `.claude/commands/` - Command-line tools and scripts optimized for Claude Code

### [GitHub Copilot](https://github.com/features/copilot)

**What AI DevKit provides:**

- `AGENTS.md` - GitHub Copilot configuration and context settings
- `.github/commands/` - GitHub-integrated workflow commands

### [Google Gemini](https://geminicli.com/)

**What AI DevKit provides:**

- `AGENTS.md` - Gemini configuration with multimodal context
- `.gemini/commands/` - Commands optimized for Gemini's capabilities

### [OpenAI Codex](https://chatgpt.com/en-SE/features/codex)

**What AI DevKit provides:**

- `AGENTS.md` - Codex-specific configuration and context
- `.codex/commands/` - Commands tailored for Codex's code-focused capabilities

### [Windsurf](https://windsurf.com/)

**What AI DevKit provides:**

- `AGENTS.md` - Windsurf environment configuration
- `.windsurf/commands/` - Commands optimized for Windsurf's interface

### [KiloCode](https://kilocode.ai/)

**What AI DevKit provides:**

- `AGENTS.md` - KiloCode configuration for large project handling
- `.kilocode/commands/` - Commands designed for large-scale development

### [AMP](https://ampcode.com/)

**What AI DevKit provides:**

- `AGENTS.md` - AMP configuration for accelerated workflows
- `.agents/commands/` - Commands optimized for rapid development cycles

### [OpenCode](https://opencode.ai/)

**What AI DevKit provides:**

- `AGENTS.md` - OpenCode configuration with community features
- `.opencode/commands/` - Commands leveraging open-source AI improvements

### [Roo Code](https://roocode.com/)

**What AI DevKit provides:**

- `.roo/rules/AGENTS.md` - Roo Code configuration and context following Roo's rules structure
- `.roo/commands/` - Slash commands with frontmatter support (description, argument-hint)

**Roo Code Features:**

- Slash commands with fuzzy search and auto-complete
- Frontmatter metadata for descriptions and argument hints
- Project-specific commands in `.roo/commands/`
- Rules-based context in `.roo/rules/`

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

# AI DevKit

**The toolkit for AI-assisted software development.**

AI DevKit helps AI coding agents work more effectively with your codebase. It provides structured workflows, persistent memory, and reusable skills — so agents follow the same engineering standards as senior developers.

[![npm version](https://img.shields.io/npm/v/ai-devkit.svg)](https://www.npmjs.com/package/ai-devkit)
[![npm downloads](https://img.shields.io/npm/dt/ai-devkit.svg)](https://www.npmjs.com/package/ai-devkit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Quick Start

```bash
npx ai-devkit@latest init
```

This launches an interactive setup wizard that configures your project for AI-assisted development in under a minute.

## Usage

### Setting Up a New Project

Run `init` in any project directory to start the interactive setup:

```bash
cd your-project
npx ai-devkit@latest init
```

This creates a `.ai-devkit.json` config file and sets up environment-specific files (`.cursor/`, `.claude/`, `.github/`, etc.) and phase templates (`docs/ai/`).

### Reproducing the Setup (Team / CI)

Once `.ai-devkit.json` is committed to the repository, team members can reproduce the same environment with:

```bash
npx ai-devkit@latest install
```

This reads `.ai-devkit.json` and installs all configured environments, phases, and skills. Use `--overwrite` to force-refresh existing files:

```bash
npx ai-devkit@latest install --overwrite
```

### Global Setup

To make AI DevKit commands available across all projects (not just the current one), use:

```bash
npx ai-devkit@latest setup --global
```

This copies commands to global environment folders in your home directory (`~/.cursor/commands/`, `~/.claude/commands/`, etc.), so they are available regardless of which project you have open.

## Supported Agents

| Agent | Status |
|-------|--------|
| [Claude Code](https://www.anthropic.com/claude-code) | ✅ Supported |
| [GitHub Copilot](https://code.visualstudio.com/) | ✅ Supported |
| [Gemini CLI](https://github.com/google-gemini/gemini-cli) | ✅ Supported |
| [Cursor](https://cursor.sh/) | ✅ Supported |
| [opencode](https://opencode.ai/) | ✅ Supported |
| [Antigravity](https://antigravity.google/) | ✅ Supported |
| [Codex CLI](https://github.com/openai/codex) | ✅ Supported |
| [Windsurf](https://windsurf.com/) | 🚧 Testing |
| [Kilo Code](https://github.com/Kilo-Org/kilocode) | 🚧 Testing |
| [Roo Code](https://roocode.com/) | 🚧 Testing |
| [Amp](https://ampcode.com/) | 🚧 Testing |

## Documentation

📖 **Visit [ai-devkit.com](https://ai-devkit.com/docs/) for the full documentation**, including:

- Getting started guide
- Phase-based development workflow
- Memory system setup
- Skill management
- Agent configuration

## Contributing

We welcome contributions! See the [Contributing Guide](./CONTRIBUTING.md) for details.

```bash
git clone https://github.com/Codeaholicguy/ai-devkit.git
cd ai-devkit
npm install
npm run build
```

## License

MIT

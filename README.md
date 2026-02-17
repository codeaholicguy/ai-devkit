# AI DevKit

**The toolkit for AI-assisted software development.**

AI DevKit helps AI coding agents work more effectively with your codebase. It provides structured workflows, persistent memory, and reusable skills — so agents follow the same engineering standards as senior developers.

[![npm version](https://img.shields.io/npm/v/ai-devkit.svg)](https://www.npmjs.com/package/ai-devkit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Quick Start

```bash
npx ai-devkit init
```

This launches an interactive setup wizard that configures your project for AI-assisted development in under a minute.

## What's Included

| Package | Description |
|---------|-------------|
| [**ai-devkit** (CLI)](./packages/cli) | Scaffold structured docs, configure AI environments, and manage development phases |
| [**@ai-devkit/memory**](./packages/memory) | Give agents persistent, searchable long-term memory via MCP |

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

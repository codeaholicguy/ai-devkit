# AI DevKit CLI

The command-line interface for **AI DevKit** — set up and manage AI-assisted development environments in your project.

[![npm version](https://img.shields.io/npm/v/ai-devkit.svg)](https://www.npmjs.com/package/ai-devkit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- 🎯 **Phase-based Development** — Structured templates for requirements, design, planning, implementation, testing, and more
- 🤖 **AI Environment Setup** — One-command configuration for Cursor, Claude Code, Gemini CLI, and other agents
- 🧠 **Skill Management** — Install and manage reusable AI skills from registries
- 📝 **Customizable Templates** — Markdown-based templates with YAML frontmatter

## Installation

```bash
# Run directly (no install needed)
npx ai-devkit init

# Or install globally
npm install -g ai-devkit
```

## Quick Start

```bash
# Set up your project interactively
ai-devkit init
```

This will:
1. Create a `.ai-devkit.json` configuration file
2. Set up your AI development environment (e.g., Cursor, Claude Code)
3. Generate phase templates in `docs/ai/`

## Common Commands

```bash
# Initialize project
ai-devkit init

# Add a development phase
ai-devkit phase requirements

# Install a skill
ai-devkit skill install <skill-name>

# Store a memory
ai-devkit memory store
```

## Documentation

📖 **For the full user guide, workflow examples, and best practices, visit:**

**[ai-devkit.com/docs](https://ai-devkit.com/docs/)**

## License

MIT

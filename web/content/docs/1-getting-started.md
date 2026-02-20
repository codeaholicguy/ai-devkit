---
title: Getting Started
description: Quick start guide for AI DevKit
order: 1
---

**AI DevKit** is a toolkit that helps you work more effectively with AI coding assistants like Cursor, Claude Code, Codex, Antigravity, OpenCode, GitHub Copilot, and more. It provides structured workflows, reusable commands, and memory features to make AI-assisted development more consistent and productive.

The direction of AI DevKit is to become the **operating system for AI-driven development**: one standard layer for workflows, memory, skills, and execution across agents.

## Why AI DevKit?

When working with AI assistants, you often find yourself:
- Repeating the same instructions across sessions
- Losing context between conversations
- Struggling to maintain consistency across features

AI DevKit solves these problems by giving your AI assistant:
- **Structured workflows** — Consistent processes from requirements to deployment
- **Custom commands** — Reusable prompts tailored to your project
- **Long-term memory** — Rules and patterns that persist across sessions
- **Skills** — Community-contributed capabilities your AI can learn

## Prerequisites

Before you begin, make sure have:
- **Node.js** (version 18 or higher)
- **npm** or **npx** (comes with Node.js)
- An AI coding assistant (Cursor, Claude Code, Codex, Antigravity, OpenCode, GitHub Copilot, etc.)

## Installation

Install AI DevKit globally using npm:

```bash
npm install -g ai-devkit
```

Or use it directly with npx (no installation required):

```bash
npx ai-devkit init
```

## Initialize Your Project

Navigate to your project directory and run:

```bash
ai-devkit init
```

You'll be prompted to select which AI environments you use (Cursor, Claude Code, etc.). AI DevKit will then:

1. **Create documentation structure** — A `docs/ai/` directory with templates for each development phase
2. **Set up AI environment files** — Configuration and commands for your selected AI assistants
3. **Save your preferences** — Stored in `.ai-devkit.json` for future updates

## Project Structure

After initialization, you'll have a structured documentation folder:

```
docs/ai/
├── requirements/    # What you're building and why
├── design/          # Architecture and technical decisions
├── planning/        # Task breakdown and timeline
├── implementation/  # Implementation notes and guides
├── testing/         # Test strategy and cases
├── deployment/      # Deployment procedures
└── monitoring/      # Monitoring and observability
```

This structure helps you maintain documentation throughout your development lifecycle, giving your AI assistant the context it needs to help effectively.

## Using Slash Commands

AI DevKit installs **slash commands** into your AI editor. These are special prompts you type directly into your AI assistant's chat (not in your terminal).

> **Note:** Slash commands like `/new-requirement` are used inside your AI editor (Cursor, Claude Code, etc.), not in the terminal. Terminal commands start with `ai-devkit`.

### Core Commands

| Command | Purpose |
|---------|---------|
| `/new-requirement` | Start a new feature with structured documentation |
| `/review-requirements` | Validate completeness of requirements |
| `/review-design` | Check architecture and generate diagrams |
| `/execute-plan` | Work through implementation tasks step-by-step |
| `/check-implementation` | Compare code with design documents |
| `/writing-test` | Generate comprehensive test cases |
| `/code-review` | Perform pre-commit code reviews |
| `/capture-knowledge` | Document and understand existing code |
| `/debug` | Systematic debugging with structured analysis |
| `/update-planning` | Sync planning docs with implementation progress |
| `/remember` | Remember your important guidelines, rules, and best practices |

For detailed usage of each command, see [Development with AI DevKit](/docs/3-development-with-ai-devkit).

## Quick Example

Here's how a typical workflow might look:

```
1. In your terminal:
   $ ai-devkit init

2. In Cursor/Claude Code:
   > /new-requirement
   
   AI: "What feature would you like to build?"
   You: "Add user authentication with OAuth"
   
   AI guides you through requirements → design → planning → implementation
```

## Next Steps

1. **Explore your AI editor** — Try `/new-requirement` on a small feature
2. **Read the workflows guide** — [Development with AI DevKit](/docs/3-development-with-ai-devkit)
3. **Set up memory** — [Give your AI long-term memory](/docs/6-memory)
4. **Install skills** — [Extend your AI's capabilities](/docs/7-skills)

## Need Help?

- Check the [Supported Agents](/docs/2-supported-agents) page for environment-specific setup
- Browse the [Roadmap](/roadmap) to see what's coming
- Open an issue on [GitHub](https://github.com/Codeaholicguy/ai-devkit) for bugs or questions

# AI DevKit

**The standard for AI-assisted software development.**

AI DevKit is an open-source ecosystem designed to bridge the gap between human intent and AI execution. It provides a suite of tools that standardize how AI agents interact with codebases, manage context, and execute development workflows.

![npm version](https://img.shields.io/npm/v/ai-devkit.svg)](https://www.npmjs.com/package/ai-devkit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 🌟 Vision

The capabilities of AI coding agents are growing exponentially, but they often struggle with:
1.  **Context**: Losing track of broad project requirements and architectural decisions.
2.  **Consistency**: Generating code that doesn't follow project-specific patterns.
3.  **Process**: coding without a structured plan, leading to "spaghetti code".

**AI DevKit** solves this by enforcing a **Phase-Based Development** lifecycle—ensuring agents follow the same rigorous engineering 
standards as senior developers: Requirements → Design → Planning → Implementation → Testing.

## 📦 Packages

AI DevKit is a monorepo containing multiple specialized tools:

### [🖥️ ai-devkit (CLI)](./packages/cli)
The command-line interface that orchestrates the development lifecycle.
- **Scaffold** structured documentation (Requirements, Design, Plan).
- **Configure** environments for Cursor, Claude Code, and other agents.
- **Manage** project state and development phases.

[**Explore the CLI Docs →**](./packages/cli/README.md)

### [🧠 @ai-devkit/memory](./packages/memory)
A lightweight MCP-based memory service that gives agents persistent, searchable long-term memory.
- **Store** architectural decisions and coding patterns.
- **Search** documentation and knowledge using full-text search.
- **Share** context across different agents and sessions.

[**Explore the Memory Docs →**](./packages/memory/README.md)

## 🚀 Quick Start

To start using the core toolkit in your project instantly:

```bash
npx ai-devkit init
```

This will launch the interactive setup wizard to configure your project for AI-assisted development.

## 🤝 Contributing

We welcome contributions! Whether you're building a new agent integration, adding a memory adapter, or improving our templates.

### Development Setup

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/Codeaholicguy/ai-devkit.git
    cd ai-devkit
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    ```

3.  **Build packages**:
    ```bash
    npm run build
    ```

We use a monorepo structure. Ensure all changes are covered by tests before submitting a PR.

## License

MIT


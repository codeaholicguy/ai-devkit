# @ai-devkit/cli
> Part of [AI DevKit](https://github.com/Codeaholicguy/ai-devkit)

The official command-line interface for **AI DevKit**.

This tool orchestrates the setup and management of AI-assisted development environments, ensuring your project is ready for agents like Cursor, Claude Code, and more.

[![npm version](https://img.shields.io/npm/v/ai-devkit.svg)](https://www.npmjs.com/package/ai-devkit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- 🎯 **Phase-based Development**: Structured templates for each stage of the software development lifecycle
- 🤖 **AI Environment Setup**: Automatic configuration for Cursor and Claude Code
- 📝 **Customizable Templates**: Markdown-based templates with YAML frontmatter
- 🚀 **Interactive CLI**: User-friendly prompts with flag override support
- ⚙️ **State Management**: Tracks initialized phases and configuration

## Installation

```bash
# Using npx (no installation needed)
npx ai-devkit init

# Or install globally
npm install -g ai-devkit
```

## Quick Start

Initialize AI DevKit in your project:

```bash
# Interactive mode (recommended)
ai-devkit init
```

This will:
1. Create a `.ai-devkit.json` configuration file
2. Set up your AI development environment (Cursor/Claude Code)
3. Generate phase templates in `docs/ai/`

Detailed user guide can be found [here](https://ai-devkit.com/docs/).

## Available Phases

- **Requirements**: Problem understanding, requirements gathering, and success criteria
- **Design**: System architecture, data models, and technical design (include mermaid diagrams for architecture/data flow)
- **Planning**: Task breakdown, milestones, and project timeline
- **Implementation**: Technical implementation notes and code guidelines
- **Testing**: Testing strategy, test cases, and quality assurance
- **Deployment**: Deployment process, infrastructure, and release procedures
- **Monitoring**: Monitoring strategy, metrics, alerts, and observability

## Commands

### `ai-devkit init`

Initialize AI DevKit in your project.

**Options:**
- `-e, --environment <env>`: Specify environment (cursor|claude|both)
- `-a, --all`: Initialize all phases at once
- `-p, --phases <phases>`: Comma-separated list of specific phases

```bash
# Interactive mode
ai-devkit init

# Initialize for Cursor with all phases
ai-devkit init --environment cursor --all

# Initialize specific phases
ai-devkit init --phases requirements,design,implementation
```

### `ai-devkit phase [name]`

Add or update a specific phase template.

**Examples:**
```bash
# Interactive selection
ai-devkit phase

# Add specific phase
ai-devkit phase requirements
ai-devkit phase testing
```

## Generated Structure

After initialization, your project will have:

```
your-project/
├── .ai-devkit.json           # Configuration and state
├── docs/
│   └── ai/
│       ├── requirements/
│       │   └── README.md
│       ├── design/
│       │   └── README.md
│       ├── planning/
│       │   └── README.md
│       ├── implementation/
│       │   └── README.md
│       ├── testing/
│       │   └── README.md
│       ├── deployment/
│       │   └── README.md
│       └── monitoring/
│           └── README.md
└── [Environment-specific files]
```

Supported Tools & Agents:
| Agent                                                     | Support | Notes                                             |
|-----------------------------------------------------------|---------|---------------------------------------------------|
| [Claude Code](https://www.anthropic.com/claude-code)      | ✅ |                                                        |
| [GitHub Copilot](https://code.visualstudio.com/)          | ✅ | VSCode only                                                |
| [Gemini CLI](https://github.com/google-gemini/gemini-cli) | ✅ |                                                 |
| [Cursor](https://cursor.sh/)                              | ✅ |                                                        |
| [opencode](https://opencode.ai/)                          | ✅ |                                                |
| [Antigravity](https://antigravity.google/)                | ✅ |                                                |
| [Windsurf](https://windsurf.com/)                         | 🚧 | Testing                                                |
| [Kilo Code](https://github.com/Kilo-Org/kilocode)         | 🚧 | Testing                                                |
| [Roo Code](https://roocode.com/)                          | 🚧 | Testing                                                |
| [Codex CLI](https://github.com/openai/codex)              | ✅ | Only Global                                                |
| [Amp](https://ampcode.com/)                               | 🚧 | Testing                                                |

Templates are designed to provide structure while remaining concise and AI-friendly.

## Workflow Examples

### Initial Project Setup

1. **Initialize your project:**
   ```bash
   ai-devkit init
   ```

2. **Start with requirements:**
   - Use slash command to start filling the requirement `/new-requerement`
   - Your AI assistant will help clarify and document requirements
   - Use slash command to review the requirement `/review-requirement`

3. **Design your system:**
   - Review `docs/ai/design/` and feature-specific files
   - Use slash command to review the design `/review-design`
   - Your AI assistant will help clarify and document design
   
4. **Plan your work:**
   - Review `docs/ai/planning/` and feature-specific plans
   - Clarify and document plan with AI assistant

5. **Implement with guidance:**
   - When the plan is ready, your AI assistant will help you implement the code
   - You can start the execution of the plan with the command `/execute-plan`
   - AI assistant will help you to review the code and update the implementation notes
   - After executing each task, you can check the implementation and compare it with the design with AI support by using the command `/check-implementation`
   - Once the implementation is good, you can review the code with AI support by using the command `/code-review`

6. **Test thoroughly:**
   - After implementation is done, you can start testing
   - Use `docs/ai/testing/` as your testing guide
   - Use slash command to start writing test `/writing-test`

7. **Deploy confidently:**
   - Follow deployment procedures in `docs/ai/deployment/`

8. **Monitor and iterate:**
   - Set up monitoring per `docs/ai/monitoring/`

## Use Cases

- **New Projects**: Scaffold complete development documentation
- **Existing Projects**: Add structured documentation gradually
- **Team Collaboration**: Share common development practices
- **AI Pair Programming**: Provide context for AI assistants
- **Knowledge Management**: Document decisions and patterns

## Best Practices

1. **Keep templates updated**: As your project evolves, update phase documentation
2. **Reference across phases**: Link requirements to design, design to implementation
3. **Use with AI assistants**: Templates are designed to work well with AI code assistants
4. **Customize for your needs**: Templates are starting points, not rigid requirements
5. **Track decisions**: Document architectural decisions and their rationale

## Configuration File

The `.ai-devkit.json` file tracks your setup:

```json
{
  "version": "0.2.0",
  "environment": "cursor",
  "initializedPhases": ["requirements", "design", "planning"],
  "createdAt": "2025-10-14T...",
  "updatedAt": "2025-10-14T..."
}
```

## Development

To work on the CLI package:

```bash
# Clone the repository
git clone <repository-url>
cd ai-devkit

# Install dependencies for the monorepo
npm install

# Navigate to CLI package
cd packages/cli

# Run in development mode
npm run dev -- init

# Build
npm run build

# Test locally
npm link
ai-devkit init
```

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

## License

MIT

---

**Happy building with AI! 🚀**

## Quick Reference

| Quick links | Description |
|-------------|-------------|
| [CHANGELOG.md](CHANGELOG.md) | Recent changes and release notes |


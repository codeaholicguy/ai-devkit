# AI DevKit

A CLI toolkit for AI-assisted software development with structured phase templates and environment setup for Cursor and Claude Code.

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

# With flags
ai-devkit init --environment cursor --all

# Initialize specific phases
ai-devkit init --phases requirements,design,planning
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

**Examples:**
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
| [opencode](https://opencode.ai/)                          | 🚧 | Testing                                                |
| [Windsurf](https://windsurf.com/)                         | 🚧 | Testing                                                |
| [Kilo Code](https://github.com/Kilo-Org/kilocode)         | 🚧 | Testing                                                |
| [Roo Code](https://roocode.com/)                          | 🚧 | Testing                                                |
| [Codex CLI](https://github.com/openai/codex)              | 🚧 | Testing                                                |
| [Amp](https://ampcode.com/)                               | 🚧 | Testing                                                |

Templates are designed to provide structure while remaining concise and AI-friendly.

## Environment Setup

### Cursor

Generated files:
- `.cursor/rules/`: Project-specific rules as Markdown files (per [Cursor documentation](https://cursor.com/docs/context/rules))
- `.cursor/commands/`: Custom slash commands as Markdown files (per [Cursor documentation](https://cursor.com/docs/agent/chat/commands))

Available slash commands:
- `/new-requirement`: Complete workflow for adding a new feature from requirements to PR
- `/code-review`: Structured local code review against design docs before pushing changes
- `/execute-plan`: Walk a feature plan task-by-task with interactive prompts
- `/writing-test`: Write unit/integration tests targeting 100% coverage
- `/update-planning`: Update planning and task breakdown
- `/check-implementation`: Compare implementation with design
- `/review-design`: Review system design and architecture
- `/review-requirements`: Review and summarize requirements

Each command is stored as a plain Markdown file in `.cursor/commands/` and will automatically appear when you type `/` in Cursor's chat input.

### Claude Code

Generated files:
- `.claude/CLAUDE.md`: Workspace configuration and guidelines
- `.claude/commands/`: Custom commands as Markdown files

Available commands:
- `new-requirement` - Complete workflow for adding a new feature from requirements to PR
- `code-review` - Structured local code review against design docs before pushing changes
- `execute-plan` - Walk a feature plan task-by-task with interactive prompts
- `writing-test` - Write unit/integration tests targeting 100% coverage
- `update-planning` - Update planning and task breakdown
- `check-implementation` - Compare implementation with design
- `review-design` - Review system design and architecture
- `review-requirements` - Review and summarize requirements
- `capture-knowledge` - Analyze and explain code with recursive dependency analysis and Mermaid diagrams

Commands can be referenced in Claude Code chats to guide AI assistance through your development phases.

## Workflow Examples

### Initial Project Setup

1. **Initialize your project:**
   ```bash
   ai-devkit init
   ```

2. **Start with requirements:**
   - Fill out `docs/ai/requirements/README.md`
   - Use your AI assistant to help clarify and document requirements

3. **Design your system:**
   - Complete `docs/ai/design/README.md` and feature-specific files
   - Include mermaid diagrams for architecture, component interactions, and data flow
   - Reference requirements when making design decisions

4. **Plan your work:**
   - Break down tasks in `docs/ai/planning/README.md`
   - Estimate and prioritize

5. **Implement with guidance:**
   - Follow patterns in `docs/ai/implementation/README.md`
   - Keep implementation notes updated

6. **Test thoroughly:**
   - Use `docs/ai/testing/README.md` as your testing guide
   - Document test cases and results

7. **Deploy confidently:**
   - Follow deployment procedures in `docs/ai/deployment/README.md`

8. **Monitor and iterate:**
   - Set up monitoring per `docs/ai/monitoring/README.md`

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

To work on ai-devkit itself:

```bash
# Clone the repository
git clone <repository-url>
cd ai-devkit

# Install dependencies
npm install

# Run in development mode
npm run dev init

# Build
npm run build

# Test locally
npm link
ai-devkit init
```

> **Note:** `ai-devkit init` now ensures the current directory is a git repository. If git is available and the repo isn't initialized, it will run `git init` automatically.

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

## License

MIT

---

**Happy building with AI! 🚀**

## Quick Reference

| Task | Command |
|------|---------|
| Initialize everything | `npx ai-devkit init --all` |
| Initialize for Cursor | `npx ai-devkit init --environment cursor` |
| Add specific phases | `npx ai-devkit init --phases requirements,design` |
| Add one phase later | `npx ai-devkit phase testing` |
| Guided feature workflow | `/new-requirement` (Cursor & Claude) |
| Execute feature plan | `/execute-plan` (Cursor & Claude) |
| Generate tests | `/writing-test` (Cursor & Claude) |
| Local code review | `/code-review` (Cursor & Claude) |
| Help | `npx ai-devkit --help` |

| Quick links | Description |
|-------------|-------------|
| [CHANGELOG.md](CHANGELOG.md) | Recent changes and release notes |
| [templates/](templates/) | Phase and environment templates |


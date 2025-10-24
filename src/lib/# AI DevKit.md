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

### Từ npm (bản chính thức)

```bash
# Using npx (no installation needed)
npx ai-devkit init

# Or install globally
npm install -g ai-devkit
```

### Từ source code (fork cá nhân)

```bash
# Clone repository
git clone <your-fork-url>
cd ai-devkit

# Install dependencies
npm install

# Build project
npm run build

# Link globally để sử dụng như command
npm link

# Hoặc chạy trực tiếp với npm
npm run dev init

# Sau khi link, có thể dùng ở bất kỳ đâu
cd /path/to/your/project
ai-devkit init
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

### For Cursor:

```
└── .cursor/
    ├── rules/                # Project-specific rules (Markdown files)
    │   └── ai-devkit.md
    └── commands/             # Custom slash commands (Markdown files)
        ├── new-requirement.md
        ├── code-review.md
        ├── execute-plan.md
        ├── writing-test.md
        ├── update-planning.md
        ├── check-implementation.md
        ├── review-design.md
        ├── review-requirements.md
        └── capture-knowledge.md
```

### For Claude Code:

```
└── .claude/
    ├── CLAUDE.md             # Workspace configuration
    └── commands/             # Custom commands (Markdown files)
        ├── new-requirement.md
        ├── code-review.md
        ├── execute-plan.md
        ├── writing-test.md
        ├── update-planning.md
        ├── check-implementation.md
        ├── review-design.md
        ├── review-requirements.md
        └── capture-knowledge.md
```

## Customizing Templates

All templates are plain Markdown files with YAML frontmatter. You can customize them to fit your project's needs:

```markdown
---
phase: requirements
title: Requirements & Problem Understanding
description: Clarify the problem space, gather requirements, and define success criteria
---

# Your custom content here
```

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

### GitHub Copilot

Generated files:

- `.github/prompts/`: Auto-generated prompts as Markdown files (per [GitHub Copilot documentation](https://docs.github.com/en/copilot/customizing-copilot/adding-custom-instructions-for-github-copilot))

Available prompts:

- `new-requirement` - Complete workflow for adding a new feature from requirements to PR
- `code-review` - Structured local code review against design docs before pushing changes
- `execute-plan` - Walk a feature plan task-by-task with interactive prompts
- `writing-test` - Write unit/integration tests targeting 100% coverage
- `update-planning` - Update planning and task breakdown
- `check-implementation` - Compare implementation with design
- `review-design` - Review system design and architecture
- `review-requirements` - Review and summarize requirements
- `capture-knowledge` - Analyze and explain code with recursive dependency analysis
- `debug` - Structured debugging assistant

Prompts are automatically available in VS Code with GitHub Copilot extension. Sử dụng bằng cách gõ `#` trong Copilot Chat để xem danh sách prompts có sẵn.

### GitHub Copilot

Generated files:

- `.github/prompts/`: Auto-generated prompts as Markdown files (per [GitHub Copilot documentation](https://docs.github.com/en/copilot/customizing-copilot/adding-custom-instructions-for-github-copilot))

Available prompts:

- `new-requirement` - Complete workflow for adding a new feature from requirements to PR
- `code-review` - Structured local code review against design docs before pushing changes
- `execute-plan` - Walk a feature plan task-by-task with interactive prompts
- `writing-test` - Write unit/integration tests targeting 100% coverage
- `update-planning` - Update planning and task breakdown
- `check-implementation` - Compare implementation with design
- `review-design` - Review system design and architecture
- `review-requirements` - Review and summarize requirements
- `capture-knowledge` - Analyze and explain code with recursive dependency analysis
- `debug` - Structured debugging assistant

Prompts are automatically available in VS Code with GitHub Copilot extension. Sử dụng bằng cách gõ `#` trong Copilot Chat để xem danh sách prompts có sẵn.

### GitHub Copilot

Generated files:

- `.github/prompts/`: Auto-generated prompts as Markdown files (per [GitHub Copilot documentation](https://docs.github.com/en/copilot/customizing-copilot/adding-custom-instructions-for-github-copilot))

Available prompts:

- `new-requirement` - Complete workflow for adding a new feature from requirements to PR
- `code-review` - Structured local code review against design docs before pushing changes
- `execute-plan` - Walk a feature plan task-by-task with interactive prompts
- `writing-test` - Write unit/integration tests targeting 100% coverage
- `update-planning` - Update planning and task breakdown
- `check-implementation` - Compare implementation with design
- `review-design` - Review system design and architecture
- `review-requirements` - Review and summarize requirements
- `capture-knowledge` - Analyze and explain code with recursive dependency analysis
- `debug` - Structured debugging assistant

Prompts are automatically available in VS Code with GitHub Copilot extension. Sử dụng bằng cách gõ `#` trong Copilot Chat để xem danh sách prompts có sẵn.

### GitHub Copilot

Generated files:

- `.github/prompts/`: Auto-generated prompts as Markdown files (per [GitHub Copilot documentation](https://docs.github.com/en/copilot/customizing-copilot/adding-custom-instructions-for-github-copilot))

Available prompts:

- `new-requirement` - Complete workflow for adding a new feature from requirements to PR
- `code-review` - Structured local code review against design docs before pushing changes
- `execute-plan` - Walk a feature plan task-by-task with interactive prompts
- `writing-test` - Write unit/integration tests targeting 100% coverage
- `update-planning` - Update planning and task breakdown
- `check-implementation` - Compare implementation with design
- `review-design` - Review system design and architecture
- `review-requirements` - Review and summarize requirements
- `capture-knowledge` - Analyze and explain code with recursive dependency analysis
- `debug` - Structured debugging assistant

Prompts are automatically available in VS Code with GitHub Copilot extension. Sử dụng bằng cách gõ `#` trong Copilot Chat để xem danh sách prompts có sẵn.

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

### Adding a New Feature

**Use the `/new-requirement` command for a guided workflow:**

1. **In Cursor or Claude Code**, type `/new-requirement`
2. The AI will guide you through:
   - 📋 Capturing requirement details
   - 🔍 Creating feature-specific documentation
   - 📐 Designing the solution
   - 📅 Planning tasks and breaking down work
   - 💻 Implementation (task by task)
   - ✅ Testing and verification
   - 🔀 Git commits and PR/MR creation

**Review and refine your documentation:**

- After drafting requirements, run `/review-requirements` to validate completeness
- After drafting design, run `/review-design` to ensure architecture clarity and mermaid diagrams

**Execute your plan:**

- Run `/execute-plan` to step through tasks interactively:
  - Reads `docs/ai/planning/feature-{name}.md`
  - Presents tasks in order with context
  - Captures status/notes for each task
  - Prompts you to update documentation as you progress

**Before pushing your code:**

- Run `/code-review` to perform a structured local review:
  - Checks alignment with design docs
  - Spots logic/security/performance issues
  - Highlights redundant code and missing tests
  - Suggests documentation updates

**Generate comprehensive tests:**

- Run `/writing-test` to create unit and integration tests targeting 100% coverage

This workflow creates feature-specific files:

- `docs/ai/requirements/feature-{name}.md`
- `docs/ai/design/feature-{name}.md`
- `docs/ai/planning/feature-{name}.md`
- `docs/ai/implementation/feature-{name}.md`
- `docs/ai/testing/feature-{name}.md`

### Understanding Existing Code

**Use the `/capture-knowledge` command to analyze and document code:**

The `capture-knowledge` command helps you understand how existing code works by analyzing it from any entry point and generating comprehensive documentation with visual diagrams.

**In Cursor:**

```
/capture-knowledge <entry-point> [options]
```

**In Claude Code:**

```
Use the capture-knowledge command to analyze <entry-point>
```

**Entry Point Types:**

- **File**: `/capture-knowledge src/api/users.ts` - Analyzes a specific file
- **Folder**: `/capture-knowledge src/services/` - Analyzes an entire module
- **Function**: `/capture-knowledge calculateTotalPrice` - Analyzes a specific function
- **API Endpoint**: `/capture-knowledge POST:/api/users` - Analyzes an API endpoint flow

**Options:**

- `--depth <n>` - Control recursion depth (default: 3)
- `--save` - Save output to `docs/ai/knowledge/`
- `--diagram-only` - Generate only diagrams

**What You Get:**

- 📖 **Detailed Explanation**: Natural language description of how the code works
- 🔍 **Implementation Details**: Key components, logic flow, and design patterns
- 🔗 **Recursive Dependency Analysis**: Automatically traces and explains all dependencies
- 📊 **Mermaid Diagrams**: Visual flowcharts, sequence diagrams, and architecture diagrams
- 💡 **Insights**: Performance considerations, security notes, potential improvements

**Example Outputs:**

For functions, you get:

- Flowchart showing execution path
- Parameter and return value documentation
- Called functions and their purposes
- Error handling strategy

For API endpoints, you get:

- Sequence diagram showing request flow
- Validation and authentication steps
- Database operations
- Response format

For modules/folders, you get:

- Architecture diagram showing component relationships
- Overview of each file's purpose
- Module boundaries and dependencies

**Use Cases:**

- 🎯 Onboarding new developers to understand the codebase
- 📚 Generating documentation for complex systems
- 🔍 Debugging by understanding complete execution flow
- 🏗️ Refactoring with full context of dependencies
- 📖 Creating knowledge base entries

**Example Workflow:**

```bash
# Understand a payment function
/capture-knowledge processPayment --depth 4

# Document an entire authentication module
/capture-knowledge src/auth/ --save

# Analyze an API endpoint
/capture-knowledge POST:/api/checkout

# Get just the diagrams for a complex function
/capture-knowledge handleOrderProcessing --diagram-only
```

The analysis is saved to `docs/ai/knowledge/` and can be versioned alongside your code.

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

| Task                    | Command                                           |
| ----------------------- | ------------------------------------------------- |
| Initialize everything   | `npx ai-devkit init --all`                        |
| Initialize for Cursor   | `npx ai-devkit init --environment cursor`         |
| Add specific phases     | `npx ai-devkit init --phases requirements,design` |
| Add one phase later     | `npx ai-devkit phase testing`                     |
| Guided feature workflow | `/new-requirement` (Cursor & Claude)              |
| Execute feature plan    | `/execute-plan` (Cursor & Claude)                 |
| Generate tests          | `/writing-test` (Cursor & Claude)                 |
| Local code review       | `/code-review` (Cursor & Claude)                  |
| Help                    | `npx ai-devkit --help`                            |

| Quick links                  | Description                      |
| ---------------------------- | -------------------------------- |
| [CHANGELOG.md](CHANGELOG.md) | Recent changes and release notes |
| [templates/](templates/)     | Phase and environment templates  |

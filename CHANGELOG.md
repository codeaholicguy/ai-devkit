# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.10.0] - 2026-02-01

### Added

- **Agent Management** - Detect and control external AI agents
  - **List Agents**: `ai-devkit agent list` - View running agents (Claude Code, etc.)
  - **Open Agent**: `ai-devkit agent open <name>` - Focus agent terminal window
  - **Terminal Support**: Works with tmux, iTerm2, and Apple Terminal
  - **Fuzzy Matching**: Open agents by partial name

## [0.9.0] - 2026-01-28

### Added

- **Terminal UI Standardization** - Centralized terminal output utility for consistent CLI experience
- **Skill Update Command** - New `ai-devkit skill update` command for updating skills from registries
  - **Update All Skills**: `ai-devkit skill update` - Updates all cached skill registries via git pull
  - **Update Specific Registry**: `ai-devkit skill update <registry-id>` - Updates only the specified registry (e.g., `ai-devkit skill update anthropic/skills`)

### Changed

- **Module Resolution** - Updated TypeScript configuration from Node16 to CommonJS for better compatibility

### Fixed

- **Graceful Exit** - Commands now properly exit with code 0 on successful completion
  - `skill list` - Added explicit process.exit(0) when no skills found
  - `skill remove` - Added explicit process.exit(0) after successful removal

## [0.8.1] - 2026-01-26

### Added

- **Custom Skill Registries** - Support `skills.registries` in global `~/.ai-devkit/.ai-devkit.json` for adding multiple registries that merge with defaults and override on conflicts.
- **Global Registry Reader** - New global config reader for resolving custom registries in skill commands.

### Changed

- **Skill Registry Resolution** - Skill commands now merge default and custom registries, with offline cache fallback when a registry URL is not configured.

## [0.8.0] - 2026-01-26

### Added

- **Memory Skill Template** - New skill for integrating memory service capabilities into agent workflows
- **Comprehensive Documentation** - Added extensive documentation pages for:
  - Getting Started guide
  - Supported AI agents reference
  - Development with AI DevKit 
  - Debug workflows
  - Understanding existing code
  - Memory service usage
  - Skills management
- Updated base template for all environments

## [0.7.0] - 2026-01-25

### Added

- **Skill Management** - Centralized registry for managing Agent Skills across projects
  - **One-Command Installation**: `ai-devkit skill add <registry>/<repo> <skill-name>`
  - **Local Cache**: Skills stored in `~/.ai-devkit/skills/` to avoid duplication
  - **Symlink-First Strategy**: Symlinks with automatic copy fallback for Windows
  - **Multi-Environment Support**: Works with Cursor, Claude Code, Codex, OpenCode, and Antigravity
  - **CLI Commands**:
    - `ai-devkit skill add <registry>/<repo> <skill-name>` - Install a skill from registry
    - `ai-devkit skill list` - List all installed skills with sources
    - `ai-devkit skill remove <skill-name>` - Remove skill from project
  - **Features**:
    - Centralized registry file (`skills/registry.json`) with verified repositories
    - Automatic `.ai-devkit.json` creation if missing
    - Environment filtering (only shows/uses environments with skill support)
    - Git repository caching for efficient reuse across projects
    - Validation for registry IDs and skill names (follows Agent Skills spec)

## [0.6.0] - 2026-01-22

### Added

- **Knowledge Memory Service** (`packages/memory`) - A lightweight MCP-based memory service for AI agents
  - Store and retrieve actionable knowledge using SQLite with FTS5 full-text search
  - **Core Features**:
    - 🔍 **Full-Text Search** - FTS5 with BM25 ranking
    - 🏷️ **Tag-Based Filtering** - Boost results by contextTags
    - 📁 **Scoped Knowledge** - global, project, or repo-specific rules
    - 🔄 **Deduplication** - Prevents duplicate content
  - **CLI Integration**: New `memory` command family
    - `ai-devkit memory store` - Store new knowledge items
    - `ai-devkit memory search` - Search for relevant knowledge
- **Global Setup Command** - New `ai-devkit setup --global` command for installing commands globally
  - Copy AI DevKit commands to global environment folders
  - Support for Antigravity (`~/.gemini/antigravity/global_workflows/`) and Codex (`~/.codex/prompts/`)
  - Interactive environment selection with only global-capable environments shown
  - Overwrite prompts for existing global commands
  - Cross-platform support using `os.homedir()` and `path.join()`

## [0.5.0] - 2025-01-15

### Added

- **Antigravity Support** - Added support for Google Antigravity
- **New Slash Command** - `/simplify-implementation` for analyzing and simplifying existing implementations

### Changed

- **Dynamic TOML Generation** - Refactored TemplateManager to dynamically generate `.toml` files from `.md` files at runtime

## [0.4.2] - 2025-11-05

- Fixed Gemini CLI integration [https://github.com/codeaholicguy/ai-devkit/issues/3](https://github.com/codeaholicguy/ai-devkit/issues/3)
- Added test for TemplateManager.ts
- Fixed Github Copilot integration [https://github.com/codeaholicguy/ai-devkit/issues/4](https://github.com/codeaholicguy/ai-devkit/issues/4)

## [0.4.0] - 2025-10-31

### Added

- **Multi-Environment Setup** - Support for 10 AI development environments
  - Interactive environment selection with multi-choice prompts
  - Support for Cursor, Claude Code, GitHub Copilot, Google Gemini, OpenAI Codex, Windsurf, KiloCode, AMP, OpenCode, and Roo Code
  - Unified template structure with AGENTS.md files for all environments
  - Environment-specific command directories and configuration files
  - Override protection with confirmation prompts for existing environments
  - Config persistence storing selected environments array

### Changed

- **Breaking Changes** - Removed legacy single-environment support for cleaner API
  - Renamed `EnvironmentId` to `EnvironmentCode` throughout codebase
  - Removed legacy `Environment` type union (cursor | claude | both)
  - Updated config schema to use `environments: EnvironmentCode[]`
  - All environments now use standardized AGENTS.md context files

### Technical Improvements

- **Testing Infrastructure** - Complete test suite implementation
- **Architecture** - Modular design improvements

## [0.3.0] - 2025-10-15

### Added

- `/debug` - Structured assistant for clarifying issues, analyzing options, and agreeing on a fix plan before coding
- `/capture-knowledge` - Analyze and explain how code works from any entry point
  - Supports file, folder, function, and API endpoint analysis
  - Recursive dependency analysis with configurable depth (max: 3)
  - Automatic generation of mermaid diagrams (flowcharts, sequence, architecture, class diagrams)
  - Knowledge capture documentation saved to `docs/ai/implementation/knowledge-{feature-name}.md`
  - Visual dependency tree and component relationship mapping
  - Includes error handling, performance considerations, and improvement suggestions

## [0.2.0] - 2025-10-14

### Added

- Eight slash commands for Cursor and Claude Code:
  - `/new-requirement` - Complete guided workflow from requirements to PR/MR creation
  - `/code-review` - Structured local code reviews
  - `/execute-plan` - Walk feature plans task-by-task
  - `/writing-test` - Generate tests with guidance for 100% coverage
  - `/update-planning` - Reconcile progress with planning docs
  - `/check-implementation` - Compare implementation with design
  - `/review-design` - Review system design and architecture
  - `/review-requirements` - Review and summarize requirements
- Claude workspace configuration file (`CLAUDE.md`)
- Cursor rules file (`ai-devkit.md`)
- Design documentation requirements for mermaid diagrams (architecture and data flow)

## [0.1.0] - 2025-10-14

### Added

- Initial release of AI DevKit CLI
- Interactive `init` command for project initialization
- Support for Cursor and Claude Code environments
- Seven phase templates: requirements, design, planning, implementation, testing, deployment, monitoring
- `phase` command for adding individual phases
- Configuration management with `.ai-devkit.json`
- Template overwrite prompts for existing files
- Comprehensive documentation and README
- TypeScript support with full type definitions
- Cursor rules in `.cursor/rules/` directory
- Cursor slash commands as individual Markdown files in `.cursor/commands/`
- Claude Code workspace configuration in `CLAUDE.md`

### Features

- Interactive prompts with Inquirer
- Flag-based overrides for automation
- Markdown templates with YAML frontmatter
- Cursor rules and slash commands generation
- Claude Code workspace configuration
- State tracking for initialized phases


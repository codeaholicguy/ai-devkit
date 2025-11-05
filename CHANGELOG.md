# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

- Fixed Gemini CLI integration https://github.com/codeaholicguy/ai-devkit/issues/3
- Added test for TemplateManager.ts
- Fixed Github Copilot integration https://github.com/codeaholicguy/ai-devkit/issues/4

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


# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.27.0] - 2026-04-25

### Fixed

- **Check Status Path Traversal** - Validated `FEATURE` argument in `check-status.sh` to prevent path traversal (#66).
- **Shell Injection in TerminalFocusManager** - Fixed `execAsync` calls to use array arguments instead of string interpolation, preventing potential shell injection.

### Changed

- **SkillManager Refactor** - Split `SkillManager` into dedicated `SkillIndex` and `SkillRegistry` modules for better separation of concerns.
- **ClaudeCodeAdapter Refactor** - Extracted session parsing logic from `ClaudeCodeAdapter` into a standalone `ClaudeSessionParser` utility.
- **Centralized Error Handling** - Added `withErrorHandler` utility for consistent error handling across CLI commands (`agent`, `channel`, `memory`, `skill`).
- **AgentManager getAdapter** - Added `getAdapter()` method to `AgentManager`, reducing adapter resolution duplication in CLI commands.
- **Standardized Error Types** - Updated all try-catch blocks to use `unknown` error type for type safety.
- **Environment Code Consistency** - Renamed environment code references for consistency across CLI (`init`, `Config`, `EnvironmentSelector`, `TemplateManager`).
- **Code Cleanup** - Removed stray `console.log` statements, cleaned up tests, and added `.editorconfig`.

## [0.26.0] - 2026-04-22

### Added

- **Gemini CLI Agent Adapter** - Added `GeminiCliAdapter` to the agent manager so `ai-devkit agent list` and `ai-devkit agent detail` can discover and inspect running Gemini CLI sessions, with process detection, session discovery via `projectHash` matching, and content normalization for Gemini's polymorphic message format (#70).
- **Gemini CLI Channel Support** - Added `GeminiCliAdapter` to the `channel` command for Gemini CLI channel operations.

### Fixed

- **Shell Injection Prevention** - Hardened git utility functions against shell injection.
- **Skill Path Validation** - Added validation for skill paths to prevent invalid path traversal in `SkillManager`.

### Changed

- **Removed Redundant Commands** - Cleaned up duplicate command templates (`capture-knowledge`, `debug`, `simplify-implementation`) from both root `commands/` and `packages/cli/templates/commands/`.

## [0.25.0] - 2026-04-21

### Fixed

- **Agent Manager Terminal.app Detection** - Fixed Terminal.app detection in the agent manager.
- **Agent Manager iTerm Sending** - Fixed sending input to agents in iTerm.

## [0.24.0] - 2026-04-18

### Changed

- **Flat Config Structure** - Moved `registries` and `skills` to top-level fields in project, global, and template configs. Previously `registries` was nested under `skills` (`skills.registries`); now both `registries` and `skills` sit at the same level for consistency across all config contexts.
- **Template Registries Support** - Init templates can now declare custom `registries` that get saved to the project config during `ai-devkit init --template`.
- **Shared Registry Filter** - Extracted duplicate registry-filtering logic from `ConfigManager` and `GlobalConfigManager` into a shared `filterStringRecord()` helper.
- **Removed Dead Code** - Removed unused `getInstalledSkills()` method, `normalizeSkillsConfig()` method, `SkillsConfig` interface, and `SkillRegistriesConfig` interface.

### Breaking Changes

- The `skills` field in `.ai-devkit.json` is now always a plain array of `{ registry, name }` objects. The previous object format (`{ registries: {...}, installed: [...] }`) is no longer supported.
- The global config (`~/.ai-devkit/.ai-devkit.json`) now uses a top-level `registries` field instead of `skills.registries`.

## [0.23.1] - 2026-04-17

### Fixed

- **Skill Remove Config Cleanup** - Fixed `skill remove` not removing the skill entry from `.ai-devkit.json`.
- **Install Update Guard** - Fixed install service updating config when there are no successful installs.
- **Install Skills Update Guard** - Fixed install service including skills in the update object when there are no successful skills.
- **Install Skills Object Format** - Fixed `install` failing when the `skills` field in config is an object with an `installed` array rather than a plain array.

## [0.23.0] - 2026-04-17

### Added

- **MCP Server Config Standardization** - Added `mcpServers` support to `init` and `install` flows with environment-specific generators (`ClaudeCodeMcpGenerator`, `CodexMcpGenerator`) for standardized MCP server config across AI agents (#61).
- **Channel Debug Flag** - Added `--debug` flag to the `channel` command for verbose debugging output.

### Fixed

- **Memory MCP Tool Names** - Renamed MCP tool names from dot-separated (`memory.storeKnowledge`) to underscore-separated (`memory_storeKnowledge`, `memory_updateKnowledge`, `memory_searchKnowledge`) to comply with strict MCP client naming regex `^[a-zA-Z0-9_-]{1,64}$`; backward-compat aliases retained for existing users (#59).
- **Skill Add With No Environments** - Fixed `skill add` crashing when no environments are defined in config.
- **Config addSkill Crash** - Fixed `addSkill()` crashing when the `skills` field is an object containing a `registries` key rather than an array.

## [0.22.0] - 2026-04-12

### Added

- **Channel Connector Package** - Added new `@ai-devkit/channel-connector` package with channel management, config storage, and Telegram adapter support, plus CLI commands for channel operations (#53).
- **Channel Connector Release Workflow** - Added publish workflow and package ignore rules for releasing the channel connector package.
- **Codex Plugin Config** - Added `.codex-plugin/plugin.json` configuration.
- **Dev Lifecycle Guide** - Added web documentation for the dev-lifecycle skill.
- **Shopify Toolkit Registry Entry** - Added the Shopify toolkit skill to the registry.
- **Git Hooks** - Added Husky `pre-commit` and `pre-push` hooks.

### Changed

- **Memory Skill Workflow** - Improved the memory skill workflow and updated the OpenAI agent configuration used by the skill.
- **Dev Lifecycle Brainstorming** - Updated the dev-lifecycle `new-requirement` guidance to include brainstorming refinements.
- **Code Review Guidance** - Refreshed code review instructions across command templates and dev-lifecycle references.
- **CLI Environment Support** - Added Amp Code environment configuration support and updated related CLI expectations.

## [0.21.1] - 2026-04-04

### Fixed

- **Interactive Skill Add Parsing** - Fixed `ai-devkit skill add <registry>` so it no longer requires `skill-name` and can open the interactive skill selection flow.

## [0.21.0] - 2026-04-04

### Added

- **Interactive Skill Selection** - `ai-devkit skill add` can now present an interactive multi-select flow when adding skills from a registry (#51).
- **Memory DB Path Configuration** - Added support for configuring a project-specific memory database path and using it in CLI and memory API flows (#50).
- **Senior Engineer Skills** - Added `verify` and `tdd` skills and included them in the `senior-engineer` template.
- **Targeted Global Skill Install Prompt** - Added environment-aware prompting to support targeted global skill installation.
- **E2E Coverage** - Added end-to-end test coverage for the new memory database path configuration flow.

### Changed

- **Skill Guidance** - Updated memory skill instructions and refreshed skill red-flag guidance.
- **Bundled Skills Data** - Added new bundled skills and updated skill registry metadata.
- **E2E Test Maintenance** - Cleaned up the end-to-end test suite for the new CLI flows.

### Fixed

- **Ora Compatibility** - Fixed the `ora` dependency/version issue.

## [0.20.1] - 2026-03-13

### Added

- **Agent Orchestration Skill** - New `agent-orchestration` skill for coordinating multi-agent workflows, including OpenAI agent configuration.

### Changed

- **TTY Writer** - Fixed sending enter separately for more reliable agent input delivery.
- **Dependency Updates** - Upgraded project dependencies.
- **Analytics Config** - Disabled Nx analytics in project configuration.

## [0.20.0] - 2026-03-12

### Added

- **Agent Detail Command** - New `ai-devkit agent detail --id <name>` command to inspect running agent conversations (#49).
- **Skill Registry** - Added `samber/cc-skills-golang` skill repository.

### Changed

- **Agent Identifier** - Updated agent identifier; removed `slug` field from `AgentInfo` in favor of simplified name-based matching.

## [0.19.0] - 2026-03-11

### Added

- **Agent List CWD** - Agent list command now displays the current working directory for each running agent (#47).
- **Clarification & Brainstorming Loop** - Added clarification and brainstorming loop to `review-design` and `review-requirements` commands.

### Changed

- **Generalized Session Mapping** - Refactored process-to-session mapping into shared utilities (`matching`, `session`, `process`) used by both Claude Code and Codex adapters, replacing adapter-specific implementations (#45).
- **Claude Sessions PID Matching** - Updated Claude Code session matching for more reliable PID-based detection (#48).

## [0.18.0] - 2026-03-10

### Added

- **Custom Docs Directory** - Added support for configuring a custom AI documentation directory via `paths.docs` and `ai-devkit init --docs-dir <path>`.

### Changed

- **Claude Code Adapter** - Reimplemented Claude Code session matching to use process start times, bounded session scanning, and direct session-based summaries for more reliable agent detection.
- **Node.js Requirement** - Updated the minimum supported Node.js version to `20.20.0`.

### Fixed

- **Codex Cross-Repo Matching** - Prevented Codex agent session matching from incorrectly attaching sessions across repositories.
- **Git Passphrase Prompts** - Fixed skill registry git operations so passphrase input works correctly during clone and update flows.

## [0.17.0] - 2026-03-09

### Added

- **Agent Send Command** - New `ai-devkit agent send` command for sending input to running agents via TTY writer.
- **Agent Type Display** - Agent list now shows agent type (e.g., Claude Code, Codex) in the listing output.

### Changed

- **Worktrees Location** - Updated dev-lifecycle skill worktree setup references.

## [0.16.0] - 2026-02-27

### Added

- **Codex Adapter** - Added Codex adapter support.
- **Agent Manager Package** - Added standalone `@ai-devkit/agent-manager` package.

### Changed

- **CLI Agent Migration** - Migrated `agent` command to `@ai-devkit/agent-manager`.
- **Skill Registry Priority** - Updated skill registry priority handling.
- **Init/Install Templates** - Stopped copying context templates during `init`/`install`.
- **Version Output Source** - `--version` now uses package version output.
- **Documentation** - Updated docs and improved web agent setup guide with template-based init.
- **Project Templates** - Added and updated templates used across setup flows.
- **Install Validation** - Added install smoke-test updates for `ai-devkit install`.

### Fixed

- **Agent List Display** - Kept the `working-on` column to one line in agent list output.
- **Claude PID Session Mapping** - Prefer exact history cwd for Claude pid-session mapping.
- **Config Manager Phase Handling** - Guarded missing phases in config manager.
- **Docs Typos/Troubleshooting** - Fixed typo and added Codex sandbox `npx` troubleshooting FAQ.

## [0.15.0] - 2026-02-24

### Added

- **Install Command** - Added `ai-devkit install` to apply project configuration from `.ai-devkit.json`
  - Supports `--config <path>` for custom config file locations
  - Supports `--overwrite` for non-interactive full overwrite mode
  - Installs environments, phases, and skills in a single run with summary output

## [0.14.0] - 2026-02-21

### Changed
- **Dependency Updates** - Upgraded `better-sqlite3`

## [0.13.0] - 2026-02-20

### Added

- **Lint Command** - Added `ai-devkit lint` command support
- **Template Mode for Init** - Added init template mode with YAML/JSON support
- **Memory Update Command** - Added `ai-devkit memory update` for modifying knowledge items by ID
- **New Skills** - Added `capture-knowledge`, `simplify-implementation` and
  `technical-writer` skills
- **Plugin Support** - Added `.claude-plugin` and `.cursor-plugin` integration files

### Changed

- **Dev Lifecycle Workflows** - Refactored worktree setup and new-requirement flow
- **Lifecycle Documentation** - Updated docs to require feature worktrees and make bootstrap language-agnostic
- **Web Docs Navigation** - Added linkable anchors for documentation section headings
- **Command Templates** - Updated CLI command templates
- **Skill Registry Handling** - Refresh cached skill registry automatically on `skill add`
- **Documentation Updates** - Refreshed README and development docs for current CLI behavior

### Fixed

- **Memory Test Stability** - Fixed flaky `updated_at` timestamp test in memory module

## [0.12.0] - 2026-02-17

### Added

- **Dev Lifecycle Skill** - Added structured SDLC skill with phase references and helper scripts
- **Debug Skill** - Added reusable debug skill definitions for agent workflows
- **Web Skill Search Experience** - Added `/skills` web page and related docs/navigation updates
- **Memory Search Table Output** - Added `ai-devkit memory search --table` for terminal-friendly results

### Changed

- **Skill Registry Data** - Updated skill registry/index content and automated rebuild outputs
- **Documentation** - Added/updated AI phase docs for setup wizard, web skill search, and memory search table output

### Fixed
- **Init Environment Parsing** - Improved `init -e` handling for full environment values

## [0.11.0] - 2026-02-06

### Added

- **Skill Search** - New `skill find` command to discover skills across all registries
  - **Keyword Search**: Find skills by name or description (e.g., `ai-devkit skill find typescript`)
- **Skill Index Rebuild** - New `skill rebuild-index` command for search feature

### Changed

- **Native Fetch** - Migrated network calls from `https` to native `fetch` API for cleaner code
- **GITHUB_TOKEN Support** - GitHub API calls now use `GITHUB_TOKEN` environment variable when available

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

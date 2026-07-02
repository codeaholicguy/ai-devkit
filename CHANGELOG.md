# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.47.0] - 2026-07-02

- [941fabf](https://github.com/codeaholicguy/ai-devkit/pull/130) Added Grok environment skills support.
- [4206681](https://github.com/codeaholicguy/ai-devkit/pull/129) Added the Grok Build CLI adapter.
- [aa972da](https://github.com/codeaholicguy/ai-devkit/pull/134) Added Antigravity CLI environment support.
- [fbf4bf7](https://github.com/codeaholicguy/ai-devkit/pull/132) Added the durable task system with append-only event history.
- [8ecb865](https://github.com/codeaholicguy/ai-devkit/pull/131) Added the built-in task skill for CLI-driven lifecycle/debug progress tracking.
- [5c69c3a](https://github.com/codeaholicguy/ai-devkit/commit/5c69c3a15ed52cc52935459ada80a4cded1468d9) Updated `better-sqlite3` to 12.11.1.

## [0.46.0] - 2026-06-30

- [172ef94](https://github.com/codeaholicguy/ai-devkit/pull/126) Added Claude PreToolUse forwarding to Telegram for tool invocations.
- [61a6633](https://github.com/codeaholicguy/ai-devkit/commit/61a6633c985759db812e8bccf77bfc8129253d4a) Updated the Claude Code hook configuration.
- [7fa1ff](https://github.com/codeaholicguy/ai-devkit/pull/128) Added WezTerm terminal support to agent manager.
- [70c86c9](https://github.com/codeaholicguy/ai-devkit/pull/127) Rendered Claude AskUserQuestion prompts as Telegram inline keyboards.

## [0.44.1] - 2026-06-29

- [fb66494](https://github.com/codeaholicguy/ai-devkit/pull/123) Fixed tmux send body delivery by using bracketed paste.
- [d75ab3b](https://github.com/codeaholicguy/ai-devkit/pull/125) Fixed Telegram markdown delivery by chunking messages before rendering.

## [0.44.0] - 2026-06-27

- [f7d1144](https://github.com/codeaholicguy/ai-devkit/pull/117) Fixed Telegram delivery reliability.
- [e638fdf](https://github.com/codeaholicguy/ai-devkit/pull/118) Removed `updatedAt` from new project config writes.
- [291ffdf](https://github.com/codeaholicguy/ai-devkit/pull/119) Removed the install artifact overwrite prompt.
- [76887e6](https://github.com/codeaholicguy/ai-devkit/pull/120) Added the `dev-commit` workflow skill.
- [05581dd](https://github.com/codeaholicguy/ai-devkit/pull/121) Added the `dev-pr` workflow skill.
- [e04ae44](https://github.com/codeaholicguy/ai-devkit/commit/e04ae44c2bbf842b58242f0c3e1c5c78bc1ab1d2) Installed built-in skills during agent setup.

## [0.43.0] - 2026-06-26

- [997ef2d](https://github.com/codeaholicguy/ai-devkit/commit/997ef2dce2db45acfc18217e5ab352fcdb0122f4) Added the `agent-management` built-in skill.
- [0b1cc33](https://github.com/codeaholicguy/ai-devkit/pull/116) Added the Codex session mapping hook.
- [3b5b99c](https://github.com/codeaholicguy/ai-devkit/commit/3b5b99c18053d81b910d7776a98a70c4c77620a1) Added the `agent setup` CLI command.

## [0.42.1] - 2026-06-25

- [8e5e745](https://github.com/codeaholicguy/ai-devkit/commit/8e5e74553ce483fddd5d3150c6464aad957c3930) Fixed Claude agent start timeout handling.

## [0.42.0] - 2026-06-17

- [676bd04](https://github.com/codeaholicguy/ai-devkit/commit/676bd041aa9e8f4a684b6a1dc5731af866b8abb3) Fixed `dev-lifecycle` startup guidance to list installed skills.
- [60f9270](https://github.com/codeaholicguy/ai-devkit/commit/60f92701d1e82ac4e95062678ca1ce533e1cb528) Improved the `simplify-implementation` skill guidance.
- [ad06c60](https://github.com/codeaholicguy/ai-devkit/pull/108) Added the memory dashboard plugin.
- [34d3552](https://github.com/codeaholicguy/ai-devkit/pull/112) Added CLI support for agent groups.
- [e734194](https://github.com/codeaholicguy/ai-devkit/pull/111) Fixed Codex session matching by using `session_meta` timestamps.

## [0.41.2] - 2026-06-14

- [c75d73b](https://github.com/codeaholicguy/ai-devkit/commit/c75d73bb36a5929f6b8c76f36a39e4539536743d) Split `dev-lifecycle` into orchestrated phase-specific skills.
- [12ba398](https://github.com/codeaholicguy/ai-devkit/commit/12ba398d91185dc88d71b93f6b6cbb69c2d3b81b) Added AI DevKit branding to skill metadata.
- [2deeb57](https://github.com/codeaholicguy/ai-devkit/commit/2deeb57158538c6b870a736c6638e0de9e6a47db) Updated built-in skill definitions.

## [0.41.1] - 2026-06-13

- [b0c3d45](https://github.com/codeaholicguy/ai-devkit/commit/b0c3d45e4fe167801de0764ba3263a3a2b503705) Documented Pi agent integration.
- [bd40286](https://github.com/codeaholicguy/ai-devkit/commit/bd4028603fd414d885bbf30a2ac2a9cfa104e26c) Fixed duplicate Copilot wrapper agents.
- [8a943ff](https://github.com/codeaholicguy/ai-devkit/commit/8a943ff133c86a529e581583c2151a238163f913) Fixed wrapper PID handling for Gemini and Copilot agents.

## [0.41.0] - 2026-06-13

- [ab88047](https://github.com/codeaholicguy/ai-devkit/commit/ab88047d6b27d537c2cc644597c1d8f0f97f6ec0) Added package repository metadata.
- [de3203b](https://github.com/codeaholicguy/ai-devkit/commit/de3203b9dfcf93001e64ba2600455faa1ce65f42) Added Junie CLI support.
- [807ec44](https://github.com/codeaholicguy/ai-devkit/commit/807ec447325aa5c788dae45ae9cde3786780ae84) Added Cline support.
- [1520d2f](https://github.com/codeaholicguy/ai-devkit/commit/1520d2ff2535b6b43e732e5ce29384cce8022182) Updated GitHub Copilot support.
- [aeb8a15](https://github.com/codeaholicguy/ai-devkit/commit/aeb8a15825b65506fb49dc4042f8ad189a7a9244) Added Devin support.
- [432b32f](https://github.com/codeaholicguy/ai-devkit/commit/432b32f7e160451376baaf37074d018204b9d12b) Removed unused environment context filename metadata.
- [8c1bf9e](https://github.com/codeaholicguy/ai-devkit/commit/8c1bf9e0a15d47c4171665887b4a1163a938cdf6) Removed workflow slash command support.
- [39562d2](https://github.com/codeaholicguy/ai-devkit/commit/39562d264f9485b90b48378b2f303ba283124bfe) Added Gemini project skill path support.
- [aa43342](https://github.com/codeaholicguy/ai-devkit/commit/aa43342ce81bb8cda80c2a18ae0e1146ac2604e1) Added Roo Code skills and MCP support.
- [672496a](https://github.com/codeaholicguy/ai-devkit/commit/672496a30b968b32d735101bb1fade29fdec66fb) Removed Windsurf environment support.
- [fbaef04](https://github.com/codeaholicguy/ai-devkit/commit/fbaef046bf2dfbc0c4d725abde354c5285e59f3b) Added Kilo Code skills and MCP support.
- [ce437db](https://github.com/codeaholicguy/ai-devkit/commit/ce437dba9985423522a3dfaf6085fd626f246050) Added Pi environment skills support.
- [36e4b29](https://github.com/codeaholicguy/ai-devkit/commit/36e4b29e100a27cbfefb3749fa8433ea2dc3b1fe) Added OpenCode MCP support.
- [b4bdabd](https://github.com/codeaholicguy/ai-devkit/commit/b4bdabd74b863b61dd41cd4a96d3cc58a2c8c20a) Fixed macOS terminal app process detection in agent manager.
- [8dc7f98](https://github.com/codeaholicguy/ai-devkit/commit/8dc7f988ccddd409364c1330e4cf46c0a2c6ba9e) Added Pi support to `agent start`.
- [77c0413](https://github.com/codeaholicguy/ai-devkit/commit/77c04138f2945c19a116ab47acb81aefba65ea9a) Added Copilot support to `agent start`.

## [0.40.0] - 2024-06-11

- [f0f72d0](https://github.com/codeaholicguy/ai-devkit/commit/f0f72d0a6b281a977c2630808704bd1e66c659f5) Added the Pi session tracker extension.
- [57b08bc](https://github.com/codeaholicguy/ai-devkit/pull/101) Added the Pi adapter to agent manager.
- [69fb18a](https://github.com/codeaholicguy/ai-devkit/commit/69fb18ae36d28b722850f1c9b8bf77a7aed9e281) Optimized Codex resume session lookup.
- [35d4dee](https://github.com/codeaholicguy/ai-devkit/pull/102) Added the global plugin foundation to the CLI.

## [0.39.0] - 2024-06-09

- [f9bb55c](https://github.com/codeaholicguy/ai-devkit/pull/97) Reverted the CLI startup optimization from #96.
- [74b3139](https://github.com/codeaholicguy/ai-devkit/commit/74b3139e5bdbb078698986ffb20e40751abd02aa) Added agent rename support inside the agent console.
- [1884f56](https://github.com/codeaholicguy/ai-devkit/commit/1884f56ac6f41ed8f38211012f49fccab92643f9) Upgraded project dependencies.
- [fcff530](https://github.com/codeaholicguy/ai-devkit/commit/fcff530e6c786f00b081addb5185aaccce6bd971) Migrated CLI prompts to `@inquirer/prompts`.
- [ad1ad29](https://github.com/codeaholicguy/ai-devkit/commit/ad1ad29b00877779ff8fb348e347212c04de7161) Migrated package builds to SWC.
- [c6886f5](https://github.com/codeaholicguy/ai-devkit/commit/c6886f5f4ccb2c3159abdac775aca75b9225459c) Fixed duplicate Gemini wrapper processes in agent discovery.
- [0038cc5](https://github.com/codeaholicguy/ai-devkit/pull/98) Added channel controls to the agent console.
- [2314ac9](https://github.com/codeaholicguy/ai-devkit/commit/2314ac9e032361104ef9f579fa1e9976adae0ca2) Added the `agent-communication` skill.
- [1dfe1fe](https://github.com/codeaholicguy/ai-devkit/commit/1dfe1feca3059f7aa1fbf98ac5ac59a21679974b) Updated documentation for the channel daemon option.
- [b596aca](https://github.com/codeaholicguy/ai-devkit/commit/b596aca59bf057ee5ce18ba01eb5ad86d03563c9) Added the agent console guide.
- [9a6d2b0](https://github.com/codeaholicguy/ai-devkit/commit/9a6d2b0c799c2d4bd32843973e3c7c4b59b9a796) Refreshed project documentation.
- [0e746d8](https://github.com/codeaholicguy/ai-devkit/commit/0e746d8917f574cea877cc0a6ecb744386ed633d) Fixed resumed Codex session matching.
- [e795edf](https://github.com/codeaholicguy/ai-devkit/pull/100) Added a Copilot adapter to agent manager.
- [ec2ca1e](https://github.com/codeaholicguy/ai-devkit/commit/ec2ca1eeb0fc1ddf6c19658267edb80e5064d414) Added the changelog skill.

## [0.38.0] - 2026-06-02

### Added

- **Agent Console Help Pane** - Added a help pane to `ai-devkit agent console` with context-aware keyboard shortcuts and layout support for toggling help while preserving existing console workflows.
- **TUI Design System** - Added shared TUI design-system components and tokens for panels, section titles, key hints, spacing, borders, and colors, and updated the agent console to use them consistently.
- **CLI Startup Benchmark** - Added a CLI startup benchmark utility, benchmark tests, and maintainer documentation for validating top-level command startup performance.

### Changed

- **CLI Startup Performance** - Optimized `ai-devkit` startup by handling version/help output through a lightweight command manifest and lazy-loading Commander plus selected command modules only when needed (#96).

## [0.37.0] - 2026-06-01

### Added

- **Agent Console Start** - Added an in-console start-agent workspace to `ai-devkit agent console`, allowing users to press `s`, choose an agent type, edit the generated name and working directory, start the agent through `agent start`, and refresh the agent list without leaving the TUI (#93).
- **Agent Console Kill** - Added `agent kill <name>` and uppercase `K` support in `ai-devkit agent console` with a confirmation dialog, process termination, managed tmux session cleanup, and refreshed console state after successful kills (#94).

## [0.36.0] - 2026-05-31

### Added

- **Managed Agent Start** - Added `ai-devkit agent start` to launch named agents in managed tmux sessions with `--type`, `--name`, and `--cwd` options, PID polling, stale session cleanup, and registry tracking (#90).
- **Agent Rename** - Added `ai-devkit agent rename <current-name> <new-name>` to rename live registry entries with validation and conflict handling (#92).

### Changed

- **Agent Registry Synchronization** - Agent discovery now mirrors live Codex and Gemini CLI sessions into the registry so running agents stay available for list/detail/send workflows even when started outside `agent start` (#91).
- **Agent List Project Column** - Updated `ai-devkit agent list` to show the project name instead of the full working directory for a more compact running-agent table.
- **Dev Lifecycle Guidance** - Enhanced the `dev-lifecycle` skill's test-planning and implementation-log guidance.

### Fixed

- **Claude Code Status Detection** - Fixed Claude Code sessions being reported with unknown status by improving session parsing for meaningful conversation entries and interrupted requests.

## [0.35.0] - 2026-05-28

### Added

- **Agent Console** - New `ai-devkit agent console` command that launches a live multi-agent terminal UI (TUI) with an agent list pane, conversation preview, chat input, and status footer for monitoring and interacting with multiple running agents simultaneously (#88).

### Changed

- **ESM Migration** - Converted all packages (`cli`, `agent-manager`, `channel-connector`, `memory`) from CommonJS to ES Modules, migrated the test runner from Jest to Vitest, and upgraded project dependencies (#87).
- **Dev Lifecycle Clarification Contract** - Tightened the clarification requirements in the `dev-lifecycle` skill's `SKILL.md` and updated `new-requirement`, `review-design`, and `review-requirements` references; improved the `check-status.sh` script.

## [0.34.0] - 2026-05-25

### Added

- Added `ai-devkit docs init-feature <name>` to initialize date-prefixed feature docs for configured phases using the current local date, with optional `--json` output for agents and scripts.
- Added lint support for date-prefixed feature docs while preserving compatibility with legacy `feature-{name}.md` docs.

### Changed

- Updated lifecycle command templates and the `dev-lifecycle` skill to initialize feature docs through `docs init-feature` and reference latest matching `YYYY-MM-DD-feature-{name}.md` docs.

## [0.33.0] - 2026-05-24

### Added

- `ai-devkit agent session detail` now shows detailed historical session information and conversation history, with `--json`, `--type`, `--full`, `--tail`, and `--verbose` options.
- `ai-devkit channel connect telegram --name <name>` now supports multiple named Telegram channel configurations, including duplicate-token protection and persisted authorized chat IDs.
- `ai-devkit channel start <name> --agent <name> --daemon` can run channel bridges in the background, with bridge process tracking, log paths, status reporting, and `ai-devkit channel stop [name]` support.

### Changed

- `ai-devkit channel list` and `ai-devkit channel status` now show authorization and live bridge state for configured channels.

## [0.32.0] - 2026-05-22

### Added

- `ai-devkit agent send --wait` now supports `--stdin` and piped input, allowing automation scripts to pass prompts without a positional message argument.
- `ai-devkit agent send --wait` now supports `--timeout <milliseconds>` to configure the maximum wait time for an agent response.
- `ai-devkit agent send --wait --json` now emits structured JSON with target metadata, the prompt, captured response messages, elapsed time, and final status.
- Added documentation and FAQ content for automating programmatic agent calls with `agent send --wait`.

### Changed

- Refreshed README, package descriptions, and web documentation copy to better explain AI DevKit workflows, supported agents, memory, channels, and agent-manager usage.

## [0.31.0] - 2026-05-16

### Added

- `ai-devkit agent send` now accepts `--wait` to block until the target agent returns a new assistant response, polling the session transcript and printing the captured output on stdout while keeping status/warning logs on stderr (https://github.com/codeaholicguy/ai-devkit/pull/83).

## [0.30.0] - 2026-05-14

### Added

- **OpenCode Agent Adapter** - Added `OpenCodeAdapter` to `agent-manager` so `ai-devkit agent` commands can discover, inspect, and control running OpenCode sessions.
- **HTML Artifact in `document-code` Skill** - The `document-code` skill now offers an HTML artifact alongside its markdown output.

### Fixed

- **Claude Code PID-File Live Status** - `agent-manager` now prefers the PID-file live status when resolving Claude Code agent state, improving accuracy of `agent list` output.
- **Claude Code Lossy Project Dir Encoding** - `agent-manager` now matches Claude Code's lossy project directory encoding when resolving session paths, fixing session discovery for paths that Claude Code re-encodes.

## [0.29.0] - 2026-05-11

### Added

- **Non-interactive `init`** - `ai-devkit init` now accepts `-y, --yes` to run without prompts (required for agent/CI contexts where stdin is not a TTY). Without a template, `--yes` requires `-e <env>` and one of `-a`/`-p`, otherwise it exits non-zero with a clear message instead of hanging on a checkbox prompt.
- **`init --overwrite` flag** - When combined with `--yes`, `--overwrite` overwrites existing environments and phase files; the default under `--yes` is to skip them, matching the `install --overwrite` convention.
- **Telegram Markdown Rendering** - `channel-connector`'s Telegram adapter now renders Markdown to Telegram-flavored HTML with an automatic plain-text fallback when Telegram rejects the formatted payload.
- **Channel Polling Diagnostics** - The `channel` command now surfaces polling-loop errors and emits diagnostic logs to help debug long-running channel sessions.

### Changed

- **Dev Lifecycle Bootstrap** - The `dev-lifecycle` skill's prerequisite step now invokes `ai-devkit init -a -e claude --built-in --yes` so agents (e.g., OpenCode in a fresh worktree) cannot block on interactive prompts when `.ai-devkit.json` is missing.
- **Renamed `debug` Skill to `structured-debug`** - The `debug` skill has been renamed to `structured-debug` across the registry, templates, and docs to clarify its purpose.
- **Renamed `capture-knowledge` Skill to `document-code`** - The `capture-knowledge` skill has been renamed to `document-code` across the registry, templates, and docs to better reflect its purpose.
- **Built-in Skills Updated** - Updated the CLI's built-in skill list to reflect the `structured-debug` and `document-code` renames.

### Fixed

- **Resumed Claude Session Matching** - `agent-manager` now matches resumed Claude Code sessions by parsing the `--resume <uuid>` argument, fixing detection of sessions started via `claude --resume`.

## [0.28.0] - 2026-05-09

### Added

- **Agent Sessions Command** - New `ai-devkit agent sessions` command to list historical agent sessions (#79).
- **Security Review Skill** - Added new `security-review` skill for security-focused review workflows.
- **Playwright CLI Skill** - Added Playwright CLI entry to the skills registry.
- **Google Skills Repository** - Added Google skills repository to `registry.json`.

### Changed

- **Strip Claude Code Tag** - `agent-manager` now strips the Claude Code tag from session output.
- **Dev Lifecycle Execute Phase** - Improved the dev-lifecycle skill's execute phase guidance.
- **Branding Updates** - Updated branding across CLI command templates, command files, and skills.

### Fixed

- **AppleScript Escape Utility** - Added an AppleScript escape utility in `agent-manager` to handle quoting safely.
- **Native FS Session Finding** - Switched `agent-manager` session finding to use native `fs` instead of shelling out via `exec`.

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

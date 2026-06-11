---
phase: requirements
title: Requirements & Problem Understanding
description: Clarify the problem space, gather requirements, and define success criteria
---

# Requirements & Problem Understanding

## Problem Statement
**What problem are we solving?**

- AI DevKit can expose core capabilities through CLI and MCP commands, but richer optional experiences such as visual tools or heavier integrations would add dependencies and release cadence concerns to the core CLI.
- Users need a simple way to install optional AI DevKit extensions globally and run their contributed commands regardless of whether `ai-devkit` itself is invoked through `npx`, a global install, or a local project install.
- Plugin developers need a small, predictable contract for adding commands without depending on the physical install location of the AI DevKit CLI binary.
- Current workaround is to hard-code every new surface into `packages/cli`, which keeps command discovery simple but makes optional tools part of the core release surface.

## Goals & Objectives
**What do we want to achieve?**

### Primary Goals
- Add a global npm-only plugin system for AI DevKit.
- Support `ai-devkit plugin add <package>`, `ai-devkit plugin remove <package>`, and `ai-devkit plugin list`.
- Install plugin npm packages into `~/.ai-devkit/npm/node_modules`, not into the AI DevKit CLI package or a project `node_modules`.
- Persist enabled global plugins in `~/.ai-devkit/.ai-devkit.json` under `plugins`.
- Load plugin command manifests at CLI startup and register contributed commands with Commander.
- Provide a minimal AI DevKit runtime object to plugin command registrations so plugins can read AI DevKit config and use stable host-provided utilities.

### Secondary Goals
- Keep the plugin contract easy for plugin authors to implement with a JSON manifest and JavaScript entrypoint.
- Make behavior independent of whether the user runs `npx ai-devkit`, `ai-devkit`, or a local binary.
- Keep the system extensible for future runtime APIs without exposing unstable internal CLI modules.

### Non-Goals
- Project-local plugins.
- Non-npm plugin sources such as Git URLs, local paths, tarballs, or registries outside npm package-manager support.
- Runtime execution of TypeScript plugin entrypoints. Plugin authors may write TypeScript, but manifests must point to built JavaScript files.
- Plugin marketplace/search.
- Plugin sandboxing beyond ordinary Node/npm package execution boundaries.
- Auto-loading arbitrary code that is not listed in the global AI DevKit config.
- Building any plugin package or plugin UI in this feature. This feature establishes the plugin host contract only.

## User Stories & Use Cases
**How will users interact with the solution?**

### User Stories
- As an AI DevKit user, I want to run `ai-devkit plugin add @example/hello-ai-devkit` so that I can install an optional plugin without manually managing `~/.ai-devkit/npm`.
- As an AI DevKit user, I want to run `ai-devkit hello-devkit` after installation so that I can run plugin commands from the same CLI I already use.
- As an AI DevKit user, I want `npx ai-devkit hello-devkit` and globally installed `ai-devkit hello-devkit` to behave the same so that invocation style does not affect plugins.
- As an AI DevKit user, I want to run `ai-devkit plugin remove @example/hello-ai-devkit` so that I can uninstall and disable a plugin cleanly.
- As a plugin developer, I want to declare commands in a manifest and export a registration function so that my plugin integrates with Commander without hard-coding changes in AI DevKit core.
- As a plugin developer, I want an AI DevKit runtime object so that I can read config and later consume host APIs through a stable contract.

### Key Workflows
1. **Install Plugin**
   - User runs `ai-devkit plugin add @example/hello-ai-devkit`.
   - AI DevKit ensures `~/.ai-devkit/npm/package.json` exists.
   - AI DevKit runs npm install in `~/.ai-devkit/npm`.
   - AI DevKit validates the installed package manifest.
   - AI DevKit adds the package name to `~/.ai-devkit/.ai-devkit.json` `plugins`.
   - If manifest validation fails after npm install succeeds, AI DevKit uninstalls the package and reports the validation failure.
2. **Run Plugin Command**
   - User runs `ai-devkit hello-devkit`.
   - AI DevKit reads `~/.ai-devkit/.ai-devkit.json`.
   - AI DevKit resolves listed plugins from `~/.ai-devkit/npm/node_modules`.
   - AI DevKit reads each plugin manifest and registers contributed commands.
   - Commander dispatches to the plugin-provided registration/action.
3. **Remove Plugin**
   - User runs `ai-devkit plugin remove @example/hello-ai-devkit`.
   - AI DevKit removes the package from `~/.ai-devkit/npm`.
   - AI DevKit removes the package name from global `plugins`.
4. **List Plugins**
   - User runs `ai-devkit plugin list`.
   - AI DevKit prints globally configured plugins and whether each package is installed and manifest-valid.

### Edge Cases
- `~/.ai-devkit` does not exist.
- `~/.ai-devkit/npm/package.json` does not exist.
- npm install fails because the package does not exist or network access fails.
- Package installs but has no AI DevKit manifest.
- Package install succeeds but manifest validation fails and rollback uninstall also fails.
- Package manifest declares duplicate command names.
- Plugin command name conflicts with a built-in AI DevKit command.
- Plugin entrypoint cannot be imported.
- Plugin registration throws.
- Config lists a plugin that is not installed.
- `plugin remove` is run for a package that is not configured or not installed.

## Success Criteria
**How will we know when we're done?**

### Acceptance Criteria
- `ai-devkit plugin add @example/hello-ai-devkit` installs the npm package into `~/.ai-devkit/npm/node_modules`.
- `ai-devkit plugin add` creates or updates `~/.ai-devkit/.ai-devkit.json` with a deduplicated `plugins` array.
- `ai-devkit plugin add` is atomic from the user's perspective: invalid plugin packages are uninstalled and are not added to config.
- `ai-devkit plugin remove @example/hello-ai-devkit` uninstalls the package from `~/.ai-devkit/npm` and removes it from the global config.
- `ai-devkit plugin list` shows configured global plugins and installation/manifest status.
- A plugin package can expose a manifest that maps `hello-devkit` to a JS entrypoint.
- AI DevKit imports the plugin entrypoint at runtime and lets it register a Commander command.
- Built-in commands keep priority over plugin commands.
- Missing or invalid plugins produce clear errors without breaking built-in commands.
- Plugin runtime exposes at least `cwd`, `homeDir`, `configPath`, `getConfig()`, `getMemoryDbPath()`, and logger methods.
- The implementation is covered by unit tests for config mutation, package-manager command construction, manifest validation, command registration, and error handling.

### Performance Expectations
- Built-in command startup should not import plugin entrypoints unless command registration requires it.
- Plugin discovery should be bounded by the configured global plugin list.
- Common built-in commands should remain usable when a configured plugin is missing or invalid.

## Constraints & Assumptions
**What limitations do we need to work within?**

### Technical Constraints
- Node.js runtime remains ESM.
- Commander remains the CLI command framework.
- npm is the only supported package source and package manager for MVP.
- Global plugin install root is `~/.ai-devkit/npm`.
- Global AI DevKit config is `~/.ai-devkit/.ai-devkit.json`.
- Plugin package execution is trusted code execution, equivalent to installing any npm CLI package.

### Assumptions
- Global-only plugins are sufficient for the first release.
- Plugin authors can build their TypeScript to JavaScript before publishing.
- Plugin command entrypoints should be JavaScript files importable by Node at runtime.
- AI DevKit will provide runtime APIs through a small stable object rather than exposing internal modules.

## Questions & Open Items
**What do we still need to clarify?**

### Resolved
- Plugin source: npm only.
- Install scope: global only.
- Install location: `~/.ai-devkit/npm/node_modules`.
- Config location: `~/.ai-devkit/.ai-devkit.json`.
- Plugin declaration: global config `plugins` array.
- Command integration: manifest maps command names to JS entrypoints that register with Commander.
- Runtime: AI DevKit provides a small runtime object for config access and future APIs.
- Failed manifest validation after install: rollback uninstall automatically and leave the plugin disabled.
- Plugin entrypoints: JavaScript only for MVP.

### Deferred
- Project-local plugin support.
- Non-npm sources.
- Lockfile or integrity reporting beyond npm's own `package-lock.json` in `~/.ai-devkit/npm`.
- Plugin marketplace/search.
- Fine-grained permission prompts and sandboxing.
- Concrete first-party plugin package requirements.
- First-class local plugin development commands such as `plugin add ./path --dev`.

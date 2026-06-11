---
phase: implementation
title: Implementation Guide
description: Technical implementation notes, patterns, and code guidelines
---

# Implementation Guide

## Development Setup
**How do we get started?**

- Work in the feature worktree `feature-plugin-foundation`.
- Use npm as the workspace package manager.
- Keep implementation in `packages/cli` for the host plugin system.
- Use temporary home directories in tests so global plugin state does not touch the developer's real `~/.ai-devkit`.

## Code Structure
**How is the code organized?**

Expected new/changed areas:

```text
packages/cli/src/commands/plugin.ts
packages/cli/src/services/plugin/
  plugin-package.service.ts
  plugin-manifest.service.ts
  plugin-loader.service.ts
  plugin-manager.service.ts
  runtime.ts
packages/cli/src/lib/GlobalConfig.ts
packages/cli/src/cli.ts
packages/cli/src/types.ts
packages/cli/src/__tests__/commands/plugin.test.ts
packages/cli/src/__tests__/services/plugin/
```

Implemented so far:
- `packages/cli/src/types.ts`: added `plugins?: string[]` to `GlobalDevKitConfig`.
- `packages/cli/src/lib/GlobalConfig.ts`: added `getPlugins()`, `addPlugin()`, and `removePlugin()` for global plugin config entries.
- `packages/cli/src/__tests__/lib/GlobalConfig.test.ts`: added plugin config tests for read, add, dedupe, and remove behavior.
- `packages/cli/src/services/plugin/plugin-package.service.ts`: added global npm root resolution, npm project initialization, install/uninstall execution with argument arrays, and npm-package-only validation.
- `packages/cli/src/__tests__/services/plugin/plugin-package.service.test.ts`: added package service tests for npm root, package.json initialization, install/uninstall args, and invalid package names.
- `packages/cli/src/services/plugin/plugin-manifest.service.ts`: added manifest shape validation, duplicate-command rejection, built-in conflict rejection, JavaScript-only entrypoint checks, and package-root containment checks.
- `packages/cli/src/__tests__/services/plugin/plugin-manifest.service.test.ts`: added manifest validation tests for valid manifests and invalid manifest/error paths.
- `packages/cli/src/services/plugin/plugin-loader.service.ts`: added installed plugin manifest validation using package resolution from `~/.ai-devkit/npm`.
- `packages/cli/src/services/plugin/plugin-manager.service.ts`: added add/remove/list orchestration, including uninstall rollback on manifest validation failure.
- `packages/cli/src/__tests__/services/plugin/plugin-manager.service.test.ts`: added service tests for add ordering, rollback, remove, and list status.
- `packages/cli/src/services/plugin/plugin-loader.service.ts`: expanded to register configured plugin commands with Commander and dynamically import command entrypoints.
- `packages/cli/src/services/plugin/runtime.ts`: added the initial `AiDevkitRuntime` with cwd, homeDir, configPath, config access, memory path resolution, and logger methods.
- `packages/cli/src/__tests__/services/plugin/plugin-loader.service.test.ts`: added plugin command registration tests and invalid plugin warning coverage.
- `packages/cli/src/__tests__/services/plugin/runtime.test.ts`: added runtime config and memory path tests.
- `web/content/docs/14-plugins.md`: added user and plugin-author documentation for global npm plugins.
- `web/content/docs/11-configuration-file.md`: documented the global `plugins` config field and plugin commands.
- `packages/cli/src/commands/plugin.ts`: added `plugin add`, `plugin remove`, and `plugin list` commands.
- `packages/cli/src/cli.ts`: registered the new `plugin` command group.
- `packages/cli/src/__tests__/commands/plugin.test.ts`: added command-level tests for add/remove/list behavior.
- `packages/cli/src/services/plugin/plugin-loader.service.ts`: changed package manifest lookup to read `~/.ai-devkit/npm/node_modules/<package>/package.json` directly so package `exports` cannot block manifest access.
- `packages/cli/src/services/plugin/plugin-package.service.ts`: tightened plugin package validation to reject version specs and unsafe path-shaped names before npm install or manifest lookup.
- `packages/cli/src/services/plugin/plugin-loader.service.ts`: added installed entrypoint existence validation so `plugin add` does not persist packages whose manifest points at missing JavaScript files.
- `packages/cli/src/services/plugin/plugin-loader.service.ts`: added a startup guard that skips plugin commands conflicting with already registered Commander commands.
- `packages/cli/src/services/plugin/plugin-manifest.service.ts`: restricted plugin command names to lowercase letters, numbers, and hyphens so manifest names cannot inject Commander argument/option grammar.

## Implementation Notes
**Key technical details to remember:**

### Core Features
- `plugin add`: ensure global npm root, run npm install, validate manifest, then update global config. If validation fails after install, run npm uninstall before returning the validation error.
- `plugin remove`: run npm uninstall and remove the plugin from global config. If one side is already absent, warn but complete the other cleanup.
- `plugin list`: show configured package name, installed status, and manifest status.
- Plugin loading: read global config, resolve package manifests from `~/.ai-devkit/npm/node_modules`, create Commander commands from manifest entries, import entrypoints, and call `register(command, runtime)`.

### Patterns & Best Practices
- Use `execFile`/spawn-style APIs with argument arrays for npm.
- Read plugin `package.json` directly from `~/.ai-devkit/npm/node_modules/<package>/package.json`; do not rely on Node package `exports` for manifest access.
- Use `pathToFileURL()` for dynamic ESM imports.
- Accept JavaScript plugin entrypoints only; TypeScript source must be built before plugin execution.
- Keep plugin runtime APIs stable and intentionally small.
- Preserve existing built-in CLI behavior when plugin loading fails.

## Integration Points
**How do pieces connect?**

- `packages/cli/src/cli.ts` registers built-ins, then invokes the plugin loader.
- Plugin loader uses the global config service and manifest service.
- Plugin entrypoints receive Commander command instances and the AI DevKit runtime.
- Plugins can use `runtime.getMemoryDbPath()` when they need to locate the configured memory database.

## Error Handling
**How do we handle failures?**

- Missing global config should mean no plugins configured, except inside explicit `plugin add/remove/list` flows where the service can create config as needed.
- Invalid configured plugins should produce targeted warnings during startup and not break built-in commands.
- `plugin add` should fail if the installed package lacks a valid manifest.
- If `plugin add` fails manifest validation after install, attempt rollback uninstall and include rollback failure details if uninstall also fails.
- Entry paths outside the plugin root are invalid.
- Non-JavaScript entrypoint paths are invalid in the MVP.
- Built-in command conflicts are invalid.

## Performance Considerations
**How do we keep it fast?**

- Only inspect plugins listed in global config.
- Avoid filesystem recursion; resolve direct package manifests only.
- Measure startup before deciding whether to switch from eager `register()` imports to lazy action imports.

## Security Notes
**What security measures are in place?**

- Installing and running plugins executes trusted npm package code.
- Validate package names and never interpolate them into shell commands.
- Keep manifest entrypoint resolution inside the package root.
- Do not expose secrets through the runtime.
- Do not let plugins override built-in commands.

## Phase 6 Implementation Check

- Alignment: implementation matches the approved global npm-only plugin host design.
- Intentional deviation: reused the existing `GlobalConfigManager` for plugin config instead of adding a separate `plugin-config.service.ts`; this keeps all global config behavior in one place and preserves unrelated fields.
- Correctness fix found during implementation check: plugin manifests are now read directly from the managed npm install root instead of using `require.resolve("<plugin>/package.json")`, because package `exports` can block `package.json` resolution.
- Code review fix: package names are now constrained to bare npm names (`name` or `@scope/name`) so version specs and path-shaped values cannot be persisted or used to build manifest paths.
- Phase 8 review fix: installed plugin commands now validate that declared entrypoint files exist before the plugin is considered valid.
- Phase 8 review fix: plugin command registration now tracks already registered command names and skips later conflicts with a warning.
- Final security review fix: plugin command names now reject spaces, argument placeholders, options, uppercase names, and other Commander grammar before registration.
- Remaining follow-ups: manual smoke with a real or packed plugin package, startup timing measurement with configured plugins, and later concrete first-party plugin package implementations.

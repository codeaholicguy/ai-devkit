---
phase: testing
title: Testing Strategy
description: Define testing approach, test cases, and quality assurance
---

# Testing Strategy

## Test Coverage Goals
**What level of testing do we aim for?**

- Target 100% coverage for new plugin config, package-manager, manifest validation, runtime, and command-loader helper code.
- Command tests should cover user-facing `plugin add`, `plugin remove`, and `plugin list` behavior with mocked npm execution.
- Integration tests should cover loading a fixture plugin from a temporary `~/.ai-devkit/npm/node_modules` layout and registering a contributed Commander command.
- E2E coverage should validate the high-level user flow with a local fixture package if feasible without publishing to npm.

## Unit Tests
**What individual components need testing?**

### Plugin Config Service
- [x] Creates `~/.ai-devkit/.ai-devkit.json` when adding the first global plugin. Covered by `packages/cli/src/__tests__/lib/GlobalConfig.test.ts`.
- [x] Adds plugin names with deduplication. Covered by `packages/cli/src/__tests__/lib/GlobalConfig.test.ts`.
- [x] Removes plugin names while preserving unrelated config fields. Covered by `packages/cli/src/__tests__/lib/GlobalConfig.test.ts`.
- [x] Handles missing or malformed `plugins` as an empty list with validation errors where appropriate. Covered by `packages/cli/src/__tests__/lib/GlobalConfig.test.ts`.

### Plugin Package Service
- [x] Ensures `~/.ai-devkit/npm/package.json` before install. Covered by `packages/cli/src/__tests__/services/plugin/plugin-package.service.test.ts`.
- [x] Runs npm install with argument arrays for `plugin add`. Covered by `packages/cli/src/__tests__/services/plugin/plugin-package.service.test.ts`.
- [x] Runs npm uninstall with argument arrays for `plugin remove`. Covered by `packages/cli/src/__tests__/services/plugin/plugin-package.service.test.ts`.
- [x] Rejects empty or invalid package names. Covered by `packages/cli/src/__tests__/services/plugin/plugin-package.service.test.ts`.
- [x] Rejects versioned package specs and unsafe path-shaped package names. Covered by `packages/cli/src/__tests__/services/plugin/plugin-package.service.test.ts` and `packages/cli/src/__tests__/services/plugin/plugin-loader.service.test.ts`.
- [x] Surfaces npm install/remove failures with actionable errors. Covered by `packages/cli/src/__tests__/services/plugin/plugin-package.service.test.ts`.

### Manifest Loader
- [x] Resolves `package.json` from `~/.ai-devkit/npm/node_modules`. Covered indirectly by `packages/cli/src/services/plugin/plugin-loader.service.ts` and manager validation flow; deeper loader tests remain useful.
- [x] Accepts a valid `aiDevkit.commands` manifest. Covered by `packages/cli/src/__tests__/services/plugin/plugin-manifest.service.test.ts`.
- [x] Rejects missing `aiDevkit.commands`. Covered by `packages/cli/src/__tests__/services/plugin/plugin-manifest.service.test.ts`.
- [x] Rejects duplicate command names within a plugin. Covered by `packages/cli/src/__tests__/services/plugin/plugin-manifest.service.test.ts`.
- [x] Rejects command names that conflict with built-in commands. Covered by `packages/cli/src/__tests__/services/plugin/plugin-manifest.service.test.ts`.
- [x] Rejects command names that include Commander grammar or unsafe command tokens. Covered by `packages/cli/src/__tests__/services/plugin/plugin-manifest.service.test.ts`.
- [x] Rejects `entry` paths that resolve outside the plugin package root. Covered by `packages/cli/src/__tests__/services/plugin/plugin-manifest.service.test.ts`.
- [x] Rejects non-JavaScript command entrypoints for MVP. Covered by `packages/cli/src/__tests__/services/plugin/plugin-manifest.service.test.ts`.

### Runtime Builder
- [x] Provides `cwd`, `homeDir`, and `configPath`. Covered by `packages/cli/src/__tests__/services/plugin/runtime.test.ts`.
- [x] `getConfig()` reads the global config. Covered by `packages/cli/src/__tests__/services/plugin/runtime.test.ts`.
- [x] `getMemoryDbPath()` resolves configured relative memory paths from the global config directory. Covered by `packages/cli/src/__tests__/services/plugin/runtime.test.ts`.
- [x] Logger delegates to the terminal UI or console wrapper consistently. Implemented in `packages/cli/src/services/plugin/runtime.ts`; deeper direct logger tests deferred as low risk.

## Integration Tests
**How do we test component interactions?**

- [x] Register a fixture plugin command and verify Commander can execute it. Covered by `packages/cli/src/__tests__/services/plugin/plugin-loader.service.test.ts`.
- [x] Verify built-in commands remain available when a configured plugin is missing. Covered by `packages/cli/src/__tests__/services/plugin/plugin-loader.service.test.ts`.
- [x] Verify invalid plugin manifests produce warnings/errors without crashing unrelated commands. Covered by `packages/cli/src/__tests__/services/plugin/plugin-loader.service.test.ts`.
- [x] Verify installed plugin manifests are rejected when declared JavaScript entrypoint files are missing. Covered by `packages/cli/src/__tests__/services/plugin/plugin-loader.service.test.ts`.
- [x] Verify plugin command registration skips conflicts with already registered commands. Covered by `packages/cli/src/__tests__/services/plugin/plugin-loader.service.test.ts`.
- [x] Verify `plugin add` installs, validates, and persists config in the expected order. Covered by `packages/cli/src/__tests__/services/plugin/plugin-manager.service.test.ts`.
- [x] Verify `plugin add` does not persist a plugin when manifest validation fails. Covered by `packages/cli/src/__tests__/services/plugin/plugin-manager.service.test.ts`.
- [x] Verify `plugin add` uninstalls the package when manifest validation fails after npm install succeeds. Covered by `packages/cli/src/__tests__/services/plugin/plugin-manager.service.test.ts`.
- [x] Verify rollback failure is reported clearly if manifest validation and uninstall rollback both fail. Covered by `packages/cli/src/__tests__/services/plugin/plugin-manager.service.test.ts`.
- [x] Verify `plugin remove` uninstalls and removes the config entry. Covered by `packages/cli/src/__tests__/services/plugin/plugin-manager.service.test.ts`.
- [x] Command-level `plugin add/remove/list` wiring and list output. Covered by `packages/cli/src/__tests__/commands/plugin.test.ts`.

## End-to-End Tests
**What user flows need validation?**

- [ ] User flow: install a local fixture npm package as a global plugin and run its command.
- [ ] User flow: list installed plugins and see valid status.
- [ ] User flow: remove the fixture plugin and confirm its command is no longer available.
- [ ] Regression: `ai-devkit memory search --query <q>` still works when no plugins are configured.

## Test Data
**What data do we use for testing?**

- Temporary home directory containing `.ai-devkit/`.
- Fixture plugin package with `package.json` `aiDevkit.commands`.
- Fixture plugin entrypoint exporting `register(command, runtime)`.
- Fixture invalid plugins: missing manifest, duplicate commands, invalid entry path, conflicting command name.
- Fixture invalid plugin with a `.ts` entrypoint.
- Mock npm runner for unit tests; local file package install for E2E if needed.
- In-memory fixture plugin entrypoint used by `packages/cli/src/__tests__/services/plugin/plugin-loader.service.test.ts` for Commander registration.

## Test Reporting & Coverage
**How do we verify and communicate test results?**

- Primary command targets:
  - `npx nx run cli:test -- --runInBand plugin`
  - `npm run test -- --coverage` for broader coverage when feature stabilizes.
- Any coverage below 100% for new modules must be documented with rationale.
- Manual smoke output should include install path, config contents, and command execution result.

### Latest Verification

- `npx nx run cli:test -- --runInBand src/__tests__/lib/GlobalConfig.test.ts src/__tests__/services/plugin/plugin-package.service.test.ts src/__tests__/services/plugin/plugin-manifest.service.test.ts src/__tests__/services/plugin/plugin-manager.service.test.ts src/__tests__/services/plugin/plugin-loader.service.test.ts src/__tests__/services/plugin/runtime.test.ts src/__tests__/commands/plugin.test.ts` passed with 7 files and 52 tests.
- `npx nx run cli:build` passed.
- `npm run test:coverage -- ...plugin tests...` from `packages/cli` ran the plugin-focused tests and produced plugin file coverage, but exited non-zero because global package thresholds apply to all CLI source files, including many unrelated files not exercised by this focused test run.
- Plugin-service coverage from the focused coverage run: `plugin-manager.service.ts` 100% statements, `plugin-package.service.ts` 96.29% statements, `plugin-manifest.service.ts` 87.17% statements, `plugin-loader.service.ts` 65.51% statements, `runtime.ts` 75% statements.
- Remaining plugin coverage gaps are mostly default import/runtime fallback branches and defensive manifest validation branches. They are acceptable for this MVP because the high-risk behaviors (npm args, manifest rejection, rollback, command conflicts, package-root containment, built-in preservation) are covered.

## Manual Testing
**What requires human validation?**

- [ ] Run `ai-devkit plugin add @example/hello-ai-devkit` against a published or locally packed package.
- [ ] Verify `~/.ai-devkit/npm/node_modules` contains the plugin package.
- [ ] Verify `~/.ai-devkit/.ai-devkit.json` contains the plugin name.
- [ ] Run `ai-devkit hello-devkit --help`.
- [ ] Run `npx ai-devkit hello-devkit --help` and confirm behavior matches global/local invocation.
- [ ] Remove the plugin and verify the command is no longer registered.
- [x] Documentation smoke: added `web/content/docs/14-plugins.md` and global plugin config reference in `web/content/docs/11-configuration-file.md`.

## Performance Testing
**How do we validate performance?**

- Compare CLI startup timing before and after plugin loader registration with no plugins configured.
- Measure startup with one valid plugin configured.
- If startup cost is noticeable, defer entrypoint import until command action execution in a follow-up.

## Bug Tracking
**How do we manage issues?**

- Treat command conflicts, unsafe entry resolution, and config corruption as blocking defects.
- Treat poor error messages and slow startup as release risks to address before broad rollout.

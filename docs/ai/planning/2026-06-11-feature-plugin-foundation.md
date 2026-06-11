---
phase: planning
title: Project Planning & Task Breakdown
description: Break down work into actionable tasks and estimate timeline
---

# Project Planning & Task Breakdown

## Milestones
**What are the major checkpoints?**

- [x] Milestone 1: Global plugin config and npm package management
- [x] Milestone 2: Manifest validation and command registration
- [x] Milestone 3: Runtime contract and first fixture plugin flow
- [ ] Milestone 4: Documentation, tests, and lifecycle verification

## Task Breakdown
**What specific work needs to be done?**

### Phase 1: Foundation
- [x] Task 1.1: Add `plugins?: string[]` to AI DevKit config types where needed.
- [x] Task 1.2: Add a global config service for `~/.ai-devkit/.ai-devkit.json` plugin entries.
- [x] Task 1.3: Add a plugin package service that ensures `~/.ai-devkit/npm/package.json`.
- [x] Task 1.4: Add safe npm install/uninstall execution for global plugin packages.
- [x] Task 1.5: Add unit tests for config mutation and npm command construction.

### Phase 2: Core Features
- [x] Task 2.1: Register `ai-devkit plugin add <package>`.
- [x] Task 2.2: Register `ai-devkit plugin remove <package>`.
- [x] Task 2.3: Register `ai-devkit plugin list`.
- [x] Task 2.4: Implement plugin manifest schema validation.
- [x] Task 2.5: Add uninstall rollback when `plugin add` installs a package but manifest validation fails.
- [x] Task 2.6: Enforce JavaScript-only plugin command entrypoints.
- [x] Task 2.7: Implement plugin package resolution from `~/.ai-devkit/npm/node_modules`.
- [x] Task 2.8: Implement command conflict detection for built-in and plugin command names.
- [x] Task 2.9: Add command tests for add/remove/list, rollback, and error paths.

### Phase 3: Integration & Polish
- [x] Task 3.1: Add plugin command loading during CLI startup after built-ins are registered.
- [x] Task 3.2: Implement dynamic entrypoint import with package-root containment checks.
- [x] Task 3.3: Build the initial `AiDevkitRuntime` object.
- [x] Task 3.4: Add a fixture plugin and integration tests for Commander registration.
- [x] Task 3.5: Add docs for plugin users and plugin authors.
- [ ] Task 3.6: Run lifecycle validation, implementation check, testing, and code review phases.

## Dependencies
**What needs to happen in what order?**

- Config and npm package services must exist before `plugin add/remove/list`.
- Manifest validation must exist before `plugin add` persists a plugin to config.
- Built-in command inventory must be available before command conflict detection.
- Runtime contract must exist before fixture plugin integration.
- No external services are required beyond npm registry access for real install smoke tests.

## Timeline & Estimates
**When will things be done?**

- Foundation: medium.
- Core plugin commands and manifest loading: medium.
- Runtime and integration tests: medium.
- Docs and lifecycle verification: small.
- Main unknown: whether CLI startup impact requires deferred plugin entrypoint import in the first implementation.

## Risks & Mitigation
**What could go wrong?**

| Risk | Impact | Mitigation |
|---|---|---|
| Plugin entrypoint import slows every CLI command | Medium | Measure startup and defer imports if needed. |
| Plugin command conflicts with built-ins | High | Built-ins win; reject conflicting plugin commands. |
| npm install command injection | High | Use argument arrays and validate package names. |
| Invalid plugin corrupts global config | Medium | Validate manifest before adding to config. |
| Runtime API becomes unstable | Medium | Keep MVP runtime small and typed. |
| Global-only scope disappoints project-specific workflows | Low | Document as deferred; add project scope later with separate design. |

## Resources Needed
**What do we need to succeed?**

- Existing CLI command and terminal UI utilities.
- Existing config service patterns.
- npm available on the user machine.
- Fixture plugin package for tests.
- Follow-up package design for concrete first-party plugins.

## Current Status

The global npm plugin host MVP is implemented in `packages/cli`: global plugin config, npm install/uninstall service, manifest validation, rollback on invalid manifests, `plugin add/remove/list`, runtime object, and configured plugin command registration. Focused CLI tests and `npx nx run cli:build` pass. Web docs were added, but `npm run build` in `web/` is currently blocked by an unrelated existing `/vision` frontmatter YAML parse error. Remaining work is lifecycle closure: implementation check, broader testing/manual smoke with a real or packed plugin package, and code review.

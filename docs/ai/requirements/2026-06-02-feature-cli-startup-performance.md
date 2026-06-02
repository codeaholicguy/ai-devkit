---
phase: requirements
title: Requirements & Problem Understanding
description: Clarify the problem space, gather requirements, and define success criteria
feature: cli-startup-performance
---

# Requirements & Problem Understanding

## Problem Statement

The published `ai-devkit` CLI has high process startup cost for lightweight operations. Fresh measurements on June 2, 2026 showed:

- `node packages/cli/dist/cli.js --version`: p50 `362.1 ms`, avg `360.2 ms`
- `node packages/cli/dist/cli.js --help`: p50 `332.0 ms`, avg `338.8 ms`
- `node packages/cli/dist/cli.js memory --help`: p50 `322.2 ms`, avg `329.4 ms`
- `node packages/cli/dist/cli.js agent --help`: p50 `325.7 ms`, avg `329.3 ms`
- Minimal Node + Commander baseline: p50 `12.1 ms`, avg `12.2 ms`

The current CLI entrypoint eagerly imports and registers all command implementations before Commander resolves the requested command. As a result, commands that only need metadata pay for unrelated modules such as `ink`, `react`, `inquirer`, `@ai-devkit/agent-manager`, `@ai-devkit/memory`, `telegraf`, and channel bridge code.

Developers feel this cost most in repeated local workflows, shell completions/help lookups, scripts, CI smoke checks, and `npx` or globally installed CLI usage where each command is a new Node process.

## Goals & Objectives

### Primary Goals

- Reduce startup time for every CLI command path, not only root `--version` and `--help`.
- Keep all measured direct built CLI startup/help paths under `50 ms` p50.
- Preserve existing command names, flags, output semantics, and exit codes.
- Add repeatable local and CI-visible performance benchmarks for the optimized paths.
- Keep the source maintainable even if the build output uses generated or bundled artifacts.

### Secondary Goals

- Reduce memory footprint for lightweight command paths by avoiding heavy command-module imports until needed.
- Make the CLI bootstrap architecture explicit enough that future commands do not accidentally reintroduce eager imports.
- Document benchmark commands and expected thresholds for maintainers.

### Non-Goals

- Rewriting the CLI in Rust or migrating to a native binary.
- Changing user-facing CLI behavior, command names, flags, output format, or exit-code semantics.
- Upgrading runtime dependencies such as `chalk`, `ink`, `inquirer`, `ora`, `commander`, or package-manager tooling.
- Adding new dependencies.
- Reworking `@ai-devkit/agent-manager`, `@ai-devkit/memory`, or `@ai-devkit/channel-connector` internals except where import boundaries require it.
- Optimizing `npx ai-devkit@latest ...` package download, package extraction, or network latency.
- Requiring live tmux sessions, Telegram credentials, or running AI agents in CI.

## User Stories & Use Cases

- As a developer, I want `ai-devkit --version` and `ai-devkit --help` to return almost immediately so that shell and smoke-test workflows feel responsive.
- As a developer exploring commands, I want `ai-devkit <command> --help` to avoid loading unrelated command implementations so that help remains fast even as the CLI grows.
- As a maintainer, I want actual commands such as `lint`, `memory search`, and `agent list --json` to retain behavior while loading only the code they need.
- As a maintainer, I want a benchmark script that runs locally and in CI so that future regressions are visible before release.

### Required Benchmark/Smoke Set

Lightweight startup/help paths:

- `ai-devkit --version`
- `ai-devkit --help`
- `ai-devkit init --help`
- `ai-devkit phase --help`
- `ai-devkit setup --help`
- `ai-devkit lint --help`
- `ai-devkit install --help`
- `ai-devkit memory --help`
- `ai-devkit agent --help`
- `ai-devkit channel --help`
- `ai-devkit docs --help`
- `ai-devkit skill --help`

Real non-mutating command paths:

- `ai-devkit lint`
- `ai-devkit agent list --json` in an environment with no live agents or a deterministic no-agent setup
- `ai-devkit memory search --query "startup performance" --limit 1` against a temporary/project-isolated memory DB/config

## Success Criteria

- [ ] After `npm run build`, direct built CLI execution satisfies p50 `< 50 ms` for the lightweight startup/help benchmark set.
- [ ] Benchmark runs at least 20 iterations per command and reports min, p50, p95, max, avg, exit-code failures, and command labels.
- [ ] CI runs the benchmark gate and fails when p50 exceeds the configured threshold for required startup/help commands.
- [ ] Representative real commands keep behavior unchanged and do not regress by more than `10%` p50 from the measured post-change baseline during the same benchmark run.
- [ ] Unit/integration tests cover command dispatch so each command action lazy-loads the intended handler without changing parsed options.
- [ ] `npm run build` succeeds.
- [ ] `npm test -w packages/cli` succeeds.
- [ ] `npm run test:e2e` succeeds or documented equivalent smoke coverage is provided if e2e is too broad for this phase.
- [ ] No new dependencies are added to root or package manifests.
- [ ] Generated or bundled CLI artifacts, if used, include clear build scripts and source maps or equivalent debugging support.

## Constraints & Assumptions

- Node engine remains `>=20.20.0`.
- The CLI remains TypeScript-authored and published as the `ai-devkit` npm package.
- The package `bin` entry remains compatible with `dist/cli.js` unless a compatible wrapper preserves existing install behavior.
- Existing transitive tooling already present in the lockfile may be used only if no package manifest changes are required and the build remains reproducible.
- Generated or bundled `dist` output is acceptable, but source under `packages/cli/src` must remain maintainable.
- Benchmarks measure direct built CLI execution, not `npx` download/install overhead.
- CI benchmark thresholds must account for repeated sampling rather than a single process run.

## Questions & Open Items

- Decide in design whether the implementation should use dynamic imports only, split lightweight command metadata from handlers, generated command manifests, bundled CLI bootstrap, or a combination.
- Decide how to make the CI benchmark stable across different machine speeds while still enforcing the `<50 ms` target.
- Confirm whether source maps are sufficient for debugging generated/bundled `dist`, or whether an additional debug build mode is needed.

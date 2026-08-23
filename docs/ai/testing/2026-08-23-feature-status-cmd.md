---
phase: testing
title: AI DevKit Status Command Testing
description: Test strategy and fresh validation evidence for setup readiness reporting
feature: status-command
---

# Testing: AI DevKit Status Command

## Test Coverage Goals

- Cover every approved functional requirement FR-01 through FR-10 and acceptance criterion AC-01 through AC-14.
- Exercise happy, missing, malformed, unavailable, stale, and multi-failure paths through injected dependencies rather than real user credentials or provider networks.
- Prove JSON contract stability, per-agent nesting, status/count aggregation, nonfatal findings, and secret suppression.
- Run command-level tests, CLI package coverage, the six-project build, full repository tests, code lint, and lifecycle docs lint.

## Unit Tests

### Canonical status service

- [x] Complete fixture reports executable paths, global directories, built-in skill completeness, hooks, mappings, auth, tmux, channels, registries, versions, and project configuration. (AC-01–AC-10)
- [x] Codex, Pi, and Claude remain independently nested and present. (AC-11)
- [x] Multiple filesystem, command, auth, and npm failures still produce a complete report. (AC-12)
- [x] Raw filesystem and subprocess secret sentinels do not appear in serialized JSON. (AC-13)
- [x] Malformed Codex mapping and channel JSON is reported without returning source contents. (AC-04, AC-07, AC-13)
- [x] Structurally incomplete channel entries invalidate schema/readiness. (AC-07)
- [x] Executable access uses an explicit permission mode and missing paths remain isolated findings. (AC-01)
- [x] Built-in skills are compared only with the canonical set; no skill index/cache is injected or read. (AC-03, AC-14)
- [x] Pi credential-file presence yields unknown/warn rather than an unverified authenticated claim. (AC-05)

### Command and rendering

- [x] JSON rendering emits `JSON.stringify(report, null, 2)` exactly. (AC-11, AC-13)
- [x] Human rendering uses shared `ui.table` with agent status rows. (approved UX)
- [x] Commander registers `status --json`, calls the injected report reader once, and renders JSON. (command contract)

## Integration Tests

- [x] Six-project TypeScript/SWC build resolves the new CLI imports and bundled asset paths.
- [x] Built `node packages/cli/dist/cli.js status --json` emits parseable JSON with `codex`, `pi`, and `claude` and a normalized overall status.
- [x] Full CLI suite validates adjacent plugin, setup, capacity, channel, skill, and agent commands with the new top-level registration.
- [x] Full repository suite validates all six packages together.
- [x] Feature lint recognizes requirements, design, planning, implementation, testing, branch, and worktree.

## Security and Scope Tests

- [x] Recognizable secrets in channel tokens, malformed source content, filesystem errors, and subprocess errors are absent from the report.
- [x] Mapping validators expose only counts/status and never mapping keys or session contents.
- [x] Channel readiness is derived locally; no Telegram/Slack client exists in status dependencies.
- [x] No live agent/session, task, memory, Git, registry-fetch, skill-index, channel-bridge, or full-capacity output dependency is present.
- [x] Hook scripts are compared as text and never executed.
- [x] Expected failures use fixed safe messages.

## Test Fixtures and Boundaries

- In-memory path-to-content fixture for project/global config, channels, hooks, auth structure, skills, and mappings.
- Injected access boundary for readable/executable/missing paths.
- Injected subprocess boundary for tmux, Pi tracker listing, Claude auth, and npm latest version.
- Injected Codex auth boundary returning only `true`, `false`, or `null`.
- Fixed clock and installed version for deterministic output.
- Dedicated `~/.ai-devkit/status-command-tmp` test temporary directory used while shared `/tmp` quota was exhausted.

## Fresh Validation Evidence

| Gate | Result | Evidence |
|---|---|---|
| Targeted status tests | Passed | 2 files, 7 tests |
| Isolated plugin-loader regression check | Passed | 1 file, 9 tests after stale temp cleanup |
| CLI coverage | Passed | 88 files, 1,057 tests; 77.47% statements overall |
| Status service coverage | Passed | 91.24% statements, 72.63% branches, 88.67% functions, 92.14% lines |
| Six-project build | Passed | `nx run-many -t build`, 6 projects |
| Built JSON smoke test | Passed | Parseable report; three required agent keys and normalized overall status |
| Full repository tests | Passed | 6 targets, 1,984 tests: channel 115, memory 110, task manager 112, agent manager 568, memory dashboard 22, CLI 1,057 |
| Code lint | Passed | 6 targets, zero errors; four pre-existing unused-catch warnings outside changed files |
| Base/feature docs lint | Passed | All five base templates, all five feature docs, branch, and worktree recognized |

## Environment Issue Resolved

The first full CLI run produced two plugin-loader failures with `Disk quota exceeded`. The affected tests hard-code `/tmp`; a direct 4 KB write there reproduced the same error. Thirty-two current-user `/tmp/tmp-*` test directories older than one day were removed after approval. A direct write probe and the isolated 9-test plugin suite then passed. No repository, home, recent temporary, or active Codex mount path was removed.

## Manual Testing

- [x] Execute built JSON command and parse the result programmatically.
- [x] Execute built human command and confirm non-empty section/table output from the canonical report.

## Remaining Gate

All testing gates pass. Proceed to final lifecycle review, commit readiness reconciliation, fetch/rebase, push, and PR creation if review finds no blocker.

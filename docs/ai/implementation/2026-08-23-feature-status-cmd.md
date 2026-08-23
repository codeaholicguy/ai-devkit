---
phase: implementation
title: AI DevKit Status Command Implementation
description: Implementation record for canonical setup and readiness reporting
feature: status-command
---

# Implementation: AI DevKit Status Command

## Development Setup

- Active worktree: `.worktrees/feature-status-cmd`.
- Branch: `feature-status-cmd`, based on the AI DevKit 0.55.0 release.
- Dependency bootstrap: `npm ci`.
- Workspace build: `npm run build` for all six projects.
- Test temporary files are redirected to `~/.ai-devkit/status-command-tmp` because the shared `/tmp` user quota is exhausted.
- Optional lifecycle task tracing is unavailable in CLI 0.55.0 (`unknown command 'task'`).

## Code Structure

- `packages/cli/src/services/status/status.service.ts`
  - Canonical `StatusReport`, nested check types, status aggregation, and all read-only probes.
  - Injected cwd, home, PATH, time, filesystem, subprocess, asset, installed-version, and Codex-auth boundaries.
- `packages/cli/src/commands/status.ts`
  - Commander registration for `status` and `-j, --json` through `withErrorHandler`.
- `packages/cli/src/commands/status/render.ts`
  - Exact JSON output and human rendering through shared `ui.table`/chalk conventions.
- `packages/cli/src/cli.ts`
  - Registers the new top-level command before configured plugin commands.
- `packages/cli/src/__tests__/services/status/status.service.test.ts`
  - Deterministic service fixtures and multi-failure/security cases.
- `packages/cli/src/__tests__/commands/status.test.ts`
  - Canonical JSON, human table, and Commander wiring tests.

## Implementation Notes

### Canonical report and aggregation

- `getStatusReport` runs independent project, agent, tmux, registry, channel, and version probes concurrently.
- Every expected I/O, parse, subprocess, provider, and network failure becomes a fixed safe finding.
- Leaf statuses are counted exactly once; aggregates and `overall` use `pass < warn < fail` precedence.
- Empty arrays and meaningful `null` values remain explicit.

### Per-agent checks

- Executable lookup uses canonical `AGENTS` command names and execute-permission checks across `PATH`.
- Global directories and built-in skills use AI DevKit environment definitions and `BUILTIN_SKILL_NAMES`.
- Codex and Claude hook scripts are compared byte-for-byte with bundled assets without execution.
- Hook configuration parsers require the exact approved event/command registrations while ignoring unrelated provider settings.
- Codex and Pi mapping registries validate PID/path structure and count stale referenced paths without returning mapping keys or contents.
- Codex maps only the existing capacity probe's authentication signal; capacity data is discarded.
- Claude invokes only `claude auth status --json`.
- Pi credential-file structure yields `unknown`, never an unverified authenticated claim.

### Shared subsystem checks

- tmux resolves on `PATH` and runs only `tmux -V`.
- Channel configuration is read directly so missing, malformed, root-invalid, entry-invalid, disabled, and ready states remain distinguishable.
- Telegram and Slack readiness is local-only; tokens are reduced to booleans and never serialized.
- Project and global registries retain provenance; URL credentials, queries, and fragments are removed before serialization, while unrecognized URL forms are redacted.
- Npm latest lookup is bounded behind the injected subprocess dependency and degrades to warning/null values.
- Project configuration validates JSON object shape, version, environment array, and canonical environment codes.

## TDD Record

1. **Red:** service test failed because `status.service` did not exist.
2. **Green:** canonical service added; 3 service tests passed.
3. **Red:** command test failed because `commands/status` did not exist.
4. **Green:** command, renderer, and registration added; combined suites passed after completing the test fixture.
5. **Refactor:** added execute-permission and invalid channel-entry assertions; 7 combined tests pass.
6. **Review fix:** made bundled-asset discovery work from both source and compiled module layouts, and added registry-secret regression coverage; 7 combined tests pass.

## Design Alignment and Deviations

- The implementation follows the designed CLI-owned aggregator and reuses agent-manager only for its existing Codex auth signal.
- Types, pure helpers, and probes are colocated in `status.service.ts` rather than split across `status.types.ts` and `status.helpers.ts`. This is a deliberate smaller implementation: there is one caller and no demonstrated reuse requiring extra modules.
- Pi tracker discovery uses the designed injected `pi list` subprocess boundary.
- Human rendering uses the shared terminal UI and the canonical report.
- No requirements scope was added or removed.

## Error Handling

- Raw filesystem, subprocess, npm, auth, and provider errors are never placed in the report.
- Registry URL user information, query strings, and fragments are never placed in the report.
- Missing and malformed local state is returned as findings and does not stop sibling probes.
- Only inability to construct or serialize the report escapes to the command error handler.

## Security Notes

- Credential and session files are parsed only into safe booleans/counts.
- Mapping PID keys, session paths, credential values, channel tokens, and raw provider failures are not returned.
- Hook scripts are read for equality and never executed.
- Channel checks do not call Telegram or Slack.
- The only allowed network-capable boundaries are the approved Codex auth probe and npm latest-version query.

## Validation

- Targeted status tests: 2 files, 7 tests passed.
- Six-project build: passed after final review fixes.
- Full repository tests: 1,984 tests passed across six projects.
- Repository lint: zero errors; four pre-existing unused-catch warnings outside changed files.
- Built JSON smoke test: parsed successfully with `codex`, `pi`, and `claude` keys and normalized overall status.
- Base and feature lifecycle lint: passed.

## Follow-ups

- Publish the reviewed branch and open the pull request without merging it.
- No product or implementation follow-up is currently identified.

---
phase: testing
title: "Copilot Adapter in @ai-devkit/agent-manager - Testing"
feature: copilot-adapter-agent-manager-package
description: Test strategy for GitHub Copilot CLI adapter support
---

# Testing Strategy: Copilot Adapter

## Test Coverage Goals

- Unit test new/changed adapter code with targeted branch coverage for parsing and detection paths
- Keep integration scope limited to package exports and existing manager aggregation behavior unless CLI registration changes
- Validate with `npx nx test agent-manager`
- Run `npx ai-devkit@latest lint --feature copilot-adapter-agent-manager-package`

## Unit Tests

### CopilotAdapter
- [x] Exposes `type: 'copilot'` (`CopilotAdapter.test.ts`)
- [x] `canHandle` accepts `copilot`, full-path Homebrew executables, and `copilot.exe` (`CopilotAdapter.test.ts`)
- [x] `canHandle` rejects commands where `copilot` appears only in arguments (`CopilotAdapter.test.ts`)
- [x] `detectAgents` returns empty when no Copilot processes are running (`CopilotAdapter.test.ts`)
- [x] `detectAgents` maps an `inuse.{pid}.lock` directory to a running process and parsed session metadata (`CopilotAdapter.test.ts`)
- [x] `detectAgents` ignores lock files with invalid PID names (`CopilotAdapter.test.ts`)
- [x] `detectAgents` ignores lock PIDs that do not match a running Copilot process (`CopilotAdapter.test.ts`)
- [x] `detectAgents` falls back to a process-only agent for running processes without a matching lock/session (`CopilotAdapter.test.ts`)
- [x] `detectAgents` suppresses duplicate process-only entries for Copilot wrapper/child processes sharing the same terminal (`CopilotAdapter.test.ts`)
- [x] Status mapping returns `IDLE` after the adapter idle threshold (`CopilotAdapter.test.ts` via workspace fallback stale timestamp)
- [x] Status mapping returns `WAITING` for recent user-visible completion events when applicable (`CopilotAdapter.test.ts`)
- [x] Parser uses `workspace.yaml` fallback when `events.jsonl` is missing or lacks cwd/name timestamps (`CopilotAdapter.test.ts`)
- [x] Parser tolerates malformed JSONL lines (`CopilotAdapter.test.ts`)

### listSessions
- [x] Enumerates session-state directories with `events.jsonl` (`CopilotAdapter.test.ts`)
- [x] Applies strict cwd filter when `opts.cwd` is provided (`CopilotAdapter.test.ts`)
- [x] Includes historical sessions even when no `inuse.{pid}.lock` exists (`CopilotAdapter.test.ts`)
- [x] Skips unreadable/malformed session directories without throwing (`CopilotAdapter.test.ts`)
- [x] Skips empty session directories that have neither events nor workspace metadata (`CopilotAdapter.test.ts`)

### getConversation
- [x] Returns user and assistant messages from supported event payload shapes (`CopilotAdapter.test.ts`)
- [x] Includes system/info/warning events only in verbose mode where appropriate (`CopilotAdapter.test.ts`)
- [x] Returns empty array for missing or unreadable files (`CopilotAdapter.test.ts`)
- [x] Skips malformed JSONL lines (`CopilotAdapter.test.ts`)

## Integration Tests

- [x] Package public exports include `CopilotAdapter` (`npx nx build agent-manager`)
- [x] `AgentManager` can register and aggregate a Copilot adapter without changing existing adapter behavior (`npx nx test agent-manager`)

## End-to-End Tests

- [ ] Not required for v1; no CLI UX changes are planned beyond adapter availability

## Test Data

- Temporary directories under `os.tmpdir()` representing `~/.copilot/session-state`
- Fixture `events.jsonl` with `session.start`, user, assistant, info, warning, and malformed lines
- Fixture `workspace.yaml` with flat scalar keys: `id`, `cwd`, `name`, `created_at`, `updated_at`
- Mocked process utilities for deterministic PIDs, commands, cwd, and start times

## Test Reporting & Coverage

- Report fresh command output before claiming completion:
  - `npx nx test agent-manager`
  - `npx ai-devkit@latest lint --feature copilot-adapter-agent-manager-package`
- Coverage note:
  - `npx nx test agent-manager -- --coverage` ran the full package tests but forwarded `--coverage` as an npm config, so no coverage table was produced.
  - `npm run test:coverage -w @ai-devkit/agent-manager` is currently blocked by workspace dependency resolution: root Vitest cannot import package-local `@vitest/coverage-v8`.
  - Fresh non-coverage verification still passed for package tests, focused tests, lint, and builds.

## Manual Testing

- Optional smoke check with a live Copilot CLI session:
  - Confirm a live `inuse.{pid}.lock` appears
  - Confirm `agent list` surfaces the Copilot session with the expected cwd and summary

## Performance Testing

- No dedicated benchmark required; unit tests should include multiple session directories to guard against obvious unbounded behavior

## Bug Tracking

- Track regressions in this feature doc set and package tests before moving to final review

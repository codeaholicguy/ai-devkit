---
phase: testing
title: Claude Provider Refactor Testing Strategy
description: Characterization and validation plan for behavior-preserving Claude refactor
---

# Claude Provider Refactor Testing Strategy

## Test Coverage Goals

- Preserve all existing `agent-manager` Claude adapter, Claude parser, and durable Claude print-mode tests.
- Add or update focused tests for extracted modules where private adapter behavior becomes public-to-package behavior.
- Target 100% coverage for new extracted code branches where practical.
- Prefer characterization tests before logic moves; tests should assert current behavior, not redesigned behavior.
- No test should require a real Claude model invocation.

## Unit Tests

### `ClaudeSessionLocator`

- [x] Matches `claude --resume <uuid>` to the expected project JSONL and skips legacy birthtime matching for that process.
- [x] Reads matching PID files and returns direct matches with live status and `waitingFor` metadata.
- [x] Treats stale PID files as fallback when `startedAt` differs from process start time beyond the existing tolerance.
- [x] Falls back when PID JSON is malformed, absent, or points to a missing JSONL.
- [x] Discovers legacy session candidates by unique encoded process cwd and preserves existing batched birthtime lookup.
- [x] Walks all Claude project directories for historical `listSessions()` candidates.
- [x] Preserves lossy Claude project-dir encoding behavior.

### `ClaudeAgentMapper`

- [x] PID-file live status overrides JSONL-derived status.
- [x] Waiting summaries append the existing waiting reason text only for waiting agents with `waitingFor`.
- [x] Session-backed agents preserve name, type, pid, project path, session id, last active, and session file path.
- [x] Process-only agents preserve existing idle status, unknown summary, `pid-<pid>` session id, and cwd behavior.

### `ClaudeSessionParser`

- [x] Existing parser tests continue to pass after moving imports.
- [x] Conversation extraction remains unchanged for verbose and non-verbose modes.
- [x] Noise filtering, interruption handling, and UI-state entry handling remain unchanged.

### Claude Durable Provider Files

- [x] Existing `ClaudeCliProbe`, `ClaudePrintRunner`, and `ClaudePrintAgentService` tests continue to pass through package-root exports.
- [x] Provider-local tests import provider-local modules directly.

## Integration Tests

- [x] `ClaudeCodeAdapter.detectAgents()` still returns empty results for no Claude processes.
- [x] Matched Claude sessions still produce waiting/running/idle status according to existing fixtures.
- [x] Mixed direct PID-file and legacy matching still returns one agent per process.
- [x] Bad direct matches still fall back to process-only or legacy behavior as before.
- [x] `ClaudeCodeAdapter.listSessions({ cwd })` still handles worktree/current-cwd divergence.
- [x] Adapter and package barrel exports compile after no-value path-level wrappers are removed.

## End-to-End Tests

- [x] Package-level agent-manager test suite passes.
- [x] CLI tests that import or exercise `agent-manager` continue to pass when selected by planning.
- [x] No real Claude CLI/model call is required; durable tests continue using fake provider processes or injected runners.

## Test Data

- Existing Claude JSONL test files and inline temporary fixtures remain valid.
- PID-file fixtures should include happy path, stale `startedAt`, malformed JSON, missing JSONL, `status`, and `waitingFor`.
- Durable tests continue to use fake Claude executables/runners and temporary repositories/databases.
- No credentials, real home-directory data, or live provider sessions should be used.

## Test Reporting & Coverage

Baseline before implementation:

```bash
npm run nx -- test agent-manager
npm run nx -- run agent-manager:typecheck
npm run nx -- run agent-manager:lint
npm run nx -- run agent-manager:build
```

Validation after each implementation stage:

```bash
npm run nx -- test agent-manager -- ClaudeCodeAdapter
npm run nx -- test agent-manager -- ClaudeSessionParser
npm run nx -- test agent-manager -- ClaudePrint
```

Final validation:

```bash
npm run nx -- test agent-manager
npm run nx -- run agent-manager:typecheck
npm run nx -- run agent-manager:lint
npm run nx -- run agent-manager:build
npx ai-devkit@latest lint --feature claude-provider-refactor
```

Any pre-existing baseline failures must be recorded before implementation and not misreported as refactor regressions.

### Results

- `npm run nx -- test agent-manager`: passed with 30 test files and 571 tests.
- `npm test -- src/__tests__/adapters/ClaudeCodeAdapter.test.ts src/__tests__/utils/ClaudeSessionParser.test.ts src/__tests__/print/ClaudeCliProbe.test.ts src/__tests__/print/ClaudePrintRunner.test.ts src/__tests__/print/ClaudePrintAgentService.test.ts src/__tests__/print/ClaudePrintAgent.integration.test.ts src/__tests__/providers/claude/ClaudeAgentMapper.test.ts src/__tests__/providers/claude/ClaudeSessionLocator.test.ts`: passed with 8 test files and 117 tests.
- `npm run lint` in `packages/agent-manager`: passed.
- `npm run typecheck` in `packages/agent-manager`: passed.
- `npm run build` in `packages/agent-manager`: passed.
- `npx ai-devkit@latest lint --feature claude-provider-refactor`: passed.

## Manual Testing

- Run `ai-devkit agent list --type claude` or equivalent local command only if a real Claude process is already available and no model turn is triggered.
- Run `ai-devkit agent sessions --type claude --json` against local session files only if needed for smoke validation.
- Do not start a real Claude model turn solely for this refactor.

## Performance Testing

- Confirm `detectAgents()` still uses bounded process-scoped session discovery and batched session file stat calls.
- Confirm historical `listSessions()` behavior remains intentionally broader than live detection.
- No load test is required unless implementation adds new filesystem scans beyond the current behavior.

## Bug Tracking

- Regressions should be tied to the affected stage: compatibility move, locator extraction, mapper extraction, parser move, or durable move.
- If a behavior change is discovered, either preserve the old behavior or split the change into a separate explicit feature/bug task.

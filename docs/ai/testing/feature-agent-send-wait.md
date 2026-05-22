---
phase: testing
title: Agent Send Wait Testing
description: Testing strategy for adding --wait to agent send
---

# Agent Send Wait Testing

## Test Coverage Goals

- Target 100% coverage for new wait helper branches.
- Preserve existing `agent send` tests.
- Cover success, no-op, and failure modes without requiring a real Claude Code process.

## Unit Tests

### `waitForAgentResponse`

- [x] Emits only assistant messages added after the seeded transcript count.
- [x] Skips historical assistant messages.
- [x] Skips user messages and empty assistant messages.
- [x] Stops when the resolved agent reaches `AgentStatus.WAITING`.
- [x] Stops when the resolved agent reaches `AgentStatus.IDLE` after new assistant output.
- [x] Does not stop on `AgentStatus.IDLE` before new assistant output.
- [x] Tracks the same target by session ID when PID is not matched.
- [x] Fails when the target agent disappears.
- [x] Handles transient `getConversation()` errors without crashing immediately.
- [x] Does not complete on `AgentStatus.WAITING` until a transcript read succeeds.
- [x] Reports a stderr status message when the agent finishes without assistant text.
- [x] Waits for the configured poll interval before polling again.
- [x] Fails after the defensive max wait duration.
- [x] Caps polling sleep to the remaining timeout.
- [x] Uses the configured timeout label in timeout errors.

### `agent send` command

- [x] Existing non-wait send flow still calls `TtyWriter.send()` and prints success.
- [x] Initial idle agents send without busy-agent warning.
- [x] `--wait` validates `sessionFilePath`.
- [x] `--wait` validates target adapter support.
- [x] `--wait` seeds transcript before sending.
- [x] `--wait` calls the wait helper after sending.
- [x] `--wait` keeps assistant response text on stdout.
- [x] `--wait` sends busy-agent warnings to stderr.
- [x] `--wait` sanitizes status messages before writing to stderr.
- [x] `--wait --timeout <milliseconds>` passes the parsed timeout to the wait helper.
- [x] Timeout failures exit non-zero with a clear error.
- [x] Invalid timeout usage fails before resolving or sending to an agent.
- [x] Delivery failure does not enter wait mode.
- [x] Not-found and ambiguous agent behavior remains unchanged.

## Integration Tests

- [x] Command-level mocked integration: resolved agent plus mocked terminal plus mocked transcript returns assistant output.
- [x] Service-level mocked integration: agent returns waiting with no new assistant output.
- [x] Service-level mocked integration: target terminates during wait.

## End-to-End Tests

Manual E2E after implementation:

- [ ] Start a Claude Code session in tmux.
- [ ] Run `npx ai-devkit agent list` and identify the target.
- [ ] Run `npx ai-devkit agent send "say pong" --id <target> --wait`.
- [ ] Confirm stdout contains only the new assistant response.
- [ ] Confirm the command exits after Claude Code returns to the prompt.
- [ ] Run `npx ai-devkit agent send "sleep longer than timeout" --id <target> --wait --timeout 1000`.
- [ ] Confirm the command exits non-zero and reports a timeout on stderr.
- [ ] Run existing `npx ai-devkit agent send "continue" --id <target>` without `--wait` and confirm it remains fire-and-forget.

## Test Data

- Mock `ConversationMessage[]` arrays with historical messages and newly appended messages.
- Mock `AgentInfo` records with statuses `WAITING`, `IDLE`, active/non-waiting statuses, and missing `sessionFilePath`.
- Mock adapter read failures to simulate transcript writes in progress.

## Test Reporting & Coverage

Suggested verification commands:

```bash
npm run build
npx nx test cli --runInBand
npx ai-devkit lint --feature agent-send-wait
```

Phase 7 verification results:

- `npm run test -- --runInBand` from `packages/cli`: passed, 33 suites and 513 tests.
- `npm run test -- --runInBand src/__tests__/commands/agent.test.ts src/__tests__/services/agent/agent.service.test.ts` from `packages/cli`: passed, 38 tests.
- `npm run test -- --runInBand --coverage --coverageThreshold='{}' --collectCoverageFrom='src/services/agent/agent.service.ts' src/__tests__/services/agent/agent.service.test.ts` from `packages/cli`: passed, 100% statements/branches/functions/lines for the new wait helper.
- Regression check: with the `IDLE` completion fix temporarily reverted, `stops when the agent becomes idle after assistant output` failed with the original timeout.
- `npm run build`: passed.
- `npm run lint --workspace packages/cli`: passed with 0 errors and 4 pre-existing warnings outside this feature.
- `npx ai-devkit lint --feature agent-send-wait`: passed via the local built CLI in this workspace.

Phase 5 verification adds:

- `npx jest packages/cli/src/__tests__/commands/agent.test.ts --runInBand --testNamePattern "timeout duration|reaches the timeout"` from `packages/cli`: passed, 2 tests.
- `npx jest packages/cli/src/__tests__/services/agent/agent.service.test.ts --runInBand --testNamePattern "timeout label"` from `packages/cli`: passed, 1 test.
- `npx jest packages/cli/src/__tests__/commands/agent.test.ts packages/cli/src/__tests__/services/agent/agent.service.test.ts --runInBand` from `packages/cli`: passed, 47 tests.
- `npx jest packages/cli/src/__tests__/commands/agent.test.ts --runInBand --testNamePattern "timeout"` from `packages/cli`: passed, 4 tests.
- `npx jest packages/cli/src/__tests__/services/agent/agent.service.test.ts --runInBand --testNamePattern "timeout|sleep past"` from `packages/cli`: passed, 3 tests.

## Manual Testing

- Validate stdout/stderr separation from a shell pipeline.
- Validate behavior when the target session has no transcript path.
- Validate behavior when Claude Code is busy before the prompt is sent.

## Performance Testing

- Confirm polling interval does not create high CPU usage during a multi-minute wait.
- Confirm repeated transcript reads remain acceptable for normal Claude Code transcript sizes.

## Bug Tracking

- Add regressions to `agent.test.ts` for command-level bugs.
- Add focused helper tests for wait-loop state bugs.

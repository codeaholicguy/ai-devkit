---
phase: planning
title: Agent Send Wait Planning
description: Task breakdown for adding --wait to agent send
---

# Agent Send Wait Planning

## Milestones

- [x] Milestone 1: CLI option and transcript seed
- [x] Milestone 2: Wait helper and response output
- [x] Milestone 3: Failure handling and tests
- [x] Milestone 4: Documentation and verification
- [x] Milestone 5: Configurable wait timeout

## Task Breakdown

### Phase 1: CLI foundation

- [x] Task 1.1: Add `--wait` option to `agent send`.
- [x] Task 1.2: Preserve existing non-wait behavior and tests.
- [x] Task 1.3: Resolve the target adapter for the selected agent type.
- [x] Task 1.4: Validate `sessionFilePath` before waiting and return a clear error when unavailable.
- [x] Task 1.5: Seed transcript length before `TtyWriter.send()`.

### Phase 2: Wait helper

- [x] Task 2.1: Add `waitForAgentResponse()` helper under CLI services.
- [x] Task 2.2: Poll `getConversation()` and emit only new assistant messages.
- [x] Task 2.3: Poll `AgentManager.listAgents()` and resolve the same target to detect `waiting`.
- [x] Task 2.4: Stop successfully when the agent returns to `AgentStatus.WAITING`.
- [x] Task 2.5: Return structured wait results for future `--json` support.

### Phase 3: Failure modes

- [x] Task 3.1: Handle agent termination while waiting with a non-zero exit.
- [x] Task 3.2: Handle transcript read errors without crashing on the first transient failure.
- [x] Task 3.3: Add a fixed defensive max wait duration until the separate `--timeout` item is implemented.
- [x] Task 3.4: Ensure status/progress does not pollute stdout response output.

### Phase 4: Tests and docs

- [x] Task 4.1: Add tests for historical transcript seeding.
- [x] Task 4.2: Add tests for assistant-only output filtering.
- [x] Task 4.3: Add tests for missing `sessionFilePath`.
- [x] Task 4.4: Add tests for target termination and defensive timeout.
- [x] Task 4.5: Update user-facing docs/help text if command documentation exists.

### Phase 5: Configurable timeout

- [x] Task 5.1: Add `--timeout <milliseconds>` to `agent send`.
- [x] Task 5.2: Validate that `--timeout` is only used with `--wait`.
- [x] Task 5.3: Parse positive integer millisecond values into wait-helper milliseconds.
- [x] Task 5.4: Preserve the user-facing millisecond timeout in timeout errors.
- [x] Task 5.5: Add command and service tests for configurable timeout behavior.
- [x] Task 5.6: Cap wait-loop sleeps to the remaining timeout.

## Progress Summary

Phase 4 implementation completed the first backlog item for `agent send --wait`. The CLI now seeds transcript length before sending, validates wait-mode transcript support, resolves the target adapter, suppresses the normal success line in wait mode, writes assistant response text to stdout, and uses a dedicated wait helper to poll transcript/status until the original agent returns to `waiting`, returns to `idle` after new assistant output, disappears, or reaches the fixed 10-minute safety cap. Phase 6 review tightened the wait loop so it does not complete on `waiting` status until a transcript read succeeds, completes on `idle` only after response output, treats initial idle agents as safe to send without a busy warning, and sanitizes wait-mode stderr status messages. Focused command and wait-helper tests cover historical transcript seeding, assistant-only output, missing session files, target termination, transient transcript read errors, session-ID target fallback, no-response status reporting, sanitized stderr status output, idle-after-response completion, idle-before-output timeout, and defensive timeout.

Phase 5 added `--timeout <milliseconds>` for wait mode. The command now rejects timeout usage without `--wait`, accepts positive integer millisecond values, passes the parsed millisecond value to the wait helper, reports timeout failures with an `ms` label, and caps each poll sleep to the remaining timeout so scripts get a clear non-zero failure without oversleeping the requested cap.

## Dependencies

- Existing `AgentManager.resolveAgent()` behavior.
- Existing `AgentAdapter.getConversation()` implementations.
- Existing `TtyWriter.send()` terminal delivery.
- Existing `AgentStatus.WAITING` detection.
- Node 20-25 for local dependency installation because `better-sqlite3@12.6.2` does not build under Node 26.

## Timeline & Estimates

- CLI option and seed logic: 0.5 day.
- Wait helper: 1 day.
- Failure handling: 0.5 day.
- Unit tests and docs: 1 day.

Estimated total: 2-3 engineering days.

## Risks & Mitigation

- **Risk:** Agent status may lag transcript writes.
  **Mitigation:** Continue polling until both new messages are captured and status returns to waiting.

- **Risk:** Some adapters may not provide reliable `sessionFilePath`.
  **Mitigation:** Fail clearly in wait mode and keep fire-and-forget send available.

- **Risk:** Transcript parsing can throw while the agent is writing.
  **Mitigation:** Treat occasional read errors as transient during the wait loop.

- **Risk:** Command can hang longer than a script expects.
  **Mitigation:** Keep the default defensive cap and allow scripts to set `--timeout <milliseconds>`.

## Resources Needed

- Unit-test fixtures for conversation messages.
- Mock `AgentManager`, `AgentAdapter`, and `TtyWriter` behavior.
- Existing agent command tests as regression coverage.

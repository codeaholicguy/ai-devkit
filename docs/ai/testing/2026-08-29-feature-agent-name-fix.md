---
phase: testing
title: Testing Strategy
description: Define testing approach, test cases, and quality assurance
---

# Testing Strategy

## Test Coverage Goals
**What level of testing do we aim for?**

- Cover every new branch in prune, continuity matching, and kill cleanup.
- Integration scope includes registry refresh plus CLI kill orchestration.
- Run the repository's existing e2e gate after targeted suites.

## Unit Tests
**What individual components need testing?**

### AgentRegistry
- [x] Preserve an ESRCH managed row while its exact tmux session exists.
- [x] Prune the row when both PID and managed tmux session are absent.
- [x] Keep unmanaged ESRCH rows prunable.
- [x] Preserve rows when the tmux liveness probe is indeterminate.

### AgentManager continuity
- [x] Preserve name, tmux link, pin, and start metadata across stable-session PID rollover.
- [x] Remove the superseded PID row atomically.
- [x] Reject empty, synthetic, cross-type, and ambiguous session matches.

### Kill orchestration
- [x] Capture registry mapping before a refresh can prune or replace it.
- [x] Kill captured tmux when the provider process already returns ESRCH.
- [x] Do not kill an unrelated tmux session for an unmanaged agent.

## Integration Tests
**How do we test component interactions?**

- [x] Sandboxed-liveness simulation followed by managed registry preservation.
- [x] Provider PID rollover followed by list output retaining the custom name.
- [x] Command kill flow retains pre-refresh mapping and cleans tmux.
- [x] Durable repository tests remain green and no durable schema changes occur.

## End-to-End Tests
**What user flows need validation?**

- [x] Managed start → sandbox refresh → host refresh retains identity.
- [x] Managed agent exits → kill removes remaining tmux session.
- [x] Existing agent start/list/rename/pin/session flows remain green.

## Test Data
**What data do we use for testing?**

- Temporary SQLite registries, injected PID/tmux probes, fake adapters, and mocked
  `TmuxManager`; no mutation of the live registry during automated tests.

## Test Reporting & Coverage
**How do we verify and communicate test results?**

- Targeted Vitest suites first, then package/full test and coverage commands
  supported by repository scripts. Record exit codes and counts here.

### Results

- `npm test` in agent-manager: 41 files, 636 tests passed.
- `npm test` in CLI: 91 files, 1085 tests passed.
- Root `npm run build`: six projects passed.
- Root `npm test`: six projects passed.
- Root `npm run lint`: passed with four unrelated existing warnings and no errors.
- Root `npm run test:e2e`: 1 file, 41 tests passed.
- Agent-manager coverage: 97.6% statements and 93.12% branches for
  `AgentRegistry.ts`; package coverage completed successfully.
- CLI coverage: 95.49% statements and 91.79% branches for
  `agent.service.ts`; package coverage completed successfully.
- Regression reversal: all four new defect tests failed without the production
  diff and passed after restoration.

## Manual Testing
**What requires human validation?**

- Live two-stage reproduction completed before implementation; post-fix smoke test
  will use a temporary registry/session so existing agents are not disturbed.

## Performance Testing
**How do we validate performance?**

- Assert tmux probes occur only for managed entries whose PID returns ESRCH.

## Bug Tracking
**How do we manage issues?**

- Treat name/link loss and orphaned tmux cleanup as blocking regressions.
- Use verify's fix-revert-fail-restore-pass proof for each defect family.

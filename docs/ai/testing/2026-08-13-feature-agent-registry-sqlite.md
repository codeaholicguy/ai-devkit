---
phase: testing
title: Testing Strategy
description: Define testing approach, test cases, and quality assurance
---

# Testing Strategy

## Test Coverage Goals

- Cover 100% of new/changed `AgentRegistry` behavior.
- Cover the extracted SQLite connection/schema/migration behavior through registry creation and persistence tests.
- Keep existing `AgentManager`, adapter cache, start/rename/kill, and CLI command tests passing.
- Add regressions for the exact observed failure modes: duplicate PID names and concurrent temp-file writes.

## Unit Tests

### AgentRegistry

- [x] Creates SQLite database and schema on first write.
- [x] Ignores existing legacy `agents.json` rows and starts with an empty DB.
- [x] Upserts by `type + pid` rather than by name.
- [x] Preserves existing custom name when incoming detection has generated fallback name and empty `tmuxSession`.
- [x] Lets `agent start` style incoming entries with non-empty `tmuxSession` replace a generated fallback name for the same PID.
- [x] Preserves non-empty `tmuxSession` when incoming detection has empty `tmuxSession`.
- [x] Updates session metadata when incoming `sessionId` and `sessionFilePath` are non-empty.
- [x] `rename()` updates the name and preserves all other fields.
- [x] `rename()` reports not-found and live-name conflict errors.
- [x] `prune()` removes dead PIDs from SQLite.
- [x] Two registry instances can register the same PID without duplicate rows or temp-file failures.

### AgentManager

- [x] `listAgents()` preserves a user-managed name when adapter detection emits a generated fallback for the same PID.
- [x] Repeated `listAgents()` calls do not create duplicate registry entries for the same PID.

## Integration Tests

- [ ] `startAgent()` can register a managed name after a prior generated fallback row for the same PID.
- [ ] `killAgent()` can find the preserved `tmuxSession` by custom name.
- [ ] Existing Codex/Gemini/Pi adapter registry-cache tests pass with SQLite-backed storage.

## End-to-End Tests

- [ ] Manual smoke: start a named Codex agent, run repeated `agent list --json`, confirm the name remains stable.
- [ ] Manual smoke: run overlapping list/detail commands and confirm no temp-file rename error occurs.
- [ ] Manual cleanup: kill repro agents and verify no repro tmux sessions or registry rows remain.

## Test Data

- Temporary SQLite DB paths under `fs.mkdtempSync(...)`.
- Legacy JSON fixture used to verify old rows are ignored.
- Live PID uses `process.pid`; dead PID uses a high unlikely PID such as `999999`.

## Test Reporting & Coverage

- `npm test --workspace @ai-devkit/agent-manager -- AgentRegistry.test.ts AgentManager.test.ts`
- `npm test --workspace ai-devkit -- agent.service.test.ts agent.test.ts`
- `npm run typecheck --workspace @ai-devkit/agent-manager`
- `npm run lint --workspace @ai-devkit/agent-manager`
- `npx ai-devkit@latest lint --feature agent-registry-sqlite`

Current note: the full `npm test --workspace @ai-devkit/agent-manager` command is blocked in this sandbox by the unrelated `ClaudePrintAgent.integration.test.ts` path because local `ps` process identity lookup is denied. Focused registry, adapter-cache, CLI service/command, typecheck, build, and lint checks are the required evidence for this feature.

## Manual Testing

- Use uniquely named repro agents and clean them up immediately after observing behavior.
- Do not kill or rename unrelated existing user agents.

## Performance Testing

- No dedicated benchmark is required. Registry row counts are small; SQLite operations are synchronous and indexed by primary key.

## Bug Tracking

- Failures in name preservation, duplicate PID rows, or concurrent write behavior block PR delivery.

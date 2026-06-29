---
phase: testing
title: Testing Strategy
description: Define testing approach, test cases, and quality assurance
---

# Testing Strategy

## Test Coverage Goals

- Unit test coverage: 100% of new/changed code paths.
- Integration: covered by unit tests with real filesystem temp dirs.
- E2E: manual smoke test only (requires live Claude Code process + Telegram bot).
- Existing tests must pass without modification.

## Unit Tests

### `agent-requests.ts` — `packages/agent-manager/src/__tests__/utils/agent-requests.test.ts`
- [x] `getAgentRequestPath` returns `~/.ai-devkit/agent-requests/<sessionId>.json`.
- [x] `writeAgentRequest` creates directory and file on first write.
- [x] `writeAgentRequest` overwrites an existing entry on subsequent writes.
- [x] `readLatestAgentRequest` returns `null` when no file exists for the session.
- [x] `readLatestAgentRequest` returns `null` when the file contains malformed JSON.
- [x] `readLatestAgentRequest` returns the stored entry when the file is valid.

### `setup.service.ts` — claude agent — `packages/cli/src/__tests__/services/setup/setup.service.test.ts`
- [x] Skips Claude setup when `~/.claude` does not exist.
- [x] Copies hook script to `~/.claude/hooks/claude-prompt-hook.js`; creates `~/.claude/hooks/` if absent.
- [x] Creates `~/.claude/settings.json` with `PreToolUse` hook when file is absent.
- [x] Merges `PreToolUse` hook into existing settings.json that has no `hooks` key (preserves other keys).
- [x] Appends `PreToolUse` entry alongside existing hooks for other events (does not clobber).
- [x] Does NOT duplicate the entry when setup is re-run (idempotent).
- [x] Returns `status: 'installed'` on first install; `status: 'skipped'` on re-run.
- [x] `built-in-skills` step runs for `claude` agent.

### `channel-runner.ts` — `startOutputPolling()` — `packages/cli/src/__tests__/services/channel/channel-runner.test.ts`
- [x] Does not send when `chatIdRef.value` is null.
- [x] Does not send when `agent.sessionId` is absent.
- [x] Does not send when no agent-request file exists for the session.
- [x] Does not re-send a file that existed before polling started (init seeds `lastAgentRequestTimestamp`).
- [x] Sends a `[Tool prompt]` message for an entry written after polling starts.
- [x] Does not re-send when agent-request file timestamp has not changed across ticks.
- [x] Sends again when agent-request file is overwritten with a new timestamp (second distinct tool call).
- [x] Conversation (JSONL) messages are sent before the agent-request message in the same tick.
- [x] `AskUserQuestion` single-select `questions` array payload forwards as raw `[Question] <JSON>`.
- [x] `AskUserQuestion` multi-select `questions` array payload forwards as raw `[Question] <JSON>`.
- [x] `AskUserQuestion` with direct `question` string field formats as `[Question] <text>`.
- [x] `Bash` tool formats as `[Tool prompt] Bash:\n<command>`.
- [x] Non-Bash/non-Ask tools (e.g. `Edit`) format as `[Tool prompt] Edit:\n<JSON>`.

## Integration Tests (covered by unit tests above)

- [x] Full setup flow using temp dirs: hook script copied, settings.json correct, built-in skills installed.
- [x] Idempotent re-run: setup twice → no duplicate `PreToolUse` entry.
- [x] `startOutputPolling()`: agent-request file written to temp dir mid-interval → forwarded to mock Telegram.

## End-to-End Tests (Manual Only)

- [ ] Run `ai-devkit setup --agent claude`. Verify `~/.claude/hooks/claude-prompt-hook.js` exists and `~/.claude/settings.json` has `PreToolUse` entry with matcher `Bash|Edit|Write|MultiEdit|NotebookEdit|AskUserQuestion`.
- [ ] Trigger a Claude Code Bash call (approval prompt). Verify `~/.ai-devkit/agent-requests/<session-id>.json` is written.
- [ ] With `ai-devkit channel run` active, verify `[Tool prompt] Bash:\n<command>` appears in Telegram within 4 s.
- [ ] Trigger an `AskUserQuestion` dialog. Verify `[Question] <raw JSON>` appears in Telegram.
- [ ] Verify assistant/system messages still flow to Telegram (regression check).

## Test Data & Fixtures

- Temp dirs: `mkdtempSync` per test; `rmSync` in `afterEach`.
- Agent-request files: `writeAgentRequest(homeDir, entry)` from `@ai-devkit/agent-manager`.
- AskUserQuestion fixtures: exact payloads observed from live Telegram test (single-select and multi-select with `questions` array).
- Fake timers: `vi.useFakeTimers()` + `vi.advanceTimersByTimeAsync()` drives poll interval.
- Telegram stub: `vi.fn().mockResolvedValue(undefined)`.

## Test Reporting & Coverage

- `npx nx run-many --target=test --projects=cli,agent-manager,channel-connector,memory,memory-dashboard` → 1,465 tests pass.
- Build: `npx nx run-many --target=build --projects=cli,agent-manager` → clean, 0 TypeScript errors.

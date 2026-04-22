---
phase: testing
title: "Gemini CLI Adapter in @ai-devkit/agent-manager - Testing"
feature: gemini-cli-adapter
description: Test strategy and coverage plan for Gemini CLI adapter integration
---

# Testing Strategy: Gemini CLI Adapter in @ai-devkit/agent-manager

## Test Coverage Goals

- Unit test coverage target: all new/changed paths in `GeminiCliAdapter`
- Integration scope: adapter registration in `AgentManager` and CLI `agent` command
- End-to-end scope: real `ai-devkit agent list` with a live Gemini CLI session

## Unit Tests

### `GeminiCliAdapter`
- [x] Detect Gemini processes from `node` argv with a `gemini` basename token
- [x] Reject non-Gemini `node` processes during filtering
- [x] Return empty array when no Gemini process is running
- [x] Return empty array when `~/.gemini/projects.json` or `~/.gemini/tmp` is missing
- [x] Parse valid session with string `content` (assistant messages)
- [x] Parse valid session with array `content` (user `Part[]`)
- [x] Handle mixed string / array content within a single session
- [x] Drop non-text parts (e.g. `{data: ...}`, `{file: ...}`) without crashing
- [x] Prefer `displayContent` over `content` when both are present
- [x] Skip malformed JSON session files without failing full result
- [x] Map status based on `lastUpdated` vs shared thresholds
- [x] Compute `projectHash` via sha256 walk to `.git` boundary
- [x] Fallback to starting directory when no `.git` ancestor is found
- [x] `getConversation` resolves array-of-parts content correctly
- [x] `getConversation` handles non-text parts gracefully

### `AgentManager` integration seam
- [x] Aggregates Gemini + Claude + Codex adapter output
- [x] Gemini adapter errors do not break other adapters (soft-fail)

## Integration Tests

- [x] `agent` command registers `GeminiCliAdapter` in manager setup paths
- [x] `agent list` includes Gemini entries with expected fields
- [x] `agent open` handles Gemini agent command metadata path

## End-to-End Tests

- [x] User flow: `ai-devkit agent list` with real Gemini CLI running
  - Verified session file `~/.gemini/tmp/ai-devkit/chats/session-2026-04-22T03-12-6149f390.json`
  - `projectHash` matched sha256 of `/Users/.../ai-devkit`
  - User content was `[{"text":"what is 2+2?"}]` (array); assistant content was `"2 + 2 is 4."` (string)
- [x] Regression: Claude/Codex list/open remain unchanged

## Test Data

- Mock Gemini session fixtures:
  - valid (string + array content), empty directory, partial, malformed JSON
  - `projects.json` present / missing
- Mock process utility responses for `node` argv enumeration

## Test Reporting & Coverage

- Commands:
  - `npx nx run agent-manager:lint` ✅
  - `npx nx run agent-manager:build` ✅
  - `npx nx run agent-manager:test` ✅
  - `npx nx run agent-manager:test -- --runInBand src/__tests__/adapters/GeminiCliAdapter.test.ts` ✅ (42 tests passed)
  - `npx nx run cli:test -- --runInBand src/__tests__/commands/agent.test.ts` ✅
  - `npx nx run-many -t build test lint` ✅
- Coverage:
  - New Gemini adapter suite passes on detection, filtering, status mapping, content normalization (string + array), fallback naming, and `projectHash` computation.
  - 5 tests added after maintainer review specifically cover the `Part[]` content path that previously crashed.

## Manual Testing

- Verified table + json output include Gemini rows alongside Claude/Codex.
- Verified open/focus behavior on a live Gemini session.

## Performance Testing

- No observable latency regression in `agent list` after adding the Gemini adapter (session reads scoped to live-process shortIds, not a full `~/.gemini/tmp` scan).

## Bug Tracking

- Severity `blocking` — `.trim is not a function` on array-shaped user content (reported in PR #70 maintainer review): **Fixed** via `resolveContent` helper + 5 new tests. Verified with real Gemini session.
- Severity `minor` — initial Windows-specific basename customization: **Reverted** per maintainer guidance; POSIX/Windows behavior now matches `CodexAdapter`.

## Phase 7 Execution (2026-04-22)

### New Test Coverage Added

- `parseSession` with array `content` (real Gemini user-message shape)
- `parseSession` does not throw when `content` is `Part[]` without `displayContent`
- `parseSession` drops non-text parts (`{data}`, `{file}`) without failure
- `getConversation` resolves concatenated text across multiple `Part[]` entries
- `getConversation` handles non-text parts gracefully

### Commands Run

- `npx nx run agent-manager:test -- --runInBand src/__tests__/adapters/GeminiCliAdapter.test.ts` ✅ (42 passed)
- `npx nx run cli:test -- --runInBand src/__tests__/commands/agent.test.ts` ✅
- `npx nx run-many -t build test lint` ✅

### Phase 7 Assessment

- All review-feedback gaps are covered by new tests and reproduced against a real Gemini session.
- Adapter paths used by `detectAgents` and `getConversation` are exercised for both string and array content shapes.
- No regressions observed in Claude/Codex suites.

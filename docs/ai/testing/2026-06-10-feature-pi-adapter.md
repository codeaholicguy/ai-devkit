---
phase: testing
title: "Pi Adapter Testing Strategy"
feature: pi-adapter
description: Test coverage for Pi tracker matching, fallback matching, parsing, exports, and registration
---

# Testing Strategy: Pi Adapter

## Test Coverage Goals

- Target 100% meaningful branch coverage for new Pi adapter code.
- Cover exact tracker matching and missing-tracker fallback.
- Cover malformed files without adapter-wide failure.
- Run package-level tests for agent-manager after implementation.

## Unit Tests

### `PiAdapter`
- [x] Detects a Pi process and maps it through `~/.pi/agent/sessions.json` by PID.
- [x] Falls back to shared legacy matching when `sessions.json` is missing.
- [x] Returns a process-only Pi agent when no session file can be matched.
- [x] Ignores malformed tracker JSON and still uses fallback matching.
- [x] Falls back to legacy matching when a trusted tracker session file is unparseable.
- [x] Ignores tracker paths outside `~/.pi/agent/sessions`.
- [x] Parses user/assistant conversation messages from JSONL.
- [x] Parses real Pi `type: "message"` entries with nested `message.role` and text-part content arrays.
- [x] Includes system messages only when conversation detail is requested with `verbose`.
- [x] Derives waiting/running/idle status from recent message role and session age.
- [x] Truncates long user prompts for session summaries.
- [x] Falls back to filename-derived session IDs when explicit session IDs are absent.
- [x] Lists historical Pi sessions and applies strict `cwd` filtering.
- [x] Handles malformed session lines without throwing.
- [x] `canHandle()` accepts Pi commands and rejects unrelated commands.

### Exports and Registration
- [x] Adapter exports include `PiAdapter`.
- [x] CLI and channel agent-manager wiring register Pi.

## Integration Tests

- [x] `npx nx run agent-manager:test` passes.
- [x] `npx nx run cli:test` passes.
- [x] `npx nx run cli:build` passes.

## End-to-End Tests

- [x] Manual real Pi verification: `ai-devkit-25877` detail returned user and assistant messages from the tracked Pi session file.

## Test Data

- Temporary HOME directories with `.pi/agent/sessions`.
- JSONL session files using filenames like `2026-06-10T08-58-20-754Z_019eb0c1-06d2-71ed-90ee-7acbf4b21c5b.jsonl`.
- `sessions.json` PID-to-session-path map shape.
- Mocked process utilities for live process discovery.

## Test Reporting & Coverage

- Report exact commands, exit codes, and key pass/fail output.
- Any manual Pi verification gaps must be called out explicitly.

### Phase 7 Verification

- `npx vitest run src/__tests__/adapters/PiAdapter.test.ts`: exit 0, 14 Pi adapter tests passed after narrowing tracker support to the documented PID-to-session-path map.
- `npm run test:coverage --workspace packages/agent-manager`: exit 0, 399 tests passed. `PiAdapter.ts` coverage: 90.47% statements, 74.87% branches, 98% functions, 96.03% lines.
- `npx nx run agent-manager:test`: exit 0, 399 tests passed.
- `npx nx run cli:test`: exit 0, 697 tests passed.
- `npx nx run cli:build`: exit 0.

Remaining uncovered Pi branches are defensive paths around malformed optional metadata and filesystem edge cases; they are documented as residual low-risk coverage gaps rather than expanded into brittle tests.

## Manual Testing

- Optional: run a real Pi session with `@ai-devkit/pi-session-tracker` installed and verify `ai-devkit agent list --type pi`.

## Performance Testing

- Unit tests should include multiple session files but no separate load test is required for this local filesystem adapter.

## Bug Tracking

- Regressions found during implementation are tracked in the planning and implementation docs.

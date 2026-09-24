---
phase: testing
title: Jev Session Compaction Testing Strategy
description: Coverage for explicit availability, typed classification, rendering, security, and CLI integration
---

# Jev Session Compaction Testing Strategy

## Test Coverage Goals

- Cover 100% of new compaction service branches where practical.
- Exercise all acceptance paths without live Jev calls.
- Preserve command help and existing historical-session behavior.
- Treat missing-key behavior and non-disclosure of credentials as release-blocking tests.

## Unit Tests

### Session compact service

- [x] Returns an empty valid compact for an empty conversation.
- [x] Groups retained events into the equivalent JSON fields.
- [x] Drops `keep: false`, `discard`, `irrelevant`, and `sensitive` events.
- [x] Uses the first retained user instruction for intent and latest next-step event for next step.
- [x] Builds current state and resume prompt deterministically.
- [x] Renders every required Markdown heading.
- [x] Redacts bearer tokens, private-key blocks, and common secret assignments.
- [x] Bounds concurrent classifications and preserves source order when requests complete out of order.

### Jev classifier

- [x] Sends redacted role/content/timestamp state and all four typed questions.
- [x] Maps valid typed answers into a classified event.
- [x] Rejects unknown category or importance labels.
- [x] Never includes the API key in request state or thrown validation messages.

### CLI helpers and wiring

- [x] Rejects unsupported `--format` values.
- [x] Missing key prints exact Markdown unavailable text and does not create/list/read a session.
- [x] Missing key JSON emits the explicit unavailable object.
- [x] Present key resolves ID/type, reads verbose normalized conversation, invokes compaction, and emits selected format.
- [x] Present-key compact wiring uses manager exact-ID lookup rather than full session enumeration.
- [x] Manager exact lookup preserves ambiguity across providers, honors `--type`, and falls back for external adapters without the optional method.
- [x] All seven built-in adapters resolve exact IDs through their provider storage implementation.
- [x] Filesystem-backed direct lookup rejects empty, nested, current-directory, parent-directory, and NUL-containing session IDs through one shared path-segment validator.

### Built-in skill

- [x] Manifest includes `session-compact` exactly once.
- [x] Skill frontmatter is valid and documents missing-key behavior.

## Integration Tests

- [x] Run the focused CLI Vitest suites with a mocked SDK/classifier boundary.
- [x] Build the CLI package with the official SDK dependency.
- [x] Run `ai-devkit agent session compact --help` from built output and assert command/options are discoverable.
- [x] Run the built command with `TYPESAFE_API_KEY` absent and assert status 0 plus exact output.
- [ ] Run feature lint and repository lint.

## End-to-End Tests

- [ ] Manual live-key smoke test is documented but optional; CI must not require paid credentials.
- [x] Confirm an unavailable invocation never reads a real historical transcript.
- [x] Confirm existing `agent sessions` and `agent session detail` focused tests remain green.

## Test Data

- In-memory `ConversationMessage` fixtures spanning all categories and importance levels.
- Fake classifier implementations and mocked `@typesafe-ai/sdk` client responses.
- Secret-shaped strings that are synthetic and not usable credentials.
- Existing agent command manager/adapter mocks for session resolution.

## Test Reporting & Coverage

- Focused: `npx vitest run src/__tests__/services/session-compact src/__tests__/commands/agent.test.ts` from `packages/cli`.
- Package: `npm test --workspace packages/cli`.
- Build: `npm run build --workspace packages/cli` and final workspace `npm run build`.
- Lifecycle: `npx ai-devkit@latest lint --feature session-compact-jev`.
- Record fresh command evidence in this document and the durable task after implementation.

## Manual Testing

- Check Markdown readability and JSON parseability.
- Check exact missing-key output and successful exit status.
- Check help hierarchy and option descriptions.
- A live Jev call requires an operator-provided key and must never print it.

## Performance Testing

- Representative Codex session `01a0c95e-39c5-7701-a406-cb2578f7b75f`: 750-session enumeration took 3.40–4.88 seconds, while targeted file lookup took 8.88–14.02 milliseconds.
- Its 8.73 MB / 1,659-line transcript normalized to 70 verbose messages; parsing took 19.57–23.06 milliseconds and deterministic assembly/rendering took less than 0.4 milliseconds.
- Default concurrency eight changes the classification critical path from roughly 70 sequential round trips to nine waves while retaining one request per message.
- A deterministic 70-message / 100-millisecond-delay benchmark took 7,078 milliseconds at concurrency one and 911 milliseconds at concurrency eight (7.8x faster).
- The manager-level Codex exact lookup, including summary parsing, took 28.68–38.35 milliseconds across ten runs.
- No live Jev latency was measured because `TYPESAFE_API_KEY` was unavailable; projected post-change time is approximately CLI startup plus direct lookup/parsing plus `ceil(70/8)` Jev latency waves.

## Bug Tracking

- Security disclosure, silent fallback, incorrect successful availability, or transcript reads before the key gate are release blockers.
- Schema drift and provider-specific parser failures are normal runtime errors and require regression fixtures when encountered.

## Validation Results

- CLI package: 98 test files and 1177 tests passed.
- Focused feature coverage: 97.1% statements, 96.77% branches, 90.9% functions, and 98.36% lines across the session-compaction service files.
- Workspace: all six lint, build, and test targets completed successfully. Lint retains four unrelated pre-existing warnings in channel/preview code.
- Compiled CLI: help lists `agent session compact`; missing-key Markdown and JSON outputs match the required contracts and exit successfully.
- Skill: `quick_validate.py skills/session-compact` passed; built-in manifest/fallback tests passed.
- Formatting: all nine changed TypeScript files pass `oxfmt --check`. The repository-wide formatter still reports two unrelated pre-existing agent-manager files, which were not modified.
- Lifecycle: base and `session-compact-jev` feature lint passed; `git diff --check` passed.
- Performance follow-up focused suites: 8 agent-manager files / 254 tests and 2 CLI files / 99 tests passed; both package typechecks and lints passed (only unrelated existing CLI warnings remain).
- Live Jev call: not run because no paid credential is required for automated validation. SDK request construction and response handling are covered with mocked boundary tests.

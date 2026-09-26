---
phase: testing
title: Claude Capacity Testing Strategy
description: Fixture-based coverage for Claude credentials, usage mapping, errors, and CLI integration
---

# Claude Capacity Testing Strategy

## Test Coverage Goals

- Cover 100% of meaningful new provider branches with unit tests where practical.
- Exercise the CLI/provider integration entirely through injected readers and fetch implementations.
- Run no live network, account, Claude CLI, or Keychain operations.
- Retain passing Codex, z.ai, renderer, and multi-provider regression tests.

## Unit Tests

### Credential resolution

- [x] Prefer `CLAUDE_CODE_OAUTH_TOKEN` and do not read a file when it is set.
- [x] Resolve `.credentials.json` under a non-empty `CLAUDE_CONFIG_DIR`.
- [x] Resolve the default credentials file under `$HOME/.claude`.
- [x] Fall back to the `Claude Code-credentials` Keychain service for the default profile on macOS.
- [x] Keep environment/file precedence and skip global Keychain for custom profiles and non-macOS platforms.
- [x] Reject expired, malformed, and unavailable Keychain payloads without secret leakage or fetches.
- [x] Parse `claudeAiOauth.accessToken` and optional millisecond `expiresAt`.
- [x] Reject missing files, malformed JSON, missing tokens, and expired credentials with sanitized messages.

### Usage parsing

- [x] Map `five_hour` and `seven_day` utilization and resets.
- [x] Map flat Sonnet and Opus weekly windows independently.
- [x] Map valid model-scoped weekly `limits`, including entries whose `is_active` is false.
- [x] Skip all-model, duplicate, malformed, and non-weekly scoped limits.
- [x] Map enabled `extra_usage` as a credit-limit window in major currency units.
- [x] Preserve valid portions of partial payloads and unknown optional values.
- [x] Reject non-object payloads while never inventing absolute token totals.

### HTTP probing

- [x] Assert the exact endpoint, method, Bearer header, beta header, and Claude Code User-Agent.
- [x] Assert the timeout abort boundary is installed and cleared.
- [x] Distinguish sanitized 401, 403, 429, other HTTP, network, and malformed-JSON failures.
- [x] Parse numeric and HTTP-date `Retry-After` relative to an injected clock.
- [x] Verify fixture tokens and raw response bodies never appear in errors or reports.

## Integration Tests

- [x] `getClaudeCapacityReport` uses the injected clock and returns the normalized report.
- [x] `capacity claude` selects only Claude.
- [x] `capacity` includes Codex, z.ai, and Claude.
- [x] A Claude failure warns and preserves other providers in a multi-provider invocation.
- [x] Single-provider Claude failures propagate through the existing command behavior.
- [x] Text rendering labels Anthropic correctly; JSON emits the unchanged report contract.

## End-to-End Tests

- [x] Build the workspace and run focused agent-manager and CLI suites using fixtures only.
- [x] Run the complete repository test suite to catch adjacent regressions.
- [x] Run feature lint and verify no template placeholders or open lifecycle checks remain.

## Test Data

- A credentials fixture containing a fake OAuth token and future expiry.
- A complete usage fixture containing five-hour, seven-day, Sonnet/Opus fields, scoped limits, and extra usage.
- Partial and malformed usage fixtures.
- Inline mocked HTTP responses for status-specific behavior and Retry-After variants.

Fixture strings must be obviously fake and assertions must prove they do not leak.

## Test Reporting & Coverage

- `npm test --workspace=@ai-devkit/agent-manager`
- `npm test --workspace=ai-devkit`
- `npm run build`
- `npm test`
- `npx ai-devkit@latest lint --feature claude-capacity`

Record fresh pass/fail counts and command output in the implementation document and durable task evidence.

Final results:

- Agent-manager: 57 files and 689 tests passed.
- CLI: 102 files and 1,207 tests passed.
- Repository: 199 files and 2,307 tests passed across all six workspaces.
- Full agent-manager coverage: 88.55% statements, 77.31% branches, 93.56% functions, and 91.58% lines. The new Claude provider reached 95.96% statements, 85.71% branches, 95.23% functions, and 96.33% lines; tests intentionally replace the real Keychain subprocess boundary.
- Build, repository lint, feature lint, new-file formatting, and `git diff --check` passed.
- The repository-wide formatting check still reports the same 37 files as the base worktree. Every new feature file passes the formatter check; modified existing files retain their baseline style to avoid unrelated formatting churn.

## Manual Testing

No live-account smoke test is permitted for this feature. Review text and JSON behavior through mocked reports only.

## Performance Testing

No load test is required. Unit tests verify one fetch per probe and bounded timeout behavior.

## Bug Tracking

Any discovered regression is recorded in the planning checklist before implementation continues. Blocking failures return the lifecycle to design or implementation as appropriate.

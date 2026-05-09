---
phase: testing
title: Testing Strategy
description: Test coverage and approach for `agent sessions`
---

# Testing Strategy

## Coverage Goals

- **Target**: 100% statement / branch coverage on new code introduced by this feature.
- **Approach**: tests landed inline during implementation (TDD: failing test → impl → green) with a coverage audit during Phase 7 to fill gaps and consolidate.

## Coverage Results (Phase 7 audit)

Coverage is measured per-package against the files this feature touched.

### `packages/agent-manager` (new code paths)

| File | Stmts | Branches | Funcs | Lines | Notes |
|---|---|---|---|---|---|
| `AgentManager.ts` | 98.55% | 80% | 95% | 98.38% | One uncovered branch in pre-existing `listAgents` formatting; new `listSessions` fully covered. |
| `adapters/ClaudeCodeAdapter.ts` | 97.34% | 73.58% | 100% | 100% | Uncovered branches are in pre-existing `detectAgents` PID-file matching (lines 62-73, 151, 164, etc.), not new code. |
| `adapters/CodexAdapter.ts` | 93.92% | 70.58% | 100% | 96.84% | Uncovered branches in pre-existing detection helpers. New `listSessions` fully covered. |
| `adapters/GeminiCliAdapter.ts` | 93.8% | 74.31% | 100% | 94.81% | Same pattern — pre-existing `detectAgents`/`discoverSessions` branches. |
| `utils/session.ts` | 96.96% | 100% | 100% | 96.55% | New helpers (`isDirectory`, `safeReaddir`, `listJsonl`) fully covered; one stat-error branch in `batchGetSessionFileBirthtimes` is pre-existing. |
| `utils/ClaudeSessionParser.ts` | 96.35% | 88.39% | 100% | 97.67% | New `firstUserMessage` capture covered. |

### `packages/cli` (new code paths)

| File | Stmts | Branches | Funcs | Lines | Notes |
|---|---|---|---|---|---|
| `util/sessions.ts` | **100%** | **100%** | **100%** | **100%** | All new helpers (`resolveListSessionsOptions`, `parseLimit`, `formatFirstMessage`, `toJsonSession`) fully covered by `__tests__/util/sessions.test.ts`. |
| `commands/agent.ts` | 58% | 41% | 53% | 58% | All `agent sessions` paths covered by `agent.test.ts`. Remaining uncovered lines are pre-existing `list/open/send/detail` branches that were never tested in the repo before this feature. |

## Test Inventory

Test files added or extended by this feature:

### `packages/agent-manager/src/__tests__/`

- **`AgentManager.test.ts`** — 6 new tests in `describe('listSessions')`: empty manager, merge across adapters, sort by `lastActive` desc, type-filter short-circuit, throwing-adapter tolerance, opts pass-through. `MockAdapter` extended with `listSessions`/`setSessions`/`setFailListSessions` plumbing.
- **`adapters/ClaudeCodeAdapter.test.ts`** — 8 new tests in `describe('listSessions')`: empty dir, cwd-scoped success, all-cwd fan-out, cwd strict-equality (rejects subdir/parent), cwd-mismatch with encoded dir (rejects), malformed-file skip, first-message noise filter, empty-firstUserMessage placeholder, plus a regression test "finds sessions whose recorded cwd lives in a different encoded dir (worktree case)".
- **`adapters/CodexAdapter.test.ts`** — 6 new tests: empty dir, walks YYYY/MM/DD, cwd strict-equality, missing-`session_meta` skip, first-`user_message` extraction, empty-firstUserMessage.
- **`adapters/GeminiCliAdapter.test.ts`** — 7 new tests: empty `~/.gemini/tmp`, walks shortId/chats, cwd strict-equality vs `directories[0]`, malformed-JSON skip, missing-`sessionId` skip, first-user message (string + Part[] forms), empty-firstUserMessage.

### `packages/cli/src/__tests__/`

- **`commands/agent.test.ts`** — 9 new tests in `describe('sessions')`: default-cwd → `process.cwd()`, `--all` clears cwd, `--type` forwarded, JSON ISO dates, table column order, empty-state hint, placeholder substitution rule, raw empty firstUserMessage in JSON, `--limit` slice.
- **`util/sessions.test.ts`** (new file) — 19 unit tests across `resolveListSessionsOptions` (default cwd, --all, --cwd, --all+--cwd precedence, empty-cwd fallback, valid types, invalid type, empty type), `parseLimit` (default, string, number, 0 = unlimited, non-numeric, negative), `formatFirstMessage` (placeholder, short, truncate, exactly-80), `toJsonSession` (Date → ISO, raw empty fields).

## Integration / Smoke

End-to-end smoke runs against real Claude/Codex/Gemini session directories (logged in `implementation/feature-list-sessions.md`):

- `agent sessions --all --limit 5 --json` → returns 5 Claude sessions sorted by `lastActive` desc with copy-pasteable UUIDs.
- `agent sessions --all --type codex --limit 3 --json` → returns 3 Codex sessions.
- `agent sessions --all --type gemini_cli --limit 2 --json` → returns 2 Gemini sessions.
- `agent sessions --limit 5` (default cwd) → table output with relative-time `Last Active`.
- `agent sessions --all --type wrong` → exit 1 with the expected validation error.
- Default-cwd lookup with no matches → empty-state hint pointing at `--all`.

## Test Data

- Adapter tests use real `mkdtempSync` directories under `os.tmpdir()` and override the adapter's path field via `(adapter as any).<dir> = ...` (matches the existing pattern in pre-existing adapter tests).
- Manager tests use a hand-rolled `MockAdapter` implementing the full `AgentAdapter` interface.
- CLI tests use the existing `jest.mock('@ai-devkit/agent-manager', ...)` pattern with the manager mock extended for `listSessions`.

## Test Reporting & Coverage

- Run all tests: `npx nx run-many -t test` (459 + 20 from the new util tests = 479 total across `cli`, `agent-manager`, `memory`, `channel-connector`).
- Per-file coverage on demand: `cd packages/<pkg> && npx jest --coverage --coverageReporters=text --collectCoverageFrom='src/<file>'`.
- New code achieves the 100% coverage target on `util/sessions.ts` (CLI helpers); per-package totals are slightly under because they include pre-existing untested branches in adjacent code we deliberately did not touch.

## Manual Testing

Confirmed during smoke (see Integration / Smoke above). Session IDs round-trip into `claude --resume <id>`, `codex resume <id>`, and `gemini --session <id>` in their native UUID formats.

## Performance Testing

Not formally measured in v1 — captured as a follow-up in the planning doc. Soft target was <2s for ~200 sessions in default-cwd scope; smoke runs on a developer machine were perceptibly fast.

## Known Test Gaps / Follow-ups

- No tests for `parseLimit` rejecting fractional input (e.g. `"2.5"`); current `parseInt` floors silently. Low priority.
- No regression test for the case where `~/.codex/sessions` exists but contains no valid YYYY/MM/DD layout — covered transitively by the empty-walk path but not as a dedicated case.
- Performance benchmark deferred until measured complaints arise.

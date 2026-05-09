---
phase: planning
title: Project Planning & Task Breakdown
description: Tasks, order, and risks for the `agent sessions` command
---

# Project Planning & Task Breakdown

## Milestones

- [x] **M1: Types & adapter scaffolding** — `SessionSummary`, `ListSessionsOptions`, `AgentAdapter.listSessions` signature, no-op implementations.
- [x] **M2: Per-tool listing** — Claude, Codex, Gemini adapters each implement `listSessions` and capture `firstUserMessage`.
- [x] **M3: AgentManager + CLI command** — `AgentManager.listSessions`, `agent sessions` subcommand wired with table/JSON output.
- [x] **M4: Tests + manual smoke** — unit tests per adapter, integration test for the CLI command, manual run on real session dirs.

## Task Breakdown

### Phase 1: Foundation (M1)

- [x] **T1.1** Add `SessionSummary` and `ListSessionsOptions` to `packages/agent-manager/src/adapters/AgentAdapter.ts`; export from `packages/agent-manager/src/index.ts`.
- [x] **T1.2** Add `listSessions(opts?: ListSessionsOptions): Promise<SessionSummary[]>` to the `AgentAdapter` interface.
- [x] **T1.3** Add a stub `listSessions` returning `[]` to all three adapters so the build stays green during the rollout.

### Phase 2: Per-tool listing (M2)

- [x] **T2.1** Extend `ClaudeSessionParser.readSession` to also return `firstUserMessage` (captured in the same line iteration that already finds `lastUserMessage`).
- [x] **T2.2** Implement `ClaudeCodeAdapter.listSessions`. **Scope change**: dropped the encoded-dir shortcut for cwd-scoped lookups. Claude Code stores sessions under the *launch* directory's encoding, not the recorded `cwd` field — these diverge in worktrees, so we now always walk all project dirs and filter by `session.lastCwd`. Regression test added.
- [x] **T2.3** Implement `CodexAdapter.listSessions`. Walks `YYYY/MM/DD` dirs, parses `session_meta`, captures first `user_message`.
- [x] **T2.4** Implement `GeminiCliAdapter.listSessions`. Walks `~/.gemini/tmp/<shortId>/chats/session-*.json`, uses `directories[0]` as cwd, captures first user-typed message via existing `messageText` helper.

### Phase 3: Manager + CLI (M3)

- [x] **T3.1** Add `AgentManager.listSessions`. Skips adapters whose `type` doesn't match `opts.type`, runs the rest in `Promise.all`, catches per-adapter failures (one-line stderr warn), sorts merged results by `lastActive` descending.
- [x] **T3.2** Register `agent sessions` subcommand in `packages/cli/src/commands/agent.ts` with flags `--all`, `--cwd <path>`, `--type <type>`, `--limit <n>`, `-j/--json`. Helpers (`resolveListSessionsOptions`, `parseLimit`, `formatFirstMessage`, `toJsonSession`) exported for unit testing.
- [x] **T3.3** `npx nx run-many -t build` succeeds; `ai-devkit agent sessions` runs end-to-end against real Claude/Codex/Gemini session dirs.

### Phase 4: Tests + smoke (M4)

- [x] **T4.1** Unit tests added to each adapter's test file: empty dir, malformed-file-skipped, cwd-filter applied, plus a worktree regression for Claude. Sort-by-lastActive lives at the manager level (where the sort happens) — covered by T4.2.
- [x] **T4.2** `AgentManager.listSessions` covered by 6 new tests (merge across adapters, sort-by-lastActive desc, type-filter short-circuits adapters, throwing adapter tolerated, opts pass-through).
- [x] **T4.3** CLI tests added for `agent sessions`: default-cwd → `process.cwd()`, `--all` clears cwd, `--type` forwarded, JSON ISO dates, table column order, empty-state hint, placeholder substitution rule, raw empty firstUserMessage in JSON, `--limit` slice. 21 tests total in agent.test.ts pass.
- [x] **T4.4** Manual smoke against real session dirs returned valid SessionSummary entries for Claude/Codex/Gemini. Session IDs are UUIDs in each tool's native format and round-trip into the respective `--resume` commands without modification.

## Dependencies

- T1.1 / T1.2 must land first (introduce types). T1.3 (stubs) keeps the tree green.
- T2.1 must complete before T2.2 (Claude impl uses the new field).
- T3.1 depends on Phase 2 results being merge-able.
- T3.2 depends on T3.1 (CLI calls the manager).
- T4.* depend on the corresponding T2/T3 task.

External dependencies: none (no new npm packages, no API calls).

## Timeline & Estimates

Rough effort (for an engineer familiar with the repo):

- Phase 1 (T1.1–T1.3): ~30 min
- Phase 2 (T2.1–T2.4): ~2–3 hr
- Phase 3 (T3.1–T3.3): ~1–2 hr
- Phase 4 (T4.1–T4.4): ~1–2 hr

End-to-end: roughly half a focused day.

## Risks & Mitigation

- **Session-format drift across CLI versions** — Claude/Codex/Gemini may change their JSON schemas. Mitigation: tolerate missing fields; keep parsers defensive (already the existing pattern); add fixture tests so a regression is loud.
- **Performance on `--all` with many sessions** — full-file reads of every JSONL could dwarf the <2s target on heavy users. Mitigation: ship v1 with reuse-existing-parsers; profile once; if needed, follow up with mtime pre-filtering and/or streaming reads.
- **cwd-mismatch surprises** — a session may have moved (e.g., the user renamed a directory after starting it). The recorded cwd is what we filter on, so the user might miss it; `--all` is the documented escape hatch.
- **Windows path handling** — existing adapters are not Windows-tested in this repo. Treat as out of scope for v1; document in the requirements doc.
- **Interface change to `AgentAdapter`** — internal-only, but every adapter must implement it. Mitigation: T1.3 stubs land alongside the interface change in one commit.

## Resources Needed

- One engineer with TypeScript familiarity and access to the repo.
- A machine with at least one of each tool's session directory populated for manual smoke (T4.4).
- No infrastructure or third-party services.

## Status Summary (post-Phase 4)

All 14 planning tasks (T1.1 → T4.4) are complete. Full test suite is green: 459 tests across `agent-manager` and `cli` packages pass with the new code. End-to-end smoke run against real Claude/Codex/Gemini session directories produced valid `SessionSummary` records with copy-pasteable session IDs.

**Scope changes during execution**

- Dropped the encoded-dir shortcut in `ClaudeCodeAdapter.listSessions`. Claude Code stores session files under the *launch* directory's encoded name, but the recorded `cwd` field inside the session can change (worktree case). Always walking all project dirs and filtering by `session.lastCwd` is correct; the perf cost is acceptable for v1 and matches the "reuse existing parsers" stance.
- Required updating `MockAdapter` in `AgentManager.test.ts` to implement the new interface method. Trivial test plumbing change, not a planning miss.

**Open follow-ups**

- Gemini's `directories` field is often missing in real sessions, so `cwd` shows as empty for those rows. Filtering by `--cwd` will skip them. This is a real-world quirk to document, not a v1 blocker.
- Performance: not measured against the soft <2s guideline. Defer until users complain.

**Suggested next steps**

- Phase 6 (Check Implementation): verify code matches the design doc end-to-end.
- Phase 7 (Write Tests): the bulk of test work landed inline during TDD; Phase 7 will mostly be a coverage audit.
- Phase 8 (Code Review): pre-push polish.

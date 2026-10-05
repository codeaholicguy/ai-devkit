---
phase: testing
title: "Devin Adapter - Testing Plan"
feature: devin-adapter
description: Test scenarios, fixtures, and coverage targets for the Devin harness adapter
---

# Testing Plan: Devin Adapter

## Fixtures & approach

- **DB fixture**: `better-sqlite3` temp-file database built per test (`fs.mkdtempSync`), creating `sessions`, `message_nodes`, `prompt_history` tables matching the observed Devin schema — same pattern as `OpenCodeAdapter.test.ts`.
- **Locks fixture**: temp `session_locks/` dir; write `<slug>.lock` files containing pid strings.
- **Process injection**: `detectAgents({ processes: [...] })` with synthetic `ProcessInfo` (pid, ppid, command, cwd) — no real processes or `ps`.
- **Injectable seams**: `DevinAdapter(dbPath?, locksDir?)`; readiness probe uses mocked `ReadinessRuntime.runCommand`.
- Coverage target: adapter/locator/parser/mapper branches ≥90%; registration smoke tests.

## Scenarios

### canHandle / process filtering
- [x] `devin` bare command → accepted
- [x] `devin -r slug`, `devin --cloud`, `devin -p "..."` → accepted
- [x] `devin acp` → accepted (filtered later in detectAgents, not in canHandle)
- [x] `devin list`, `devin doctor`, `devin auth status`, `devin ssh`, `devin -V`, `devin rm` → rejected
- [x] `/usr/local/bin/devin` absolute path → accepted; `node devin.js` / `devinition` → rejected

### detectAgents — lock-first matching
- [x] TUI + `acp` child: lock pid = acp pid whose ppid = TUI pid → one agent, pid = TUI pid, sessionId = slug
- [x] `acp` child not duplicated as second agent
- [x] Standalone `devin acp` (ppid not a devin proc): lock pid = its pid → agent listed
- [x] Stale lock (holder pid not in snapshot) → ignored; proc falls back to cwd match or process-only
- [x] Lock holder pid resolves to a non-devin process → lock ignored (pid-reuse guard)
- [x] Two TUIs same cwd, two locks → each matched to its own session
- [x] No lock, proc.cwd matches `sessions.working_directory` → cwd fallback agent
- [x] No lock, no cwd match → `processOnlyAgent` (`pid-<pid>`)
- [x] DB missing/unreadable → all procs become process-only, no throw

### DevinSessionLocator
- [x] `resolveDbPath` honors `XDG_DATA_HOME`, falls back to `~/.local/share/devin/cli/sessions.db`
- [x] `listActiveLocks` returns `{slug, pid}` pairs; skips malformed/non-numeric/unreadable files
- [x] `findSessionForDirectory` returns most recent by `last_activity_at`, skips `hidden=1`
- [x] `listSessions` honors strict `opts.cwd`, skips hidden, encodes `sessionFilePath` as `dbPath::slug`, `firstUserMessage` from `prompt_history`
- [x] `findSessionsById` returns exact slug match only
- [x] `findSessionById` returns row for lock join; missing slug → null

### DevinSessionParser
- [x] `getConversation` returns user+assistant messages in `node_id` order; `system` skipped
- [x] Sibling revisions (same `message_id`) deduped → highest `node_id` wins
- [x] `role:"tool"` nodes → only with `verbose: true` (`[tool: name]`), plus `[thinking]` blocks
- [x] `tail: N` returns last N messages and issues a bounded query
- [x] Malformed `chat_message` JSON rows skipped; missing session → `[]`
- [x] `getSessionStats`: frontier role from max `node_id`; `lastTimeUpdated` = max node `created_at`; `summary` = latest `prompt_history` entry (skips shell `/` commands; fallback last `is_user_input` node; empty → `""`)
- [x] `getFirstUserMessage` (session list identity) still returns the first prompt

### DevinAgentMapper
- [x] frontier `assistant` → `WAITING`; `user`/`tool` → `RUNNING`; `lastActive` > 5min → `IDLE`
- [x] `sessionFilePath` = `dbPath::slug`; `projectPath` prefers `working_directory`; `name` via `generateAgentName`
- [x] `mapProcessOnlyAgent` → RUNNING, `pid-<pid>` sessionId

### readiness.ts
- [x] `devin auth status` stdout `Logged in...` → `authenticated`/pass
- [x] Non-login output → `unauthenticated`/fail
- [x] Probe throws → `unknown`/warn, no exception

### Registration
- [x] `AGENT_TYPES` includes `"devin"`; `DevinAdapter` in `createBuiltinAdapters()` order
- [x] `HARNESS_RUNTIME_PROFILES.devin` exists; `runtimeAgentMatchesHarness("devin","devin")` true
- [x] `READINESS_PROFILES.devin` exists (type-level Record completeness)

### End-to-end (manual, recorded as evidence)
- [x] `ai-devkit agent list` while a real `devin` TUI runs → `devin` row with correct cwd/status
- [x] `ai-devkit agent detail <name>` → readable conversation
- [x] `ai-devkit agent sessions` → historical slugs; `devin -r <slug>` resumes

## Results (2026-10-04)

- `packages/agent-manager/src/__tests__/harnesses/devin/` — 4 suites, 31 tests, all green.
- Readiness coverage lives in `harnesses/readiness/AgentReadiness.test.ts` (devin auth pass/fail cases).
- `vitest --coverage` on `src/harnesses/devin/**`: 90.7% statements, 82.6% branches, 91.3% lines.
- Full workspace `npm test`: 6 projects green (agent-manager 1294, cli 1241).
- Live e2e: `agent list` detected `devin` pid 51387 → session `brawny-shirt`; `agent detail` rendered 58 messages; `agent sessions --type devin` listed the slug.
- Known uncovered: DB `close()` error paths, corrupt-DB recovery branch mid-listing, readiness probe-throw fallback.

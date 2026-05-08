---
phase: planning
title: Project Planning & Task Breakdown
description: Tasks, order, and risks for the `agent sessions` command
---

# Project Planning & Task Breakdown

## Milestones

- [ ] **M1: Types & adapter scaffolding** — `SessionSummary`, `ListSessionsOptions`, `AgentAdapter.listSessions` signature, no-op implementations.
- [ ] **M2: Per-tool listing** — Claude, Codex, Gemini adapters each implement `listSessions` and capture `firstUserMessage`.
- [ ] **M3: AgentManager + CLI command** — `AgentManager.listSessions`, `agent sessions` subcommand wired with table/JSON output.
- [ ] **M4: Tests + manual smoke** — unit tests per adapter, integration test for the CLI command, manual run on real session dirs.

## Task Breakdown

### Phase 1: Foundation (M1)

- [ ] **T1.1** Add `SessionSummary` and `ListSessionsOptions` to `packages/agent-manager/src/adapters/AgentAdapter.ts`; export from `packages/agent-manager/src/index.ts`.
- [ ] **T1.2** Add `listSessions(opts?: ListSessionsOptions): Promise<SessionSummary[]>` to the `AgentAdapter` interface.
- [ ] **T1.3** Add a stub `listSessions` returning `[]` to all three adapters so the build stays green during the rollout.

### Phase 2: Per-tool listing (M2)

- [ ] **T2.1** Extend `ClaudeSessionParser.readSession` to also return `firstUserMessage` (captured in the same line iteration that already finds `lastUserMessage`).
- [ ] **T2.2** Implement `ClaudeCodeAdapter.listSessions`:
  - Encode/decode cwd ↔ `~/.claude/projects/<dir>` exactly like the existing helper.
  - cwd-scoped path: read one project dir; `--all` path: read all subdirs.
  - Map parsed sessions to `SessionSummary`.
- [ ] **T2.3** Implement `CodexAdapter.listSessions`:
  - Walk every existing `YYYY/MM/DD` directory under `~/.codex/sessions/`.
  - Parse each file's `session_meta` for cwd; if `opts.cwd` is set, drop non-matches without further parsing.
  - Augment `parseSession` (or factor a shared helper) to also extract the first `user_message`.
  - Map to `SessionSummary`.
- [ ] **T2.4** Implement `GeminiCliAdapter.listSessions`:
  - Walk every `~/.gemini/tmp/<shortId>/chats/session-*.json`.
  - Use `directories[0]` as the cwd; if `opts.cwd` is set, drop non-matches.
  - Augment parsing to capture the first `user`-typed message via existing `messageText`.
  - Map to `SessionSummary`.

### Phase 3: Manager + CLI (M3)

- [ ] **T3.1** Add `AgentManager.listSessions`:
  - `Promise.all` across adapters; tolerate per-adapter failure (catch + stderr warn).
  - Sort merged results by `lastActive` descending.
- [ ] **T3.2** Register `agent sessions` subcommand in `packages/cli/src/commands/agent.ts`:
  - Flags: `--all`, `--cwd <path>`, `--type <type>`, `--limit <n>`, `-j/--json`.
  - Resolve default cwd via `process.cwd()` unless `--all` or `--cwd` is given.
  - Apply `--type` and `--limit` after merging.
  - Render with `ui.table` (truncate first message to 80 chars; ISO date for json, relative for table).
  - Empty-state hint pointing at `--all`.
- [ ] **T3.3** Build the workspace (`npm run build`) and run `ai-devkit agent sessions` from this repo to confirm the wiring end-to-end.

### Phase 4: Tests + smoke (M4)

- [ ] **T4.1** Unit tests for each adapter's `listSessions` using the existing test fixtures under `packages/agent-manager/src/__tests__/` (or new fixture dirs). Cover: empty dir, malformed file skipped, cwd-filter applied, sort by lastActive.
- [ ] **T4.2** Test `AgentManager.listSessions` with two stub adapters (one returning data, one throwing) — assert results merged + sorted, error tolerated.
- [ ] **T4.3** CLI smoke test: snapshot `--json` output against a fixture set; assert the table renderer doesn't crash on the same input.
- [ ] **T4.4** Manual smoke: run on the developer's real session dirs and confirm a copy-pasteable session ID lands in `claude --resume`/`codex resume`/`gemini --session`.

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

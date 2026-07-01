---
phase: testing
title: "Grok Build CLI Adapter in @ai-devkit/agent-manager - Testing"
feature: grok-cli-adapter
description: Test strategy and coverage for the Grok CLI adapter, launch map, and CLI wiring
---

# Testing Strategy: Grok Build CLI Adapter in @ai-devkit/agent-manager

## Test Coverage Goals

- Unit coverage: all new paths in `GrokCliAdapter` (detection + inline parsing).
- Integration scope: adapter registration (`agent` command + channel runner), launch map, labels, and `--type` validation.
- End-to-end scope: real `ai-devkit agent start/list/sessions` against a live `grok` install.

## Unit Tests

### `GrokCliAdapter` (`GrokCliAdapter.test.ts`)
- [x] Exposes `grok_cli` type
- [x] `canHandle` true for `grok` (plain + full path + args); false for non-grok / arg-only matches
- [x] `detectAgents` returns `[]` with no processes
- [x] Resolves cwd via `active_sessions.json` (authoritative over the process cwd)
- [x] Falls back to the process cwd when the pid is not in `active_sessions.json`
- [x] Picks the most recently active session dir when a cwd has several
- [x] Process-only RUNNING fallback when no session matches
- [x] Session dir without `chat_history.jsonl` → no match (process-only)
- [x] `getConversation` maps user (`<user_query>`) + assistant records; skips context-injection user records
- [x] `getConversation` skips malformed lines
- [x] `getConversation` excludes system records unless verbose
- [x] Status: WAITING on trailing assistant message; RUNNING on trailing user message; IDLE past threshold
- [x] Agent summary is the last `<user_query>` prompt
- [x] `listSessions` returns `[]` when sessions dir absent; returns summaries with cwd decoded from the group dir; applies cwd filter; skips non-session entries (e.g. `prompt_history.jsonl`)

### Launch map (`agents.test.ts`)
- [x] `AGENTS.grok_cli.command === 'grok'`; `matchArgv0('grok')` matches the binary, rejects arg-only paths

## Integration Tests (cli)

- [x] `agent` command registers `GrokCliAdapter` (registerAdapter called 7×)
- [x] `channel` runner registers `GrokCliAdapter` (registerAdapter called 6×)
- [x] `STARTABLE_AGENT_TYPES` includes `grok_cli` in pane order
- [x] `--type grok_cli` is accepted; invalid `--type` error lists `grok_cli`

## End-to-End Tests

- [x] `listSessions()` against the real `~/.grok` lists the on-disk session `019f16c3-…` with `cwd`, `firstUserMessage:"hello"`, and the `chat_history.jsonl` `sessionFilePath`.
- [x] `getConversation()` against the real `chat_history.jsonl` returns `[{role:"user",content:"hello"}]`.
- [x] `detectAgents()` with a live `grok` process + `active_sessions.json` resolves the cwd, picks the `019f16c3-…` session, and surfaces `{type:"grok_cli", projectPath:<repo>, summary:"hello"}`.
- [x] Regression: full `agent-manager` (453) and `cli` (844) suites pass.

## Test Data

- Synthetic fixtures matching the captured real format: `active_sessions.json` (`{ pid, cwd, opened_at }[]`) and `chat_history.jsonl` (`{ type, content }` records with `<user_query>` prompts, context injections, and assistant turns). Temp `HOME`/session dirs via `fs.mkdtempSync`; `process.js`/`matching.js` mocked.

## Test Reporting & Coverage

- Commands:
  - `npx nx run agent-manager:lint` ✅ · `npx nx run agent-manager:build` ✅
  - `npx nx run agent-manager:test` ✅ · `npx nx run cli:test` ✅
  - `npx nx run-many -t build test lint` ✅

## Open Items

- The `active_sessions.json` schema (`{ pid, cwd, opened_at }`) was confirmed from the Grok binary, but a live entry could not be captured because the test account has no Grok subscription — the session stops at the paywall before registering. The end-to-end `detectAgents` check therefore injects a real-shape entry for the live `grok` pid; re-confirm against a subscribed session when available.
- Real **assistant** transcript content was not captured for the same reason (403 at the paywall). The `type:'assistant'` records mirror the verified user records (an array of `{type:'text', text}` blocks); re-confirm against a subscribed session.

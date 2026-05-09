---
phase: implementation
title: Implementation Guide
description: Where the code lives, key design choices that survived (and didn't) into the actual code
---

# Implementation Guide

## Code Map

| Concern | File | Notes |
|---|---|---|
| Public types | `packages/agent-manager/src/adapters/AgentAdapter.ts` | New: `SessionSummary`, `ListSessionsOptions`. Existing `AgentAdapter` interface gains `listSessions(opts?)`. |
| Module re-exports | `packages/agent-manager/src/index.ts` | `SessionSummary`, `ListSessionsOptions` added to the type-only export list. |
| Manager fan-out | `packages/agent-manager/src/AgentManager.ts` | New `listSessions(opts?)`: skip-by-type, `Promise.all` over remaining adapters, catch + stderr warn, sort by `lastActive` desc. |
| Claude listing | `packages/agent-manager/src/adapters/ClaudeCodeAdapter.ts` | New `listSessions` walks every `~/.claude/projects/*` subdir, parses each `*.jsonl` via `ClaudeSessionParser`, filters by `session.lastCwd === opts.cwd` when set. |
| Codex listing | `packages/agent-manager/src/adapters/CodexAdapter.ts` | New `listSessions` walks `~/.codex/sessions/YYYY/MM/DD/*.jsonl`, parses inline (does not reuse existing `parseSession` because that one finds *last* user message; this one wants *first*). |
| Gemini listing | `packages/agent-manager/src/adapters/GeminiCliAdapter.ts` | New `listSessions` walks every `~/.gemini/tmp/<shortId>/chats/session-*.json`, uses `directories[0]` as cwd, reuses `messageText` to extract first user message. |
| Parser extension | `packages/agent-manager/src/utils/ClaudeSessionParser.ts` | `ClaudeSession.firstUserMessage?: string` added; captured during the existing single-pass loop next to `lastUserMessage`. |
| Shared fs helpers | `packages/agent-manager/src/utils/session.ts` | New exports `isDirectory`, `safeReaddir`, `listJsonl` — generic fs wrappers used by all three adapters' `listSessions` implementations (factored out after the initial impl had duplicated copies). |
| CLI command | `packages/cli/src/commands/agent.ts` | New `agent sessions` subcommand. Imports its helpers from `util/sessions.ts`. |
| CLI session helpers | `packages/cli/src/util/sessions.ts` (new) | `resolveListSessionsOptions`, `parseLimit`, `formatFirstMessage`, `toJsonSession`. `formatFirstMessage` reuses `truncate(text, maxLength, replaceText)` from `util/text.ts`. Tested at 100% coverage in `__tests__/util/sessions.test.ts`. |

## Layering Rule (as built)

CLI computes filter values from flags (defaults, validation, error messages) and passes them to `AgentManager.listSessions({ cwd, type })`. The manager skips adapters whose `type` doesn't match `opts.type`; otherwise it forwards the same `opts` to each adapter. Adapters apply `opts.cwd` as a strict-equality filter against the session's recorded cwd. `--limit` stays CLI-only, applied after the manager returns, because pushing it down would still require a CLI-side re-cap and adds a per-adapter ordering contract that v1 doesn't need. This matches the design doc's flow exactly.

## Key Decisions That Changed During Implementation

### Dropped the Claude encoded-dir shortcut

**Original design**: when `opts.cwd` is set, derive `~/.claude/projects/<encoded>/` and read just that one directory (perf optimization).

**What happened**: when running the smoke test from a worktree (`/Users/hoangnguyen/Codeaholicguy/Code/ai-devkit/.worktrees/feature-list-sessions`), the shortcut returned zero matches even though the current Claude session's recorded cwd was that exact path. Cause: Claude Code stores session files under the *launch* directory's encoded name (`-Users-hoangnguyen-Codeaholicguy-Code-ai-devkit`), not under the encoding of the recorded `cwd` field. These diverge any time the user `cd`'s into a worktree (or another subdir) after launching Claude.

**Fix**: `ClaudeCodeAdapter.listSessions` now always walks every project dir and filters by `session.lastCwd` after parsing. A regression test in `ClaudeCodeAdapter.test.ts` covers this case ("finds sessions whose recorded cwd lives in a different encoded dir (worktree case)").

The perf cost is reading every `*.jsonl` in `~/.claude/projects/**`, which is acceptable for v1 (matches the "reuse existing parsers" stance). If it becomes a problem, add an mtime pre-filter as a follow-up.

## Edge Cases Handled

- Tool's session dir doesn't exist → returns `[]`.
- Malformed JSON line(s) in a session → individual lines are skipped via the existing parser's per-line `try/catch`.
- Session JSONL with *no* parseable conversation entries (e.g. all-garbage file) → the Claude adapter explicitly drops these (`if (!session.lastEntryType) continue;`) so we don't surface shell records.
- Gemini session JSON missing `directories` → `cwd` field is empty string. With `opts.cwd` set, the row is filtered out; with `--all` it appears with empty cwd.
- Adapter throws → caught in `AgentManager.listSessions`, logs one stderr line, continues with the other adapters' results.
- `--type wrong` → CLI raises `Error: Invalid --type "wrong". Expected one of: claude, codex, gemini_cli.` via `withErrorHandler`.

## Conventions Followed

- TypeScript strict mode, jest tests in `__tests__/` folders mirroring `src/`.
- Adapter tests use a real tmp dir + `(adapter as any).<dir> = ...` override (matches existing pattern in `ClaudeCodeAdapter.test.ts`).
- Manager tests use a hand-rolled `MockAdapter` (had to grow `listSessions`, `setSessions`, `setFailListSessions` plumbing).
- CLI command file follows the same shape as the existing `list/open/send/detail` subcommands.

## Test Coverage

Per package, test file → suites added/updated:

- `packages/agent-manager`: `AgentManager.test.ts` (+ 6 listSessions tests, MockAdapter extended), `ClaudeCodeAdapter.test.ts` (+ 8 listSessions tests including worktree regression), `CodexAdapter.test.ts` (+ 6 listSessions tests), `GeminiCliAdapter.test.ts` (+ 7 listSessions tests).
- `packages/cli`: `agent.test.ts` (+ 9 sessions subcommand tests).

Full suite: 459 passing across all 4 projects.

## Manual Verification

Smoke commands run from worktree, all exit 0:

- `agent sessions --help` — flags listed correctly.
- `agent sessions --all --limit 5 --json` — returned 5 Claude sessions sorted by lastActive desc, IDs are UUIDs in Claude's resume format.
- `agent sessions --all --type codex --limit 3 --json` — returned 3 Codex sessions, IDs are Codex UUIDs.
- `agent sessions --all --type gemini_cli --limit 2 --json` — returned 2 Gemini sessions, IDs are Gemini UUIDs.
- `agent sessions --limit 5` (default cwd) — table output, current session shown with truncated first message.
- `agent sessions --all --type wrong` — exit 1 with the expected validation error.
- Default-cwd lookup with no matches — empty-state hint pointing at `--all`.

## Known Limitations / Follow-ups

- Gemini sessions without a recorded `directories` array show `cwd: ''`. Worth documenting in user-facing docs once we have any.
- No persistent index/cache. Adequate for hundreds of sessions; revisit if performance complaints surface.
- Performance not formally measured against the design doc's soft "<2s for ~200 sessions" guideline. The smoke run on a developer machine with a real history was perceptibly fast.
- Windows path handling is untested in this repo (matches existing adapters).
- A future `agent resume <id>` that exec's the right CLI is intentionally not in v1.

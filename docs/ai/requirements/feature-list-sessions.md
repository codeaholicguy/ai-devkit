---
phase: requirements
title: Requirements & Problem Understanding
description: List historical Claude Code, Codex, and Gemini CLI sessions so a user can find a session ID to resume
---

# Requirements & Problem Understanding

## Problem Statement

Today the `ai-devkit agent list` command only shows agents whose host process is **currently running**. When a user wants to resume an earlier conversation with `claude --resume <id>`, `codex resume <id>`, or `gemini --session <id>`, they must manually:

- Remember the tool used
- Locate the right on-disk session file (`~/.claude/projects/<encoded-cwd>/*.jsonl`, `~/.codex/sessions/YYYY/MM/DD/*.jsonl`, or `~/.gemini/tmp/<shortId>/chats/session-*.json`)
- Open the file to read the first user message and confirm it is the right session

This is slow, error-prone, and breaks the "single tool to manage agents" abstraction the rest of `agent` commands provide.

**Affected user**: any developer using more than one AI CLI tool, or who frequently switches projects and needs to pick up an earlier session.

## Goals & Objectives

### Primary goals

- Provide a single command that lists **all** historical sessions across Claude Code, Codex, and Gemini CLI.
- For each session, surface enough context to identify it: session ID, tool type, cwd, the first user message, and last activity timestamp.
- Default scope is "sessions for the current cwd" so the most common use case (resume a session here) is one short command.
- Emit a `--json` form for scripting (pipe to `fzf`, `jq`, etc.).

### Secondary goals

- Reuse the existing `AgentAdapter` abstraction in `packages/agent-manager` so adding future CLIs is straightforward.
- Keep performance acceptable for a typical developer (hundreds of sessions, ~tens of MB total) with the simple "reuse existing parsers" path; leave room for streaming/index optimizations later if needed.

### Non-goals

- Resuming sessions automatically (user copies the ID and runs the tool's native resume command).
- Editing, deleting, or migrating session files.
- Cross-host or cloud-stored session sources.
- A persistent on-disk index/cache (deferred until perf demands it).
- Replacing or breaking `agent list` (it stays focused on running agents).

## User Stories & Use Cases

- **As a developer**, I want to run `ai-devkit agent sessions` in my project and see every Claude/Codex/Gemini session that started here, so I can pick the right ID to resume.
- **As a developer**, I want `ai-devkit agent sessions --all` to list sessions across every cwd, so I can find a session I started in another project.
- **As a developer who only uses one tool right now**, I want `ai-devkit agent sessions --type claude` (or `codex` / `gemini_cli`) to narrow the list to that tool, so I don't sift through unrelated sessions.
- **As a developer with many sessions**, I want `--limit <n>` to cap how many rows print (default sensible cap), so the terminal isn't flooded.
- **As a developer**, I want `ai-devkit agent sessions --json | fzf` to work, so I can build my own pickers/aliases.
- **As a developer with many sessions**, I want the listing sorted by last-active descending, so the relevant session is near the top.
- **As a developer**, when I find the session I want, I want the session ID printed verbatim so I can copy it directly into `claude --resume <id>` (or equivalent).
- **As a developer running the command in an empty project**, I want a hint pointing at `--all` when no sessions match the default scope, so I know how to broaden the search.

### Edge cases

- A tool's session directory does not exist yet (user has never run that CLI). Treat as empty, no error.
- A session file is malformed / partially written. Skip with a debug warning, continue.
- A session has zero user messages (created but never sent). Show with "(no message yet)" placeholder and `lastActive` from file mtime.
- Two sessions share the same cwd and very close timestamps. Both shown, sorted by `lastActive`.
- Very large session files. Reuse existing adapters' parsers in v1; revisit if measured runtime is unacceptable.
- An adapter throws while listing (corrupt index, unexpected format). The other adapters' results are still shown; a one-line warning goes to stderr.
- The user is in a subdirectory of where the session was started. Default cwd filter uses strict equality, so the session won't appear; the user is expected to `cd` to the recorded directory or pass `--all`.

## Success Criteria

- `ai-devkit agent sessions` from a project root prints a table with columns: Type, Session ID, CWD, First Message, Last Active.
- Sessions in current cwd appear by default using **strict equality** against `process.cwd()`; `--all` shows every cwd.
- `--type <claude|codex|gemini_cli>` filters to one tool; rows from other tools are excluded after merging.
- `--limit <n>` caps printed rows (default 50; `0` disables the cap).
- `--json` returns an array of `SessionSummary` objects matching the schema declared in the design doc (`{ type, sessionId, cwd, firstUserMessage, lastActive, startedAt, sessionFilePath }`, ISO date strings); the schema does not change between runs of the same v1 release.
- "First user message" matches what the existing per-tool parsers consider a meaningful first user prompt (skips tool-result blocks, request-interruption notices, system-injected context).
- Printed session IDs are copy-pasteable into the originating tool's resume command without modification.
- Sort order is `lastActive` descending (most recent first).
- When the result set is empty and no `--all`/`--cwd` was passed, a one-line hint suggests `--all`.
- An adapter failure logs a one-line warning to stderr but does not abort the listing.
- Performance: on a developer machine with ~200 historical sessions, default-cwd run completes within a few seconds. Treated as a soft guideline, not a hard SLO in v1.
- Existing `agent list/open/send/detail` behavior is unchanged.

## Constraints & Assumptions

### Technical constraints

- Must run on Node 20+ (matches repo's `engines.node`).
- Cross-platform paths (macOS, Linux). Windows is best-effort (existing adapters are not Windows-tested in this repo).
- v1 reuses existing parsing paths in `ClaudeCodeAdapter` / `CodexAdapter` / `GeminiCliAdapter`; no streaming parser, no on-disk index.

### Assumptions

- Session ID strings stored on disk are exactly the values each tool's `--resume` (or equivalent) flag accepts.
- Session files are append-only during a session and effectively immutable afterward, so file mtime ≈ last activity.
- Users prefer current-cwd default scope (matches the existing `agent` group conventions and the answer in clarifying questions).

## Questions & Open Items

- Should "first chat message" fall back to the assistant message if no user message exists? **Decision (v1)**: no — show "(no message yet)" placeholder.
- Should we filter out the currently-running agent's session from the list to dedupe with `agent list`? **Decision (v1)**: no — show everything; running ones can be visually identified by very recent `lastActive`.
- Default cwd filter precision? **Decision (v1)**: strict equality with `process.cwd()`. `--all` is the only escape hatch; prefix-aware matching can be added later if users complain.
- Long-term: should `ai-devkit agent resume <id>` exec the right CLI for the user? Not in scope for v1; tracked as a follow-up.

---
phase: requirements
title: "Devin Adapter in @ai-devkit/agent-manager - Requirements"
feature: devin-adapter
description: Add a Devin adapter that detects running Devin CLI sessions via session lock files and the local sessions database
---

# Requirements: Add Devin Adapter to @ai-devkit/agent-manager

## Problem Statement

`@ai-devkit/agent-manager` supports multiple local AI agents through harness adapters, but Devin CLI sessions are not surfaced by `agent list`, `agent detail`, `agent sessions`, or related flows. Devin persists sessions locally under `~/.local/share/devin/cli/`:

- `sessions.db` (SQLite, WAL mode) — `sessions` table (slug `id`, `working_directory`, `title`, `created_at`, `last_activity_at`, `main_chain_id`, `hidden`), `message_nodes` (tree-structured chat messages), `prompt_history` (user prompts per session).
- `session_locks/<slug>.lock` — exclusive session lock whose contents are the PID of the process holding the session (the `devin acp` backend child).
- `transcripts/<slug>.json` — ATIF-format rendered transcript, updated during the session.

Who is affected:
- Users running Devin CLI who expect active sessions to appear alongside Claude, Codex, Gemini CLI, OpenCode, and Copilot.
- Maintainers adding adapter support who need Devin to follow existing agent-manager patterns.

## Goals & Objectives

### Primary Goals
- Add `devin` as a first-class `AgentType`.
- Implement `DevinAdapter` in `packages/agent-manager` following the OpenCode (SQLite-backed) adapter pattern.
- Detect running Devin processes and map them to sessions, preferring exact PID matching via `session_locks/` files.
- Fall back to `working_directory` matching when no lock association exists.
- Implement `getConversation()`, `listSessions()`, and `findSessionsById()` against `sessions.db`.
- Register the adapter (type, builtin adapters, runtime profile, readiness profile) so existing manager/CLI flows include Devin.

### Secondary Goals
- Reuse shared process, matching, registry, and readiness utilities (`findHarnessProcesses`, `matchesExecutable`, `processOnlyAgent`, `isIdle`, `homeDir`).
- Add a Devin readiness profile probing `devin auth status`.
- Cover lock matching, cwd fallback, subcommand filtering, malformed data, conversation extraction, and session listing with unit tests.

### Non-Goals
- `agent send` / durable runner support (`devin -p` or `devin acp`/ACP). Deferred to a follow-up feature — Devin lacks `--session-id` and `--output-format stream-json`, so the durable contract needs separate design work.
- Reading ATIF `transcripts/*.json` (kept as a contingency if `message_nodes` schema proves unstable).
- Capacity/quota probing for Devin.
- Devin Cloud (`--cloud`) remote session contents — cloud sessions surface as process-only agents at best.
- Changing Devin's storage format or CLI.

## User Stories & Use Cases

1. As a Devin user, I want my running `devin` TUI session to appear in `agent list` with the correct project path, status, and summary so I can see it alongside other agents.
2. As a Devin user running multiple `devin` sessions in the same directory, I want each process matched to its own session via lock-file PID mapping so sessions are not confused.
3. As a user inspecting an agent, I want `agent detail` to show the Devin conversation (user/assistant messages; tool calls in verbose) read from `sessions.db`.
4. As a user, I want `agent sessions` to list historical Devin sessions (respecting cwd filtering) so I can resume them with `devin --resume <slug>`.
5. As a user driving Devin through an external ACP client (standalone `devin acp` process), I want that session listed as an agent too.
6. As a maintainer, I want Devin support to reuse the adapter contract and OpenCode-style decomposition (Adapter/Locator/Parser/Mapper).

## Success Criteria

- `AgentType` includes `devin`.
- `DevinAdapter` exists, implements `AgentAdapter`, and is registered in `createBuiltinAdapters()`, `AGENT_TYPES`, `HARNESS_RUNTIME_PROFILES`, and the readiness registry.
- With a live `devin` session, `detectAgents()` returns a `devin` agent whose `sessionId` is the session slug and whose `sessionFilePath` encodes `dbPath::slug`.
- `devin acp` child processes do not produce duplicate agent rows; standalone `acp` processes are listed.
- `devin` utility invocations (list, doctor, auth, ssh, etc.) are not reported as agents.
- `getConversation()` returns user and assistant messages in order, deduplicating sibling nodes by `message_id`; `tail` is honored at SQL level.
- `listSessions()` returns historical Devin sessions, honors strict `cwd` filtering, and skips `hidden` sessions.
- `agent start devin` launches the Devin TUI via the runtime profile.
- Readiness reports Devin auth state from `devin auth status`.
- Focused adapter tests and the package test suite pass; `ai-devkit agent list` shows a real running Devin session end-to-end.

## Constraints & Assumptions

### Technical Constraints
- Follow existing TypeScript, Nx, Vitest, and adapter conventions.
- Read `sessions.db` strictly read-only; degrade to `processOnlyAgent` on any DB/parse failure so one bad state never aborts detection.
- Keep `AgentInfo`/`SessionSummary` output shapes compatible with existing consumers.
- `sessionId` (the slug) must round-trip verbatim into `devin --resume <slug>`.

### Assumptions
- `devin` agent processes are identified by basename `devin` with no utility-subcommand token (`list rm ssh forward doctor auth mcp rules skills plugins update version migrate uninstall setup sandbox`). `devin acp` is handled specially: it is an agent only when its parent is not itself a `devin` process.
- `session_locks/<slug>.lock` file contents are the holder PID; liveness is verified against the process snapshot (and command match), not file presence alone.
- Lock-file matching is primary; `working_directory` equality (most recent by `last_activity_at`) is the fallback, matching the OpenCode pattern.
- `main_chain_id` points to the head node of the active conversation chain; conversation reconstruction sorts `message_nodes` by `node_id`, filters roles, and dedupes sibling revisions by `message_id`.
- `metadata.is_user_input` in `message_nodes.chat_message` marks real user prompts; `prompt_history` provides the session's first user message for summaries.
- Adapter type string is `devin` (not `devin_cli`).
- Devin's DB schema is internal and may drift between versions; the adapter must tolerate missing columns/rows gracefully (worst case: process-only agents).

## Questions & Open Items

- Resolved (2026-10-04): Public adapter type is `devin`.
- Resolved (2026-10-04): Standalone `devin acp` processes count as agents; TUI-spawned `acp` children are deduplicated (lock PID identifies the backend, `ppid` identifies the TUI).
- Resolved (2026-10-04): `agent send`/durable support is a non-goal for v1; ACP (`devin acp` stdio protocol) is the candidate interface for a follow-up.
- Resolved (2026-10-04): `sessions.db` is the primary conversation source; ATIF transcripts are fallback-only contingency.
- Open (verify during implementation): whether `devin -p` print mode takes a session lock — affects only the follow-up durable feature, not v1 detection.
- Open (verify during implementation): whether `main_chain_id` semantics hold for branched (rewound) conversations; v1 flattens by `node_id` which tolerates either interpretation.

---
phase: requirements
title: Requirements & Problem Understanding
description: Clarify the problem space, gather requirements, and define success criteria
---

# Requirements & Problem Understanding

## Problem Statement

**What problem are we solving?**

Muse Code sessions are invisible to AI DevKit. `agent list`, the console, `listSessions`,
and readiness reporting cover Claude Code, Codex, Gemini, and the other harnesses, but a
developer running `muse` gets no supervision, no history, and no conversation access through
the shared control plane. The current workaround is inspecting `~/.local/share/muse` by hand.

- Who is affected: developers whose agent mix includes Muse Code (e.g. this repo's own users).
- Current situation: manual `ls`/`cat` of runtime and transcript files; no programmatic access.

## Goals & Objectives

- Primary goals (v1, vertical slice in `agent-manager`):
  1. Detect live Muse sessions (process + runtime-file match) with correct pid, session id,
     project path, and display name.
  2. Enumerate historical sessions from the dated archive with cwd filtering.
  3. Resolve a session id without a full archive walk (`findSessionsById`, runtime-first).
  4. Read conversations including tail-efficient reads for large transcripts.
  5. Report Muse readiness (executable, config dir, auth, built-in skills) through the
     existing readiness pipeline.
  6. Ship fixtures and tests matching the harness conventions (adapter, locator, parser,
     readiness, summary equivalence, tail parity).
- Secondary goals: document the Muse storage layout and open questions for the v2
  (send/steer, durable runs) feature.
- Non-goals (explicitly out of scope for v1):
  - Steering a live session (`agent send`; socket vs `session-message` transport undecided).
  - Durable/headless runner on `muse exec` and resume wiring.
  - CLI start-pane wiring and MCP setup writer for Muse.
  - Rust `devkitd` mirror (moved INTO scope per user instruction; detection parity only —
  `canHandle` + `detect`, no history/conversation/status-config surfaces).
  - CLI `status`-command surfacing for Muse (skill-root map entry and readiness display;
    tracked separately even though harness-level readiness checks are in scope).

## User Stories & Use Cases

- As a developer running `muse`, I want `agent list` to show my live session so that I can
  supervise it alongside Claude/Codex sessions.
- As a developer, I want session history for Muse so that I can find and resume prior work
  with `muse resume <id>` round-tripping verbatim.
- As a developer, I want the last user prompt and conversation tail for a Muse session so
  that detail views and handoffs work like other harnesses.
- Edge cases: stale runtime file after process exit; PID reuse; `0600` runtime files;
  `subagent/` child sessions that must not double-count; huge transcripts (tail-only reads);
  sessions whose transcript dir has noise (`cli-*.log`, `cron.db`, `*.sqlite3`).

## Success Criteria

- `detectAgents` finds the live Muse session with exact pid, session id, and workspace root.
- `listSessions` enumerates archive sessions with strict cwd filtering; `findSessionsById`
  hits the runtime dir first and avoids full walks.
- `getConversation` returns user/assistant messages with `tail` reading proportional to the
  tail, not the file; first-user-message noise filtering matches harness conventions.
- Readiness reports pass/warn/fail for executable, config, auth, and built-in skills.
- New fixtures (`fixtures/harness/muse/`) and tests pass; `lint --feature muse-adapter` passes.
- No writes to Muse-owned directories except an explicit temp file if the `export` path is chosen.

## Constraints & Assumptions

- Technical constraints: read-only against Muse storage; tolerate `0700`/`0600` permissions;
  follow the `AgentAdapter` contract (`AGENT_TYPES`, `processNames`, `canHandle`,
  `detectAgents`, `getConversation`, `listSessions`, `findSessionsById`).
- Assumptions: session ids are UUID-shaped; `process_generation_hint` format is `pid=<n>`;
  transcript timestamps are microseconds (normalize to ms); framed log schema is stable and
  `muse schema` is its contract; `subagent/`, `approval-review/`, logs, and sqlite files are
  excluded from enumeration.
- Validation: repo's own vitest suites for the touched harness surface must pass in-session.

## Rollout

Additive only: a new optional harness. No existing adapter behavior changes except appending
`muse` to the shared `AGENT_TYPES` list. No migration, no config changes, no rollout risk
beyond the standard CI gate.

## Questions & Open Items

- Deferred to design spike: hand-written framed parser vs `muse export` JSON for
  `getConversation` (cost, latency, temp-file writes, sensitive reasoning payload).
- Deferred to v2: send transport (endpoint socket vs `session-message` CLI), exit-cleanup
  semantics of runtime files, and the source for running/waiting/idle status.
- Memory/task tracing CLIs are unusable in this environment (DB open failures); lifecycle
  continues without task logging.

---
phase: requirements
title: "Pi Adapter in @ai-devkit/agent-manager - Requirements"
feature: pi-adapter
description: Add a Pi adapter that detects running Pi sessions from local session files and tracker metadata
---

# Requirements: Add Pi Adapter to @ai-devkit/agent-manager

## Problem Statement

`@ai-devkit/agent-manager` supports multiple local AI agents through adapters, but Pi sessions are not surfaced by `agent list`, `agent detail`, or related flows. Pi persists local sessions under `~/.pi/agent/sessions`, and the companion extension `@ai-devkit/pi-session-tracker` can write `~/.pi/agent/sessions.json` to map running PIDs to exact session files.

Who is affected:
- Users running Pi who expect active sessions to appear alongside Claude, Codex, Gemini CLI, OpenCode, and Copilot.
- Maintainers adding adapter support who need Pi to follow existing agent-manager patterns.
- Users without the tracker extension, who still need a best-effort fallback instead of an empty result.

## Goals & Objectives

### Primary Goals
- Add `pi` as a first-class `AgentType`.
- Implement `PiAdapter` in `packages/agent-manager`.
- Detect running Pi processes and map them to session files.
- Prefer exact PID-to-session matching from `~/.pi/agent/sessions.json`.
- Fall back to legacy process/session matching when `sessions.json` is missing or unusable.
- Export and register the adapter so existing manager flows include Pi.

### Secondary Goals
- Reuse shared process, session, matching, and registry utilities.
- Parse Pi JSONL sessions enough to expose summary, timestamps, project path, conversation messages, and historical session summaries.
- Cover tracker matching, fallback matching, malformed data, and conversation extraction with unit tests.

### Non-Goals
- Implementing or installing `@ai-devkit/pi-session-tracker`.
- Changing Pi's session file format.
- Redesigning the agent list/detail/open UX.
- Removing existing legacy matching behavior for other adapters.

## User Stories & Use Cases

1. As a Pi user with `@ai-devkit/pi-session-tracker` installed, I want active Pi sessions to be matched by PID so the correct session is shown even when timestamp heuristics are ambiguous.
2. As a Pi user without the tracker file, I want `agent list` to fall back to existing matching heuristics so Pi still appears when session timing and CWD are enough.
3. As a user inspecting an agent, I want Pi conversation messages to be readable from the stored JSONL session.
4. As a maintainer, I want Pi support to reuse the adapter contract and exports used by the other adapters.

## Success Criteria

- `AgentType` includes `pi`.
- `PiAdapter` exists and implements `AgentAdapter`.
- `PiAdapter` is exported from adapter and package entry points.
- CLI and channel agent-manager wiring register `PiAdapter` with the existing adapters.
- When `~/.pi/agent/sessions.json` maps a running PID to a session path, `detectAgents()` returns the mapped session.
- When `sessions.json` is absent, `detectAgents()` uses session discovery plus shared legacy matching.
- Invalid or missing tracker/session files do not break other detection paths.
- `getConversation()` returns user and assistant messages from Pi JSONL entries.
- `listSessions()` returns historical Pi sessions and honors strict `cwd` filtering.
- Focused adapter tests and package tests pass.

## Constraints & Assumptions

### Technical Constraints
- Follow existing TypeScript, Nx, Vitest, and adapter conventions.
- Keep JSON/table output shape compatible with existing `AgentInfo`.
- Do not require tracker installation for fallback support.
- Isolate file parsing failures so one bad Pi session does not abort detection.

### Assumptions
- Pi process commands can be identified by executable/script tokens containing `pi`.
- Pi sessions live below `~/.pi/agent/sessions`.
- Project-scoped Pi sessions may live in encoded project directories such as `--Users-hoangnguyen-Codeaholicguy-Code-ai-devkit--`.
- Session filenames can include an ISO-like timestamp and UUID, for example `2026-06-10T08-58-20-754Z_019eb0c1-06d2-71ed-90ee-7acbf4b21c5b.jsonl`.
- `~/.pi/agent/sessions.json` is created by `@ai-devkit/pi-session-tracker` and maps PIDs directly to session file paths.
- `pi` is the public adapter type string.

## Questions & Open Items

- Resolved (2026-06-10): Public adapter type is `pi`.
- Resolved (2026-06-10): `sessions.json` is optional. Missing tracker metadata falls back to legacy matching.
- Resolved (2026-06-10): Tracker JSON schema is a plain PID-to-session-path map, for example `{ "12345": "/path/to/session.jsonl" }`.

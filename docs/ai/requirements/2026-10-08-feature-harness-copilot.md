---
phase: requirements
title: harness-copilot requirements
description: Port CopilotAdapter into devkit-harness (I5)
---

# I5: harness-copilot

Port `CopilotAdapter` (~760 LOC TS incl. parser/locator/mapper) into
`devkit-harness`, extending `ported` to
`["claude","codex","pi","gemini_cli","copilot"]`.

## In scope

- `canHandle`: `matchesExecutable(command, "copilot")` — argv0 basename
  `copilot`/`copilot.exe`; `processNames=["copilot"]` pool filter applies
  inside detect (`copilot-helper` argv0 never reaches canHandle)
- Locks: `~/.copilot/session-state/<sessionId>/inuse.<pid>.lock` —
  `scanLocks` enumerates session dirs whose mtime >= earliest unresolved
  process start − 5min slack (all dirs when any unresolved start is
  unknown); `knownLocks` per-(pid,startTime) cache re-validates with one
  stat, evicts on start-time change, remembers only unambiguous locks of
  procs with known start times
- `readSessionDirIncremental` cold-read: bounded head(1MiB)+tail(4MiB)
  fold of `events.jsonl` with `skip()` semantics, tentative last line
- `workspace.yaml` naive `key: scalar` fallback metadata (id/cwd/name/
  created_at/updated_at, quote stripping)
- Session gate: no parseable entries AND no workspace metadata → null
- Summary: firstUserMessage || lastText || workspace.name ||
  "Copilot session active", truncated 120
- Status: idle(5min) > waiting(lastEventType in assistant.message /
  assistant.turn_end / session.shutdown / abort) > running
- Wrapper fold: parent in the copilot pool sharing terminal suppressed;
  wrapper's own registry row (type=copilot) lends its name
- Process-only fallback: "Copilot process running"
- `sessionFilePath` always `<dir>/events.jsonl`, even when the file is
  absent (workspace-only sessions)

## Out of scope

- `getConversation`, `listSessions`, `findSessionsById`, `sessionStart`
  (only feeds toSessionSummary), `readiness.ts`.

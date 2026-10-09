---
phase: requirements
title: harness-opencode requirements
description: Port OpenCodeAdapter into devkit-harness (I7)
---

# I7: harness-opencode

Port `OpenCodeAdapter` (~500 LOC TS incl. parser/locator/mapper) into
`devkit-harness`, extending `ported` to
`["claude","codex","pi","gemini_cli","copilot","grok_cli","opencode"]`.

## In scope

- `canHandle`: `matchesExecutable(command, "opencode")` — argv0 basename
  `opencode`/`opencode.exe`; `processNames=["opencode"]` pool filter
  inside detect; pid dedupe first-wins
- `resolveDbPath`: `XDG_DATA_HOME` (empty string falls back, JS `||`) or
  `~/.local/share`, plus `opencode/opencode.db`; db opened readonly;
  missing/unopenable → every proc maps process-only
- `findSessionForDirectory`: newest `session` row for the proc's cwd
  (`WHERE directory = ? ORDER BY time_created DESC LIMIT 1`); no cwd or
  no row → process-only
- `getSessionStats` (single try/catch → EMPTY_STATS on any error):
  - last message by `time_created DESC` → `json_extract(data,'$.role')`
  - `lastTimeUpdated` = `MAX(time_updated)` over session messages,
    falling back to the last message's own `time_updated`, else 0
  - last assistant message → `time.completed`/`time.error` presence
    (SQL NULL = absent; `!= null` JS semantics)
  - first user `part` with `type='text'` joined on its message →
    `text.trim()` as summary; a non-string text value throws `.trim()`
    in JS → EMPTY_STATS
- `mapSessionToAgent`: name/projectPath from `session.directory ||
  proc.cwd`; `lastActive` = stats.lastTimeUpdated or session.timeCreated;
  summary default "OpenCode session active"; `sessionId` = row id;
  `sessionFilePath` = `<dbPath>::<sessionId>`
- `determineStatus`: idle(5min) > lastRole==="assistant" && !completed →
  running > lastRole==="assistant" → waiting > running;
  `lastAssistantErrored` is fetched but unused (mirrored)
- Process-only fallback: "OpenCode process running"
- No registry, no wrappers, no file trees — SQLite is the only store
- Bundle format: `sqlite` map — `{relpath: [sql statements]}` executed in
  order at materialization (binary dbs can't travel in `home`); capture
  dumps session/message/part DDL + rows reachable via captured proc cwds

## Out of scope

- `getConversation` (part-row transcript with verbose reasoning/tool
  parts, tail slicing), `listSessions`, `findSessionsById`,
  `decodeSessionRef` consumers — detection path only.

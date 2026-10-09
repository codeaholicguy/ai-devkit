---
phase: requirements
title: harness-grok requirements
description: Port GrokCliAdapter into devkit-harness (I6)
---

# I6: harness-grok

Port `GrokCliAdapter` (~590 LOC TS incl. parser/locator/mapper) into
`devkit-harness`, extending `ported` to
`["claude","codex","pi","gemini_cli","copilot","grok_cli"]`.

## In scope

- `canHandle`: `matchesExecutable(command, "grok")` — argv0 basename
  `grok`/`grok.exe`; `processNames=["grok"]` pool filter inside detect
- `~/.grok/active_sessions.json` (`GROK_HOME` env overrides `~/.grok`):
  `[{pid, cwd, opened_at}]` → pid→cwd map; only numeric pid + non-empty
  string cwd entries; proc cwd is the fallback, "" the final default
- `latestSessionDir(cwd)`: group dir `sessions/<encodeURIComponent(cwd)>/`
  must exist; among session subdirs the one whose `chat_history.jsonl`
  has the max mtime wins (strict `>`, readdir order for ties)
- `readSessionIncremental` cold read: bounded head+tail fold of
  chat_history.jsonl; missing transcript → no session; present-but-empty
  transcript still surfaces a session (mtime is `lastActive`)
- Records `{type, content}`: `user` records only count when the text wraps
  a real prompt in `<user_query>…</user_query>` (context injections
  skipped); `assistant` needs non-empty flattened text; `system` skipped
  (verbose=false); skip() keeps first prompt, clears last prompt/role
- Summary: `lastUserMessage || "Grok CLI session active"` (untruncated)
- Status: idle(5min) > lastRole==="assistant" (waiting) > running
- Process-only fallback: "Grok CLI process running" with the resolved cwd
  (active_sessions value, proc cwd, or "")
- `sessionId` = session dir basename; `sessionFilePath` = chat_history path
- No registry, no wrapper folding — Grok surfaces every claimed process
- Bundle format: `mtimes` map (epoch ms | "$NOW") so mtime-derived output
  (lastActive, latest-session pick) replays deterministically; live
  capture records real file mtimes alongside content

## Out of scope

- `getConversation`, `listSessions`/`findSessionsById` (historical group
  decode incl. `.cwd` files), `sessionStart`, summary cache incremental
  append path (cold bounded fold is output-identical).

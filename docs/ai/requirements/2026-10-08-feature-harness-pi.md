---
phase: requirements
title: harness-pi requirements
description: Port PiAdapter into devkit-harness (I3)
---

# I3: harness-pi

Port `PiAdapter` (~1.6k LOC TS) into `devkit-harness`, extending
`ported` to `["claude","codex","pi"]`.

## In scope

- `canHandle`: whitespace-token scan for a bare `pi`/`pi.js`/`pi.exe`
  executable token (command may be `node <path>/pi.js`, argv-mangled, etc.)
- Session tracker: `~/.pi/agent/sessions.json` pid(string)→session file
  path; only paths under the trusted sessions root
  `~/.pi/agent/sessions` are honored
- Registry fallback: `agents.db` rows (`type='pi'`, non-stale, session
  file must exist) — same `shared::registry_session_paths` readonly
  SQLite read introduced in I2
- Locator: scan per-project dirs
  `~/.pi/agent/sessions/<encoded-cwd>/*.jsonl` for each unmatched
  process; candidacy via file birthtime OR filename timestamp
  (`YYYY-MM-DDTHH-MM-SS-sssZ_*.jsonl`); final match is greedy by
  `|start − birthtime| ≤ 3min` with `resolvedCwd === proc.cwd`
- Parser: bounded head parse; first-entry metadata (sessionId, cwd)
  preserved; head/tail reduce to `{status, summary, lastActive}`;
  filename-derived session id fallback; unterminated final line handled
- Status: idle(>5min) > waiting(last entry assistant/finalized) > running
- Process-only fallback: "Pi process running"

## Out of scope

- Conversation detail (`getConversation`), `pi print` mode, TUI changes.

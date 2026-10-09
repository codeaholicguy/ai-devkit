---
phase: requirements
title: harness-gemini requirements
description: Port GeminiCliAdapter into devkit-harness (I4)
---

# I4: harness-gemini

Port `GeminiCliAdapter` (~1.1k LOC TS) into `devkit-harness`, extending
`ported` to `["claude","codex","pi","gemini_cli"]`.

## In scope

- `canHandle`: any whitespace token whose basename is
  `gemini`/`gemini.exe`/`gemini.js` (node-script distribution puts it in
  argv[1..]); the `processNames=["node"]` pool filter applies inside detect —
  a bare `gemini` argv0 proc is dropped before canHandle
- Registry cache: `agents.db` rows (`type='gemini_cli'`, non-empty
  sessionFilePath that parses), skipped for wrapper pids; wrapper's own
  registry row lends its `name` to the child's agent
- Locator: `~/.gemini/tmp/<shortId>/chats/session-*.{json,jsonl}` where
  `<shortId>` is `sha256(projectRoot)` (legacy hash dir) or a slug gated by
  a `.project_root` marker; candidate roots = every ancestor of each
  proc's cwd; mtime window = earliest start − tolerance − 2s slack;
  `session-*.json` shadowed by a same-name `.jsonl` is skipped
- Metadata: 8KiB head; `.jsonl` takes line 1 (regex-picked prefix when the
  line exceeds the head), `.json` parses the head, regex, then full file
- Parser: `.jsonl` log replay (`id` upserts, `$set` merges, `$rewindTo`
  truncates) and `.json` document; summary = last user text
  (displayContent > content, Part[] joined, truncate 120); status
  idle(5min) > waiting(gemini/assistant last) > running
- Wrappers: parent in same terminal folded into child (no own row)
- Dedup: one agent per session file/id, highest pid wins in place
- Process-only fallback: "Gemini CLI process running"
- Daemon sweep: `node`/`bun` runtime names added so node-script harnesses
  reach adapters; non-claimed runtime procs stay out of the visible pool
  (mirrors `isCandidateProcess`)

## Out of scope

- `getConversation`, `listSessions`/`findSessionsById`, TUI surfaces.

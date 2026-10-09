---
phase: requirements
title: harness-codex requirements
description: Port CodexAdapter into devkit-harness (I2)
---

# I2: harness-codex

Port `CodexAdapter` (~1.4k LOC TS) into `devkit-harness`, extending
`ported` to `["claude","codex"]`.

## In scope

- `canHandle`: `codex` executable minus helper subcommands (clap-accurate
  positional/flag parsing incl. variadic `-i/--image`, app-server-daemon path
  exclusion)
- Session mapping: `~/.codex/ai-devkit/sessions.json` pid→filePath, trusted
  under sessionsDir
- Registry cache: pid→sessionFilePath rows read from the shared
  `~/.ai-devkit/agents.db` (SQLite, readonly) — mirrors
  `mapRegistryCache`/`AgentRegistry.list()`; replay fixtures seed an
  isolated db so real registry state can't leak in
- Locator: resume (`resume <uuid>`), uuidv7→date-dir window, session_meta
  head parse (64KiB, truncated-JSON regex fallback), legacy greedy matching
  over day-dir session files, 30s negative cache for unmatched processes
- Parser: bounded head(1MiB)/tail(4MiB) cold scan; first line must be
  session_meta; lastEntryTimestamp/lastPayloadType normalized;
  summary = last displayable text (truncate 120)
- Status: idle(5min) > waiting(agent_message|task_complete|turn_aborted) > running
- Mapper + process-only fallback ("Codex process running")

## Out of scope

`getConversation`, `listSessions`, `findSessionsById`, `fileToSessionSummary`
(conversation mirror-dedup, tail reader) — conversation APIs stay TS.

## Success criteria

- Synthetic bundles replay byte-identical TS↔Rust
- Live `agent list` shows codex rows from the daemon
- Existing suites green

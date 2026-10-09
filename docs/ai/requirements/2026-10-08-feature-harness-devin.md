---
phase: requirements
title: harness-devin requirements
description: Port DevinAdapter into devkit-harness (I8)
---

# I8: harness-devin

Port `DevinAdapter` (~860 LOC TS incl. credentials/readiness) into
`devkit-harness`, extending `ported` to
`["claude","codex","pi","gemini_cli","copilot","grok_cli","opencode","devin"]`.

## In scope

- `canHandle`: argv0 `devin`/`devin.exe` AND `firstPositionalToken` is
  absent or not a utility subcommand (20 utilities incl. `list`, `ssh`,
  `doctor`; `acp` deliberately allowed); flag-value skipping for
  required (`--prompt-file`/`--config`/`--permission-mode`/`--model`)
  and optional (`-p`/`--print`/`--resume`/...) flags; `--flag=value`
  never skips the next token; `--` ends the scan
- `processNames=["devin"]` pool filter + first-wins pid dedupe
- `resolveDbPath`: `XDG_DATA_HOME` or `~/.local/share` +
  `devin/cli/sessions.db`; readonly open; missing → all process-only
  (locks still read)
- `session_locks/*.lock` next to the db: filename = session slug,
  body = `parseInt(trim)` holder pid (>0); holder must be a live
  canHandle'd devin proc; maps holder pid AND holder's ppid → slug;
  readdir order, later wins
- `isAcpBackendChild`: positional `acp` + ppid present + ppid in the
  deduped pool → proc skipped entirely (no agent row)
- Session resolution per proc: slug → `sessions.id` (`hidden = 0`);
  else cwd → newest `last_activity_at` row for `working_directory`
  (`hidden = 0`); slug hit-miss does NOT fall back to cwd
- `toDevinSession`: `created_at`/`last_activity_at` are epoch SECONDS →
  `* 1000`; `title` nullable
- `getSessionStats` (outer try/catch → EMPTY): frontier `chat_message`
  role (highest node_id), `MAX(created_at)*1000` heartbeat,
  `getLastUserPrompt` summary
- `userPrompt(DESC)`: `prompt_history` newest `is_shell=0` non-`/%`
  content trimmed (truncate 120); fallback `message_nodes` newest-8
  `role='user'` nodes → first parsed user msg with
  `metadata.is_user_input !== false` and non-empty string content
- `mapSessionToAgent`: name/projectPath `session.directory || proc.cwd`;
  lastActive = lastTimeUpdated or `lastActivityAt || timeCreated`;
  summary `stats.summary || title || "Devin session active"`;
  status idle(5min) > assistant→waiting > running;
  `sessionFilePath` = `<dbPath>::<sessionId>`
- Process-only: "Devin process running"
- Bundle: `sqlite` section (sessions/message_nodes/prompt_history);
  `session_locks` dir as `home` files (index-style — all locks read);
  bounded live dump = frontier + max-created + 8 user nodes + 1 prompt
  per session (exact reachability)

## Out of scope

- `getConversation` (node-dedupe transcript + verbose tool/thinking),
  `listSessions`/`findSessionsById`, `credentials.ts` (API key/org
  resolution for API calls), `readiness.ts`, `decodeDevinSessionRef`
  consumers.

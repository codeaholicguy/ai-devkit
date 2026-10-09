---
phase: requirements
title: harness-antigravity requirements
description: Port AntigravityCliAdapter into devkit-harness (I10)
---

# I10: harness-antigravity

Port `AntigravityCliAdapter` (487 LOC TS) into `devkit-harness`,
extending `ported` to `[..., "kiro", "antigravity_cli"]` — the final
harness in the epic.

## In scope

- `processNames=["agy"]`; `canHandle` = `matchesExecutable(command,"agy")`
  (argv0 basename `agy`/`agy.exe`)
- `baseDir` = `ANTIGRAVITY_CLI_HOME` env or `~/.gemini/antigravity-cli`;
  replay must pin/clear the env
- `cache/last_conversations.json` → `{ <cwd>: <conversationId> }`;
  non-object/array JSON → empty; empty keys, empty/non-string ids skipped
- `matchRunningProcesses`: one entry per process in process order,
  `cwd = proc.cwd || ""`, Map last-wins on duplicate cwd keys
- Transcript: `brain/<id>/.system_generated/logs/transcript.jsonl`;
  `stat` must succeed (a directory still counts — TS checks `!stat`,
  not `isFile`); unreadable → empty summary, session kept; missing →
  process-only
- Bounded JSONL fold (`fold_jsonl_bounded`): `created_at` keeps the
  MAXIMUM seen (not the last line); `skip()` keeps only firstUserMessage
- `recordToMessage` (non-verbose): `USER_INPUT` → user via
  `extractUserRequest` (`<USER_REQUEST>…</USER_REQUEST>` inner trim —
  may be `""`; unwrapped → whole trimmed text or null); non-empty
  `PLANNER_RESPONSE` → assistant; everything else → no role update
- `lastActive` = max `created_at` ?? transcript mtime
- Status: idle(5min) > lastRole assistant → waiting > running
- Summary: `lastUserMessage || "Antigravity CLI session active"` —
  NO truncate (unlike other adapters)
- name from registry cwd; sessionId = conversationId;
  sessionFilePath = transcript path; process-only "Antigravity CLI
  process running" with the cwd override
- Capture: `.gemini/antigravity-cli` referenced-only (brain tree is
  tens of MB); the index-dir rule moves to an explicit
  `HARNESS_INDEX_DIRS` set — behavior-preserving for all prior dirs

## Out of scope

- `getConversation` (USER_INPUT/PLANNER_RESPONSE/system verbose turns,
  tail), `listSessions`, `findSessionsById`, readiness/credentials.

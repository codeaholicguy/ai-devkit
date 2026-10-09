---
phase: requirements
title: harness-kiro requirements
description: Port KiroAdapter into devkit-harness (I9)
---

# I9: harness-kiro

Port `KiroAdapter` (696 LOC TS) into `devkit-harness`, extending `ported`
to `[..., "devin", "kiro"]`.

## In scope

- `canHandle` = `isKiroExecutable`: argv0 basename (backslash→'/',
  lowercase, `.exe`/`.js` stripped) is `kiro-cli`/`kiro`, OR argv0 is a
  script runtime (`node`/`bun`) whose first non-flag token resolves via
  `executablePath` to a `kiro-cli`/`kiro` basename
- `processNames` pool `["kiro-cli","kiro","kiro-cli-chat","node","bun"]`
  → `relevant` snapshot (helpers stay in — the ppid walk needs them);
  `processes` = canHandle'd, first-wins pid dedupe
- `~/.kiro/sessions/cli/<id>.lock` files (sorted readdir order): JSON
  `{pid}` — `toPid` accepts safe positive integers (numeric OR
  all-digits string); malformed JSON/non-object/bad pid skipped
- Lock → proc resolution: `findKiroAncestor` walks the holder's ppid
  chain through `relevant`; the outermost isKiro proc wins. Fallback
  `matchSoleProcessOnTty`: holder's tty (`?`/`??`/empty → none) matches
  exactly one proc in `processes`
- One proc may hold several locks → several agent rows; lock order =
  sorted readdir order; matched agents precede process-only rows
- `<id>.jsonl` must exist or the match is skipped (proc falls back to
  process-only); unreadable transcript → empty summary, session kept
- `<id>.json` metadata: `session_id`/`sessionId` (first non-empty
  string), `cwd` (`||` → proc cwd fallback), `title`,
  `created_at`/`createdAt`, `updated_at`/`updatedAt`
- Bounded JSONL fold (`fold_jsonl_bounded`): last event kind,
  `AssistantMessage && has toolUse` flag, first/last timestamps
  (`entry.timestamp` ISO string or `data.meta.timestamp` epoch s/ms),
  first/last non-empty Prompt text (skip() preserves head fields)
- `lastActive` = `updated_at` ?? last entry ts ?? transcript mtime
- Status: idle(5min) > `AssistantMessage && !toolUse` → waiting > running
- Summary: `lastUserMessage || title || "Kiro session active"`, trunc 120
- `sessionFilePath` = `<id>.jsonl` path; sessionId = metadata's (filename
  stem fallback); name from projectPath; process-only "Kiro process
  running"
- Fixture dirs: `.kiro/sessions/cli` index-style capture (locks + json +
  jsonl all read during detect)

## Out of scope

- `getConversation` (Prompt/Assistant/ToolResults messages, verbose,
  tail), `listSessions`, `findSessionsById`, readiness/credentials.

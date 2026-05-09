---
phase: design
title: System Design & Architecture
description: Design for `agent sessions` — list historical Claude/Codex/Gemini sessions
---

# System Design & Architecture

## Architecture Overview

The feature adds a new `agent sessions` subcommand to `packages/cli` that delegates to the existing `AgentManager` and the per-tool adapters in `packages/agent-manager`. Each adapter learns a new responsibility — enumerating on-disk sessions for its tool — alongside its existing "detect running agents" job.

**Layering rule**: the CLI is the source of truth for filter *defaults and semantics* (e.g. `cwd` defaults to `process.cwd()`, `--all` clears it, `--type` selects one tool). The CLI computes the values and passes them through `ListSessionsOptions`. The manager and adapters apply the filters they receive — they do not invent defaults or reinterpret user intent.

### Flow

1. **CLI parses flags** and computes:
   - cwd filter: `--all` → `undefined`; `--cwd <path>` → that path; neither → `process.cwd()`.
   - type filter: from `--type <name>` (or `undefined`).
   - limit: from `--limit <n>`, default `50`, `0` = unlimited. Applied post-merge in the CLI; not part of `ListSessionsOptions`.
   - output mode: `--json` vs table.
2. **CLI calls `AgentManager.listSessions({ cwd, type })`** with the computed options.
3. **`AgentManager`** fans out via `Promise.all` to every registered adapter, but skips adapters whose `type` doesn't match `opts.type` when set. Per-adapter exceptions are caught and logged to stderr; the listing continues. Results are merged and sorted by `lastActive` descending. Returned unfiltered beyond `cwd`/`type`.
4. **Each adapter applies `opts.cwd`** at the disk layer:
   - `ClaudeCodeAdapter` — always walks every `~/.claude/projects/*` subdir; parses each `*.jsonl` and filters by `session.lastCwd === opts.cwd` when set. (We can't shortcut by encoding `opts.cwd`: Claude Code stores files under the *launch* directory's encoded name, not the recorded `cwd` — they diverge in worktrees.)
   - `CodexAdapter` — walk every `~/.codex/sessions/YYYY/MM/DD/` dir, parse `session_meta` first line for cwd, keep matches if filter set.
   - `GeminiCliAdapter` — walk every `~/.gemini/tmp/<shortId>/chats/session-*.json`, use `directories[0]` as cwd, keep matches if filter set.
   - Each returns `SessionSummary[]`.
5. **CLI applies `--limit`** to the merged result (slice).
6. **Output**:
   - `--json` → `JSON.stringify(rows, null, 2)` with ISO date strings. `firstUserMessage` is the raw string (empty when there's no user message yet); machine consumers do their own placeholder if needed.
   - Default → `ui.table` with columns `Type | Session ID | CWD | First Message | Last Active`. The renderer truncates the first message to 80 chars and substitutes `"(no message yet)"` when `firstUserMessage` is empty.
7. **Empty-state**: if rows empty and neither `--all` nor `--cwd` was passed, print a one-line hint suggesting `--all`.

```mermaid
graph TD
  CLI[cli: agent sessions]
  CLI -->|computes opts| Opts[ListSessionsOptions cwd?, type?]
  Opts --> Manager[AgentManager.listSessions]
  Manager -->|filter adapters by opts.type| Dispatch{{matching adapters}}
  Dispatch --> Claude[ClaudeCodeAdapter.listSessions]
  Dispatch --> Codex[CodexAdapter.listSessions]
  Dispatch --> Gemini[GeminiCliAdapter.listSessions]
  Claude --> ClaudeFiles[(~/.claude/projects/&lt;encoded-cwd&gt;/*.jsonl)]
  Codex --> CodexFiles[(~/.codex/sessions/YYYY/MM/DD/*.jsonl)]
  Gemini --> GeminiFiles[(~/.gemini/tmp/&lt;shortId&gt;/chats/session-*.json)]
  Claude -->|SessionSummary[]| Manager
  Codex -->|SessionSummary[]| Manager
  Gemini -->|SessionSummary[]| Manager
  Manager -->|merged + sorted| CLI
  CLI -->|apply --limit, render placeholder| Out{{Table or JSON}}
```

### Key components and responsibilities

- **`packages/cli/src/commands/agent.ts`** — registers the `agent sessions` subcommand; handles flag parsing, table rendering, and JSON output.
- **`packages/agent-manager/src/AgentManager.ts`** — gains a `listSessions(opts)` method that fans out to every registered adapter and merges results.
- **`packages/agent-manager/src/adapters/AgentAdapter.ts`** — adds a `listSessions(opts)` method to the interface.
- **`packages/agent-manager/src/adapters/{ClaudeCodeAdapter,CodexAdapter,GeminiCliAdapter}.ts`** — each implements `listSessions` by walking its tool's session directory layout and reusing its existing parser to extract metadata.
- **`packages/agent-manager/src/utils/ClaudeSessionParser.ts`** — extended to also capture `firstUserMessage` during its existing single-pass iteration (cheap addition).

### Technology stack

- Node 20+, TypeScript, `commander`, `chalk`, `inquirer` — all already in the repo.
- Reuses `ui.table` from `packages/cli/src/util/terminal-ui` and `withErrorHandler`.
- No new runtime dependencies.

## Data Models

### `SessionSummary` (new, exported from `agent-manager`)

```ts
export interface SessionSummary {
  /** Tool that produced this session */
  type: AgentType;                  // 'claude' | 'codex' | 'gemini_cli'
  /**
   * ID accepted by the tool's resume command. Adapters MUST pass this
   * through verbatim — no normalization, no encoding/decoding — so it
   * round-trips into `claude --resume <id>` (and equivalents) unmodified.
   */
  sessionId: string;
  /** Working directory the session was started in (best-known value) */
  cwd: string;
  /**
   * Trimmed first user message; empty string if none. Adapters reuse the
   * same noise-filter their existing parsers already apply (skip
   * tool_result blocks, request-interruption notices, system-injected
   * skill content). The CLI table renderer substitutes a placeholder for
   * empty values; JSON output keeps the empty string raw.
   */
  firstUserMessage: string;
  /** Last activity timestamp (from session content; falls back to file mtime) */
  lastActive: Date;
  /** Session start time (from file content; falls back to file birthtime/mtime) */
  startedAt: Date;
  /** Absolute path to the session file on disk (debug/diagnostics) */
  sessionFilePath: string;
}
```

### `ListSessionsOptions`

```ts
export interface ListSessionsOptions {
  /**
   * Filter to sessions whose recorded cwd matches this path using strict
   * equality (no prefix/ancestor matching in v1). Undefined = no cwd filter.
   */
  cwd?: string;
  /**
   * Filter to a single tool. Enforced by `AgentManager.listSessions`, which
   * skips adapters whose `type` doesn't match. Adapters MAY ignore this
   * field — by the time their `listSessions` runs, the type filter is
   * already satisfied. Undefined = include every registered adapter.
   */
  type?: AgentType;
}
```

`--limit` is intentionally not in `ListSessionsOptions`. The CLI applies it post-merge to preserve global top-K correctness; pushing a per-adapter cap into the options would still require the same CLI-side re-cap, so it adds contract complexity (mtime-sort assumption) without removing the post-merge slice.

### Per-tool extensions

- `ClaudeSession` (in `ClaudeSessionParser.ts`) gains `firstUserMessage?: string`. Captured during the same line iteration that already walks the JSONL, reusing the existing `extractUserMessageText` noise filter (skips tool_result blocks, `[Request interrupted]` notices, expanded skill markers, etc.).
- `CodexAdapter.listSessions` parses inline (does not reuse `parseSession`, which extracts the *last* message for live status). It walks events in order and grabs the first `payload.type === 'user_message'` with non-empty `payload.message`.
- `GeminiCliAdapter.listSessions` reuses the adapter's existing `messageText` helper (already used by `getConversation`) to extract content, and walks the messages array forward to grab the first `type === 'user'` entry.

### Shared file-system helpers

`packages/agent-manager/src/utils/session.ts` exports three small fs wrappers used by the new `listSessions` paths in all three adapters:

- `isDirectory(p)` — `fs.statSync(p).isDirectory()` with try/catch.
- `safeReaddir(dir)` — `fs.readdirSync(dir)` with try/catch returning `[]`.
- `listJsonl(dir)` — `safeReaddir` filtered to `*.jsonl`.

Factored out after the initial adapter implementations had drifted into duplicated copies of the same try/catch boilerplate.

## API Design

### Internal: `AgentAdapter`

```ts
export interface AgentAdapter {
  // ...existing members
  listSessions(opts?: ListSessionsOptions): Promise<SessionSummary[]>;
}
```

### Internal: `AgentManager`

```ts
class AgentManager {
  // ...existing members
  async listSessions(opts?: ListSessionsOptions): Promise<SessionSummary[]>;
}
```

`AgentManager.listSessions` runs every registered adapter via `Promise.all`, but skips adapters whose `type` doesn't match `opts.type` when set. Concatenates results, drops adapters that throw (with a stderr warning), and sorts by `lastActive` descending.

### CLI surface

```
ai-devkit agent sessions [options]

Options:
  --all                 Include sessions from every cwd (default: only current cwd)
  --cwd <path>          Override the cwd filter (implies non-default scope)
  --type <type>         Filter to one of: claude, codex, gemini_cli
  --limit <n>           Max rows to print (default: 50; 0 = no limit)
  -j, --json            Emit JSON array instead of a table
```

Default table columns:

| Type | Session ID | CWD | First Message | Last Active |

`--json` returns an array of `SessionSummary` with ISO date strings.

## Component Breakdown

### Per-tool listing strategy (v1: reuse existing parsers)

**Claude Code (`ClaudeCodeAdapter.listSessions`)**

- Always walk every subdir of `~/.claude/projects/`. We can't take an encoded-dir shortcut for the cwd-scoped path because Claude Code indexes session files by the *launch* directory's encoded name, while the recorded `cwd` field inside the session can change (e.g. when the user `cd`'s into a worktree). The two diverge in real-world setups.
- For each `*.jsonl` file, call `ClaudeSessionParser.readSession(filePath, decodedDirAsFallback)` (extended to also return `firstUserMessage`). The decoded dir name is best-effort (`-` → `/`, lossy for paths containing `-`); session content's `lastCwd` overrides it when present.
- Drop sessions whose JSONL had no parseable conversation entries (guards against garbage files).
- If `opts.cwd` is set, drop sessions where the resolved cwd doesn't match (strict equality).
- Map to `SessionSummary`.

**Codex (`CodexAdapter.listSessions`)**

- Walk every `YYYY/MM/DD` date dir under `~/.codex/sessions/`.
- For each file, parse the first line (`session_meta`) to read `payload.cwd`. If `opts.cwd` is set, drop non-matches without further parsing.
- For each kept file, run the existing `parseSession` flow, augmented to also record the first `user_message` payload.
- Map to `SessionSummary`.

**Gemini CLI (`GeminiCliAdapter.listSessions`)**

- Walk every `~/.gemini/tmp/<shortId>/chats/session-*.json`.
- For each file, `JSON.parse` it and take `directories[0]` as cwd. If `opts.cwd` is set, drop non-matches.
- Augment the existing `parseSession` to also capture the first `user`-typed message text.
- Map to `SessionSummary`.

### CLI flow

See the **Flow** subsection in *Architecture Overview* above. In short: CLI computes `cwd` and `type` from flags, calls `AgentManager.listSessions({ cwd, type })`, applies `--limit` to the returned list, then renders as table or JSON.

## Design Decisions

### Why extend the adapter interface (vs. a standalone scanner)

Each adapter already encodes the on-disk path layout and parser quirks for its tool. Putting `listSessions` on the same interface keeps tool-specific knowledge in one place and makes adding a new CLI (e.g. Cursor, Aider) a one-stop change.

### Why reuse the existing parsers in v1

The user explicitly chose "reuse whatever's in agent-manager first". The existing parsers do a single full read per file, which is good enough for typical session counts. We avoid premature optimization (streaming JSON, on-disk index) and leave a clear extension point.

### Why current-cwd default

It's the dominant use case ("resume something I was working on here") and matches the answer to the clarifying question. `--all` and `--cwd <path>` cover the alternatives without overloading the default.

### Why a separate subcommand instead of `agent list --history`

`agent list` is built around live processes (PID, terminal focus, send-message). Mixing historical sessions into it would either silently drop those columns for history rows or pollute the live view. A new `sessions` subcommand keeps each command focused.

### Alternatives considered

- **Persistent on-disk index** — fastest on repeated runs, but adds cache invalidation, schema migration, and disk state. Deferred until measured perf demands it.
- **Streaming line reads** — modest speedup on huge files, more code. Deferred; revisit if profiling shows full-file reads dominating.
- **Standalone `SessionLister` class** — reasonable, but duplicates path-encoding logic that already lives in adapters.

## Non-Functional Requirements

### Performance

- Target: <2s for ~200 sessions in default-cwd scope on a developer laptop. Treated as a guideline; concrete budget set after a measured baseline.
- Adapter scans run in parallel via `Promise.all`.
- File parsing within an adapter is sequential in v1 (synchronous fs calls match existing code style); a `Promise.all` over file reads is a low-effort follow-up if needed.
- ClaudeCodeAdapter always reads every JSONL in `~/.claude/projects/**` (even with `opts.cwd` set), because the worktree case requires reading session content to authoritatively resolve cwd. If this grows expensive, the next step is to cap by mtime first (fast `stat`), then read full content only for the top-N.
- CodexAdapter walks every `YYYY/MM/DD` dir under `~/.codex/sessions/`. No date-window pre-filter in v1; revisit if measured.

### Security

- Read-only on user-owned files in `$HOME`. No network calls.
- `--cwd <path>` is used as a filter value only, never executed or interpolated into shell.
- JSON output of session content is bounded to the first user message, so we don't dump full conversations to a pipe by accident.

### Reliability

- Per-file failures (malformed JSON, permission denied, partial writes) are skipped with a one-line stderr note; they never fail the whole listing.
- Adapter-level failures are caught in `AgentManager.listSessions` so one broken tool doesn't hide the others.

### Compatibility

- Existing `agent list / open / send / detail` commands are unchanged. New code paths are additive.
- `AgentAdapter.listSessions` is a new required method; all three in-tree adapters implement it. The interface change is internal to the repo.

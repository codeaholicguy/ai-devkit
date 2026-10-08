---
phase: design
title: Design — harness-claude (I1)
description: Rust port of ClaudeCodeAdapter detect path + process enrichment
---

# Design — harness-claude (I1)

## Parts

### 1. Process enrichment (devkit-core::discover)

`AgentProc` gains `start_time_ms: Option<i64>`. New
`enrich_agents(procs: &mut Vec<AgentProc>)`:
- cwds: `lsof -a -d cwd -Fn -p <pids>` batch (macOS+Linux); `/proc/<pid>/cwd`
  readlink stays the Linux fast path — lsof output already covers both.
- startTimes: `ps -o pid=,lstart= -p <pids>` batch; parse
  `Dow Mon DD HH:MM:SS YYYY` via a small hand parser (no chrono dep — fixed
  format); cached per (pid,ppid,command) across sweeps like the TS version.

`apply_sweep` calls `sweep()` → `enrich_agents()` → enricher + snapshot.

### 2. devkit-harness layout

```
src/
  lib.rs        — trait/Registry (existing) + SweepContext { processes, now, home }
  shared.rs     — generateAgentName kebab, MATCH_TOLERANCE_MS=180_000,
                  greedy cwd+birthtime match, processOnly fallback builder
  claude.rs     — ClaudeAdapter { projects_dir, sessions_dir }
  claude/       — locator.rs, parser.rs
```

### 3. Locator (locator.rs)

Mirrors `ClaudeSessionLocator.matchRunningProcesses`:
1. resume: `--resume <uuid36>` regex on command → `<projects>/<enc(cwd)>/<sid>.jsonl` exists
2. pid-file: `<sessions>/<pid>.json` parses; skip if |procStart−startedAt|>60s;
   `<projects>/<enc(entry.cwd)>/<entry.sessionId>.jsonl` must exist
3. legacy: for each unique proc.cwd the encoded projects dir must exist;
   list `*.jsonl` + `created()` birthtime; greedy 1:1 by |start−birthtime|,
   cwd equality, ≤3min tolerance, sorted by delta asc.
`enc(cwd)`: `[^a-zA-Z0-9]` → `-`.

### 4. Parser (parser.rs)

`read_session(path) -> Option<SessionSummary>` replicating
`IncrementalJsonlSummary` cold-start exactly:
- size ≤ head+tail (1MiB+4MiB): fold all lines
- else: fold lines starting in `[0, 1MiB)`, `skip()`, fold lines starting in
  `[size−4MiB, size)`
- reduce per entry: first line → sessionStart (timestamp ||
  snapshot.timestamp); any `timestamp` → lastActive; `cwd` → lastCwd;
  type ∈ {user,assistant,system,progress,thinking} → lastEntryType;
  user → isInterrupted from content blocks + user text extraction
  (command-message, `ARGUMENTS:` for skill expansion, noise filter:
  `[Request interrupted`, `Tool loaded.`, `This session is being continued`)
- status: user→interrupted?waiting:running; progress/thinking→running;
  assistant→waiting; system→idle; none→unknown

### 5. Mapper + adapter (claude.rs)

status = pidStatus ?? JSONL status; summary = lastUserMessage ||
"Session started" (+ " — waiting for X" when waiting); name =
kebab(basename(cwd))-pid; projectPath = resolvedCwd || proc.cwd;
unmatched → process-only `{name, "claude", "running",
"Claude Code process running", pid, projectPath=cwd, sessionId=pid-<n>,
lastActive=now}`.

### 6. Client merge (agent-manager)

`listAgents`: try `enrichedAgents()`; for `ported` types take daemon rows
(convert wire→AgentInfo: lastActive → Date); local adapters run only for
unported types. Any RPC failure → all-local. Registry merge/sort unchanged.

### Fixture consumption

`devkit-harness` test helper: `fixtures.rs` loads
`fixtures/harness/<type>/*.json`, materializes tmp HOME, runs adapter,
compares expected. Synthetic bundles authored in-repo; the gitignored live
bundle (`fixtures/harness/claude/live.json`) is consumed when present.

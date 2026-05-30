---
phase: implementation
title: Implementation Guide
description: Technical implementation notes, patterns, and code guidelines
---

# Implementation Guide

## Development Setup

- tmux must be installed and on `PATH` (`brew install tmux` / `apt install tmux`).
- `pgrep` must be on `PATH` (default everywhere except minimal containers — see `procps-ng` on Alpine).
- Repo install: `npm install` at the monorepo root; nx wires the two affected packages (`packages/agent-manager`, `packages/cli`).
- Run the local CLI: `cd packages/cli && npm run dev -- agent start --type claude`.

## Code Structure

```
packages/agent-manager/src/
  utils/AgentRegistry.ts      ← new: JSON file at ~/.ai-devkit/agents.json
  utils/agents.ts             ← new: AGENTS registry { command, matches }
  terminal/TmuxManager.ts     ← new: tmux wrapper + findAgentPid BFS
  AgentManager.ts             ← modified: optional AgentRegistry, name overlay, registry-first resolve
  index.ts                    ← modified: export new modules + types

packages/cli/src/
  commands/agent.ts                  ← modified: `agent start` subcommand (parse, validate, format)
  services/agent/agent.service.ts    ← modified: + `startAgent` orchestration + typed errors
```

## Implementation Notes

### `AgentRegistry` (`utils/AgentRegistry.ts`)
- Plain JSON file at `~/.ai-devkit/agents.json`, schema `{ entries: RegistryEntry[] }`.
- Atomic writes: `writeFileSync(tmp)` then `renameSync(tmp, target)`. `mkdirSync(dir, { recursive: true })` on every write — cheap and idempotent.
- `readFile` is tolerant: malformed JSON or non-array `entries` returns `{ entries: [] }`. No crash on corrupt state.
- `isAlive` is just `process.kill(pid, 0)` — no `startedAt` cross-check (the original `lstart`/`etimes` cross-check was removed after the macOS timezone bug; see planning doc).
- `static default()` returns a module-level singleton at the default path; tests inject a custom path via the constructor.

### `TmuxManager` (`terminal/TmuxManager.ts`)
- Thin wrapper around `child_process.execFile` (promisified). No shell interpolation — all args passed as an array.
- `findAgentPid` BFS:
  1. Read pane PID via `tmux list-panes -t <session> -F '#{pane_pid}'`.
  2. Walk descendants with `pgrep -P <pid>`.
  3. For each non-root node, run `ps -p <pid> -o command=` and call `matches(command)`.
  4. Track the **deepest** matching node. Return it after BFS exhausts the tree.
- Returns `null` when no descendant matches yet — caller polls (5s / 500ms).
- `TmuxManager` has no agent-type knowledge; the matcher comes from `AGENTS[type].matches`.

### `AGENTS` registry (`utils/agents.ts`)
- One `{ command, matches }` per `StartableAgentType` (= `AgentType` minus `'other'`).
- `matchArgv0(name)` — basename of the first whitespace-delimited token. Works for npm bin shims where the shim execs into node with the binary name preserved (claude, codex, opencode).
- `matchAnyToken(name)` — basename of any token. Needed for gemini, which ships as a Node script: `ps` shows `node /opt/homebrew/bin/gemini ...`, so the real binary basename is in `argv[1]`, not `argv[0]`.

### `AgentManager` changes (`AgentManager.ts`)
- Constructor now takes an optional `AgentRegistry`, defaulting to `AgentRegistry.default()`. Lets tests inject a stub and ensures the CLI uses one shared instance via `createAgentManager()`.
- `listAgents()`: after aggregating adapter results, for each agent whose `pid` matches a registry entry, overwrite `agent.name` with the registry name. Registry is **not** pruned on read — that runs opportunistically in `agent start`.
- `resolveAgent(input, agents)`: registry-first lookup (by exact name match), then falls through to the existing exact / substring matching on `AgentInfo.name`.

### `agent start` CLI (`commands/agent.ts`)
The handler is a thin shell: parse options, default name if `--name` omitted, validate input format (type ∈ `AGENTS`, name matches `NAME_REGEX`, cwd exists), then delegate to the service. Typed errors from the service are mapped to `ui.error(...)` + `process.exit(1)`. Success prints name, type, PID, cwd, and the `tmux attach` hint.

### `startAgent` service (`services/agent/agent.service.ts`)
Orchestration lives here so it's unit-testable independent of the CLI:
1. `tmux.isAvailable()` — throws `TmuxUnavailableError`.
2. `registry.prune()` then `registry.lookup(name)` — throws `AgentNameInUseError(name, pid)` if live.
3. `tmux.sessionExists(name)` — if true, fire `onWarning(...)` and `tmux.killSession(name)` to replace the orphan.
4. `tmux.createSession(name, cwd)` → `tmux.sendKeys(name, agent.command)`.
5. Poll `tmux.findAgentPid(name, agent.matches)` every 500ms for up to 5s.
6. On success: `registry.register({ name, pid, type, tmuxSession: name, cwd, startedAt })`, return the entry.
7. On timeout: `tmux.killSession(name)`, throw `AgentPidPollTimeoutError(name, command, timeoutMs)`.

Lives in the same file as `waitForAgentResponse` because both are orchestration-of-tmux/registry/adapter primitives for the `agent ...` subcommands.

## Integration Points

- `AgentRegistry.default()` is the single source of truth across the process. `createAgentManager()` passes it to `AgentManager`, and `agent start` reads/writes it directly.
- Existing adapters (`ClaudeCodeAdapter`, `CodexAdapter`, `GeminiCliAdapter`, `OpenCodeAdapter`) are **unchanged**. The registry is a pure overlay.
- `@ai-devkit/agent-manager` exports the new public surface from `src/index.ts`: `AgentRegistry`, `TmuxManager`, `AGENTS`, `AgentConfig`, `StartableAgentType`, `RegistryEntry`.

## Error Handling

- All CLI failures use `ui.error(...)` + `process.exit(1)` to match the surrounding command style.
- tmux subprocess failures are normalized: `isAvailable`/`sessionExists` return booleans; `killSession` swallows "already gone" errors; `findAgentPid` returns `null` rather than throwing so the poll loop can retry.
- Registry I/O failures (missing file, bad JSON) degrade silently to an empty registry — the agent flow does not depend on stored state to succeed.
- No retries for tmux commands; a transient tmux failure surfaces as an `agent start` failure with the original tmux error chained.

## Performance Considerations

- `findAgentPid` is the hot path during the 5s startup poll. Each BFS visit runs two subprocesses (`pgrep`, `ps`). Typical trees are 1–3 nodes, so total cost per poll is ~10–30ms.
- An earlier optimization tried a single-`ps`-snapshot strategy and 200ms polling; it didn't improve real-world wall time (the agent process simply isn't there sooner) and was reverted.
- Registry reads parse a small JSON file; writes are atomic. No concurrency control by design — see "race window" in the design doc.

## Security Notes

- No shell interpolation: every tmux/ps/pgrep call uses `execFile` with an args array; user input never reaches a shell.
- `--type` is allowlisted against `AGENTS` keys before any subprocess runs.
- `--name` is regex-validated (`/^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$/`) so it's safe as a tmux session name and a filename fragment.
- `--cwd` is `path.resolve`-d and `fs.existsSync`-checked before use.
- The registry file lives in the user's home directory; no secrets are written — only `name`, `type`, `pid`, `tmuxSession`, `cwd`, `startedAt`.

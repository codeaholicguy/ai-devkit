---
phase: planning
title: Project Planning & Task Breakdown
description: Break down work into actionable tasks and estimate timeline
---

# Project Planning & Task Breakdown

## Milestones

- [x] M1: AgentRegistry and TmuxManager implemented and unit-tested
- [x] M2: `agent start` CLI subcommand working end-to-end
- [x] M3: `agent list` and `agent send` surface registry names correctly

## Task Breakdown

### Phase 1: Foundation

- [x] T1.1: Implement `AgentRegistry` (`packages/agent-manager/src/utils/AgentRegistry.ts`)
  - Read/write `~/.ai-devkit/agents.json` atomically
  - `register`, `lookup`, `list`, `prune`
  - `isAlive`: `kill(pid, 0)`
  - Create parent directory if absent

- [x] T1.2: Implement `TmuxManager` (`packages/agent-manager/src/terminal/TmuxManager.ts`)
  - `isAvailable()`: `tmux -V` check
  - `sessionExists(name)`: `tmux has-session -t <name>`
  - `createSession(name, cwd)`: `tmux new-session -d -s <name> -c <cwd>`
  - `sendKeys(session, keys)`: `tmux send-keys -t <name> "<keys>" Enter`
  - `findAgentPid(session, matches)`: BFS the process tree, return the deepest descendant whose `ps` command line is accepted by the caller-supplied `matches` predicate
  - `killSession(name)` for cleanup on poll timeout

- [x] T1.3: Add `AGENTS` registry (`packages/agent-manager/src/utils/agents.ts`)
  - Per-agent `{ command, matches }` config for the four startable types
  - `matchArgv0` helper for claude/codex/opencode (npm bin shims)
  - `matchAnyToken` helper for gemini_cli (Node-script distribution: real binary basename lives in argv[1..])

- [x] T1.4: Export `AgentRegistry`, `TmuxManager`, `AGENTS`, and supporting types from `packages/agent-manager/src/index.ts`

### Phase 2: Core Feature

- [x] T2.1: Add `agent start` subcommand to `packages/cli/src/commands/agent.ts`
  - Options: `--type` (required, one of `AGENTS` keys: `claude` | `codex` | `gemini_cli` | `opencode`), `--name` (optional, validated; default: `{folder}-{timestamp}`), `--cwd` (optional, defaults to `process.cwd()`)
  - Validate: tmux available, `--cwd` exists, name format, name not already in registry with live PID
  - Resolve `agent = AGENTS[type]` for both launch command and process matcher
  - Create tmux session via `TmuxManager`
  - Send `agent.command` via `TmuxManager.sendKeys`
  - Poll (up to 5s, 500ms interval) via `TmuxManager.findAgentPid(name, agent.matches)`
  - Register entry via `AgentRegistry`
  - Print success output with attach command

- [x] T2.2: Modify `AgentManager.listAgents()` to apply registry name overlay
  - Instantiate `AgentRegistry`, call `prune()`, then for each `AgentInfo` match by PID → override `name`
  - `AgentManager` constructor accepts optional `AgentRegistry` (defaults to singleton)

- [x] T2.3: Modify `AgentManager.resolveAgent()` for registry-first lookup
  - If `registry.lookup(input)` finds an entry whose PID is in the agent list, return that agent
  - Otherwise fall through to existing exact/partial name match

### Phase 3: Integration & Polish

- [x] T3.1: Validate `--name` format in CLI (`/^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$/`)
  - Reject uppercase, special chars, too-short/long names with a clear error message

- [x] T3.2: Handle edge cases in `agent start`
  - tmux session name collision (session exists but PID is dead → prune + warn + continue)
  - `--cwd` path that does not exist → exit with error before touching tmux
  - Agent binary not found inside tmux → PID poll times out → clean up tmux session + error

- [x] T3.3: Update `createAgentManager()` CLI helper to pass a shared `AgentRegistry` instance to `AgentManager`

## Dependencies

- T1.1 must complete before T2.1, T2.2, T2.3
- T1.2 must complete before T2.1
- T1.3 (AGENTS registry) must complete before T2.1
- T1.4 (exports) must complete before T2.1 (CLI imports from agent-manager)
- T2.1, T2.2, T2.3 can be developed in parallel after Phase 1
- T3.x depend on T2.x being in place

## Timeline & Estimates

| Task | Estimate |
|---|---|
| T1.1 AgentRegistry | 2h |
| T1.2 TmuxManager | 2h |
| T1.3 AGENTS registry | 30m |
| T1.4 Exports | 15m |
| T2.1 agent start subcommand | 3h |
| T2.2 listAgents overlay | 1h |
| T2.3 resolveAgent registry-first | 1h |
| T3.1 name validation | 30m |
| T3.2 edge cases | 1.5h |
| T3.3 createAgentManager wiring | 30m |
| **Total** | **~12.5h** |

## Risks & Mitigation

| Risk | Likelihood | Mitigation |
|---|---|---|
| `findAgentPid` BFS may pick a transient subprocess | Low | Per-agent matcher in `AGENTS` filters to processes whose `ps` command matches the expected binary; deepest-match rule preserved |
| tmux session name already used by unrelated session | Low | `sessionExists` check + clear error |
| Registry PID collision (OS reuses PID) | Low | Acceptable for v1: `isAlive` uses `kill(pid, 0)` only. A reused PID belonging to another process would falsely look alive until the user notices; recovery is `tmux kill-session` + `agent start` again |
| Agent binary not in tmux PATH | Low | Timeout + cleanup + error with hint to check PATH |

## Resources Needed

- No new npm dependencies
- tmux must be installed on the developer's machine for manual testing

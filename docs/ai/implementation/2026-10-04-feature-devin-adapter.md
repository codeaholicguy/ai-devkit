---
phase: implementation
title: "Devin Adapter - Implementation Notes"
feature: devin-adapter
description: What shipped for the Devin harness adapter, decisions, and deviations
---

# Implementation: Devin Adapter

## Files added

- `packages/agent-manager/src/harnesses/devin/DevinAdapter.ts` — process filter (utility-subcommand rejection, `--` prompt stop), `detectAgents` with acp-child dedupe + lock-first/cwd-fallback session resolution, `getConversation`, `listSessions`, `findSessionsById`, DB lifecycle cleanup.
- `packages/agent-manager/src/harnesses/devin/DevinSessionLocator.ts` — db/locks-dir resolution (XDG-aware, locks dir derived from db path), readonly cached `better-sqlite3` handle, `listActiveLocks`, `findSessionById`, `findSessionForDirectory` (hidden=0, last_activity_at DESC), `listSessions`, `findSessionsById`, `dbPath::slug` ref encoding.
- `packages/agent-manager/src/harnesses/devin/DevinSessionParser.ts` — flat `message_nodes` scan with `message_id` revision dedupe, role mapping (system skipped, non-input/empty user skipped, tool/thinking verbose-only), SQL-bounded `tail` (×8 overfetch) + `sliceTail`, `getSessionStats` (frontier role, MAX(created_at), summary from `prompt_history` → fallback first `is_user_input` node), `getFirstUserMessage`.
- `packages/agent-manager/src/harnesses/devin/DevinAgentMapper.ts` — `AgentInfo` mapping: WAITING on assistant frontier, RUNNING otherwise, IDLE via `isIdle`; summary falls back to `sessions.title`.
- `packages/agent-manager/src/harnesses/devin/readiness.ts` — `devin auth status` probe (`Logged in` → authenticated), `configDir: ".config/devin"`.
- `packages/agent-manager/src/__tests__/harnesses/devin/` — fixtures (`writeDatabase`, `writeLocks`) + 4 suites, 27 tests.

## Registration edits

- `adapters/AgentAdapter.ts`: `"devin"` appended to `AGENT_TYPES`.
- `harnesses/index.ts`: `new DevinAdapter()` appended.
- `harnesses/runtimeProfiles.ts`: `devin: profile("devin", matchArgv0("devin"))` → `agent start devin` works.
- `harnesses/readiness/AgentReadiness.ts`: `devin: devinReadiness`.
- `cli/src/commands/agent.ts`: `TYPE_LABELS.devin = "Devin"` (Record exhaustiveness — compile-forced), `agent sessions` help text.
- `cli/src/services/status/status.service.ts`: `devin` skill root `.config/devin/skills` via `getGlobalSkillPath("devin")` (env.ts already defined it).
- Test fixtures updated for the new type: readiness report keys, `STATUS_SKILL_ROOTS`, StartAgentPane order/cycling, sessions `--type` list.

## Verified storage facts (Devin 3000.11.3)

- All `sessions.db` timestamps are unix **seconds** (not ms); `lastActivityAt`/`timeCreated` are `×1000` on read.
- `session_locks/<slug>.lock` contains the `devin acp` backend PID — confirmed live (pid 51418 holds `brawny-shirt.lock` under TUI 51387).
- `main_chain_id` = head node of the active chain; per-turn fresh roots make flat-scan the correct conversation reconstruction.
- Sibling nodes share `message_id` (streaming revisions) — dedupe keeps highest `node_id`.
- `metadata.is_user_input === false` marks user-role wrappers; `prompt_history.is_shell = 1` marks `!` commands.

## Deviations from design doc

1. Locks dir resolved as `dirname(dbPath)/session_locks` (`defaultLocksDir`) instead of a separate XDG resolver — keeps injected test fixtures consistent; production paths identical.
2. Summary falls back to `sessions.title` before the generic placeholder (Devin auto-titles sessions — useful signal).
3. `getConversation` verbose emits `[tool: name]` calls AND `[tool: name] <output>` result lines; `thinking` emitted before the assistant text it belongs to.
4. `agent start devin` enabled by the runtime profile as a side effect of registration — desired, kept.
5. `getSessionStats().summary` uses the **last** user prompt; `SessionSummary.firstUserMessage` uses the **first** — both delegate to a shared private `userPrompt(direction)` (`prompt_history`, skipping `is_shell` and `/` slash commands, fallback `is_user_input` node scan, truncated to `SUMMARY_MAX_LENGTH`). The first draft used the first prompt for the working-on column — corrected to match `AgentInfo.summary`'s "last user prompt" contract and the Claude/Codex/Pi `lastUserMessage` convention.

## Decisions confirmed during implementation

- Stale locks (pid missing or pid reused by non-devin process) are ignored; process falls through to cwd match or process-only — covered by tests.
- `devin acp` dedupe uses `ppid ∈ matched devin pids` — snapshot always populates `ppid`.
- `canHandle` stops tokenizing at `--` so `devin -- list ...` (prompt, not subcommand) stays an agent.

## Evidence

- `npm test --workspace=@ai-devkit/agent-manager`: 1294 passed (85 files).
- `npm test` (workspace, 6 projects): all green incl. cli 1241.
- `npm run build`: clean (6 projects, tsc + swc).
- Live: `agent list` shows `ai-devkit-51387 Devin Waiting "hello"`; `agent sessions --type devin` lists `brawny-shirt`; `agent detail` renders 58 messages.

## Follow-ups (future features)

- `agent send`/durable via `devin acp` ACP stdio; verify whether `devin -p` takes a session lock.
- ATIF transcript fallback parser if `message_nodes` schema drifts.
- Devin Cloud sessions, capacity probing, abandoned-branch pruning in `getConversation`.

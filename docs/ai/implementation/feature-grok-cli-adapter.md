---
phase: implementation
title: "Grok Build CLI Adapter in @ai-devkit/agent-manager - Implementation"
feature: grok-cli-adapter
description: Implementation notes for the Grok CLI detection adapter, launch map entry, and CLI wiring
---

# Implementation Guide: Grok Build CLI Adapter in @ai-devkit/agent-manager

## Development Setup

- Branch: `feat/grok-cli-support`
- Install dependencies with `npm install` (a fresh install leaves sibling `dist/` stale, so build before running `cli` tests).
- Build + lint + test:
  - `npx nx run agent-manager:build`
  - `npx nx run agent-manager:test`
  - `npx nx run cli:test`
  - `npx nx run-many -t build test lint`
- For end-to-end verification: `grok` installed via `https://x.ai/cli/install.sh` (verified against `grok 0.2.77`), plus `tmux` for the managed-start path.

## Code Structure

- Adapter + agent type + launch map:
  - `packages/agent-manager/src/adapters/GrokCliAdapter.ts` (self-contained; parsing inline)
  - `packages/agent-manager/src/adapters/AgentAdapter.ts` (`AgentType` += `'grok_cli'`)
  - `packages/agent-manager/src/utils/agents.ts` (`AGENTS.grok_cli`, `StartableAgentType`)
- Package exports: `packages/agent-manager/src/adapters/index.ts`, `packages/agent-manager/src/index.ts`
- CLI wiring:
  - `packages/cli/src/commands/agent.ts` (register adapter, `TYPE_LABELS`, `--type` help)
  - `packages/cli/src/services/channel/channel-runner.ts` (register adapter)
  - `packages/cli/src/util/sessions.ts` (`VALID_AGENT_TYPES`)
- Tests: `packages/agent-manager/src/__tests__/adapters/GrokCliAdapter.test.ts`, `__tests__/utils/agents.test.ts`, plus asserted-array updates in `cli` (`StartAgentPane`, `sessions`, `agent`, `channel`).
- Docs: `README.md` (Remote-control matrix row).

## Implementation Notes

### Core Features
- Adapter contract: `type = 'grok_cli'`, plus `canHandle`, `detectAgents`, `getConversation`, `listSessions`.
- Process detection: `listAgentProcesses('grok')` matches the native binary's `argv[0]` basename `grok`/`grok.exe`; `AGENTS` matcher is `matchArgv0('grok')` (not Gemini's `matchAnyToken`).
- Session location: `~/.grok/sessions/<encodeURIComponent(cwd)>/<session-id>/` (override base via `GROK_HOME`). A live process is resolved to its cwd via `~/.grok/active_sessions.json` (`{ pid, cwd, opened_at }[]`); the process cwd is only a fallback. Per cwd the most recently active session dir (newest `chat_history.jsonl` mtime) is used.
- Inline parsing: `chat_history.jsonl` → one `{ type, content }` record per line; user prompts are the text inside `<user_query>...</user_query>` (other user records are context injections and skipped); assistant turns are the `type:'assistant'` text; verbose adds `type:'system'`. `sessionId` is the dir name; `lastActive` is the file mtime.
- `AgentInfo.sessionFilePath` / `SessionSummary.sessionFilePath` point at `chat_history.jsonl` so the console's `fs.stat().mtime` cache invalidation tracks conversation growth; `getConversation` accepts the file path or the session directory.

### Patterns & Best Practices
- Resolve cwd from `active_sessions.json` (cwd encoded in the session path), but keep parsing **inline** like the other recent adapters (Gemini/Codex/Copilot/Pi) — "đừng custom quá nhiều".
- Fail soft: a missing/malformed `chat_history.jsonl` skips the session; adapter-level failures return empty so other adapters still render.

## Integration Points

- `AgentManager` parallel aggregation across Claude + Codex + Gemini + Grok.
- `agent start` / console start-pane / `agent.service` launch are data-driven from `AGENTS`, so the `grok_cli` entry wires them automatically.
- CLI list/json/sessions output mapping unchanged.

## Error Handling

- Missing `~/.grok/sessions` → empty result, no throw.
- Missing/malformed `chat_history.jsonl` → session skipped.
- A live `grok` process with no matched session → surfaced as a process-only RUNNING agent.
- Long-path session group dirs → original path read from the `.cwd` file; `active_sessions.json` cwd is authoritative for live processes.

## Out of Scope (follow-up PRs)

- The Grok **setup environment** (`env.ts`/`types.ts`, `.grok/skills`) — separate PR, mirroring how Pi's environment landed after its adapter PR.
- Console label maps (`agentTypeLabel.ts`); web docs; README-zh; channel-connector hook forwarding.

## Implementation Status

- Completed: adapter (inline parsing), agent type, launch map, package exports, CLI registration (both sites), labels, validation, README matrix row, docs.
- Commands verified:
  - `npx nx run-many -t build test lint` ✅
  - `npx nx run agent-manager:test` ✅ · `npx nx run cli:test` ✅
  - Parser logic validated against a real on-disk `grok 0.2.77` session.
  - End-to-end via the built CLI: `agent start --type grok_cli` (tmux) → `agent list` shows the running agent; `agent sessions --type grok_cli` lists the real on-disk session.

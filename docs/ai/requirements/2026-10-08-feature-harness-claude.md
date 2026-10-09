---
phase: requirements
title: Requirements — harness-claude (I1)
description: Port ClaudeCodeAdapter detection into devkit-harness with fixture parity
---

# Requirements — harness-claude (I1)

Epic: `../planning/2026-10-08-epic-harness-port.md`. First real adapter port.

## Problem Statement

`detectAgents` for claude (process→session attribution, transcript-derived
status/summary) runs per-CLI-invocation in TS. Port it into `devkitd` so
`agent.list` serves claude agents; client consumes them for `claude`
and falls back to local adapters for all other types.

## Goals

- Port the full detect path: `findHarnessProcesses` semantics, three-stage
  locator (resume / PID-file / legacy cwd+birthtime greedy match),
  head+tail JSONL summary with skip semantics, mapper
  (pidStatus ?? JSONL status, summary, name, projectPath).
- Extend daemon discovery to enrich agent pids with `cwd` (lsof batch on
  macOS, /proc on Linux) and `start_time_ms` (`ps lstart` batch) — required
  inputs for matching.
- `agent.list` returns real claude agents.
- AgentManager consumes `agent.list` when the daemon answers, local
  adapters otherwise — parity verified by fixtures.
- Synthetic committed fixture cases + the local live bundle must replay
  byte-identical through the Rust adapter.

## Non-goals

- `getConversation`, `listSessions`, `findSessionsById` (TS-only still).
- Incremental parse caching (cold-start semantics suffice; perf check at
  cutover).
- `readiness.ts`, `credentials.ts` — not on the detect path.

## Success Criteria

- Synthetic fixtures cover: resume match, pid-file match (+stale rejection),
  legacy greedy match, process-only fallback, each status mapping
  (running/waiting/idle/unknown + interrupted), first-vs-last user message,
  noise-message filtering, command-message extraction.
- Rust adapter output == TS expected on every committed bundle AND on the
  local live bundle.
- `ai-devkit agent list` output for claude agents identical daemon-path vs
  local-path.
- All existing suites green; cargo suite green.

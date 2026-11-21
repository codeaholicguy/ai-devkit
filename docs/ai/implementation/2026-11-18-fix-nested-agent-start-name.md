---
phase: implementation
title: Implementation — #402 nested agent start name
---

# Implementation — #402

## Root cause

`agent start` local fallback wrote the registry under the caller's `$HOME`. Nested sandboxes override `$HOME` or overlay writes, so devkitd and normal clients never saw the registration and synthesized `{folder}-{pid}` instead.

## Fix

- `packages/agent-manager/src/utils/homeScope.ts` — passwd-home vs `$HOME` comparison and store probe.
- `ManagedAgentRuntime.startAgent` — refuse divergent HOME when account store exists; round-trip registry write.
- `packages/daemon-client/src/autostart.ts` — refuse twin daemon spawn when HOME diverges and the account `.ai-devkit` store exists; `DEVKITD_BIN` hermetic callers (e2e) are exempt.
- `AgentManager.listAgents` — `unregistered:` prefix for unclaimed synthesized names.
- CLI `start.command.ts` — surface `AgentHomeDivergenceError`.
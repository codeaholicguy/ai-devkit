---
phase: implementation
title: Agent Send Command - Implementation
description: Implementation notes for the agent send feature
---

# Agent Send Command - Implementation

## Key Files

| File | Purpose |
|------|---------|
| `packages/agent-manager/src/terminal/TtyWriter.ts` | Core TTY write module |
| `packages/agent-manager/src/terminal/index.ts` | Export TtyWriter |
| `packages/agent-manager/src/index.ts` | Package export |
| `packages/cli/src/commands/agent.ts` | CLI `agent send` subcommand |

## Implementation Notes

- `TtyWriter.send()` uses `fs.promises.writeFile` to write to `/dev/${tty}`
- Agent resolution reuses existing `AgentManager.resolveAgent()` method
- TTY lookup reuses existing `getProcessTty()` from `utils/process.ts`
- Error handling follows existing patterns in `agent open` command

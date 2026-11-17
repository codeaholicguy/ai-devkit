---
name: agent-communication
description: AI DevKit · Exchange information with active Codex, Claude Code, and other AI agents using ai-devkit agent list, detail, and send. Use when an agent needs to find another active agent, read its recent context, send it information, or request information back.
---

# Agent Communication

Use `ai-devkit agent ...` to discover and communicate with active agents. If `ai-devkit` is not on PATH, use `npx ai-devkit@latest agent ...`.

## Commands

```bash
ai-devkit agent list --json
ai-devkit agent detail --id <agent-name> --json --tail 20
ai-devkit agent send --id <agent-name> "<message>"
ai-devkit agent send --id <agent-name> --wait --timeout 120000 --json "<message>"
<command> 2>&1 | ai-devkit agent send --id <agent-name> --stdin
```

## Notes

- `list --json` returns active agents with fields such as `name`, `type`, `status`, `summary`, `projectPath`, and `lastActive`.
- Use the `name` from `list --json` as `--id`. Partial matches are supported, but exact names are safer.
- Use `detail --json --tail <n>` to read recent context from an agent before deciding what to send.
- `send --wait` waits for a reply; add `--json` when the response should be machine-readable.
- `send --stdin` forwards piped command output or larger text.

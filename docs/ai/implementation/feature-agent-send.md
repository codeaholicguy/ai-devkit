---
phase: implementation
title: Agent Send Command - Implementation
description: Implementation notes for the agent send feature
---

# Agent Send Command - Implementation

## Key Files

| File | Purpose |
|------|---------|
| `packages/agent-manager/src/terminal/TtyWriter.ts` | Terminal-native input sender (tmux/iTerm2/Terminal.app) |
| `packages/agent-manager/src/terminal/index.ts` | Export TtyWriter |
| `packages/agent-manager/src/index.ts` | Package export |
| `packages/cli/src/commands/agent.ts` | CLI `agent send` subcommand |
| `packages/cli/src/__tests__/commands/agent.test.ts` | CLI command coverage, including stdin prompt input |

## Implementation Notes

- **Why not direct TTY write**: Writing to `/dev/ttysXXX` outputs to the terminal display, NOT to process input. Terminal emulators own the master side of the PTY — only they can inject keyboard input.
- **tmux**: `tmux send-keys -t <identifier> "message" Enter` — standard tmux API
- **iTerm2**: AppleScript `write text "message"` — auto-appends newline
- **Terminal.app**: System Events `keystroke "message"` + `key code 36` (Return). NOT `do script` which runs a shell command. Requires briefly focusing the Terminal.app window.
- **Security**: All subprocesses use `execFile` (no shell), preventing injection from message content (single quotes, backticks, etc.). AppleScript strings escaped for `\` and `"`.
- Agent resolution reuses existing `AgentManager.resolveAgent()` method
- Terminal detection reuses existing `TerminalFocusManager.findTerminal()` from the `agent open` command
- `agent send [message] --id <identifier> [--stdin]` resolves the prompt before agent lookup so invalid prompt-source combinations fail before any terminal delivery.
- `--stdin` reads the full stdin stream as UTF-8 and preserves embedded and trailing newlines.
- If no message argument is provided and stdin is not a TTY, stdin is read implicitly for pipeline ergonomics.
- A message argument combined with `--stdin` is rejected to avoid ambiguous prompt sources.

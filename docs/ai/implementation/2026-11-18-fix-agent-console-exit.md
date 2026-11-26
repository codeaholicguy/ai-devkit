# Implementation: agent console exit (#295)

## Changes

- `packages/cli/src/tui/console/runAgentConsole.ts` — lifecycle owner for Ink console sessions.
- `packages/cli/src/commands/agent/console.command.ts` — uses `runAgentConsoleInk`.
- `packages/cli/tests/tui/console/runAgentConsole.test.ts` — regression tests.

## Decisions

- Keep `exitOnCtrlC: false` so pane-level Ctrl-C cancel behavior in `ConsoleApp` is unchanged (#337).
- Force `process.exit` after teardown so leaked stdin/TTY refs cannot pin the event loop (#295).
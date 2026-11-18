# Plan: fix agent console exit (#295)

- [x] Add `runAgentConsole.ts` lifecycle wrapper with signal handlers, watchdog, stdin release.
- [x] Wire `console.command.ts` through the wrapper.
- [x] Unit tests in `packages/cli/tests/tui/console/runAgentConsole.test.ts`.
- [x] Manual PTY smoke (Ctrl-C, `q`, `SIGTERM`, `SIGHUP`).
# Testing: agent console exit (#295)

## Automated

```bash
cd packages/cli && npx vitest run tests/tui/console/runAgentConsole.test.ts
```

Covers `exitCodeForSignal`, `releaseConsoleStdin`, watchdog timing, normal Ink exit, and signal-driven unmount.

## Manual (PTY)

Python `pty.fork()` harness against built `packages/cli/dist/cli.js`:

- 20× random-delay Ctrl-C: 20/20 clean `exit 0` (Linux agent environment).
- 90s idle + `q`: clean exit.
- `SIGTERM`/`SIGHUP` after 2s: process exits with codes 143/129 (not hang).
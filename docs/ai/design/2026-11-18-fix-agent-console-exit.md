# Design: agent console lifecycle wrapper

## Root cause

The command only awaited Ink `waitUntilExit()` with `exitOnCtrlC: false` (so the TUI can cancel panes on Ctrl-C). There were no CLI-level signal handlers or forced process exit. When Ink teardown stalled or libuv kept TTY handles referenced after unmount, the Node event loop stayed alive and the process ignored further signals.

## Approach

Add `runAgentConsoleInk()` beside the console TUI:

1. Register `SIGINT`/`SIGTERM`/`SIGHUP` → `unmount()` + bounded `waitUntilExit()`.
2. Arm a 2s watchdog during signal teardown; call `process.exit` if Ink does not settle.
3. `releaseConsoleStdin()` disables raw mode, pauses, and unrefs stdin before exit.
4. Normal `q`/Ctrl-C path still resolves `waitUntilExit()`; then `process.exit(0)`.

`console.command.ts` delegates to this wrapper instead of calling `render()` + `waitUntilExit()` directly.
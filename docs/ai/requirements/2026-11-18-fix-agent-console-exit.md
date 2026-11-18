# Requirements: fix agent console exit (#295)

## Problem

`ai-devkit agent console` can ignore Ctrl-C after running for a while, leak `/dev/tty` handles, and keep ~3–4% CPU until `SIGKILL`. `SIGTERM`/`SIGHUP` are not handled gracefully while Ink is active.

## Acceptance criteria

- Ctrl-C and `q` exit within 2s with terminal state restored.
- `SIGTERM`, `SIGINT`, and `SIGHUP` unmount Ink and exit within 2s with conventional exit codes.
- After Ink unmount, the process must not rely on the event loop draining (`process.exit` guard).
- Regression tests cover signal mapping, stdin release, watchdog timeout, and normal Ink exit.
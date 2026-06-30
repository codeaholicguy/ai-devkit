---
phase: implementation
title: Implementation Guide
description: Technical implementation notes, patterns, and code guidelines
---

# Implementation Guide — WezTerm support

## Development Setup
**How do we get started?**

- Work in worktree `feature-wezterm-support`; `npm ci` at the repo root.
- Run agent-manager tests: `npx vitest run` in `packages/agent-manager`.
- WezTerm is **not** required to develop/CI this: all control paths go through
  `execFile` and are covered by mocked unit tests.

## Code Structure
**How is the code organized?**

- `packages/agent-manager/src/terminal/`
  - `TerminalFocusManager.ts` — discovery + focus (one method pair per emulator).
  - `TtyWriter.ts` — input dispatch (one sender per emulator).
  - `index.ts` — re-exports (`TerminalType` already exported; no change needed).
- No CLI changes: `agent open`, `agent send`, and channel bridges consume the
  abstract `findTerminal` / `focusTerminal` / `TtyWriter.send` API only.

## Implementation Notes
**Key technical details to remember:**

### Discovery (`TerminalFocusManager.findWeztermPane`)
- `execFile('wezterm', ['cli', 'list', '--format', 'json'])`.
- Parse JSON; match the entry whose **`tty_name`** equals `/dev/<agent-tty>`;
  use `pane_id` as `identifier`. Only `tty_name` and `pane_id` are read; extra
  fields are
  ignored for forward-compat.
- `try/catch` swallows ENOENT (binary missing), non-running mux, and malformed
  JSON → returns `null`, identical to the tmux probe's failure handling.
- Probe order in `findTerminal`: tmux → **WezTerm** → iTerm2 → Terminal.app.
  tmux wins when nested inside WezTerm; WezTerm is tried before the macOS-only
  AppleScript probes so non-macOS hosts short-circuit cleanly.

### Focus (`TerminalFocusManager.focusWeztermPane`)
- `execFile('wezterm', ['cli', 'activate-pane', '--pane-id', identifier])`.
- Returns `true` on zero exit, `false` (no throw) on any error.

### Send (`TtyWriter.sendViaWezterm`)
- Two explicit `wezterm cli send-text --pane-id <id>` calls, 150 ms apart:
  - Step 1 (text): `['cli', 'send-text', '--pane-id', paneId]` with the message
    body written to stdin, keeping prompt contents out of local process
    listings.
  - Step 2 (Enter): `['cli', 'send-text', '--pane-id', paneId, '--no-paste',
    '\x0d']`, where the argv element `'\x0d'` is the JS string holding the
    single carriage-return byte (0x0d). The equivalent shell command is
    `wezterm cli send-text --pane-id <id> --no-paste $'\x0d'` (note the
    dollar-single-quoted `$'\x0d'`), and `--no-paste` delivers the CR
    literally rather than wrapped in paste brackets.
- Same two-step text+Enter convention as tmux/iTerm2/Terminal.app so a
  bracketed-paste-aware TUI still sees Enter as a submit.

### Patterns & Best Practices
- Shell injection safety without a shell: all wezterm control is via
  `execFile('wezterm', [...argv])`, which spawns the process directly. The
  message is written through stdin, so shell metacharacters are delivered as
  data without exposing prompt text through argv.
- No AppleScript: WezTerm is cross-platform; the CLI is the single integration.

### Debug trace (`agent open --debug`)
- `TerminalFocusManager` takes an optional `debug?: (message: string) => void`
  callback in its constructor. When set, `findTerminal`/`focusTerminal` emit one
  human-readable line per step (pid/tty, each emulator probe's match/no-match,
  focus result).
- The `agent open --debug` command wires this to the existing
  `ai-devkit:terminal` debug logger (`createLogger('terminal')` + `enableDebug()`),
  reusing the repo's `--debug` convention used by `agent start`/`channel`.

## Integration Points
**How do pieces connect?**

- Public surface added: `TerminalType.WEZTERM = 'wezterm'` (new enum member) and
  the existing `TerminalLocation` shape (identifier = pane id).
- Consumers (`packages/cli` `agent.ts`, `agent.service.ts`, `channel-runner.ts`)
  are unchanged; they pick up WezTerm automatically through the abstract API.

## Error Handling
**How do we handle failures?**

- Discovery: missing/failed WezTerm → `null` → UNKNOWN fallback → CLI reports it
  cannot focus, exactly like any other unrecognized emulator.
- Focus: errors → `false` (graceful).
- Send: errors → thrown with context (consistent with the other senders).

## Performance Considerations
**How do we keep it fast?**

- One extra short-lived `wezterm cli list` subprocess only when tmux didn't
  match. `findTerminal` is called once per `agent open`/`send`.

## Security Notes
**What security measures are in place?**

- No shell; `paneId` originates from WezTerm's own JSON (numeric) and the
  message is written to `send-text` through stdin, so prompt text is not exposed
  through process arguments and shell metacharacters remain data.

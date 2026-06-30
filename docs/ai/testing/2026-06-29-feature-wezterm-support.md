---
phase: testing
title: Testing Strategy
description: Define testing approach, test cases, and quality assurance
---

# Testing Strategy

## Test Coverage Goals
**What level of testing do we aim for?**

- 100% of new/changed lines in `TerminalFocusManager.ts` and `TtyWriter.ts`.
- Existing emulator behavior covered by unchanged tests (regression).
- No integration/e2e required: WezTerm cannot be installed in CI; control is
  via `execFile`, which is already mocked by the existing terminal tests.

## Unit Tests
**What individual components need testing?**

### TerminalFocusManager (discovery + focus)
- [x] `findTerminal` returns a `WEZTERM` location when `wezterm cli list
      --format json` contains an entry whose `tty_name` matches the agent TTY,
      and `pane_id` is used as `identifier`.
- [x] `findTerminal` returns `null` when `wezterm` is not installed (ENOENT).
- [x] `findTerminal` returns `null` when the JSON has no matching TTY.
- [x] `findTerminal` returns `null` on malformed JSON (does not throw).
- [x] tmux still wins when both tmux and WezTerm could match (precedence).
- [x] WezTerm is tried before iTerm2/Terminal.app (macOS probes not run when
      WezTerm matches — assert osascript is not invoked).
- [x] `focusTerminal` returns `true` when `wezterm cli activate-pane --pane-id`
      exits zero.
- [x] `focusTerminal` returns `false` (no throw) on focus failure.
- [x] `findTerminal` emits the matching decision path (pid/tty, per-probe
      match/no-match) via the debug logger.
- [x] `focusTerminal` emits the focus decision path (target + result) via the
      debug logger.

### TtyWriter (send)
- [x] `send` for a `WEZTERM` location makes two explicit `wezterm cli
      send-text --pane-id <id>` calls: (1) the message body written through
      stdin, then (2) a single carriage return byte (0x0d) as an argv element
      with `--no-paste` (shell equivalent: `wezterm cli send-text --pane-id
      <id> --no-paste $'\x0d'`), ~150 ms apart.
- [x] The message — including shell metacharacters / newlines — is written
      verbatim through stdin and not exposed as a process argument.
- [x] The Enter byte is exactly char code 0x0d (carriage return), not 0x0a.
- [x] First call uses the pane id from `location.identifier`.
- [x] Throws a descriptive error when the text send fails (non-zero exit).
- [x] Unsupported types still throw the existing "unsupported terminal type".

## Integration Tests
**How do we test component interactions?**

- Not required. The CLI (`agent open`/`send`, channel bridge) only calls the
  abstract API; adding a `WEZTERM` branch is fully covered by the unit tests.

## End-to-End Tests
**What user flows need validation?**

- Manual only (real WezTerm): `ai-devkit agent open`/`send` against a pane.
  Documented under limitations; cannot run in CI without WezTerm installed.

## Test Data
**What data do we use for testing?**

- Mocked `execFile` (already the pattern in `__tests__/terminal/`).
- Sample `wezterm cli list --format json` payload fixture with `tty_name` + `pane_id`.
- Sample agent TTY `/dev/ttys000` / `/dev/pts/0`.

## Test Reporting & Coverage
**How do we verify and communicate test results?**

- `npm test` in `packages/agent-manager` (vitest).
- `npm run test -- --coverage` to confirm new branches hit.

## Manual Testing
**What requires human validation?**

- On a host with WezTerm: `agent open <name>` focuses the pane; `agent send
  "hi" --id <name>` types and submits.

## Performance Testing
**How do we validate performance?**

- N/A; one extra short-lived subprocess only on WezTerm hosts.

## Bug Tracking
**How do we manage issues?**

- Standard repo issues; limitations recorded in requirements + this doc.

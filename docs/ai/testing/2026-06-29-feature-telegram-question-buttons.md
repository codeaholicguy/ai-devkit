---
phase: testing
title: Testing Strategy
description: Define testing approach, test cases, and quality assurance
---

# Testing Strategy

## Test Coverage Goals

- 100% line coverage on new code in `ask-user-question.ts`, the new `TelegramAdapter` methods, and `TtyWriter.sendKey`.
- All callback paths exercised (option tap, stale, chatId mismatch, malformed data, out-of-range index).
- Fallback path exercised for every rejected shape (multi-question, malformed).
- Multi-select is rendered with a Skip-only keyboard + chat-reply hint.

## Unit Tests

### `parseAskUserQuestionInput` (ask-user-question.test.ts)
- [x] Parses a single-select single-question payload.
- [x] Parses multi-select payloads with `multiSelect: true` carried on the spec.
- [x] Rejects multi-question payloads (`questions.length !== 1`) → returns null.
- [x] Returns null when `questions` is missing.
- [x] Returns null when an option has no `label`.
- [x] Returns null when `options` is empty.

### `escapeHtml`
- [x] Escapes `<`, `>`, `&`, `"`.

### `formatAskUserQuestionBody`
- [x] Includes header, question, and numbered options with descriptions.
- [x] Omits header line when undefined.
- [x] Adds reply-in-chat hint for multi-select.
- [x] HTML-escapes user-controlled fields (`question`, `header`, `label`, `description`).

### `buildKeyboard`
- [x] Single-select: one numbered button per option plus a final Skip row.
- [x] Multi-select: Skip-only keyboard (no numbered option rows).
- [x] Every `callback_data` ≤64 bytes.

### `AskUserQuestionService`
- [x] Sends digit key `String(optionIdx + 1)` when option is tapped.
- [x] Sends Esc byte `\x1b` with "Skipped" toast when Skip is tapped.
- [x] Removes the keyboard after the tap (calls `editInlineKeyboard(..., null)`).
- [x] Shows toast with the chosen `label`.
- [x] Returns `false` on malformed payload (caller falls back to plain text).
- [x] Handles multi-select payload by rendering a Skip-only keyboard.
- [x] Returns `false` on multi-question payload.
- [x] Shows "Question expired" toast on unknown `questionId`.
- [x] Ignores callback with mismatched `chatId`.
- [x] Ignores callbacks with malformed `callback_data`.
- [x] Ignores callbacks with out-of-range option index.

### `TelegramAdapter` (TelegramAdapter.test.ts)
- [x] `sendInlineKeyboard` sends with `parse_mode: HTML` + `inline_keyboard`, returns `message_id`.
- [x] `editInlineKeyboard` replaces the keyboard on an existing message.
- [x] `editInlineKeyboard(..., null)` removes the keyboard (undefined `reply_markup`).
- [x] `answerCallback` forwards id + optional text to telegraf.
- [x] `onCallback` invokes registered handler with a normalized `IncomingCallback`.
- [x] `onCallback` acks callbacks when no handler is registered.
- [x] `onCallback` acks with "Error" toast when handler rejects.

### `TtyWriter.sendKey` (TtyWriter.test.ts)
- [x] tmux: invokes `tmux send-keys -t <id> <key>` directly (no paste buffer, no auto-Enter).
- [x] tmux: passes through named keys (e.g. `Enter`).
- [x] tmux: translates the Esc byte (`\x1b`) to the named `Escape` key.
- [x] WezTerm: invokes `wezterm cli send-text --pane-id <id> --no-paste <key>`.
- [x] iTerm2: focuses the target session via AppleScript, then `keystroke "<key>"`.
- [x] iTerm2: translates Esc byte to AppleScript `key code 53`.
- [x] iTerm2: throws when session not found.
- [x] Terminal.app: focuses the target tab via AppleScript, then `keystroke "<key>"`.
- [x] Terminal.app: translates Esc byte to AppleScript `key code 53`.
- [x] Terminal.app: throws when tab not found.
- [x] Unsupported terminal type throws.

### channel-runner integration
- [x] Routes a single-select payload to `AskUserQuestionService.tryHandle` and the adapter receives a `sendInlineKeyboard` call with numbered option buttons + Skip row.
- [x] Routes a multi-select payload with a Skip-only keyboard and the multi-select hint in the body.
- [x] Falls back to plain `[Question]` text for malformed payloads.
- [x] Non-AskUserQuestion `[Tool prompt]` formatting byte-identical to existing test.

## Integration Tests

- [x] End-to-end via `startOutputPolling` + mocked `TelegramAdapter`: write an `AskUserQuestion` agent-request to JSONL → adapter receives `sendInlineKeyboard` call.

## End-to-End Tests

Out of scope for this feature (would require a live Telegram bot + a real terminal with Accessibility permissions). Manual smoke test only.

## Test Data

- Fixtures inline in each test file. The original `singleSelectInput` shape is preserved in `channel-runner.test.ts`.

## Test Reporting & Coverage

- Command: `npm test` (runs vitest across all 5 workspace projects).
- Latest run: 1,525 tests pass; exit 0.

## Manual Testing

- [ ] Live Telegram smoke: configure a real bot, trigger a single-select `AskUserQuestion`, tap a button, agent's picker selects and proceeds.
- [ ] Live Telegram smoke: trigger a multi-select payload — bridge renders Skip-only keyboard + reply-in-chat hint; typed free-text reaches the agent.
- [ ] Live Telegram smoke: tap Skip on any keyboard — picker is dismissed (Esc).
- [ ] Live Telegram smoke: trigger a multi-question payload — bridge falls back to plain `[Question]` text; user types a free-text reply.
- [ ] Live Telegram smoke: stale callback after bridge restart shows "Question expired".

## Performance Testing

N/A — callback rate is human-paced.

## Bug Tracking

Standard repo issue tracker.

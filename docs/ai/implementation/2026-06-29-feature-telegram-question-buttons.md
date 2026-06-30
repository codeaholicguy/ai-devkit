---
phase: implementation
title: Implementation Guide
description: What was actually built for telegram-question-buttons
---

# Implementation Guide

## Files Changed

- `packages/channel-connector/src/types.ts` — added `InlineKeyboardButton`, `InlineKeyboard`, `IncomingCallback`, `CallbackHandler`.
- `packages/channel-connector/src/index.ts` — re-exported the new types.
- `packages/channel-connector/src/adapters/TelegramAdapter.ts` — added `sendInlineKeyboard`, `editInlineKeyboard`, `answerCallback`, `onCallback`; wired `bot.on('callback_query', ...)` in `start()` to normalize callbacks into `IncomingCallback` and dispatch to the handler.
- `packages/cli/src/services/channel/ask-user-question.ts` (new) — `AskUserQuestionService` (in-memory session store keyed by base36 question id), `parseAskUserQuestionInput`, `formatAskUserQuestionBody`, `buildKeyboard`, `escapeHtml`. Service exposes `tryHandle(toolInput, chatId)` for the runner and `handleCallback(cb)` for adapter callbacks.
- `packages/cli/src/services/channel/channel-runner.ts` — `startOutputPolling` accepts an optional `askUserQuestionService`. When the agent-request `toolName` is `AskUserQuestion`, the service is offered the input first; on `false` (malformed payload) the runner falls back to the existing `formatPromptMessage` + `sendMessage` path. `runChannelBridge` constructs the service with `(message) => TtyWriter.send(terminalLocation, message)` and registers `telegram.onCallback`.

## Test Files Changed

- `packages/cli/src/__tests__/services/channel/ask-user-question.test.ts` (new) — tests covering parser (single-select, multi-select, multi-question reject, malformed), escapeHtml, body formatter (header omit, multi-select hint, HTML escape), keyboard builder (single-select numbered + Skip; multi-select Skip-only), service flow (option tap, Skip tap, stale callback, chatId mismatch, malformed, out-of-range).
- `packages/cli/src/__tests__/services/channel/channel-runner.test.ts` — replaced the two raw-JSON assertions with inline-keyboard assertions; added malformed-payload fallback test.
- `packages/cli/src/__tests__/commands/channel.test.ts` — widened the `mockTelegramAdapter` shape to include the new keyboard methods.
- `packages/channel-connector/src/__tests__/adapters/TelegramAdapter.test.ts` — added stub methods (`editMessageReplyMarkup`, `answerCbQuery`) and `_triggerCallback` helper to the mocked bot; added 6 tests for the new adapter methods.

## Scope

**Supported:**
- Single-select, single-question `AskUserQuestion` payloads: numbered option buttons + Skip button.
- Multi-select single-question payloads (`multiSelect: true`): Skip-only keyboard; user types the answer in chat.
- `Skip` button on every keyboard — sends Esc (`\x1b`) to dismiss the picker.

**Deliberately unsupported (fall back to plain `[Question]` text):**
- `questions` array with length ≠ 1 (multi-question payloads).

Rationale: driving multi-question through the TTY picker is fragile — it requires the bridge to sequence digit + Enter keystrokes across multiple turns, with timing assumptions about when the next picker opens. The fallback path still works for those cases; the user can type a free-text reply.

Multi-select was originally in the unsupported list for the same reason. We now support it as a chat-reply flow (no option buttons, just Skip) because the existing free-text path already handles arbitrary user input correctly and the Skip button gives the user a clean dismiss.

## Callback Data Format

Two shapes, each bounded ≤64 bytes (Telegram cap):
- `q:<id>:o:<idx>` — option tap (single-select keyboards only)
- `q:<id>:skip` — Skip tap (every keyboard)

`<id>` is a base36-encoded monotonic counter; never sent to the agent.

## State Model

In-memory `Map<questionId, ActiveSession>` on the service instance. Each session holds `spec`, `messageId`, and `chatId`. Session is deleted on finalization or on send failure. Bridge restart drops all sessions; subsequent taps on dropped questions get a "Question expired" toast.

## Final Answer Delivery

The bridge writes the resolved answer to the agent's TTY via the new `TtyWriter.sendKey` — **not** `TtyWriter.send`, and **not** the option label.

| User action | Sent to agent | Toast |
|---|---|---|
| Tap option N (single-select) | digit `String(optionIdx + 1)` | option `label` |
| Tap Skip (any keyboard) | Esc byte `\x1b` | "Skipped" |
| Type free-text in Telegram chat | the typed text (via existing `onMessage` → `TtyWriter.send` path) | n/a |

`TtyWriter.send` was unusable for option taps because it wraps the payload in bracketed paste markers and auto-appends Enter — the picker would see a paste of "1\n", which lands in the "Other" free-text field rather than triggering the digit hotkey. `TtyWriter.send` is still the right path for free-text replies because the picker's text-input field *is* the intended destination there.

`TtyWriter.sendKey` sends a raw keystroke:
- **tmux:** `tmux send-keys -t <id> <key>` (single call, no paste buffer, no auto-Enter). For `\x1b` it sends the named key `Escape`.
- **WezTerm:** `wezterm cli send-text --pane-id <id> --no-paste <key>` (Esc byte passes through literally).
- **iTerm2 / Terminal.app:** focus the target session/tab, then `System Events keystroke "<key>"` (typeable chars) or `key code 53` (Esc). Requires Accessibility permissions on macOS.

The Esc translation logic is centralized in `appleScriptKeyAction()` so adding more non-typeable keys (arrows, F-keys) later is a one-line addition.

## Out-of-Scope / Deferred

- Persistent sessions across bridge restarts.
- Multi-tenant chat support (bridge is single-authorized-chat by design).
- Multi-question support (intentionally deferred; see Scope).
- Inline-button toggle/Submit UX for multi-select (we route through chat reply instead).
- Inline-keyboard support on the abstract `ChannelAdapter` interface (kept Telegram-specific in v1).
- Live Telegram smoke test (owner: user).

## Verification

- `npm run build` → exit 0 across 5 projects.
- `npm test` → exit 0; 1,495 tests pass.

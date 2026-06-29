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

- `packages/cli/src/__tests__/services/channel/ask-user-question.test.ts` (new) — 22 tests covering parser, escapeHtml, body formatter, keyboard builder, single-select / multi-select flow, multi-question sequencing, stale callback, chatId mismatch.
- `packages/cli/src/__tests__/services/channel/channel-runner.test.ts` — replaced the two raw-JSON assertions with inline-keyboard assertions; added malformed-payload fallback test.
- `packages/cli/src/__tests__/commands/channel.test.ts` — widened the `mockTelegramAdapter` shape to include the new keyboard methods.
- `packages/channel-connector/src/__tests__/adapters/TelegramAdapter.test.ts` — added stub methods (`editMessageReplyMarkup`, `answerCbQuery`) and `_triggerCallback` helper to the mocked bot; added 6 tests for the new adapter methods.

## Scope

**Supported:** single-select, single-question `AskUserQuestion` payloads only.

**Deliberately unsupported (fall back to plain `[Question]` text):**
- `multiSelect: true` on any question.
- `questions` array with length ≠ 1.

Rationale: driving multi-select or multi-question through the TTY picker is fragile — it requires the bridge to sequence digit + Enter keystrokes across multiple turns, with timing assumptions about when the next picker opens. Sending the wrong key at the wrong moment puts garbage into the agent's prompt. The fallback path still works for those cases; the user can type a free-text reply.

## Callback Data Format

`callback_data` shape: `q:<id>:o:<idx>` (option tap). Bounded ≤64 bytes (Telegram cap). `<id>` is a base36-encoded monotonic counter; never sent to the agent.

## State Model

In-memory `Map<questionId, ActiveSession>` on the service instance. Each session holds `spec`, `messageId`, and `chatId`. Session is deleted on finalization or on send failure. Bridge restart drops all sessions; subsequent taps on dropped questions get a "Question expired" toast.

## Final Answer Delivery

When the user taps option N, the bridge writes the digit `String(optionIdx + 1)` to the agent's TTY via the new `TtyWriter.sendKey` — **not** `TtyWriter.send`, and **not** the option label.

`TtyWriter.send` was unusable here because it wraps the payload in bracketed paste markers and auto-appends Enter — the picker would see a paste of "1\n", which lands in the "Other" free-text field rather than triggering the digit hotkey.

`TtyWriter.sendKey` sends a raw keystroke:
- **tmux:** `tmux send-keys -t <id> <key>` (single call, no paste buffer, no auto-Enter).
- **iTerm2 / Terminal.app:** focus the target session/tab, then `System Events keystroke "<key>"`. Requires Accessibility permissions on macOS.

The Telegram toast shown to the user displays the option's `label` (for human-readable confirmation); the agent's TTY receives only the digit keystroke.

## Out-of-Scope / Deferred

- Persistent sessions across bridge restarts.
- Multi-tenant chat support (bridge is single-authorized-chat by design).
- Multi-select / multi-question support (intentionally deferred; see Scope).
- Inline-keyboard support on the abstract `ChannelAdapter` interface (kept Telegram-specific in v1).
- Live Telegram smoke test (owner: user).

## Verification

- `npm run build` → exit 0 across 5 projects.
- `npm test` → exit 0; 1,495 tests pass.

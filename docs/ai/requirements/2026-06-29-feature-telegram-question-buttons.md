---
phase: requirements
title: Requirements & Problem Understanding
description: Clarify the problem space, gather requirements, and define success criteria
---

# Requirements & Problem Understanding

## Problem Statement

When a Claude Code session running locally asks the user a structured question via the `AskUserQuestion` tool, the channel bridge (`channel-runner.ts`) forwards the payload to Telegram. Today the payload `{ questions: [{ question, header, options: [{label, description}], multiSelect }] }` is dumped as raw JSON because `formatPromptMessage` only handles a singular `toolInput.question` field. The Telegram user must read JSON and type the answer back as free text — unfriendly and error-prone.

Affected: any user driving a Claude Code agent remotely via the configured Telegram channel.

## Goals & Objectives

**Primary goals**
- Render single-select, single-question `AskUserQuestion` payloads as a Telegram message with an inline keyboard, one button per option.
- A tap on any option finalizes the answer and delivers the option's **digit key** (`String(optionIdx + 1)`) to the agent as a raw TTY keystroke — the host picker is a key-driven menu that selects+confirms on digit press.
- Every keyboard includes a `Skip` button that sends `Esc` (`\x1b`) to dismiss the picker.
- For **multi-select** single-question payloads (`multiSelect: true`): render the question + numbered options as a read-only formatted message with a `Skip`-only keyboard, plus a hint asking the user to reply in chat. Free-text replies pass through the existing `onMessage` → `TtyWriter.send` path.

**Secondary goals**
- Use Telegram HTML for the question body so visual hierarchy survives.
- Keep the existing `[Tool prompt]` plain-text path unchanged for non-AskUserQuestion tools.

**Non-goals (deliberately deferred)**
- **Multi-question** payloads (`questions.length > 1`). Reliably sequencing keystrokes across pickers requires timing assumptions about when the next picker opens — fragile. These still fall back to the plain `[Question] <json>` text path.
- Persisting selection state across bridge restarts.
- Supporting multiple concurrent Telegram users — the bridge is single-user by design.
- Driving multi-select toggles/Submit via inline buttons — multi-select uses the free-text reply path instead.

Unsupported shapes (multi-question, malformed) fall back to the `[Question] <json>` plain-text path; the user can still type a free-text reply.

## User Stories & Use Cases

- As a remote user driving an agent over Telegram, I tap a single button to answer a single-select question and the agent immediately proceeds, without me having to type anything.
- As a remote user faced with a multi-select question, I see the question and numbered options as a read-only message with a Skip button, and I type my answer in chat.
- As a remote user, I can tap `Skip` on any question to send Esc and dismiss the picker.
- As a remote user, I can still type a free-text reply instead of tapping a button. Free-text replies pass through the existing `onMessage` path unchanged.

### Edge cases

- **Stale callback**: user taps a button on a question whose state was already finalized or never existed (e.g., bridge restarted). Acknowledge the callback so Telegram clears the spinner; do not feed anything to the agent; show a brief "Question expired" toast.
- **`editMessageReplyMarkup` failure**: rare (e.g., message too old). Log the error, still feed back the resolved answer, do not crash the bridge.
- **Unauthorized chat**: callbacks from any `chatId` other than `chatIdRef.value` are dropped at the runner before reaching the service.

## Success Criteria

- Single-select question round-trip from agent → Telegram → tap → agent receives the digit (e.g. `"1"`) via `TtyWriter.sendKey`. Verified by unit + integration tests.
- Skip tap on any keyboard → agent receives Esc (`\x1b`) via `TtyWriter.sendKey`, translated to the backend-native form (tmux `Escape`, AppleScript `key code 53`).
- Multi-select payloads render a Skip-only keyboard with a chat-reply hint; free-text replies still work. Verified by tests.
- Existing non-AskUserQuestion `[Tool prompt]` output stays byte-identical.
- Multi-question payloads fall back to the plain `[Question]` text path (verified by tests).
- All `callback_data` payloads ≤64 bytes (Telegram cap).
- 100% line coverage on new code in `ask-user-question.ts`, the new `TelegramAdapter` methods, and `TtyWriter.sendKey`.

## Constraints & Assumptions

**Technical**
- Telegraf is the Telegram client; `bot.on('callback_query', ...)` delivers taps.
- `callback_data` must be ≤64 bytes UTF-8.
- The host `AskUserQuestion` picker reads stdin in raw mode. Digit keypresses select+confirm; pasted text via bracketed paste lands in the "Other" free-text field. The bridge therefore uses `TtyWriter.sendKey` (raw keystroke), not `TtyWriter.send` (paste + Enter).
- macOS terminals (iTerm2 / Terminal.app) require Accessibility permissions for the System Events keystroke path. tmux uses `send-keys` directly with no extra permissions.
- Bridge is single-user, single-agent: `chatIdRef.value` is the one authorized chat.

**Assumptions**
- A `questionId` is generated per render as a short base36 counter, never sent to the agent. Used only for routing callbacks to in-memory state.

## Questions & Open Items

All material questions resolved during requirements gathering:
- Multi-question support → deferred; fall back to plain text.
- Multi-select support → Skip-only keyboard + free-text reply path (no Toggle/Submit buttons).
- Skip button → present on every keyboard; sends Esc keystroke.
- Answer delivery format → digit key (for option taps), Esc (`\x1b`) (for Skip taps), not labels.
- Stale callback after restart → ack with "Question expired" toast, no agent write.

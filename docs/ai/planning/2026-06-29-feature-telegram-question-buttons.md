---
phase: planning
title: Project Planning & Task Breakdown
description: Break down work into actionable tasks and estimate timeline
---

# Project Planning & Task Breakdown

Per `feedback_backlog_format.md`: flat checklist, no multi-status sections.

## Tasks

- [x] T1 — Extend `packages/channel-connector/src/types.ts` with `InlineKeyboardButton`, `InlineKeyboard`, `IncomingCallback`, `CallbackHandler`; re-export from `index.ts`.
- [x] T2 — Add `sendInlineKeyboard`, `editInlineKeyboard`, `answerCallback`, `onCallback` to `TelegramAdapter`. Wire `bot.on('callback_query', ...)` in `start()`.
- [x] T3 — Adapter unit tests for the four new methods using a stubbed Telegraf bot.
- [x] T4 — Created new module `packages/cli/src/services/channel/ask-user-question.ts` with `AskUserQuestionService` (in-memory session map), `parseAskUserQuestionInput`, `buildKeyboard`, `formatAskUserQuestionBody`, `escapeHtml`.
- [x] T5 — Registered `telegram.onCallback(handleCallback)` in `runChannelBridge`; the service is injected into `startOutputPolling`.
- [x] T6 — Polling loop routes `AskUserQuestion` to `askQuestion.tryHandle(...)`; falls back to `formatPromptMessage` + `sendMessage` when the service is absent or the payload is malformed.
- [x] T7 — Updated `channel-runner.test.ts:171-226` to assert keyboard shape, not raw JSON.
- [x] T8 — Added multi-question fixture test in `ask-user-question.test.ts`.
- [x] T9 — Full repo `npm run build` (exit 0) + `npm test` (exit 0; 1,495 tests across 5 projects).
- [ ] T10 — Manual Telegram smoke test (live bot). Owner: user.
- [x] T11 — Implementation doc updated.

## Dependencies

- T2 depends on T1.
- T3 depends on T2.
- T4 depends on T1.
- T5 depends on T2, T4.
- T6 depends on T4, T5.
- T7, T8 depend on T6.
- T9 depends on T7, T8.
- T10 depends on T9.
- T11 depends on T10.

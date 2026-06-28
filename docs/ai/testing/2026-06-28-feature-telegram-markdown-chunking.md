---
phase: testing
title: Telegram Markdown-first Chunking Testing
description: Verify semantic Markdown chunking before Telegram HTML rendering
---

# Telegram Markdown-first Chunking Testing

## Test Coverage Goals

- Unit test coverage target: all new Telegram chunking branches added in `TelegramAdapter`.
- Integration scope: mocked Telegraf send calls from `TelegramAdapter.sendMessage`.
- End-to-end scope: not required; no live Telegram API calls for this change.
- Acceptance criteria map directly to the requirements edge cases.

## Unit Tests

### TelegramAdapter.sendMessage

- [x] Long fenced code containing literal `<code>tag</code>` is split into multiple parse-mode HTML sends, each within 4096 characters and each containing balanced `<pre><code...>` wrappers.
- [x] Nested list with long fenced code is split into multiple parse-mode HTML sends without a malformed partial HTML code block.
- [x] Long paragraphs are split into multiple parse-mode HTML sends at readable boundaries and stay within limit.
- [x] Unicode/emoji content respects JavaScript string length limits for chunk size.
- [x] Normal markdown that fits is sent once and renders unchanged.
- [x] Existing parse-entities retry still falls back to plain text.
- [x] Existing renderer-throws fallback still sends source/plain text chunks.

## Integration Tests

- [x] Mocked `telegraf.telegram.sendMessage` calls always receive `{ parse_mode: 'HTML' }` for successful rendered chunks.
- [x] Plain text fallback calls omit parse mode.

## End-to-End Tests

- Not planned. The behavior is deterministic and covered through the adapter boundary with Telegraf mocked.

## Test Data

- Fenced TypeScript code block with repeated lines containing `<code>tag</code>` and `&`.
- Nested unordered list with a child fenced code block large enough to exceed Telegram length after rendering.
- Paragraphs containing sentence punctuation, long words, and emoji.
- Short markdown sample: `**bold** and *italic* and `code``.

## Test Reporting & Coverage

- Red command: `npm --workspace @ai-devkit/channel-connector test -- src/__tests__/adapters/TelegramAdapter.test.ts` exited 1 with 4 expected failures before production changes.
- Targeted adapter command: `npm --workspace @ai-devkit/channel-connector test -- src/__tests__/adapters/TelegramAdapter.test.ts` exited 0 with 26 tests passed.
- Package test command: `npm --workspace @ai-devkit/channel-connector test` exited 0 with 4 files and 62 tests passed.
- Typecheck command: `npm --workspace @ai-devkit/channel-connector run typecheck` exited 0.
- Lint command: `npm --workspace @ai-devkit/channel-connector run lint` exited 0.

## Manual Testing

- Not required for this non-UI adapter change.

## Performance Testing

- No dedicated benchmark required. Tests should avoid pathological runtime by using representative 5k to 12k character inputs.

## Bug Tracking

- Regressions should be added as adapter tests with inputs that previously generated malformed rendered HTML chunks.

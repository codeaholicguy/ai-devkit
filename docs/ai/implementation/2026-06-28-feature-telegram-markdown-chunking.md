---
phase: implementation
title: Telegram Markdown-first Chunking Implementation
description: Implementation notes for marked-token chunking in TelegramAdapter
---

# Telegram Markdown-first Chunking Implementation

## Development Setup

- Active worktree: `/home/ubuntu/code/ai-devkit/.worktrees/feature-telegram-markdown-chunking`
- Branch: `feature-telegram-markdown-chunking`
- Bootstrap: `npm ci`
- Package: `@ai-devkit/channel-connector`

## Code Structure

- `packages/channel-connector/src/adapters/TelegramAdapter.ts`: Telegram send flow and chunking helpers.
- `packages/channel-connector/src/utils/telegramHtml.ts`: existing Markdown-to-Telegram-HTML renderer, retained as-is for rendering.
- `packages/channel-connector/src/__tests__/adapters/TelegramAdapter.test.ts`: mocked adapter behavior tests.

## Implementation Notes

### Core Features

- Implemented `chunkMarkdownForTelegram` in `TelegramAdapter.ts`.
- Uses `Marked.lexer` to obtain top-level Markdown tokens.
- Groups tokens by rendering candidate source Markdown through `markdownToTelegramHtml`.
- Splits oversized code tokens by lines while wrapping every emitted part in the original fenced code marker and language.
- Splits oversized lists by list item where possible, then falls back to recursive text/code splitting for oversized items.
- Splits oversized paragraphs/text by newline, sentence, word, then code point fallback.
- Sends rendered chunks with Telegram HTML parse mode only after they fit.

### Patterns & Best Practices

- Keep renderer behavior unchanged.
- Keep fallback behavior local to `TelegramAdapter.sendMessage`.
- Prefer source Markdown chunk boundaries over rendered HTML manipulation.

## Integration Points

- No public API changes.
- No Telegram Bot API contract changes.
- Telegraf remains mocked in tests.

## Error Handling

- If Markdown chunk generation fails, fall back to source/plain text chunks.
- If Telegram rejects parse-mode HTML with `can't parse entities`, send plain text derived from that rendered chunk.
- Non-parse Telegram send errors continue to propagate.

## Performance Considerations

- Candidate rendering is repeated during grouping and splitting; this is bounded by Telegram message size and channel send frequency.
- Avoid large dependency changes or a custom parser.

## Security Notes

- The existing renderer continues to escape user content.
- Raw Markdown HTML remains dropped by the renderer.
- No secrets or new config are introduced.

## Validation Results

- `npx ai-devkit@latest lint --feature telegram-markdown-chunking`: exited 0.
- `npm --workspace @ai-devkit/channel-connector test -- src/__tests__/adapters/TelegramAdapter.test.ts`: exited 0, 26 tests passed.
- `npm --workspace @ai-devkit/channel-connector test`: exited 0, 62 tests passed.
- `npm --workspace @ai-devkit/channel-connector run typecheck`: exited 0.
- `npm --workspace @ai-devkit/channel-connector run lint`: exited 0.
- Final rerun of `npx ai-devkit@latest lint --feature telegram-markdown-chunking`: exited 0.
- Commit hook rerun after direct workspace package builds: repo lint exited 0 with existing warnings; repo tests exited 0 with 70 files and 821 tests passed.
- Post-fetch targeted validation: `npm --workspace @ai-devkit/channel-connector test -- src/__tests__/adapters/TelegramAdapter.test.ts` exited 0, 26 tests passed.

## Deviations and Follow-ups

- No design deviations.
- Plain/source fallback remains available if a rendered chunk still cannot fit after semantic splitting.
- PR opened: https://github.com/codeaholicguy/ai-devkit/pull/125.

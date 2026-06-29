import * as telegrafModule from 'telegraf';
import * as telegramHtml from '../../utils/telegramHtml.js';
import { TelegramAdapter } from '../../adapters/TelegramAdapter.js';
import type { IncomingMessage } from '../../types.js';

// Mock telegraf
vi.mock('telegraf', () => {
    const handlers: Record<string, (...args: any[]) => any> = {};
    const mockBot = {
        launch: vi.fn().mockResolvedValue(undefined),
        stop: vi.fn().mockResolvedValue(undefined),
        on: vi.fn((event: string, handler: (...args: any[]) => any) => {
            handlers[event] = handler;
        }),
        telegram: {
            sendMessage: vi.fn().mockResolvedValue(undefined),
            editMessageReplyMarkup: vi.fn().mockResolvedValue(undefined),
            answerCbQuery: vi.fn().mockResolvedValue(undefined),
            getMe: vi.fn().mockResolvedValue({ username: 'test_bot' }),
        },
        _handlers: handlers,
        _triggerText: async (chatId: number, userId: number, text: string) => {
            const ctx = {
                message: {
                    chat: { id: chatId },
                    from: { id: userId },
                    text,
                    date: Math.floor(Date.now() / 1000),
                },
                reply: vi.fn().mockResolvedValue(undefined),
            };
            if (handlers['text']) {
                await handlers['text'](ctx);
            }
            return ctx;
        },
        _triggerCallback: async (chatId: number, userId: number, data: string, messageId = 555) => {
            const ctx = {
                callbackQuery: {
                    id: 'cbq-test',
                    data,
                    message: { message_id: messageId, chat: { id: chatId } },
                    from: { id: userId },
                },
                answerCbQuery: vi.fn().mockResolvedValue(undefined),
            };
            if (handlers['callback_query']) {
                await handlers['callback_query'](ctx);
            }
            return ctx;
        },
    };
    return {
        Telegraf: vi.fn(function () { return mockBot; }),
        __mockBot: mockBot,
    };
});

function getMockBot() {
    return (telegrafModule as unknown as { __mockBot: ReturnType<typeof vi.fn>['mock'] & Record<string, unknown> }).__mockBot;
}

function expectHtmlChunkWithinLimit(chunk: string): void {
    expect(chunk.length).toBeLessThanOrEqual(4096);
    expect(chunk).not.toMatch(/&(?:l|lt|g|gt|a|am|amp|q|qu|quo|quot)$/);
    expect((chunk.match(/<pre>/g) ?? []).length).toBe((chunk.match(/<\/pre>/g) ?? []).length);
    expect((chunk.match(/<code(?: class="language-[^"]+")?>/g) ?? []).length).toBe((chunk.match(/<\/code>/g) ?? []).length);
}

describe('TelegramAdapter', () => {
    let adapter: TelegramAdapter;

    beforeEach(() => {
        vi.clearAllMocks();
        adapter = new TelegramAdapter({ botToken: 'test-token-123' });
    });

    describe('type', () => {
        it('should return "telegram"', () => {
            expect(adapter.type).toBe('telegram');
        });
    });

    describe('start', () => {
        it('should launch the telegraf bot', async () => {
            const bot = getMockBot();
            await adapter.start();
            expect(bot.launch).toHaveBeenCalled();
        });
    });

    describe('stop', () => {
        it('should stop the telegraf bot', async () => {
            const bot = getMockBot();
            await adapter.start();
            await adapter.stop();
            expect(bot.stop).toHaveBeenCalled();
        });
    });

    describe('onMessage', () => {
        it('should silently ignore messages when no handler is registered', async () => {
            // Don't register a handler
            await adapter.start();

            const bot = getMockBot();
            const ctx = await bot._triggerText(12345, 67890, 'hello');

            // Should not throw or reply
            expect(ctx.reply).not.toHaveBeenCalled();
        });

        it('should handle non-Error thrown by handler', async () => {
            const handler = vi.fn().mockRejectedValue('string error');
            adapter.onMessage(handler);
            await adapter.start();

            const bot = getMockBot();
            const ctx = await bot._triggerText(12345, 67890, 'hello');

            expect(ctx.reply).toHaveBeenCalledWith(
                'Error processing message: Unknown error'
            );
        });

        it('should call handler with IncomingMessage on incoming text', async () => {
            const handler = vi.fn().mockResolvedValue(undefined);
            adapter.onMessage(handler);
            await adapter.start();

            const bot = getMockBot();
            await bot._triggerText(12345, 67890, 'hello agent');

            expect(handler).toHaveBeenCalledTimes(1);
            const msg: IncomingMessage = handler.mock.calls[0][0];
            expect(msg.channelType).toBe('telegram');
            expect(msg.chatId).toBe('12345');
            expect(msg.userId).toBe('67890');
            expect(msg.text).toBe('hello agent');
            expect(msg.timestamp).toBeInstanceOf(Date);
        });

        it('should handle handler errors gracefully', async () => {
            const handler = vi.fn().mockRejectedValue(new Error('handler failed'));
            adapter.onMessage(handler);
            await adapter.start();

            const bot = getMockBot();
            const ctx = await bot._triggerText(12345, 67890, 'hello');

            // Should not throw, and should reply with error
            expect(ctx.reply).toHaveBeenCalledWith(
                expect.stringContaining('Error processing message')
            );
        });
    });

    describe('sendMessage', () => {
        it('should send plain text with parse_mode HTML', async () => {
            const bot = getMockBot();
            await adapter.sendMessage('12345', 'hello from bot');

            expect(bot.telegram.sendMessage).toHaveBeenCalledWith(
                '12345',
                'hello from bot',
                { parse_mode: 'HTML' }
            );
        });

        it('should render markdown as Telegram HTML', async () => {
            const bot = getMockBot();
            await adapter.sendMessage('12345', '**bold** and *italic* and `code`');

            const sent = bot.telegram.sendMessage.mock.calls[0][1];
            expect(sent).toContain('<b>bold</b>');
            expect(sent).toContain('<i>italic</i>');
            expect(sent).toContain('<code>code</code>');
            expect(bot.telegram.sendMessage.mock.calls[0][2]).toEqual({
                parse_mode: 'HTML',
            });
        });

        it('should chunk messages exceeding 4096 chars', async () => {
            const bot = getMockBot();
            const line = 'A'.repeat(100) + '\n';
            const longMessage = line.repeat(50); // 5050 chars

            await adapter.sendMessage('12345', longMessage);

            expect(bot.telegram.sendMessage.mock.calls.length).toBeGreaterThan(1);
            for (const call of bot.telegram.sendMessage.mock.calls) {
                expect(call[1].length).toBeLessThanOrEqual(4096);
                expect(call[2]).toEqual({ parse_mode: 'HTML' });
            }
        });

        it('should split long fenced code into independently valid HTML code blocks', async () => {
            const bot = getMockBot();
            const codeLine = 'const sample = "<code>tag</code>" && value < limit;\n';
            const longMessage = `Before\n\n\`\`\`ts\n${codeLine.repeat(100)}\`\`\`\n\nAfter`;

            await adapter.sendMessage('12345', longMessage);

            expect(bot.telegram.sendMessage.mock.calls.length).toBeGreaterThan(1);
            for (const call of bot.telegram.sendMessage.mock.calls) {
                const chunk = call[1];
                expect(call[2]).toEqual({ parse_mode: 'HTML' });
                expectHtmlChunkWithinLimit(chunk);
                if (chunk.includes('<pre>')) {
                    expect(chunk).toContain('<code class="language-ts">');
                    expect(chunk).toContain('&lt;code&gt;tag&lt;/code&gt;');
                }
            }
        });

        it('should split nested list fenced code without sending partial HTML tags', async () => {
            const bot = getMockBot();
            const codeLine = '  return "<code>tag</code>" && input < output;\n';
            const longMessage = [
                '- parent item',
                '  - child item with code',
                '    ```js',
                codeLine.repeat(100).trimEnd(),
                '    ```',
                '- final item',
            ].join('\n');

            await adapter.sendMessage('12345', longMessage);

            expect(bot.telegram.sendMessage.mock.calls.length).toBeGreaterThan(1);
            for (const call of bot.telegram.sendMessage.mock.calls) {
                const chunk = call[1];
                expect(call[2]).toEqual({ parse_mode: 'HTML' });
                expectHtmlChunkWithinLimit(chunk);
            }
        });

        it('should split long paragraphs at readable markdown boundaries', async () => {
            const bot = getMockBot();
            const sentence = 'This is a long sentence with enough words to make chunking choose sentence boundaries. ';
            const longMessage = sentence.repeat(80);

            await adapter.sendMessage('12345', longMessage);

            expect(bot.telegram.sendMessage.mock.calls.length).toBeGreaterThan(1);
            for (const call of bot.telegram.sendMessage.mock.calls) {
                const chunk = call[1];
                expect(call[2]).toEqual({ parse_mode: 'HTML' });
                expectHtmlChunkWithinLimit(chunk);
                expect(chunk.endsWith('.') || chunk.endsWith('.\n\n') || chunk.endsWith(' ')).toBe(true);
            }
        });

        it('should keep emoji chunks within the configured JavaScript string length limit', async () => {
            const bot = getMockBot();
            const longMessage = `Status ${'🧪'.repeat(2500)}`;

            await adapter.sendMessage('12345', longMessage);

            expect(bot.telegram.sendMessage.mock.calls.length).toBeGreaterThan(1);
            for (const call of bot.telegram.sendMessage.mock.calls) {
                expect(call[1].length).toBeLessThanOrEqual(4096);
                expect(call[2]).toEqual({ parse_mode: 'HTML' });
            }
        });

        it('should hard split at 4096 when no newlines available', async () => {
            const bot = getMockBot();
            const longMessage = 'A'.repeat(5000);

            await adapter.sendMessage('12345', longMessage);

            expect(bot.telegram.sendMessage.mock.calls.length).toBe(2);
            expect(bot.telegram.sendMessage.mock.calls[0][1].length).toBe(4096);
            expect(bot.telegram.sendMessage.mock.calls[1][1].length).toBe(904);
        });

        it('should prefer paragraph (\\n\\n) over single \\n when chunking', async () => {
            const bot = getMockBot();
            // 4 paragraphs of ~1500 chars each, total > 4096
            const paragraph = 'A'.repeat(1500);
            const message = `${paragraph}\n\n${paragraph}\n\n${paragraph}\n\n${paragraph}`;

            await adapter.sendMessage('12345', message);

            // First chunk should end at a \n\n boundary, not mid-paragraph
            const firstChunk = bot.telegram.sendMessage.mock.calls[0][1];
            expect(firstChunk).toBe(`${paragraph}\n\n${paragraph}`);
        });

        it('should send short messages in a single call', async () => {
            const bot = getMockBot();
            await adapter.sendMessage('12345', 'short message');

            expect(bot.telegram.sendMessage).toHaveBeenCalledTimes(1);
        });

        it('should retry as plain text when Telegram rejects HTML with parse-entities error', async () => {
            const bot = getMockBot();
            const parseError = Object.assign(new Error('400: Bad Request'), {
                description: "Bad Request: can't parse entities: Unsupported start tag \"foo\"",
            });
            bot.telegram.sendMessage
                .mockRejectedValueOnce(parseError)
                .mockResolvedValueOnce(undefined);

            await adapter.sendMessage('12345', '**hello**');

            expect(bot.telegram.sendMessage).toHaveBeenCalledTimes(2);

            // First call: rendered HTML with parse_mode
            const [, htmlChunk, htmlOpts] = bot.telegram.sendMessage.mock.calls[0];
            expect(htmlChunk).toContain('<b>hello</b>');
            expect(htmlOpts).toEqual({ parse_mode: 'HTML' });

            // Second call: same content, plain text (tags stripped, no parse_mode)
            const [, plainChunk, plainOpts] = bot.telegram.sendMessage.mock.calls[1];
            expect(plainChunk).toBe('hello');
            expect(plainOpts).toBeUndefined();
        });

        it('should detect parse-entities error from "message" field too', async () => {
            const bot = getMockBot();
            // Some error shapes carry the marker on `message` rather than `description`
            const parseError = new Error("can't parse entities");
            bot.telegram.sendMessage
                .mockRejectedValueOnce(parseError)
                .mockResolvedValueOnce(undefined);

            await adapter.sendMessage('12345', '**hi**');

            expect(bot.telegram.sendMessage).toHaveBeenCalledTimes(2);
        });

        it('should decode HTML entities when falling back to plain text', async () => {
            const bot = getMockBot();
            const parseError = Object.assign(new Error('400'), {
                description: "Bad Request: can't parse entities",
            });
            bot.telegram.sendMessage
                .mockRejectedValueOnce(parseError)
                .mockResolvedValueOnce(undefined);

            // Source has chars that escapeHtml encodes; fallback should decode them
            await adapter.sendMessage('12345', 'a < b && c > d');

            const [, plainChunk] = bot.telegram.sendMessage.mock.calls[1];
            expect(plainChunk).toContain('a < b && c > d');
            expect(plainChunk).not.toContain('&lt;');
            expect(plainChunk).not.toContain('&amp;');
        });

        it('should deliver nested lists without throwing', async () => {
            const bot = getMockBot();

            await adapter.sendMessage('12345', '- agent\n  - Status');

            expect(bot.telegram.sendMessage).toHaveBeenCalledTimes(1);
            expect(bot.telegram.sendMessage.mock.calls[0][1]).toContain('Status');
        });

        it('should send plain text when markdown formatting throws', async () => {
            const bot = getMockBot();
            const formatter = vi.spyOn(telegramHtml, 'markdownToTelegramHtml')
                .mockImplementationOnce(() => {
                    throw new Error('formatter failed');
                });

            await adapter.sendMessage('12345', '- agent\n  - Status');

            expect(bot.telegram.sendMessage).toHaveBeenCalledTimes(1);
            expect(bot.telegram.sendMessage.mock.calls[0][0]).toBe('12345');
            expect(bot.telegram.sendMessage.mock.calls[0][1]).toBe('- agent\n  - Status');
            expect(bot.telegram.sendMessage.mock.calls[0][2]).toBeUndefined();

            formatter.mockRestore();
        });

        it('should propagate non-parse-entities errors without falling back', async () => {
            const bot = getMockBot();
            const otherError = Object.assign(new Error('403'), {
                description: 'Forbidden: bot was blocked by the user',
            });
            bot.telegram.sendMessage.mockRejectedValueOnce(otherError);

            await expect(adapter.sendMessage('12345', 'hi')).rejects.toBe(otherError);

            // Only the HTML attempt should have happened — no fallback retry
            expect(bot.telegram.sendMessage).toHaveBeenCalledTimes(1);
        });
    });

    describe('sendInlineKeyboard', () => {
        it('sends with parse_mode HTML and inline_keyboard payload, returns message_id', async () => {
            const bot = getMockBot();
            (bot.telegram.sendMessage as any).mockResolvedValueOnce({ message_id: 42 });

            const id = await adapter.sendInlineKeyboard('12345', '<b>hi</b>', [
                [{ text: 'A', callbackData: 'q:1:o:0' }],
                [{ text: 'B', callbackData: 'q:1:o:1' }],
            ]);

            expect(id).toBe(42);
            expect(bot.telegram.sendMessage).toHaveBeenCalledWith('12345', '<b>hi</b>', {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: 'A', callback_data: 'q:1:o:0' }],
                        [{ text: 'B', callback_data: 'q:1:o:1' }],
                    ],
                },
            });
        });
    });

    describe('editInlineKeyboard', () => {
        it('replaces the keyboard on an existing message', async () => {
            const bot = getMockBot();
            await adapter.editInlineKeyboard('12345', 99, [[{ text: '✓ A', callbackData: 'q:1:o:0' }]]);
            expect(bot.telegram.editMessageReplyMarkup).toHaveBeenCalledWith('12345', 99, undefined, {
                inline_keyboard: [[{ text: '✓ A', callback_data: 'q:1:o:0' }]],
            });
        });

        it('passes undefined reply_markup to remove the keyboard', async () => {
            const bot = getMockBot();
            await adapter.editInlineKeyboard('12345', 99, null);
            expect(bot.telegram.editMessageReplyMarkup).toHaveBeenCalledWith('12345', 99, undefined, undefined);
        });
    });

    describe('answerCallback', () => {
        it('forwards id and optional text to telegraf', async () => {
            const bot = getMockBot();
            await adapter.answerCallback('cbq-1', 'thanks');
            expect(bot.telegram.answerCbQuery).toHaveBeenCalledWith('cbq-1', 'thanks');
        });
    });

    describe('onCallback', () => {
        it('invokes the registered handler with a normalized IncomingCallback', async () => {
            const handler = vi.fn().mockResolvedValue(undefined);
            adapter.onCallback(handler);
            await adapter.start();

            const bot = getMockBot();
            await (bot as any)._triggerCallback(12345, 67890, 'q:abc:o:1', 777);

            expect(handler).toHaveBeenCalledOnce();
            const cb = handler.mock.calls[0][0];
            expect(cb.channelType).toBe('telegram');
            expect(cb.chatId).toBe('12345');
            expect(cb.userId).toBe('67890');
            expect(cb.messageId).toBe(777);
            expect(cb.callbackData).toBe('q:abc:o:1');
            expect(cb.callbackQueryId).toBe('cbq-test');
        });

        it('answers callbacks when no handler is registered', async () => {
            await adapter.start();
            const bot = getMockBot();
            const ctx = await (bot as any)._triggerCallback(12345, 67890, 'q:x:o:0');
            expect(ctx.answerCbQuery).toHaveBeenCalled();
        });

        it('answers with error when handler rejects', async () => {
            adapter.onCallback(vi.fn().mockRejectedValue(new Error('boom')));
            await adapter.start();
            const bot = getMockBot();
            const ctx = await (bot as any)._triggerCallback(12345, 67890, 'q:x:o:0');
            expect(ctx.answerCbQuery).toHaveBeenCalledWith('Error');
        });
    });

    describe('isHealthy', () => {
        it('should return true after start', async () => {
            await adapter.start();
            expect(await adapter.isHealthy()).toBe(true);
        });

        it('should return false before start', async () => {
            expect(await adapter.isHealthy()).toBe(false);
        });

        it('should return false after stop', async () => {
            await adapter.start();
            await adapter.stop();
            expect(await adapter.isHealthy()).toBe(false);
        });
    });
});

import { TelegramAdapter } from '../../adapters/TelegramAdapter';
import type { IncomingMessage } from '../../types';

// Mock telegraf
jest.mock('telegraf', () => {
    const handlers: Record<string, (...args: any[]) => any> = {};
    const mockBot = {
        launch: jest.fn().mockResolvedValue(undefined),
        stop: jest.fn().mockResolvedValue(undefined),
        on: jest.fn((event: string, handler: (...args: any[]) => any) => {
            handlers[event] = handler;
        }),
        telegram: {
            sendMessage: jest.fn().mockResolvedValue(undefined),
            getMe: jest.fn().mockResolvedValue({ username: 'test_bot' }),
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
                reply: jest.fn().mockResolvedValue(undefined),
            };
            if (handlers['text']) {
                await handlers['text'](ctx);
            }
            return ctx;
        },
    };
    return {
        Telegraf: jest.fn(() => mockBot),
        __mockBot: mockBot,
    };
});

function getMockBot() {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('telegraf').__mockBot;
}

describe('TelegramAdapter', () => {
    let adapter: TelegramAdapter;

    beforeEach(() => {
        jest.clearAllMocks();
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
            const handler = jest.fn().mockRejectedValue('string error');
            adapter.onMessage(handler);
            await adapter.start();

            const bot = getMockBot();
            const ctx = await bot._triggerText(12345, 67890, 'hello');

            expect(ctx.reply).toHaveBeenCalledWith(
                'Error processing message: Unknown error'
            );
        });

        it('should call handler with IncomingMessage on incoming text', async () => {
            const handler = jest.fn().mockResolvedValue(undefined);
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
            const handler = jest.fn().mockRejectedValue(new Error('handler failed'));
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
        it('should send text to the specified chat', async () => {
            const bot = getMockBot();
            await adapter.sendMessage('12345', 'hello from bot');

            expect(bot.telegram.sendMessage).toHaveBeenCalledWith('12345', 'hello from bot');
        });

        it('should chunk messages exceeding 4096 chars at newline boundaries', async () => {
            const bot = getMockBot();
            // Create a message with lines that total > 4096 chars
            const line = 'A'.repeat(100) + '\n';
            const longMessage = line.repeat(50); // 50 * 101 = 5050 chars

            await adapter.sendMessage('12345', longMessage);

            // Should have been called multiple times (chunked)
            expect(bot.telegram.sendMessage.mock.calls.length).toBeGreaterThan(1);
            // Each chunk should be <= 4096 chars
            for (const call of bot.telegram.sendMessage.mock.calls) {
                expect(call[1].length).toBeLessThanOrEqual(4096);
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

        it('should send short messages in a single call', async () => {
            const bot = getMockBot();
            await adapter.sendMessage('12345', 'short message');

            expect(bot.telegram.sendMessage).toHaveBeenCalledTimes(1);
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

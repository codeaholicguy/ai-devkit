import { Telegraf } from 'telegraf';
import type { ChannelAdapter } from './ChannelAdapter';
import type { IncomingMessage } from '../types';

export const TELEGRAM_CHANNEL_TYPE = 'telegram';
export const TELEGRAM_MAX_MESSAGE_LENGTH = 4096;

export interface TelegramAdapterOptions {
    botToken: string;
}

/**
 * Telegram Bot API adapter using telegraf with long polling.
 */
export class TelegramAdapter implements ChannelAdapter {
    readonly type = TELEGRAM_CHANNEL_TYPE;

    private bot: Telegraf;
    private messageHandler: ((msg: IncomingMessage) => Promise<void>) | null = null;
    private running = false;

    constructor(options: TelegramAdapterOptions) {
        this.bot = new Telegraf(options.botToken);
    }

    async start(): Promise<void> {
        this.bot.on('text', async (ctx) => {
            if (!this.messageHandler) return;

            const msg: IncomingMessage = {
                channelType: TELEGRAM_CHANNEL_TYPE,
                chatId: String(ctx.message.chat.id),
                userId: String(ctx.message.from.id),
                text: ctx.message.text,
                timestamp: new Date(ctx.message.date * 1000),
            };

            try {
                await this.messageHandler(msg);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                await ctx.reply(`Error processing message: ${errorMessage}`);
            }
        });

        await this.bot.launch();
        this.running = true;
    }

    async stop(): Promise<void> {
        this.running = false;
        await this.bot.stop();
    }

    /**
     * Send a message to a chat. Automatically chunks messages exceeding
     * Telegram's 4096-char limit, preferring newline boundaries.
     */
    async sendMessage(chatId: string, text: string): Promise<void> {
        const chunks = chunkMessage(text, TELEGRAM_MAX_MESSAGE_LENGTH);
        for (const chunk of chunks) {
            await this.bot.telegram.sendMessage(chatId, chunk);
        }
    }

    onMessage(handler: (msg: IncomingMessage) => Promise<void>): void {
        this.messageHandler = handler;
    }

    async isHealthy(): Promise<boolean> {
        return this.running;
    }
}

/**
 * Split text into chunks of maxLen or fewer characters,
 * preferring to split at newline boundaries.
 */
function chunkMessage(text: string, maxLen: number): string[] {
    if (text.length <= maxLen) {
        return [text];
    }

    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
        if (remaining.length <= maxLen) {
            chunks.push(remaining);
            break;
        }

        // Find the last newline within the limit
        const searchArea = remaining.slice(0, maxLen);
        const lastNewline = searchArea.lastIndexOf('\n');

        let splitAt: number;
        if (lastNewline > 0) {
            splitAt = lastNewline + 1; // include the newline in the current chunk
        } else {
            // No newline found — hard split at maxLen
            splitAt = maxLen;
        }

        chunks.push(remaining.slice(0, splitAt));
        remaining = remaining.slice(splitAt);
    }

    return chunks;
}

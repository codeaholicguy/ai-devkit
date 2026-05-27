import { Telegraf } from 'telegraf';
import type { ChannelAdapter } from './ChannelAdapter.js';
import { markdownToTelegramHtml } from '../utils/telegramHtml.js';
import type { IncomingMessage } from '../types.js';

export const TELEGRAM_CHANNEL_TYPE = 'telegram';
export const TELEGRAM_MAX_MESSAGE_LENGTH = 4096;
const TELEGRAM_PARSE_MODE = 'HTML' as const;

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
     * Input is treated as markdown and rendered as Telegram-compatible HTML.
     * Long messages are chunked at paragraph boundaries when possible; very
     * long single blocks (e.g. a `<pre>` over 4096 chars) may still split
     * mid-tag and produce a partial render in the second chunk.
     */
    async sendMessage(chatId: string, text: string): Promise<void> {
        const html = markdownToTelegramHtml(text);
        const chunks = chunkMessage(html, TELEGRAM_MAX_MESSAGE_LENGTH);
        for (const chunk of chunks) {
            try {
                await this.bot.telegram.sendMessage(chatId, chunk, { parse_mode: TELEGRAM_PARSE_MODE });
            } catch (error) {
                if (!isParseEntitiesError(error)) throw error;
                // Telegram rejected the rendered HTML — fall back to plain text
                // so the user still gets the content (just unformatted).
                await this.bot.telegram.sendMessage(chatId, htmlToPlainText(chunk));
            }
        }
    }

    onMessage(handler: (msg: IncomingMessage) => Promise<void>): void {
        this.messageHandler = handler;
    }

    async isHealthy(): Promise<boolean> {
        return this.running;
    }
}

function isParseEntitiesError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const description = (error as { description?: string }).description;
    const message = (error as { message?: string }).message;
    return ((description ?? '') + (message ?? '')).includes("can't parse entities");
}

function htmlToPlainText(html: string): string {
    return html
        .replace(/<[^>]+>/g, '')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&');
}

/**
 * Split text into chunks of maxLen or fewer characters. Prefers paragraph
 * boundaries (\n\n), then single newlines (\n), then hard-splits at maxLen.
 */
function chunkMessage(text: string, maxLen: number): string[] {
    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
        if (remaining.length <= maxLen) {
            chunks.push(remaining);
            break;
        }

        const lastParagraph = remaining.lastIndexOf('\n\n', maxLen - 2);
        const lastNewline = remaining.lastIndexOf('\n', maxLen - 1);

        let splitAt: number;
        if (lastParagraph > 0) {
            splitAt = lastParagraph + 2;
        } else if (lastNewline > 0) {
            splitAt = lastNewline + 1;
        } else {
            splitAt = maxLen;
        }

        chunks.push(remaining.slice(0, splitAt));
        remaining = remaining.slice(splitAt);
    }

    return chunks;
}

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
     * Long messages are chunked at paragraph boundaries when possible.
     */
    async sendMessage(chatId: string, text: string): Promise<void> {
        let html: string;
        try {
            html = markdownToTelegramHtml(text);
        } catch {
            for (const chunk of chunkMessage(text, TELEGRAM_MAX_MESSAGE_LENGTH)) {
                await this.bot.telegram.sendMessage(chatId, chunk);
            }
            return;
        }

        const htmlChunks = chunkTelegramHtml(html, TELEGRAM_MAX_MESSAGE_LENGTH);
        const fallbackChunks = chunkMessage(text, TELEGRAM_MAX_MESSAGE_LENGTH);

        for (const [index, chunk] of htmlChunks.entries()) {
            try {
                await this.bot.telegram.sendMessage(chatId, chunk, { parse_mode: TELEGRAM_PARSE_MODE });
            } catch (error) {
                if (!isParseEntitiesError(error)) throw error;
                // Telegram rejected the rendered HTML — fall back to plain text
                // from the source so escaped code content is not decoded into
                // HTML-looking Telegram tags.
                const fallbackChunk = fallbackChunks[index] ?? text;
                await this.bot.telegram.sendMessage(chatId, fallbackChunk);
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

function chunkTelegramHtml(html: string, maxLen: number): string[] {
    const chunks: string[] = [];
    const preCodePattern = /<pre><code([^>]*)>([\s\S]*?)<\/code><\/pre>(\n\n)?/g;
    let lastIndex = 0;

    for (const match of html.matchAll(preCodePattern)) {
        const matchIndex = match.index ?? 0;
        chunks.push(...chunkMessage(html.slice(lastIndex, matchIndex), maxLen));

        const [block, attrs, content, suffix = ''] = match;
        if (block.length <= maxLen) {
            chunks.push(block);
        } else {
            chunks.push(...chunkPreCodeBlock(attrs, content, suffix, maxLen));
        }

        lastIndex = matchIndex + block.length;
    }

    chunks.push(...chunkMessage(html.slice(lastIndex), maxLen));
    return chunks;
}

function chunkPreCodeBlock(attrs: string, content: string, suffix: string, maxLen: number): string[] {
    const open = `<pre><code${attrs}>`;
    const close = '</code></pre>';
    const maxContentLen = maxLen - open.length - close.length;
    if (maxContentLen <= 0) return chunkMessage(`${open}${content}${close}${suffix}`, maxLen);

    const contentChunks = chunkHtmlText(content, maxContentLen);
    return contentChunks.map((chunk, index) =>
        `${open}${chunk}${close}${index === contentChunks.length - 1 ? suffix : ''}`
    );
}

function chunkHtmlText(text: string, maxLen: number): string[] {
    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
        if (remaining.length <= maxLen) {
            chunks.push(remaining);
            break;
        }

        const newline = remaining.lastIndexOf('\n', maxLen - 1);
        const splitAt = avoidEntitySplit(remaining, newline > 0 ? newline + 1 : maxLen);
        chunks.push(remaining.slice(0, splitAt));
        remaining = remaining.slice(splitAt);
    }

    return chunks;
}

function avoidEntitySplit(text: string, splitAt: number): number {
    const amp = text.lastIndexOf('&', splitAt - 1);
    const semicolon = text.lastIndexOf(';', splitAt - 1);
    if (amp <= semicolon) return splitAt;

    const nextSemicolon = text.indexOf(';', amp);
    if (nextSemicolon >= splitAt && nextSemicolon < text.length) return amp;

    return splitAt;
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

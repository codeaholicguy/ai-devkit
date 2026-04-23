import { Telegraf } from 'telegraf';
import type { ChannelAdapter } from './ChannelAdapter';
import type { IncomingMessage, KeyboardButton, CallbackQuery } from '../types';

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
    private callbackHandler: ((query: CallbackQuery) => Promise<void>) | null = null;
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

        this.bot.on('callback_query', async (ctx) => {
            if (!this.callbackHandler || !('data' in ctx.callbackQuery)) return;
            await ctx.answerCbQuery();
            await this.callbackHandler({
                id: String(ctx.callbackQuery.id),
                chatId: String(ctx.callbackQuery.message?.chat.id ?? ''),
                data: ctx.callbackQuery.data ?? '',
            });
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
            const html = markdownToHtml(chunk);
            await this.bot.telegram.sendMessage(chatId, html, { parse_mode: 'HTML' });
        }
    }

    async sendKeyboard(chatId: string, text: string, buttons: KeyboardButton[][]): Promise<number> {
        const inlineKeyboard = buttons.map(row =>
            row.map(btn => ({ text: btn.text, callback_data: btn.callbackData }))
        );
        const result = await this.bot.telegram.sendMessage(chatId, text, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: inlineKeyboard },
        });
        return result.message_id;
    }

    async removeKeyboard(chatId: string, messageId: number): Promise<void> {
        try {
            await this.bot.telegram.editMessageReplyMarkup(chatId, messageId, undefined, { inline_keyboard: [] });
        } catch {
            // Message may already be gone
        }
    }

    onCallbackQuery(handler: (query: CallbackQuery) => Promise<void>): void {
        this.callbackHandler = handler;
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

function escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Convert standard Markdown to Telegram HTML.
 * Handles code blocks first to prevent formatting inside them.
 */
function markdownToHtml(text: string): string {
    const codeBlocks: string[] = [];
    const inlineCodes: string[] = [];

    let result = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
        const escaped = escapeHtml(code.trimEnd());
        const block = lang
            ? `<pre><code class="language-${lang}">${escaped}</code></pre>`
            : `<pre><code>${escaped}</code></pre>`;
        codeBlocks.push(block);
        return `\x00CODE${codeBlocks.length - 1}\x00`;
    });

    result = result.replace(/`([^`]+)`/g, (_, code) => {
        inlineCodes.push(`<code>${escapeHtml(code)}</code>`);
        return `\x00INLINE${inlineCodes.length - 1}\x00`;
    });

    result = escapeHtml(result);

    result = result
        .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
        .replace(/__(.+?)__/g, '<b>$1</b>')
        .replace(/\*(.+?)\*/g, '<i>$1</i>')
        .replace(/_(.+?)_/g, '<i>$1</i>')
        .replace(/~~(.+?)~~/g, '<s>$1</s>');

    result = result.replace(/\x00CODE(\d+)\x00/g, (_, i) => codeBlocks[parseInt(i)]);
    result = result.replace(/\x00INLINE(\d+)\x00/g, (_, i) => inlineCodes[parseInt(i)]);

    return result;
}

import { Telegraf } from 'telegraf';
import { Marked, type Token, type Tokens } from 'marked';
import type { ChannelAdapter } from './ChannelAdapter.js';
import { markdownToTelegramHtml } from '../utils/telegramHtml.js';
import type { IncomingMessage, InlineKeyboard, IncomingCallback, CallbackHandler } from '../types.js';

export const TELEGRAM_CHANNEL_TYPE = 'telegram';
export const TELEGRAM_MAX_MESSAGE_LENGTH = 4096;
const TELEGRAM_PARSE_MODE = 'HTML' as const;
const markdownLexer = new Marked();

type TelegramMessageChunk = {
    text: string;
    html: boolean;
};

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
    private callbackHandler: CallbackHandler | null = null;
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
            if (!this.callbackHandler) {
                try { await ctx.answerCbQuery(); } catch { /* ignore */ }
                return;
            }

            const query = ctx.callbackQuery as {
                id: string;
                data?: string;
                message?: { message_id: number; chat: { id: number | string } };
                from: { id: number | string };
            };

            const data = typeof query.data === 'string' ? query.data : '';
            if (!query.message) {
                try { await ctx.answerCbQuery(); } catch { /* ignore */ }
                return;
            }

            const cb: IncomingCallback = {
                channelType: TELEGRAM_CHANNEL_TYPE,
                chatId: String(query.message.chat.id),
                userId: String(query.from.id),
                messageId: query.message.message_id,
                callbackData: data,
                callbackQueryId: query.id,
                timestamp: new Date(),
            };

            try {
                await this.callbackHandler(cb);
            } catch {
                try { await ctx.answerCbQuery('Error'); } catch { /* ignore */ }
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
     * Long messages are chunked as markdown source before rendering so each
     * Telegram HTML payload is independently valid.
     */
    async sendMessage(chatId: string, text: string): Promise<void> {
        let chunks: TelegramMessageChunk[];
        try {
            chunks = chunkMarkdownForTelegram(text, TELEGRAM_MAX_MESSAGE_LENGTH);
        } catch {
            for (const chunk of chunkMessage(text, TELEGRAM_MAX_MESSAGE_LENGTH)) {
                await this.bot.telegram.sendMessage(chatId, chunk);
            }
            return;
        }

        for (const chunk of chunks) {
            if (!chunk.html) {
                await this.bot.telegram.sendMessage(chatId, chunk.text);
                continue;
            }

            try {
                await this.bot.telegram.sendMessage(chatId, chunk.text, { parse_mode: TELEGRAM_PARSE_MODE });
            } catch (error) {
                if (!isParseEntitiesError(error)) throw error;
                // Telegram rejected the rendered HTML — fall back to plain text
                // so the user still gets the content (just unformatted).
                await this.bot.telegram.sendMessage(chatId, htmlToPlainText(chunk.text));
            }
        }
    }

    onMessage(handler: (msg: IncomingMessage) => Promise<void>): void {
        this.messageHandler = handler;
    }

    onCallback(handler: CallbackHandler): void {
        this.callbackHandler = handler;
    }

    /**
     * Send a message with an inline keyboard. `html` is sent verbatim with
     * parse_mode=HTML — callers must pre-escape any user-controlled fields.
     * Returns the Telegram message_id of the sent message.
     */
    async sendInlineKeyboard(chatId: string, html: string, keyboard: InlineKeyboard): Promise<number> {
        const result = await this.bot.telegram.sendMessage(chatId, html, {
            parse_mode: TELEGRAM_PARSE_MODE,
            reply_markup: { inline_keyboard: toTelegrafKeyboard(keyboard) },
        }) as { message_id: number };
        return result.message_id;
    }

    /**
     * Replace the inline keyboard on an existing message. Pass `null` to remove
     * the keyboard entirely.
     */
    async editInlineKeyboard(chatId: string, messageId: number, keyboard: InlineKeyboard | null): Promise<void> {
        await this.bot.telegram.editMessageReplyMarkup(chatId, messageId, undefined, keyboard
            ? { inline_keyboard: toTelegrafKeyboard(keyboard) }
            : undefined);
    }

    /**
     * Acknowledge a callback_query. Without this Telegram leaves a spinner on
     * the tapped button. Pass `text` to show a transient toast.
     */
    async answerCallback(callbackQueryId: string, text?: string): Promise<void> {
        await this.bot.telegram.answerCbQuery(callbackQueryId, text);
    }

    async isHealthy(): Promise<boolean> {
        return this.running;
    }
}

function toTelegrafKeyboard(keyboard: InlineKeyboard): { text: string; callback_data: string }[][] {
    return keyboard.map((row) => row.map((btn) => ({ text: btn.text, callback_data: btn.callbackData })));
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

function chunkMarkdownForTelegram(markdown: string, maxLen: number): TelegramMessageChunk[] {
    const markdownChunks = splitMarkdownSource(markdown, maxLen);
    const chunks: TelegramMessageChunk[] = [];

    for (const markdownChunk of markdownChunks) {
        const html = markdownToTelegramHtml(markdownChunk);
        if (html.length <= maxLen) {
            if (html.length > 0) chunks.push({ text: html, html: true });
            continue;
        }

        for (const plainChunk of chunkMessage(markdownChunk, maxLen)) {
            if (plainChunk.length > 0) chunks.push({ text: plainChunk, html: false });
        }
    }

    return chunks;
}

function splitMarkdownSource(markdown: string, maxLen: number, depth = 0): string[] {
    if (markdown.length === 0) return [];
    if (renderedLengthFits(markdown, maxLen)) return [markdown];
    if (depth > 6) return splitPlainMarkdownText(markdown, maxLen);

    const chunks: string[] = [];
    let current = '';
    const tokens = markdownLexer.lexer(markdown);

    for (const token of tokens) {
        const raw = token.raw ?? '';
        if (raw.length === 0) continue;

        const candidate = current + raw;
        if (candidate.length > 0 && renderedLengthFits(candidate, maxLen)) {
            current = candidate;
            continue;
        }

        if (current.length > 0) {
            chunks.push(current);
            current = '';
        }

        if (renderedLengthFits(raw, maxLen)) {
            current = raw;
        } else {
            chunks.push(...splitOversizedToken(token, maxLen, depth + 1));
        }
    }

    if (current.length > 0) chunks.push(current);
    return chunks.flatMap((chunk) => renderedLengthFits(chunk, maxLen) ? [chunk] : splitPlainMarkdownText(chunk, maxLen));
}

function splitOversizedToken(token: Token, maxLen: number, depth: number): string[] {
    switch (token.type) {
        case 'code':
            return splitCodeToken(token as Tokens.Code, maxLen);
        case 'list':
            return splitListToken(token as Tokens.List, maxLen, depth);
        case 'paragraph':
        case 'text':
            return splitPlainMarkdownText(token.raw, maxLen);
        default:
            if ('tokens' in token && Array.isArray(token.tokens) && token.raw !== undefined) {
                return splitMarkdownSource(token.raw, maxLen, depth);
            }
            return splitPlainMarkdownText(token.raw ?? '', maxLen);
    }
}

function splitListToken(token: Tokens.List, maxLen: number, depth: number): string[] {
    const chunks: string[] = [];
    let current = '';

    for (const item of token.items) {
        const raw = item.raw;
        const candidate = current + raw;
        if (candidate.length > 0 && renderedLengthFits(candidate, maxLen)) {
            current = candidate;
            continue;
        }

        if (current.length > 0) {
            chunks.push(current);
            current = '';
        }

        if (renderedLengthFits(raw, maxLen)) {
            current = raw;
        } else {
            chunks.push(...splitMarkdownSource(raw, maxLen, depth + 1));
        }
    }

    if (current.length > 0) chunks.push(current);
    return chunks;
}

function splitCodeToken(token: Tokens.Code, maxLen: number): string[] {
    const fence = token.raw.startsWith('~~~') ? '~~~' : '```';
    const lang = token.lang ? token.lang.split(/\s/)[0] : '';
    const lines = token.text.split('\n');
    const chunks: string[] = [];
    let currentLines: string[] = [];

    const renderFence = (codeLines: string[]): string =>
        `${fence}${lang}\n${codeLines.join('\n')}\n${fence}\n\n`;

    for (const line of lines) {
        const candidateLines = [...currentLines, line];
        if (renderedLengthFits(renderFence(candidateLines), maxLen)) {
            currentLines = candidateLines;
            continue;
        }

        if (currentLines.length > 0) {
            chunks.push(renderFence(currentLines));
            currentLines = [];
        }

        if (renderedLengthFits(renderFence([line]), maxLen)) {
            currentLines = [line];
        } else {
            for (const segment of splitCodeLine(line, fence, lang, maxLen)) {
                chunks.push(renderFence([segment]));
            }
        }
    }

    if (currentLines.length > 0) chunks.push(renderFence(currentLines));
    return chunks;
}

function splitCodeLine(line: string, fence: string, lang: string, maxLen: number): string[] {
    const segments: string[] = [];
    let current = '';
    const renderFence = (value: string): string => `${fence}${lang}\n${value}\n${fence}\n\n`;

    for (const char of Array.from(line)) {
        const candidate = current + char;
        if (renderedLengthFits(renderFence(candidate), maxLen)) {
            current = candidate;
            continue;
        }

        if (current.length > 0) {
            segments.push(current);
            current = '';
        }

        if (renderedLengthFits(renderFence(char), maxLen)) {
            current = char;
        } else {
            segments.push(char);
        }
    }

    if (current.length > 0) segments.push(current);
    return segments;
}

function splitPlainMarkdownText(markdown: string, maxLen: number): string[] {
    if (markdown.length === 0) return [];
    if (renderedLengthFits(markdown, maxLen)) return [markdown];

    const newlineUnits = markdown.split(/(?<=\n)/u);
    if (newlineUnits.length > 1) {
        return packMarkdownUnits(newlineUnits, maxLen, splitPlainMarkdownText);
    }

    const sentenceUnits = markdown.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/gu);
    if (sentenceUnits && sentenceUnits.length > 1) {
        return packMarkdownUnits(sentenceUnits, maxLen, splitPlainMarkdownText);
    }

    const wordUnits = markdown.match(/\S+\s*/gu);
    if (wordUnits && wordUnits.length > 1) {
        return packMarkdownUnits(wordUnits, maxLen, splitPlainMarkdownText);
    }

    return splitByCodePoint(markdown, maxLen);
}

function packMarkdownUnits(
    units: string[],
    maxLen: number,
    splitOversized: (unit: string, maxLen: number) => string[],
): string[] {
    const chunks: string[] = [];
    let current = '';

    for (const unit of units) {
        const candidate = current + unit;
        if (renderedLengthFits(candidate, maxLen)) {
            current = candidate;
            continue;
        }

        if (current.length > 0) {
            chunks.push(current);
            current = '';
        }

        if (renderedLengthFits(unit, maxLen)) {
            current = unit;
        } else {
            chunks.push(...splitOversized(unit, maxLen));
        }
    }

    if (current.length > 0) chunks.push(current);
    return chunks;
}

function splitByCodePoint(text: string, maxLen: number): string[] {
    const chunks: string[] = [];
    let current = '';

    for (const char of Array.from(text)) {
        const candidate = current + char;
        if (renderedLengthFits(candidate, maxLen)) {
            current = candidate;
            continue;
        }

        if (current.length > 0) {
            chunks.push(current);
            current = '';
        }

        if (renderedLengthFits(char, maxLen)) {
            current = char;
        } else {
            chunks.push(char);
        }
    }

    if (current.length > 0) chunks.push(current);
    return chunks;
}

function renderedLengthFits(markdown: string, maxLen: number): boolean {
    return markdownToTelegramHtml(markdown).length <= maxLen;
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

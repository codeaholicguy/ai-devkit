import { Telegraf } from 'telegraf';
import type { ChannelAdapter } from '../ChannelAdapter.js';
import { TelegramMessageDelivery } from './TelegramMessageDelivery.js';
import { toTelegrafKeyboard } from './telegramKeyboard.js';
import type { IncomingMessage, InlineKeyboard, IncomingCallback, CallbackHandler } from '../../types.js';

export const TELEGRAM_CHANNEL_TYPE = 'telegram';
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
    private readonly delivery: TelegramMessageDelivery;
    private messageHandler: ((msg: IncomingMessage) => Promise<void>) | null = null;
    private callbackHandler: CallbackHandler | null = null;
    private running = false;

    constructor(options: TelegramAdapterOptions) {
        this.bot = new Telegraf(options.botToken);
        this.delivery = new TelegramMessageDelivery(this.bot.telegram);
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
        await this.delivery.send(chatId, text);
    }

    onMessage(handler: (msg: IncomingMessage) => Promise<void>): void {
        this.messageHandler = handler;
    }

    onCallback(handler: CallbackHandler): void {
        this.callbackHandler = handler;
    }

    /**
     * Send a message with an inline keyboard. `html` is sent verbatim with
     * parse_mode=HTML - callers must pre-escape any user-controlled fields.
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

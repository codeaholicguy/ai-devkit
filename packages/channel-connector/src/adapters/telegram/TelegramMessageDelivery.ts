import {
    chunkMarkdownForTelegram,
    chunkMessage,
    htmlToPlainText,
    isParseEntitiesError,
    type TelegramMessageChunk,
} from './telegramMarkdown.js';

export const TELEGRAM_MAX_MESSAGE_LENGTH = 4096;
const TELEGRAM_PARSE_MODE = 'HTML' as const;

interface TelegramSender {
    sendMessage(chatId: string, text: string, extra?: Record<string, unknown>): Promise<unknown>;
}

export class TelegramMessageDelivery {
    constructor(private readonly sender: TelegramSender) {}

    async send(chatId: string, text: string): Promise<void> {
        let chunks: TelegramMessageChunk[];
        try {
            chunks = chunkMarkdownForTelegram(text, TELEGRAM_MAX_MESSAGE_LENGTH);
        } catch {
            for (const chunk of chunkMessage(text, TELEGRAM_MAX_MESSAGE_LENGTH)) {
                await this.sender.sendMessage(chatId, chunk);
            }
            return;
        }

        for (const chunk of chunks) {
            if (!chunk.html) {
                await this.sender.sendMessage(chatId, chunk.text);
                continue;
            }

            try {
                await this.sender.sendMessage(chatId, chunk.text, { parse_mode: TELEGRAM_PARSE_MODE });
            } catch (error) {
                if (!isParseEntitiesError(error)) throw error;
                // Telegram rejected the rendered HTML - fall back to plain text
                // so the user still gets the content (just unformatted).
                await this.sender.sendMessage(chatId, htmlToPlainText(chunk.text));
            }
        }
    }
}

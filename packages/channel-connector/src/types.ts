/**
 * An incoming message from a messaging platform.
 * Generic — no agent-specific concepts.
 */
export interface IncomingMessage {
    channelType: string;
    chatId: string;
    userId: string;
    text: string;
    timestamp: Date;
    metadata?: Record<string, unknown>;
}

/**
 * Handler function provided by the consumer (e.g., CLI).
 * Fire-and-forget — returns void. Responses are sent separately via sendMessage().
 */
export type MessageHandler = (message: IncomingMessage) => Promise<void>;

/**
 * Root configuration for all channels.
 */
export interface ChannelConfig {
    channels: Record<string, ChannelEntry>;
}

/**
 * Configuration entry for a single channel.
 */
export interface ChannelEntry {
    type: ChannelType;
    enabled: boolean;
    createdAt: string;
    config: TelegramConfig;
}

/**
 * Supported channel types.
 */
export type ChannelType = 'telegram' | 'slack' | 'whatsapp';

/**
 * Telegram-specific configuration.
 */
export interface TelegramConfig {
    botToken: string;
    botUsername: string;
    authorizedChatId?: number;
}

/**
 * A single button in a Telegram-style inline keyboard.
 */
export interface InlineKeyboardButton {
    text: string;
    callbackData: string;
}

/**
 * An inline keyboard layout: rows of buttons.
 */
export type InlineKeyboard = InlineKeyboardButton[][];

/**
 * An inline-keyboard tap delivered as a callback_query.
 */
export interface IncomingCallback {
    channelType: string;
    chatId: string;
    userId: string;
    messageId: number;
    callbackData: string;
    callbackQueryId: string;
    timestamp: Date;
}

/**
 * Handler for inline-keyboard taps.
 */
export type CallbackHandler = (callback: IncomingCallback) => Promise<void>;

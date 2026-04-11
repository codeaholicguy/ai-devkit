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

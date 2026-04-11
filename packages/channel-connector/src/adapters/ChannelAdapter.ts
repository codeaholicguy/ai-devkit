import type { IncomingMessage } from '../types';

/**
 * Interface for messaging platform adapters.
 *
 * Implementations connect to a specific platform (Telegram, Slack, etc.)
 * and provide a generic send/receive abstraction.
 */
export interface ChannelAdapter {
    /** Identifier for this channel type (e.g., 'telegram') */
    readonly type: string;

    /** Start listening for incoming messages */
    start(): Promise<void>;

    /** Stop listening and clean up resources */
    stop(): Promise<void>;

    /**
     * Send a message to a specific chat.
     * Implementations should handle platform-specific limits
     * (e.g., chunking at 4096 chars for Telegram).
     */
    sendMessage(chatId: string, text: string): Promise<void>;

    /**
     * Register a handler for incoming text messages.
     * Fire-and-forget — handler returns void.
     * Responses are sent separately via sendMessage().
     */
    onMessage(handler: (msg: IncomingMessage) => Promise<void>): void;

    /** Check if the adapter is connected and healthy */
    isHealthy(): Promise<boolean>;
}

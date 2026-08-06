import type {
    ChannelQuestion,
    IncomingInteraction,
    IncomingMessage,
    SendMessageOptions,
    SentMessage,
} from '../types.js';

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
    sendMessage(chatId: string, text: string, options?: SendMessageOptions): Promise<SentMessage | void>;

    /**
     * Register a handler for incoming text messages.
     * Fire-and-forget — handler returns void.
     * Responses are sent separately via sendMessage().
     */
    onMessage(handler: (msg: IncomingMessage) => Promise<void>): void;

    /** Check if the adapter is connected and healthy */
    isHealthy(): Promise<boolean>;
}

export interface InteractiveChannelAdapter extends ChannelAdapter {
    onInteraction(handler: (interaction: IncomingInteraction) => Promise<void>): void;
    sendQuestion(chatId: string, question: ChannelQuestion): Promise<SentMessage>;
    finalizeInteraction(chatId: string, messageId: string): Promise<void>;
}

export function isInteractiveChannelAdapter(adapter: ChannelAdapter): adapter is InteractiveChannelAdapter {
    return 'onInteraction' in adapter
        && 'sendQuestion' in adapter
        && 'finalizeInteraction' in adapter;
}

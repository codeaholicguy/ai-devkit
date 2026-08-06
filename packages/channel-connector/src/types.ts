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
    messageId?: string;
    threadId?: string;
    workspaceId?: string;
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
interface BaseChannelEntry {
    enabled: boolean;
    createdAt: string;
}

export interface TelegramChannelEntry extends BaseChannelEntry {
    type: 'telegram';
    config: TelegramConfig;
}

export interface SlackChannelEntry extends BaseChannelEntry {
    type: 'slack';
    config: SlackConfig;
}

export interface OtherChannelEntry extends BaseChannelEntry {
    type: Exclude<ChannelType, 'telegram' | 'slack'>;
    config: Record<string, unknown>;
}

export type ChannelEntry = TelegramChannelEntry | SlackChannelEntry | OtherChannelEntry;

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

export interface SlackConfig {
    appToken: string;
    botToken: string;
    appId: string;
    botUserId: string;
    workspaceId: string;
    workspaceName?: string;
    authorizedUserId?: string;
    authorizedConversationId?: string;
    transport: 'socket-mode';
    audience: 'dm';
}

export function isSlackEntry(entry: ChannelEntry): entry is SlackChannelEntry {
    return entry.type === 'slack';
}

export interface SendMessageOptions {
    threadId?: string;
}

export interface SentMessage {
    messageId: string;
    threadId?: string;
}

export interface ChannelQuestionOption {
    label: string;
    description?: string;
    value: string;
}

export interface ChannelQuestion {
    id: string;
    question: string;
    header?: string;
    options: ChannelQuestionOption[];
    allowSkip: boolean;
}

export interface IncomingInteraction {
    channelType: string;
    chatId: string;
    userId: string;
    interactionId: string;
    messageId: string;
    actionId: string;
    value: string;
    workspaceId?: string;
    timestamp: Date;
}

export type InteractionHandler = (interaction: IncomingInteraction) => Promise<void>;

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

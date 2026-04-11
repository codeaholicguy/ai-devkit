export { ChannelManager } from './ChannelManager';
export { ConfigStore } from './ConfigStore';
export { TelegramAdapter, TELEGRAM_CHANNEL_TYPE, TELEGRAM_MAX_MESSAGE_LENGTH } from './adapters/TelegramAdapter';
export type { TelegramAdapterOptions } from './adapters/TelegramAdapter';

export type { ChannelAdapter } from './adapters/ChannelAdapter';

export type {
    IncomingMessage,
    MessageHandler,
    ChannelConfig,
    ChannelEntry,
    ChannelType,
    TelegramConfig,
} from './types';

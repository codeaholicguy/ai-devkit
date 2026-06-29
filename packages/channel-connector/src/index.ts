export { ChannelManager } from './ChannelManager.js';
export { ConfigStore } from './ConfigStore.js';
export { TelegramAdapter, TELEGRAM_CHANNEL_TYPE, TELEGRAM_MAX_MESSAGE_LENGTH } from './adapters/TelegramAdapter.js';
export type { TelegramAdapterOptions } from './adapters/TelegramAdapter.js';

export type { ChannelAdapter } from './adapters/ChannelAdapter.js';

export type {
    IncomingMessage,
    MessageHandler,
    ChannelConfig,
    ChannelEntry,
    ChannelType,
    TelegramConfig,
    InlineKeyboardButton,
    InlineKeyboard,
    IncomingCallback,
    CallbackHandler,
} from './types.js';

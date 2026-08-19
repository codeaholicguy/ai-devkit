export { ChannelManager } from './ChannelManager.js';
export { ChannelConfigRepository } from './ChannelConfigRepository.js';
export { TelegramAdapter, TELEGRAM_CHANNEL_TYPE } from './adapters/telegram/TelegramAdapter.js';
export {
    SlackAdapter,
    SLACK_CHANNEL_TYPE,
    validateSlackAppToken,
    validateSlackCredentials,
} from './adapters/slack/SlackAdapter.js';
export type { SlackIdentity } from './adapters/slack/SlackAdapter.js';
export type { TelegramAdapterOptions } from './adapters/telegram/TelegramAdapter.js';

export { isInteractiveChannelAdapter } from './adapters/ChannelAdapter.js';
export type { ChannelAdapter, InteractiveChannelAdapter } from './adapters/ChannelAdapter.js';

export type {
    IncomingMessage,
    MessageHandler,
    ChannelConfig,
    ChannelEntry,
    ChannelType,
    TelegramConfig,
    SlackConfig,
    SlackChannelEntry,
    SendMessageOptions,
    SentMessage,
    ChannelQuestion,
    ChannelQuestionOption,
    IncomingInteraction,
    InteractionHandler,
    InlineKeyboardButton,
    InlineKeyboard,
    IncomingCallback,
    CallbackHandler,
} from './types.js';

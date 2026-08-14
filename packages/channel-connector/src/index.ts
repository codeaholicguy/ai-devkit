export { ChannelManager } from './ChannelManager.js';
export { ConfigStore } from './ConfigStore.js';
export { TelegramAdapter, TELEGRAM_CHANNEL_TYPE, TELEGRAM_MAX_MESSAGE_LENGTH } from './adapters/TelegramAdapter.js';
export {
    SlackAdapter,
    SLACK_CHANNEL_TYPE,
    validateSlackAppToken,
    validateSlackCredentials,
} from './adapters/SlackAdapter.js';
export type { SlackIdentity } from './adapters/SlackAdapter.js';
export {
    SLACK_MAX_MESSAGE_LENGTH,
    chunkMarkdownForSlack,
    escapeSlackText,
    markdownToSlackMrkdwn,
} from './utils/slackMarkdown.js';
export { SlackDeliveryQueue } from './utils/SlackDeliveryQueue.js';
export type { TelegramAdapterOptions } from './adapters/TelegramAdapter.js';

export { ChannelService } from './services/ChannelService.js';
export type {
    ChannelBridgeProcess,
    StartDaemonBridgeInput,
    StopBridgeResult,
} from './services/ChannelService.js';
export { createChannelActionService } from './services/ChannelActionService.js';
export type {
    ChannelActionReporter,
    ChannelActionResult,
    ChannelActionService,
    ChannelActionServiceDependencies,
    DaemonLaunch,
    StartDaemonChannelInput,
    StopChannelInput,
} from './services/ChannelActionService.js';

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

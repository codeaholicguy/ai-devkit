import { SocketModeClient } from '@slack/socket-mode';
import { WebClient } from '@slack/web-api';
import type { InteractiveChannelAdapter } from './ChannelAdapter.js';
import type {
    ChannelQuestion,
    IncomingInteraction,
    IncomingMessage,
    SentMessage,
    SlackConfig,
} from '../types.js';
import { SlackDeliveryQueue } from '../utils/SlackDeliveryQueue.js';
import { escapeSlackText } from '../utils/slackMarkdown.js';

export const SLACK_CHANNEL_TYPE = 'slack';

interface SlackAuthClient {
    authTest(): Promise<{ ok?: boolean; app_id?: string; user_id?: string; team_id?: string; team?: string }>;
}

export interface SlackIdentity {
    appId?: string;
    botUserId: string;
    workspaceId: string;
    workspaceName?: string;
}

interface SlackConnectionsClient {
    open(): Promise<{ ok?: boolean; url?: string }>;
}

export async function validateSlackAppToken(appToken: string, client?: SlackConnectionsClient): Promise<void> {
    const connections = client ?? new WebClient(appToken).apps.connections;
    const result = await connections.open();
    if (!result.ok || !result.url) throw new Error('Slack app token cannot open Socket Mode');
}

export async function validateSlackCredentials(botToken: string, client?: SlackAuthClient): Promise<SlackIdentity> {
    const authClient = client ?? {
        authTest: () => new WebClient(botToken).auth.test(),
    };
    const identity = await authClient.authTest();
    if (!identity.ok || !identity.user_id || !identity.team_id) {
        throw new Error('Slack bot token returned incomplete identity');
    }
    return {
        ...(identity.app_id ? { appId: identity.app_id } : {}),
        botUserId: identity.user_id,
        workspaceId: identity.team_id,
        workspaceName: identity.team,
    };
}

interface SocketClientLike {
    on(event: string, listener: (payload?: unknown) => void): unknown;
    start(): Promise<unknown>;
    disconnect(): Promise<unknown>;
}

interface WebClientLike {
    chat: {
        postMessage(input: Record<string, unknown>): Promise<{ ok?: boolean; ts?: string }>;
        update?(input: Record<string, unknown>): Promise<unknown>;
    };
}

interface SlackAdapterDependencies {
    socketClient?: SocketClientLike;
    webClient?: WebClientLike;
}

interface SlackEventEnvelope {
    type?: string;
    ack?: () => Promise<void>;
    body?: {
        team_id?: string;
        event_id?: string;
        is_ext_shared_channel?: boolean;
        event?: Record<string, unknown>;
    };
}

export class SlackAdapter implements InteractiveChannelAdapter {
    readonly type = SLACK_CHANNEL_TYPE;
    private readonly socket: SocketClientLike;
    private readonly web: WebClientLike;
    private readonly delivery: SlackDeliveryQueue;
    private readonly recentEventIds = new Map<string, number>();
    private messageHandler: ((message: IncomingMessage) => Promise<void>) | null = null;
    private interactionHandler: ((interaction: IncomingInteraction) => Promise<void>) | null = null;
    private running = false;
    private listenersRegistered = false;

    constructor(private readonly config: SlackConfig, dependencies: SlackAdapterDependencies = {}) {
        this.socket = dependencies.socketClient ?? new SocketModeClient({ appToken: config.appToken });
        this.web = dependencies.webClient ?? new WebClient(config.botToken) as unknown as WebClientLike;
        this.delivery = new SlackDeliveryQueue({
            postMessage: (input) => this.web.chat.postMessage(input),
        });
    }

    async start(): Promise<void> {
        if (!this.listenersRegistered) {
            this.socket.on('slack_event', (payload) => {
                void this.handleSlackEvent(payload as SlackEventEnvelope).catch(() => undefined);
            });
            this.socket.on('interactive', (payload) => {
                void this.handleInteraction(payload as SlackInteractionEnvelope).catch(() => undefined);
            });
            this.socket.on('connected', () => { this.running = true; });
            this.socket.on('disconnected', () => { this.running = false; });
            this.listenersRegistered = true;
        }
        await this.socket.start();
        this.running = true;
    }

    async stop(): Promise<void> {
        this.running = false;
        await this.socket.disconnect();
    }

    onMessage(handler: (message: IncomingMessage) => Promise<void>): void {
        this.messageHandler = handler;
    }

    onInteraction(handler: (interaction: IncomingInteraction) => Promise<void>): void {
        this.interactionHandler = handler;
    }

    async sendMessage(chatId: string, text: string): Promise<SentMessage> {
        return this.delivery.send(chatId, text);
    }

    async isHealthy(): Promise<boolean> {
        return this.running;
    }

    async sendQuestion(chatId: string, question: ChannelQuestion): Promise<SentMessage> {
        const fallback = escapeSlackText(`${question.header ? `${question.header}: ` : ''}${question.question}`);
        const elements = question.options.map((option) => ({
            type: 'button',
            action_id: 'ai_devkit_question',
            text: { type: 'plain_text', text: option.label.slice(0, 75) },
            value: `${question.id}:${option.value}`.slice(0, 2000),
        }));
        if (question.allowSkip) {
            elements.push({
                type: 'button', action_id: 'ai_devkit_question',
                text: { type: 'plain_text', text: 'Skip' }, value: `${question.id}:skip`,
            });
        }
        const response = await this.web.chat.postMessage({
            channel: chatId,
            text: fallback,
            blocks: [
                {
                    type: 'section',
                    text: { type: 'mrkdwn', text: `*${escapeSlackText(question.header ?? 'Question')}*\n${escapeSlackText(question.question)}` },
                },
                { type: 'actions', elements },
            ],
        });
        if (!response.ts) throw new Error('Slack did not return a question message timestamp');
        return { messageId: response.ts };
    }

    async finalizeInteraction(chatId: string, messageId: string): Promise<void> {
        if (!this.web.chat.update) throw new Error('Slack Web API chat.update is unavailable');
        await this.web.chat.update({ channel: chatId, ts: messageId, blocks: [] });
    }

    private async handleSlackEvent(envelope: SlackEventEnvelope): Promise<void> {
        if (envelope.type !== 'events_api') return;
        await envelope.ack?.();
        const body = envelope.body;
        const event = body?.event;
        const eventId = body?.event_id;
        if (!body || !event || !eventId || !this.messageHandler) return;
        if (!this.isValidDirectMessage(body, event)) return;
        if (this.recentEventIds.has(eventId)) return;
        this.rememberEvent(eventId);

        try {
            await this.messageHandler({
                channelType: SLACK_CHANNEL_TYPE,
                chatId: String(event.channel),
                userId: String(event.user),
                text: String(event.text),
                timestamp: new Date(Number(event.event_ts ?? event.ts) * 1000),
                messageId: eventId,
                threadId: typeof event.thread_ts === 'string' ? event.thread_ts : undefined,
                workspaceId: body.team_id,
                metadata: { slackTs: event.ts },
            });
        } catch {
            // The channel consumer reports terminal errors; never reject a Socket Mode listener.
        }
    }

    private isValidDirectMessage(body: NonNullable<SlackEventEnvelope['body']>, event: Record<string, unknown>): boolean {
        return body.team_id === this.config.workspaceId
            && body.is_ext_shared_channel !== true
            && event.type === 'message'
            && event.channel_type === 'im'
            && event.user !== this.config.botUserId
            && typeof event.text === 'string'
            && typeof event.ts === 'string'
            && event.subtype === undefined
            && event.bot_id === undefined;
    }

    private rememberEvent(eventId: string): void {
        this.recentEventIds.set(eventId, Date.now());
        while (this.recentEventIds.size > 1000) {
            const oldest = this.recentEventIds.keys().next().value as string | undefined;
            if (!oldest) break;
            this.recentEventIds.delete(oldest);
        }
    }

    private async handleInteraction(envelope: SlackInteractionEnvelope): Promise<void> {
        await envelope.ack?.();
        const body = envelope.body;
        const action = body?.actions?.[0];
        const interactionId = action?.action_ts;
        const workspaceId = body?.team?.id;
        const userId = body?.user?.id;
        const chatId = body?.channel?.id;
        const messageId = body?.container?.message_ts;
        if (!body || !action || !interactionId || !this.interactionHandler) return;
        if (body.type !== 'block_actions'
            || typeof workspaceId !== 'string'
            || typeof userId !== 'string'
            || typeof chatId !== 'string'
            || workspaceId !== this.config.workspaceId
            || typeof messageId !== 'string'
            || action.action_id !== 'ai_devkit_question'
            || typeof action.value !== 'string'
            || this.recentEventIds.has(`interaction:${interactionId}`)) return;
        this.rememberEvent(`interaction:${interactionId}`);
        try {
            await this.interactionHandler({
                channelType: SLACK_CHANNEL_TYPE,
                chatId,
                userId,
                workspaceId,
                interactionId,
                messageId,
                actionId: action.action_id,
                value: action.value,
                timestamp: new Date(Number(interactionId) * 1000),
            });
        } catch {
            // Keep Socket Mode listener failures isolated from the SDK event loop.
        }
    }
}

interface SlackInteractionEnvelope {
    ack?: () => Promise<void>;
    body?: {
        type?: string;
        team?: { id?: string };
        user?: { id?: string };
        channel?: { id?: string };
        container?: { message_ts?: string };
        actions?: Array<{ action_id?: string; action_ts?: string; value?: string }>;
    };
}

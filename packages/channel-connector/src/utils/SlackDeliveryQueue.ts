import type { SentMessage } from '../types.js';
import { chunkMarkdownForSlack, SLACK_MAX_MESSAGE_LENGTH } from './slackMarkdown.js';

interface SlackPoster {
    postMessage(input: {
        channel: string;
        text: string;
        mrkdwn: true;
        unfurl_links: false;
        unfurl_media: false;
        thread_ts?: string;
        blocks?: unknown[];
    }): Promise<{ ok?: boolean; ts?: string }>;
}

interface DeliveryOptions {
    maxMessageLength?: number;
    maxQueueSize?: number;
    sleep?: (milliseconds: number) => Promise<void>;
}

interface ConversationState {
    tail: Promise<void>;
    pending: number;
}

const defaultSleep = (milliseconds: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, milliseconds));

export class SlackDeliveryQueue {
    private readonly states = new Map<string, ConversationState>();
    private readonly maxMessageLength: number;
    private readonly maxQueueSize: number;
    private readonly sleep: (milliseconds: number) => Promise<void>;

    constructor(private readonly client: SlackPoster, options: DeliveryOptions = {}) {
        this.maxMessageLength = options.maxMessageLength ?? SLACK_MAX_MESSAGE_LENGTH;
        this.maxQueueSize = options.maxQueueSize ?? 100;
        this.sleep = options.sleep ?? defaultSleep;
    }

    async send(channel: string, markdown: string): Promise<SentMessage> {
        const state = this.states.get(channel) ?? { tail: Promise.resolve(), pending: 0 };
        if (state.pending >= this.maxQueueSize) {
            throw new Error('Slack delivery queue is full');
        }
        state.pending += 1;
        this.states.set(channel, state);

        let resolveResult!: (result: SentMessage) => void;
        let rejectResult!: (error: unknown) => void;
        const result = new Promise<SentMessage>((resolve, reject) => {
            resolveResult = resolve;
            rejectResult = reject;
        });

        state.tail = state.tail.then(async () => {
            try {
                resolveResult(await this.deliver(channel, markdown));
            } catch (error) {
                rejectResult(error);
            } finally {
                state.pending -= 1;
                if (state.pending === 0) this.states.delete(channel);
            }
        });
        return result;
    }

    private async deliver(channel: string, markdown: string): Promise<SentMessage> {
        const chunks = chunkMarkdownForSlack(markdown, this.maxMessageLength);
        if (chunks.length === 0) throw new Error('Cannot send an empty Slack message');
        let parentTs: string | undefined;

        for (const text of chunks) {
            const response = await this.postWithRateLimit({
                channel,
                text,
                mrkdwn: true,
                unfurl_links: false,
                unfurl_media: false,
                ...(parentTs ? { thread_ts: parentTs } : {}),
            });
            if (!response.ts) throw new Error('Slack did not return a message timestamp');
            parentTs ??= response.ts;
        }

        return { messageId: parentTs!, threadId: parentTs };
    }

    private async postWithRateLimit(input: Parameters<SlackPoster['postMessage']>[0]): Promise<{ ok?: boolean; ts?: string }> {
        try {
            return await this.client.postMessage(input);
        } catch (error) {
            const retryAfter = readRetryAfter(error);
            if (retryAfter === undefined) throw error;
            await this.sleep(Math.min(retryAfter * 1000, 60_000));
            return this.client.postMessage(input);
        }
    }
}

function readRetryAfter(error: unknown): number | undefined {
    if (!error || typeof error !== 'object') return undefined;
    const value = (error as { retryAfter?: unknown }).retryAfter;
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

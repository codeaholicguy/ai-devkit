import type {
    ChannelQuestion,
    IncomingInteraction,
    InteractiveChannelAdapter,
} from '@ai-devkit/channel-connector';
import { parseAskUserQuestionInput } from './ask-user-question.js';

interface ActiveQuestion {
    id: string;
    chatId: string;
    messageId: string;
    validValues: Set<string>;
    expiresAt: number;
}

interface SlackQuestionOptions {
    now?: () => number;
    ttlMs?: number;
}

export class SlackQuestionService {
    private readonly active = new Map<string, ActiveQuestion>();
    private nextId = 1;

    constructor(
        private readonly slack: Pick<InteractiveChannelAdapter, 'sendQuestion' | 'finalizeInteraction'>,
        private readonly sendKey: (key: string) => Promise<void>,
        private readonly options: SlackQuestionOptions = {},
    ) {}

    async tryHandle(toolInput: Record<string, unknown>, chatId: string): Promise<boolean> {
        const spec = parseAskUserQuestionInput(toolInput);
        if (!spec || spec.multiSelect) return false;
        const id = (this.nextId++).toString(36);
        const question: ChannelQuestion = {
            id,
            question: spec.question,
            header: spec.header,
            allowSkip: true,
            options: spec.options.map((option, index) => ({
                ...option,
                value: String(index + 1),
            })),
        };
        const sent = await this.slack.sendQuestion(chatId, question);
        this.active.set(id, {
            id,
            chatId,
            messageId: sent.messageId,
            validValues: new Set(question.options.map((option) => option.value)),
            expiresAt: this.now() + (this.options.ttlMs ?? 10 * 60 * 1000),
        });
        return true;
    }

    async handleInteraction(interaction: IncomingInteraction): Promise<void> {
        const separator = interaction.value.indexOf(':');
        if (separator <= 0) return;
        const id = interaction.value.slice(0, separator);
        const value = interaction.value.slice(separator + 1);
        const session = this.active.get(id);
        if (session && this.now() > session.expiresAt) {
            this.active.delete(id);
            return;
        }
        if (!session
            || session.chatId !== interaction.chatId
            || session.messageId !== interaction.messageId
            || (value !== 'skip' && !session.validValues.has(value))) return;
        this.active.delete(id);
        await this.slack.finalizeInteraction(session.chatId, session.messageId);
        await this.sendKey(value === 'skip' ? '\x1b' : value);
    }

    private now(): number {
        return (this.options.now ?? Date.now)();
    }
}

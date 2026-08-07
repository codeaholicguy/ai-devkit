import type { IncomingInteraction, InteractiveChannelAdapter } from '@ai-devkit/channel-connector';
import { SlackQuestionService } from '../../../services/channel/slack-question.js';

function adapter() {
    return {
        sendQuestion: vi.fn().mockResolvedValue({ messageId: '100.1' }),
        finalizeInteraction: vi.fn().mockResolvedValue(undefined),
    } as unknown as InteractiveChannelAdapter;
}

const input = {
    questions: [{
        question: 'Choose one', header: 'Scope', multiSelect: false,
        options: [{ label: 'Safe', description: 'Read only' }, { label: 'Fast' }],
    }],
};

describe('SlackQuestionService', () => {
    it('renders a single-select question and sends one selected digit', async () => {
        const slack = adapter();
        const sendKey = vi.fn().mockResolvedValue(undefined);
        const service = new SlackQuestionService(slack, sendKey);
        expect(await service.tryHandle(input, 'D123')).toBe(true);
        const question = vi.mocked(slack.sendQuestion).mock.calls[0][1];
        expect(question.options.map((option) => option.value)).toEqual(['1', '2']);
        const interaction: IncomingInteraction = {
            channelType: 'slack', chatId: 'D123', userId: 'U123', workspaceId: 'T123',
            interactionId: 'I1', messageId: '100.1', actionId: 'ai_devkit_question',
            value: `${question.id}:2`, timestamp: new Date(),
        };
        await service.handleInteraction(interaction);
        await service.handleInteraction(interaction);
        expect(sendKey).toHaveBeenCalledOnce();
        expect(sendKey).toHaveBeenCalledWith('2');
        expect(slack.finalizeInteraction).toHaveBeenCalledWith('D123', '100.1');
    });

    it('sends Escape for Skip and ignores stale or malformed actions', async () => {
        const slack = adapter();
        const sendKey = vi.fn().mockResolvedValue(undefined);
        const service = new SlackQuestionService(slack, sendKey);
        await service.tryHandle(input, 'D123');
        const question = vi.mocked(slack.sendQuestion).mock.calls[0][1];
        const base = {
            channelType: 'slack', chatId: 'D123', userId: 'U123', interactionId: 'I1',
            messageId: '100.1', actionId: 'ai_devkit_question', timestamp: new Date(),
        };
        await service.handleInteraction({ ...base, value: 'missing:1' });
        await service.handleInteraction({ ...base, value: `${question.id}:skip` });
        expect(sendKey).toHaveBeenCalledOnce();
        expect(sendKey).toHaveBeenCalledWith('\x1b');
    });

    it('falls back for multi-select and malformed question payloads', async () => {
        const slack = adapter();
        const service = new SlackQuestionService(slack, vi.fn());
        expect(await service.tryHandle({ questions: [{ ...input.questions[0], multiSelect: true }] }, 'D123')).toBe(false);
        expect(await service.tryHandle({}, 'D123')).toBe(false);
        expect(slack.sendQuestion).not.toHaveBeenCalled();
    });

    it('rejects an interaction after the question expires', async () => {
        const slack = adapter();
        const sendKey = vi.fn().mockResolvedValue(undefined);
        let now = 1_000;
        const service = new SlackQuestionService(slack, sendKey, {
            now: () => now,
            ttlMs: 10,
        });
        await service.tryHandle(input, 'D123');
        const question = vi.mocked(slack.sendQuestion).mock.calls[0][1];
        now = 1_011;

        await service.handleInteraction({
            channelType: 'slack', chatId: 'D123', userId: 'U123', workspaceId: 'T123',
            interactionId: 'I1', messageId: '100.1', actionId: 'ai_devkit_question',
            value: `${question.id}:1`, timestamp: new Date(),
        });

        expect(sendKey).not.toHaveBeenCalled();
        expect(slack.finalizeInteraction).not.toHaveBeenCalled();
    });
});

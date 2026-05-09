import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import type { AgentAdapter, AgentInfo, ConversationMessage } from '@ai-devkit/agent-manager';
import { AgentStatus } from '@ai-devkit/agent-manager';
import type { TelegramAdapter } from '@ai-devkit/channel-connector';
import { ui } from '../../util/terminal-ui';

jest.mock('../../util/terminal-ui', () => ({
    ui: {
        text: jest.fn(),
        info: jest.fn(),
        success: jest.fn(),
        warning: jest.fn(),
        error: jest.fn(),
    },
}));

// Imported AFTER mocks so the module under test picks up the mocked ui
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { startOutputPolling } = require('../../commands/channel');

const POLL_INTERVAL_MS = 2000;

function makeAgent(overrides: Partial<AgentInfo> = {}): AgentInfo {
    return {
        name: 'test-agent',
        type: 'claude',
        status: AgentStatus.RUNNING,
        summary: 'session',
        pid: 12345,
        projectPath: '/tmp/proj',
        sessionId: 'session-1',
        lastActive: new Date(),
        sessionFilePath: '/tmp/session.jsonl',
        ...overrides,
    };
}

function makeMessage(overrides: Partial<ConversationMessage> = {}): ConversationMessage {
    return {
        role: 'assistant',
        content: 'agent reply',
        timestamp: new Date(),
        ...overrides,
    } as ConversationMessage;
}

describe('startOutputPolling', () => {
    let agentAdapter: jest.Mocked<Pick<AgentAdapter, 'getConversation'>>;
    let telegram: { sendMessage: jest.Mock<(chatId: string, text: string) => Promise<void>> };
    let chatIdRef: { value: string | null };
    let interval: NodeJS.Timeout | null;

    beforeEach(() => {
        jest.useFakeTimers();
        agentAdapter = { getConversation: jest.fn() };
        telegram = { sendMessage: jest.fn(() => Promise.resolve()) };
        chatIdRef = { value: null };
        interval = null;
        jest.clearAllMocks();
    });

    afterEach(() => {
        if (interval) clearInterval(interval);
        jest.useRealTimers();
    });

    it('seeds lastMessageCount from initial getConversation so existing messages are not re-sent', async () => {
        const existing = [makeMessage({ content: 'old' })];
        agentAdapter.getConversation.mockReturnValueOnce(existing);

        interval = startOutputPolling(
            telegram as unknown as TelegramAdapter,
            agentAdapter as unknown as AgentAdapter,
            makeAgent(),
            chatIdRef,
        );

        chatIdRef.value = '419354621';

        // Tick: getConversation returns same single message → no new messages
        agentAdapter.getConversation.mockReturnValueOnce(existing);
        await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

        expect(telegram.sendMessage).not.toHaveBeenCalled();
    });

    it('skips ticks when no chat is authorized yet', async () => {
        agentAdapter.getConversation.mockReturnValue([]);
        interval = startOutputPolling(
            telegram as unknown as TelegramAdapter,
            agentAdapter as unknown as AgentAdapter,
            makeAgent(),
            { value: null },
        );

        await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3);

        // Only the initial seed call — no per-tick getConversation since we early-return
        expect(agentAdapter.getConversation).toHaveBeenCalledTimes(1);
        expect(telegram.sendMessage).not.toHaveBeenCalled();
    });

    it('skips ticks when agent has no sessionFilePath', async () => {
        const agent = makeAgent({ sessionFilePath: undefined });
        interval = startOutputPolling(
            telegram as unknown as TelegramAdapter,
            agentAdapter as unknown as AgentAdapter,
            agent,
            { value: '419354621' },
        );

        await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3);

        // Initial seed is gated by sessionFilePath too, so getConversation never called
        expect(agentAdapter.getConversation).not.toHaveBeenCalled();
        expect(telegram.sendMessage).not.toHaveBeenCalled();
    });

    it('sends new assistant messages to Telegram', async () => {
        agentAdapter.getConversation.mockReturnValueOnce([]); // initial seed
        interval = startOutputPolling(
            telegram as unknown as TelegramAdapter,
            agentAdapter as unknown as AgentAdapter,
            makeAgent(),
            chatIdRef,
        );

        chatIdRef.value = '419354621';
        agentAdapter.getConversation.mockReturnValueOnce([
            makeMessage({ role: 'assistant', content: 'reply A' }),
            makeMessage({ role: 'assistant', content: 'reply B' }),
        ]);

        await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

        expect(telegram.sendMessage).toHaveBeenCalledTimes(2);
        expect(telegram.sendMessage).toHaveBeenCalledWith('419354621', 'reply A');
        expect(telegram.sendMessage).toHaveBeenCalledWith('419354621', 'reply B');
    });

    it('skips messages with role "user"', async () => {
        agentAdapter.getConversation.mockReturnValueOnce([]);
        interval = startOutputPolling(
            telegram as unknown as TelegramAdapter,
            agentAdapter as unknown as AgentAdapter,
            makeAgent(),
            chatIdRef,
        );

        chatIdRef.value = '419354621';
        agentAdapter.getConversation.mockReturnValueOnce([
            makeMessage({ role: 'user', content: 'inbound — already delivered to terminal' }),
            makeMessage({ role: 'assistant', content: 'outbound' }),
        ]);

        await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

        expect(telegram.sendMessage).toHaveBeenCalledTimes(1);
        expect(telegram.sendMessage).toHaveBeenCalledWith('419354621', 'outbound');
    });

    it('skips messages with empty/missing content', async () => {
        agentAdapter.getConversation.mockReturnValueOnce([]);
        interval = startOutputPolling(
            telegram as unknown as TelegramAdapter,
            agentAdapter as unknown as AgentAdapter,
            makeAgent(),
            chatIdRef,
        );

        chatIdRef.value = '419354621';
        agentAdapter.getConversation.mockReturnValueOnce([
            makeMessage({ role: 'assistant', content: '' }),
            makeMessage({ role: 'assistant', content: undefined as unknown as string }),
            makeMessage({ role: 'assistant', content: 'has content' }),
        ]);

        await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

        expect(telegram.sendMessage).toHaveBeenCalledTimes(1);
        expect(telegram.sendMessage).toHaveBeenCalledWith('419354621', 'has content');
    });

    it('does not crash if getConversation throws (agent terminated)', async () => {
        agentAdapter.getConversation.mockReturnValueOnce([]); // seed
        interval = startOutputPolling(
            telegram as unknown as TelegramAdapter,
            agentAdapter as unknown as AgentAdapter,
            makeAgent(),
            chatIdRef,
        );

        chatIdRef.value = '419354621';

        agentAdapter.getConversation.mockImplementationOnce(() => {
            throw new Error('ENOENT: no such file');
        });
        await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

        expect(telegram.sendMessage).not.toHaveBeenCalled();
        expect(ui.error).not.toHaveBeenCalled(); // getConversation throws stay silent

        // Loop must keep running — next tick succeeds
        agentAdapter.getConversation.mockReturnValueOnce([
            makeMessage({ content: 'recovered' }),
        ]);
        await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

        expect(telegram.sendMessage).toHaveBeenCalledTimes(1);
        expect(telegram.sendMessage).toHaveBeenCalledWith('419354621', 'recovered');
    });

    it('logs ui.error when sendMessage throws but keeps loop alive', async () => {
        agentAdapter.getConversation.mockReturnValueOnce([]);
        interval = startOutputPolling(
            telegram as unknown as TelegramAdapter,
            agentAdapter as unknown as AgentAdapter,
            makeAgent(),
            chatIdRef,
        );

        chatIdRef.value = '419354621';
        telegram.sendMessage.mockRejectedValueOnce(new Error('Telegram down'));

        const initialBatch = [
            makeMessage({ content: 'first message — fails' }),
            makeMessage({ content: 'second message — succeeds' }),
        ];
        agentAdapter.getConversation.mockReturnValueOnce(initialBatch);

        await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

        expect(telegram.sendMessage).toHaveBeenCalledTimes(2);
        expect(ui.error).toHaveBeenCalledWith(
            expect.stringContaining('Failed to send agent response to Telegram: Telegram down'),
        );

        // Next tick: conversation grows by one — failed message is NOT retried
        // (lastMessageCount already advanced) but the new message flows.
        agentAdapter.getConversation.mockReturnValueOnce([
            ...initialBatch,
            makeMessage({ content: 'next-tick reply' }),
        ]);
        await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

        expect(telegram.sendMessage.mock.calls.some(c => c[1] === 'next-tick reply')).toBe(true);
    });
});

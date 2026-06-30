import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { vi, type Mock } from 'vitest';
import type { AgentInfo, AgentRequest } from '@ai-devkit/agent-manager';
import { AgentStatus, writeAgentRequest } from '@ai-devkit/agent-manager';
import { startOutputPolling } from '../../../services/channel/channel-runner.js';
import { AskUserQuestionService } from '../../../services/channel/ask-user-question.js';

function makeAgent(overrides: Partial<AgentInfo> = {}): AgentInfo {
    return {
        name: 'test-agent',
        type: 'claude',
        status: AgentStatus.RUNNING,
        summary: 'test',
        pid: 99999,
        projectPath: '/tmp/test',
        sessionId: 'test-session-abc',
        lastActive: new Date(),
        sessionFilePath: undefined,
        ...overrides,
    };
}

function makeTelegram() {
    return { sendMessage: vi.fn().mockResolvedValue(undefined) };
}

function makeAdapter() {
    return { getConversation: vi.fn().mockReturnValue([]) };
}

function makeRequest(overrides: Partial<AgentRequest> = {}): AgentRequest {
    return {
        sessionId: 'test-session-abc',
        toolName: 'Bash',
        toolInput: { command: 'ls /tmp' },
        timestamp: '2026-06-29T00:00:01.000Z',
        ...overrides,
    };
}

describe('startOutputPolling — agent requests', () => {
    let homeDir: string;
    let chatIdRef: { value: string | null };

    beforeEach(() => {
        homeDir = mkdtempSync(join(tmpdir(), 'channel-runner-test-'));
        chatIdRef = { value: 'chat-123' };
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        rmSync(homeDir, { recursive: true, force: true });
    });

    it('does not send when chatIdRef.value is null', async () => {
        chatIdRef.value = null;
        const telegram = makeTelegram();
        const interval = startOutputPolling(telegram as never, makeAdapter() as never, makeAgent(), chatIdRef, { homeDir });
        writeAgentRequest(homeDir, makeRequest());
        await vi.advanceTimersByTimeAsync(2100);
        clearInterval(interval);

        expect(telegram.sendMessage).not.toHaveBeenCalled();
    });

    it('does not send when agent has no sessionId', async () => {
        const telegram = makeTelegram();
        const agent = makeAgent({ sessionId: undefined as unknown as string });
        const interval = startOutputPolling(telegram as never, makeAdapter() as never, agent, chatIdRef, { homeDir });
        writeAgentRequest(homeDir, makeRequest());
        await vi.advanceTimersByTimeAsync(2100);
        clearInterval(interval);

        const agentRequestCalls = (telegram.sendMessage as Mock).mock.calls.filter(
            ([, msg]: [unknown, string]) => msg.includes('[Tool prompt]') || msg.includes('[Question]')
        );
        expect(agentRequestCalls).toHaveLength(0);
    });

    it('does not send when no agent-request file exists for the session', async () => {
        const telegram = makeTelegram();
        const interval = startOutputPolling(telegram as never, makeAdapter() as never, makeAgent(), chatIdRef, { homeDir });
        await vi.advanceTimersByTimeAsync(2100);
        clearInterval(interval);

        expect(telegram.sendMessage).not.toHaveBeenCalled();
    });

    it('does not send an agent-request file that existed before polling started', async () => {
        const telegram = makeTelegram();
        // Write before startOutputPolling — init seeds lastAgentRequestTimestamp from this
        writeAgentRequest(homeDir, makeRequest());
        const interval = startOutputPolling(telegram as never, makeAdapter() as never, makeAgent(), chatIdRef, { homeDir });
        await vi.advanceTimersByTimeAsync(2100);
        clearInterval(interval);

        expect(telegram.sendMessage).not.toHaveBeenCalled();
    });

    it('sends an agent request written after polling starts', async () => {
        const telegram = makeTelegram();
        // Start polling first (no file yet — nothing to seed)
        const interval = startOutputPolling(telegram as never, makeAdapter() as never, makeAgent(), chatIdRef, { homeDir });
        // Write after init, before first tick
        writeAgentRequest(homeDir, makeRequest());
        await vi.advanceTimersByTimeAsync(2100);
        clearInterval(interval);

        expect(telegram.sendMessage).toHaveBeenCalledOnce();
        const [, message] = (telegram.sendMessage as Mock).mock.calls[0];
        expect(message).toContain('ls /tmp');
        expect(message).toContain('[Tool prompt]');
    });

    it('does not re-send when agent-request timestamp has not changed across ticks', async () => {
        const telegram = makeTelegram();
        const interval = startOutputPolling(telegram as never, makeAdapter() as never, makeAgent(), chatIdRef, { homeDir });
        // Write after init — first tick picks it up and sends; subsequent ticks dedupe
        writeAgentRequest(homeDir, makeRequest({ toolInput: { command: 'echo hi' } }));
        await vi.advanceTimersByTimeAsync(6100); // 3 ticks
        clearInterval(interval);

        expect(telegram.sendMessage).toHaveBeenCalledOnce();
    });

    it('sends again when agent-request file is overwritten with a new timestamp', async () => {
        const telegram = makeTelegram();
        const interval = startOutputPolling(telegram as never, makeAdapter() as never, makeAgent(), chatIdRef, { homeDir });
        writeAgentRequest(homeDir, makeRequest({ toolInput: { command: 'echo first' }, timestamp: '2026-06-29T00:00:01.000Z' }));
        await vi.advanceTimersByTimeAsync(2100); // tick 1 — sends first

        writeAgentRequest(homeDir, makeRequest({ toolInput: { command: 'echo second' }, timestamp: '2026-06-29T00:00:02.000Z' }));
        await vi.advanceTimersByTimeAsync(2100); // tick 2 — sends second
        clearInterval(interval);

        expect(telegram.sendMessage).toHaveBeenCalledTimes(2);
        const messages = (telegram.sendMessage as Mock).mock.calls.map(([, m]: [unknown, string]) => m);
        expect(messages[0]).toContain('echo first');
        expect(messages[1]).toContain('echo second');
    });

    it('conversation messages are sent before agent-request message in the same tick', async () => {
        const telegram = makeTelegram();
        const agent = makeAgent({ sessionFilePath: '/fake/session.jsonl' });

        // First call is the init baseline (empty); first tick returns assistant message.
        const adapter = {
            getConversation: vi.fn()
                .mockReturnValueOnce([])
                .mockReturnValue([{ role: 'assistant', content: 'Hello from Claude', timestamp: '' }]),
        };

        // Start polling (no file yet — nothing to seed)
        const interval = startOutputPolling(telegram as never, adapter as never, agent, chatIdRef, { homeDir });
        // Write agent request after init — both JSONL message and request are new on tick 1
        writeAgentRequest(homeDir, makeRequest({ toolInput: { command: 'echo test' } }));
        await vi.advanceTimersByTimeAsync(2100);
        clearInterval(interval);

        const calls = (telegram.sendMessage as Mock).mock.calls;
        expect(calls).toHaveLength(2);
        // JSONL (conversation) message must arrive before the agent-request notification
        expect(calls[0][1]).toBe('Hello from Claude');
        expect(calls[1][1]).toContain('[Tool prompt]');
    });

    it('routes AskUserQuestion single-select payload to inline-keyboard service', async () => {
        const singleSelectInput = {
            questions: [{
                question: 'What would you like to do next?',
                header: 'Next action',
                options: [
                    { label: 'Continue the bug fix', description: 'Pick up where we left off on fixing the bug' },
                    { label: 'Start something new', description: 'Begin a fresh task or feature' },
                ],
                multiSelect: false,
            }],
        };
        const telegram = {
            ...makeTelegram(),
            sendInlineKeyboard: vi.fn().mockResolvedValue(42),
            editInlineKeyboard: vi.fn().mockResolvedValue(undefined),
            answerCallback: vi.fn().mockResolvedValue(undefined),
        };
        const askQuestion = new AskUserQuestionService(telegram as never, vi.fn().mockResolvedValue(undefined));
        const interval = startOutputPolling(telegram as never, makeAdapter() as never, makeAgent(), chatIdRef, {
            homeDir,
            askUserQuestionService: askQuestion,
        });
        writeAgentRequest(homeDir, makeRequest({ toolName: 'AskUserQuestion', toolInput: singleSelectInput }));
        await vi.advanceTimersByTimeAsync(2100);
        clearInterval(interval);

        expect(telegram.sendInlineKeyboard).toHaveBeenCalledOnce();
        expect(telegram.sendMessage).not.toHaveBeenCalled();
        const [chatArg, htmlArg, kbArg] = telegram.sendInlineKeyboard.mock.calls[0];
        expect(chatArg).toBe('chat-123');
        expect(htmlArg).toContain('What would you like to do next?');
        expect(htmlArg).toContain('Continue the bug fix');
        const kb = kbArg as Array<Array<{ text: string; callbackData: string }>>;
        // 2 option rows + 1 Skip row
        expect(kb).toHaveLength(3);
        expect(kb[0][0].callbackData).toMatch(/^q:[a-z0-9]+:o:0$/);
        expect(kb[2][0].text).toBe('Skip');
        expect(kb[2][0].callbackData).toMatch(/^q:[a-z0-9]+:skip$/);
    });

    it('routes AskUserQuestion multi-select payload with Skip-only keyboard', async () => {
        const multiSelectInput = {
            questions: [{
                question: 'Which programming languages do you work with most?',
                options: [{ label: 'TypeScript' }, { label: 'Python' }],
                multiSelect: true,
            }],
        };
        const telegram = {
            ...makeTelegram(),
            sendInlineKeyboard: vi.fn().mockResolvedValue(8),
            editInlineKeyboard: vi.fn().mockResolvedValue(undefined),
            answerCallback: vi.fn().mockResolvedValue(undefined),
        };
        const askQuestion = new AskUserQuestionService(telegram as never, vi.fn().mockResolvedValue(undefined));
        const interval = startOutputPolling(telegram as never, makeAdapter() as never, makeAgent(), chatIdRef, {
            homeDir,
            askUserQuestionService: askQuestion,
        });
        writeAgentRequest(homeDir, makeRequest({ toolName: 'AskUserQuestion', toolInput: multiSelectInput }));
        await vi.advanceTimersByTimeAsync(2100);
        clearInterval(interval);

        expect(telegram.sendMessage).not.toHaveBeenCalled();
        expect(telegram.sendInlineKeyboard).toHaveBeenCalledOnce();
        const [, html, kb] = telegram.sendInlineKeyboard.mock.calls[0];
        expect(html).toContain('Multi-select');
        const keyboard = kb as Array<Array<{ text: string; callbackData: string }>>;
        expect(keyboard).toHaveLength(1);
        expect(keyboard[0][0].text).toBe('Skip');
        expect(keyboard[0][0].callbackData).toMatch(/^q:[a-z0-9]+:skip$/);
    });

    it('falls back to plain [Question] text when AskUserQuestion payload is malformed', async () => {
        const telegram = {
            ...makeTelegram(),
            sendInlineKeyboard: vi.fn(),
            editInlineKeyboard: vi.fn(),
            answerCallback: vi.fn(),
        };
        const askQuestion = new AskUserQuestionService(telegram as never, vi.fn().mockResolvedValue(undefined));
        const interval = startOutputPolling(telegram as never, makeAdapter() as never, makeAgent(), chatIdRef, {
            homeDir,
            askUserQuestionService: askQuestion,
        });
        writeAgentRequest(homeDir, makeRequest({
            toolName: 'AskUserQuestion',
            toolInput: { question: 'How should I handle this?' },
        }));
        await vi.advanceTimersByTimeAsync(2100);
        clearInterval(interval);

        expect(telegram.sendInlineKeyboard).not.toHaveBeenCalled();
        expect(telegram.sendMessage).toHaveBeenCalledOnce();
        const [, message] = (telegram.sendMessage as Mock).mock.calls[0];
        expect(message).toContain('[Question]');
        expect(message).toContain('How should I handle this?');
    });

    it('formats AskUserQuestion with direct question field as [Question] text', async () => {
        const telegram = makeTelegram();
        const interval = startOutputPolling(telegram as never, makeAdapter() as never, makeAgent(), chatIdRef, { homeDir });
        writeAgentRequest(homeDir, makeRequest({
            toolName: 'AskUserQuestion',
            toolInput: { question: 'How should I handle this?' },
        }));
        await vi.advanceTimersByTimeAsync(2100);
        clearInterval(interval);

        expect(telegram.sendMessage).toHaveBeenCalledOnce();
        const [, message] = (telegram.sendMessage as Mock).mock.calls[0];
        expect(message).toContain('[Question]');
        expect(message).toContain('How should I handle this?');
        expect(message).not.toContain('[Tool prompt]');
    });

    it('formats Bash tool invocation as [Tool prompt] with command', async () => {
        const telegram = makeTelegram();
        const interval = startOutputPolling(telegram as never, makeAdapter() as never, makeAgent(), chatIdRef, { homeDir });
        writeAgentRequest(homeDir, makeRequest({
            toolName: 'Bash',
            toolInput: { command: 'rm -rf /tmp/test-claude-permission' },
        }));
        await vi.advanceTimersByTimeAsync(2100);
        clearInterval(interval);

        expect(telegram.sendMessage).toHaveBeenCalledOnce();
        const [, message] = (telegram.sendMessage as Mock).mock.calls[0];
        expect(message).toBe('[Tool prompt] Bash:\nrm -rf /tmp/test-claude-permission');
    });

    it('formats non-Bash/non-Ask tool invocation as [Tool prompt] with JSON input', async () => {
        const telegram = makeTelegram();
        const interval = startOutputPolling(telegram as never, makeAdapter() as never, makeAgent(), chatIdRef, { homeDir });
        writeAgentRequest(homeDir, makeRequest({
            toolName: 'Edit',
            toolInput: { file_path: '/src/main.ts', old_string: 'foo', new_string: 'bar' },
        }));
        await vi.advanceTimersByTimeAsync(2100);
        clearInterval(interval);

        expect(telegram.sendMessage).toHaveBeenCalledOnce();
        const [, message] = (telegram.sendMessage as Mock).mock.calls[0];
        expect(message).toContain('[Tool prompt]');
        expect(message).toContain('Edit');
        expect(message).not.toContain('[Question]');
    });
});

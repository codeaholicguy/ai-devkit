
import type { Mocked, Mock } from 'vitest';
import { Command } from 'commander';
import type { AgentAdapter, AgentInfo, ConversationMessage } from '@ai-devkit/agent-manager';
import { AgentStatus } from '@ai-devkit/agent-manager';
import type { TelegramAdapter } from '@ai-devkit/channel-connector';
import { ui } from '../../util/terminal-ui.js';

const mockConfigStore = {
    getConfig: vi.fn<() => Promise<unknown>>(),
    getChannel: vi.fn<(name: string) => Promise<unknown>>(),
    saveChannel: vi.fn<(name: string, entry: unknown) => Promise<void>>(),
    removeChannel: vi.fn<(name: string) => Promise<void>>(),
};

const mockConfirm = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const mockPassword = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetMe = vi.fn<() => Promise<{ username: string }>>();
const mockSpinner = {
    start: vi.fn(),
    succeed: vi.fn(),
    fail: vi.fn(),
};
const mockChannelManager = {
    registerAdapter: vi.fn(),
    startAll: vi.fn<() => Promise<void>>(),
    stopAll: vi.fn<() => Promise<void>>(),
};
const mockAgentAdapter = {
    getConversation: vi.fn(),
};
const mockAgentManager = {
    registerAdapter: vi.fn(),
    listAgents: vi.fn<() => Promise<unknown[]>>(),
    resolveAgent: vi.fn<(agentName: string, agents: unknown[]) => unknown>(),
    getAdapter: vi.fn<(agentType: string) => unknown>(),
};
const mockTerminalFocusManager = {
    findTerminal: vi.fn<(pid: number) => Promise<unknown>>(),
};
const mockTelegramAdapter = {
    onMessage: vi.fn(),
    onCallback: vi.fn(),
    sendMessage: vi.fn<() => Promise<void>>(),
    sendInlineKeyboard: vi.fn<() => Promise<number>>(),
    editInlineKeyboard: vi.fn<() => Promise<void>>(),
    answerCallback: vi.fn<() => Promise<void>>(),
};
const mockChannelService = {
    resolveConnectChannelName: vi.fn((name?: string) => name ?? 'telegram'),
    resolveStartChannelName: vi.fn((config: any, name?: string) => name ?? Object.keys(config.channels)[0]),
    assertUniqueTelegramToken: vi.fn(),
    getLiveBridges: vi.fn<() => Promise<unknown[]>>(),
    getLiveBridgeByChannel: vi.fn<(channelName: string) => Promise<unknown>>(),
    registerBridge: vi.fn<(entry: unknown) => Promise<void>>(),
    unregisterBridge: vi.fn<(channelName: string) => Promise<void>>(),
    startDaemonBridge: vi.fn<(entry: unknown) => Promise<unknown>>(),
    stopBridge: vi.fn<(channelName?: string) => Promise<unknown>>(),
};

vi.mock('@ai-devkit/channel-connector', () => ({
    ChannelManager: vi.fn(function () { return mockChannelManager; }),
    ConfigStore: vi.fn(function () { return mockConfigStore; }),
    TelegramAdapter: vi.fn(function () { return mockTelegramAdapter; }),
    TELEGRAM_CHANNEL_TYPE: 'telegram',
}), { virtual: true });

vi.mock('@ai-devkit/agent-manager', () => ({
    AgentStatus: {
        RUNNING: 'running',
    },
    AgentManager: vi.fn(function () { return mockAgentManager; }),
    ClaudeCodeAdapter: vi.fn(),
    CodexAdapter: vi.fn(),
    CopilotAdapter: vi.fn(),
    GeminiCliAdapter: vi.fn(),
    GrokCliAdapter: vi.fn(),
    PiAdapter: vi.fn(),
    TerminalFocusManager: vi.fn(function () { return mockTerminalFocusManager; }),
    TtyWriter: {
        send: vi.fn(),
    },
    readLatestAgentRequest: vi.fn().mockReturnValue(null),
}), { virtual: true });

vi.mock('@inquirer/prompts', () => ({
    confirm: (...args: unknown[]) => mockConfirm(...args),
    password: (...args: unknown[]) => mockPassword(...args),
}));

vi.mock('telegraf', () => ({
    Telegraf: vi.fn(function () { return {
        telegram: {
            getMe: mockGetMe,
        },
    }; }),
}));

vi.mock('../../util/terminal-ui.js', () => ({
    ui: {
        text: vi.fn(),
        table: vi.fn(),
        info: vi.fn(),
        success: vi.fn(),
        warning: vi.fn(),
        error: vi.fn(),
        breakline: vi.fn(),
        spinner: vi.fn(() => mockSpinner),
    },
}));

vi.mock('../../services/channel/channel.service.js', () => ({
    ChannelService: vi.fn(function () { return mockChannelService; }),
}));

// Imports are placed after vi.mock; Vitest hoists vi.mock so mocks apply
import { registerChannelCommand } from '../../commands/channel.js';
import { startOutputPolling } from '../../services/channel/channel-runner.js';

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
    let agentAdapter: Mocked<Pick<AgentAdapter, 'getConversation'>>;
    let telegram: { sendMessage: Mock<(chatId: string, text: string) => Promise<void>> };
    let chatIdRef: { value: string | null };
    let interval: NodeJS.Timeout | null;

    beforeEach(() => {
        vi.useFakeTimers();
        agentAdapter = { getConversation: vi.fn() };
        telegram = { sendMessage: vi.fn(() => Promise.resolve()) };
        chatIdRef = { value: null };
        interval = null;
        mockConfigStore.getConfig.mockReset();
        mockConfigStore.getChannel.mockReset();
        mockConfigStore.saveChannel.mockReset();
        mockConfigStore.removeChannel.mockReset();
        mockConfirm.mockReset();
        mockPassword.mockReset();
        mockGetMe.mockReset();
        mockSpinner.start.mockReset();
        mockSpinner.succeed.mockReset();
        mockSpinner.fail.mockReset();
        mockChannelService.resolveConnectChannelName.mockClear();
        mockChannelService.resolveStartChannelName.mockClear();
        mockChannelService.assertUniqueTelegramToken.mockClear();
        mockChannelService.getLiveBridges.mockClear();
        mockChannelService.getLiveBridgeByChannel.mockClear();
        mockChannelService.registerBridge.mockClear();
        mockChannelService.unregisterBridge.mockClear();
        mockChannelService.startDaemonBridge.mockClear();
        mockChannelService.stopBridge.mockClear();
        mockChannelService.resolveConnectChannelName.mockImplementation((name?: string) => name ?? 'telegram');
        mockChannelService.resolveStartChannelName.mockImplementation((config: any, name?: string) => name ?? Object.keys(config.channels)[0]);
        mockChannelService.getLiveBridges.mockResolvedValue([]);
        mockChannelService.getLiveBridgeByChannel.mockResolvedValue(undefined);
        mockChannelService.startDaemonBridge.mockResolvedValue({
            channelName: 'personal',
            channelType: 'telegram',
            agentName: 'codex-main',
            agentPid: 0,
            bridgePid: 9876,
            startedAt: '2026-05-24T00:00:00.000Z',
        });
        mockChannelService.stopBridge.mockResolvedValue({
            stopped: true,
            bridge: {
                channelName: 'personal',
                channelType: 'telegram',
                agentName: 'codex-main',
                agentPid: 4321,
                bridgePid: 9876,
                startedAt: '2026-05-24T00:00:00.000Z',
            },
        });
        mockGetMe.mockResolvedValue({ username: 'test_bot' });
        vi.clearAllMocks();
    });

    afterEach(() => {
        if (interval) clearInterval(interval);
        vi.useRealTimers();
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
        await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

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

        await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3);

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

        await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3);

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

        await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

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

        await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

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

        await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

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
        await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

        expect(telegram.sendMessage).not.toHaveBeenCalled();
        expect(ui.error).not.toHaveBeenCalled(); // getConversation throws stay silent

        // Loop must keep running — next tick succeeds
        agentAdapter.getConversation.mockReturnValueOnce([
            makeMessage({ content: 'recovered' }),
        ]);
        await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

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

        await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

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
        await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

        expect(telegram.sendMessage.mock.calls.some(c => c[1] === 'next-tick reply')).toBe(true);
    });
});

describe('channel command', () => {
    const personalEntry = {
        type: 'telegram',
        enabled: true,
        createdAt: '2026-05-23T00:00:00.000Z',
        config: {
            botToken: '123:abc',
            botUsername: 'personal_bot',
        },
    };

    beforeEach(() => {
        mockConfigStore.getConfig.mockReset();
        mockConfigStore.getChannel.mockReset();
        mockConfigStore.saveChannel.mockReset();
        mockConfigStore.removeChannel.mockReset();
        mockChannelService.resolveConnectChannelName.mockClear();
        mockChannelService.resolveStartChannelName.mockClear();
        mockChannelService.assertUniqueTelegramToken.mockClear();
        mockChannelService.getLiveBridges.mockClear();
        mockChannelService.getLiveBridgeByChannel.mockClear();
        mockChannelService.registerBridge.mockClear();
        mockChannelService.unregisterBridge.mockClear();
        mockChannelService.startDaemonBridge.mockClear();
        mockChannelService.stopBridge.mockClear();
        mockChannelService.resolveConnectChannelName.mockImplementation((name?: string) => name ?? 'telegram');
        mockChannelService.resolveStartChannelName.mockImplementation((config: any, name?: string) => name ?? Object.keys(config.channels)[0]);
        mockChannelService.getLiveBridges.mockResolvedValue([]);
        mockChannelService.getLiveBridgeByChannel.mockResolvedValue(undefined);
        mockChannelService.startDaemonBridge.mockResolvedValue({
            channelName: 'personal',
            channelType: 'telegram',
            agentName: 'codex-main',
            agentPid: 0,
            bridgePid: 9876,
            logPath: '/tmp/channel-logs/personal.log',
            startedAt: '2026-05-24T00:00:00.000Z',
        });
        mockChannelService.stopBridge.mockResolvedValue({
            stopped: true,
            bridge: {
                channelName: 'personal',
                channelType: 'telegram',
                agentName: 'codex-main',
                agentPid: 4321,
                bridgePid: 9876,
                startedAt: '2026-05-24T00:00:00.000Z',
            },
        });
        mockGetMe.mockReset();
        mockGetMe.mockResolvedValue({ username: 'test_bot' });
        mockSpinner.start.mockReset();
        mockSpinner.succeed.mockReset();
        mockSpinner.fail.mockReset();
        mockChannelManager.registerAdapter.mockReset();
        mockChannelManager.startAll.mockReset();
        mockChannelManager.stopAll.mockReset();
        mockAgentManager.registerAdapter.mockReset();
        mockAgentManager.listAgents.mockReset();
        mockAgentManager.resolveAgent.mockReset();
        mockAgentManager.getAdapter.mockReset();
        mockTerminalFocusManager.findTerminal.mockReset();
        mockAgentAdapter.getConversation.mockReset();
        mockTelegramAdapter.onMessage.mockReset();
        mockTelegramAdapter.sendMessage.mockReset();
        mockConfirm.mockReset();
        mockPassword.mockReset();
        vi.clearAllMocks();
    });

    it('connects a named Telegram channel', async () => {
        mockPassword.mockResolvedValue('123:abc');
        mockConfigStore.getChannel.mockResolvedValue(undefined);
        mockConfigStore.getConfig.mockResolvedValue({ channels: {} });
        mockChannelService.resolveConnectChannelName.mockReturnValue('personal');

        const program = new Command();
        registerChannelCommand(program);
        await program.parseAsync(['node', 'test', 'channel', 'connect', 'telegram', '--name', 'personal']);

        expect(mockChannelService.resolveConnectChannelName).toHaveBeenCalledWith('personal');
        expect(mockChannelService.assertUniqueTelegramToken).toHaveBeenCalledWith({ channels: {} }, 'personal', '123:abc');
        expect(mockConfigStore.saveChannel).toHaveBeenCalledWith('personal', expect.objectContaining({
            type: 'telegram',
            enabled: true,
            config: {
                botToken: '123:abc',
                botUsername: 'test_bot',
                authorizedChatId: undefined,
            },
        }));
        expect(ui.success).toHaveBeenCalledWith('Telegram channel "personal" configured successfully!');
    });

    it('connects the default Telegram channel when --name is omitted', async () => {
        mockPassword.mockResolvedValue('123:abc');
        mockConfigStore.getChannel.mockResolvedValue(undefined);
        mockConfigStore.getConfig.mockResolvedValue({ channels: {} });

        const program = new Command();
        registerChannelCommand(program);
        await program.parseAsync(['node', 'test', 'channel', 'connect', 'telegram']);

        expect(mockChannelService.resolveConnectChannelName).toHaveBeenCalledWith(undefined);
        expect(mockConfigStore.saveChannel).toHaveBeenCalledWith('telegram', expect.objectContaining({
            type: 'telegram',
            config: expect.objectContaining({
                botToken: '123:abc',
                botUsername: 'test_bot',
            }),
        }));
    });

    it('lists named Telegram channels with authorization state', async () => {
        mockConfigStore.getConfig.mockResolvedValue({
            channels: {
                personal: personalEntry,
                work: {
                    ...personalEntry,
                    config: {
                        botToken: '456:def',
                        botUsername: 'work_bot',
                        authorizedChatId: 222,
                    },
                },
            },
        });

        const program = new Command();
        registerChannelCommand(program);
        await program.parseAsync(['node', 'test', 'channel', 'list']);

        expect(ui.table).toHaveBeenCalledWith(expect.objectContaining({
            headers: ['Name', 'Type', 'Status', 'Bot', 'Authorized', 'Bridge', 'Created'],
            rows: expect.arrayContaining([
                expect.arrayContaining(['personal', 'telegram', expect.any(String), '@personal_bot', 'no']),
                expect.arrayContaining(['work', 'telegram', expect.any(String), '@work_bot', 'yes']),
            ]),
        }));
    });

    it('disconnects a named channel', async () => {
        mockConfigStore.getChannel.mockResolvedValue(personalEntry);
        mockConfirm.mockResolvedValue(true);

        const program = new Command();
        registerChannelCommand(program);
        await program.parseAsync(['node', 'test', 'channel', 'disconnect', 'personal']);

        expect(mockConfigStore.getChannel).toHaveBeenCalledWith('personal');
        expect(mockConfigStore.removeChannel).toHaveBeenCalledWith('personal');
        expect(ui.success).toHaveBeenCalledWith('personal channel disconnected.');
    });

    it('shows available channels when starting a missing channel', async () => {
        mockConfigStore.getConfig.mockResolvedValue({
            channels: {
                personal: personalEntry,
                work: {
                    ...personalEntry,
                    config: {
                        botToken: '456:def',
                        botUsername: 'work_bot',
                    },
                },
            },
        });
        mockChannelService.resolveStartChannelName.mockReturnValue('missing');

        const program = new Command();
        registerChannelCommand(program);
        await program.parseAsync(['node', 'test', 'channel', 'start', 'missing', '--agent', 'codex-main']);

        expect(ui.error).toHaveBeenCalledWith('No channel configured with name "missing".');
        expect(ui.info).toHaveBeenCalledWith('Available channels: personal, work');
    });

    it('records the bridge before starting the channel manager', async () => {
        vi.useFakeTimers();
        mockConfigStore.getConfig.mockResolvedValue({
            channels: {
                personal: personalEntry,
            },
        });
        mockConfigStore.getChannel.mockResolvedValue(personalEntry);
        const agent = makeAgent({ name: 'codex-main', type: 'codex', pid: 4321 });
        mockAgentManager.listAgents.mockResolvedValue([agent]);
        mockAgentManager.resolveAgent.mockReturnValue(agent);
        mockAgentManager.getAdapter.mockReturnValue(mockAgentAdapter);
        mockTerminalFocusManager.findTerminal.mockResolvedValue({
            app: 'Terminal',
            windowIndex: 1,
            tabIndex: 1,
        });
        mockAgentAdapter.getConversation.mockReturnValue([]);
        mockChannelManager.startAll.mockResolvedValue(undefined);

        const program = new Command();
        registerChannelCommand(program);
        void program.parseAsync(['node', 'test', 'channel', 'start', 'personal', '--agent', 'codex-main']);

        for (let i = 0; i < 10 && mockChannelManager.startAll.mock.calls.length === 0; i += 1) {
            await Promise.resolve();
        }

        expect(mockChannelService.registerBridge).toHaveBeenCalledWith(expect.objectContaining({
            channelName: 'personal',
            channelType: 'telegram',
            agentName: 'codex-main',
            agentPid: 4321,
            bridgePid: process.pid,
        }));
        expect(mockAgentManager.registerAdapter).toHaveBeenCalledTimes(6);
        expect(mockChannelService.registerBridge.mock.invocationCallOrder[0])
            .toBeLessThan(mockChannelManager.startAll.mock.invocationCallOrder[0]);

        vi.clearAllTimers();
        vi.useRealTimers();
    });

    it('starts a daemon bridge without resolving the agent in the parent process', async () => {
        mockConfigStore.getConfig.mockResolvedValue({
            channels: {
                personal: personalEntry,
            },
        });

        const program = new Command();
        registerChannelCommand(program);
        await program.parseAsync(['node', 'test', 'channel', 'start', 'personal', '--agent', 'codex-main', '--daemon']);

        expect(mockChannelService.startDaemonBridge).toHaveBeenCalledWith(expect.objectContaining({
            channelName: 'personal',
            channelType: 'telegram',
            agentName: 'codex-main',
            command: process.execPath,
            args: expect.arrayContaining(['--channel', 'personal', '--agent', 'codex-main']),
            cwd: process.cwd(),
        }));
        const daemonInput = mockChannelService.startDaemonBridge.mock.calls[0][0] as { args: string[] };
        expect(daemonInput.args).toContain('--loader');
        expect(daemonInput.args).toContain('ts-node/esm');
        expect(daemonInput.args).toEqual(expect.arrayContaining([expect.stringContaining('channel-daemon.ts')]));
        expect(mockAgentManager.listAgents).not.toHaveBeenCalled();
        expect(ui.success).toHaveBeenCalledWith('Channel bridge daemon started for "personal" (PID: 9876).');
        expect(ui.info).toHaveBeenCalledWith('Logs: /tmp/channel-logs/personal.log');
    });

    it('shows the daemon log path in channel status', async () => {
        mockConfigStore.getConfig.mockResolvedValue({
            channels: {
                personal: personalEntry,
            },
        });
        mockChannelService.getLiveBridges.mockResolvedValue([{
            channelName: 'personal',
            channelType: 'telegram',
            agentName: 'codex-main',
            agentPid: 4321,
            bridgePid: 9876,
            logPath: '/tmp/channel-logs/personal.log',
            startedAt: '2026-05-24T00:00:00.000Z',
        }]);

        const program = new Command();
        registerChannelCommand(program);
        await program.parseAsync(['node', 'test', 'channel', 'status', 'personal']);

        expect(ui.text).toHaveBeenCalledWith('  Logs: /tmp/channel-logs/personal.log');
    });

    it('stops a running channel bridge', async () => {
        const program = new Command();
        registerChannelCommand(program);
        await program.parseAsync(['node', 'test', 'channel', 'stop', 'personal']);

        expect(mockChannelService.stopBridge).toHaveBeenCalledWith('personal');
        expect(ui.success).toHaveBeenCalledWith('Channel bridge stopped: personal (PID: 9876).');
    });

    it('reports when no channel bridge is running during stop', async () => {
        mockChannelService.stopBridge.mockResolvedValue({ stopped: false });

        const program = new Command();
        registerChannelCommand(program);
        await program.parseAsync(['node', 'test', 'channel', 'stop']);

        expect(mockChannelService.stopBridge).toHaveBeenCalledWith(undefined);
        expect(ui.info).toHaveBeenCalledWith('No running channel bridge found.');
    });
});

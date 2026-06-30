import { homedir } from 'os';
import {
    AgentManager,
    ClaudeCodeAdapter,
    CodexAdapter,
    CopilotAdapter,
    GeminiCliAdapter,
    GrokCliAdapter,
    PiAdapter,
    TerminalFocusManager,
    TtyWriter,
    readLatestAgentRequest,
    type AgentAdapter,
    type AgentInfo,
    type ConversationMessage,
    type TerminalLocation,
} from '@ai-devkit/agent-manager';
import {
    ChannelManager,
    ConfigStore,
    TelegramAdapter,
    TELEGRAM_CHANNEL_TYPE,
    type TelegramConfig,
} from '@ai-devkit/channel-connector';
import { ui } from '../../util/terminal-ui.js';
import { getErrorMessage } from '../../util/text.js';
import { createLogger } from '../../util/debug.js';
import { select } from '@inquirer/prompts';
import { ChannelService } from './channel.service.js';
import { AskUserQuestionService } from './ask-user-question.js';

const debug = createLogger('channel');
const AGENT_POLL_INTERVAL_MS = 2000;

export interface RunChannelBridgeInput {
    channelName: string;
    agentName: string;
    configStore?: ConfigStore;
    channelService?: ChannelService;
}

function createAgentManager(): AgentManager {
    const manager = new AgentManager();
    manager.registerAdapter(new ClaudeCodeAdapter());
    manager.registerAdapter(new CodexAdapter());
    manager.registerAdapter(new CopilotAdapter());
    manager.registerAdapter(new GeminiCliAdapter());
    manager.registerAdapter(new GrokCliAdapter());
    manager.registerAdapter(new PiAdapter());
    return manager;
}

async function resolveTargetAgent(agentManager: AgentManager, agentName: string): Promise<AgentInfo | null> {
    const agents = await agentManager.listAgents();

    if (agents.length === 0) {
        ui.error('No running agents detected.');
        return null;
    }

    const resolved = agentManager.resolveAgent(agentName, agents);
    if (!resolved) {
        ui.error(`No agent found matching "${agentName}".`);
        ui.info('Available agents:');
        agents.forEach(a => ui.text(`  - ${a.name}`));
        return null;
    }

    if (Array.isArray(resolved)) {
        const selectedAgent = await select({
            message: 'Multiple agents match. Select one:',
            choices: resolved.map(a => ({
                name: `${a.name} (PID: ${a.pid})`,
                value: a,
            })),
        });
        return selectedAgent;
    }

    return resolved as AgentInfo;
}

function setupInputHandler(
    telegram: TelegramAdapter,
    terminalLocation: TerminalLocation,
    chatIdRef: { value: string | null },
    onAuthorize?: (chatId: string) => Promise<void>,
): void {
    telegram.onMessage(async (msg) => {
        debug(`Received message from chat ID: ${msg.chatId}, text length: ${msg.text?.length ?? 0}`);

        if (!chatIdRef.value) {
            chatIdRef.value = msg.chatId;
            await onAuthorize?.(msg.chatId);
            ui.info(`Authorized Telegram user (chat ID: ${msg.chatId})`);
        }

        if (msg.chatId !== chatIdRef.value) {
            debug(`Rejected message from unauthorized chat ID: ${msg.chatId}`);
            await telegram.sendMessage(msg.chatId, 'Unauthorized. Only the first user is allowed.');
            return;
        }

        try {
            await TtyWriter.send(terminalLocation, msg.text);
            debug(`Sent message to agent terminal (length: ${msg.text?.length ?? 0})`);
        } catch (error: unknown) {
            const message = getErrorMessage(error);
            ui.error(`Failed to send to agent: ${message}`);
            await telegram.sendMessage(msg.chatId, `Failed to send to agent: ${message}`);
        }
    });
}

function formatPromptMessage(toolName: string, toolInput: Record<string, unknown>): string {
    if (toolName === 'AskUserQuestion') {
        const question = typeof toolInput.question === 'string' ? toolInput.question : JSON.stringify(toolInput);
        const options = Array.isArray(toolInput.options)
            ? '\n' + (toolInput.options as unknown[]).map((o) => `- ${String(o)}`).join('\n')
            : '';
        return `[Question] ${question}${options}`;
    }
    const detail = typeof toolInput.command === 'string' ? toolInput.command : JSON.stringify(toolInput);
    return `[Tool prompt] ${toolName}:\n${detail}`;
}

export interface OutputPollingOptions {
    homeDir?: string;
    askUserQuestionService?: AskUserQuestionService;
}

export function startOutputPolling(
    telegram: TelegramAdapter,
    agentAdapter: AgentAdapter,
    agent: AgentInfo,
    chatIdRef: { value: string | null },
    options: OutputPollingOptions = {},
): NodeJS.Timeout {
    const askQuestion = options.askUserQuestionService;
    const home = options.homeDir ?? homedir();
    let lastAgentRequestTimestamp: string | undefined;
    let lastMessageCount = 0;

    debug(`startOutputPolling: sessionFilePath=${agent.sessionFilePath ?? 'null'}`);

    if (agent.sessionFilePath) {
        try {
            const existing = agentAdapter.getConversation(agent.sessionFilePath);
            lastMessageCount = existing.length;
            debug(`Initial conversation length: ${lastMessageCount}`);
        } catch (error: unknown) {
            debug(`Initial getConversation threw: ${getErrorMessage(error)}`);
        }
    }

    // Seed agent-request timestamp so pre-existing entries are not replayed on first tick,
    // mirroring the lastMessageCount seed above.
    if (agent.sessionId) {
        const existingRequest = readLatestAgentRequest(home, agent.sessionId);
        if (existingRequest) {
            lastAgentRequestTimestamp = existingRequest.timestamp;
            debug(`Initial agent-request timestamp seeded: ${lastAgentRequestTimestamp}`);
        }
    }

    let tickCount = 0;
    let lastReportedLength = lastMessageCount;

    return setInterval(async () => {
        tickCount += 1;

        if (!chatIdRef.value) {
            if (tickCount % 15 === 1) {
                debug(`poll skip: no authorized chat yet (tick ${tickCount})`);
            }
            return;
        }

        // JSONL polling — requires a known session file
        if (agent.sessionFilePath) {
            let newMessages: ConversationMessage[];
            try {
                const conversation = agentAdapter.getConversation(agent.sessionFilePath);
                newMessages = conversation.slice(lastMessageCount);
                if (conversation.length !== lastReportedLength) {
                    debug(`Conversation length changed: ${lastReportedLength} -> ${conversation.length} (lastMessageCount=${lastMessageCount}, new=${newMessages.length})`);
                    lastReportedLength = conversation.length;
                }
                lastMessageCount = conversation.length;
            } catch (error: unknown) {
                debug(`getConversation threw: ${getErrorMessage(error)}`);
                newMessages = [];
            }

            if (newMessages.length > 0) {
                debug(`Polled ${newMessages.length} new message(s) from agent conversation`);
            }

            for (const msg of newMessages) {
                const contentType = typeof msg.content;
                const contentLen = msg.content ? String(msg.content).length : 0;
                debug(`message: role=${msg.role}, contentType=${contentType}, length=${contentLen}`);

                if (msg.role === 'user' || !msg.content) {
                    debug(`skipping message (role=${msg.role}, hasContent=${Boolean(msg.content)})`);
                    continue;
                }

                try {
                    await telegram.sendMessage(chatIdRef.value, msg.content);
                    debug(`Sent agent response to Telegram (role: ${msg.role}, length: ${contentLen})`);
                } catch (error: unknown) {
                    const message = getErrorMessage(error);
                    ui.error(`Failed to send agent response to Telegram: ${message}`);
                    debug(`sendMessage failed: ${message}`);
                }
            }
        } else if (tickCount % 15 === 1) {
            debug(`poll skip JSONL: agent has no sessionFilePath (tick ${tickCount})`);
        }

        // Agent requests: forward tool invocations captured by the hook script.
        // Dedupes by timestamp so each distinct hook write is sent exactly once.
        if (agent.sessionId) {
            const agentRequest = readLatestAgentRequest(home, agent.sessionId);
            if (agentRequest && agentRequest.timestamp !== lastAgentRequestTimestamp) {
                debug(`New agent request: ${agentRequest.toolName} at ${agentRequest.timestamp}`);
                lastAgentRequestTimestamp = agentRequest.timestamp;
                try {
                    let handled = false;
                    if (askQuestion && agentRequest.toolName === 'AskUserQuestion') {
                        handled = await askQuestion.tryHandle(agentRequest.toolInput, chatIdRef.value);
                    }
                    if (!handled) {
                        await telegram.sendMessage(chatIdRef.value, formatPromptMessage(agentRequest.toolName, agentRequest.toolInput));
                    }
                    debug(`Sent agent request notification to Telegram (handled=${handled})`);
                } catch (error: unknown) {
                    debug(`sendMessage (agent request) failed: ${getErrorMessage(error)}`);
                }
            }
        }
    }, AGENT_POLL_INTERVAL_MS);
}

function setupGracefulShutdown(
    manager: ChannelManager,
    pollInterval: NodeJS.Timeout,
    channelService: ChannelService,
    channelName: string,
): void {
    const shutdown = async () => {
        debug('Shutdown signal received');
        ui.info('\nShutting down...');
        clearInterval(pollInterval);
        debug('Output polling stopped');
        await manager.stopAll();
        debug('ChannelManager stopped');
        await channelService.unregisterBridge(channelName);
        debug(`Removed channel bridge entry: ${channelName}`);
        ui.success('Channel bridge stopped.');
        process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

export async function runChannelBridge(input: RunChannelBridgeInput): Promise<void> {
    const configStore = input.configStore ?? new ConfigStore();
    const channelService = input.channelService ?? new ChannelService();

    debug(`Starting channel bridge: channel=${input.channelName}, agent=${input.agentName}`);
    const channelEntry = await configStore.getChannel(input.channelName);
    const runningBridge = await channelService.getLiveBridgeByChannel(input.channelName);

    if (!channelEntry) {
        ui.error(`No channel configured with name "${input.channelName}".`);
        return;
    }
    if (runningBridge && runningBridge.bridgePid !== process.pid) {
        ui.error(`Channel "${input.channelName}" bridge is already running (PID: ${runningBridge.bridgePid}).`);
        return;
    }

    const telegramConfig = channelEntry.config as TelegramConfig;
    debug(`Telegram channel "${input.channelName}" found: bot=@${telegramConfig.botUsername}`);

    debug(`Resolving agent: "${input.agentName}"`);
    const agentManager = createAgentManager();
    const agent = await resolveTargetAgent(agentManager, input.agentName);
    if (!agent) return;

    debug(`Agent resolved: name=${agent.name}, type=${agent.type}, pid=${agent.pid}`);
    debug(`Agent session file: ${agent.sessionFilePath ?? 'none'}`);

    const agentAdapter = agentManager.getAdapter(agent.type);
    if (!agentAdapter) {
        ui.error(`Unsupported agent type: ${agent.type}`);
        return;
    }

    debug(`Agent adapter loaded for type: ${agent.type}`);

    debug(`Looking up terminal for PID: ${agent.pid}`);
    const focusManager = new TerminalFocusManager();
    const terminalLocation = await focusManager.findTerminal(agent.pid);

    if (!terminalLocation) {
        ui.error(`Cannot find terminal for agent "${agent.name}" (PID: ${agent.pid}).`);
        return;
    }

    debug(`Terminal found: ${JSON.stringify(terminalLocation)}`);

    const telegram = new TelegramAdapter({ botToken: telegramConfig.botToken });
    const chatIdRef = {
        value: telegramConfig.authorizedChatId !== undefined
            ? String(telegramConfig.authorizedChatId)
            : null,
    };

    setupInputHandler(telegram, terminalLocation, chatIdRef, async (chatId) => {
        const latest = await configStore.getChannel(input.channelName);
        if (!latest) return;
        const latestTelegramConfig = latest.config as TelegramConfig;
        await configStore.saveChannel(input.channelName, {
            ...latest,
            config: {
                ...latestTelegramConfig,
                authorizedChatId: Number(chatId),
            },
        });
    });
    const askUserQuestionService = new AskUserQuestionService(
        telegram,
        // AskUserQuestion picker reacts to raw digit keystrokes (1-N), not to
        // pasted text. Use sendKey to bypass bracketed paste / auto-Enter.
        (key) => TtyWriter.sendKey(terminalLocation, key),
    );
    telegram.onCallback(async (cb) => {
        if (cb.chatId !== chatIdRef.value) {
            debug(`callback rejected: chatId=${cb.chatId} not authorized`);
            return;
        }
        await askUserQuestionService.handleCallback(cb);
    });

    debug(`Starting output polling (interval: ${AGENT_POLL_INTERVAL_MS}ms)`);
    const pollInterval = startOutputPolling(telegram, agentAdapter, agent, chatIdRef, {
        askUserQuestionService,
    });

    const manager = new ChannelManager();
    manager.registerAdapter(telegram);
    setupGracefulShutdown(manager, pollInterval, channelService, input.channelName);

    ui.success(`Bridge started: ${input.channelName} (@${telegramConfig.botUsername}) <-> Agent "${agent.name}" (PID: ${agent.pid})`);
    ui.info('Send a message to your Telegram bot to start chatting.');
    ui.info('Press Ctrl+C to stop.\n');

    await channelService.registerBridge({
        channelName: input.channelName,
        channelType: TELEGRAM_CHANNEL_TYPE,
        agentName: agent.name,
        agentPid: agent.pid,
        bridgePid: process.pid,
        startedAt: new Date().toISOString(),
    });
    debug(`Registered channel bridge entry: ${input.channelName}`);

    try {
        debug('Calling manager.startAll()');
        await manager.startAll();
        debug('ChannelManager started successfully');
    } catch (error) {
        await channelService.unregisterBridge(input.channelName);
        throw error;
    }

    await new Promise(() => {});
}

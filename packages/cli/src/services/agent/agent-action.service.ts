import fs from 'fs';
import os from 'os';
import {
    AGENTS,
    AgentManager,
    AgentRegistry,
    AgentStatus,
    ClaudeCodeAdapter,
    ClaudePrintAgentService,
    CodexAdapter,
    CopilotAdapter,
    GeminiCliAdapter,
    GrokCliAdapter,
    OpenCodeAdapter,
    PiAdapter,
    PrintAgentStore,
    RenameConflictError,
    RenameNotFoundError,
    TerminalFocusManager,
    TmuxManager,
    type AgentInfo,
    type StartableAgentType,
} from '@ai-devkit/agent-manager';
import { select } from '@inquirer/prompts';
import { enableDebug, createLogger } from '../../util/debug.js';
import { ui } from '../../util/terminal-ui.js';
import {
    AgentNameInUseError,
    AgentPidPollTimeoutError,
    TmuxUnavailableError,
    assertSendTargetOptions,
    killAgent,
    sendToAgent,
    sendToAgentGroup,
    startAgent,
    type SendReporter,
} from './agent.service.js';
import {
    AgentGroupNotFoundError,
    createDefaultAgentGroupService,
} from './agent-group.service.js';
import { actionFailed, actionSucceeded, type ApplicationActionResult } from '../actions/action-result.js';

const NAME_REGEX = /^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$/;
// eslint-disable-next-line no-control-regex
const ANSI_ESCAPE_PATTERN = /\x1b\[[0-9;]*m/g;

export interface AgentActionReporter {
    text(message: string, options?: unknown): void;
    info(message: string): void;
    success(message: string): void;
    warning(message: string): void;
    error(message: string): void;
    spinner(message: string): {
        start(): unknown;
        succeed(message?: string): unknown;
        fail(message?: string): unknown;
    };
}
type AgentManagerLike = Pick<AgentManager, 'listAgents' | 'resolveAgent' | 'getAdapter'>;
type FocusManagerLike = Pick<TerminalFocusManager, 'findTerminal' | 'focusTerminal'>;
type RegistryLike = Pick<AgentRegistry, 'rename'>;
type TmuxLike = TmuxManager;
type PrintServiceLike = Pick<ClaudePrintAgentService, 'store' | 'create' | 'send'>;
type GroupServiceLike = ReturnType<typeof createDefaultAgentGroupService>;

export interface StartAgentActionInput {
    agentType: string;
    mode: string;
    name: string;
    cwd: string;
    debug?: boolean;
}

export interface OpenAgentActionInput {
    agentName: string;
    debug?: boolean;
}

export interface SendAgentActionInput {
    agentName?: string;
    groupName?: string;
    message: string;
    wait?: boolean;
    timeout?: string;
    json?: boolean;
}

export interface KillAgentActionInput {
    agentName: string;
}

export interface RenameAgentActionInput {
    currentName: string;
    newName: string;
}

export interface AgentActionService {
    start(input: StartAgentActionInput): Promise<ApplicationActionResult>;
    open(input: OpenAgentActionInput): Promise<ApplicationActionResult>;
    send(input: SendAgentActionInput): Promise<ApplicationActionResult>;
    kill(input: KillAgentActionInput): Promise<ApplicationActionResult>;
    rename(input: RenameAgentActionInput): Promise<ApplicationActionResult>;
}

export interface AgentActionServiceDependencies {
    manager?: AgentManagerLike;
    createFocusManager?: (logger?: (message: string) => void) => FocusManagerLike;
    registry?: RegistryLike;
    tmux?: TmuxLike;
    printService?: PrintServiceLike;
    groupService?: GroupServiceLike;
    reporter?: AgentActionReporter;
    selectAgent?: (options: Parameters<typeof select<AgentInfo>>[0]) => Promise<AgentInfo>;
    writeWaitStatus?: (message: string) => void;
    writeProviderOutput?: (message: string) => void;
    writeJson?: (value: object) => void;
}

export function createAgentManager(): AgentManager {
    const manager = new AgentManager(AgentRegistry.default());
    manager.registerAdapter(new ClaudeCodeAdapter());
    manager.registerAdapter(new CodexAdapter());
    manager.registerAdapter(new CopilotAdapter());
    manager.registerAdapter(new GeminiCliAdapter());
    manager.registerAdapter(new GrokCliAdapter());
    manager.registerAdapter(new OpenCodeAdapter());
    manager.registerAdapter(new PiAdapter());
    return manager;
}

function createPrintAgentService(): ClaudePrintAgentService {
    return new ClaudePrintAgentService({ store: new PrintAgentStore() });
}

function formatCwd(projectPath?: string): string {
    if (!projectPath) return '';
    const home = os.homedir();
    return projectPath.startsWith(home) ? `~${projectPath.slice(home.length)}` : projectPath;
}

function formatStatus(status: AgentStatus): string {
    const labels: Record<AgentStatus, string> = {
        [AgentStatus.RUNNING]: '🟢 run',
        [AgentStatus.WAITING]: '🟡 wait',
        [AgentStatus.IDLE]: '⚪ idle',
        [AgentStatus.UNKNOWN]: '❓ unknown',
    };
    return labels[status] ?? labels[AgentStatus.UNKNOWN];
}

function sanitizeProviderOutput(value: string): string {
    // eslint-disable-next-line no-control-regex
    const withoutOsc = value.replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '');
    return Array.from(withoutOsc, (character) => {
        const code = character.charCodeAt(0);
        return (code < 32 && code !== 9 && code !== 10) || code === 127 ? '' : character;
    }).join('');
}

function createTrackedSendReporter(
    reporter: AgentActionReporter,
): { reporter: SendReporter; getError: () => string | undefined } {
    let error: string | undefined;
    return {
        reporter: {
            info: (text) => text.startsWith('  - ') ? reporter.text(text) : reporter.info(text),
            warning: (text) => reporter.warning(text),
            success: (text) => reporter.success(text),
            error: (text) => {
                error ??= text;
                reporter.error(text);
            },
        },
        getError: () => error,
    };
}

export function createAgentActionService(
    dependencies: AgentActionServiceDependencies = {},
): AgentActionService {
    const reporter = dependencies.reporter ?? ui;
    const manager = dependencies.manager ?? createAgentManager();
    const registry = dependencies.registry ?? AgentRegistry.default();
    const tmux = dependencies.tmux ?? new TmuxManager();
    const printService = dependencies.printService ?? createPrintAgentService();
    const groupService = dependencies.groupService ?? createDefaultAgentGroupService();
    const createFocusManager = dependencies.createFocusManager
        ?? ((logger?: (message: string) => void) => new TerminalFocusManager(logger));
    const selectAgent = dependencies.selectAgent ?? ((options) => select(options));
    const writeWaitStatus = dependencies.writeWaitStatus
        ?? ((message: string) => process.stderr.write(`${message.replace(ANSI_ESCAPE_PATTERN, '')}\n`));
    const writeProviderOutput = dependencies.writeProviderOutput
        ?? ((message: string) => reporter.text(message));
    const writeJson = dependencies.writeJson ?? ((value: object) => console.log(JSON.stringify(value, null, 2)));

    return {
        async start(input) {
            if (input.debug) enableDebug();
            if (!(input.agentType in AGENTS)) {
                const message = `Unsupported agent type "${input.agentType}". Supported: ${Object.keys(AGENTS).join(', ')}.`;
                reporter.error(message);
                return actionFailed(message, 1);
            }
            if (!['interactive', 'print'].includes(input.mode)) {
                throw new Error(`Unsupported agent mode "${input.mode}". Supported: interactive, print.`);
            }
            if (input.mode === 'print' && input.agentType !== 'claude') {
                throw new Error('Print mode currently supports only --type claude.');
            }
            if (!NAME_REGEX.test(input.name)) {
                const message = `Invalid name "${input.name}". Use lowercase letters, digits, and hyphens only. `
                    + 'Must start and end with a letter or digit, 2–64 characters.';
                reporter.error(message);
                return actionFailed(message, 1);
            }
            if (!fs.existsSync(input.cwd)) {
                const message = `Directory "${input.cwd}" does not exist.`;
                reporter.error(message);
                return actionFailed(message, 1);
            }

            try {
                if (input.mode === 'print') {
                    const entry = await printService.create({ name: input.name, cwd: input.cwd });
                    reporter.success(`Print agent "${entry.name}" started (${entry.provider}, ID ${entry.id})`);
                    reporter.text(`Working directory: ${formatCwd(entry.cwd)}`);
                    reporter.text('State: ready (Claude session not started)');
                    return actionSucceeded();
                }

                const entry = await startAgent(
                    { type: input.agentType as StartableAgentType, name: input.name, cwd: input.cwd },
                    { tmux, registry: registry as AgentRegistry, onWarning: (message) => reporter.warning(message) },
                );
                reporter.success(`Agent "${entry.name}" started (${entry.type}, PID ${entry.pid})`);
                reporter.text(`Working directory: ${formatCwd(entry.cwd)}`);
                reporter.text(`Attach: tmux attach -t ${entry.tmuxSession}`);
                return actionSucceeded();
            } catch (error) {
                let message: string;
                if (error instanceof TmuxUnavailableError) {
                    message = 'tmux is not installed or not in PATH. Install it first (e.g., brew install tmux).';
                } else if (error instanceof AgentNameInUseError) {
                    message = `Agent "${error.agentName}" is already running (PID ${error.pid}). Choose a different name.`;
                } else if (error instanceof AgentPidPollTimeoutError) {
                    message = `Agent process not found after ${error.timeoutMs / 1000}s. `
                        + `Verify that "${error.command}" is in PATH inside the tmux environment.`;
                } else {
                    throw error;
                }
                reporter.error(message);
                return actionFailed(message, 1);
            }
        },

        async open(input) {
            const terminalLogger = input.debug ? createLogger('terminal') : undefined;
            if (input.debug) enableDebug();
            const focusManager = createFocusManager(
                terminalLogger ? (message: string) => terminalLogger(message) : undefined,
            );
            const agents = await manager.listAgents();
            if (agents.length === 0) {
                const message = 'No running agents found.';
                reporter.error(message);
                return actionFailed(message);
            }

            const resolved = manager.resolveAgent(input.agentName, agents);
            if (!resolved) {
                const message = `No agent found matching "${input.agentName}".`;
                reporter.error(message);
                reporter.info('Available agents:');
                agents.forEach((agent) => reporter.text(`  - ${agent.name}`));
                return actionFailed(message);
            }

            let targetAgent = resolved;
            if (Array.isArray(resolved)) {
                reporter.warning(`Multiple agents match "${input.agentName}":`);
                targetAgent = await selectAgent({
                    message: 'Select an agent to open:',
                    choices: resolved.map((agent) => ({
                        name: `${agent.name} (${formatStatus(agent.status)}) - ${agent.summary}`,
                        value: agent,
                    })),
                });
            }

            const agent = targetAgent as AgentInfo;
            if (!agent.pid) {
                const message = `Cannot focus agent "${agent.name}" (No PID found).`;
                reporter.error(message);
                return actionFailed(message);
            }

            const spinner = reporter.spinner(`Switching focus to ${agent.name}...`);
            spinner.start();
            const location = await focusManager.findTerminal(agent.pid);
            if (!location) {
                const message = `Could not find terminal window for agent "${agent.name}" (PID: ${agent.pid}).`;
                spinner.fail(message);
                return actionFailed(message);
            }
            const success = await focusManager.focusTerminal(location);
            if (!success) {
                const message = `Failed to switch focus to ${agent.name}.`;
                spinner.fail(message);
                return actionFailed(message);
            }
            spinner.succeed(`Focused ${agent.name}!`);
            return actionSucceeded();
        },

        async send(input) {
            assertSendTargetOptions({
                id: input.agentName,
                group: input.groupName,
                wait: input.wait,
                timeout: input.timeout,
                json: input.json,
            });
            const focusManager = createFocusManager();

            if (input.groupName) {
                const group = groupService.get(input.groupName);
                if (!group) throw new AgentGroupNotFoundError(input.groupName);
                await sendToAgentGroup({ group, prompt: input.message, manager, focusManager });
                return process.exitCode === 1
                    ? actionFailed(`Failed to send message to agent group "${input.groupName}".`)
                    : actionSucceeded();
            }

            const printResolved = await printService.store.resolve(input.agentName!);
            if (Array.isArray(printResolved)) {
                throw new Error(`Multiple print agents match "${input.agentName}".`);
            }
            if (printResolved) {
                if (input.timeout !== undefined) {
                    throw new Error('--timeout is not supported for synchronous print agents.');
                }
                if (input.agentName !== printResolved.id) {
                    const liveAgents = await manager.listAgents();
                    const liveExact = liveAgents.filter((agent) => (
                        agent.name.toLowerCase() === String(input.agentName).toLowerCase()
                    ));
                    if (liveExact.length > 0) {
                        throw new Error(`Agent name "${input.agentName}" is ambiguous across interactive and print modes. Use the print agent ID.`);
                    }
                }
                const result = await printService.send(input.agentName!, input.message);
                if (input.json) {
                    writeJson({
                        target: { id: result.agentId, name: result.agentName, provider: 'claude', mode: 'print' },
                        response: result.result,
                        exitCode: result.exitCode,
                        sessionId: result.sessionId,
                    });
                } else {
                    writeProviderOutput(sanitizeProviderOutput(result.result));
                }
                return actionSucceeded();
            }

            const tracked = createTrackedSendReporter(reporter);
            await sendToAgent({
                id: input.agentName!,
                prompt: input.message,
                manager,
                focusManager,
                wait: input.wait,
                timeout: input.timeout,
                json: input.json,
                reporter: tracked.reporter,
                writeWaitStatus,
                writeJson,
            });
            const error = tracked.getError();
            return error ? actionFailed(error) : actionSucceeded();
        },

        async kill(input) {
            const agents = await manager.listAgents();
            if (agents.length === 0) {
                const message = 'No running agents found.';
                reporter.error(message);
                return actionFailed(message);
            }
            const resolved = manager.resolveAgent(input.agentName, agents);
            if (!resolved) {
                const message = `No agent found matching "${input.agentName}".`;
                reporter.error(message);
                reporter.info('Available agents:');
                agents.forEach((agent) => reporter.text(`  - ${agent.name}`));
                return actionFailed(message);
            }
            if (Array.isArray(resolved)) {
                const message = `Multiple agents match "${input.agentName}":`;
                reporter.error(message);
                resolved.forEach((agent) => reporter.text(`  - ${agent.name} (${formatStatus(agent.status)})`));
                reporter.info('Please use a more specific name.');
                return actionFailed(message);
            }

            const result = await killAgent(resolved, { tmux, registry: registry as AgentRegistry });
            const suffix = result.tmuxSession ? ` and tmux session "${result.tmuxSession}"` : '';
            reporter.success(`Stopped agent "${result.agentName}" (PID ${result.pid})${suffix}.`);
            return actionSucceeded();
        },

        async rename(input) {
            if (!NAME_REGEX.test(input.newName)) {
                const message = `Invalid name "${input.newName}". Use lowercase letters, digits, and hyphens only. `
                    + 'Must start and end with a letter or digit, 2–64 characters.';
                reporter.error(message);
                return actionFailed(message, 1);
            }
            if (input.currentName === input.newName) {
                reporter.info(`Agent "${input.currentName}" already has that name.`);
                return actionSucceeded();
            }
            try {
                registry.rename(input.currentName, input.newName);
                reporter.success(`Agent "${input.currentName}" renamed to "${input.newName}".`);
                return actionSucceeded();
            } catch (error) {
                let message: string;
                if (error instanceof RenameNotFoundError) {
                    message = error.message;
                } else if (error instanceof RenameConflictError) {
                    message = `Agent "${error.agentName}" is already in use. Choose a different name.`;
                } else {
                    throw error;
                }
                reporter.error(message);
                return actionFailed(message, 1);
            }
        },
    };
}

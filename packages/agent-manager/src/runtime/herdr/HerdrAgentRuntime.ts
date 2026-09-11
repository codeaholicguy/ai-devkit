import { HerdrCliClient, isCommandMissing, type HerdrCommandRunner } from './HerdrCliClient.js';
import { HerdrRuntimeError } from './HerdrErrors.js';
import { parseHerdrRuntimeRef } from './HerdrRuntimeRef.js';
import {
    extractAgentRuntimeRef,
    extractProcessInfoPid,
    extractWorkspaceStart,
} from './HerdrResponseParsers.js';
import type {
    AgentRuntimeAvailability,
    InteractiveAgentRuntime,
    RuntimeFocusInput,
    RuntimeSendInput,
    RuntimeStartInput,
    RuntimeStartResult,
    RuntimeStopInput,
} from '../types.js';

const AGENT_START_BUSY_RETRY_MS = 5000;
const AGENT_START_BUSY_RETRY_INTERVAL_MS = 100;

export interface HerdrRuntimeOptions {
    runner?: HerdrCommandRunner;
    env?: NodeJS.ProcessEnv;
    agentStartBusyRetryMs?: number;
    agentStartBusyRetryIntervalMs?: number;
}

export class HerdrAgentRuntime implements InteractiveAgentRuntime {
    readonly provider = 'herdr' as const;

    private readonly client: HerdrCliClient;
    private readonly env: NodeJS.ProcessEnv;
    private readonly agentStartBusyRetryMs: number;
    private readonly agentStartBusyRetryIntervalMs: number;

    constructor(options: HerdrRuntimeOptions = {}) {
        this.client = new HerdrCliClient(options.runner);
        this.env = options.env ?? process.env;
        this.agentStartBusyRetryMs = options.agentStartBusyRetryMs ?? AGENT_START_BUSY_RETRY_MS;
        this.agentStartBusyRetryIntervalMs = options.agentStartBusyRetryIntervalMs ?? AGENT_START_BUSY_RETRY_INTERVAL_MS;
    }

    async isAvailable(): Promise<AgentRuntimeAvailability> {
        try {
            await this.client.run(['--version']);
        } catch (error) {
            if (isCommandMissing(error)) {
                return {
                    ok: false,
                    reason: 'binary-missing',
                    detail: 'herdr command was not found in PATH.',
                };
            }
            return {
                ok: false,
                reason: 'backend-unreachable',
                detail: (error as Error).message,
            };
        }

        try {
            await this.client.run(['api', 'snapshot']);
        } catch (error) {
            return {
                ok: false,
                reason: 'backend-unreachable',
                detail: (error as Error).message,
            };
        }

        const currentPaneId = nonEmptyString(this.env.HERDR_PANE_ID);
        return {
            ok: true,
            insideRuntime: this.env.HERDR_ENV === '1',
            ...(currentPaneId ? { currentPaneId } : {}),
        };
    }

    async startAgent(input: RuntimeStartInput): Promise<RuntimeStartResult> {
        const workspace = extractWorkspaceStart(await this.client.runJson([
            'workspace',
            'create',
            '--cwd',
            input.cwd,
            '--label',
            input.name,
        ]));

        const agentResponse = await this.runAgentStartJson([
            'agent',
            'start',
            input.name,
            '--kind',
            input.kind,
            '--pane',
            workspace.paneId,
            ...(input.timeoutMs ? ['--timeout', String(input.timeoutMs)] : []),
            ...(input.args?.length ? ['--', ...input.args] : []),
        ]);
        const runtimeRef = extractAgentRuntimeRef(agentResponse, {
            name: input.name,
            paneId: workspace.paneId,
            workspaceId: workspace.workspaceId,
        });
        const processInfoResponse = await this.client.runJson(['pane', 'process-info', '--pane', runtimeRef.paneId]);
        const pid = extractProcessInfoPid(processInfoResponse);
        if (pid === null) {
            throw new HerdrRuntimeError('Herdr pane process-info response did not include process pid.');
        }

        return { pid, runtimeRef };
    }

    async send(input: RuntimeSendInput): Promise<void> {
        const ref = parseHerdrRuntimeRef(input.runtimeRef);
        await this.client.run(['agent', 'prompt', ref.paneId, input.prompt]);
    }

    async wait(input: { runtimeRef: unknown; timeoutMs: number }): Promise<void> {
        const ref = parseHerdrRuntimeRef(input.runtimeRef);
        await this.client.run([
            'agent',
            'wait',
            ref.paneId,
            '--until',
            'done',
            '--until',
            'blocked',
            '--timeout',
            String(input.timeoutMs),
        ]);
    }

    async readOutput(input: { runtimeRef: unknown; lines?: number }): Promise<string> {
        const ref = parseHerdrRuntimeRef(input.runtimeRef);
        const { stdout } = await this.client.run([
            'agent',
            'read',
            ref.paneId,
            '--source',
            'recent-unwrapped',
            '--lines',
            String(input.lines ?? 120),
        ]);
        return stdout;
    }

    async focus(input: RuntimeFocusInput): Promise<boolean> {
        const ref = parseHerdrRuntimeRef(input.runtimeRef);
        await this.client.run(['agent', 'focus', ref.paneId]);
        return true;
    }

    async stop(input: RuntimeStopInput): Promise<void> {
        const ref = parseHerdrRuntimeRef(input.runtimeRef);
        await this.client.run(['pane', 'close', ref.paneId]);
    }

    private async runAgentStartJson(args: string[]): Promise<unknown> {
        const deadline = Date.now() + this.agentStartBusyRetryMs;
        let lastBusyError: HerdrRuntimeError | null = null;
        do {
            try {
                return await this.client.runJson(args);
            } catch (error) {
                if (!(error instanceof HerdrRuntimeError) || error.code !== 'agent_pane_busy') throw error;
                lastBusyError = error;
                if (Date.now() >= deadline) break;
                await sleep(this.agentStartBusyRetryIntervalMs);
            }
        } while (Date.now() < deadline);
        throw lastBusyError ?? new HerdrRuntimeError('Herdr agent start failed because the target pane stayed busy.', { code: 'agent_pane_busy' });
    }
}

function sleep(ms: number): Promise<void> {
    if (ms <= 0) return Promise.resolve();
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function nonEmptyString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value : undefined;
}

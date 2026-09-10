import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const AGENT_START_BUSY_RETRY_MS = 5000;
const AGENT_START_BUSY_RETRY_INTERVAL_MS = 100;

export interface HerdrCommandResult {
    stdout: string;
    stderr: string;
}

export type HerdrCommandRunner = (command: string, args: string[]) => Promise<HerdrCommandResult>;

export interface HerdrRuntimeOptions {
    runner?: HerdrCommandRunner;
    env?: NodeJS.ProcessEnv;
    agentStartBusyRetryMs?: number;
    agentStartBusyRetryIntervalMs?: number;
}

export type HerdrRuntimeAvailability =
    | { ok: true; insideRuntime: boolean; currentPaneId?: string }
    | { ok: false; reason: 'binary-missing' | 'backend-unreachable'; detail: string };

export interface HerdrRuntimeRef {
    session: string;
    workspaceId?: string;
    tabId?: string;
    paneId: string;
    agentName?: string;
}

export interface HerdrStartInput {
    name: string;
    cwd: string;
    kind: string;
    args?: string[];
    timeoutMs?: number;
}

export interface HerdrStartResult {
    pid: number;
    runtimeRef: HerdrRuntimeRef;
}

export class HerdrRuntimeError extends Error {
    readonly code?: string;

    constructor(message: string, options: { code?: string } = {}) {
        super(message);
        this.name = 'HerdrRuntimeError';
        this.code = options.code;
    }
}

export class HerdrAgentRuntime {
    readonly provider = 'herdr';

    private readonly runner: HerdrCommandRunner;
    private readonly env: NodeJS.ProcessEnv;
    private readonly agentStartBusyRetryMs: number;
    private readonly agentStartBusyRetryIntervalMs: number;

    constructor(options: HerdrRuntimeOptions = {}) {
        this.runner = options.runner ?? defaultRunner;
        this.env = options.env ?? process.env;
        this.agentStartBusyRetryMs = options.agentStartBusyRetryMs ?? AGENT_START_BUSY_RETRY_MS;
        this.agentStartBusyRetryIntervalMs = options.agentStartBusyRetryIntervalMs ?? AGENT_START_BUSY_RETRY_INTERVAL_MS;
    }

    async isAvailable(): Promise<HerdrRuntimeAvailability> {
        try {
            await this.runner('herdr', ['--version']);
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
            await this.runner('herdr', ['api', 'snapshot']);
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

    async startAgent(input: HerdrStartInput): Promise<HerdrStartResult> {
        const workspace = await this.runJson([
            'workspace',
            'create',
            '--cwd',
            input.cwd,
            '--label',
            input.name,
        ]);
        const workspaceId = getString(workspace, ['result', 'workspace', 'workspace_id']);
        const paneId = getString(workspace, ['result', 'root_pane', 'pane_id']);
        if (!paneId) {
            throw new HerdrRuntimeError('Herdr workspace create response did not include root pane id.');
        }

        const agentResponse = await this.runAgentStartJson([
            'agent',
            'start',
            input.name,
            '--kind',
            input.kind,
            '--pane',
            paneId,
            ...(input.timeoutMs ? ['--timeout', String(input.timeoutMs)] : []),
            ...(input.args?.length ? ['--', ...input.args] : []),
        ]);
        const agentPaneId = getString(agentResponse, ['result', 'agent', 'pane_id']) ?? paneId;
        const agentName = getString(agentResponse, ['result', 'agent', 'name']) ?? input.name;
        const tabId = getString(agentResponse, ['result', 'agent', 'tab_id']);
        const processInfoResponse = await this.runJson(['pane', 'process-info', '--pane', agentPaneId]);
        const processInfo = getObject(processInfoResponse, ['result', 'process_info']);
        const pid = extractProcessInfoPid(processInfo);
        if (pid === null) {
            throw new HerdrRuntimeError('Herdr pane process-info response did not include process pid.');
        }

        return {
            pid,
            runtimeRef: {
                session: 'default',
                ...(workspaceId ? { workspaceId } : {}),
                ...(tabId ? { tabId } : {}),
                paneId: agentPaneId,
                agentName,
            },
        };
    }

    async send(input: { runtimeRef: unknown; prompt: string }): Promise<void> {
        const ref = parseHerdrRuntimeRef(input.runtimeRef);
        await this.runner('herdr', ['agent', 'prompt', ref.paneId, input.prompt]);
    }

    async wait(input: { runtimeRef: unknown; timeoutMs: number }): Promise<void> {
        const ref = parseHerdrRuntimeRef(input.runtimeRef);
        await this.runner('herdr', [
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
        const { stdout } = await this.runner('herdr', [
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

    async focus(input: { runtimeRef: unknown }): Promise<boolean> {
        const ref = parseHerdrRuntimeRef(input.runtimeRef);
        await this.runner('herdr', ['agent', 'focus', ref.paneId]);
        return true;
    }

    async stop(input: { runtimeRef: unknown }): Promise<void> {
        const ref = parseHerdrRuntimeRef(input.runtimeRef);
        await this.runner('herdr', ['pane', 'close', ref.paneId]);
    }

    private async runJson(args: string[]): Promise<unknown> {
        let stdout: string;
        try {
            ({ stdout } = await this.runner('herdr', args));
        } catch (error) {
            throw parseHerdrCommandError(error);
        }
        try {
            const parsed = JSON.parse(stdout) as unknown;
            const herdrError = herdrErrorFromResponse(parsed);
            if (herdrError) throw herdrError;
            return parsed;
        } catch (error) {
            if (error instanceof HerdrRuntimeError) throw error;
            throw new HerdrRuntimeError(`Herdr returned invalid JSON: ${(error as Error).message}`);
        }
    }

    private async runAgentStartJson(args: string[]): Promise<unknown> {
        const deadline = Date.now() + this.agentStartBusyRetryMs;
        let lastBusyError: HerdrRuntimeError | null = null;
        do {
            try {
                return await this.runJson(args);
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

export function parseHerdrRuntimeRef(value: unknown): HerdrRuntimeRef {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new HerdrRuntimeError('Herdr runtime ref is missing or invalid.');
    }
    const ref = value as {
        session?: unknown;
        workspaceId?: unknown;
        tabId?: unknown;
        paneId?: unknown;
        agentName?: unknown;
    };
    const session = nonEmptyString(ref.session) ?? 'default';
    const workspaceId = nonEmptyString(ref.workspaceId);
    const tabId = nonEmptyString(ref.tabId);
    const paneId = nonEmptyString(ref.paneId);
    const agentName = nonEmptyString(ref.agentName);
    if (!paneId) {
        throw new HerdrRuntimeError('Herdr runtime ref is missing paneId.');
    }
    return {
        session,
        paneId,
        ...(workspaceId ? { workspaceId } : {}),
        ...(tabId ? { tabId } : {}),
        ...(agentName ? { agentName } : {}),
    };
}

function defaultRunner(command: string, args: string[]): Promise<HerdrCommandResult> {
    return execFileAsync(command, args).then(({ stdout, stderr }) => ({ stdout, stderr }));
}

function parseHerdrCommandError(error: unknown): HerdrRuntimeError {
    const stdout = typeof error === 'object' && error && 'stdout' in error
        ? String((error as { stdout?: unknown }).stdout ?? '')
        : '';
    const stderr = typeof error === 'object' && error && 'stderr' in error
        ? String((error as { stderr?: unknown }).stderr ?? '')
        : '';
    const parsed = parseJson(stdout) ?? parseJson(stderr);
    if (parsed) {
        const herdrError = herdrErrorFromResponse(parsed);
        if (herdrError) return herdrError;
    }
    return new HerdrRuntimeError((error as Error).message);
}

function herdrErrorFromResponse(value: unknown): HerdrRuntimeError | null {
    const error = getObject(value, ['error']);
    if (!error) return null;
    const message = nonEmptyString(error.message) ?? 'Herdr command failed.';
    const code = nonEmptyString(error.code);
    return new HerdrRuntimeError(message, code ? { code } : {});
}

function parseJson(value: string): unknown | null {
    if (!value.trim()) return null;
    try {
        return JSON.parse(value) as unknown;
    } catch {
        return null;
    }
}

function sleep(ms: number): Promise<void> {
    if (ms <= 0) return Promise.resolve();
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function isCommandMissing(error: unknown): boolean {
    return Boolean(error && typeof error === 'object' && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT');
}

function nonEmptyString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value : undefined;
}

function getObject(value: unknown, path: string[]): Record<string, unknown> | null {
    let current = value;
    for (const part of path) {
        if (!current || typeof current !== 'object' || Array.isArray(current) || !(part in current)) return null;
        current = (current as Record<string, unknown>)[part];
    }
    return current && typeof current === 'object' && !Array.isArray(current)
        ? current as Record<string, unknown>
        : null;
}

function getString(value: unknown, path: string[]): string | undefined {
    const parent = getObject(value, path.slice(0, -1));
    return parent ? nonEmptyString(parent[path[path.length - 1]!]) : undefined;
}

function extractProcessInfoPid(processInfo: Record<string, unknown> | null): number | null {
    if (!processInfo) return null;
    const processes = processInfo.foreground_processes;
    if (!Array.isArray(processes)) return numberOrNull(processInfo.shell_pid);
    for (const processInfo of processes) {
        if (!processInfo || typeof processInfo !== 'object') continue;
        const pid = numberOrNull((processInfo as { pid?: unknown }).pid);
        if (pid !== null) return pid;
    }
    return numberOrNull(processInfo.shell_pid);
}

function numberOrNull(value: unknown): number | null {
    return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

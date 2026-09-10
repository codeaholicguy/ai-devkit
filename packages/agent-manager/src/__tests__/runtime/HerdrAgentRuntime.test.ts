import { HerdrAgentRuntime, HerdrRuntimeError, type HerdrCommandRunner } from '../../runtime/HerdrAgentRuntime.js';

function createRunner(responses: Array<{ stdout?: string; stderr?: string; reject?: Error }> = []): HerdrCommandRunner {
    const runner = vi.fn(async () => {
        const response = responses.shift();
        if (!response) return { stdout: '{}', stderr: '' };
        if (response.reject) throw response.reject;
        return { stdout: response.stdout ?? '', stderr: response.stderr ?? '' };
    });
    return runner;
}

function herdrCliError(response: unknown): Error {
    return Object.assign(new Error('herdr command failed'), {
        stdout: JSON.stringify(response),
        stderr: '',
        code: 1,
    });
}

function jsonResponse(value: unknown): { stdout: string } {
    return { stdout: JSON.stringify(value) };
}

function workspaceResponse(workspaceId = 'w1', paneId = 'w1:p1'): { stdout: string } {
    return jsonResponse({
        result: {
            type: 'workspace_info',
            workspace: { workspace_id: workspaceId },
            root_pane: { pane_id: paneId },
        },
    });
}

function agentResponse({
    name = 'reviewer',
    paneId = 'w1:p1',
    workspaceId,
    tabId,
}: {
    name?: string;
    paneId?: string;
    workspaceId?: string;
    tabId?: string;
} = {}): { stdout: string } {
    return jsonResponse({
        result: {
            type: 'agent_info',
            agent: {
                name,
                agent: 'codex',
                pane_id: paneId,
                ...(workspaceId ? { workspace_id: workspaceId } : {}),
                ...(tabId ? { tab_id: tabId } : {}),
            },
        },
    });
}

function processInfoResponse({
    paneId = 'w1:p1',
    pid,
    shellPid,
    processName,
}: {
    paneId?: string;
    pid?: number;
    shellPid?: number;
    processName?: string;
} = {}): { stdout: string } {
    return jsonResponse({
        result: {
            type: 'pane_process_info',
            process_info: {
                pane_id: paneId,
                ...(shellPid ? { shell_pid: shellPid } : {}),
                foreground_processes: pid ? [{ pid, ...(processName ? { name: processName } : {}) }] : [],
            },
        },
    });
}

const startInput = {
    name: 'reviewer',
    cwd: '/repo',
    kind: 'codex',
    args: [],
    timeoutMs: 15000,
};

describe('HerdrAgentRuntime', () => {
    it('reports unavailable when the herdr binary is missing', async () => {
        const runner = createRunner([
            { reject: Object.assign(new Error('not found'), { code: 'ENOENT' }) },
        ]);
        const runtime = new HerdrAgentRuntime({ runner, env: {} });

        await expect(runtime.isAvailable()).resolves.toEqual({
            ok: false,
            reason: 'binary-missing',
            detail: 'herdr command was not found in PATH.',
        });
    });

    it('reports available outside Herdr when binary and snapshot work', async () => {
        const runner = createRunner([
            { stdout: 'herdr 0.8.2\n' },
            jsonResponse({ id: 'cli:api:snapshot', result: { type: 'session_snapshot' } }),
        ]);
        const runtime = new HerdrAgentRuntime({ runner, env: {} });

        await expect(runtime.isAvailable()).resolves.toEqual({
            ok: true,
            insideRuntime: false,
        });
        expect(runner).toHaveBeenNthCalledWith(1, 'herdr', ['--version']);
        expect(runner).toHaveBeenNthCalledWith(2, 'herdr', ['api', 'snapshot']);
    });

    it('includes Herdr environment context when present', async () => {
        const runner = createRunner([
            { stdout: 'herdr 0.8.2\n' },
            jsonResponse({ id: 'cli:api:snapshot', result: { type: 'session_snapshot' } }),
        ]);
        const runtime = new HerdrAgentRuntime({
            runner,
            env: { HERDR_ENV: '1', HERDR_PANE_ID: 'w1:p1' },
        });

        await expect(runtime.isAvailable()).resolves.toEqual({
            ok: true,
            insideRuntime: true,
            currentPaneId: 'w1:p1',
        });
    });

    it('creates a workspace, starts the named agent, and returns an opaque Herdr ref', async () => {
        const runner = createRunner([
            workspaceResponse(),
            agentResponse({ workspaceId: 'w1', tabId: 'w1:t1' }),
            processInfoResponse({ shellPid: 12000, pid: 12345, processName: 'codex' }),
        ]);
        const runtime = new HerdrAgentRuntime({ runner, env: {} });

        const result = await runtime.startAgent(startInput);

        expect(runner).toHaveBeenNthCalledWith(1, 'herdr', [
            'workspace', 'create', '--cwd', '/repo', '--label', 'reviewer',
        ]);
        expect(runner).toHaveBeenNthCalledWith(2, 'herdr', [
            'agent', 'start', 'reviewer', '--kind', 'codex', '--pane', 'w1:p1', '--timeout', '15000',
        ]);
        expect(runner).toHaveBeenNthCalledWith(3, 'herdr', [
            'pane', 'process-info', '--pane', 'w1:p1',
        ]);
        expect(result).toEqual({
            pid: 12345,
            runtimeRef: {
                session: 'default',
                workspaceId: 'w1',
                tabId: 'w1:t1',
                paneId: 'w1:p1',
                agentName: 'reviewer',
            },
        });
    });

    it('falls back to the pane shell pid when no foreground process pid is reported', async () => {
        const runner = createRunner([
            workspaceResponse(),
            agentResponse(),
            processInfoResponse({ shellPid: 12000 }),
        ]);
        const runtime = new HerdrAgentRuntime({ runner, env: {} });

        await expect(runtime.startAgent(startInput)).resolves.toMatchObject({ pid: 12000 });
    });

    it('passes only explicit extra agent args after the Herdr start separator', async () => {
        const runner = createRunner([
            workspaceResponse(),
            agentResponse(),
            processInfoResponse({ pid: 12345 }),
        ]);
        const runtime = new HerdrAgentRuntime({ runner, env: {} });

        await runtime.startAgent({
            ...startInput,
            args: ['--model', 'gpt-5-codex'],
        });

        expect(runner).toHaveBeenNthCalledWith(2, 'herdr', [
            'agent', 'start', 'reviewer', '--kind', 'codex', '--pane', 'w1:p1', '--timeout', '15000', '--', '--model', 'gpt-5-codex',
        ]);
    });

    it('retries agent start when a freshly-created Herdr pane is temporarily busy', async () => {
        const runner = createRunner([
            workspaceResponse('w15', 'w15:p1'),
            {
                reject: herdrCliError({
                    error: {
                        code: 'agent_pane_busy',
                        message: 'agent target pane w15:p1 is not an available shell',
                    },
                    id: 'cli:agent:start',
                }),
            },
            agentResponse({ paneId: 'w15:p1', workspaceId: 'w15', tabId: 'w15:t1' }),
            processInfoResponse({ paneId: 'w15:p1', pid: 12345 }),
        ]);
        const runtime = new HerdrAgentRuntime({
            runner,
            env: {},
            agentStartBusyRetryMs: 100,
            agentStartBusyRetryIntervalMs: 0,
        });

        await expect(runtime.startAgent(startInput)).resolves.toMatchObject({
            runtimeRef: {
                workspaceId: 'w15',
                paneId: 'w15:p1',
            },
        });

        expect(runner).toHaveBeenNthCalledWith(2, 'herdr', [
            'agent', 'start', 'reviewer', '--kind', 'codex', '--pane', 'w15:p1', '--timeout', '15000',
        ]);
        expect(runner).toHaveBeenNthCalledWith(3, 'herdr', [
            'agent', 'start', 'reviewer', '--kind', 'codex', '--pane', 'w15:p1', '--timeout', '15000',
        ]);
    });

    it('surfaces non-retryable Herdr agent start errors without retrying', async () => {
        const runner = createRunner([
            workspaceResponse(),
            {
                reject: herdrCliError({
                    error: {
                        code: 'duplicate_agent_name',
                        message: 'agent name reviewer already exists',
                    },
                    id: 'cli:agent:start',
                }),
            },
        ]);
        const runtime = new HerdrAgentRuntime({ runner, env: {} });

        await expect(runtime.startAgent(startInput)).rejects.toMatchObject({
            code: 'duplicate_agent_name',
            message: 'agent name reviewer already exists',
        });

        expect(runner).toHaveBeenCalledTimes(2);
    });

    it('rejects start responses when Herdr process info does not include a pid', async () => {
        const runner = createRunner([
            workspaceResponse(),
            agentResponse(),
            processInfoResponse(),
        ]);
        const runtime = new HerdrAgentRuntime({ runner, env: {} });

        await expect(runtime.startAgent(startInput))
            .rejects.toThrow(new HerdrRuntimeError('Herdr pane process-info response did not include process pid.'));
    });

    it('rejects start responses that do not include a pane id', async () => {
        const runner = createRunner([
            { stdout: '{"result":{"workspace":{"workspace_id":"w1"}}}' },
        ]);
        const runtime = new HerdrAgentRuntime({ runner, env: {} });

        await expect(runtime.startAgent(startInput))
            .rejects.toThrow(new HerdrRuntimeError('Herdr workspace create response did not include root pane id.'));
    });

    it('sends, waits, reads, focuses, and stops by Herdr pane ref', async () => {
        const runner = createRunner([
            { stdout: '{}' },
            { stdout: '{"result":{"agent":{"agent_status":"done"}}}' },
            { stdout: 'done\n' },
            { stdout: '{}' },
            { stdout: '{}' },
        ]);
        const runtime = new HerdrAgentRuntime({ runner, env: {} });
        const runtimeRef = { paneId: 'w1:p2', agentName: 'reviewer' };

        await runtime.send({ runtimeRef, prompt: 'continue' });
        await runtime.wait({ runtimeRef, timeoutMs: 2000 });
        await expect(runtime.readOutput({ runtimeRef, lines: 80 })).resolves.toBe('done\n');
        await expect(runtime.focus({ runtimeRef })).resolves.toBe(true);
        await runtime.stop({ runtimeRef });

        expect(runner).toHaveBeenNthCalledWith(1, 'herdr', ['agent', 'prompt', 'w1:p2', 'continue']);
        expect(runner).toHaveBeenNthCalledWith(2, 'herdr', ['agent', 'wait', 'w1:p2', '--until', 'done', '--until', 'blocked', '--timeout', '2000']);
        expect(runner).toHaveBeenNthCalledWith(3, 'herdr', ['agent', 'read', 'w1:p2', '--source', 'recent-unwrapped', '--lines', '80']);
        expect(runner).toHaveBeenNthCalledWith(4, 'herdr', ['agent', 'focus', 'w1:p2']);
        expect(runner).toHaveBeenNthCalledWith(5, 'herdr', ['pane', 'close', 'w1:p2']);
    });
});

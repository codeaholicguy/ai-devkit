import {
    AgentNameInUseError,
    AgentPidPollTimeoutError,
    AgentTerminalNotFoundError,
    DEFAULT_PID_POLL_TIMEOUT_MS,
    focusAgent,
    sendAgentPrompt,
    startAgent,
    stopAgent,
    TmuxUnavailableError,
    type StartAgentOptions,
} from '../../runtime/ManagedAgentRuntime.js';
import type { AgentInfo } from '../../adapters/AgentAdapter.js';
import type { AgentRegistry, RegistryEntry } from '../../utils/AgentRegistry.js';
import type { TmuxManager } from '../../terminal/TmuxManager.js';
import type { HerdrInteractiveRuntime } from '../../runtime/AgentRuntime.js';

function makeAgent(overrides: Partial<AgentInfo> = {}): AgentInfo {
    return {
        name: 'repo-a',
        type: 'claude',
        status: 'running' as AgentInfo['status'],
        summary: 'Working',
        pid: 10,
        projectPath: '/repo',
        sessionId: 'session-1',
        sessionFilePath: '/tmp/session.jsonl',
        lastActive: new Date('2026-05-14T00:00:00.000Z'),
        ...overrides,
    };
}

function makeTmux(over: Partial<TmuxManager> = {}): TmuxManager {
    return {
        isAvailable: vi.fn().mockResolvedValue(true),
        sessionExists: vi.fn().mockResolvedValue(false),
        createSession: vi.fn().mockResolvedValue(undefined),
        sendKeys: vi.fn().mockResolvedValue(undefined),
        killSession: vi.fn().mockResolvedValue(undefined),
        findAgentPid: vi.fn().mockResolvedValue(12345),
        ...over,
    } as unknown as TmuxManager;
}

function makeRegistry(over: Partial<AgentRegistry> = {}): AgentRegistry {
    return {
        prune: vi.fn(),
        lookup: vi.fn().mockReturnValue(null),
        list: vi.fn().mockReturnValue([]),
        register: vi.fn(),
        isAlive: vi.fn().mockReturnValue(false),
        ...over,
    } as unknown as AgentRegistry;
}

function makeRuntime(over: Partial<HerdrInteractiveRuntime> = {}): HerdrInteractiveRuntime {
    return {
        provider: 'herdr',
        isAvailable: vi.fn().mockResolvedValue({ ok: true, insideRuntime: false }),
        startAgent: vi.fn().mockResolvedValue({
            pid: 12345,
            runtimeRef: { session: 'default', paneId: 'w1:p2', agentName: 'agent1' },
        }),
        send: vi.fn().mockResolvedValue(undefined),
        wait: vi.fn().mockResolvedValue(undefined),
        readOutput: vi.fn().mockResolvedValue('done\n'),
        focus: vi.fn().mockResolvedValue(true),
        stop: vi.fn().mockResolvedValue(undefined),
        ...over,
    } as unknown as HerdrInteractiveRuntime;
}

const startOpts: StartAgentOptions = {
    type: 'claude',
    name: 'agent1',
    cwd: '/work',
    pollIntervalMs: 1,
    pollTimeoutMs: 50,
};

describe('managed agent runtime defaults', () => {
    it('allows slower agent startup before PID polling times out', () => {
        expect(DEFAULT_PID_POLL_TIMEOUT_MS).toBe(15_000);
    });
});

describe('stopAgent', () => {
    it('sends SIGTERM to the agent PID', async () => {
        const tmux = makeTmux();
        const registry = makeRegistry();
        const killProcess = vi.fn();

        const result = await stopAgent(makeAgent({ name: 'repo-a', pid: 123 }), {
            tmux,
            registry,
            killProcess,
        });

        expect(killProcess).toHaveBeenCalledWith(123, 'SIGTERM');
        expect(tmux.killSession).not.toHaveBeenCalled();
        expect(result).toEqual({
            agentName: 'repo-a',
            pid: 123,
            runtime: 'tmux',
            runtimeRef: null,
        });
    });

    it('kills the registry tmux session when present', async () => {
        const tmux = makeTmux();
        const registry = makeRegistry({
            lookup: vi.fn().mockReturnValue({
                name: 'repo-a',
                type: 'claude',
                pid: 123,
                runtime: 'tmux',
                runtimeRef: { session: 'repo-a' },
                cwd: '/repo',
                startedAt: '2026-06-01T00:00:00.000Z',
                sessionId: 'session-1',
                sessionFilePath: '/tmp/session.jsonl',
            } satisfies RegistryEntry),
        } as Partial<AgentRegistry>);
        const killProcess = vi.fn();

        const result = await stopAgent(makeAgent({ name: 'repo-a', pid: 123 }), {
            tmux,
            registry,
            killProcess,
        });

        expect(killProcess).toHaveBeenCalledWith(123, 'SIGTERM');
        expect(tmux.killSession).toHaveBeenCalledWith('repo-a');
        expect(result.runtimeRef).toEqual({ session: 'repo-a' });
    });

    it('delegates Herdr-backed agents to Herdr without sending SIGTERM directly', async () => {
        const runtime = makeRuntime();
        const registry = makeRegistry({
            lookup: vi.fn().mockReturnValue({
                name: 'repo-a',
                type: 'claude',
                pid: 123,
                runtime: 'herdr',
                runtimeRef: { session: 'default', paneId: 'w1:p2' },
                cwd: '/repo',
                startedAt: '2026-06-01T00:00:00.000Z',
                sessionId: '',
                sessionFilePath: '',
            } satisfies RegistryEntry),
        } as Partial<AgentRegistry>);
        const killProcess = vi.fn();

        const result = await stopAgent(makeAgent({ name: 'repo-a', pid: 123 }), {
            runtime,
            registry,
            killProcess,
        });

        expect(runtime.stop).toHaveBeenCalledWith({ runtimeRef: { session: 'default', paneId: 'w1:p2' } });
        expect(killProcess).not.toHaveBeenCalled();
        expect(result.runtime).toBe('herdr');
    });

    it('still kills tmux session when the process is already gone', async () => {
        const tmux = makeTmux();
        const registry = makeRegistry({
            lookup: vi.fn().mockReturnValue({
                name: 'repo-a',
                type: 'claude',
                pid: 123,
                runtime: 'tmux',
                runtimeRef: { session: 'repo-a' },
                cwd: '/repo',
                startedAt: '2026-06-01T00:00:00.000Z',
                sessionId: 'session-1',
                sessionFilePath: '/tmp/session.jsonl',
            } satisfies RegistryEntry),
        } as Partial<AgentRegistry>);
        const error = Object.assign(new Error('gone'), { code: 'ESRCH' });
        const killProcess = vi.fn(() => { throw error; });

        await stopAgent(makeAgent({ name: 'repo-a', pid: 123 }), {
            tmux,
            registry,
            killProcess,
        });

        expect(tmux.killSession).toHaveBeenCalledWith('repo-a');
    });

    it('rethrows unexpected process kill errors', async () => {
        const tmux = makeTmux();
        const registry = makeRegistry();
        const error = Object.assign(new Error('permission denied'), { code: 'EPERM' });
        const killProcess = vi.fn(() => { throw error; });

        await expect(stopAgent(makeAgent({ name: 'repo-a', pid: 123 }), {
            tmux,
            registry,
            killProcess,
        })).rejects.toThrow('permission denied');

        expect(tmux.killSession).not.toHaveBeenCalled();
    });
});

describe('focusAgent', () => {
    it('delegates Herdr-backed agents to Herdr focus', async () => {
        const runtimeRef = { session: 'default', paneId: 'w1:p2', agentName: 'repo-a' };
        const runtime = makeRuntime();
        const registry = makeRegistry({
            lookup: vi.fn().mockReturnValue({
                name: 'repo-a',
                type: 'claude',
                pid: 10,
                runtime: 'herdr',
                runtimeRef,
                cwd: '/repo',
                startedAt: '2026-06-01T00:00:00.000Z',
            } satisfies RegistryEntry),
        } as Partial<AgentRegistry>);
        const focusManager = {
            findTerminal: vi.fn(),
            focusTerminal: vi.fn(),
        };

        const result = await focusAgent(makeAgent(), { registry, runtime, focusManager });

        expect(runtime.focus).toHaveBeenCalledWith({ runtimeRef });
        expect(focusManager.findTerminal).not.toHaveBeenCalled();
        expect(result).toEqual({ focused: true });
    });

    it('reports when a tmux-backed terminal cannot be found', async () => {
        const focusManager = {
            findTerminal: vi.fn().mockResolvedValue(null),
            focusTerminal: vi.fn(),
        };

        const result = await focusAgent(makeAgent({ pid: 10 }), {
            registry: makeRegistry(),
            focusManager,
        });

        expect(focusManager.findTerminal).toHaveBeenCalledWith(10);
        expect(focusManager.focusTerminal).not.toHaveBeenCalled();
        expect(result).toEqual({ focused: false, reason: 'terminal-not-found' });
    });

    it('reports when focusing a found terminal fails', async () => {
        const location = { type: 'tmux', identifier: '1:1', tty: '/dev/ttys030' };
        const focusManager = {
            findTerminal: vi.fn().mockResolvedValue(location),
            focusTerminal: vi.fn().mockResolvedValue(false),
        };

        const result = await focusAgent(makeAgent({ pid: 10 }), {
            registry: makeRegistry(),
            focusManager,
        });

        expect(focusManager.focusTerminal).toHaveBeenCalledWith(location);
        expect(result).toEqual({ focused: false, reason: 'focus-failed' });
    });
});

describe('sendAgentPrompt', () => {
    it('sends Herdr-backed prompts through Herdr', async () => {
        const runtimeRef = { session: 'default', paneId: 'w1:p2', agentName: 'repo-a' };
        const runtime = makeRuntime();
        const registry = makeRegistry({
            lookup: vi.fn().mockReturnValue({
                name: 'repo-a',
                type: 'claude',
                pid: 10,
                runtime: 'herdr',
                runtimeRef,
                cwd: '/repo',
                startedAt: '2026-06-01T00:00:00.000Z',
            } satisfies RegistryEntry),
        } as Partial<AgentRegistry>);
        const focusManager = {
            findTerminal: vi.fn(),
        };

        await sendAgentPrompt(makeAgent(), 'hello', {
            registry,
            runtime,
            focusManager,
        });

        expect(runtime.send).toHaveBeenCalledWith({ runtimeRef, prompt: 'hello' });
        expect(focusManager.findTerminal).not.toHaveBeenCalled();
    });

    it('writes tmux-backed prompts to the resolved terminal', async () => {
        const location = { type: 'tmux', identifier: '1:1', tty: '/dev/ttys030' };
        const focusManager = {
            findTerminal: vi.fn().mockResolvedValue(location),
        };
        const writer = vi.fn().mockResolvedValue(undefined);

        await sendAgentPrompt(makeAgent({ pid: 10 }), 'hello', {
            registry: makeRegistry(),
            focusManager,
            writer,
        });

        expect(focusManager.findTerminal).toHaveBeenCalledWith(10);
        expect(writer).toHaveBeenCalledWith(location, 'hello');
    });

    it('throws when a tmux-backed terminal cannot be found', async () => {
        const focusManager = {
            findTerminal: vi.fn().mockResolvedValue(null),
        };

        const err = await sendAgentPrompt(makeAgent({ pid: 10 }), 'hello', {
            registry: makeRegistry(),
            focusManager,
        }).catch((error) => error);

        expect(err).toBeInstanceOf(AgentTerminalNotFoundError);
        expect(err.message).toBe('Cannot find terminal for agent "repo-a" (PID: 10).');
    });
});

describe('startAgent', () => {
    it('happy path: creates session, sends command, polls, registers, returns entry', async () => {
        const tmux = makeTmux();
        const registry = makeRegistry();

        const entry = await startAgent(
            { ...startOpts, pollTimeoutMs: 250 },
            { tmux, registry },
        );

        expect(tmux.createSession).toHaveBeenCalledWith('agent1', '/work');
        expect(tmux.sendKeys).toHaveBeenCalledWith('agent1', 'claude');
        expect(registry.prune).toHaveBeenCalled();
        expect(registry.register).toHaveBeenCalledOnce();
        expect(entry).toMatchObject({
            name: 'agent1',
            type: 'claude',
            pid: 12345,
            runtime: 'tmux',
            runtimeRef: { session: 'agent1' },
            cwd: '/work',
            pinned: false,
        });
        expect(entry.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('throws TmuxUnavailableError when tmux is missing', async () => {
        const tmux = makeTmux({ isAvailable: vi.fn().mockResolvedValue(false) } as Partial<TmuxManager>);
        const registry = makeRegistry();

        await expect(startAgent(startOpts, { tmux, registry })).rejects.toBeInstanceOf(TmuxUnavailableError);
        expect(tmux.createSession).not.toHaveBeenCalled();
        expect(registry.register).not.toHaveBeenCalled();
    });

    it('starts Herdr-backed agents through the configured runtime and persists runtime metadata', async () => {
        const runtime = makeRuntime();
        const registry = makeRegistry();

        const entry = await startAgent({ ...startOpts, runtimeProvider: 'herdr' }, { runtime, registry });

        expect(runtime.isAvailable).toHaveBeenCalledOnce();
        expect(runtime.startAgent).toHaveBeenCalledWith({
            name: 'agent1',
            cwd: '/work',
            kind: 'claude',
            args: [],
            timeoutMs: 50,
        });
        expect(entry).toMatchObject({
            name: 'agent1',
            type: 'claude',
            pid: 12345,
            runtime: 'herdr',
            runtimeRef: { session: 'default', paneId: 'w1:p2', agentName: 'agent1' },
            cwd: '/work',
            pinned: false,
        });
        expect(registry.register).toHaveBeenCalledWith(expect.objectContaining({
            runtime: 'herdr',
            runtimeRef: { session: 'default', paneId: 'w1:p2', agentName: 'agent1' },
        }));
    });

    it('fails Herdr starts when the configured runtime is unavailable', async () => {
        const runtime = makeRuntime({
            isAvailable: vi.fn().mockResolvedValue({
                ok: false,
                reason: 'binary-missing',
                detail: 'herdr command was not found in PATH.',
            }),
        });
        const registry = makeRegistry();

        await expect(startAgent({ ...startOpts, runtimeProvider: 'herdr' }, { runtime, registry })).rejects.toMatchObject({
            name: 'AgentRuntimeUnavailableError',
            provider: 'herdr',
            reason: 'binary-missing',
        });
        expect(runtime.startAgent).not.toHaveBeenCalled();
        expect(registry.register).not.toHaveBeenCalled();
    });

    it('throws AgentNameInUseError when registry already has a live entry', async () => {
        const tmux = makeTmux();
        const liveEntry: RegistryEntry = {
            name: 'agent1', type: 'claude', pid: 999,
            runtime: 'tmux', runtimeRef: { session: 'agent1' }, cwd: '/old', startedAt: '2026-01-01T00:00:00.000Z',
        };
        const registry = makeRegistry({ lookup: vi.fn().mockReturnValue(liveEntry) } as Partial<AgentRegistry>);

        const err = await startAgent(startOpts, { tmux, registry }).catch((e) => e);
        expect(err).toBeInstanceOf(AgentNameInUseError);
        expect(err.pid).toBe(999);
        expect(tmux.createSession).not.toHaveBeenCalled();
    });

    it('replaces orphan tmux session and calls onWarning', async () => {
        const tmux = makeTmux({ sessionExists: vi.fn().mockResolvedValue(true) } as Partial<TmuxManager>);
        const registry = makeRegistry();
        const onWarning = vi.fn();

        await startAgent(startOpts, { tmux, registry, onWarning });

        expect(onWarning).toHaveBeenCalledOnce();
        expect(onWarning.mock.calls[0][0]).toContain('agent1');
        expect(tmux.killSession).toHaveBeenCalledWith('agent1');
        expect(tmux.createSession).toHaveBeenCalledWith('agent1', '/work');
    });

    it('on PID poll timeout: kills session and throws AgentPidPollTimeoutError', async () => {
        const tmux = makeTmux({ findAgentPid: vi.fn().mockResolvedValue(null) } as Partial<TmuxManager>);
        const registry = makeRegistry();

        const err = await startAgent(startOpts, { tmux, registry }).catch((e) => e);

        expect(err).toBeInstanceOf(AgentPidPollTimeoutError);
        expect(err.command).toBe('claude');
        expect(err.timeoutMs).toBe(50);
        expect(tmux.killSession).toHaveBeenLastCalledWith('agent1');
        expect(registry.register).not.toHaveBeenCalled();
    });

    it('keeps polling until findAgentPid returns a PID', async () => {
        const findAgentPid = vi.fn()
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(42)
            .mockResolvedValueOnce(42)
            .mockResolvedValueOnce(42)
            .mockResolvedValueOnce(42)
            .mockResolvedValueOnce(42);
        const tmux = makeTmux({ findAgentPid } as Partial<TmuxManager>);
        const registry = makeRegistry();

        const entry = await startAgent(
            { ...startOpts, pollTimeoutMs: 250 },
            { tmux, registry },
        );

        expect(findAgentPid).toHaveBeenCalledTimes(7);
        expect(entry.pid).toBe(42);
    });

    it('waits for the launched process PID to stabilize before registering', async () => {
        const findAgentPid = vi.fn()
            .mockResolvedValueOnce(100)
            .mockResolvedValueOnce(100)
            .mockResolvedValueOnce(100)
            .mockResolvedValueOnce(200)
            .mockResolvedValueOnce(200)
            .mockResolvedValueOnce(200)
            .mockResolvedValueOnce(200)
            .mockResolvedValueOnce(200);
        const tmux = makeTmux({ findAgentPid } as Partial<TmuxManager>);
        const registry = makeRegistry();

        const entry = await startAgent(startOpts, { tmux, registry });

        expect(findAgentPid).toHaveBeenCalledTimes(8);
        expect(entry.pid).toBe(200);
        expect(registry.register).toHaveBeenCalledWith(expect.objectContaining({ pid: 200 }));
    });

    it('treats an unstabilized PID as a poll timeout', async () => {
        const findAgentPid = vi.fn()
            .mockResolvedValueOnce(100)
            .mockResolvedValueOnce(100)
            .mockResolvedValueOnce(100);
        const tmux = makeTmux({ findAgentPid } as Partial<TmuxManager>);
        const registry = makeRegistry();

        const err = await startAgent(
            { ...startOpts, pollTimeoutMs: 3 },
            { tmux, registry },
        ).catch((e) => e);

        expect(err).toBeInstanceOf(AgentPidPollTimeoutError);
        expect(registry.register).not.toHaveBeenCalled();
        expect(tmux.killSession).toHaveBeenLastCalledWith('agent1');
    });

    it('prunes registry before checking for name collision', async () => {
        const tmux = makeTmux();
        const registry = makeRegistry();
        const order: string[] = [];
        (registry.prune as any).mockImplementation(() => order.push('prune'));
        (registry.lookup as any).mockImplementation(() => {
            order.push('lookup');
            return null;
        });

        await startAgent(startOpts, { tmux, registry });
        expect(order).toEqual(['prune', 'lookup']);
    });
});

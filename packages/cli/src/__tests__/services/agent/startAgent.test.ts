import type { AgentRegistry, RegistryEntry, TmuxManager } from '@ai-devkit/agent-manager';
import {
    startAgent,
    AgentNameInUseError,
    AgentPidPollTimeoutError,
    TmuxUnavailableError,
} from '../../../services/agent/agent.service.js';

vi.mock('@ai-devkit/agent-manager', () => ({
    AGENTS: {
        claude:     { command: 'claude',   matches: () => true },
        codex:      { command: 'codex',    matches: () => true },
        gemini_cli: { command: 'gemini',   matches: () => true },
        opencode:   { command: 'opencode', matches: () => true },
    },
}), { virtual: true });

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

const baseOpts = {
    type: 'claude' as const,
    name: 'agent1',
    cwd: '/work',
    pollIntervalMs: 1,
    pollTimeoutMs: 50,
};

describe('startAgent', () => {
    it('happy path: creates session, sends command, polls, registers, returns entry', async () => {
        const tmux = makeTmux();
        const registry = makeRegistry();

        const entry = await startAgent(baseOpts, { tmux, registry });

        expect(tmux.createSession).toHaveBeenCalledWith('agent1', '/work');
        expect(tmux.sendKeys).toHaveBeenCalledWith('agent1', 'claude');
        expect(registry.prune).toHaveBeenCalled();
        expect(registry.register).toHaveBeenCalledOnce();
        expect(entry).toMatchObject({
            name: 'agent1',
            type: 'claude',
            pid: 12345,
            tmuxSession: 'agent1',
            cwd: '/work',
        });
        expect(entry.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('throws TmuxUnavailableError when tmux is missing', async () => {
        const tmux = makeTmux({ isAvailable: vi.fn().mockResolvedValue(false) } as Partial<TmuxManager>);
        const registry = makeRegistry();

        await expect(startAgent(baseOpts, { tmux, registry })).rejects.toBeInstanceOf(TmuxUnavailableError);
        expect(tmux.createSession).not.toHaveBeenCalled();
        expect(registry.register).not.toHaveBeenCalled();
    });

    it('throws AgentNameInUseError when registry already has a live entry', async () => {
        const tmux = makeTmux();
        const liveEntry: RegistryEntry = {
            name: 'agent1', type: 'claude', pid: 999,
            tmuxSession: 'agent1', cwd: '/old', startedAt: '2026-01-01T00:00:00.000Z',
        };
        const registry = makeRegistry({ lookup: vi.fn().mockReturnValue(liveEntry) } as Partial<AgentRegistry>);

        const err = await startAgent(baseOpts, { tmux, registry }).catch((e) => e);
        expect(err).toBeInstanceOf(AgentNameInUseError);
        expect(err.pid).toBe(999);
        expect(tmux.createSession).not.toHaveBeenCalled();
    });

    it('replaces orphan tmux session and calls onWarning', async () => {
        const tmux = makeTmux({
            sessionExists: vi.fn().mockResolvedValue(true),
        } as Partial<TmuxManager>);
        const registry = makeRegistry();
        const onWarning = vi.fn();

        await startAgent(baseOpts, { tmux, registry, onWarning });

        expect(onWarning).toHaveBeenCalledOnce();
        expect(onWarning.mock.calls[0][0]).toContain('agent1');
        expect(tmux.killSession).toHaveBeenCalledWith('agent1');
        expect(tmux.createSession).toHaveBeenCalledWith('agent1', '/work');
    });

    it('on PID poll timeout: kills session and throws AgentPidPollTimeoutError', async () => {
        const tmux = makeTmux({ findAgentPid: vi.fn().mockResolvedValue(null) } as Partial<TmuxManager>);
        const registry = makeRegistry();

        const err = await startAgent(baseOpts, { tmux, registry }).catch((e) => e);

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
            .mockResolvedValueOnce(42);
        const tmux = makeTmux({ findAgentPid } as Partial<TmuxManager>);
        const registry = makeRegistry();

        const entry = await startAgent(baseOpts, { tmux, registry });

        expect(findAgentPid).toHaveBeenCalledTimes(3);
        expect(entry.pid).toBe(42);
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

        await startAgent(baseOpts, { tmux, registry });
        expect(order).toEqual(['prune', 'lookup']);
    });
});

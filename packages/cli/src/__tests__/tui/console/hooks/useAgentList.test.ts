import React from 'react';
import { Writable } from 'node:stream';
import { Text, render } from 'ink';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    AgentStatus,
    type AgentInfo,
    type AgentManager,
} from '@ai-devkit/agent-manager';
import {
    useAgentList,
    type UseAgentListResult,
} from '../../../../tui/console/hooks/useAgentList.js';

interface Deferred<T> {
    promise: Promise<T>;
    resolve(value: T): void;
    reject(error: Error): void;
}

function deferred<T>(): Deferred<T> {
    let resolve!: (value: T) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}

function agent(overrides: Partial<AgentInfo> = {}): AgentInfo {
    return {
        name: 'live-agent',
        type: 'claude',
        status: AgentStatus.RUNNING,
        summary: 'live summary',
        pid: 202,
        projectPath: '/repo/live',
        sessionId: 'live-session',
        lastActive: new Date('2026-08-14T12:00:00.000Z'),
        ...overrides,
    };
}

function createOutput(): { stdout: NodeJS.WriteStream; read(): string } {
    let output = '';
    const stdout = new Writable({
        write(chunk, _encoding, callback) {
            output += chunk.toString();
            callback();
        },
    }) as NodeJS.WriteStream;
    Object.assign(stdout, { columns: 100, rows: 30, isTTY: true });
    return { stdout, read: () => output };
}

function createStateObserver() {
    const states: UseAgentListResult[] = [];
    const waiters: Array<{
        predicate: (state: UseAgentListResult) => boolean;
        resolve: (state: UseAgentListResult) => void;
    }> = [];

    return {
        observe(state: UseAgentListResult): void {
            states.push(state);
            for (let index = waiters.length - 1; index >= 0; index -= 1) {
                const waiter = waiters[index];
                if (waiter.predicate(state)) {
                    waiters.splice(index, 1);
                    waiter.resolve(state);
                }
            }
        },
        waitFor(predicate: (state: UseAgentListResult) => boolean): Promise<UseAgentListResult> {
            const existing = states.find(predicate);
            if (existing) return Promise.resolve(existing);
            return new Promise(resolve => waiters.push({ predicate, resolve }));
        },
        latest(): UseAgentListResult {
            const state = states.at(-1);
            if (!state) throw new Error('No hook state has rendered.');
            return state;
        },
    };
}

const mountedApps: Array<ReturnType<typeof render>> = [];

afterEach(async () => {
    for (const app of mountedApps.splice(0)) {
        app.unmount();
        await app.waitUntilExit();
        app.cleanup();
    }
});

function HookView({
    manager,
    observe,
}: {
    manager: AgentManager;
    observe(state: UseAgentListResult): void;
}) {
    const state = useAgentList(manager, 60_000);
    observe(state);
    const cached = state.cachedAgentPids.size > 0 ? 'cached' : 'live';
    return React.createElement(
        Text,
        null,
        `${state.agents.map(item => item.name).join(',')}|${cached}|${state.isRefreshing ? 'refreshing' : 'settled'}|${state.error ?? ''}`,
    );
}

function renderHookView(manager: AgentManager, observe: (state: UseAgentListResult) => void) {
    const output = createOutput();
    const app = render(React.createElement(HookView, { manager, observe }), {
        stdout: output.stdout,
        interactive: true,
        exitOnCtrlC: false,
        patchConsole: false,
    });
    mountedApps.push(app);
    return { app, output };
}

describe('useAgentList stale-while-revalidate', () => {
    it('renders cached agents on the first frame, then atomically replaces stale rows with live discovery', async () => {
        const liveList = deferred<AgentInfo[]>();
        const manager = {
            getCachedAgentSnapshot: vi.fn(() => [
                {
                    name: 'keep-name',
                    type: 'claude',
                    pid: 101,
                    projectPath: '/repo/keep',
                    startedAt: new Date('2026-08-14T10:00:00.000Z'),
                    sessionId: 'cached-keep',
                    sessionFilePath: '/sessions/keep.jsonl',
                },
                {
                    name: 'stale-name',
                    type: 'claude',
                    pid: 102,
                    projectPath: '/repo/stale',
                    startedAt: new Date('2026-08-14T09:00:00.000Z'),
                    sessionId: 'cached-stale',
                    sessionFilePath: '/sessions/stale.jsonl',
                },
            ]),
            listAgents: vi.fn(() => liveList.promise),
        } as unknown as AgentManager;
        const observer = createStateObserver();
        const { app, output } = renderHookView(manager, observer.observe);

        await app.waitUntilRenderFlush();
        expect(output.read()).toContain('keep-name,stale-name|cached|refreshing');

        liveList.resolve([agent({ name: 'keep-name', pid: 101 })]);
        const reconciled = await observer.waitFor(state => !state.isRefreshing);
        await app.waitUntilRenderFlush();

        expect(reconciled.agents.map(item => item.name)).toEqual(['keep-name']);
        expect(reconciled.cachedAgentPids.size).toBe(0);
        expect(output.read()).toContain('keep-name|live|settled');
    });

    it('keeps cached rows while surfacing a live discovery error', async () => {
        const liveList = deferred<AgentInfo[]>();
        const retryList = deferred<AgentInfo[]>();
        const manager = {
            getCachedAgentSnapshot: vi.fn(() => [{
                name: 'cached-agent',
                type: 'codex',
                pid: 303,
                projectPath: '/repo/cached',
                startedAt: new Date('2026-08-14T10:00:00.000Z'),
                sessionId: 'cached-session',
                sessionFilePath: '',
            }]),
            listAgents: vi.fn()
                .mockImplementationOnce(() => liveList.promise)
                .mockImplementationOnce(() => retryList.promise),
        } as unknown as AgentManager;
        const observer = createStateObserver();
        const { app } = renderHookView(manager, observer.observe);

        liveList.reject(new Error('adapter unavailable'));
        const failed = await observer.waitFor(state => state.error !== null);

        expect(failed.agents.map(item => item.name)).toEqual(['cached-agent']);
        expect(failed.cachedAgentPids).toEqual(new Set([303]));
        expect(failed.error).toBe('adapter unavailable');
        expect(failed.isRefreshing).toBe(false);

        const retryPromise = failed.refresh();
        await app.waitUntilRenderFlush();
        const retrying = observer.latest();
        expect(retrying.isRefreshing).toBe(true);
        expect(retrying.agents.map(item => item.name)).toEqual(['cached-agent']);

        retryList.resolve([agent({ name: 'cached-agent', pid: 303 })]);
        await retryPromise;
        const recovered = await observer.waitFor(state => state.error === null && !state.isRefreshing);
        expect(recovered.cachedAgentPids.size).toBe(0);
    });

    it('preserves the loading empty state when no cache exists', async () => {
        const liveList = deferred<AgentInfo[]>();
        const manager = {
            getCachedAgentSnapshot: vi.fn(() => []),
            listAgents: vi.fn(() => liveList.promise),
        } as unknown as AgentManager;
        const observer = createStateObserver();
        const { app, output } = renderHookView(manager, observer.observe);

        await app.waitUntilRenderFlush();
        expect(output.read()).toContain('|live|refreshing|');

        liveList.resolve([]);
        const settled = await observer.waitFor(state => !state.isRefreshing);
        expect(settled.agents).toEqual([]);
        expect(settled.lastUpdated).toBeInstanceOf(Date);
    });
});

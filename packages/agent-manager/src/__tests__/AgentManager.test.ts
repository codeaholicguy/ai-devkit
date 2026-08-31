/**
 * Tests for AgentManager
 */


import fs from 'fs';
import os from 'os';
import path from 'path';
import { AgentManager } from '../AgentManager.js';
import type {
    AgentAdapter,
    AgentInfo,
    AgentType,
    ConversationMessage,
    SessionSummary,
    ProcessInfo,
} from '../adapters/AgentAdapter.js';
import { AgentStatus } from '../adapters/AgentAdapter.js';
import { AgentRegistry, type RegistryEntry } from '../utils/AgentRegistry.js';

// Mock adapter for testing
class MockAdapter implements AgentAdapter {
    public lastListSessionsOpts: unknown = undefined;

    constructor(
        public readonly type: AgentType,
        private mockAgents: AgentInfo[] = [],
        private shouldFail: boolean = false,
        private mockSessions: SessionSummary[] = [],
        private shouldFailListSessions: boolean = false,
    ) { }

    async detectAgents(): Promise<AgentInfo[]> {
        if (this.shouldFail) {
            throw new Error(`Mock adapter ${this.type} failed`);
        }
        return this.mockAgents;
    }

    canHandle(): boolean {
        return true;
    }

    getConversation(): ConversationMessage[] {
        return [];
    }

    async listSessions(opts?: unknown): Promise<SessionSummary[]> {
        this.lastListSessionsOpts = opts;
        if (this.shouldFailListSessions) {
            throw new Error(`Mock adapter ${this.type} listSessions failed`);
        }
        return this.mockSessions;
    }

    setAgents(agents: AgentInfo[]): void {
        this.mockAgents = agents;
    }

    setFail(shouldFail: boolean): void {
        this.shouldFail = shouldFail;
    }

    setSessions(sessions: SessionSummary[]): void {
        this.mockSessions = sessions;
    }

    setFailListSessions(shouldFail: boolean): void {
        this.shouldFailListSessions = shouldFail;
    }
}

// Helper to create mock agent
function createMockAgent(overrides: Partial<AgentInfo> = {}): AgentInfo {
    return {
        name: 'test-agent',
        type: 'claude',
        status: AgentStatus.RUNNING,
        summary: 'Test summary',
        pid: 12345,
        projectPath: '/test/path',
        sessionId: 'test-session-id',
        lastActive: new Date(),
        ...overrides,
    };
}

describe('AgentManager', () => {
    let manager: AgentManager;
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-manager-'));
        manager = new AgentManager(new AgentRegistry(path.join(tmpDir, 'agents.json')));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    describe('registerAdapter', () => {
        it('should register a new adapter', () => {
            const adapter = new MockAdapter('claude');

            manager.registerAdapter(adapter);

            expect(manager.hasAdapter('claude')).toBe(true);
            expect(manager.getAdapterCount()).toBe(1);
        });

        it('should throw error when registering duplicate adapter type', () => {
            const adapter1 = new MockAdapter('claude');
            const adapter2 = new MockAdapter('claude');

            manager.registerAdapter(adapter1);

            expect(() => manager.registerAdapter(adapter2)).toThrow(
                'Adapter for type "claude" is already registered'
            );
        });

        it('should allow registering multiple different adapter types', () => {
            const adapter1 = new MockAdapter('claude');
            const adapter2 = new MockAdapter('gemini_cli');

            manager.registerAdapter(adapter1);
            manager.registerAdapter(adapter2);

            expect(manager.getAdapterCount()).toBe(2);
            expect(manager.hasAdapter('claude')).toBe(true);
            expect(manager.hasAdapter('gemini_cli')).toBe(true);
        });
    });

    describe('unregisterAdapter', () => {
        it('should unregister an existing adapter', () => {
            const adapter = new MockAdapter('claude');
            manager.registerAdapter(adapter);

            const removed = manager.unregisterAdapter('claude');

            expect(removed).toBe(true);
            expect(manager.hasAdapter('claude')).toBe(false);
            expect(manager.getAdapterCount()).toBe(0);
        });

        it('should return false when unregistering non-existent adapter', () => {
            const removed = manager.unregisterAdapter('NonExistent');
            expect(removed).toBe(false);
        });
    });

    describe('getAdapters', () => {
        it('should return empty array when no adapters registered', () => {
            const adapters = manager.getAdapters();
            expect(adapters).toEqual([]);
        });

        it('should return all registered adapters', () => {
            const adapter1 = new MockAdapter('claude');
            const adapter2 = new MockAdapter('gemini_cli');

            manager.registerAdapter(adapter1);
            manager.registerAdapter(adapter2);

            const adapters = manager.getAdapters();
            expect(adapters).toHaveLength(2);
            expect(adapters).toContain(adapter1);
            expect(adapters).toContain(adapter2);
        });
    });

    describe('listAgents', () => {
        it('shares one process capture while giving each adapter only its declared executables', async () => {
            const processes: ProcessInfo[] = [
                { pid: 101, command: 'claude', cwd: '/claude', tty: 's001' },
                { pid: 202, command: 'node /bin/pi', cwd: '/pi', tty: 's002' },
            ];
            const captureSnapshot = vi.fn(async () => processes);
            const createSnapshotAdapter = (type: AgentType, processNames: string[]) => ({
                type,
                processNames,
                detectAgents: vi.fn(async () => []),
                canHandle: () => true,
                getConversation: () => [],
                listSessions: async () => [],
            });
            const claude = createSnapshotAdapter('claude', ['claude']);
            const pi = createSnapshotAdapter('pi', ['pi', 'node']);
            const snapshotManager = new AgentManager(
                new AgentRegistry(path.join(tmpDir, 'snapshot-agents.json')),
                captureSnapshot,
            );

            snapshotManager.registerAdapter(claude as AgentAdapter);
            snapshotManager.registerAdapter(pi as AgentAdapter);

            await snapshotManager.listAgents();

            expect(captureSnapshot).toHaveBeenCalledTimes(1);
            expect(captureSnapshot).toHaveBeenCalledWith(['claude', 'pi', 'node']);
            expect(claude.detectAgents).toHaveBeenCalledWith({ processes: [processes[0]] });
            expect(pi.detectAgents).toHaveBeenCalledWith({ processes: [processes[1]] });
        });

        it('does not expose foreign command arguments to broad Pi and Gemini matchers', async () => {
            const processes: ProcessInfo[] = [
                { pid: 100, command: 'node /usr/local/lib/gemini.js', cwd: '/g', tty: 's001' },
                { pid: 200, command: 'codex exec --cd /Users/x/repos/gemini', cwd: '/c', tty: 's002' },
                { pid: 300, command: 'node /usr/local/lib/pi.js', cwd: '/p', tty: 's003' },
                { pid: 400, command: 'claude --resume /Users/x/pi/session.jsonl', cwd: '/a', tty: 's004' },
            ];
            const captureSnapshot = vi.fn(async () => processes);
            const createSnapshotAdapter = (type: AgentType, processNames: string[]) => ({
                type,
                processNames,
                detectAgents: vi.fn(async () => []),
                canHandle: () => true,
                getConversation: () => [],
                listSessions: async () => [],
            });
            const gemini = createSnapshotAdapter('gemini_cli', ['node']);
            const codex = createSnapshotAdapter('codex', ['codex']);
            const pi = createSnapshotAdapter('pi', ['pi', 'node']);
            const claude = createSnapshotAdapter('claude', ['claude']);
            const snapshotManager = new AgentManager(
                new AgentRegistry(path.join(tmpDir, 'filtered-snapshot-agents.json')),
                captureSnapshot,
            );

            snapshotManager.registerAdapter(gemini as AgentAdapter);
            snapshotManager.registerAdapter(codex as AgentAdapter);
            snapshotManager.registerAdapter(pi as AgentAdapter);
            snapshotManager.registerAdapter(claude as AgentAdapter);

            await snapshotManager.listAgents();

            expect(captureSnapshot).toHaveBeenCalledTimes(1);
            expect(captureSnapshot).toHaveBeenCalledWith(['node', 'codex', 'pi', 'claude']);
            expect(gemini.detectAgents).toHaveBeenCalledWith({ processes: [processes[0], processes[2]] });
            expect(codex.detectAgents).toHaveBeenCalledWith({ processes: [processes[1]] });
            expect(pi.detectAgents).toHaveBeenCalledWith({ processes: [processes[0], processes[2]] });
            expect(claude.detectAgents).toHaveBeenCalledWith({ processes: [processes[3]] });
        });

        it('does not pass a snapshot context to legacy adapters', async () => {
            const captureSnapshot = vi.fn(async () => []);
            const legacy = new MockAdapter('claude');
            const detect = vi.spyOn(legacy, 'detectAgents');
            const snapshotManager = new AgentManager(
                new AgentRegistry(path.join(tmpDir, 'legacy-agents.json')),
                captureSnapshot,
            );
            snapshotManager.registerAdapter(legacy);

            await snapshotManager.listAgents();

            expect(captureSnapshot).not.toHaveBeenCalled();
            expect(detect).toHaveBeenCalledWith();
        });

        it('should return empty array when no adapters registered', async () => {
            const agents = await manager.listAgents();
            expect(agents).toEqual([]);
        });

        it('should return agents from single adapter', async () => {
            const mockAgents = [
                createMockAgent({ name: 'agent1', sessionId: 'session-1' }),
                createMockAgent({ name: 'agent2', sessionId: 'session-2' }),
            ];
            const adapter = new MockAdapter('claude', mockAgents);

            manager.registerAdapter(adapter);
            const agents = await manager.listAgents();

            expect(agents).toHaveLength(2);
            expect(agents[0].name).toBe('agent1');
            expect(agents[1].name).toBe('agent2');
        });

        it('should aggregate agents from multiple adapters', async () => {
            const claudeAgents = [createMockAgent({ name: 'claude-agent', type: 'claude' })];
            const geminiAgents = [createMockAgent({ name: 'gemini-agent', type: 'gemini_cli' })];

            manager.registerAdapter(new MockAdapter('claude', claudeAgents));
            manager.registerAdapter(new MockAdapter('gemini_cli', geminiAgents));

            const agents = await manager.listAgents();

            expect(agents).toHaveLength(2);
            expect(agents.find(a => a.name === 'claude-agent')).toBeDefined();
            expect(agents.find(a => a.name === 'gemini-agent')).toBeDefined();
        });

        it('should sort agents by status priority (waiting first)', async () => {
            const mockAgents = [
                createMockAgent({ name: 'idle-agent', status: AgentStatus.IDLE, sessionId: 'idle' }),
                createMockAgent({ name: 'waiting-agent', status: AgentStatus.WAITING, sessionId: 'waiting' }),
                createMockAgent({ name: 'running-agent', status: AgentStatus.RUNNING, sessionId: 'running' }),
                createMockAgent({ name: 'unknown-agent', status: AgentStatus.UNKNOWN, sessionId: 'unknown' }),
            ];
            const adapter = new MockAdapter('claude', mockAgents);

            manager.registerAdapter(adapter);
            const agents = await manager.listAgents();

            expect(agents[0].name).toBe('waiting-agent');
            expect(agents[1].name).toBe('running-agent');
            expect(agents[2].name).toBe('idle-agent');
            expect(agents[3].name).toBe('unknown-agent');
        });

        it('should handle adapter errors gracefully', async () => {
            const goodAdapter = new MockAdapter('claude', [
                createMockAgent({ name: 'good-agent' }),
            ]);
            const badAdapter = new MockAdapter('gemini_cli', [], true); // Will fail

            manager.registerAdapter(goodAdapter);
            manager.registerAdapter(badAdapter);

            // Should not throw, should return results from working adapter
            const agents = await manager.listAgents();

            expect(agents).toHaveLength(1);
            expect(agents[0].name).toBe('good-agent');
        });

        it('should return empty array when all adapters fail', async () => {
            const adapter1 = new MockAdapter('claude', [], true);
            const adapter2 = new MockAdapter('gemini_cli', [], true);

            manager.registerAdapter(adapter1);
            manager.registerAdapter(adapter2);

            const agents = await manager.listAgents();
            expect(agents).toEqual([]);
        });
    });

    describe('listAgents — registry persistence', () => {
        let tmpDir: string;
        let regPath: string;
        let registry: AgentRegistry;
        let scopedManager: AgentManager;
        let nowMs: number;
        let databaseOperations: string[];

        beforeEach(() => {
            tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-manager-'));
            regPath = path.join(tmpDir, 'agents.json');
            nowMs = Date.parse('2026-08-14T10:00:00.000Z');
            databaseOperations = [];
            registry = new AgentRegistry(regPath, {
                now: () => new Date(nowMs),
                onDatabaseOperation: (sql) => databaseOperations.push(sql),
            });
            scopedManager = new AgentManager(registry);
            databaseOperations = [];
        });

        afterEach(() => {
            vi.restoreAllMocks();
            fs.rmSync(tmpDir, { recursive: true, force: true });
        });

        it('persists every detected agent to the registry', async () => {
            scopedManager.registerAdapter(new MockAdapter('claude', [
                createMockAgent({
                    name: 'a',
                    pid: process.pid,
                    sessionId: 'sid-a',
                    sessionFilePath: '/path/a.jsonl',
                    projectPath: '/cwd/a',
                }),
            ]));

            await scopedManager.listAgents();

            const entries = registry.list();
            expect(entries).toHaveLength(1);
            expect(entries[0]).toMatchObject({
                name: 'a',
                type: 'claude',
                pid: process.pid,
                cwd: '/cwd/a',
                sessionId: 'sid-a',
                sessionFilePath: '/path/a.jsonl',
                tmuxSession: '',
            });
            expect(entries[0].startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        });

        it('deletes invisible rows while omitting them from list output', async () => {
            registry.register({
                name: 'memory-eval-explore',
                type: 'claude',
                pid: 999999,
                tmuxSession: 'memory-eval-explore',
                cwd: '/cwd/dead',
                startedAt: '2026-05-30T00:00:00.000Z',
                sessionId: 'sid-dead',
                sessionFilePath: '/path/dead.jsonl',
            });
            scopedManager.registerAdapter(new MockAdapter('claude', []));
            const agents = await scopedManager.listAgents();

            expect(agents).toEqual([]);
            expect(registry.lookup('memory-eval-explore')).toBeNull();
        });

        it('preserves an existing name (e.g. user-set "merry") across cycles', async () => {
            registry.register({
                name: 'merry',
                type: 'claude',
                pid: process.pid,
                tmuxSession: 'merry',
                cwd: '/cwd/merry',
                startedAt: '2026-05-30T00:00:00.000Z',
                sessionId: 'sid-merry',
                sessionFilePath: '/path/merry.jsonl',
            });

            scopedManager.registerAdapter(new MockAdapter('claude', [
                createMockAgent({ name: 'default-name', pid: process.pid, sessionId: 'sid-merry' }),
            ]));

            const agents = await scopedManager.listAgents();

            expect(agents[0].name).toBe('merry');
            expect(registry.list()[0].name).toBe('merry');
            expect(registry.list()[0].tmuxSession).toBe('merry');
            expect(registry.list()[0].startedAt).toBe('2026-05-30T00:00:00.000Z');
        });

        it('deletes a bound session when its pid is recycled without inheriting metadata', async () => {
            const baseName = `project-${process.pid}`;
            registry.register({
                name: baseName,
                type: 'codex',
                pid: process.pid,
                tmuxSession: baseName,
                cwd: '/cwd/project',
                startedAt: '2026-08-29T08:08:31.000Z',
                sessionId: 'old-session',
                sessionFilePath: '/path/old.jsonl',
                pinned: false,
            });
            registry.register({
                name: `${baseName}-2`,
                type: 'claude',
                pid: process.pid + 1,
                tmuxSession: '',
                cwd: '/cwd/other',
                startedAt: '2026-08-29T08:09:31.000Z',
                sessionId: 'other-session',
                sessionFilePath: '/path/other.jsonl',
                pinned: false,
            });
            scopedManager.registerAdapter(new MockAdapter('codex', [
                createMockAgent({
                    name: 'generated-new',
                    type: 'codex',
                    pid: process.pid,
                    projectPath: '/cwd/project',
                    sessionId: 'new-session',
                    sessionFilePath: '/path/new.jsonl',
                }),
            ]));

            const agents = await scopedManager.listAgents();

            expect(agents[0].name).toBe('generated-new');
            expect(registry.lookup(baseName)).toBeNull();
            expect(registry.lookup(`${baseName}-2`)).not.toBeNull();
            expect(registry.lookup('generated-new')).toMatchObject({
                pid: process.pid,
                sessionId: 'new-session',
                tmuxSession: '',
            });
        });

        it('never probes process liveness during refresh', async () => {
            registry.register({
                name: 'merry',
                type: 'claude',
                pid: process.pid,
                tmuxSession: 'merry-tmux',
                cwd: '/cwd/merry',
                startedAt: '2026-05-30T00:00:00.000Z',
                sessionId: 'sid-merry',
                sessionFilePath: '/path/merry.jsonl',
            });
            scopedManager.registerAdapter(new MockAdapter('claude', [
                createMockAgent({ name: `ai-devkit-${process.pid}`, pid: process.pid, sessionId: 'sid-merry' }),
            ]));
            const killSpy = vi.spyOn(process, 'kill');

            const firstRefresh = await scopedManager.listAgents();
            const secondRefresh = await scopedManager.listAgents();

            expect(firstRefresh[0].name).toBe('merry');
            expect(secondRefresh[0].name).toBe('merry');
            expect(registry.lookup('merry')).toMatchObject({
                name: 'merry',
                tmuxSession: 'merry-tmux',
            });
            expect(killSpy).not.toHaveBeenCalled();
        });

        it('leaves a failed adapter type untouched while reconciling successful types', async () => {
            registry.register({
                name: 'claude-held', type: 'claude', pid: 101, tmuxSession: 'claude-held',
                cwd: '/claude', startedAt: '2026-05-30T00:00:00.000Z', sessionId: 'claude-session',
                sessionFilePath: '', pinned: false,
            });
            registry.register({
                name: 'codex-held', type: 'codex', pid: 202, tmuxSession: 'codex-held',
                cwd: '/codex', startedAt: '2026-05-30T00:00:00.000Z', sessionId: 'codex-session',
                sessionFilePath: '', pinned: false,
            });
            scopedManager.registerAdapter(new MockAdapter('claude', [], true));
            scopedManager.registerAdapter(new MockAdapter('codex', []));

            await scopedManager.listAgents();

            expect(registry.lookup('claude-held')).not.toBeNull();
            expect(registry.lookup('codex-held')).toBeNull();
        });

        it('accepts metadata loss after a blind sandbox observation', async () => {
            const adapter = new MockAdapter('codex', []);
            registry.register({
                name: 'memory-eval-explore', type: 'codex', pid: 101,
                tmuxSession: 'memory-eval-explore', cwd: '/repo',
                startedAt: '2026-05-30T00:00:00.000Z', sessionId: 'pid-session',
                sessionFilePath: '/sessions/pid-session.jsonl', pinned: false,
            });
            registry.togglePin('codex', 101);
            scopedManager.registerAdapter(adapter);

            expect(await scopedManager.listAgents()).toEqual([]);
            expect(registry.lookup('memory-eval-explore')).toBeNull();

            adapter.setAgents([createMockAgent({
                name: 'ai-devkit-202', type: 'codex', pid: 202, sessionId: 'pid-session',
                sessionFilePath: '/sessions/pid-session.jsonl', projectPath: '/repo',
            })]);
            const restored = await scopedManager.listAgents();

            expect(restored).toHaveLength(1);
            expect(restored[0]).toMatchObject({ name: 'ai-devkit-202', pid: 202, pinned: false });
            expect(registry.lookup('ai-devkit-202')).toMatchObject({
                pid: 202, pinned: false, tmuxSession: '',
            });
        });

        it('adopts the detected identity into an unbound start row', async () => {
            registry.register({
                name: 'agent-list-debug',
                type: 'codex',
                pid: process.pid,
                tmuxSession: 'agent-list-debug',
                cwd: '/cwd/debug',
                startedAt: '2026-05-30T00:00:00.000Z',
                sessionId: 'pid-debug',
                sessionFilePath: '',
            });
            scopedManager.registerAdapter(new MockAdapter('codex', [
                createMockAgent({
                    name: `ai-devkit-${process.pid}`,
                    type: 'codex',
                    pid: process.pid,
                    sessionId: 'detected-session',
                }),
            ]));

            const agents = await scopedManager.listAgents();

            expect(agents[0].name).toBe('agent-list-debug');
            expect(registry.list()).toHaveLength(1);
            expect(registry.list()[0]).toMatchObject({
                name: 'agent-list-debug',
                pid: process.pid,
                tmuxSession: 'agent-list-debug',
                sessionId: 'detected-session',
            });
        });

        it('writes a fresh startedAt for new entries', async () => {
            const before = new Date().toISOString();
            scopedManager.registerAdapter(new MockAdapter('claude', [
                createMockAgent({ name: 'new', pid: process.pid }),
            ]));

            await scopedManager.listAgents();

            const entry = registry.list()[0];
            expect(entry.startedAt >= before).toBe(true);
        });

        it('batches the write — a single reconcile call per listAgents', async () => {
            const spy = vi.spyOn(registry, 'reconcile');

            scopedManager.registerAdapter(new MockAdapter('claude', [
                createMockAgent({ name: 'a', pid: process.pid }),
            ]));
            scopedManager.registerAdapter(new MockAdapter('codex', [
                createMockAgent({ name: 'b', type: 'codex', pid: process.pid + 1 }),
            ]));

            await scopedManager.listAgents();

            expect(spy).toHaveBeenCalledTimes(1);
            expect((spy.mock.calls[0][0] as RegistryEntry[]).map((e) => e.name).sort())
                .toEqual(['a', 'b']);
        });

        it('performs zero database writes on an unchanged refresh', async () => {
            const adapter = new MockAdapter('claude', [
                createMockAgent({
                    name: 'stable',
                    pid: process.pid,
                    projectPath: '/cwd/stable',
                    sessionId: 'stable-session',
                    sessionFilePath: '/sessions/stable.jsonl',
                }),
            ]);
            scopedManager.registerAdapter(adapter);
            await scopedManager.listAgents();
            databaseOperations = [];

            await scopedManager.listAgents();

            const writes = databaseOperations.filter((sql) => /^\s*(BEGIN|COMMIT|INSERT|UPDATE|DELETE)/i.test(sql));
            expect(writes).toEqual(['BEGIN IMMEDIATE', 'COMMIT']);
        });

        it('exposes a persisted pin and preserves it across a changed poll refresh', async () => {
            const adapter = new MockAdapter('claude', [
                createMockAgent({ name: 'pinned', pid: process.pid, sessionId: 'stable' }),
            ]);
            scopedManager.registerAdapter(adapter);
            await scopedManager.listAgents();
            registry.togglePin('claude', process.pid);
            adapter.setAgents([
                createMockAgent({ name: 'pinned', pid: process.pid, sessionId: 'stable' }),
            ]);

            const agents = await scopedManager.listAgents();

            expect(agents[0].pinned).toBe(true);
            expect(registry.lookup('pinned')).toMatchObject({ sessionId: 'stable', pinned: true });
        });

        it('uses registry updated_at as lastActive for pinned recency ordering', async () => {
            const adapter = new MockAdapter('claude', [
                createMockAgent({
                    name: 'recently-pinned',
                    pid: process.pid,
                    lastActive: new Date('2026-01-01T00:00:00.000Z'),
                }),
            ]);
            scopedManager.registerAdapter(adapter);
            await scopedManager.listAgents();
            nowMs += 60_000;
            scopedManager.togglePin('recently-pinned');

            const agents = await scopedManager.listAgents();

            expect(agents[0].pinned).toBe(true);
            expect(agents[0].lastActive.toISOString()).toBe('2026-08-14T10:01:00.000Z');
        });

        it('preserves adapter lastActive for unpinned agents', async () => {
            scopedManager.registerAdapter(new MockAdapter('claude', [
                createMockAgent({
                    name: 'unpinned',
                    pid: process.pid,
                    lastActive: new Date('2026-01-01T00:00:00.000Z'),
                }),
            ]));

            await scopedManager.listAgents();
            const agents = await scopedManager.listAgents();

            expect(agents[0].pinned).toBe(false);
            expect(agents[0].lastActive.toISOString()).toBe('2026-01-01T00:00:00.000Z');
        });

        it('persists changed fields once in one write transaction', async () => {
            const adapter = new MockAdapter('claude', [
                createMockAgent({ name: 'changing', pid: process.pid, projectPath: '/cwd/before' }),
            ]);
            scopedManager.registerAdapter(adapter);
            await scopedManager.listAgents();
            databaseOperations = [];
            nowMs += 1_000;
            adapter.setAgents([
                createMockAgent({ name: 'changing', pid: process.pid, projectPath: '/cwd/after' }),
            ]);

            await scopedManager.listAgents();

            const updates = databaseOperations.filter((sql) => /^\s*UPDATE agents SET/i.test(sql));
            const transactions = databaseOperations.filter((sql) => /^\s*(BEGIN|COMMIT)/i.test(sql));
            expect(updates).toHaveLength(1);
            expect(updates[0]).toContain("'2026-08-14T10:00:01.000Z'");
            expect(transactions).toHaveLength(2);
            expect(registry.lookup('changing')?.cwd).toBe('/cwd/after');
        });

        it('does not inherit a name when the same pid is reused by another agent type', async () => {
            registry.register({
                name: 'old-claude',
                type: 'claude',
                pid: process.pid,
                tmuxSession: 'old-claude',
                cwd: '/cwd/old',
                startedAt: '2026-05-30T00:00:00.000Z',
                sessionId: 'old-session',
                sessionFilePath: '',
            });
            scopedManager.registerAdapter(new MockAdapter('codex', [
                createMockAgent({
                    name: 'new-codex',
                    type: 'codex',
                    pid: process.pid,
                    projectPath: '/cwd/new',
                    sessionId: 'new-session',
                }),
            ]));

            const agents = await scopedManager.listAgents();

            expect(agents[0].name).toBe('new-codex');
            expect(registry.lookup('old-claude')).not.toBeNull();
            expect(registry.lookup('new-codex')).toMatchObject({ type: 'codex', pid: process.pid });
        });

        it('reconciles a successful empty result so all rows for that type are deleted', async () => {
            registry.register({
                name: 'held', type: 'claude', pid: 101, tmuxSession: '', cwd: '/tmp',
                startedAt: '2026-05-30T00:00:00.000Z', sessionId: 'held-session',
                sessionFilePath: '', pinned: false,
            });
            const writeSpy = vi.spyOn(registry, 'reconcile');

            scopedManager.registerAdapter(new MockAdapter('claude', []));
            await scopedManager.listAgents();
            await scopedManager.listAgents();

            expect(writeSpy).toHaveBeenCalledTimes(2);
            expect(registry.lookup('held')).toBeNull();
        });

        it('deletes all interactive rows after globally successful empty detection', async () => {
            registry.register({
                name: 'claude-held', type: 'claude', pid: 101, tmuxSession: '', cwd: '/tmp',
                startedAt: '2026-05-30T00:00:00.000Z', sessionId: 'claude-session',
                sessionFilePath: '', pinned: false,
            });
            registry.register({
                name: 'codex-held', type: 'codex', pid: 202, tmuxSession: '', cwd: '/tmp',
                startedAt: '2026-05-30T00:00:00.000Z', sessionId: 'codex-session',
                sessionFilePath: '', pinned: false,
            });
            scopedManager.registerAdapter(new MockAdapter('claude', []));
            scopedManager.registerAdapter(new MockAdapter('codex', []));

            expect(await scopedManager.listAgents()).toEqual([]);
            expect(registry.list()).toEqual([]);
        });
    });

    describe('togglePin', () => {
        it('resolves the agent name to its process identity and toggles the pin', () => {
            const registry = new AgentRegistry(path.join(tmpDir, 'toggle.json'));
            const scopedManager = new AgentManager(registry);
            registry.register({
                name: 'renamed-agent',
                type: 'claude',
                pid: process.pid,
                tmuxSession: '',
                cwd: '/tmp',
                startedAt: '2026-08-16T00:00:00.000Z',
                sessionId: 'session',
                sessionFilePath: '',
                pinned: false,
            });

            expect(scopedManager.togglePin('renamed-agent')).toBe(true);
            expect(registry.lookup('renamed-agent')?.pinned).toBe(true);
        });

        it('reports when the agent is no longer running', () => {
            expect(() => manager.togglePin('missing')).toThrow(/no longer running/i);
        });

        it('rejects a reconciled-away agent without probing liveness', () => {
            const registry = new AgentRegistry(path.join(tmpDir, 'dead-toggle.json'));
            const scopedManager = new AgentManager(registry);
            registry.register({
                name: 'dead',
                type: 'claude',
                pid: 999999,
                tmuxSession: '',
                cwd: '/tmp',
                startedAt: '2026-08-16T00:00:00.000Z',
                sessionId: 'session',
                sessionFilePath: '',
                pinned: false,
            });
            registry.reconcile([], ['claude']);
            const killSpy = vi.spyOn(process, 'kill');

            expect(() => scopedManager.togglePin('dead')).toThrow(/no longer running/i);
            expect(registry.lookup('dead')).toBeNull();
            expect(killSpy).not.toHaveBeenCalled();
        });

        it('surfaces a clear readonly mutation error', () => {
            const regPath = path.join(tmpDir, 'readonly-toggle.json');
            const writable = new AgentRegistry(regPath);
            writable.register({
                name: 'readonly-agent',
                type: 'claude',
                pid: process.pid,
                tmuxSession: '',
                cwd: '/tmp',
                startedAt: '2026-08-16T00:00:00.000Z',
                sessionId: 'session',
                sessionFilePath: '',
                pinned: false,
            });
            const readonlyManager = new AgentManager(new AgentRegistry(regPath, { readonly: true }));

            expect(() => readonlyManager.togglePin('readonly-agent')).toThrow(
                'Agent registry is readonly; cannot toggle pin.',
            );
        });
    });

    describe('clear', () => {
        it('should remove all adapters', () => {
            manager.registerAdapter(new MockAdapter('claude'));
            manager.registerAdapter(new MockAdapter('gemini_cli'));

            manager.clear();

            expect(manager.getAdapterCount()).toBe(0);
            expect(manager.getAdapters()).toEqual([]);
        });
    });

    describe('listSessions', () => {
        function createMockSession(overrides: Partial<SessionSummary> = {}): SessionSummary {
            return {
                type: 'claude',
                sessionId: 'session-1',
                cwd: '/repo',
                firstUserMessage: 'hello',
                lastActive: new Date('2025-01-01T00:00:00Z'),
                startedAt: new Date('2025-01-01T00:00:00Z'),
                sessionFilePath: '/tmp/session-1.jsonl',
                ...overrides,
            };
        }

        it('returns empty array when no adapters are registered', async () => {
            const result = await manager.listSessions();
            expect(result).toEqual([]);
        });

        it('merges sessions from every registered adapter', async () => {
            const claudeSession = createMockSession({ type: 'claude', sessionId: 'c1' });
            const codexSession = createMockSession({ type: 'codex', sessionId: 'cx1' });
            manager.registerAdapter(new MockAdapter('claude', [], false, [claudeSession]));
            manager.registerAdapter(new MockAdapter('codex', [], false, [codexSession]));

            const result = await manager.listSessions();

            expect(result).toHaveLength(2);
            expect(result.map((s) => s.sessionId).sort()).toEqual(['c1', 'cx1']);
        });

        it('sorts merged sessions by lastActive descending', async () => {
            const older = createMockSession({
                sessionId: 'older',
                lastActive: new Date('2025-01-01T00:00:00Z'),
            });
            const newer = createMockSession({
                type: 'codex',
                sessionId: 'newer',
                lastActive: new Date('2025-06-01T00:00:00Z'),
            });
            manager.registerAdapter(new MockAdapter('claude', [], false, [older]));
            manager.registerAdapter(new MockAdapter('codex', [], false, [newer]));

            const result = await manager.listSessions();

            expect(result.map((s) => s.sessionId)).toEqual(['newer', 'older']);
        });

        it('skips adapters whose type does not match opts.type', async () => {
            const claudeAdapter = new MockAdapter(
                'claude',
                [],
                false,
                [createMockSession({ type: 'claude', sessionId: 'c1' })],
            );
            const codexAdapter = new MockAdapter(
                'codex',
                [],
                false,
                [createMockSession({ type: 'codex', sessionId: 'cx1' })],
            );
            manager.registerAdapter(claudeAdapter);
            manager.registerAdapter(codexAdapter);

            const result = await manager.listSessions({ type: 'claude' });

            expect(result).toHaveLength(1);
            expect(result[0].sessionId).toBe('c1');
            // Codex adapter must not have been called
            expect(codexAdapter.lastListSessionsOpts).toBeUndefined();
            expect(claudeAdapter.lastListSessionsOpts).toEqual({ type: 'claude' });
        });

        it('tolerates an adapter that throws and still returns the others', async () => {
            const goodSession = createMockSession({ sessionId: 'good' });
            manager.registerAdapter(new MockAdapter('claude', [], false, [goodSession]));
            manager.registerAdapter(
                new MockAdapter('codex', [], false, [], true /* failListSessions */),
            );

            const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

            try {
                const result = await manager.listSessions();
                expect(result).toHaveLength(1);
                expect(result[0].sessionId).toBe('good');
                expect(consoleErrorSpy).toHaveBeenCalled();
            } finally {
                consoleErrorSpy.mockRestore();
            }
        });

        it('passes the same opts to every called adapter', async () => {
            const a = new MockAdapter('claude', [], false, []);
            const b = new MockAdapter('codex', [], false, []);
            manager.registerAdapter(a);
            manager.registerAdapter(b);

            await manager.listSessions({ cwd: '/Users/test/proj' });

            expect(a.lastListSessionsOpts).toEqual({ cwd: '/Users/test/proj' });
            expect(b.lastListSessionsOpts).toEqual({ cwd: '/Users/test/proj' });
        });
    });

    describe('resolveAgent', () => {
        it('should return null for empty input or empty agents list', () => {
            const agent = createMockAgent({ name: 'test-agent' });
            expect(manager.resolveAgent('', [agent])).toBeNull();
            expect(manager.resolveAgent('test', [])).toBeNull();
        });

        it('should resolve exact match (case-insensitive)', () => {
            const agent = createMockAgent({ name: 'My-Agent' });
            const agents = [agent, createMockAgent({ name: 'Other' })];

            // Exact match
            expect(manager.resolveAgent('My-Agent', agents)).toBe(agent);
            // Case-insensitive
            expect(manager.resolveAgent('my-agent', agents)).toBe(agent);
        });

        it('should resolve unique partial match', () => {
            const agent = createMockAgent({ name: 'ai-devkit' });
            const agents = [
                agent,
                createMockAgent({ name: 'other-project' })
            ];

            const result = manager.resolveAgent('dev', agents);
            expect(result).toBe(agent);
        });

        it('should return array for ambiguous partial match', () => {
            const agent1 = createMockAgent({ name: 'my-website' });
            const agent2 = createMockAgent({ name: 'my-app' });
            const agents = [agent1, agent2, createMockAgent({ name: 'other' })];

            const result = manager.resolveAgent('my', agents);

            expect(Array.isArray(result)).toBe(true);
            const matches = result as AgentInfo[];
            expect(matches).toHaveLength(2);
            expect(matches).toContain(agent1);
            expect(matches).toContain(agent2);
        });

        it('should return null for no match', () => {
            const agents = [createMockAgent({ name: 'ai-devkit' })];
            expect(manager.resolveAgent('xyz', agents)).toBeNull();
        });

        it('should prefer exact match over partial matches', () => {
            // Edge case: "test" matches "test" (exact) and "testing" (partial)
            // Should return exact "test"
            const exact = createMockAgent({ name: 'test' });
            const partial = createMockAgent({ name: 'testing' });
            const agents = [exact, partial];

            expect(manager.resolveAgent('test', agents)).toBe(exact);
        });
    });
});

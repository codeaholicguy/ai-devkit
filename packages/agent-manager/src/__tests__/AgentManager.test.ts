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
        it('should return empty array when no adapters registered', async () => {
            const agents = await manager.listAgents();
            expect(agents).toEqual([]);
        });

        it('should return agents from single adapter', async () => {
            const mockAgents = [
                createMockAgent({ name: 'agent1' }),
                createMockAgent({ name: 'agent2' }),
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
                createMockAgent({ name: 'idle-agent', status: AgentStatus.IDLE }),
                createMockAgent({ name: 'waiting-agent', status: AgentStatus.WAITING }),
                createMockAgent({ name: 'running-agent', status: AgentStatus.RUNNING }),
                createMockAgent({ name: 'unknown-agent', status: AgentStatus.UNKNOWN }),
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

        beforeEach(() => {
            tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-manager-'));
            regPath = path.join(tmpDir, 'agents.json');
            registry = new AgentRegistry(regPath);
            scopedManager = new AgentManager(registry);
        });

        afterEach(() => {
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

        it('prunes entries for dead pids', async () => {
            registry.register({
                name: 'dead',
                type: 'claude',
                pid: 999999,
                tmuxSession: '',
                cwd: '/cwd/dead',
                startedAt: '2026-05-30T00:00:00.000Z',
                sessionId: 'sid-dead',
                sessionFilePath: '/path/dead.jsonl',
            });

            scopedManager.registerAdapter(new MockAdapter('claude', [
                createMockAgent({ name: 'live', pid: process.pid }),
            ]));

            await scopedManager.listAgents();

            const entries = registry.list();
            expect(entries.map((e) => e.name)).toEqual(['live']);
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
                createMockAgent({ name: 'default-name', pid: process.pid }),
            ]));

            const agents = await scopedManager.listAgents();

            expect(agents[0].name).toBe('merry');
            expect(registry.list()[0].name).toBe('merry');
            expect(registry.list()[0].tmuxSession).toBe('merry');
            expect(registry.list()[0].startedAt).toBe('2026-05-30T00:00:00.000Z');
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

        it('batches the write — a single registerBatch call per listAgents', async () => {
            const spy = vi.spyOn(registry, 'registerBatch');

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

        it('skips registerBatch when no agents detected (still calls prune)', async () => {
            const writeSpy = vi.spyOn(registry, 'registerBatch');
            const pruneSpy = vi.spyOn(registry, 'prune');

            scopedManager.registerAdapter(new MockAdapter('claude', []));
            await scopedManager.listAgents();

            expect(writeSpy).not.toHaveBeenCalled();
            expect(pruneSpy).toHaveBeenCalledTimes(1);
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

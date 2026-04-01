/**
 * Tests for AgentManager
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { AgentManager } from '../AgentManager';
import type { AgentAdapter, AgentInfo, AgentType, ConversationMessage } from '../adapters/AgentAdapter';
import { AgentStatus } from '../adapters/AgentAdapter';

// Mock adapter for testing
class MockAdapter implements AgentAdapter {
    constructor(
        public readonly type: AgentType,
        private mockAgents: AgentInfo[] = [],
        private shouldFail: boolean = false
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

    setAgents(agents: AgentInfo[]): void {
        this.mockAgents = agents;
    }

    setFail(shouldFail: boolean): void {
        this.shouldFail = shouldFail;
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

    beforeEach(() => {
        manager = new AgentManager();
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

    describe('clear', () => {
        it('should remove all adapters', () => {
            manager.registerAdapter(new MockAdapter('claude'));
            manager.registerAdapter(new MockAdapter('gemini_cli'));

            manager.clear();

            expect(manager.getAdapterCount()).toBe(0);
            expect(manager.getAdapters()).toEqual([]);
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

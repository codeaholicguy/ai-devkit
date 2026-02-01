/**
 * Tests for AgentManager
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { AgentManager } from '../../lib/AgentManager';
import type { AgentAdapter, AgentInfo, AgentType } from '../../lib/adapters/AgentAdapter';
import { AgentStatus } from '../../lib/adapters/AgentAdapter';

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
        type: 'Claude Code',
        status: AgentStatus.RUNNING,
        statusDisplay: '🟢 run',
        summary: 'Test summary',
        pid: 12345,
        projectPath: '/test/path',
        sessionId: 'test-session-id',
        slug: 'test-slug',
        lastActive: new Date(),
        lastActiveDisplay: 'just now',
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
            const adapter = new MockAdapter('Claude Code');

            manager.registerAdapter(adapter);

            expect(manager.hasAdapter('Claude Code')).toBe(true);
            expect(manager.getAdapterCount()).toBe(1);
        });

        it('should throw error when registering duplicate adapter type', () => {
            const adapter1 = new MockAdapter('Claude Code');
            const adapter2 = new MockAdapter('Claude Code');

            manager.registerAdapter(adapter1);

            expect(() => manager.registerAdapter(adapter2)).toThrow(
                'Adapter for type "Claude Code" is already registered'
            );
        });

        it('should allow registering multiple different adapter types', () => {
            const adapter1 = new MockAdapter('Claude Code');
            const adapter2 = new MockAdapter('Gemini CLI');

            manager.registerAdapter(adapter1);
            manager.registerAdapter(adapter2);

            expect(manager.getAdapterCount()).toBe(2);
            expect(manager.hasAdapter('Claude Code')).toBe(true);
            expect(manager.hasAdapter('Gemini CLI')).toBe(true);
        });
    });

    describe('unregisterAdapter', () => {
        it('should unregister an existing adapter', () => {
            const adapter = new MockAdapter('Claude Code');
            manager.registerAdapter(adapter);

            const removed = manager.unregisterAdapter('Claude Code');

            expect(removed).toBe(true);
            expect(manager.hasAdapter('Claude Code')).toBe(false);
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
            const adapter1 = new MockAdapter('Claude Code');
            const adapter2 = new MockAdapter('Gemini CLI');

            manager.registerAdapter(adapter1);
            manager.registerAdapter(adapter2);

            const adapters = manager.getAdapters();
            expect(adapters).toHaveLength(2);
            expect(adapters).toContain(adapter1);
            expect(adapters).toContain(adapter2);
        });
    });

    describe('hasAdapter', () => {
        it('should return true for registered adapter', () => {
            manager.registerAdapter(new MockAdapter('Claude Code'));
            expect(manager.hasAdapter('Claude Code')).toBe(true);
        });

        it('should return false for non-registered adapter', () => {
            expect(manager.hasAdapter('Claude Code')).toBe(false);
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
            const adapter = new MockAdapter('Claude Code', mockAgents);

            manager.registerAdapter(adapter);
            const agents = await manager.listAgents();

            expect(agents).toHaveLength(2);
            expect(agents[0].name).toBe('agent1');
            expect(agents[1].name).toBe('agent2');
        });

        it('should aggregate agents from multiple adapters', async () => {
            const claudeAgents = [createMockAgent({ name: 'claude-agent', type: 'Claude Code' })];
            const geminiAgents = [createMockAgent({ name: 'gemini-agent', type: 'Gemini CLI' })];

            manager.registerAdapter(new MockAdapter('Claude Code', claudeAgents));
            manager.registerAdapter(new MockAdapter('Gemini CLI', geminiAgents));

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
            const adapter = new MockAdapter('Claude Code', mockAgents);

            manager.registerAdapter(adapter);
            const agents = await manager.listAgents();

            expect(agents[0].name).toBe('waiting-agent');
            expect(agents[1].name).toBe('running-agent');
            expect(agents[2].name).toBe('idle-agent');
            expect(agents[3].name).toBe('unknown-agent');
        });

        it('should handle adapter errors gracefully', async () => {
            const goodAdapter = new MockAdapter('Claude Code', [
                createMockAgent({ name: 'good-agent' }),
            ]);
            const badAdapter = new MockAdapter('Gemini CLI', [], true); // Will fail

            manager.registerAdapter(goodAdapter);
            manager.registerAdapter(badAdapter);

            // Should not throw, should return results from working adapter
            const agents = await manager.listAgents();

            expect(agents).toHaveLength(1);
            expect(agents[0].name).toBe('good-agent');
        });

        it('should return empty array when all adapters fail', async () => {
            const adapter1 = new MockAdapter('Claude Code', [], true);
            const adapter2 = new MockAdapter('Gemini CLI', [], true);

            manager.registerAdapter(adapter1);
            manager.registerAdapter(adapter2);

            const agents = await manager.listAgents();
            expect(agents).toEqual([]);
        });
    });

    describe('getAdapterCount', () => {
        it('should return 0 when no adapters registered', () => {
            expect(manager.getAdapterCount()).toBe(0);
        });

        it('should return correct count', () => {
            manager.registerAdapter(new MockAdapter('Claude Code'));
            expect(manager.getAdapterCount()).toBe(1);

            manager.registerAdapter(new MockAdapter('Gemini CLI'));
            expect(manager.getAdapterCount()).toBe(2);
        });
    });

    describe('clear', () => {
        it('should remove all adapters', () => {
            manager.registerAdapter(new MockAdapter('Claude Code'));
            manager.registerAdapter(new MockAdapter('Gemini CLI'));

            manager.clear();

            expect(manager.getAdapterCount()).toBe(0);
            expect(manager.getAdapters()).toEqual([]);
        });
    });
});

import { describe, it, expect } from 'vitest';
import { agentsEqual } from '../../../../tui/console/hooks/useAgentList.js';
import type { AgentInfo } from '@ai-devkit/agent-manager';
import { AgentStatus } from '@ai-devkit/agent-manager';

const agent = (overrides: Partial<AgentInfo> = {}): AgentInfo => ({
    name: 'test-agent',
    type: 'claude',
    status: AgentStatus.IDLE,
    projectPath: '/home/user/project',
    summary: 'working on auth',
    lastActive: new Date('2026-01-01T12:00:00Z'),
    sessionFilePath: '/home/user/.sessions/test.jsonl',
    ...overrides,
} as AgentInfo);

describe('agentsEqual', () => {
    it('returns true for two empty arrays', () => {
        expect(agentsEqual([], [])).toBe(true);
    });

    it('returns false when lengths differ', () => {
        expect(agentsEqual([agent()], [])).toBe(false);
    });

    it('returns true when all fields match', () => {
        expect(agentsEqual([agent()], [agent()])).toBe(true);
    });

    it('returns false when name differs', () => {
        expect(agentsEqual([agent({ name: 'a' })], [agent({ name: 'b' })])).toBe(false);
    });

    it('returns false when status differs', () => {
        expect(agentsEqual(
            [agent({ status: AgentStatus.RUNNING })],
            [agent({ status: AgentStatus.IDLE })],
        )).toBe(false);
    });

    it('returns false when type differs', () => {
        expect(agentsEqual([agent({ type: 'claude' })], [agent({ type: 'codex' })])).toBe(false);
    });

    it('returns false when summary differs', () => {
        expect(agentsEqual([agent({ summary: 'a' })], [agent({ summary: 'b' })])).toBe(false);
    });

    it('returns false when sessionFilePath differs', () => {
        expect(agentsEqual(
            [agent({ sessionFilePath: '/a.jsonl' })],
            [agent({ sessionFilePath: '/b.jsonl' })],
        )).toBe(false);
    });

    it('accepts string lastActive and compares correctly', () => {
        const a = agent({ lastActive: '2026-01-01T12:00:00Z' as unknown as Date });
        const b = agent({ lastActive: new Date('2026-01-01T12:00:00Z') });
        expect(agentsEqual([a], [b])).toBe(true);
    });

    it('returns false when lastActive timestamps differ', () => {
        expect(agentsEqual(
            [agent({ lastActive: new Date('2026-01-01T12:00:00Z') })],
            [agent({ lastActive: new Date('2026-01-01T12:00:01Z') })],
        )).toBe(false);
    });

    it('compares multiple agents in order', () => {
        const list = [agent({ name: 'a' }), agent({ name: 'b' })];
        expect(agentsEqual(list, [agent({ name: 'a' }), agent({ name: 'b' })])).toBe(true);
        expect(agentsEqual(list, [agent({ name: 'b' }), agent({ name: 'a' })])).toBe(false);
    });
});

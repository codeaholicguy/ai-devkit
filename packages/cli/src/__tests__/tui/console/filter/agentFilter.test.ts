import { describe, expect, it } from 'vitest';
import type { AgentInfo } from '@ai-devkit/agent-manager';
import {
    filterAgents,
    findMatchPositions,
    matchAgentByName,
} from '../../../../tui/console/filter/agentFilter.js';

const agent = (name: string): AgentInfo => ({ name } as AgentInfo);

describe('agent name substring filter', () => {
    it('matches a case-insensitive substring but not a subsequence', () => {
        expect(matchAgentByName('Feature-Agent', 'TURE-a')).toBe(true);
        expect(matchAgentByName('feature-agent', 'fgt')).toBe(false);
    });

    it('uses basic Unicode lower-case folding', () => {
        expect(matchAgentByName('Ärende', 'äRE')).toBe(true);
    });

    it('returns every non-overlapping match range', () => {
        expect(findMatchPositions('bananana', 'ana')).toEqual([1, 4, 5, 8]);
        expect(findMatchPositions('Agent', 'zzz')).toBeNull();
        expect(findMatchPositions('Agent', '')).toEqual([]);
    });

    it('preserves input order and does not rank matches', () => {
        const agents = [agent('z-beta'), agent('beta'), agent('alpha')];
        expect(filterAgents(agents, 'BETA')).toEqual([agents[0], agents[1]]);
    });

    it('returns the original array for an empty query', () => {
        const agents = [agent('one'), agent('two')];
        expect(filterAgents(agents, '')).toBe(agents);
    });
});

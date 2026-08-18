import type { AgentInfo } from '@ai-devkit/agent-manager';

export function matchAgentByName(name: string, query: string): boolean {
    return name.toLowerCase().includes(query.toLowerCase());
}

export function findMatchPositions(name: string, query: string): number[] | null {
    if (query === '') return [];

    const foldedName = name.toLowerCase();
    const foldedQuery = query.toLowerCase();
    const positions: number[] = [];
    let fromIndex = 0;

    while (fromIndex <= foldedName.length - foldedQuery.length) {
        const start = foldedName.indexOf(foldedQuery, fromIndex);
        if (start === -1) break;
        positions.push(start, start + foldedQuery.length);
        fromIndex = start + foldedQuery.length;
    }

    return positions.length > 0 ? positions : null;
}

export function filterAgents(agents: AgentInfo[], query: string): AgentInfo[] {
    if (query === '') return agents;
    return agents.filter(agent => matchAgentByName(agent.name, query));
}

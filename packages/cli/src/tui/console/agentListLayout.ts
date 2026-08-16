import type { AgentInfo } from '@ai-devkit/agent-manager';

export const MARKER_W = 2;

export function getAgentMarker(isSelected: boolean, isPinned: boolean): string {
    if (isSelected) return isPinned ? '▶*' : '▶ ';
    return isPinned ? ' *' : '  ';
}

export function partitionPinned(agents: AgentInfo[]): AgentInfo[] {
    const pinned = agents
        .filter((agent) => agent.pinned)
        .sort((left, right) => right.lastActive.getTime() - left.lastActive.getTime());
    const unpinned = agents.filter((agent) => !agent.pinned);
    return [...pinned, ...unpinned];
}

export function selectInitialAgentName(agents: AgentInfo[]): string | null {
    return partitionPinned(agents)[0]?.name ?? null;
}

export function isPinnedBoundary(agents: AgentInfo[], index: number): boolean {
    return index > 0 && Boolean(agents[index - 1]?.pinned) && !agents[index]?.pinned;
}

export function getAgentDivider(width: number, labeled: boolean): string {
    if (!labeled) return '─'.repeat(width);
    const label = ' OTHERS ';
    const remaining = Math.max(0, width - label.length);
    const left = Math.floor(remaining / 2);
    return `${'─'.repeat(left)}${label}${'─'.repeat(remaining - left)}`;
}

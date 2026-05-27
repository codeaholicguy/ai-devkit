import { AgentStatus, type AgentInfo } from '../adapters/AgentAdapter.js';

export type AgentSortKey = 'name' | 'status' | 'pid' | 'lastActive';

const STATUS_PRIORITY: Record<AgentStatus, number> = {
    [AgentStatus.WAITING]: 0,
    [AgentStatus.RUNNING]: 1,
    [AgentStatus.IDLE]: 2,
    [AgentStatus.UNKNOWN]: 3,
};

function compareByName(a: AgentInfo, b: AgentInfo): number {
    return a.name.localeCompare(b.name);
}

function compareByStatus(a: AgentInfo, b: AgentInfo): number {
    const pa = STATUS_PRIORITY[a.status] ?? 999;
    const pb = STATUS_PRIORITY[b.status] ?? 999;
    if (pa !== pb) return pa - pb;
    return compareByName(a, b);
}

function compareByPid(a: AgentInfo, b: AgentInfo): number {
    if (a.pid !== b.pid) return a.pid - b.pid;
    return compareByName(a, b);
}

function compareByLastActive(a: AgentInfo, b: AgentInfo): number {
    const ta = a.lastActive instanceof Date ? a.lastActive.getTime() : new Date(a.lastActive).getTime();
    const tb = b.lastActive instanceof Date ? b.lastActive.getTime() : new Date(b.lastActive).getTime();
    if (tb !== ta) return tb - ta; // most recent first
    return compareByName(a, b);
}

export function sortAgents(agents: AgentInfo[], by: AgentSortKey): AgentInfo[] {
    const copy = agents.slice();
    switch (by) {
        case 'name':
            copy.sort(compareByName);
            break;
        case 'status':
            copy.sort(compareByStatus);
            break;
        case 'pid':
            copy.sort(compareByPid);
            break;
        case 'lastActive':
            copy.sort(compareByLastActive);
            break;
    }
    return copy;
}

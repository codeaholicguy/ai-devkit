import type { AgentManager } from '@ai-devkit/agent-manager';

type PinManager = Pick<AgentManager, 'togglePin'>;

export async function toggleAgentPin(
    manager: PinManager,
    agentName: string,
    refresh: () => Promise<void>,
): Promise<boolean> {
    const pinned = manager.togglePin(agentName);
    await refresh();
    return pinned;
}

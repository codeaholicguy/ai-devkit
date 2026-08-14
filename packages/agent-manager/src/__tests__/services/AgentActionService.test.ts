import { describe, expect, it, vi } from 'vitest';
import { AgentStatus } from '../../adapters/AgentAdapter.js';
import { createAgentActionService } from '../../services/AgentActionService.js';

describe('AgentActionService', () => {
    it('owns terminal opening in the agent-manager package', async () => {
        const agent = {
            name: 'jarvis',
            pid: 42,
            status: AgentStatus.WAITING,
            projectPath: '/tmp/project',
            lastActive: new Date(),
            type: 'codex' as const,
        };
        const focusManager = {
            findTerminal: vi.fn().mockResolvedValue({ type: 'tmux', identifier: 'jarvis' }),
            focusTerminal: vi.fn().mockResolvedValue(true),
        };
        const service = createAgentActionService({
            manager: {
                listAgents: vi.fn().mockResolvedValue([agent]),
                resolveAgent: vi.fn().mockReturnValue(agent),
                getAdapter: vi.fn(),
            },
            createFocusManager: () => focusManager,
        });

        await expect(service.open({ agentName: 'jarvis' })).resolves.toMatchObject({ ok: true });
        expect(focusManager.findTerminal).toHaveBeenCalledWith(42);
        expect(focusManager.focusTerminal).toHaveBeenCalledOnce();
    });
});

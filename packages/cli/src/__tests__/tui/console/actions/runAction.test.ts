import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCreateAgentActionService, mockCreateChannelActionService } = vi.hoisted(() => ({
    mockCreateAgentActionService: vi.fn(() => ({})),
    mockCreateChannelActionService: vi.fn(() => ({})),
}));

vi.mock('@ai-devkit/agent-manager', async (importOriginal) => ({
    ...await importOriginal<typeof import('@ai-devkit/agent-manager')>(),
    createAgentActionService: mockCreateAgentActionService,
}));
vi.mock('@ai-devkit/channel-connector', async (importOriginal) => ({
    ...await importOriginal<typeof import('@ai-devkit/channel-connector')>(),
    createChannelActionService: mockCreateChannelActionService,
}));

import {
    runAction,
    type ConsoleActionServices,
} from '../../../../tui/console/actions/runAction.js';

function createServices(): ConsoleActionServices {
    return {
        open: vi.fn().mockResolvedValue({ ok: true }),
        send: vi.fn().mockResolvedValue({ ok: true }),
        start: vi.fn().mockResolvedValue({ ok: true }),
        kill: vi.fn().mockResolvedValue({ ok: true }),
        rename: vi.fn().mockResolvedValue({ ok: true }),
        startChannel: vi.fn().mockResolvedValue({ ok: true }),
        stopChannel: vi.fn().mockResolvedValue({ ok: true }),
    };
}

describe('runAction', () => {
    let services: ConsoleActionServices;

    beforeEach(() => {
        services = createServices();
        mockCreateAgentActionService.mockClear();
        mockCreateChannelActionService.mockClear();
    });

    it.each([
        {
            action: { type: 'open', agentName: 'jarvis' } as const,
            method: 'open' as const,
            input: { agentName: 'jarvis' },
        },
        {
            action: { type: 'send', agentName: 'jarvis', message: 'hello' } as const,
            method: 'send' as const,
            input: { agentName: 'jarvis', message: 'hello' },
        },
        {
            action: { type: 'start', agentType: 'codex', name: 'jarvis', cwd: '/tmp/project' } as const,
            method: 'start' as const,
            input: { agentType: 'codex', name: 'jarvis', cwd: '/tmp/project' },
        },
        {
            action: { type: 'kill', agentName: 'jarvis' } as const,
            method: 'kill' as const,
            input: { agentName: 'jarvis' },
        },
        {
            action: { type: 'rename', currentName: 'jarvis', newName: 'friday' } as const,
            method: 'rename' as const,
            input: { currentName: 'jarvis', newName: 'friday' },
        },
        {
            action: { type: 'channel-start', channelName: 'work', agentName: 'jarvis' } as const,
            method: 'startChannel' as const,
            input: { channelName: 'work', agentName: 'jarvis' },
        },
        {
            action: { type: 'channel-stop', channelName: 'work' } as const,
            method: 'stopChannel' as const,
            input: { channelName: 'work' },
        },
    ])('invokes $method directly in-process', async ({ action, method, input }) => {
        const result = await runAction(action, services);

        expect(services[method]).toHaveBeenCalledOnce();
        expect(services[method]).toHaveBeenCalledWith(input);
        expect(result).toEqual({ exitCode: 0 });
    });

    it('returns a service error without throwing', async () => {
        vi.mocked(services.send).mockResolvedValue({
            ok: false,
            message: 'Cannot find terminal for agent "jarvis".',
        });

        await expect(runAction({
            type: 'send',
            agentName: 'jarvis',
            message: 'hello',
        }, services)).resolves.toEqual({
            exitCode: 1,
            error: 'Cannot find terminal for agent "jarvis".',
        });
    });

    it('returns a thrown service error as a non-exit failure', async () => {
        vi.mocked(services.open).mockRejectedValue(new Error('terminal lookup failed'));

        await expect(runAction({ type: 'open', agentName: 'jarvis' }, services)).resolves.toEqual({
            exitCode: null,
            error: 'terminal lookup failed',
        });
    });

    it('keeps service output away from the Ink terminal', async () => {
        await runAction({ type: 'open', agentName: 'jarvis' });

        expect(mockCreateAgentActionService).toHaveBeenCalledWith({
            reporter: expect.objectContaining({
                text: expect.any(Function),
                info: expect.any(Function),
                success: expect.any(Function),
                warning: expect.any(Function),
                error: expect.any(Function),
                spinner: expect.any(Function),
            }),
        });
        expect(mockCreateChannelActionService).toHaveBeenCalledWith({
            reporter: expect.objectContaining({
                info: expect.any(Function),
                success: expect.any(Function),
                error: expect.any(Function),
            }),
        });
    });
});

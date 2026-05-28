import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

// Mock child_process before importing runAction
vi.mock('child_process', () => ({
    spawn: vi.fn(),
}));

import { spawn } from 'child_process';
import { runAction } from '../../../../tui/console/actions/runAction.js';

function makeChild(exitCode: number | null, stderr = '') {
    const child = new EventEmitter() as EventEmitter & {
        stderr: EventEmitter;
        once: (event: string, cb: (...args: unknown[]) => void) => typeof child;
    };
    child.stderr = new EventEmitter();

    // Emit stderr data then exit asynchronously
    setTimeout(() => {
        if (stderr) child.stderr.emit('data', Buffer.from(stderr));
        child.emit('exit', exitCode);
    }, 0);

    return child;
}

describe('runAction', () => {
    beforeEach(() => {
        vi.mocked(spawn).mockReset();
    });

    it('resolves with exitCode 0 on success', async () => {
        vi.mocked(spawn).mockReturnValue(makeChild(0) as ReturnType<typeof spawn>);
        const result = await runAction({ type: 'open', agentName: 'jarvis' });
        expect(result.exitCode).toBe(0);
        expect(result.error).toBeUndefined();
    });

    it('includes stderr in error when exit code is non-zero', async () => {
        vi.mocked(spawn).mockReturnValue(makeChild(1, 'agent not found') as ReturnType<typeof spawn>);
        const result = await runAction({ type: 'open', agentName: 'jarvis' });
        expect(result.exitCode).toBe(1);
        expect(result.error).toBe('agent not found');
    });

    it('does not set error when exit code is non-zero but stderr is empty', async () => {
        vi.mocked(spawn).mockReturnValue(makeChild(1, '') as ReturnType<typeof spawn>);
        const result = await runAction({ type: 'open', agentName: 'jarvis' });
        expect(result.exitCode).toBe(1);
        expect(result.error).toBeUndefined();
    });

    it('resolves with null exitCode and error message on spawn error', async () => {
        const child = new EventEmitter() as EventEmitter & { stderr: EventEmitter };
        child.stderr = new EventEmitter();
        setTimeout(() => child.emit('error', new Error('ENOENT')), 0);
        vi.mocked(spawn).mockReturnValue(child as ReturnType<typeof spawn>);

        const result = await runAction({ type: 'send', agentName: 'jarvis', message: 'hello' });
        expect(result.exitCode).toBeNull();
        expect(result.error).toBe('ENOENT');
    });

    it('passes correct argv for open action', async () => {
        vi.mocked(spawn).mockReturnValue(makeChild(0) as ReturnType<typeof spawn>);
        await runAction({ type: 'open', agentName: 'my-agent' });
        const [, argv] = vi.mocked(spawn).mock.calls[0];
        expect(argv).toEqual(expect.arrayContaining(['agent', 'open', 'my-agent']));
    });

    it('passes correct argv for send action', async () => {
        vi.mocked(spawn).mockReturnValue(makeChild(0) as ReturnType<typeof spawn>);
        await runAction({ type: 'send', agentName: 'my-agent', message: 'hello world' });
        const [, argv] = vi.mocked(spawn).mock.calls[0];
        expect(argv).toEqual(expect.arrayContaining(['agent', 'send', 'hello world', '--id', 'my-agent']));
    });

    it('spawns with stdio pipe to avoid seizing the TUI terminal', async () => {
        vi.mocked(spawn).mockReturnValue(makeChild(0) as ReturnType<typeof spawn>);
        await runAction({ type: 'open', agentName: 'x' });
        const [, , opts] = vi.mocked(spawn).mock.calls[0];
        expect(opts?.stdio).toEqual(['ignore', 'pipe', 'pipe']);
    });
});

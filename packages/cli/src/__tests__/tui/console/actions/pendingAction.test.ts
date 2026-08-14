import { describe, expect, it, vi } from 'vitest';
import {
    createConsoleActionExecutor,
    createPendingActionRunner,
    getPendingActionIdentity,
} from '../../../../tui/console/actions/pendingAction.js';

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}

describe('createPendingActionRunner', () => {
    it.each(['Sending', 'Opening', 'Stopping channel'])('publishes %s synchronously', (label) => {
        const events: string[] = [];
        const action = deferred<void>();
        const runner = createPendingActionRunner((pendingLabel) => events.push(pendingLabel));

        const execution = runner.run('action-key', label, () => action.promise);

        expect(execution.started).toBe(true);
        expect(events).toEqual([label]);
        expect(runner.isPending('action-key')).toBe(true);
        action.resolve();
        return execution.promise;
    });

    it('suppresses a duplicate while the first action is pending', async () => {
        const action = deferred<void>();
        const invoke = vi.fn(() => action.promise);
        const runner = createPendingActionRunner(() => undefined);

        const first = runner.run('send:jarvis', 'Sending', invoke);
        const duplicate = runner.run('send:jarvis', 'Sending', invoke);

        expect(first.started).toBe(true);
        expect(duplicate).toEqual({ started: false });
        expect(invoke).toHaveBeenCalledOnce();
        action.resolve();
        await first.promise;
    });

    it.each(['success', 'error'] as const)('allows retry after %s settlement', async (settlement) => {
        const firstAction = deferred<void>();
        const runner = createPendingActionRunner(() => undefined);
        const first = runner.run('open:jarvis', 'Opening', () => firstAction.promise);

        if (settlement === 'success') firstAction.resolve();
        else firstAction.reject(new Error('failed'));
        await first.promise?.catch(() => undefined);

        const retry = runner.run('open:jarvis', 'Opening', async () => undefined);
        expect(retry.started).toBe(true);
        await retry.promise;
    });
});

describe('getPendingActionIdentity', () => {
    it.each([
        [{ type: 'send', agentName: 'jarvis', message: 'hello' } as const, 'send:jarvis', 'Sending'],
        [{ type: 'open', agentName: 'jarvis' } as const, 'open:jarvis', 'Opening'],
        [{ type: 'channel-stop', channelName: 'work' } as const, 'channel-stop:work', 'Stopping channel'],
    ])('maps %s to an immediate UI pending state', (action, key, label) => {
        expect(getPendingActionIdentity(action)).toEqual({ key, label });
    });
});

describe('createConsoleActionExecutor', () => {
    it('notifies the UI before invoking the service and suppresses duplicate submissions', async () => {
        const events: string[] = [];
        const action = deferred<{ exitCode: number }>();
        const invoke = vi.fn(() => {
            events.push('service');
            return action.promise;
        });
        const execute = createConsoleActionExecutor(invoke, (label) => events.push(label));
        const request = { type: 'send', agentName: 'jarvis', message: 'hello' } as const;

        const first = execute(request);
        const duplicate = execute(request);

        expect(events).toEqual(['Sending', 'service']);
        expect(duplicate).toBeNull();
        expect(invoke).toHaveBeenCalledOnce();
        action.resolve({ exitCode: 0 });
        await first;
    });
});

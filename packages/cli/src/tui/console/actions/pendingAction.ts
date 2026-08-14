import type { ConsoleAction } from './types.js';
import type { ActionResult } from './runAction.js';

export interface PendingActionExecution<T> {
    started: boolean;
    promise?: Promise<T>;
}

export interface PendingActionRunner {
    isPending(key: string): boolean;
    run<T>(key: string, label: string, action: () => Promise<T>): PendingActionExecution<T>;
}

export function createPendingActionRunner(
    onPending: (label: string) => void,
): PendingActionRunner {
    const pending = new Set<string>();

    return {
        isPending: (key) => pending.has(key),
        run<T>(key: string, label: string, action: () => Promise<T>): PendingActionExecution<T> {
            if (pending.has(key)) return { started: false };
            pending.add(key);
            onPending(label);
            let actionPromise: Promise<T>;
            try {
                actionPromise = action();
            } catch (error) {
                pending.delete(key);
                throw error;
            }
            return {
                started: true,
                promise: actionPromise.finally(() => {
                    pending.delete(key);
                }),
            };
        },
    };
}

export interface PendingActionIdentity {
    key: string;
    label: string;
}

export function getPendingActionIdentity(action: ConsoleAction): PendingActionIdentity {
    switch (action.type) {
        case 'send':
            return { key: `send:${action.agentName}`, label: 'Sending' };
        case 'open':
            return { key: `open:${action.agentName}`, label: 'Opening' };
        case 'start':
            return { key: `start:${action.name}`, label: 'Starting' };
        case 'kill':
            return { key: `kill:${action.agentName}`, label: 'Killing' };
        case 'rename':
            return { key: `rename:${action.currentName}`, label: 'Renaming' };
        case 'channel-start':
            return { key: `channel-start:${action.channelName}`, label: 'Starting channel' };
        case 'channel-stop':
            return { key: `channel-stop:${action.channelName}`, label: 'Stopping channel' };
    }
}

export type RunConsoleAction = (action: ConsoleAction) => Promise<ActionResult> | null;

export function createConsoleActionExecutor(
    execute: (action: ConsoleAction) => Promise<ActionResult>,
    onPending: (label: string) => void,
): RunConsoleAction {
    const runner = createPendingActionRunner(onPending);
    return (action) => {
        const { key, label } = getPendingActionIdentity(action);
        const execution = runner.run(key, label, () => execute(action));
        return execution.started ? execution.promise! : null;
    };
}

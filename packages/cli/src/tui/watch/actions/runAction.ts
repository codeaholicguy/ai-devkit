import { spawn } from 'child_process';
import type { WatchAction } from './types.js';

export interface ActionResult {
    exitCode: number | null;
    error?: string;
}

function resolveCliEntry(): { command: string; baseArgs: string[] } {
    // Re-invoke the exact same process (works in both dev/ts-node and prod/compiled).
    // process.execArgv carries loader flags (e.g. --loader ts-node/esm).
    // process.argv[1] is the entry script (src/cli.ts in dev, dist/cli.js in prod).
    return { command: process.execPath, baseArgs: [...process.execArgv, process.argv[1]] };
}

export async function runAction(action: WatchAction): Promise<ActionResult> {
    const { command, baseArgs } = resolveCliEntry();
    const argv = (() => {
        switch (action.type) {
            case 'open':
                return [...baseArgs, 'agent', 'open', action.agentName];
            case 'send':
                return [...baseArgs, 'agent', 'send', action.message, '--id', action.agentName];
        }
    })();

    return new Promise<ActionResult>((resolve) => {
        const child = spawn(command, argv, { stdio: 'inherit' });
        child.once('error', (err) => {
            resolve({ exitCode: null, error: err.message });
        });
        child.once('exit', (code) => {
            resolve({ exitCode: code });
        });
    });
}

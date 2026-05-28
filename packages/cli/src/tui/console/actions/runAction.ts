import { spawn } from 'child_process';
import type { ConsoleAction } from './types.js';

export interface ActionResult {
    exitCode: number | null;
    error?: string;
}

function resolveCliEntry(): { command: string; baseArgs: string[] } {
    return { command: process.execPath, baseArgs: [...process.execArgv, process.argv[1]] };
}

export async function runAction(action: ConsoleAction): Promise<ActionResult> {
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
        // Use pipe so the subprocess never takes over the TUI's terminal.
        const child = spawn(command, argv, { stdio: ['ignore', 'pipe', 'pipe'] });
        const stderrChunks: Buffer[] = [];
        child.stderr?.on('data', (chunk: Buffer) => stderrChunks.push(chunk));
        child.once('error', (err) => resolve({ exitCode: null, error: err.message }));
        child.once('exit', (code) => {
            const stderr = Buffer.concat(stderrChunks).toString().trim();
            resolve({ exitCode: code, error: code !== 0 && stderr ? stderr : undefined });
        });
    });
}

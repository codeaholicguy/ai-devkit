import fs from 'fs';
import { execFileSync } from 'child_process';
import type { ProcessIdentity } from './DurableAgent.js';

export interface ProcessInspector {
    getIdentity(pid: number): ProcessIdentity | null;
}

export class LocalProcessInspector implements ProcessInspector {
    getIdentity(pid: number): ProcessIdentity | null {
        if (!Number.isInteger(pid) || pid <= 0) return null;
        try {
            if (process.platform === 'linux') {
                const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
                const close = stat.lastIndexOf(')');
                const fields = stat.slice(close + 2).split(' ');
                const startTicks = fields[19];
                return startTicks ? { pid, startedAt: `linux:${startTicks}` } : null;
            }
            const startedAt = execFileSync('ps', ['-o', 'lstart=', '-p', String(pid)], {
                encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
            }).trim();
            return startedAt ? { pid, startedAt } : null;
        } catch {
            return null;
        }
    }
}

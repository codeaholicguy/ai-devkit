import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { AgentStatus, type ProcessInfo } from '../../../adapters/AgentAdapter.js';
import { ClaudeSessionLocator } from '../../../providers/claude/ClaudeSessionLocator.js';

const tmpDirs: string[] = [];

function makeTmpDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-locator-test-'));
    tmpDirs.push(dir);
    return dir;
}

function makeProcess(overrides: Partial<ProcessInfo> = {}): ProcessInfo {
    return {
        pid: 123,
        command: 'claude',
        cwd: '/repo/my-app',
        tty: 'ttys001',
        startTime: new Date('2026-08-23T10:00:00.000Z'),
        ...overrides,
    };
}

describe('ClaudeSessionLocator', () => {
    afterEach(() => {
        for (const dir of tmpDirs.splice(0)) {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    it('matches resumed sessions directly and carries live PID status metadata', () => {
        const root = makeTmpDir();
        const projectsDir = path.join(root, 'projects');
        const sessionsDir = path.join(root, 'sessions');
        const cwd = '/repo/my-app';
        const sessionId = '12345678-1234-1234-1234-123456789abc';
        const projectDir = path.join(projectsDir, '-repo-my-app');
        const sessionFile = path.join(projectDir, `${sessionId}.jsonl`);
        fs.mkdirSync(projectDir, { recursive: true });
        fs.mkdirSync(sessionsDir, { recursive: true });
        fs.writeFileSync(sessionFile, '{}\n');
        fs.writeFileSync(path.join(sessionsDir, '123.json'), JSON.stringify({
            pid: 123,
            sessionId,
            cwd,
            startedAt: new Date('2026-08-23T10:00:00.000Z').getTime(),
            kind: 'interactive',
            entrypoint: 'cli',
            status: 'waiting',
            waitingFor: 'approve Read',
        }));

        const locator = new ClaudeSessionLocator({ projectsDir, sessionsDir });
        const matches = locator.matchRunningProcesses([
            makeProcess({ command: `claude --resume ${sessionId}`, cwd }),
        ]);

        expect(matches.direct).toHaveLength(1);
        expect(matches.legacyMatches).toEqual([]);
        expect(matches.direct[0]).toMatchObject({
            pidStatus: AgentStatus.WAITING,
            waitingFor: 'approve Read',
            sessionFile: {
                sessionId,
                filePath: sessionFile,
                projectDir,
                resolvedCwd: cwd,
            },
        });
    });
});

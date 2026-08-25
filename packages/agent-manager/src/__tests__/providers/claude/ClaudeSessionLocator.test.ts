import type { MockedFunction } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentStatus, type ProcessInfo } from '../../../adapters/AgentAdapter.js';
import { ClaudeSessionLocator } from '../../../providers/claude/ClaudeSessionLocator.js';
import { batchGetSessionFileBirthtimes } from '../../../utils/session.js';
import type { SessionFile } from '../../../utils/session.js';

vi.mock('../../../utils/session.js', async (importOriginal) => {
    const actual = await importOriginal() as typeof import('../../../utils/session.js');
    return {
        ...actual,
        batchGetSessionFileBirthtimes: vi.fn(),
    };
});

const mockedBatchGetSessionFileBirthtimes =
    batchGetSessionFileBirthtimes as MockedFunction<typeof batchGetSessionFileBirthtimes>;

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

type PidFileMatching = (processes: ProcessInfo[]) => {
    direct: Array<{ process: ProcessInfo; sessionFile: SessionFile }>;
    fallback: ProcessInfo[];
};

/** `tryPidFileMatching` is private; tests drive it directly like the sibling adapter suites do. */
function bindPidFileMatching(locator: ClaudeSessionLocator): PidFileMatching {
    return (locator as unknown as { tryPidFileMatching: PidFileMatching })
        .tryPidFileMatching.bind(locator) as PidFileMatching;
}

/** `getProjectDir` is private; bound here so the encoding tests read cleanly. */
function bindProjectDir(locator: ClaudeSessionLocator): (cwd: string) => string {
    return (locator as unknown as { getProjectDir: (cwd: string) => string })
        .getProjectDir.bind(locator);
}

describe('ClaudeSessionLocator', () => {
    beforeEach(() => {
        mockedBatchGetSessionFileBirthtimes.mockReset();
    });

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
    describe('discoverLiveSessions', () => {
        let tmpDir: string;
        let projectsDir: string;
        let locator: ClaudeSessionLocator;

        beforeEach(() => {
            tmpDir = makeTmpDir();
            projectsDir = path.join(tmpDir, 'projects');
            locator = new ClaudeSessionLocator({
                projectsDir,
                sessionsDir: path.join(tmpDir, 'sessions'),
            });
        });

        it('should return empty when projects dir does not exist', () => {
            const missing = new ClaudeSessionLocator({
                projectsDir: path.join(tmpDir, 'nonexistent'),
                sessionsDir: path.join(tmpDir, 'sessions'),
            });

            const result = missing.discoverLiveSessions([
                { pid: 1, command: 'claude', cwd: '/test', tty: '' },
            ]);
            expect(result).toEqual([]);
        });

        it('should scan only directories matching process CWDs', () => {
            // /my/project → -my-project (encoded dir)
            const encodedDir = path.join(projectsDir, '-my-project');
            fs.mkdirSync(encodedDir, { recursive: true });

            // Also create another dir that should NOT be scanned
            const otherDir = path.join(projectsDir, '-other-project');
            fs.mkdirSync(otherDir, { recursive: true });

            const mockFiles: SessionFile[] = [
                {
                    sessionId: 's1',
                    filePath: path.join(encodedDir, 's1.jsonl'),
                    projectDir: encodedDir,
                    birthtimeMs: 1710800324000,
                    resolvedCwd: '',
                },
            ];
            mockedBatchGetSessionFileBirthtimes.mockReturnValue(mockFiles);

            const processes = [
                { pid: 1, command: 'claude', cwd: '/my/project', tty: '' },
            ];

            const result = locator.discoverLiveSessions(processes);
            expect(result).toHaveLength(1);
            expect(result[0].resolvedCwd).toBe('/my/project');
            // batchGetSessionFileBirthtimes called once with all dirs
            expect(mockedBatchGetSessionFileBirthtimes).toHaveBeenCalledTimes(1);
            expect(mockedBatchGetSessionFileBirthtimes).toHaveBeenCalledWith([encodedDir]);
        });

        it('should return empty when encoded dir does not exist', () => {
            fs.mkdirSync(projectsDir, { recursive: true });

            // Process CWD /test encodes to -test, but that dir doesn't exist
            const result = locator.discoverLiveSessions([
                { pid: 1, command: 'claude', cwd: '/test', tty: '' },
            ]);
            expect(result).toEqual([]);
            expect(mockedBatchGetSessionFileBirthtimes).not.toHaveBeenCalled();
        });

        it('should deduplicate when multiple processes share same CWD', () => {
            const encodedDir = path.join(projectsDir, '-my-project');
            fs.mkdirSync(encodedDir, { recursive: true });

            mockedBatchGetSessionFileBirthtimes.mockReturnValue([
                { sessionId: 's1', filePath: path.join(encodedDir, 's1.jsonl'), projectDir: encodedDir, birthtimeMs: 1710800324000, resolvedCwd: '' },
            ]);

            const processes = [
                { pid: 1, command: 'claude', cwd: '/my/project', tty: '' },
                { pid: 2, command: 'claude', cwd: '/my/project', tty: '' },
            ];

            const result = locator.discoverLiveSessions(processes);
            // Should only call batch once with deduplicated dir
            expect(mockedBatchGetSessionFileBirthtimes).toHaveBeenCalledTimes(1);
            expect(mockedBatchGetSessionFileBirthtimes).toHaveBeenCalledWith([encodedDir]);
            expect(result).toHaveLength(1);
        });

        it('should skip processes with empty cwd', () => {
            fs.mkdirSync(projectsDir, { recursive: true });

            const result = locator.discoverLiveSessions([
                { pid: 1, command: 'claude', cwd: '', tty: '' },
            ]);
            expect(result).toEqual([]);
        });
    });

    describe('tryPidFileMatching', () => {
        let tmpDir: string;
        let sessionsDir: string;
        let projectsDir: string;
        let tryMatch: (processes: ProcessInfo[]) => {
            direct: Array<{ process: ProcessInfo; sessionFile: SessionFile }>;
            fallback: ProcessInfo[];
        };

        beforeEach(() => {
            tmpDir = makeTmpDir();
            sessionsDir = path.join(tmpDir, 'sessions');
            projectsDir = path.join(tmpDir, 'projects');
            fs.mkdirSync(sessionsDir, { recursive: true });
            tryMatch = bindPidFileMatching(new ClaudeSessionLocator({ projectsDir, sessionsDir }));
        });

        const makeProc = (pid: number, cwd = '/project/test', startTime?: Date): ProcessInfo => ({
            pid, command: 'claude', cwd, tty: 'ttys001', startTime,
        });

        const writePidFile = (pid: number, sessionId: string, cwd: string, startedAt: number) => {
            fs.writeFileSync(
                path.join(sessionsDir, `${pid}.json`),
                JSON.stringify({ pid, sessionId, cwd, startedAt, kind: 'interactive', entrypoint: 'cli' }),
            );
        };

        const writeJsonl = (cwd: string, sessionId: string) => {
            const encoded = cwd.replace(/[^a-zA-Z0-9]/g, '-');
            const projDir = path.join(projectsDir, encoded);
            fs.mkdirSync(projDir, { recursive: true });
            const filePath = path.join(projDir, `${sessionId}.jsonl`);
            fs.writeFileSync(filePath, JSON.stringify({ type: 'assistant', timestamp: new Date().toISOString() }));
            return filePath;
        };

        it('should return direct match when PID file and JSONL both exist within time tolerance', () => {
            const startTime = new Date();
            const proc = makeProc(1001, '/project/test', startTime);
            writePidFile(1001, 'session-abc', '/project/test', startTime.getTime());
            writeJsonl('/project/test', 'session-abc');

            const { direct, fallback } = tryMatch([proc]);

            expect(direct).toHaveLength(1);
            expect(fallback).toHaveLength(0);
            expect(direct[0].sessionFile.sessionId).toBe('session-abc');
            expect(direct[0].sessionFile.resolvedCwd).toBe('/project/test');
            expect(direct[0].process.pid).toBe(1001);
        });

        it('should fall back when PID file exists but JSONL is missing', () => {
            const startTime = new Date();
            const proc = makeProc(1002, '/project/test', startTime);
            writePidFile(1002, 'nonexistent-session', '/project/test', startTime.getTime());
            // No JSONL file written

            const { direct, fallback } = tryMatch([proc]);

            expect(direct).toHaveLength(0);
            expect(fallback).toHaveLength(1);
            expect(fallback[0].pid).toBe(1002);
        });

        it('should fall back when startedAt is stale (>60s from proc.startTime)', () => {
            const startTime = new Date();
            const staleTime = startTime.getTime() - 90_000; // 90 seconds earlier
            const proc = makeProc(1003, '/project/test', startTime);
            writePidFile(1003, 'stale-session', '/project/test', staleTime);
            writeJsonl('/project/test', 'stale-session');

            const { direct, fallback } = tryMatch([proc]);

            expect(direct).toHaveLength(0);
            expect(fallback).toHaveLength(1);
        });

        it('should accept PID file when startedAt is within 60s tolerance', () => {
            const startTime = new Date();
            const closeTime = startTime.getTime() - 30_000; // 30 seconds earlier — within tolerance
            const proc = makeProc(1004, '/project/test', startTime);
            writePidFile(1004, 'close-session', '/project/test', closeTime);
            writeJsonl('/project/test', 'close-session');

            const { direct, fallback } = tryMatch([proc]);

            expect(direct).toHaveLength(1);
            expect(fallback).toHaveLength(0);
        });

        it('should fall back when PID file is absent', () => {
            const proc = makeProc(1005, '/project/test', new Date());
            // No PID file written

            const { direct, fallback } = tryMatch([proc]);

            expect(direct).toHaveLength(0);
            expect(fallback).toHaveLength(1);
        });

        it('should fall back when PID file contains malformed JSON', () => {
            const proc = makeProc(1006, '/project/test', new Date());
            fs.writeFileSync(path.join(sessionsDir, '1006.json'), 'not valid json {{{');

            expect(() => {
                const { direct, fallback } = tryMatch([proc]);
                expect(direct).toHaveLength(0);
                expect(fallback).toHaveLength(1);
            }).not.toThrow();
        });

        it('should fall back for all processes when sessions dir does not exist', () => {
            const missingSessions = bindPidFileMatching(new ClaudeSessionLocator({
                projectsDir,
                sessionsDir: path.join(tmpDir, 'nonexistent-sessions'),
            }));
            const processes = [makeProc(2001, '/a', new Date()), makeProc(2002, '/b', new Date())];

            const { direct, fallback } = missingSessions(processes);

            expect(direct).toHaveLength(0);
            expect(fallback).toHaveLength(2);
        });

        it('should correctly split mixed processes (some with PID files, some without)', () => {
            const startTime = new Date();
            const proc1 = makeProc(3001, '/project/one', startTime);
            const proc2 = makeProc(3002, '/project/two', startTime);
            const proc3 = makeProc(3003, '/project/three', startTime);

            writePidFile(3001, 'session-one', '/project/one', startTime.getTime());
            writeJsonl('/project/one', 'session-one');
            writePidFile(3003, 'session-three', '/project/three', startTime.getTime());
            writeJsonl('/project/three', 'session-three');
            // proc2 has no PID file

            const { direct, fallback } = tryMatch([proc1, proc2, proc3]);

            expect(direct).toHaveLength(2);
            expect(fallback).toHaveLength(1);
            expect(direct.map((d) => d.process.pid).sort()).toEqual([3001, 3003]);
            expect(fallback[0].pid).toBe(3002);
        });

        it('should skip stale-file check when proc.startTime is undefined', () => {
            const proc = makeProc(4001, '/project/test', undefined); // no startTime
            writePidFile(4001, 'no-time-session', '/project/test', Date.now() - 999_999);
            writeJsonl('/project/test', 'no-time-session');

            const { direct, fallback } = tryMatch([proc]);

            // startTime undefined → stale check skipped → direct match
            expect(direct).toHaveLength(1);
            expect(fallback).toHaveLength(0);
        });
    });

    describe('getProjectDir', () => {
        let tmpDir: string;
        let projectsDir: string;
        let encode: (cwd: string) => string;

        beforeEach(() => {
            tmpDir = makeTmpDir();
            projectsDir = path.join(tmpDir, 'projects');
            encode = bindProjectDir(new ClaudeSessionLocator({
                projectsDir,
                sessionsDir: path.join(tmpDir, 'sessions'),
            }));
        });

        it('should replace path separators with hyphens', () => {
            expect(encode('/Users/foo/bar')).toBe(path.join(projectsDir, '-Users-foo-bar'));
        });

        it('should encode underscores as hyphens (matches Claude Code CLI)', () => {
            expect(encode('/Users/foo/my_project')).toBe(path.join(projectsDir, '-Users-foo-my-project'));
        });

        it('should encode dots as hyphens', () => {
            expect(encode('/Users/foo/.worktrees/x')).toBe(path.join(projectsDir, '-Users-foo--worktrees-x'));
        });

        it('should collide paths that differ only in non-alphanumeric chars', () => {
            // The encoding is intentionally lossy — callers must
            // disambiguate via session JSONL contents, not dir name.
            expect(encode('/a/b_c')).toBe(encode('/a/b-c'));
            expect(encode('/a/b_c')).toBe(encode('/a/b.c'));
        });

        it('should resolve to a real session dir when cwd contains underscores', () => {
            const cwd = '/Users/foo/my_project';
            const expectedDir = path.join(projectsDir, '-Users-foo-my-project');
            fs.mkdirSync(expectedDir, { recursive: true });
            const sessionFile = path.join(expectedDir, 'session-underscore.jsonl');
            fs.writeFileSync(sessionFile, '');

            expect(encode(cwd)).toBe(expectedDir);
            expect(fs.existsSync(path.join(encode(cwd), 'session-underscore.jsonl'))).toBe(true);
        });
    });
});

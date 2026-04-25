/**
 * Tests for ClaudeCodeAdapter
 */

import * as fs from 'fs';
import * as path from 'path';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { ClaudeCodeAdapter } from '../../adapters/ClaudeCodeAdapter';
import type { ProcessInfo } from '../../adapters/AgentAdapter';
import { AgentStatus } from '../../adapters/AgentAdapter';
import { listAgentProcesses, enrichProcesses } from '../../utils/process';
import { batchGetSessionFileBirthtimes } from '../../utils/session';
import type { SessionFile } from '../../utils/session';
import { matchProcessesToSessions, generateAgentName } from '../../utils/matching';
import type { MatchResult } from '../../utils/matching';
jest.mock('../../utils/process', () => ({
    listAgentProcesses: jest.fn(),
    enrichProcesses: jest.fn(),
}));

jest.mock('../../utils/session', () => ({
    batchGetSessionFileBirthtimes: jest.fn(),
}));

jest.mock('../../utils/matching', () => ({
    matchProcessesToSessions: jest.fn(),
    generateAgentName: jest.fn(),
}));

const mockedListAgentProcesses = listAgentProcesses as jest.MockedFunction<typeof listAgentProcesses>;
const mockedEnrichProcesses = enrichProcesses as jest.MockedFunction<typeof enrichProcesses>;
const mockedBatchGetSessionFileBirthtimes = batchGetSessionFileBirthtimes as jest.MockedFunction<typeof batchGetSessionFileBirthtimes>;
const mockedMatchProcessesToSessions = matchProcessesToSessions as jest.MockedFunction<typeof matchProcessesToSessions>;
const mockedGenerateAgentName = generateAgentName as jest.MockedFunction<typeof generateAgentName>;
describe('ClaudeCodeAdapter', () => {
    let adapter: ClaudeCodeAdapter;

    beforeEach(() => {
        adapter = new ClaudeCodeAdapter();
        mockedListAgentProcesses.mockReset();
        mockedEnrichProcesses.mockReset();
        mockedBatchGetSessionFileBirthtimes.mockReset();
        mockedMatchProcessesToSessions.mockReset();
        mockedGenerateAgentName.mockReset();
        // Default: enrichProcesses returns what it receives
        mockedEnrichProcesses.mockImplementation((procs) => procs);
        // Default: generateAgentName returns "folder (pid)"
        mockedGenerateAgentName.mockImplementation((cwd, pid) => {
            const folder = path.basename(cwd) || 'unknown';
            return `${folder} (${pid})`;
        });
    });

    describe('initialization', () => {
        it('should create adapter with correct type', () => {
            expect(adapter.type).toBe('claude');
        });
    });

    describe('canHandle', () => {
        it('should return true for claude processes', () => {
            const processInfo = {
                pid: 12345,
                command: 'claude',
                cwd: '/test',
                tty: 'ttys001',
            };

            expect(adapter.canHandle(processInfo)).toBe(true);
        });

        it('should return true for claude executable with full path', () => {
            const processInfo = {
                pid: 12345,
                command: '/usr/local/bin/claude --some-flag',
                cwd: '/test',
                tty: 'ttys001',
            };

            expect(adapter.canHandle(processInfo)).toBe(true);
        });

        it('should return true for CLAUDE (case-insensitive)', () => {
            const processInfo = {
                pid: 12345,
                command: '/usr/local/bin/CLAUDE --continue',
                cwd: '/test',
                tty: 'ttys001',
            };

            expect(adapter.canHandle(processInfo)).toBe(true);
        });

        it('should return false for non-claude processes', () => {
            const processInfo = {
                pid: 12345,
                command: 'node',
                cwd: '/test',
                tty: 'ttys001',
            };

            expect(adapter.canHandle(processInfo)).toBe(false);
        });

        it('should return false for processes with "claude" only in path arguments', () => {
            const processInfo = {
                pid: 12345,
                command: '/usr/local/bin/node /path/to/claude-worktree/node_modules/nx/start.js',
                cwd: '/test',
                tty: 'ttys001',
            };

            expect(adapter.canHandle(processInfo)).toBe(false);
        });
    });

    describe('detectAgents', () => {
        it('should return empty array if no claude processes running', async () => {
            mockedListAgentProcesses.mockReturnValue([]);

            const agents = await adapter.detectAgents();
            expect(agents).toEqual([]);
            expect(mockedListAgentProcesses).toHaveBeenCalledWith('claude');
        });

        it('should return process-only agents when no sessions discovered', async () => {
            const processes: ProcessInfo[] = [
                { pid: 777, command: 'claude', cwd: '/project/app', tty: 'ttys001' },
            ];
            mockedListAgentProcesses.mockReturnValue(processes);
            mockedEnrichProcesses.mockReturnValue(processes);

            // No projects dir → discoverSessions returns []
            (adapter as any).projectsDir = '/nonexistent/path';

            const agents = await adapter.detectAgents();
            expect(agents).toHaveLength(1);
            expect(agents[0]).toMatchObject({
                type: 'claude',
                status: AgentStatus.IDLE,
                pid: 777,
                projectPath: '/project/app',
                sessionId: 'pid-777',
                summary: 'Unknown',
            });
        });

        it('should detect agents with matched sessions', async () => {
            const processes: ProcessInfo[] = [
                {
                    pid: 12345,
                    command: 'claude',
                    cwd: '/Users/test/my-project',
                    tty: 'ttys001',
                    startTime: new Date('2026-03-18T23:18:01.000Z'),
                },
            ];
            mockedListAgentProcesses.mockReturnValue(processes);
            mockedEnrichProcesses.mockReturnValue(processes);

            // Set up projects dir with encoded directory name
            const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'claude-test-'));
            const projectsDir = path.join(tmpDir, 'projects');
            // Claude encodes /Users/test/my-project → -Users-test-my-project
            const projDir = path.join(projectsDir, '-Users-test-my-project');
            fs.mkdirSync(projDir, { recursive: true });

            // Create session file
            const sessionFile = path.join(projDir, 'session-1.jsonl');
            fs.writeFileSync(sessionFile, [
                JSON.stringify({ type: 'user', timestamp: '2026-03-18T23:18:44Z', cwd: '/Users/test/my-project', message: { content: 'Investigate failing tests' } }),
                JSON.stringify({ type: 'assistant', timestamp: '2026-03-18T23:19:00Z' }),
            ].join('\n'));

            (adapter as any).projectsDir = projectsDir;

            const sessionFiles: SessionFile[] = [
                {
                    sessionId: 'session-1',
                    filePath: sessionFile,
                    projectDir: projDir,
                    birthtimeMs: new Date('2026-03-18T23:18:44Z').getTime(),
                    resolvedCwd: '',
                },
            ];
            mockedBatchGetSessionFileBirthtimes.mockReturnValue(sessionFiles);

            const matches: MatchResult[] = [
                {
                    process: processes[0],
                    session: { ...sessionFiles[0], resolvedCwd: '/Users/test/my-project' },
                    deltaMs: 43000,
                },
            ];
            mockedMatchProcessesToSessions.mockReturnValue(matches);

            const agents = await adapter.detectAgents();

            expect(agents).toHaveLength(1);
            expect(agents[0]).toMatchObject({
                type: 'claude',
                status: AgentStatus.WAITING,
                pid: 12345,
                projectPath: '/Users/test/my-project',
                sessionId: 'session-1',
            });
            expect(agents[0].summary).toContain('Investigate failing tests');

            fs.rmSync(tmpDir, { recursive: true, force: true });
        });

        it('should fall back to process-only for unmatched processes', async () => {
            const processes: ProcessInfo[] = [
                { pid: 100, command: 'claude', cwd: '/project-a', tty: 'ttys001', startTime: new Date() },
                { pid: 200, command: 'claude', cwd: '/project-b', tty: 'ttys002', startTime: new Date() },
            ];
            mockedListAgentProcesses.mockReturnValue(processes);
            mockedEnrichProcesses.mockReturnValue(processes);

            // Set up projects dir with encoded directory names
            const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'claude-test-'));
            const projectsDir = path.join(tmpDir, 'projects');
            // /project-a → -project-a, /project-b → -project-b
            const projDirA = path.join(projectsDir, '-project-a');
            const projDirB = path.join(projectsDir, '-project-b');
            fs.mkdirSync(projDirA, { recursive: true });
            fs.mkdirSync(projDirB, { recursive: true });

            const sessionFile = path.join(projDirA, 'only-session.jsonl');
            fs.writeFileSync(sessionFile,
                JSON.stringify({ type: 'assistant', timestamp: '2026-03-18T23:19:00Z' }),
            );

            (adapter as any).projectsDir = projectsDir;

            const sessionFiles: SessionFile[] = [
                {
                    sessionId: 'only-session',
                    filePath: sessionFile,
                    projectDir: projDirA,
                    birthtimeMs: Date.now(),
                    resolvedCwd: '',
                },
            ];
            mockedBatchGetSessionFileBirthtimes.mockReturnValue(sessionFiles);

            // Only process 100 matches
            const matches: MatchResult[] = [
                {
                    process: processes[0],
                    session: { ...sessionFiles[0], resolvedCwd: '/project-a' },
                    deltaMs: 5000,
                },
            ];
            mockedMatchProcessesToSessions.mockReturnValue(matches);

            const agents = await adapter.detectAgents();
            expect(agents).toHaveLength(2);

            const matched = agents.find(a => a.pid === 100);
            const unmatched = agents.find(a => a.pid === 200);
            expect(matched?.sessionId).toBe('only-session');
            expect(unmatched?.sessionId).toBe('pid-200');
            expect(unmatched?.status).toBe(AgentStatus.IDLE);

            fs.rmSync(tmpDir, { recursive: true, force: true });
        });

        it('should handle process with empty cwd in process-only fallback', async () => {
            const processes: ProcessInfo[] = [
                { pid: 300, command: 'claude', cwd: '', tty: 'ttys003' },
            ];
            mockedListAgentProcesses.mockReturnValue(processes);
            mockedEnrichProcesses.mockReturnValue(processes);

            (adapter as any).projectsDir = '/nonexistent';

            const agents = await adapter.detectAgents();
            expect(agents).toHaveLength(1);
            expect(agents[0]).toMatchObject({
                pid: 300,
                sessionId: 'pid-300',
                summary: 'Unknown',
                projectPath: '',
            });
        });

        it('should use PID file for direct match and skip legacy matching for that process', async () => {
            const startTime = new Date();
            const processes: ProcessInfo[] = [
                { pid: 55001, command: 'claude', cwd: '/project/direct', tty: 'ttys001', startTime },
            ];
            mockedListAgentProcesses.mockReturnValue(processes);
            mockedEnrichProcesses.mockReturnValue(processes);

            const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'claude-pid-test-'));
            const sessionsDir = path.join(tmpDir, 'sessions');
            const projectsDir = path.join(tmpDir, 'projects');
            const projDir = path.join(projectsDir, '-project-direct');
            fs.mkdirSync(sessionsDir, { recursive: true });
            fs.mkdirSync(projDir, { recursive: true });

            const sessionId = 'pid-file-session';
            const jsonlPath = path.join(projDir, `${sessionId}.jsonl`);
            fs.writeFileSync(jsonlPath, [
                JSON.stringify({ type: 'user', timestamp: new Date().toISOString(), cwd: '/project/direct', message: { content: 'hello from pid file' } }),
                JSON.stringify({ type: 'assistant', timestamp: new Date().toISOString() }),
            ].join('\n'));

            fs.writeFileSync(
                path.join(sessionsDir, '55001.json'),
                JSON.stringify({ pid: 55001, sessionId, cwd: '/project/direct', startedAt: startTime.getTime(), kind: 'interactive', entrypoint: 'cli' }),
            );

            (adapter as any).sessionsDir = sessionsDir;
            (adapter as any).projectsDir = projectsDir;

            const agents = await adapter.detectAgents();

            // Legacy matching utilities should NOT have been called (all processes matched via PID file)
            expect(mockedBatchGetSessionFileBirthtimes).not.toHaveBeenCalled();
            expect(mockedMatchProcessesToSessions).not.toHaveBeenCalled();

            expect(agents).toHaveLength(1);
            expect(agents[0]).toMatchObject({
                type: 'claude',
                pid: 55001,
                sessionId,
                projectPath: '/project/direct',
                status: AgentStatus.WAITING,
            });
            expect(agents[0].summary).toContain('hello from pid file');

            fs.rmSync(tmpDir, { recursive: true, force: true });
        });

        it('should fall back to process-only when direct-matched JSONL becomes unreadable', async () => {
            const startTime = new Date();
            const processes: ProcessInfo[] = [
                { pid: 66001, command: 'claude', cwd: '/project/gone', tty: 'ttys001', startTime },
            ];
            mockedListAgentProcesses.mockReturnValue(processes);
            mockedEnrichProcesses.mockReturnValue(processes);

            const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'claude-gone-'));
            const sessionsDir = path.join(tmpDir, 'sessions');
            const projectsDir = path.join(tmpDir, 'projects');
            const projDir = path.join(projectsDir, '-project-gone');
            fs.mkdirSync(sessionsDir, { recursive: true });
            fs.mkdirSync(projDir, { recursive: true });

            const sessionId = 'gone-session';
            const jsonlPath = path.join(projDir, `${sessionId}.jsonl`);
            fs.writeFileSync(jsonlPath, JSON.stringify({ type: 'assistant', timestamp: new Date().toISOString() }));
            fs.writeFileSync(
                path.join(sessionsDir, '66001.json'),
                JSON.stringify({ pid: 66001, sessionId, cwd: '/project/gone', startedAt: startTime.getTime(), kind: 'interactive', entrypoint: 'cli' }),
            );

            (adapter as any).sessionsDir = sessionsDir;
            (adapter as any).projectsDir = projectsDir;

            // Simulate JSONL disappearing between existence check and read
            jest.spyOn((adapter as any).parser, 'readSession').mockReturnValueOnce(null);

            const agents = await adapter.detectAgents();

            // matchedPids.delete called → process falls back to IDLE
            expect(agents).toHaveLength(1);
            expect(agents[0].sessionId).toBe('pid-66001');
            expect(agents[0].status).toBe(AgentStatus.IDLE);

            fs.rmSync(tmpDir, { recursive: true, force: true });
            jest.restoreAllMocks();
        });

        it('should fall back to process-only when legacy-matched JSONL becomes unreadable', async () => {
            const startTime = new Date();
            const processes: ProcessInfo[] = [
                { pid: 66002, command: 'claude', cwd: '/project/legacy-gone', tty: 'ttys001', startTime },
            ];
            mockedListAgentProcesses.mockReturnValue(processes);
            mockedEnrichProcesses.mockReturnValue(processes);

            const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'claude-lgone-'));
            const projectsDir = path.join(tmpDir, 'projects');
            const projDir = path.join(projectsDir, '-project-legacy-gone');
            fs.mkdirSync(projDir, { recursive: true });

            const sessionId = 'legacy-gone-session';
            const jsonlPath = path.join(projDir, `${sessionId}.jsonl`);
            fs.writeFileSync(jsonlPath, JSON.stringify({ type: 'assistant', timestamp: new Date().toISOString() }));

            // No PID file → process goes to legacy fallback
            (adapter as any).sessionsDir = path.join(tmpDir, 'no-sessions');
            (adapter as any).projectsDir = projectsDir;

            const legacySessionFile = {
                sessionId,
                filePath: jsonlPath,
                projectDir: projDir,
                birthtimeMs: startTime.getTime(),
                resolvedCwd: '/project/legacy-gone',
            };
            mockedBatchGetSessionFileBirthtimes.mockReturnValue([legacySessionFile]);
            mockedMatchProcessesToSessions.mockReturnValue([
                { process: processes[0], session: legacySessionFile, deltaMs: 500 },
            ]);

            // Simulate JSONL disappearing between match and read
            jest.spyOn((adapter as any).parser, 'readSession').mockReturnValueOnce(null);

            const agents = await adapter.detectAgents();

            expect(agents).toHaveLength(1);
            expect(agents[0].sessionId).toBe('pid-66002');
            expect(agents[0].status).toBe(AgentStatus.IDLE);

            fs.rmSync(tmpDir, { recursive: true, force: true });
            jest.restoreAllMocks();
        });

        it('should mix direct PID-file matches and legacy matches across processes', async () => {
            const startTime = new Date();
            const processes: ProcessInfo[] = [
                { pid: 55002, command: 'claude', cwd: '/project/alpha', tty: 'ttys001', startTime },
                { pid: 55003, command: 'claude', cwd: '/project/beta', tty: 'ttys002', startTime },
            ];
            mockedListAgentProcesses.mockReturnValue(processes);
            mockedEnrichProcesses.mockReturnValue(processes);

            const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'claude-mix-test-'));
            const sessionsDir = path.join(tmpDir, 'sessions');
            const projectsDir = path.join(tmpDir, 'projects');
            const projAlpha = path.join(projectsDir, '-project-alpha');
            const projBeta = path.join(projectsDir, '-project-beta');
            fs.mkdirSync(sessionsDir, { recursive: true });
            fs.mkdirSync(projAlpha, { recursive: true });
            fs.mkdirSync(projBeta, { recursive: true });

            // PID file only for process 55002
            const directSessionId = 'direct-session';
            const directJsonl = path.join(projAlpha, `${directSessionId}.jsonl`);
            fs.writeFileSync(directJsonl, [
                JSON.stringify({ type: 'user', timestamp: new Date().toISOString(), cwd: '/project/alpha', message: { content: 'direct question' } }),
                JSON.stringify({ type: 'assistant', timestamp: new Date().toISOString() }),
            ].join('\n'));
            fs.writeFileSync(
                path.join(sessionsDir, '55002.json'),
                JSON.stringify({ pid: 55002, sessionId: directSessionId, cwd: '/project/alpha', startedAt: startTime.getTime(), kind: 'interactive', entrypoint: 'cli' }),
            );

            // Legacy session file for process 55003
            const legacySessionId = 'legacy-session';
            const legacyJsonl = path.join(projBeta, `${legacySessionId}.jsonl`);
            fs.writeFileSync(legacyJsonl, [
                JSON.stringify({ type: 'user', timestamp: new Date().toISOString(), cwd: '/project/beta', message: { content: 'legacy question' } }),
                JSON.stringify({ type: 'assistant', timestamp: new Date().toISOString() }),
            ].join('\n'));

            (adapter as any).sessionsDir = sessionsDir;
            (adapter as any).projectsDir = projectsDir;

            // Mock legacy matching for process 55003
            const legacySessionFile = {
                sessionId: legacySessionId,
                filePath: legacyJsonl,
                projectDir: projBeta,
                birthtimeMs: startTime.getTime(),
                resolvedCwd: '/project/beta',
            };
            mockedBatchGetSessionFileBirthtimes.mockReturnValue([legacySessionFile]);
            mockedMatchProcessesToSessions.mockReturnValue([
                { process: processes[1], session: legacySessionFile, deltaMs: 1000 },
            ]);

            const agents = await adapter.detectAgents();

            // Legacy matching called only for fallback process (55003)
            expect(mockedMatchProcessesToSessions).toHaveBeenCalledTimes(1);
            expect(mockedMatchProcessesToSessions.mock.calls[0][0]).toEqual([processes[1]]);

            expect(agents).toHaveLength(2);
            const alpha = agents.find(a => a.pid === 55002);
            const beta = agents.find(a => a.pid === 55003);
            expect(alpha?.sessionId).toBe(directSessionId);
            expect(beta?.sessionId).toBe(legacySessionId);

            fs.rmSync(tmpDir, { recursive: true, force: true });
        });
    });

    describe('discoverSessions', () => {
        let tmpDir: string;

        beforeEach(() => {
            tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'claude-test-'));
        });

        afterEach(() => {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        });

        it('should return empty when projects dir does not exist', () => {
            (adapter as any).projectsDir = path.join(tmpDir, 'nonexistent');
            const discoverSessions = (adapter as any).discoverSessions.bind(adapter);

            const result = discoverSessions([
                { pid: 1, command: 'claude', cwd: '/test', tty: '' },
            ]);
            expect(result).toEqual([]);
        });

        it('should scan only directories matching process CWDs', () => {
            const projectsDir = path.join(tmpDir, 'projects');
            (adapter as any).projectsDir = projectsDir;
            const discoverSessions = (adapter as any).discoverSessions.bind(adapter);

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

            const result = discoverSessions(processes);
            expect(result).toHaveLength(1);
            expect(result[0].resolvedCwd).toBe('/my/project');
            // batchGetSessionFileBirthtimes called once with all dirs
            expect(mockedBatchGetSessionFileBirthtimes).toHaveBeenCalledTimes(1);
            expect(mockedBatchGetSessionFileBirthtimes).toHaveBeenCalledWith([encodedDir]);
        });

        it('should return empty when encoded dir does not exist', () => {
            const projectsDir = path.join(tmpDir, 'projects');
            fs.mkdirSync(projectsDir, { recursive: true });
            (adapter as any).projectsDir = projectsDir;
            const discoverSessions = (adapter as any).discoverSessions.bind(adapter);

            // Process CWD /test encodes to -test, but that dir doesn't exist
            const result = discoverSessions([
                { pid: 1, command: 'claude', cwd: '/test', tty: '' },
            ]);
            expect(result).toEqual([]);
            expect(mockedBatchGetSessionFileBirthtimes).not.toHaveBeenCalled();
        });

        it('should deduplicate when multiple processes share same CWD', () => {
            const projectsDir = path.join(tmpDir, 'projects');
            (adapter as any).projectsDir = projectsDir;
            const discoverSessions = (adapter as any).discoverSessions.bind(adapter);

            const encodedDir = path.join(projectsDir, '-my-project');
            fs.mkdirSync(encodedDir, { recursive: true });

            mockedBatchGetSessionFileBirthtimes.mockReturnValue([
                { sessionId: 's1', filePath: path.join(encodedDir, 's1.jsonl'), projectDir: encodedDir, birthtimeMs: 1710800324000, resolvedCwd: '' },
            ]);

            const processes = [
                { pid: 1, command: 'claude', cwd: '/my/project', tty: '' },
                { pid: 2, command: 'claude', cwd: '/my/project', tty: '' },
            ];

            const result = discoverSessions(processes);
            // Should only call batch once with deduplicated dir
            expect(mockedBatchGetSessionFileBirthtimes).toHaveBeenCalledTimes(1);
            expect(mockedBatchGetSessionFileBirthtimes).toHaveBeenCalledWith([encodedDir]);
            expect(result).toHaveLength(1);
        });

        it('should skip processes with empty cwd', () => {
            const projectsDir = path.join(tmpDir, 'projects');
            fs.mkdirSync(projectsDir, { recursive: true });
            (adapter as any).projectsDir = projectsDir;
            const discoverSessions = (adapter as any).discoverSessions.bind(adapter);

            const result = discoverSessions([
                { pid: 1, command: 'claude', cwd: '', tty: '' },
            ]);
            expect(result).toEqual([]);
        });
    });

    describe('helper methods', () => {
        describe('determineStatus', () => {
            it('should return "unknown" for sessions with no last entry type', () => {
                const determineStatus = (adapter as any).parser.determineStatus.bind((adapter as any).parser);

                const session = {
                    sessionId: 'test',
                    projectPath: '/test',
                    sessionStart: new Date(),
                    lastActive: new Date(),
                    isInterrupted: false,
                };

                expect(determineStatus(session)).toBe(AgentStatus.UNKNOWN);
            });

            it('should return "waiting" for assistant entries', () => {
                const determineStatus = (adapter as any).parser.determineStatus.bind((adapter as any).parser);

                const session = {
                    sessionId: 'test',
                    projectPath: '/test',
                    sessionStart: new Date(),
                    lastActive: new Date(),
                    lastEntryType: 'assistant',
                    isInterrupted: false,
                };

                expect(determineStatus(session)).toBe(AgentStatus.WAITING);
            });

            it('should return "waiting" for user interruption', () => {
                const determineStatus = (adapter as any).parser.determineStatus.bind((adapter as any).parser);

                const session = {
                    sessionId: 'test',
                    projectPath: '/test',
                    sessionStart: new Date(),
                    lastActive: new Date(),
                    lastEntryType: 'user',
                    isInterrupted: true,
                };

                expect(determineStatus(session)).toBe(AgentStatus.WAITING);
            });

            it('should return "running" for user/progress entries', () => {
                const determineStatus = (adapter as any).parser.determineStatus.bind((adapter as any).parser);

                const session = {
                    sessionId: 'test',
                    projectPath: '/test',
                    sessionStart: new Date(),
                    lastActive: new Date(),
                    lastEntryType: 'user',
                    isInterrupted: false,
                };

                expect(determineStatus(session)).toBe(AgentStatus.RUNNING);
            });

            it('should not override status based on age (process is running)', () => {
                const determineStatus = (adapter as any).parser.determineStatus.bind((adapter as any).parser);

                const oldDate = new Date(Date.now() - 10 * 60 * 1000);
                const session = {
                    sessionId: 'test',
                    projectPath: '/test',
                    sessionStart: oldDate,
                    lastActive: oldDate,
                    lastEntryType: 'assistant',
                    isInterrupted: false,
                };

                expect(determineStatus(session)).toBe(AgentStatus.WAITING);
            });

            it('should return "idle" for system entries', () => {
                const determineStatus = (adapter as any).parser.determineStatus.bind((adapter as any).parser);

                const session = {
                    sessionId: 'test',
                    projectPath: '/test',
                    sessionStart: new Date(),
                    lastActive: new Date(),
                    lastEntryType: 'system',
                    isInterrupted: false,
                };

                expect(determineStatus(session)).toBe(AgentStatus.IDLE);
            });

            it('should return "running" for thinking entries', () => {
                const determineStatus = (adapter as any).parser.determineStatus.bind((adapter as any).parser);

                const session = {
                    sessionId: 'test',
                    projectPath: '/test',
                    sessionStart: new Date(),
                    lastActive: new Date(),
                    lastEntryType: 'thinking',
                    isInterrupted: false,
                };

                expect(determineStatus(session)).toBe(AgentStatus.RUNNING);
            });

            it('should return "running" for progress entries', () => {
                const determineStatus = (adapter as any).parser.determineStatus.bind((adapter as any).parser);

                const session = {
                    sessionId: 'test',
                    projectPath: '/test',
                    sessionStart: new Date(),
                    lastActive: new Date(),
                    lastEntryType: 'progress',
                    isInterrupted: false,
                };

                expect(determineStatus(session)).toBe(AgentStatus.RUNNING);
            });

            it('should return "unknown" for unrecognized entry types', () => {
                const determineStatus = (adapter as any).parser.determineStatus.bind((adapter as any).parser);

                const session = {
                    sessionId: 'test',
                    projectPath: '/test',
                    sessionStart: new Date(),
                    lastActive: new Date(),
                    lastEntryType: 'some_other_type',
                    isInterrupted: false,
                };

                expect(determineStatus(session)).toBe(AgentStatus.UNKNOWN);
            });
        });

        describe('extractUserMessageText', () => {
            it('should extract plain string content', () => {
                const extract = (adapter as any).parser['extractUserMessageText'].bind((adapter as any).parser);
                expect(extract('hello world')).toBe('hello world');
            });

            it('should extract text from array content blocks', () => {
                const extract = (adapter as any).parser['extractUserMessageText'].bind((adapter as any).parser);

                const content = [
                    { type: 'tool_result', content: 'some result' },
                    { type: 'text', text: 'user question' },
                ];
                expect(extract(content)).toBe('user question');
            });

            it('should return undefined for empty/null content', () => {
                const extract = (adapter as any).parser['extractUserMessageText'].bind((adapter as any).parser);

                expect(extract(undefined)).toBeUndefined();
                expect(extract('')).toBeUndefined();
                expect(extract([])).toBeUndefined();
            });

            it('should parse command-message tags', () => {
                const extract = (adapter as any).parser['extractUserMessageText'].bind((adapter as any).parser);

                const msg = '<command-message><command-name>commit</command-name><command-args>fix bug</command-args></command-message>';
                expect(extract(msg)).toBe('commit fix bug');
            });

            it('should parse command-message without args', () => {
                const extract = (adapter as any).parser['extractUserMessageText'].bind((adapter as any).parser);

                const msg = '<command-message><command-name>help</command-name></command-message>';
                expect(extract(msg)).toBe('help');
            });

            it('should extract ARGUMENTS from skill expansion', () => {
                const extract = (adapter as any).parser['extractUserMessageText'].bind((adapter as any).parser);

                const msg = 'Base directory for this skill: /some/path\n\nSome instructions\n\nARGUMENTS: implement the feature';
                expect(extract(msg)).toBe('implement the feature');
            });

            it('should return undefined for skill expansion without ARGUMENTS', () => {
                const extract = (adapter as any).parser['extractUserMessageText'].bind((adapter as any).parser);

                const msg = 'Base directory for this skill: /some/path\n\nSome instructions only';
                expect(extract(msg)).toBeUndefined();
            });

            it('should filter noise messages', () => {
                const extract = (adapter as any).parser['extractUserMessageText'].bind((adapter as any).parser);

                expect(extract('[Request interrupted by user]')).toBeUndefined();
                expect(extract('Tool loaded.')).toBeUndefined();
                expect(extract('This session is being continued from a previous conversation')).toBeUndefined();
            });
        });

        describe('parseCommandMessage', () => {
            it('should return undefined for malformed command-message', () => {
                const parse = (adapter as any).parser['parseCommandMessage'].bind((adapter as any).parser);
                expect(parse('<command-message>no tags</command-message>')).toBeUndefined();
            });
        });
    });

    describe('file I/O methods', () => {
        let tmpDir: string;

        beforeEach(() => {
            tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'claude-test-'));
        });

        afterEach(() => {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        });

        describe('tryPidFileMatching', () => {
            let sessionsDir: string;
            let projectsDir: string;

            beforeEach(() => {
                sessionsDir = path.join(tmpDir, 'sessions');
                projectsDir = path.join(tmpDir, 'projects');
                fs.mkdirSync(sessionsDir, { recursive: true });
                (adapter as any).sessionsDir = sessionsDir;
                (adapter as any).projectsDir = projectsDir;
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
                const encoded = cwd.replace(/\//g, '-');
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

                const tryMatch = (adapter as any).tryPidFileMatching.bind(adapter);
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

                const tryMatch = (adapter as any).tryPidFileMatching.bind(adapter);
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

                const tryMatch = (adapter as any).tryPidFileMatching.bind(adapter);
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

                const tryMatch = (adapter as any).tryPidFileMatching.bind(adapter);
                const { direct, fallback } = tryMatch([proc]);

                expect(direct).toHaveLength(1);
                expect(fallback).toHaveLength(0);
            });

            it('should fall back when PID file is absent', () => {
                const proc = makeProc(1005, '/project/test', new Date());
                // No PID file written

                const tryMatch = (adapter as any).tryPidFileMatching.bind(adapter);
                const { direct, fallback } = tryMatch([proc]);

                expect(direct).toHaveLength(0);
                expect(fallback).toHaveLength(1);
            });

            it('should fall back when PID file contains malformed JSON', () => {
                const proc = makeProc(1006, '/project/test', new Date());
                fs.writeFileSync(path.join(sessionsDir, '1006.json'), 'not valid json {{{');

                const tryMatch = (adapter as any).tryPidFileMatching.bind(adapter);
                expect(() => {
                    const { direct, fallback } = tryMatch([proc]);
                    expect(direct).toHaveLength(0);
                    expect(fallback).toHaveLength(1);
                }).not.toThrow();
            });

            it('should fall back for all processes when sessions dir does not exist', () => {
                (adapter as any).sessionsDir = path.join(tmpDir, 'nonexistent-sessions');
                const processes = [makeProc(2001, '/a', new Date()), makeProc(2002, '/b', new Date())];

                const tryMatch = (adapter as any).tryPidFileMatching.bind(adapter);
                const { direct, fallback } = tryMatch(processes);

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

                const tryMatch = (adapter as any).tryPidFileMatching.bind(adapter);
                const { direct, fallback } = tryMatch([proc1, proc2, proc3]);

                expect(direct).toHaveLength(2);
                expect(fallback).toHaveLength(1);
                expect(direct.map((d: any) => d.process.pid).sort()).toEqual([3001, 3003]);
                expect(fallback[0].pid).toBe(3002);
            });

            it('should skip stale-file check when proc.startTime is undefined', () => {
                const proc = makeProc(4001, '/project/test', undefined); // no startTime
                writePidFile(4001, 'no-time-session', '/project/test', Date.now() - 999_999);
                writeJsonl('/project/test', 'no-time-session');

                const tryMatch = (adapter as any).tryPidFileMatching.bind(adapter);
                const { direct, fallback } = tryMatch([proc]);

                // startTime undefined → stale check skipped → direct match
                expect(direct).toHaveLength(1);
                expect(fallback).toHaveLength(0);
            });
        });

        describe('readSession', () => {
            it('should parse session file with timestamps, cwd, and entry type', () => {
                const readSession = (adapter as any).parser.readSession.bind((adapter as any).parser);

                const filePath = path.join(tmpDir, 'test-session.jsonl');
                const lines = [
                    JSON.stringify({ type: 'user', timestamp: '2026-03-10T10:00:00Z', cwd: '/my/project' }),
                    JSON.stringify({ type: 'assistant', timestamp: '2026-03-10T10:01:00Z' }),
                ];
                fs.writeFileSync(filePath, lines.join('\n'));

                const session = readSession(filePath, '/my/project');
                expect(session).toMatchObject({
                    sessionId: 'test-session',
                    projectPath: '/my/project',
                    lastCwd: '/my/project',
                    lastEntryType: 'assistant',
                    isInterrupted: false,
                });
                expect(session.sessionStart.toISOString()).toBe('2026-03-10T10:00:00.000Z');
                expect(session.lastActive.toISOString()).toBe('2026-03-10T10:01:00.000Z');
            });

            it('should detect user interruption', () => {
                const readSession = (adapter as any).parser.readSession.bind((adapter as any).parser);

                const filePath = path.join(tmpDir, 'interrupted.jsonl');
                const lines = [
                    JSON.stringify({
                        type: 'user',
                        timestamp: '2026-03-10T10:00:00Z',
                        message: {
                            content: [{ type: 'text', text: '[Request interrupted by user for tool use]' }],
                        },
                    }),
                ];
                fs.writeFileSync(filePath, lines.join('\n'));

                const session = readSession(filePath, '/test');
                expect(session.isInterrupted).toBe(true);
                expect(session.lastEntryType).toBe('user');
            });

            it('should return session with defaults for empty file', () => {
                const readSession = (adapter as any).parser.readSession.bind((adapter as any).parser);

                const filePath = path.join(tmpDir, 'empty.jsonl');
                fs.writeFileSync(filePath, '');

                const session = readSession(filePath, '/test');
                expect(session).not.toBeNull();
                expect(session.lastEntryType).toBeUndefined();
            });

            it('should return null for non-existent file', () => {
                const readSession = (adapter as any).parser.readSession.bind((adapter as any).parser);
                expect(readSession(path.join(tmpDir, 'nonexistent.jsonl'), '/test')).toBeNull();
            });

            it('should skip metadata entry types for lastEntryType', () => {
                const readSession = (adapter as any).parser.readSession.bind((adapter as any).parser);

                const filePath = path.join(tmpDir, 'metadata-test.jsonl');
                const lines = [
                    JSON.stringify({ type: 'user', timestamp: '2026-03-10T10:00:00Z', message: { content: 'hello' } }),
                    JSON.stringify({ type: 'assistant', timestamp: '2026-03-10T10:01:00Z' }),
                    JSON.stringify({ type: 'last-prompt', timestamp: '2026-03-10T10:02:00Z' }),
                    JSON.stringify({ type: 'file-history-snapshot', timestamp: '2026-03-10T10:03:00Z' }),
                ];
                fs.writeFileSync(filePath, lines.join('\n'));

                const session = readSession(filePath, '/test');
                expect(session.lastEntryType).toBe('assistant');
            });

            it('should parse snapshot.timestamp from file-history-snapshot first entry', () => {
                const readSession = (adapter as any).parser.readSession.bind((adapter as any).parser);

                const filePath = path.join(tmpDir, 'snapshot-ts.jsonl');
                const lines = [
                    JSON.stringify({
                        type: 'file-history-snapshot',
                        snapshot: { timestamp: '2026-03-10T09:55:00Z', files: [] },
                    }),
                    JSON.stringify({ type: 'user', timestamp: '2026-03-10T10:00:00Z', message: { content: 'test' } }),
                    JSON.stringify({ type: 'assistant', timestamp: '2026-03-10T10:01:00Z' }),
                ];
                fs.writeFileSync(filePath, lines.join('\n'));

                const session = readSession(filePath, '/test');
                expect(session.sessionStart.toISOString()).toBe('2026-03-10T09:55:00.000Z');
                expect(session.lastActive.toISOString()).toBe('2026-03-10T10:01:00.000Z');
            });

            it('should extract lastUserMessage from session entries', () => {
                const readSession = (adapter as any).parser.readSession.bind((adapter as any).parser);

                const filePath = path.join(tmpDir, 'user-msg.jsonl');
                const lines = [
                    JSON.stringify({ type: 'user', timestamp: '2026-03-10T10:00:00Z', message: { content: 'first question' } }),
                    JSON.stringify({ type: 'assistant', timestamp: '2026-03-10T10:01:00Z' }),
                    JSON.stringify({ type: 'user', timestamp: '2026-03-10T10:02:00Z', message: { content: [{ type: 'text', text: 'second question' }] } }),
                    JSON.stringify({ type: 'assistant', timestamp: '2026-03-10T10:03:00Z' }),
                ];
                fs.writeFileSync(filePath, lines.join('\n'));

                const session = readSession(filePath, '/test');
                expect(session.lastUserMessage).toBe('second question');
            });

            it('should use lastCwd as projectPath when projectPath is empty', () => {
                const readSession = (adapter as any).parser.readSession.bind((adapter as any).parser);

                const filePath = path.join(tmpDir, 'no-project.jsonl');
                const lines = [
                    JSON.stringify({ type: 'user', timestamp: '2026-03-10T10:00:00Z', cwd: '/derived/path', message: { content: 'test' } }),
                ];
                fs.writeFileSync(filePath, lines.join('\n'));

                const session = readSession(filePath, '');
                expect(session.projectPath).toBe('/derived/path');
            });

            it('should handle malformed JSON lines gracefully', () => {
                const readSession = (adapter as any).parser.readSession.bind((adapter as any).parser);

                const filePath = path.join(tmpDir, 'malformed.jsonl');
                const lines = [
                    'not json',
                    JSON.stringify({ type: 'assistant', timestamp: '2026-03-10T10:00:00Z' }),
                ];
                fs.writeFileSync(filePath, lines.join('\n'));

                const session = readSession(filePath, '/test');
                expect(session).not.toBeNull();
                expect(session.lastEntryType).toBe('assistant');
            });
        });
    });

    describe('getConversation', () => {
        let tmpDir: string;

        beforeEach(() => {
            tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'claude-conv-'));
        });

        afterEach(() => {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        });

        function writeJsonl(lines: object[]): string {
            const filePath = path.join(tmpDir, 'session.jsonl');
            fs.writeFileSync(filePath, lines.map(l => JSON.stringify(l)).join('\n'));
            return filePath;
        }

        it('should parse user and assistant text messages', () => {
            const filePath = writeJsonl([
                { type: 'user', timestamp: '2026-03-27T10:00:00Z', message: { content: 'Hello' } },
                { type: 'assistant', timestamp: '2026-03-27T10:00:05Z', message: { content: [{ type: 'text', text: 'Hi there!' }] } },
            ]);

            const messages = adapter.getConversation(filePath);
            expect(messages).toHaveLength(2);
            expect(messages[0]).toEqual({ role: 'user', content: 'Hello', timestamp: '2026-03-27T10:00:00Z' });
            expect(messages[1]).toEqual({ role: 'assistant', content: 'Hi there!', timestamp: '2026-03-27T10:00:05Z' });
        });

        it('should skip metadata entry types', () => {
            const filePath = writeJsonl([
                { type: 'file-history-snapshot', timestamp: '2026-03-27T10:00:00Z', snapshot: {} },
                { type: 'last-prompt', timestamp: '2026-03-27T10:00:00Z' },
                { type: 'user', timestamp: '2026-03-27T10:00:01Z', message: { content: 'Fix bug' } },
            ]);

            const messages = adapter.getConversation(filePath);
            expect(messages).toHaveLength(1);
            expect(messages[0].content).toBe('Fix bug');
        });

        it('should skip progress and thinking entries', () => {
            const filePath = writeJsonl([
                { type: 'user', timestamp: '2026-03-27T10:00:00Z', message: { content: 'Hello' } },
                { type: 'progress', timestamp: '2026-03-27T10:00:01Z', data: {} },
                { type: 'thinking', timestamp: '2026-03-27T10:00:02Z' },
                { type: 'assistant', timestamp: '2026-03-27T10:00:03Z', message: { content: [{ type: 'text', text: 'Done' }] } },
            ]);

            const messages = adapter.getConversation(filePath);
            expect(messages).toHaveLength(2);
            expect(messages[0].role).toBe('user');
            expect(messages[1].role).toBe('assistant');
        });

        it('should include system messages', () => {
            const filePath = writeJsonl([
                { type: 'system', timestamp: '2026-03-27T10:00:00Z', message: { content: 'System initialized' } },
            ]);

            const messages = adapter.getConversation(filePath);
            expect(messages).toHaveLength(1);
            expect(messages[0]).toEqual({ role: 'system', content: 'System initialized', timestamp: '2026-03-27T10:00:00Z' });
        });

        it('should skip tool_use and tool_result blocks in default mode', () => {
            const filePath = writeJsonl([
                {
                    type: 'assistant', timestamp: '2026-03-27T10:00:00Z',
                    message: {
                        content: [
                            { type: 'text', text: 'Let me read the file.' },
                            { type: 'tool_use', name: 'Read', input: { file_path: '/src/app.ts' } },
                        ],
                    },
                },
                {
                    type: 'user', timestamp: '2026-03-27T10:00:01Z',
                    message: {
                        content: [
                            { type: 'tool_result', tool_use_id: 'toolu_1', content: 'file contents here' },
                        ],
                    },
                },
            ]);

            const messages = adapter.getConversation(filePath);
            expect(messages).toHaveLength(1);
            expect(messages[0].content).toBe('Let me read the file.');
        });

        it('should include tool_use and tool_result blocks in verbose mode', () => {
            const filePath = writeJsonl([
                {
                    type: 'assistant', timestamp: '2026-03-27T10:00:00Z',
                    message: {
                        content: [
                            { type: 'text', text: 'Let me read the file.' },
                            { type: 'tool_use', name: 'Read', input: { file_path: '/src/app.ts' } },
                        ],
                    },
                },
                {
                    type: 'user', timestamp: '2026-03-27T10:00:01Z',
                    message: {
                        content: [
                            { type: 'tool_result', tool_use_id: 'toolu_1', content: 'file contents here' },
                        ],
                    },
                },
            ]);

            const messages = adapter.getConversation(filePath, { verbose: true });
            expect(messages).toHaveLength(2);
            expect(messages[0].content).toContain('[Tool: Read]');
            expect(messages[0].content).toContain('/src/app.ts');
            expect(messages[1].content).toContain('[Tool Result]');
        });

        it('should handle tool_result errors in verbose mode', () => {
            const filePath = writeJsonl([
                {
                    type: 'user', timestamp: '2026-03-27T10:00:00Z',
                    message: {
                        content: [
                            { type: 'tool_result', tool_use_id: 'toolu_1', content: 'Something went wrong', is_error: true },
                        ],
                    },
                },
            ]);

            const messages = adapter.getConversation(filePath, { verbose: true });
            expect(messages).toHaveLength(1);
            expect(messages[0].content).toContain('[Tool Error]');
        });

        it('should handle malformed JSON lines gracefully', () => {
            const filePath = path.join(tmpDir, 'malformed.jsonl');
            fs.writeFileSync(filePath, [
                JSON.stringify({ type: 'user', timestamp: '2026-03-27T10:00:00Z', message: { content: 'Hello' } }),
                'this is not valid json',
                JSON.stringify({ type: 'assistant', timestamp: '2026-03-27T10:00:01Z', message: { content: [{ type: 'text', text: 'World' }] } }),
            ].join('\n'));

            const messages = adapter.getConversation(filePath);
            expect(messages).toHaveLength(2);
        });

        it('should return empty array for missing file', () => {
            const messages = adapter.getConversation('/nonexistent/path.jsonl');
            expect(messages).toEqual([]);
        });

        it('should return empty array for empty file', () => {
            const filePath = path.join(tmpDir, 'empty.jsonl');
            fs.writeFileSync(filePath, '');

            const messages = adapter.getConversation(filePath);
            expect(messages).toEqual([]);
        });

        it('should filter noise messages from user entries', () => {
            const filePath = writeJsonl([
                { type: 'user', timestamp: '2026-03-27T10:00:00Z', message: { content: [{ type: 'text', text: '[Request interrupted by user]' }] } },
                { type: 'user', timestamp: '2026-03-27T10:00:01Z', message: { content: 'Tool loaded.' } },
                { type: 'user', timestamp: '2026-03-27T10:00:02Z', message: { content: 'Real question' } },
            ]);

            const messages = adapter.getConversation(filePath);
            expect(messages).toHaveLength(1);
            expect(messages[0].content).toBe('Real question');
        });
    });
});

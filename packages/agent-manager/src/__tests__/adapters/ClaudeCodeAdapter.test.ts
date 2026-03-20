/**
 * Tests for ClaudeCodeAdapter
 */

import * as fs from 'fs';
import * as path from 'path';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { ClaudeCodeAdapter } from '../../adapters/ClaudeCodeAdapter';
import type { AgentInfo, ProcessInfo } from '../../adapters/AgentAdapter';
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
                JSON.stringify({ type: 'user', timestamp: '2026-03-18T23:18:44Z', cwd: '/Users/test/my-project', slug: 'merry-dog', message: { content: 'Investigate failing tests' } }),
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
                slug: 'merry-dog',
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
                const determineStatus = (adapter as any).determineStatus.bind(adapter);

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
                const determineStatus = (adapter as any).determineStatus.bind(adapter);

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
                const determineStatus = (adapter as any).determineStatus.bind(adapter);

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
                const determineStatus = (adapter as any).determineStatus.bind(adapter);

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
                const determineStatus = (adapter as any).determineStatus.bind(adapter);

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
                const determineStatus = (adapter as any).determineStatus.bind(adapter);

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
                const determineStatus = (adapter as any).determineStatus.bind(adapter);

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
                const determineStatus = (adapter as any).determineStatus.bind(adapter);

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
                const determineStatus = (adapter as any).determineStatus.bind(adapter);

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
                const extract = (adapter as any).extractUserMessageText.bind(adapter);
                expect(extract('hello world')).toBe('hello world');
            });

            it('should extract text from array content blocks', () => {
                const extract = (adapter as any).extractUserMessageText.bind(adapter);

                const content = [
                    { type: 'tool_result', content: 'some result' },
                    { type: 'text', text: 'user question' },
                ];
                expect(extract(content)).toBe('user question');
            });

            it('should return undefined for empty/null content', () => {
                const extract = (adapter as any).extractUserMessageText.bind(adapter);

                expect(extract(undefined)).toBeUndefined();
                expect(extract('')).toBeUndefined();
                expect(extract([])).toBeUndefined();
            });

            it('should parse command-message tags', () => {
                const extract = (adapter as any).extractUserMessageText.bind(adapter);

                const msg = '<command-message><command-name>commit</command-name><command-args>fix bug</command-args></command-message>';
                expect(extract(msg)).toBe('commit fix bug');
            });

            it('should parse command-message without args', () => {
                const extract = (adapter as any).extractUserMessageText.bind(adapter);

                const msg = '<command-message><command-name>help</command-name></command-message>';
                expect(extract(msg)).toBe('help');
            });

            it('should extract ARGUMENTS from skill expansion', () => {
                const extract = (adapter as any).extractUserMessageText.bind(adapter);

                const msg = 'Base directory for this skill: /some/path\n\nSome instructions\n\nARGUMENTS: implement the feature';
                expect(extract(msg)).toBe('implement the feature');
            });

            it('should return undefined for skill expansion without ARGUMENTS', () => {
                const extract = (adapter as any).extractUserMessageText.bind(adapter);

                const msg = 'Base directory for this skill: /some/path\n\nSome instructions only';
                expect(extract(msg)).toBeUndefined();
            });

            it('should filter noise messages', () => {
                const extract = (adapter as any).extractUserMessageText.bind(adapter);

                expect(extract('[Request interrupted by user]')).toBeUndefined();
                expect(extract('Tool loaded.')).toBeUndefined();
                expect(extract('This session is being continued from a previous conversation')).toBeUndefined();
            });
        });

        describe('parseCommandMessage', () => {
            it('should return undefined for malformed command-message', () => {
                const parse = (adapter as any).parseCommandMessage.bind(adapter);
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

        describe('readSession', () => {
            it('should parse session file with timestamps, slug, cwd, and entry type', () => {
                const readSession = (adapter as any).readSession.bind(adapter);

                const filePath = path.join(tmpDir, 'test-session.jsonl');
                const lines = [
                    JSON.stringify({ type: 'user', timestamp: '2026-03-10T10:00:00Z', cwd: '/my/project', slug: 'happy-dog' }),
                    JSON.stringify({ type: 'assistant', timestamp: '2026-03-10T10:01:00Z' }),
                ];
                fs.writeFileSync(filePath, lines.join('\n'));

                const session = readSession(filePath, '/my/project');
                expect(session).toMatchObject({
                    sessionId: 'test-session',
                    projectPath: '/my/project',
                    slug: 'happy-dog',
                    lastCwd: '/my/project',
                    lastEntryType: 'assistant',
                    isInterrupted: false,
                });
                expect(session.sessionStart.toISOString()).toBe('2026-03-10T10:00:00.000Z');
                expect(session.lastActive.toISOString()).toBe('2026-03-10T10:01:00.000Z');
            });

            it('should detect user interruption', () => {
                const readSession = (adapter as any).readSession.bind(adapter);

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
                const readSession = (adapter as any).readSession.bind(adapter);

                const filePath = path.join(tmpDir, 'empty.jsonl');
                fs.writeFileSync(filePath, '');

                const session = readSession(filePath, '/test');
                expect(session).not.toBeNull();
                expect(session.lastEntryType).toBeUndefined();
                expect(session.slug).toBeUndefined();
            });

            it('should return null for non-existent file', () => {
                const readSession = (adapter as any).readSession.bind(adapter);
                expect(readSession(path.join(tmpDir, 'nonexistent.jsonl'), '/test')).toBeNull();
            });

            it('should skip metadata entry types for lastEntryType', () => {
                const readSession = (adapter as any).readSession.bind(adapter);

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
                const readSession = (adapter as any).readSession.bind(adapter);

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
                const readSession = (adapter as any).readSession.bind(adapter);

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
                const readSession = (adapter as any).readSession.bind(adapter);

                const filePath = path.join(tmpDir, 'no-project.jsonl');
                const lines = [
                    JSON.stringify({ type: 'user', timestamp: '2026-03-10T10:00:00Z', cwd: '/derived/path', message: { content: 'test' } }),
                ];
                fs.writeFileSync(filePath, lines.join('\n'));

                const session = readSession(filePath, '');
                expect(session.projectPath).toBe('/derived/path');
            });

            it('should handle malformed JSON lines gracefully', () => {
                const readSession = (adapter as any).readSession.bind(adapter);

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
});

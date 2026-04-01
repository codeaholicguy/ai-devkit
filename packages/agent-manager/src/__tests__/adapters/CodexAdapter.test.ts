/**
 * Tests for CodexAdapter
 */

import * as fs from 'fs';
import * as path from 'path';
import { beforeEach, afterEach, describe, expect, it, jest } from '@jest/globals';
import { CodexAdapter } from '../../adapters/CodexAdapter';
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

describe('CodexAdapter', () => {
    let adapter: CodexAdapter;

    beforeEach(() => {
        adapter = new CodexAdapter();
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
        it('should expose codex type', () => {
            expect(adapter.type).toBe('codex');
        });
    });

    describe('canHandle', () => {
        it('should return true for codex commands', () => {
            expect(adapter.canHandle({ pid: 1, command: 'codex', cwd: '/repo', tty: 'ttys001' })).toBe(true);
        });

        it('should return true for codex with full path (case-insensitive)', () => {
            expect(adapter.canHandle({
                pid: 2,
                command: '/usr/local/bin/CODEX --sandbox workspace-write',
                cwd: '/repo',
                tty: 'ttys002',
            })).toBe(true);
        });

        it('should return false for non-codex processes', () => {
            expect(adapter.canHandle({ pid: 3, command: 'node app.js', cwd: '/repo', tty: 'ttys003' })).toBe(false);
        });

        it('should return false for processes with "codex" only in path arguments', () => {
            expect(adapter.canHandle({
                pid: 4,
                command: 'node /worktrees/feature-codex-adapter-agent-manager-package/node_modules/nx/src/daemon/server/start.js',
                cwd: '/repo',
                tty: 'ttys004',
            })).toBe(false);
        });
    });

    describe('detectAgents', () => {
        it('should return empty list when no codex process is running', async () => {
            mockedListAgentProcesses.mockReturnValue([]);

            const agents = await adapter.detectAgents();
            expect(agents).toEqual([]);
            expect(mockedListAgentProcesses).toHaveBeenCalledWith('codex');
        });

        it('should return process-only agents when no sessions discovered', async () => {
            const processes: ProcessInfo[] = [
                { pid: 100, command: 'codex', cwd: '/repo-a', tty: 'ttys001' },
            ];
            mockedListAgentProcesses.mockReturnValue(processes);
            mockedEnrichProcesses.mockReturnValue(processes);

            // No sessions dir → discoverSessions returns []
            (adapter as any).codexSessionsDir = '/nonexistent/sessions';

            const agents = await adapter.detectAgents();
            expect(agents).toHaveLength(1);
            expect(agents[0]).toMatchObject({
                type: 'codex',
                status: AgentStatus.RUNNING,
                pid: 100,
                projectPath: '/repo-a',
                sessionId: 'pid-100',
                summary: 'Codex process running',
            });
        });

        it('should detect agents with matched sessions', async () => {
            const processes: ProcessInfo[] = [
                {
                    pid: 100,
                    command: 'codex',
                    cwd: '/repo-a',
                    tty: 'ttys001',
                    startTime: new Date('2026-03-18T15:00:00.000Z'),
                },
            ];
            mockedListAgentProcesses.mockReturnValue(processes);
            mockedEnrichProcesses.mockReturnValue(processes);

            // Set up sessions dir with date directory
            const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'codex-test-'));
            const sessionsDir = path.join(tmpDir, 'sessions');
            const dateDir = path.join(sessionsDir, '2026', '03', '18');
            fs.mkdirSync(dateDir, { recursive: true });

            // Create session file with recent timestamps so status isn't idle
            const now = new Date();
            const recentTs = now.toISOString();
            const sessionFile = path.join(dateDir, 'sess-abc.jsonl');
            fs.writeFileSync(sessionFile, [
                JSON.stringify({ type: 'session_meta', payload: { id: 'sess-abc', timestamp: recentTs, cwd: '/repo-a' } }),
                JSON.stringify({ type: 'event', timestamp: recentTs, payload: { type: 'token_count', message: 'Implement adapter flow' } }),
            ].join('\n'));

            (adapter as any).codexSessionsDir = sessionsDir;

            const sessionFiles: SessionFile[] = [
                {
                    sessionId: 'sess-abc',
                    filePath: sessionFile,
                    projectDir: dateDir,
                    birthtimeMs: new Date('2026-03-18T15:00:05Z').getTime(),
                    resolvedCwd: '',
                },
            ];
            mockedBatchGetSessionFileBirthtimes.mockReturnValue(sessionFiles);

            const matches: MatchResult[] = [
                {
                    process: processes[0],
                    session: { ...sessionFiles[0], resolvedCwd: '/repo-a' },
                    deltaMs: 5000,
                },
            ];
            mockedMatchProcessesToSessions.mockReturnValue(matches);

            const agents = await adapter.detectAgents();

            expect(agents).toHaveLength(1);
            expect(agents[0]).toMatchObject({
                type: 'codex',
                status: AgentStatus.RUNNING,
                pid: 100,
                projectPath: '/repo-a',
                sessionId: 'sess-abc',
                summary: 'Implement adapter flow',
            });

            fs.rmSync(tmpDir, { recursive: true, force: true });
        });

        it('should fall back to process-only for unmatched processes', async () => {
            const processes: ProcessInfo[] = [
                { pid: 100, command: 'codex', cwd: '/repo-a', tty: 'ttys001', startTime: new Date() },
                { pid: 200, command: 'codex', cwd: '/repo-b', tty: 'ttys002', startTime: new Date() },
            ];
            mockedListAgentProcesses.mockReturnValue(processes);
            mockedEnrichProcesses.mockReturnValue(processes);

            const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'codex-test-'));
            const sessionsDir = path.join(tmpDir, 'sessions');
            const now = new Date();
            const dateDir = path.join(
                sessionsDir,
                String(now.getFullYear()),
                String(now.getMonth() + 1).padStart(2, '0'),
                String(now.getDate()).padStart(2, '0'),
            );
            fs.mkdirSync(dateDir, { recursive: true });

            const sessionFile = path.join(dateDir, 'only-session.jsonl');
            fs.writeFileSync(sessionFile,
                JSON.stringify({ type: 'session_meta', payload: { id: 'only-session', timestamp: now.toISOString(), cwd: '/repo-a' } }),
            );

            (adapter as any).codexSessionsDir = sessionsDir;

            const sessionFiles: SessionFile[] = [
                {
                    sessionId: 'only-session',
                    filePath: sessionFile,
                    projectDir: dateDir,
                    birthtimeMs: Date.now(),
                    resolvedCwd: '',
                },
            ];
            mockedBatchGetSessionFileBirthtimes.mockReturnValue(sessionFiles);

            // Only process 100 matches
            const matches: MatchResult[] = [
                {
                    process: processes[0],
                    session: { ...sessionFiles[0], resolvedCwd: '/repo-a' },
                    deltaMs: 5000,
                },
            ];
            mockedMatchProcessesToSessions.mockReturnValue(matches);

            const agents = await adapter.detectAgents();
            expect(agents).toHaveLength(2);

            const matched = agents.find((a) => a.pid === 100);
            const unmatched = agents.find((a) => a.pid === 200);
            expect(matched?.sessionId).toBe('only-session');
            expect(unmatched?.sessionId).toBe('pid-200');
            expect(unmatched?.status).toBe(AgentStatus.RUNNING);

            fs.rmSync(tmpDir, { recursive: true, force: true });
        });
    });

    describe('discoverSessions', () => {
        let tmpDir: string;

        beforeEach(() => {
            tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'codex-test-'));
        });

        afterEach(() => {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        });

        it('should return empty when sessions dir does not exist', () => {
            (adapter as any).codexSessionsDir = path.join(tmpDir, 'nonexistent');
            const discoverSessions = (adapter as any).discoverSessions.bind(adapter);

            const { sessions } = discoverSessions([
                { pid: 1, command: 'codex', cwd: '/repo', tty: '', startTime: new Date() },
            ]);
            expect(sessions).toEqual([]);
        });

        it('should scan date directories based on process start times', () => {
            const sessionsDir = path.join(tmpDir, 'sessions');
            (adapter as any).codexSessionsDir = sessionsDir;
            const discoverSessions = (adapter as any).discoverSessions.bind(adapter);

            // Create date dir for 2026-03-18
            const dateDir = path.join(sessionsDir, '2026', '03', '18');
            fs.mkdirSync(dateDir, { recursive: true });

            // Create session file with meta
            const sessionFile = path.join(dateDir, 'sess1.jsonl');
            fs.writeFileSync(sessionFile,
                JSON.stringify({ type: 'session_meta', payload: { id: 'sess1', cwd: '/repo-a' } }),
            );

            const mockFiles: SessionFile[] = [
                {
                    sessionId: 'sess1',
                    filePath: sessionFile,
                    projectDir: dateDir,
                    birthtimeMs: 1710800324000,
                    resolvedCwd: '',
                },
            ];
            mockedBatchGetSessionFileBirthtimes.mockReturnValue(mockFiles);

            const processes = [
                { pid: 1, command: 'codex', cwd: '/repo-a', tty: '', startTime: new Date('2026-03-18T15:00:00Z') },
            ];

            const { sessions, contentCache } = discoverSessions(processes);
            expect(sessions).toHaveLength(1);
            expect(sessions[0].resolvedCwd).toBe('/repo-a');
            expect(contentCache.has(sessionFile)).toBe(true);
            expect(mockedBatchGetSessionFileBirthtimes).toHaveBeenCalledTimes(1);
        });

        it('should scan ±1 day window around process start time', () => {
            const sessionsDir = path.join(tmpDir, 'sessions');
            (adapter as any).codexSessionsDir = sessionsDir;
            const discoverSessions = (adapter as any).discoverSessions.bind(adapter);

            // Create date dirs for 17, 18, 19
            for (const day of ['17', '18', '19']) {
                fs.mkdirSync(path.join(sessionsDir, '2026', '03', day), { recursive: true });
            }

            mockedBatchGetSessionFileBirthtimes.mockReturnValue([]);

            const processes = [
                { pid: 1, command: 'codex', cwd: '/repo', tty: '', startTime: new Date('2026-03-18T15:00:00Z') },
            ];

            discoverSessions(processes);
            expect(mockedBatchGetSessionFileBirthtimes).toHaveBeenCalledTimes(1);
            // Should scan all 3 date dirs
            const dirs = mockedBatchGetSessionFileBirthtimes.mock.calls[0][0] as string[];
            expect(dirs).toHaveLength(3);
        });

        it('should handle session files without session_meta', () => {
            const sessionsDir = path.join(tmpDir, 'sessions');
            (adapter as any).codexSessionsDir = sessionsDir;
            const discoverSessions = (adapter as any).discoverSessions.bind(adapter);

            const dateDir = path.join(sessionsDir, '2026', '03', '18');
            fs.mkdirSync(dateDir, { recursive: true });

            const sessionFile = path.join(dateDir, 'bad.jsonl');
            fs.writeFileSync(sessionFile, JSON.stringify({ type: 'event', payload: {} }));

            mockedBatchGetSessionFileBirthtimes.mockReturnValue([
                { sessionId: 'bad', filePath: sessionFile, projectDir: dateDir, birthtimeMs: 1710800324000, resolvedCwd: '' },
            ]);

            const processes = [
                { pid: 1, command: 'codex', cwd: '/repo', tty: '', startTime: new Date('2026-03-18T15:00:00Z') },
            ];

            const { sessions } = discoverSessions(processes);
            expect(sessions[0].resolvedCwd).toBe('');
        });
    });

    describe('helper methods', () => {
        describe('determineStatus', () => {
            it('should return "waiting" for agent_message events', () => {
                const determineStatus = (adapter as any).determineStatus.bind(adapter);
                expect(determineStatus({
                    lastActive: new Date(),
                    lastPayloadType: 'agent_message',
                })).toBe(AgentStatus.WAITING);
            });

            it('should return "waiting" for task_complete events', () => {
                const determineStatus = (adapter as any).determineStatus.bind(adapter);
                expect(determineStatus({
                    lastActive: new Date(),
                    lastPayloadType: 'task_complete',
                })).toBe(AgentStatus.WAITING);
            });

            it('should return "waiting" for turn_aborted events', () => {
                const determineStatus = (adapter as any).determineStatus.bind(adapter);
                expect(determineStatus({
                    lastActive: new Date(),
                    lastPayloadType: 'turn_aborted',
                })).toBe(AgentStatus.WAITING);
            });

            it('should return "running" for active events', () => {
                const determineStatus = (adapter as any).determineStatus.bind(adapter);
                expect(determineStatus({
                    lastActive: new Date(),
                    lastPayloadType: 'token_count',
                })).toBe(AgentStatus.RUNNING);
            });

            it('should return "idle" when session exceeds threshold', () => {
                const determineStatus = (adapter as any).determineStatus.bind(adapter);
                expect(determineStatus({
                    lastActive: new Date(Date.now() - 10 * 60 * 1000),
                    lastPayloadType: 'token_count',
                })).toBe(AgentStatus.IDLE);
            });
        });

        describe('parseSession', () => {
            let tmpDir: string;

            beforeEach(() => {
                tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'codex-test-'));
            });

            afterEach(() => {
                fs.rmSync(tmpDir, { recursive: true, force: true });
            });

            it('should parse session file with meta and events', () => {
                const parseSession = (adapter as any).parseSession.bind(adapter);
                const filePath = path.join(tmpDir, 'session.jsonl');
                fs.writeFileSync(filePath, [
                    JSON.stringify({ type: 'session_meta', payload: { id: 'sess-1', timestamp: '2026-03-18T15:00:00Z', cwd: '/repo' } }),
                    JSON.stringify({ type: 'event', timestamp: '2026-03-18T15:01:00Z', payload: { type: 'agent_reasoning', message: 'Working on feature' } }),
                ].join('\n'));

                const session = parseSession(undefined, filePath);
                expect(session).toMatchObject({
                    sessionId: 'sess-1',
                    projectPath: '/repo',
                    summary: 'Working on feature',
                    lastPayloadType: 'agent_reasoning',
                });
                expect(session.sessionStart.toISOString()).toBe('2026-03-18T15:00:00.000Z');
            });

            it('should parse from cached content without reading disk', () => {
                const parseSession = (adapter as any).parseSession.bind(adapter);
                const content = [
                    JSON.stringify({ type: 'session_meta', payload: { id: 'cached-1', timestamp: '2026-03-18T15:00:00Z', cwd: '/cached' } }),
                    JSON.stringify({ type: 'event', timestamp: '2026-03-18T15:01:00Z', payload: { type: 'agent_message', message: 'Cached result' } }),
                ].join('\n');

                const session = parseSession(content, '/nonexistent/path.jsonl');
                expect(session).toMatchObject({
                    sessionId: 'cached-1',
                    projectPath: '/cached',
                    summary: 'Cached result',
                });
            });

            it('should return null for non-existent file', () => {
                const parseSession = (adapter as any).parseSession.bind(adapter);
                expect(parseSession(undefined, path.join(tmpDir, 'nonexistent.jsonl'))).toBeNull();
            });

            it('should return null when first line is not session_meta', () => {
                const parseSession = (adapter as any).parseSession.bind(adapter);
                const filePath = path.join(tmpDir, 'bad.jsonl');
                fs.writeFileSync(filePath, JSON.stringify({ type: 'event', payload: {} }));
                expect(parseSession(undefined, filePath)).toBeNull();
            });

            it('should return null when session_meta has no id', () => {
                const parseSession = (adapter as any).parseSession.bind(adapter);
                const filePath = path.join(tmpDir, 'no-id.jsonl');
                fs.writeFileSync(filePath, JSON.stringify({ type: 'session_meta', payload: { cwd: '/repo' } }));
                expect(parseSession(undefined, filePath)).toBeNull();
            });

            it('should extract summary from last event message', () => {
                const parseSession = (adapter as any).parseSession.bind(adapter);
                const filePath = path.join(tmpDir, 'summary.jsonl');
                fs.writeFileSync(filePath, [
                    JSON.stringify({ type: 'session_meta', payload: { id: 'sess-2', timestamp: '2026-03-18T15:00:00Z', cwd: '/repo' } }),
                    JSON.stringify({ type: 'event', timestamp: '2026-03-18T15:01:00Z', payload: { type: 'agent_reasoning', message: 'First message' } }),
                    JSON.stringify({ type: 'event', timestamp: '2026-03-18T15:02:00Z', payload: { type: 'agent_message', message: 'Last message' } }),
                ].join('\n'));

                const session = parseSession(undefined, filePath);
                expect(session.summary).toBe('Last message');
            });

            it('should handle malformed JSON lines gracefully', () => {
                const parseSession = (adapter as any).parseSession.bind(adapter);
                const filePath = path.join(tmpDir, 'malformed.jsonl');
                fs.writeFileSync(filePath, [
                    JSON.stringify({ type: 'session_meta', payload: { id: 'sess-m', timestamp: '2026-03-18T15:00:00Z', cwd: '/repo' } }),
                    'not valid json',
                    '{"incomplete": true',
                    JSON.stringify({ type: 'event', timestamp: '2026-03-18T15:01:00Z', payload: { type: 'agent_message', message: 'Valid message' } }),
                ].join('\n'));

                const session = parseSession(undefined, filePath);
                expect(session).not.toBeNull();
                expect(session.sessionId).toBe('sess-m');
                expect(session.summary).toBe('Valid message');
            });

            it('should default summary when no messages found', () => {
                const parseSession = (adapter as any).parseSession.bind(adapter);
                const filePath = path.join(tmpDir, 'no-msg.jsonl');
                fs.writeFileSync(filePath, [
                    JSON.stringify({ type: 'session_meta', payload: { id: 'sess-3', timestamp: '2026-03-18T15:00:00Z', cwd: '/repo' } }),
                    JSON.stringify({ type: 'event', timestamp: '2026-03-18T15:01:00Z', payload: { type: 'token_count' } }),
                ].join('\n'));

                const session = parseSession(undefined, filePath);
                expect(session.summary).toBe('Codex session active');
            });

            it('should return null for empty content', () => {
                const parseSession = (adapter as any).parseSession.bind(adapter);
                expect(parseSession('', '/fake/path.jsonl')).toBeNull();
                expect(parseSession('   \n  \n  ', '/fake/path.jsonl')).toBeNull();
            });

            it('should truncate long summary to 120 chars', () => {
                const parseSession = (adapter as any).parseSession.bind(adapter);
                const longMsg = 'A'.repeat(200);
                const content = [
                    JSON.stringify({ type: 'session_meta', payload: { id: 'sess-t', timestamp: '2026-03-18T15:00:00Z', cwd: '/repo' } }),
                    JSON.stringify({ type: 'event', timestamp: '2026-03-18T15:01:00Z', payload: { type: 'agent_message', message: longMsg } }),
                ].join('\n');

                const session = parseSession(content, '/fake/path.jsonl');
                expect(session.summary).toHaveLength(120);
                expect(session.summary.endsWith('...')).toBe(true);
            });
        });
    });

    describe('getConversation', () => {
        let tmpDir: string;

        beforeEach(() => {
            tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'codex-conv-'));
        });

        afterEach(() => {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        });

        function writeJsonl(lines: object[]): string {
            const filePath = path.join(tmpDir, 'session.jsonl');
            fs.writeFileSync(filePath, lines.map(l => JSON.stringify(l)).join('\n'));
            return filePath;
        }

        it('should parse user and agent messages', () => {
            const filePath = writeJsonl([
                { type: 'session_meta', payload: { id: 'sess-1', cwd: '/repo', timestamp: '2026-03-27T10:00:00Z' } },
                { type: 'event', timestamp: '2026-03-27T10:00:01Z', payload: { type: 'user_message', message: 'Fix the bug' } },
                { type: 'event', timestamp: '2026-03-27T10:00:05Z', payload: { type: 'agent_message', message: 'I found the issue' } },
            ]);

            const messages = adapter.getConversation(filePath);
            expect(messages).toHaveLength(2);
            expect(messages[0]).toEqual({ role: 'user', content: 'Fix the bug', timestamp: '2026-03-27T10:00:01Z' });
            expect(messages[1]).toEqual({ role: 'assistant', content: 'I found the issue', timestamp: '2026-03-27T10:00:05Z' });
        });

        it('should skip session_meta entry', () => {
            const filePath = writeJsonl([
                { type: 'session_meta', payload: { id: 'sess-1', cwd: '/repo', timestamp: '2026-03-27T10:00:00Z' } },
                { type: 'event', timestamp: '2026-03-27T10:00:01Z', payload: { type: 'user_message', message: 'Hello' } },
            ]);

            const messages = adapter.getConversation(filePath);
            expect(messages).toHaveLength(1);
            expect(messages[0].role).toBe('user');
        });

        it('should map task_complete to assistant role', () => {
            const filePath = writeJsonl([
                { type: 'session_meta', payload: { id: 'sess-1', cwd: '/repo', timestamp: '2026-03-27T10:00:00Z' } },
                { type: 'event', timestamp: '2026-03-27T10:00:05Z', payload: { type: 'task_complete', message: 'Task finished successfully' } },
            ]);

            const messages = adapter.getConversation(filePath);
            expect(messages).toHaveLength(1);
            expect(messages[0].role).toBe('assistant');
            expect(messages[0].content).toBe('Task finished successfully');
        });

        it('should skip non-conversation types in default mode', () => {
            const filePath = writeJsonl([
                { type: 'session_meta', payload: { id: 'sess-1', cwd: '/repo', timestamp: '2026-03-27T10:00:00Z' } },
                { type: 'event', timestamp: '2026-03-27T10:00:01Z', payload: { type: 'user_message', message: 'Hello' } },
                { type: 'event', timestamp: '2026-03-27T10:00:02Z', payload: { type: 'exec_command', message: 'Running npm test' } },
                { type: 'event', timestamp: '2026-03-27T10:00:03Z', payload: { type: 'agent_message', message: 'Done' } },
            ]);

            const messages = adapter.getConversation(filePath);
            expect(messages).toHaveLength(2);
        });

        it('should include non-conversation types as system in verbose mode', () => {
            const filePath = writeJsonl([
                { type: 'session_meta', payload: { id: 'sess-1', cwd: '/repo', timestamp: '2026-03-27T10:00:00Z' } },
                { type: 'event', timestamp: '2026-03-27T10:00:02Z', payload: { type: 'exec_command', message: 'Running npm test' } },
            ]);

            const messages = adapter.getConversation(filePath, { verbose: true });
            expect(messages).toHaveLength(1);
            expect(messages[0].role).toBe('system');
            expect(messages[0].content).toBe('Running npm test');
        });

        it('should handle malformed JSON lines gracefully', () => {
            const filePath = path.join(tmpDir, 'malformed.jsonl');
            fs.writeFileSync(filePath, [
                JSON.stringify({ type: 'session_meta', payload: { id: 'sess-1', cwd: '/repo', timestamp: '2026-03-27T10:00:00Z' } }),
                'invalid json line',
                JSON.stringify({ type: 'event', timestamp: '2026-03-27T10:00:01Z', payload: { type: 'user_message', message: 'Hello' } }),
            ].join('\n'));

            const messages = adapter.getConversation(filePath);
            expect(messages).toHaveLength(1);
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

        it('should skip entries with empty payload message', () => {
            const filePath = writeJsonl([
                { type: 'session_meta', payload: { id: 'sess-1', cwd: '/repo', timestamp: '2026-03-27T10:00:00Z' } },
                { type: 'event', timestamp: '2026-03-27T10:00:01Z', payload: { type: 'user_message', message: '' } },
                { type: 'event', timestamp: '2026-03-27T10:00:02Z', payload: { type: 'agent_message', message: 'Response' } },
            ]);

            const messages = adapter.getConversation(filePath);
            expect(messages).toHaveLength(1);
            expect(messages[0].content).toBe('Response');
        });
    });
});

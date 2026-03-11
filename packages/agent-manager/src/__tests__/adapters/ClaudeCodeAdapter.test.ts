/**
 * Tests for ClaudeCodeAdapter
 */

import * as fs from 'fs';
import * as path from 'path';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { ClaudeCodeAdapter } from '../../adapters/ClaudeCodeAdapter';
import type { AgentInfo, ProcessInfo } from '../../adapters/AgentAdapter';
import { AgentStatus } from '../../adapters/AgentAdapter';
import { listProcesses } from '../../utils/process';

jest.mock('../../utils/process', () => ({
    listProcesses: jest.fn(),
}));

const mockedListProcesses = listProcesses as jest.MockedFunction<typeof listProcesses>;

type PrivateMethod<T extends (...args: never[]) => unknown> = T;

interface AdapterPrivates {
    readSessions: PrivateMethod<(limit: number) => unknown[]>;
}

describe('ClaudeCodeAdapter', () => {
    let adapter: ClaudeCodeAdapter;

    beforeEach(() => {
        adapter = new ClaudeCodeAdapter();
        mockedListProcesses.mockReset();
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
            mockedListProcesses.mockReturnValue([]);

            const agents = await adapter.detectAgents();
            expect(agents).toEqual([]);
        });

        it('should detect agents using mocked process/session data', async () => {
            const processData: ProcessInfo[] = [
                {
                    pid: 12345,
                    command: 'claude --continue',
                    cwd: '/Users/test/my-project',
                    tty: 'ttys001',
                },
            ];

            const sessionData = [
                {
                    sessionId: 'session-1',
                    projectPath: '/Users/test/my-project',
                    slug: 'merry-dog',
                    sessionStart: new Date(),
                    lastActive: new Date(),
                    lastEntryType: 'assistant',
                    isInterrupted: false,
                    lastUserMessage: 'Investigate failing tests in package',
                },
            ];

            mockedListProcesses.mockReturnValue(processData);
            jest.spyOn(adapter as unknown as AdapterPrivates, 'readSessions').mockReturnValue(sessionData);

            const agents = await adapter.detectAgents();

            expect(agents).toHaveLength(1);
            expect(agents[0]).toMatchObject({
                name: 'my-project',
                type: 'claude',
                status: AgentStatus.WAITING,
                pid: 12345,
                projectPath: '/Users/test/my-project',
                sessionId: 'session-1',
                slug: 'merry-dog',
            });
            expect(agents[0].summary).toContain('Investigate failing tests in package');
        });

        it('should include process-only entry when no sessions exist', async () => {
            mockedListProcesses.mockReturnValue([
                {
                    pid: 777,
                    command: 'claude',
                    cwd: '/project/without-session',
                    tty: 'ttys008',
                },
            ]);
            jest.spyOn(adapter as unknown as AdapterPrivates, 'readSessions').mockReturnValue([]);


            const agents = await adapter.detectAgents();
            expect(agents).toHaveLength(1);
            expect(agents[0]).toMatchObject({
                type: 'claude',
                status: AgentStatus.IDLE,
                pid: 777,
                projectPath: '/project/without-session',
                sessionId: 'pid-777',
                summary: 'Unknown',
            });
        });

        it('should not match process to unrelated session from different project', async () => {
            mockedListProcesses.mockReturnValue([
                {
                    pid: 777,
                    command: 'claude',
                    cwd: '/project/without-session',
                    tty: 'ttys008',
                },
            ]);
            jest.spyOn(adapter as unknown as AdapterPrivates, 'readSessions').mockReturnValue([
                {
                    sessionId: 'session-2',
                    projectPath: '/other/project',
                    sessionStart: new Date(),
                    lastActive: new Date(),
                    lastEntryType: 'assistant',
                    isInterrupted: false,
                },
            ]);


            const agents = await adapter.detectAgents();
            expect(agents).toHaveLength(1);
            // Unrelated session should NOT match — falls to process-only
            expect(agents[0]).toMatchObject({
                type: 'claude',
                pid: 777,
                sessionId: 'pid-777',
                projectPath: '/project/without-session',
                status: AgentStatus.IDLE,
            });
        });

        it('should match process in subdirectory to project-root session via parent-child mode', async () => {
            mockedListProcesses.mockReturnValue([
                {
                    pid: 888,
                    command: 'claude',
                    cwd: '/Users/test/my-project/packages/cli',
                    tty: 'ttys009',
                },
            ]);
            jest.spyOn(adapter as unknown as AdapterPrivates, 'readSessions').mockReturnValue([
                {
                    sessionId: 'session-3',
                    projectPath: '/Users/test/my-project',
                    slug: 'gentle-otter',
                    sessionStart: new Date(),
                    lastActive: new Date(),
                    lastEntryType: 'assistant',
                    isInterrupted: false,
                },
            ]);

            const agents = await adapter.detectAgents();
            expect(agents).toHaveLength(1);
            expect(agents[0]).toMatchObject({
                type: 'claude',
                pid: 888,
                sessionId: 'session-3',
                projectPath: '/Users/test/my-project',
            });
        });

        it('should show idle status with Unknown summary for process-only fallback when no sessions exist', async () => {
            mockedListProcesses.mockReturnValue([
                {
                    pid: 97529,
                    command: 'claude',
                    cwd: '/Users/test/my-project/packages/cli',
                    tty: 'ttys021',
                },
            ]);
            jest.spyOn(adapter as unknown as AdapterPrivates, 'readSessions').mockReturnValue([]);

            const agents = await adapter.detectAgents();
            expect(agents).toHaveLength(1);
            expect(agents[0]).toMatchObject({
                type: 'claude',
                pid: 97529,
                projectPath: '/Users/test/my-project/packages/cli',
                sessionId: 'pid-97529',
                summary: 'Unknown',
                status: AgentStatus.IDLE,
            });
        });

        it('should match session via parent-child mode when process cwd is under session project path', async () => {
            mockedListProcesses.mockReturnValue([
                {
                    pid: 97529,
                    command: 'claude',
                    cwd: '/Users/test/my-project/packages/cli',
                    tty: 'ttys021',
                },
            ]);
            jest.spyOn(adapter as unknown as AdapterPrivates, 'readSessions').mockReturnValue([
                {
                    sessionId: 'parent-session',
                    projectPath: '/Users/test/my-project',
                    slug: 'fluffy-brewing-kazoo',
                    sessionStart: new Date('2026-02-23T17:24:50.996Z'),
                    lastActive: new Date('2026-02-23T17:24:50.996Z'),
                    lastEntryType: 'assistant',
                    isInterrupted: false,
                },
            ]);

            const agents = await adapter.detectAgents();
            expect(agents).toHaveLength(1);
            // Session matched via parent-child mode
            expect(agents[0]).toMatchObject({
                type: 'claude',
                pid: 97529,
                sessionId: 'parent-session',
                projectPath: '/Users/test/my-project',
            });
        });

        it('should fall back to process-only when sessions exist but all are used', async () => {
            mockedListProcesses.mockReturnValue([
                {
                    pid: 100,
                    command: 'claude',
                    cwd: '/project-a',
                    tty: 'ttys001',
                },
                {
                    pid: 200,
                    command: 'claude',
                    cwd: '/project-b',
                    tty: 'ttys002',
                },
            ]);
            jest.spyOn(adapter as unknown as AdapterPrivates, 'readSessions').mockReturnValue([
                {
                    sessionId: 'only-session',
                    projectPath: '/project-a',
                    sessionStart: new Date(),
                    lastActive: new Date(),
                    lastEntryType: 'assistant',
                    isInterrupted: false,
                },
            ]);


            const agents = await adapter.detectAgents();
            expect(agents).toHaveLength(2);
            // First process matched via cwd
            expect(agents[0]).toMatchObject({
                pid: 100,
                sessionId: 'only-session',
            });
            // Second process: session used, falls to process-only
            expect(agents[1]).toMatchObject({
                pid: 200,
                sessionId: 'pid-200',
                status: AgentStatus.IDLE,
                summary: 'Unknown',
            });
        });

        it('should handle process with empty cwd in process-only fallback', async () => {
            mockedListProcesses.mockReturnValue([
                {
                    pid: 300,
                    command: 'claude',
                    cwd: '',
                    tty: 'ttys003',
                },
            ]);
            jest.spyOn(adapter as unknown as AdapterPrivates, 'readSessions').mockReturnValue([]);

            const agents = await adapter.detectAgents();
            expect(agents).toHaveLength(1);
            expect(agents[0]).toMatchObject({
                pid: 300,
                sessionId: 'pid-300',
                summary: 'Unknown',
                projectPath: '',
            });
        });

        it('should prefer cwd-matched session over any-mode session', async () => {
            const now = new Date();
            mockedListProcesses.mockReturnValue([
                {
                    pid: 100,
                    command: 'claude',
                    cwd: '/Users/test/project-a',
                    tty: 'ttys001',
                },
            ]);
            jest.spyOn(adapter as unknown as AdapterPrivates, 'readSessions').mockReturnValue([
                {
                    sessionId: 'exact-match',
                    projectPath: '/Users/test/project-a',
                    sessionStart: now,
                    lastActive: now,
                    lastEntryType: 'assistant',
                    isInterrupted: false,
                },
                {
                    sessionId: 'other-project',
                    projectPath: '/Users/test/project-b',
                    sessionStart: now,
                    lastActive: new Date(now.getTime() + 1000), // more recent
                    lastEntryType: 'user',
                    isInterrupted: false,
                },
            ]);


            const agents = await adapter.detectAgents();
            expect(agents).toHaveLength(1);
            expect(agents[0]).toMatchObject({
                sessionId: 'exact-match',
                projectPath: '/Users/test/project-a',
            });
        });
    });

    describe('helper methods', () => {
        describe('determineStatus', () => {
            it('should return "unknown" for sessions with no last entry type', () => {
                const adapter = new ClaudeCodeAdapter();
                const determineStatus = (adapter as any).determineStatus.bind(adapter);

                const session = {
                    sessionId: 'test',
                    projectPath: '/test',
                    sessionStart: new Date(),
                    lastActive: new Date(),
                    isInterrupted: false,
                };

                const status = determineStatus(session);
                expect(status).toBe(AgentStatus.UNKNOWN);
            });

            it('should return "waiting" for assistant entries', () => {
                const adapter = new ClaudeCodeAdapter();
                const determineStatus = (adapter as any).determineStatus.bind(adapter);

                const session = {
                    sessionId: 'test',
                    projectPath: '/test',
                    sessionStart: new Date(),
                    lastActive: new Date(),
                    lastEntryType: 'assistant',
                    isInterrupted: false,
                };

                const status = determineStatus(session);
                expect(status).toBe(AgentStatus.WAITING);
            });

            it('should return "waiting" for user interruption', () => {
                const adapter = new ClaudeCodeAdapter();
                const determineStatus = (adapter as any).determineStatus.bind(adapter);

                const session = {
                    sessionId: 'test',
                    projectPath: '/test',
                    sessionStart: new Date(),
                    lastActive: new Date(),
                    lastEntryType: 'user',
                    isInterrupted: true,
                };

                const status = determineStatus(session);
                expect(status).toBe(AgentStatus.WAITING);
            });

            it('should return "running" for user/progress entries', () => {
                const adapter = new ClaudeCodeAdapter();
                const determineStatus = (adapter as any).determineStatus.bind(adapter);

                const session = {
                    sessionId: 'test',
                    projectPath: '/test',
                    sessionStart: new Date(),
                    lastActive: new Date(),
                    lastEntryType: 'user',
                    isInterrupted: false,
                };

                const status = determineStatus(session);
                expect(status).toBe(AgentStatus.RUNNING);
            });

            it('should not override status based on age (process is running)', () => {
                const adapter = new ClaudeCodeAdapter();
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

                // Even with old lastActive, entry type determines status
                // because the process is known to be running
                const status = determineStatus(session);
                expect(status).toBe(AgentStatus.WAITING);
            });

            it('should return "idle" for system entries', () => {
                const adapter = new ClaudeCodeAdapter();
                const determineStatus = (adapter as any).determineStatus.bind(adapter);

                const session = {
                    sessionId: 'test',
                    projectPath: '/test',
                    sessionStart: new Date(),
                    lastActive: new Date(),
                    lastEntryType: 'system',
                    isInterrupted: false,
                };

                const status = determineStatus(session);
                expect(status).toBe(AgentStatus.IDLE);
            });

            it('should return "running" for thinking entries', () => {
                const adapter = new ClaudeCodeAdapter();
                const determineStatus = (adapter as any).determineStatus.bind(adapter);

                const session = {
                    sessionId: 'test',
                    projectPath: '/test',
                    sessionStart: new Date(),
                    lastActive: new Date(),
                    lastEntryType: 'thinking',
                    isInterrupted: false,
                };

                const status = determineStatus(session);
                expect(status).toBe(AgentStatus.RUNNING);
            });

            it('should return "running" for progress entries', () => {
                const adapter = new ClaudeCodeAdapter();
                const determineStatus = (adapter as any).determineStatus.bind(adapter);

                const session = {
                    sessionId: 'test',
                    projectPath: '/test',
                    sessionStart: new Date(),
                    lastActive: new Date(),
                    lastEntryType: 'progress',
                    isInterrupted: false,
                };

                const status = determineStatus(session);
                expect(status).toBe(AgentStatus.RUNNING);
            });

            it('should return "unknown" for unrecognized entry types', () => {
                const adapter = new ClaudeCodeAdapter();
                const determineStatus = (adapter as any).determineStatus.bind(adapter);

                const session = {
                    sessionId: 'test',
                    projectPath: '/test',
                    sessionStart: new Date(),
                    lastActive: new Date(),
                    lastEntryType: 'some_other_type',
                    isInterrupted: false,
                };

                const status = determineStatus(session);
                expect(status).toBe(AgentStatus.UNKNOWN);
            });
        });

        describe('generateAgentName', () => {
            it('should use project name for first session', () => {
                const adapter = new ClaudeCodeAdapter();
                const generateAgentName = (adapter as any).generateAgentName.bind(adapter);

                const session = {
                    sessionId: 'test-123',
                    projectPath: '/Users/test/my-project',
                    sessionStart: new Date(),
                    lastActive: new Date(),
                    isInterrupted: false,
                };

                const name = generateAgentName(session, []);
                expect(name).toBe('my-project');
            });

            it('should append slug for duplicate projects', () => {
                const adapter = new ClaudeCodeAdapter();
                const generateAgentName = (adapter as any).generateAgentName.bind(adapter);

                const existingAgent: AgentInfo = {
                    name: 'my-project',
                    projectPath: '/Users/test/my-project',
                    type: 'claude',
                    status: AgentStatus.RUNNING,
                    summary: 'Test',
                    pid: 123,
                    sessionId: 'existing-123',
                    slug: 'happy-cat',
                    lastActive: new Date(),
                };

                const session = {
                    sessionId: 'test-456',
                    projectPath: '/Users/test/my-project',
                    slug: 'merry-dog',
                    sessionStart: new Date(),
                    lastActive: new Date(),
                    isInterrupted: false,
                };

                const name = generateAgentName(session, [existingAgent]);
                expect(name).toBe('my-project (merry)');
            });

            it('should use session ID prefix when no slug available', () => {
                const adapter = new ClaudeCodeAdapter();
                const generateAgentName = (adapter as any).generateAgentName.bind(adapter);

                const existingAgent: AgentInfo = {
                    name: 'my-project',
                    projectPath: '/Users/test/my-project',
                    type: 'claude',
                    status: AgentStatus.RUNNING,
                    summary: 'Test',
                    pid: 123,
                    sessionId: 'existing-123',
                    lastActive: new Date(),
                };

                const session = {
                    sessionId: 'abcdef12-3456-7890',
                    projectPath: '/Users/test/my-project',
                    sessionStart: new Date(),
                    lastActive: new Date(),
                    isInterrupted: false,
                };

                const name = generateAgentName(session, [existingAgent]);
                expect(name).toBe('my-project (abcdef12)');
            });
        });

        describe('parseElapsedSeconds', () => {
            it('should parse MM:SS format', () => {
                const adapter = new ClaudeCodeAdapter();
                const parseElapsedSeconds = (adapter as any).parseElapsedSeconds.bind(adapter);

                expect(parseElapsedSeconds('05:30')).toBe(330);
            });

            it('should parse HH:MM:SS format', () => {
                const adapter = new ClaudeCodeAdapter();
                const parseElapsedSeconds = (adapter as any).parseElapsedSeconds.bind(adapter);

                expect(parseElapsedSeconds('02:30:15')).toBe(9015);
            });

            it('should parse D-HH:MM:SS format', () => {
                const adapter = new ClaudeCodeAdapter();
                const parseElapsedSeconds = (adapter as any).parseElapsedSeconds.bind(adapter);

                expect(parseElapsedSeconds('3-12:00:00')).toBe(302400);
            });

            it('should return null for invalid format', () => {
                const adapter = new ClaudeCodeAdapter();
                const parseElapsedSeconds = (adapter as any).parseElapsedSeconds.bind(adapter);

                expect(parseElapsedSeconds('invalid')).toBeNull();
            });
        });

        describe('calculateSessionScanLimit', () => {
            it('should return minimum for small process count', () => {
                const adapter = new ClaudeCodeAdapter();
                const calculateSessionScanLimit = (adapter as any).calculateSessionScanLimit.bind(adapter);

                // 1 process * 4 = 4, min(max(4, 12), 40) = 12
                expect(calculateSessionScanLimit(1)).toBe(12);
            });

            it('should scale with process count', () => {
                const adapter = new ClaudeCodeAdapter();
                const calculateSessionScanLimit = (adapter as any).calculateSessionScanLimit.bind(adapter);

                // 5 processes * 4 = 20, min(max(20, 12), 40) = 20
                expect(calculateSessionScanLimit(5)).toBe(20);
            });

            it('should cap at maximum', () => {
                const adapter = new ClaudeCodeAdapter();
                const calculateSessionScanLimit = (adapter as any).calculateSessionScanLimit.bind(adapter);

                // 15 processes * 4 = 60, min(max(60, 12), 40) = 40
                expect(calculateSessionScanLimit(15)).toBe(40);
            });
        });

        describe('rankCandidatesByStartTime', () => {
            it('should prefer sessions within tolerance window', () => {
                const adapter = new ClaudeCodeAdapter();
                const rankCandidatesByStartTime = (adapter as any).rankCandidatesByStartTime.bind(adapter);

                const processStart = new Date('2026-03-10T10:00:00Z');
                const candidates = [
                    {
                        sessionId: 'far',
                        projectPath: '/test',
                        sessionStart: new Date('2026-03-10T09:50:00Z'), // 10 min diff
                        lastActive: new Date('2026-03-10T10:05:00Z'),
                        isInterrupted: false,
                    },
                    {
                        sessionId: 'close',
                        projectPath: '/test',
                        sessionStart: new Date('2026-03-10T10:00:30Z'), // 30s diff
                        lastActive: new Date('2026-03-10T10:03:00Z'),
                        isInterrupted: false,
                    },
                ];

                const ranked = rankCandidatesByStartTime(candidates, processStart);
                expect(ranked[0].sessionId).toBe('close');
                expect(ranked[1].sessionId).toBe('far');
            });

            it('should prefer recency over diffMs when both within tolerance', () => {
                const adapter = new ClaudeCodeAdapter();
                const rankCandidatesByStartTime = (adapter as any).rankCandidatesByStartTime.bind(adapter);

                const processStart = new Date('2026-03-10T10:00:00Z');
                const candidates = [
                    {
                        sessionId: 'closer-but-stale',
                        projectPath: '/test',
                        sessionStart: new Date('2026-03-10T10:00:06Z'), // 6s diff
                        lastActive: new Date('2026-03-10T10:00:10Z'),  // older activity
                        isInterrupted: false,
                    },
                    {
                        sessionId: 'farther-but-active',
                        projectPath: '/test',
                        sessionStart: new Date('2026-03-10T10:00:45Z'), // 45s diff
                        lastActive: new Date('2026-03-10T10:30:00Z'),  // much more recent
                        isInterrupted: false,
                    },
                ];

                const ranked = rankCandidatesByStartTime(candidates, processStart);
                // Both within tolerance — recency wins over smaller diffMs
                expect(ranked[0].sessionId).toBe('farther-but-active');
                expect(ranked[1].sessionId).toBe('closer-but-stale');
            });

            it('should break ties by recency when outside tolerance with same diffMs', () => {
                const adapter = new ClaudeCodeAdapter();
                const rankCandidatesByStartTime = (adapter as any).rankCandidatesByStartTime.bind(adapter);

                const processStart = new Date('2026-03-10T10:00:00Z');
                const candidates = [
                    {
                        sessionId: 'older-activity',
                        projectPath: '/test',
                        sessionStart: new Date('2026-03-10T09:50:00Z'), // 10min diff
                        lastActive: new Date('2026-03-10T10:01:00Z'),
                        isInterrupted: false,
                    },
                    {
                        sessionId: 'newer-activity',
                        projectPath: '/test',
                        sessionStart: new Date('2026-03-10T10:10:00Z'), // 10min diff (same abs)
                        lastActive: new Date('2026-03-10T10:30:00Z'),
                        isInterrupted: false,
                    },
                ];

                const ranked = rankCandidatesByStartTime(candidates, processStart);
                // Both outside tolerance, same diffMs — recency wins
                expect(ranked[0].sessionId).toBe('newer-activity');
            });

            it('should fall back to recency when both outside tolerance', () => {
                const adapter = new ClaudeCodeAdapter();
                const rankCandidatesByStartTime = (adapter as any).rankCandidatesByStartTime.bind(adapter);

                const processStart = new Date('2026-03-10T10:00:00Z');
                const candidates = [
                    {
                        sessionId: 'older',
                        projectPath: '/test',
                        sessionStart: new Date('2026-03-10T09:30:00Z'),
                        lastActive: new Date('2026-03-10T10:01:00Z'),
                        isInterrupted: false,
                    },
                    {
                        sessionId: 'newer',
                        projectPath: '/test',
                        sessionStart: new Date('2026-03-10T09:40:00Z'),
                        lastActive: new Date('2026-03-10T10:05:00Z'),
                        isInterrupted: false,
                    },
                ];

                const ranked = rankCandidatesByStartTime(candidates, processStart);
                // Both outside tolerance (rank=1), newer has smaller diffMs
                expect(ranked[0].sessionId).toBe('newer');
            });
        });

        describe('filterCandidateSessions', () => {
            it('should match by lastCwd in cwd mode', () => {
                const adapter = new ClaudeCodeAdapter();
                const filterCandidateSessions = (adapter as any).filterCandidateSessions.bind(adapter);

                const processInfo = { pid: 1, command: 'claude', cwd: '/my/project', tty: '' };
                const sessions = [
                    {
                        sessionId: 's1',
                        projectPath: '/different/path',
                        lastCwd: '/my/project',
                        sessionStart: new Date(),
                        lastActive: new Date(),
                        isInterrupted: false,
                    },
                ];

                const result = filterCandidateSessions(processInfo, sessions, new Set(), 'cwd');
                expect(result).toHaveLength(1);
                expect(result[0].sessionId).toBe('s1');
            });

            it('should match sessions with no projectPath in missing-cwd mode', () => {
                const adapter = new ClaudeCodeAdapter();
                const filterCandidateSessions = (adapter as any).filterCandidateSessions.bind(adapter);

                const processInfo = { pid: 1, command: 'claude', cwd: '/my/project', tty: '' };
                const sessions = [
                    {
                        sessionId: 's1',
                        projectPath: '',
                        sessionStart: new Date(),
                        lastActive: new Date(),
                        isInterrupted: false,
                    },
                    {
                        sessionId: 's2',
                        projectPath: '/has/path',
                        sessionStart: new Date(),
                        lastActive: new Date(),
                        isInterrupted: false,
                    },
                ];

                const result = filterCandidateSessions(processInfo, sessions, new Set(), 'missing-cwd');
                expect(result).toHaveLength(1);
                expect(result[0].sessionId).toBe('s1');
            });

            it('should include exact CWD matches in parent-child mode', () => {
                const adapter = new ClaudeCodeAdapter();
                const filterCandidateSessions = (adapter as any).filterCandidateSessions.bind(adapter);

                const processInfo = { pid: 1, command: 'claude', cwd: '/my/project', tty: '' };
                const sessions = [
                    {
                        sessionId: 's1',
                        projectPath: '/my/project',
                        lastCwd: '/my/project',
                        sessionStart: new Date(),
                        lastActive: new Date(),
                        isInterrupted: false,
                    },
                ];

                const result = filterCandidateSessions(processInfo, sessions, new Set(), 'parent-child');
                expect(result).toHaveLength(1);
                expect(result[0].sessionId).toBe('s1');
            });

            it('should match parent-child relationships', () => {
                const adapter = new ClaudeCodeAdapter();
                const filterCandidateSessions = (adapter as any).filterCandidateSessions.bind(adapter);

                const processInfo = { pid: 1, command: 'claude', cwd: '/my/project', tty: '' };
                const sessions = [
                    {
                        sessionId: 'child-session',
                        projectPath: '/my/project/packages/sub',
                        lastCwd: '/my/project/packages/sub',
                        sessionStart: new Date(),
                        lastActive: new Date(),
                        isInterrupted: false,
                    },
                    {
                        sessionId: 'parent-session',
                        projectPath: '/my',
                        lastCwd: '/my',
                        sessionStart: new Date(),
                        lastActive: new Date(),
                        isInterrupted: false,
                    },
                ];

                const result = filterCandidateSessions(processInfo, sessions, new Set(), 'parent-child');
                expect(result).toHaveLength(2);
            });

            it('should skip used sessions', () => {
                const adapter = new ClaudeCodeAdapter();
                const filterCandidateSessions = (adapter as any).filterCandidateSessions.bind(adapter);

                const processInfo = { pid: 1, command: 'claude', cwd: '/my/project', tty: '' };
                const sessions = [
                    {
                        sessionId: 's1',
                        projectPath: '/my/project',
                        sessionStart: new Date(),
                        lastActive: new Date(),
                        isInterrupted: false,
                    },
                ];

                const result = filterCandidateSessions(processInfo, sessions, new Set(['s1']), 'cwd');
                expect(result).toHaveLength(0);
            });
        });

        describe('extractUserMessageText', () => {
            it('should extract plain string content', () => {
                const adapter = new ClaudeCodeAdapter();
                const extract = (adapter as any).extractUserMessageText.bind(adapter);

                expect(extract('hello world')).toBe('hello world');
            });

            it('should extract text from array content blocks', () => {
                const adapter = new ClaudeCodeAdapter();
                const extract = (adapter as any).extractUserMessageText.bind(adapter);

                const content = [
                    { type: 'tool_result', content: 'some result' },
                    { type: 'text', text: 'user question' },
                ];
                expect(extract(content)).toBe('user question');
            });

            it('should return undefined for empty/null content', () => {
                const adapter = new ClaudeCodeAdapter();
                const extract = (adapter as any).extractUserMessageText.bind(adapter);

                expect(extract(undefined)).toBeUndefined();
                expect(extract('')).toBeUndefined();
                expect(extract([])).toBeUndefined();
            });

            it('should parse command-message tags', () => {
                const adapter = new ClaudeCodeAdapter();
                const extract = (adapter as any).extractUserMessageText.bind(adapter);

                const msg = '<command-message><command-name>commit</command-name><command-args>fix bug</command-args></command-message>';
                expect(extract(msg)).toBe('commit fix bug');
            });

            it('should parse command-message without args', () => {
                const adapter = new ClaudeCodeAdapter();
                const extract = (adapter as any).extractUserMessageText.bind(adapter);

                const msg = '<command-message><command-name>help</command-name></command-message>';
                expect(extract(msg)).toBe('help');
            });

            it('should extract ARGUMENTS from skill expansion', () => {
                const adapter = new ClaudeCodeAdapter();
                const extract = (adapter as any).extractUserMessageText.bind(adapter);

                const msg = 'Base directory for this skill: /some/path\n\nSome instructions\n\nARGUMENTS: implement the feature';
                expect(extract(msg)).toBe('implement the feature');
            });

            it('should return undefined for skill expansion without ARGUMENTS', () => {
                const adapter = new ClaudeCodeAdapter();
                const extract = (adapter as any).extractUserMessageText.bind(adapter);

                const msg = 'Base directory for this skill: /some/path\n\nSome instructions only';
                expect(extract(msg)).toBeUndefined();
            });

            it('should filter noise messages', () => {
                const adapter = new ClaudeCodeAdapter();
                const extract = (adapter as any).extractUserMessageText.bind(adapter);

                expect(extract('[Request interrupted by user]')).toBeUndefined();
                expect(extract('Tool loaded.')).toBeUndefined();
                expect(extract('This session is being continued from a previous conversation')).toBeUndefined();
            });
        });

        describe('parseCommandMessage', () => {
            it('should return undefined for malformed command-message', () => {
                const adapter = new ClaudeCodeAdapter();
                const parse = (adapter as any).parseCommandMessage.bind(adapter);

                expect(parse('<command-message>no tags</command-message>')).toBeUndefined();
            });
        });
    });

    describe('selectBestSession', () => {
            it('should defer in cwd mode when best candidate is outside tolerance', () => {
                const adapter = new ClaudeCodeAdapter();
                const selectBestSession = (adapter as any).selectBestSession.bind(adapter);

                const processInfo = { pid: 1, command: 'claude', cwd: '/my/project', tty: '' };
                const processStart = new Date('2026-03-10T10:00:00Z');
                const processStartByPid = new Map([[1, processStart]]);

                const sessions = [
                    {
                        sessionId: 'stale-exact-cwd',
                        projectPath: '/my/project',
                        lastCwd: '/my/project',
                        sessionStart: new Date('2026-03-07T10:00:00Z'), // 3 days old — outside tolerance
                        lastActive: new Date('2026-03-10T10:05:00Z'),
                        isInterrupted: false,
                    },
                ];

                // In cwd mode, should defer (return undefined) because outside tolerance
                const cwdResult = selectBestSession(processInfo, sessions, new Set(), processStartByPid, 'cwd');
                expect(cwdResult).toBeUndefined();

                // In parent-child mode, should accept the same candidate (no tolerance gate)
                const parentChildResult = selectBestSession(processInfo, sessions, new Set(), processStartByPid, 'parent-child');
                expect(parentChildResult).toBeDefined();
                expect(parentChildResult.sessionId).toBe('stale-exact-cwd');
            });

            it('should fall back to recency when no processStart available', () => {
                const adapter = new ClaudeCodeAdapter();
                const selectBestSession = (adapter as any).selectBestSession.bind(adapter);

                const processInfo = { pid: 1, command: 'claude', cwd: '/my/project', tty: '' };
                const processStartByPid = new Map<number, Date>(); // empty — no start time

                const sessions = [
                    {
                        sessionId: 'older',
                        projectPath: '/my/project',
                        lastCwd: '/my/project',
                        sessionStart: new Date('2026-03-10T09:00:00Z'),
                        lastActive: new Date('2026-03-10T09:30:00Z'),
                        isInterrupted: false,
                    },
                    {
                        sessionId: 'newer',
                        projectPath: '/my/project',
                        lastCwd: '/my/project',
                        sessionStart: new Date('2026-03-10T10:00:00Z'),
                        lastActive: new Date('2026-03-10T10:30:00Z'),
                        isInterrupted: false,
                    },
                ];

                const result = selectBestSession(processInfo, sessions, new Set(), processStartByPid, 'cwd');
                expect(result).toBeDefined();
                expect(result.sessionId).toBe('newer');
            });

            it('should accept in cwd mode when best candidate is within tolerance', () => {
                const adapter = new ClaudeCodeAdapter();
                const selectBestSession = (adapter as any).selectBestSession.bind(adapter);

                const processInfo = { pid: 1, command: 'claude', cwd: '/my/project', tty: '' };
                const processStart = new Date('2026-03-10T10:00:00Z');
                const processStartByPid = new Map([[1, processStart]]);

                const sessions = [
                    {
                        sessionId: 'fresh-exact-cwd',
                        projectPath: '/my/project',
                        lastCwd: '/my/project',
                        sessionStart: new Date('2026-03-10T10:00:30Z'), // 30s — within tolerance
                        lastActive: new Date('2026-03-10T10:05:00Z'),
                        isInterrupted: false,
                    },
                ];

                const result = selectBestSession(processInfo, sessions, new Set(), processStartByPid, 'cwd');
                expect(result).toBeDefined();
                expect(result.sessionId).toBe('fresh-exact-cwd');
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
                const adapter = new ClaudeCodeAdapter();
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
                const adapter = new ClaudeCodeAdapter();
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
                const adapter = new ClaudeCodeAdapter();
                const readSession = (adapter as any).readSession.bind(adapter);

                const filePath = path.join(tmpDir, 'empty.jsonl');
                fs.writeFileSync(filePath, '');

                const session = readSession(filePath, '/test');
                // Empty file content trims to '' which splits to [''] — no valid entries parsed
                expect(session).not.toBeNull();
                expect(session.lastEntryType).toBeUndefined();
                expect(session.slug).toBeUndefined();
            });

            it('should return null for non-existent file', () => {
                const adapter = new ClaudeCodeAdapter();
                const readSession = (adapter as any).readSession.bind(adapter);

                expect(readSession(path.join(tmpDir, 'nonexistent.jsonl'), '/test')).toBeNull();
            });

            it('should skip metadata entry types for lastEntryType', () => {
                const adapter = new ClaudeCodeAdapter();
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
                // lastEntryType should be 'assistant', not 'last-prompt' or 'file-history-snapshot'
                expect(session.lastEntryType).toBe('assistant');
            });

            it('should parse snapshot.timestamp from file-history-snapshot first entry', () => {
                const adapter = new ClaudeCodeAdapter();
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
                // sessionStart should come from snapshot.timestamp, not lastActive
                expect(session.sessionStart.toISOString()).toBe('2026-03-10T09:55:00.000Z');
                expect(session.lastActive.toISOString()).toBe('2026-03-10T10:01:00.000Z');
            });

            it('should extract lastUserMessage from session entries', () => {
                const adapter = new ClaudeCodeAdapter();
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
                // Last user message should be the most recent one
                expect(session.lastUserMessage).toBe('second question');
            });

            it('should use lastCwd as projectPath when projectPath is empty', () => {
                const adapter = new ClaudeCodeAdapter();
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
                const adapter = new ClaudeCodeAdapter();
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

        describe('findSessionFiles', () => {
            it('should return empty when projects dir does not exist', () => {
                const adapter = new ClaudeCodeAdapter();
                (adapter as any).projectsDir = path.join(tmpDir, 'nonexistent');
                const findSessionFiles = (adapter as any).findSessionFiles.bind(adapter);

                expect(findSessionFiles(10)).toEqual([]);
            });

            it('should find and sort session files by mtime', () => {
                const adapter = new ClaudeCodeAdapter();
                const projectsDir = path.join(tmpDir, 'projects');
                (adapter as any).projectsDir = projectsDir;
                const findSessionFiles = (adapter as any).findSessionFiles.bind(adapter);

                // Create project dir with sessions-index.json and JSONL files
                const projDir = path.join(projectsDir, 'encoded-path');
                fs.mkdirSync(projDir, { recursive: true });
                fs.writeFileSync(
                    path.join(projDir, 'sessions-index.json'),
                    JSON.stringify({ originalPath: '/my/project' }),
                );

                const file1 = path.join(projDir, 'session-old.jsonl');
                const file2 = path.join(projDir, 'session-new.jsonl');
                fs.writeFileSync(file1, '{}');
                // Ensure different mtime
                const past = new Date(Date.now() - 10000);
                fs.utimesSync(file1, past, past);
                fs.writeFileSync(file2, '{}');

                const files = findSessionFiles(10);
                expect(files).toHaveLength(2);
                // Sorted by mtime desc — new first
                expect(files[0].filePath).toContain('session-new');
                expect(files[0].projectPath).toBe('/my/project');
                expect(files[1].filePath).toContain('session-old');
            });

            it('should respect scan limit', () => {
                const adapter = new ClaudeCodeAdapter();
                const projectsDir = path.join(tmpDir, 'projects');
                (adapter as any).projectsDir = projectsDir;
                const findSessionFiles = (adapter as any).findSessionFiles.bind(adapter);

                const projDir = path.join(projectsDir, 'proj');
                fs.mkdirSync(projDir, { recursive: true });
                fs.writeFileSync(
                    path.join(projDir, 'sessions-index.json'),
                    JSON.stringify({ originalPath: '/proj' }),
                );

                for (let i = 0; i < 5; i++) {
                    fs.writeFileSync(path.join(projDir, `session-${i}.jsonl`), '{}');
                }

                const files = findSessionFiles(3);
                expect(files).toHaveLength(3);
            });

            it('should skip directories starting with dot', () => {
                const adapter = new ClaudeCodeAdapter();
                const projectsDir = path.join(tmpDir, 'projects');
                (adapter as any).projectsDir = projectsDir;
                const findSessionFiles = (adapter as any).findSessionFiles.bind(adapter);

                const hiddenDir = path.join(projectsDir, '.hidden');
                fs.mkdirSync(hiddenDir, { recursive: true });
                fs.writeFileSync(
                    path.join(hiddenDir, 'sessions-index.json'),
                    JSON.stringify({ originalPath: '/hidden' }),
                );
                fs.writeFileSync(path.join(hiddenDir, 'session.jsonl'), '{}');

                const files = findSessionFiles(10);
                expect(files).toEqual([]);
            });

            it('should include project dirs without sessions-index.json using empty projectPath', () => {
                const adapter = new ClaudeCodeAdapter();
                const projectsDir = path.join(tmpDir, 'projects');
                (adapter as any).projectsDir = projectsDir;
                const findSessionFiles = (adapter as any).findSessionFiles.bind(adapter);

                const projDir = path.join(projectsDir, 'no-index');
                fs.mkdirSync(projDir, { recursive: true });
                fs.writeFileSync(path.join(projDir, 'session.jsonl'), '{}');

                const files = findSessionFiles(10);
                expect(files).toHaveLength(1);
                expect(files[0].projectPath).toBe('');
                expect(files[0].filePath).toContain('session.jsonl');
            });
        });

        describe('readSessions', () => {
            it('should parse valid sessions and skip invalid ones', () => {
                const adapter = new ClaudeCodeAdapter();
                const projectsDir = path.join(tmpDir, 'projects');
                (adapter as any).projectsDir = projectsDir;
                const readSessions = (adapter as any).readSessions.bind(adapter);

                const projDir = path.join(projectsDir, 'proj');
                fs.mkdirSync(projDir, { recursive: true });
                fs.writeFileSync(
                    path.join(projDir, 'sessions-index.json'),
                    JSON.stringify({ originalPath: '/my/project' }),
                );

                // Valid session
                fs.writeFileSync(
                    path.join(projDir, 'valid.jsonl'),
                    JSON.stringify({ type: 'assistant', timestamp: '2026-03-10T10:00:00Z' }),
                );
                // Empty session (will return null from readSession)
                fs.writeFileSync(path.join(projDir, 'empty.jsonl'), '');

                const sessions = readSessions(10);
                expect(sessions).toHaveLength(2);
                // Both are valid (empty file still produces a session with defaults)
                const validSession = sessions.find((s: any) => s.sessionId === 'valid');
                expect(validSession).toBeDefined();
                expect(validSession.lastEntryType).toBe('assistant');
            });
        });
    });
});

/**
 * Tests for ClaudeCodeAdapter
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
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
    readSessions: PrivateMethod<() => unknown[]>;
    readHistory: PrivateMethod<() => unknown[]>;
}

describe('ClaudeCodeAdapter', () => {
    let adapter: ClaudeCodeAdapter;

    beforeEach(() => {
        adapter = new ClaudeCodeAdapter();
        mockedListProcesses.mockReset();
    });

    describe('initialization', () => {
        it('should create adapter with correct type', () => {
            expect(adapter.type).toBe('Claude Code');
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

        it('should return true for processes with "claude" in command (case-insensitive)', () => {
            const processInfo = {
                pid: 12345,
                command: '/usr/local/bin/CLAUDE --some-flag',
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
    });

    describe('detectAgents', () => {
        it('should return empty array if no claude processes running', async () => {
            mockedListProcesses.mockReturnValue([]);

            const agents = await adapter.detectAgents();
            expect(agents).toEqual([]);
        });

        it('should detect agents using mocked process/session/history data', async () => {
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
                    sessionLogPath: '/mock/path/session-1.jsonl',
                    slug: 'merry-dog',
                    lastEntry: { type: 'assistant' },
                    lastActive: new Date(),
                },
            ];

            const historyData = [
                {
                    display: 'Investigate failing tests in package',
                    timestamp: Date.now(),
                    project: '/Users/test/my-project',
                    sessionId: 'session-1',
                },
            ];

            mockedListProcesses.mockReturnValue(processData);
            jest.spyOn(adapter as unknown as AdapterPrivates, 'readSessions').mockReturnValue(sessionData);
            jest.spyOn(adapter as unknown as AdapterPrivates, 'readHistory').mockReturnValue(historyData);

            const agents = await adapter.detectAgents();

            expect(agents).toHaveLength(1);
            expect(agents[0]).toMatchObject({
                name: 'my-project',
                type: 'Claude Code',
                status: AgentStatus.WAITING,
                pid: 12345,
                projectPath: '/Users/test/my-project',
                sessionId: 'session-1',
                slug: 'merry-dog',
            });
            expect(agents[0].summary).toContain('Investigate failing tests in package');
        });

        it('should return empty list when process cwd has no matching session', async () => {
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
                    sessionLogPath: '/mock/path/session-2.jsonl',
                    lastEntry: { type: 'assistant' },
                    lastActive: new Date(),
                },
            ]);
            jest.spyOn(adapter as unknown as AdapterPrivates, 'readHistory').mockReturnValue([]);

            const agents = await adapter.detectAgents();
            expect(agents).toEqual([]);
        });
    });

    describe('helper methods', () => {
        describe('truncateSummary', () => {
            it('should truncate long summaries', () => {
                const adapter = new ClaudeCodeAdapter();

                const truncate = (adapter as any).truncateSummary.bind(adapter);

                const longSummary = 'This is a very long summary that should be truncated';
                const result = truncate(longSummary, 20);

                expect(result.length).toBeLessThanOrEqual(20);
                expect(result).toContain('...');
            });

            it('should not truncate short summaries', () => {
                const adapter = new ClaudeCodeAdapter();
                const truncate = (adapter as any).truncateSummary.bind(adapter);

                const shortSummary = 'Short';
                const result = truncate(shortSummary, 20);

                expect(result).toBe(shortSummary);
            });
        });

        describe('getRelativeTime', () => {
            it('should return "just now" for very recent dates', () => {
                const adapter = new ClaudeCodeAdapter();
                const getRelativeTime = (adapter as any).getRelativeTime.bind(adapter);

                const now = new Date();
                const result = getRelativeTime(now);

                expect(result).toBe('just now');
            });

            it('should return minutes for recent dates', () => {
                const adapter = new ClaudeCodeAdapter();
                const getRelativeTime = (adapter as any).getRelativeTime.bind(adapter);

                const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
                const result = getRelativeTime(fiveMinutesAgo);

                expect(result).toMatch(/^\d+m ago$/);
            });

            it('should return hours for older dates', () => {
                const adapter = new ClaudeCodeAdapter();
                const getRelativeTime = (adapter as any).getRelativeTime.bind(adapter);

                const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
                const result = getRelativeTime(twoHoursAgo);

                expect(result).toMatch(/^\d+h ago$/);
            });

            it('should return days for very old dates', () => {
                const adapter = new ClaudeCodeAdapter();
                const getRelativeTime = (adapter as any).getRelativeTime.bind(adapter);

                const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
                const result = getRelativeTime(twoDaysAgo);

                expect(result).toMatch(/^\d+d ago$/);
            });
        });

        describe('determineStatus', () => {
            it('should return "unknown" for sessions with no last entry', () => {
                const adapter = new ClaudeCodeAdapter();
                const determineStatus = (adapter as any).determineStatus.bind(adapter);

                const session = {
                    sessionId: 'test',
                    projectPath: '/test',
                    sessionLogPath: '/test/log',
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
                    sessionLogPath: '/test/log',
                    lastEntry: { type: 'assistant' },
                    lastActive: new Date(),
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
                    sessionLogPath: '/test/log',
                    lastEntry: {
                        type: 'user',
                        message: {
                            content: [{ type: 'text', text: '[Request interrupted by user for tool use]' }],
                        },
                    },
                    lastActive: new Date(),
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
                    sessionLogPath: '/test/log',
                    lastEntry: { type: 'user' },
                    lastActive: new Date(),
                };

                const status = determineStatus(session);
                expect(status).toBe(AgentStatus.RUNNING);
            });

            it('should return "idle" for old sessions', () => {
                const adapter = new ClaudeCodeAdapter();
                const determineStatus = (adapter as any).determineStatus.bind(adapter);

                const oldDate = new Date(Date.now() - 10 * 60 * 1000);

                const session = {
                    sessionId: 'test',
                    projectPath: '/test',
                    sessionLogPath: '/test/log',
                    lastEntry: { type: 'assistant' },
                    lastActive: oldDate,
                };

                const status = determineStatus(session);
                expect(status).toBe(AgentStatus.IDLE);
            });
        });

        describe('generateAgentName', () => {
            it('should use project name for first session', () => {
                const adapter = new ClaudeCodeAdapter();
                const generateAgentName = (adapter as any).generateAgentName.bind(adapter);

                const session = {
                    sessionId: 'test-123',
                    projectPath: '/Users/test/my-project',
                    sessionLogPath: '/test/log',
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
                    type: 'Claude Code',
                    status: AgentStatus.RUNNING,
                    statusDisplay: '🟢 run',
                    summary: 'Test',
                    pid: 123,
                    sessionId: 'existing-123',
                    slug: 'happy-cat',
                    lastActive: new Date(),
                    lastActiveDisplay: 'just now',
                };

                const session = {
                    sessionId: 'test-456',
                    projectPath: '/Users/test/my-project',
                    sessionLogPath: '/test/log',
                    slug: 'merry-dog',
                };

                const name = generateAgentName(session, [existingAgent]);
                expect(name).toBe('my-project (merry)');
            });
        });
    });
});

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
                type: 'claude',
                status: AgentStatus.WAITING,
                pid: 12345,
                projectPath: '/Users/test/my-project',
                sessionId: 'session-1',
                slug: 'merry-dog',
            });
            expect(agents[0].summary).toContain('Investigate failing tests in package');
        });

        it('should include process-only entry when process cwd has no matching session', async () => {
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
            expect(agents).toHaveLength(1);
            expect(agents[0]).toMatchObject({
                type: 'claude',
                status: AgentStatus.RUNNING,
                pid: 777,
                projectPath: '/project/without-session',
                sessionId: 'pid-777',
                summary: 'Claude process running',
            });
        });

        it('should match process in subdirectory to project-root session', async () => {
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
                    sessionLogPath: '/mock/path/session-3.jsonl',
                    slug: 'gentle-otter',
                    lastEntry: { type: 'assistant' },
                    lastActive: new Date(),
                },
            ]);
            jest.spyOn(adapter as unknown as AdapterPrivates, 'readHistory').mockReturnValue([
                {
                    display: 'Refactor CLI command flow',
                    timestamp: Date.now(),
                    project: '/Users/test/my-project',
                    sessionId: 'session-3',
                },
            ]);

            const agents = await adapter.detectAgents();
            expect(agents).toHaveLength(1);
            expect(agents[0]).toMatchObject({
                type: 'claude',
                pid: 888,
                sessionId: 'session-3',
                projectPath: '/Users/test/my-project',
                summary: 'Refactor CLI command flow',
            });
        });

        it('should use latest history entry for process-only fallback session id', async () => {
            mockedListProcesses.mockReturnValue([
                {
                    pid: 97529,
                    command: 'claude',
                    cwd: '/Users/test/my-project/packages/cli',
                    tty: 'ttys021',
                },
            ]);
            jest.spyOn(adapter as unknown as AdapterPrivates, 'readSessions').mockReturnValue([]);
            jest.spyOn(adapter as unknown as AdapterPrivates, 'readHistory').mockReturnValue([
                {
                    display: '/status',
                    timestamp: 1772122701536,
                    project: '/Users/test/my-project/packages/cli',
                    sessionId: '69237415-b0c3-4990-ba53-15882616509e',
                },
            ]);

            const agents = await adapter.detectAgents();
            expect(agents).toHaveLength(1);
            expect(agents[0]).toMatchObject({
                type: 'claude',
                pid: 97529,
                projectPath: '/Users/test/my-project/packages/cli',
                sessionId: '69237415-b0c3-4990-ba53-15882616509e',
                summary: '/status',
                status: AgentStatus.RUNNING,
            });
            expect(agents[0].lastActive.toISOString()).toBe('2026-02-26T16:18:21.536Z');
        });

        it('should prefer exact-cwd history session over parent-project session match', async () => {
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
                    sessionId: 'old-parent-session',
                    projectPath: '/Users/test/my-project',
                    sessionLogPath: '/mock/path/old-parent-session.jsonl',
                    slug: 'fluffy-brewing-kazoo',
                    lastEntry: { type: 'assistant' },
                    lastActive: new Date('2026-02-23T17:24:50.996Z'),
                },
            ]);
            jest.spyOn(adapter as unknown as AdapterPrivates, 'readHistory').mockReturnValue([
                {
                    display: '/status',
                    timestamp: 1772122701536,
                    project: '/Users/test/my-project/packages/cli',
                    sessionId: '69237415-b0c3-4990-ba53-15882616509e',
                },
            ]);

            const agents = await adapter.detectAgents();
            expect(agents).toHaveLength(1);
            expect(agents[0]).toMatchObject({
                type: 'claude',
                pid: 97529,
                sessionId: '69237415-b0c3-4990-ba53-15882616509e',
                projectPath: '/Users/test/my-project/packages/cli',
                summary: '/status',
            });
        });
    });

    describe('helper methods', () => {
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
                    sessionLogPath: '/test/log',
                    slug: 'merry-dog',
                };

                const name = generateAgentName(session, [existingAgent]);
                expect(name).toBe('my-project (merry)');
            });
        });
    });
});

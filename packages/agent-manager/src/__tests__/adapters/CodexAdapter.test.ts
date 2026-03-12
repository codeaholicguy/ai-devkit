import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { CodexAdapter } from '../../adapters/CodexAdapter';
import type { ProcessInfo } from '../../adapters/AgentAdapter';
import { AgentStatus } from '../../adapters/AgentAdapter';
import { listProcesses } from '../../utils/process';

jest.mock('../../utils/process', () => ({
    listProcesses: jest.fn(),
}));

const mockedListProcesses = listProcesses as jest.MockedFunction<typeof listProcesses>;

interface MockSession {
    sessionId: string;
    projectPath: string;
    summary: string;
    sessionStart?: Date;
    lastActive: Date;
    lastPayloadType?: string;
}

describe('CodexAdapter', () => {
    let adapter: CodexAdapter;

    beforeEach(() => {
        adapter = new CodexAdapter();
        mockedListProcesses.mockReset();
    });

    it('should expose codex type', () => {
        expect(adapter.type).toBe('codex');
    });

    it('should match codex commands in canHandle', () => {
        expect(
            adapter.canHandle({
                pid: 1,
                command: 'codex',
                cwd: '/repo',
                tty: 'ttys001',
            }),
        ).toBe(true);

        expect(
            adapter.canHandle({
                pid: 2,
                command: '/usr/local/bin/CODEX --sandbox workspace-write',
                cwd: '/repo',
                tty: 'ttys002',
            }),
        ).toBe(true);

        expect(
            adapter.canHandle({
                pid: 4,
                command: 'node /worktrees/feature-codex-adapter-agent-manager-package/node_modules/nx/src/daemon/server/start.js',
                cwd: '/repo',
                tty: 'ttys004',
            }),
        ).toBe(false);

        expect(
            adapter.canHandle({
                pid: 3,
                command: 'node app.js',
                cwd: '/repo',
                tty: 'ttys003',
            }),
        ).toBe(false);
    });

    it('should return empty list when no codex process is running', async () => {
        mockedListProcesses.mockReturnValue([]);

        const agents = await adapter.detectAgents();
        expect(agents).toEqual([]);
    });

    it('should map active codex sessions to matching processes by cwd', async () => {
        mockedListProcesses.mockReturnValue([
            { pid: 100, command: 'codex', cwd: '/repo-a', tty: 'ttys001' },
        ] as ProcessInfo[]);

        jest.spyOn(adapter as any, 'readSessions').mockReturnValue([
            {
                sessionId: 'abc12345-session',
                projectPath: '/repo-a',
                summary: 'Implement adapter flow',
                sessionStart: new Date('2026-02-26T15:00:00.000Z'),
                lastActive: new Date(),
                lastPayloadType: 'token_count',
            } as MockSession,
        ]);

        const agents = await adapter.detectAgents();
        expect(agents).toHaveLength(1);
        expect(agents[0]).toMatchObject({
            name: 'repo-a',
            type: 'codex',
            status: AgentStatus.RUNNING,
            summary: 'Implement adapter flow',
            pid: 100,
            projectPath: '/repo-a',
            sessionId: 'abc12345-session',
        });
    });

    it('should still map sessions with task_complete as waiting when process is running', async () => {
        mockedListProcesses.mockReturnValue([
            { pid: 101, command: 'codex', cwd: '/repo-b', tty: 'ttys001' },
        ] as ProcessInfo[]);

        jest.spyOn(adapter as any, 'readSessions').mockReturnValue([
            {
                sessionId: 'ended-1111',
                projectPath: '/repo-b',
                summary: 'Ended turn but process still alive',
                sessionStart: new Date('2026-02-26T15:00:00.000Z'),
                lastActive: new Date(),
                lastPayloadType: 'task_complete',
            } as MockSession,
        ]);

        const agents = await adapter.detectAgents();
        expect(agents).toHaveLength(1);
        expect(agents[0].sessionId).toBe('ended-1111');
        expect(agents[0].status).toBe(AgentStatus.WAITING);
    });

    it('should use codex-session-id-prefix fallback name when cwd is missing', async () => {
        mockedListProcesses.mockReturnValue([
            { pid: 102, command: 'codex', cwd: '', tty: 'ttys009' },
        ] as ProcessInfo[]);

        jest.spyOn(adapter as any, 'readSessions').mockReturnValue([
            {
                sessionId: 'abcdef123456',
                projectPath: '',
                summary: 'No cwd available',
                sessionStart: new Date('2026-02-26T15:00:00.000Z'),
                lastActive: new Date(),
                lastPayloadType: 'agent_reasoning',
            } as MockSession,
        ]);

        const agents = await adapter.detectAgents();
        expect(agents).toHaveLength(1);
        expect(agents[0].name).toBe('codex-abcdef12');
    });

    it('should report waiting status for recent agent_message events', async () => {
        mockedListProcesses.mockReturnValue([
            { pid: 103, command: 'codex', cwd: '/repo-c', tty: 'ttys010' },
        ] as ProcessInfo[]);

        jest.spyOn(adapter as any, 'readSessions').mockReturnValue([
            {
                sessionId: 'waiting-1234',
                projectPath: '/repo-c',
                summary: 'Waiting',
                sessionStart: new Date('2026-02-26T15:00:00.000Z'),
                lastActive: new Date(),
                lastPayloadType: 'agent_message',
            } as MockSession,
        ]);

        const agents = await adapter.detectAgents();
        expect(agents).toHaveLength(1);
        expect(agents[0].status).toBe(AgentStatus.WAITING);
    });

    it('should report idle status when session exceeds shared threshold', async () => {
        mockedListProcesses.mockReturnValue([
            { pid: 104, command: 'codex', cwd: '/repo-d', tty: 'ttys011' },
        ] as ProcessInfo[]);

        jest.spyOn(adapter as any, 'readSessions').mockReturnValue([
            {
                sessionId: 'idle-5678',
                projectPath: '/repo-d',
                summary: 'Idle',
                sessionStart: new Date('2026-02-26T15:00:00.000Z'),
                lastActive: new Date(Date.now() - 10 * 60 * 1000),
                lastPayloadType: 'token_count',
            } as MockSession,
        ]);

        const agents = await adapter.detectAgents();
        expect(agents).toHaveLength(1);
        expect(agents[0].status).toBe(AgentStatus.IDLE);
    });

    it('should list unmatched running codex process even when no session matches', async () => {
        mockedListProcesses.mockReturnValue([
            { pid: 105, command: 'codex', cwd: '/repo-x', tty: 'ttys012' },
        ] as ProcessInfo[]);

        jest.spyOn(adapter as any, 'readSessions').mockReturnValue([
            {
                sessionId: 'other-session',
                projectPath: '/repo-y',
                summary: 'Other repo',
                sessionStart: new Date('2026-02-26T15:00:00.000Z'),
                lastActive: new Date(),
                lastPayloadType: 'agent_message',
            } as MockSession,
        ]);

        const agents = await adapter.detectAgents();
        expect(agents).toHaveLength(1);
        expect(agents[0]).toMatchObject({
            pid: 105,
            name: 'repo-x',
            summary: 'Codex process running',
            projectPath: '/repo-x',
        });
        expect(agents[0].sessionId).toBe('pid-105');
    });

    it('should list process when session metadata is unavailable', async () => {
        mockedListProcesses.mockReturnValue([
            { pid: 106, command: 'codex', cwd: '/repo-z', tty: 'ttys013' },
        ] as ProcessInfo[]);
        jest.spyOn(adapter as any, 'readSessions').mockReturnValue([]);

        const agents = await adapter.detectAgents();
        expect(agents).toHaveLength(1);
        expect(agents[0].pid).toBe(106);
        expect(agents[0].summary).toContain('No Codex session metadata');
    });

    it('should choose same-cwd session closest to process start time', async () => {
        mockedListProcesses.mockReturnValue([
            { pid: 107, command: 'codex', cwd: '/repo-time', tty: 'ttys014' },
        ] as ProcessInfo[]);

        jest.spyOn(adapter as any, 'readSessions').mockReturnValue([
            {
                sessionId: 'far-session',
                projectPath: '/repo-time',
                summary: 'Far start time',
                sessionStart: new Date('2026-02-26T14:00:00.000Z'),
                lastActive: new Date('2026-02-26T15:10:00.000Z'),
                lastPayloadType: 'agent_message',
            } as MockSession,
            {
                sessionId: 'near-session',
                projectPath: '/repo-time',
                summary: 'Near start time',
                sessionStart: new Date('2026-02-26T15:00:20.000Z'),
                lastActive: new Date('2026-02-26T15:11:00.000Z'),
                lastPayloadType: 'agent_message',
            } as MockSession,
        ]);
        jest.spyOn(adapter as any, 'getProcessStartTimes').mockReturnValue(
            new Map([[107, new Date('2026-02-26T15:00:00.000Z')]]),
        );

        const agents = await adapter.detectAgents();
        expect(agents).toHaveLength(1);
        expect(agents[0].sessionId).toBe('near-session');
    });

    it('should prefer missing-cwd session before any-session fallback for unmatched process', async () => {
        mockedListProcesses.mockReturnValue([
            { pid: 108, command: 'codex', cwd: '/repo-missing-cwd', tty: 'ttys015' },
        ] as ProcessInfo[]);

        jest.spyOn(adapter as any, 'readSessions').mockReturnValue([
            {
                sessionId: 'any-session',
                projectPath: '/another-repo',
                summary: 'Any session fallback',
                sessionStart: new Date('2026-02-26T15:00:00.000Z'),
                lastActive: new Date('2026-02-26T15:12:00.000Z'),
                lastPayloadType: 'agent_message',
            } as MockSession,
            {
                sessionId: 'missing-cwd-session',
                projectPath: '',
                summary: 'Missing cwd session',
                sessionStart: new Date('2026-02-26T15:00:10.000Z'),
                lastActive: new Date('2026-02-26T15:11:00.000Z'),
                lastPayloadType: 'agent_message',
            } as MockSession,
        ]);
        jest.spyOn(adapter as any, 'getProcessStartTimes').mockReturnValue(
            new Map([[108, new Date('2026-02-26T15:00:00.000Z')]]),
        );

        const agents = await adapter.detectAgents();
        expect(agents).toHaveLength(1);
        expect(agents[0].sessionId).toBe('missing-cwd-session');
    });

    it('should not reuse the same session for multiple running processes', async () => {
        mockedListProcesses.mockReturnValue([
            { pid: 109, command: 'codex', cwd: '/repo-shared', tty: 'ttys016' },
            { pid: 110, command: 'codex', cwd: '/repo-shared', tty: 'ttys017' },
        ] as ProcessInfo[]);

        jest.spyOn(adapter as any, 'readSessions').mockReturnValue([
            {
                sessionId: 'shared-session',
                projectPath: '/repo-shared',
                summary: 'Only one session exists',
                sessionStart: new Date('2026-02-26T15:00:00.000Z'),
                lastActive: new Date('2026-02-26T15:11:00.000Z'),
                lastPayloadType: 'agent_message',
            } as MockSession,
        ]);
        jest.spyOn(adapter as any, 'getProcessStartTimes').mockReturnValue(
            new Map([
                [109, new Date('2026-02-26T15:00:00.000Z')],
                [110, new Date('2026-02-26T15:00:30.000Z')],
            ]),
        );

        const agents = await adapter.detectAgents();
        expect(agents).toHaveLength(2);
        const mappedAgents = agents.filter((agent) => agent.sessionId === 'shared-session');
        expect(mappedAgents).toHaveLength(1);
        expect(agents.some((agent) => agent.sessionId.startsWith('pid-'))).toBe(true);
    });
});

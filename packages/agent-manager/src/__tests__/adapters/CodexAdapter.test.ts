/**
 * Tests for CodexAdapter
 */

import type { MockedFunction } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

import { CodexAdapter } from '../../adapters/CodexAdapter.js';
import type { ProcessInfo } from '../../adapters/AgentAdapter.js';
import { AgentStatus } from '../../adapters/AgentAdapter.js';
import { AgentRegistry, type RegistryEntry } from '../../utils/AgentRegistry.js';
import { listAgentProcesses, enrichProcesses } from '../../utils/process.js';
import { batchGetSessionFileBirthtimes } from '../../utils/session.js';
import type { SessionFile } from '../../utils/session.js';
import { matchProcessesToSessions, generateAgentName } from '../../utils/matching.js';
import type { MatchResult } from '../../utils/matching.js';
import * as os from 'os';

vi.mock('../../utils/process.js', () => ({
    listAgentProcesses: vi.fn(),
    enrichProcesses: vi.fn(),
}));

vi.mock('../../utils/session.js', async () => {
    const actual = await vi.importActual('../../utils/session') as typeof import('../../utils/session');
    return {
        ...actual,
        batchGetSessionFileBirthtimes: vi.fn(),
    };
});

vi.mock('../../utils/matching.js', () => ({
    matchProcessesToSessions: vi.fn(),
    generateAgentName: vi.fn(),
}));

const mockedListAgentProcesses = listAgentProcesses as MockedFunction<typeof listAgentProcesses>;
const mockedEnrichProcesses = enrichProcesses as MockedFunction<typeof enrichProcesses>;
const mockedBatchGetSessionFileBirthtimes = batchGetSessionFileBirthtimes as MockedFunction<typeof batchGetSessionFileBirthtimes>;
const mockedMatchProcessesToSessions = matchProcessesToSessions as MockedFunction<typeof matchProcessesToSessions>;
const mockedGenerateAgentName = generateAgentName as MockedFunction<typeof generateAgentName>;

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
        async function useRealSessionMatcher(): Promise<void> {
            const actualMatching = await vi.importActual<typeof import('../../utils/matching.js')>('../../utils/matching.js');
            mockedMatchProcessesToSessions.mockImplementation(actualMatching.matchProcessesToSessions);
        }

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
            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-test-'));
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

        it('should match when session_meta timestamp and file birthtime both align with process start', async () => {
            await useRealSessionMatcher();
            const processStart = new Date('2026-03-18T15:00:00.000Z');
            const sessionTimestamp = '2026-03-18T15:00:05.000Z';
            const processes: ProcessInfo[] = [
                {
                    pid: 101,
                    command: 'codex',
                    cwd: '/repo-a',
                    tty: 'ttys001',
                    startTime: processStart,
                },
            ];
            mockedListAgentProcesses.mockReturnValue(processes);
            mockedEnrichProcesses.mockReturnValue(processes);

            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-test-'));
            const sessionsDir = path.join(tmpDir, 'sessions');
            const dateDir = path.join(sessionsDir, '2026', '03', '18');
            fs.mkdirSync(dateDir, { recursive: true });

            const sessionFile = path.join(dateDir, 'sess-aligned.jsonl');
            fs.writeFileSync(sessionFile, [
                JSON.stringify({ type: 'session_meta', payload: { id: 'sess-aligned', timestamp: sessionTimestamp, cwd: '/repo-a' } }),
                JSON.stringify({ type: 'event', timestamp: sessionTimestamp, payload: { type: 'token_count', message: 'Aligned session' } }),
            ].join('\n'));

            (adapter as any).codexSessionsDir = sessionsDir;
            mockedBatchGetSessionFileBirthtimes.mockReturnValue([
                {
                    sessionId: 'sess-aligned',
                    filePath: sessionFile,
                    projectDir: dateDir,
                    birthtimeMs: new Date(sessionTimestamp).getTime(),
                    resolvedCwd: '',
                },
            ]);

            const agents = await adapter.detectAgents();

            expect(agents).toHaveLength(1);
            expect(agents[0]).toMatchObject({
                pid: 101,
                sessionId: 'sess-aligned',
                summary: 'Aligned session',
            });

            fs.rmSync(tmpDir, { recursive: true, force: true });
        });

        it('should match late-created session files using session_meta timestamp', async () => {
            await useRealSessionMatcher();
            const processStart = new Date('2026-03-18T15:00:00.000Z');
            const sessionTimestamp = '2026-03-18T15:00:10.000Z';
            const lateBirthtime = new Date('2026-03-18T15:05:30.000Z').getTime();
            const processes: ProcessInfo[] = [
                {
                    pid: 102,
                    command: 'codex',
                    cwd: '/repo-a',
                    tty: 'ttys001',
                    startTime: processStart,
                },
            ];
            mockedListAgentProcesses.mockReturnValue(processes);
            mockedEnrichProcesses.mockReturnValue(processes);

            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-test-'));
            const sessionsDir = path.join(tmpDir, 'sessions');
            const dateDir = path.join(sessionsDir, '2026', '03', '18');
            fs.mkdirSync(dateDir, { recursive: true });

            const sessionFile = path.join(dateDir, 'sess-late.jsonl');
            fs.writeFileSync(sessionFile, [
                JSON.stringify({ type: 'session_meta', payload: { id: 'sess-late', timestamp: sessionTimestamp, cwd: '/repo-a' } }),
                JSON.stringify({ type: 'event', timestamp: sessionTimestamp, payload: { type: 'token_count', message: 'Late file session' } }),
            ].join('\n'));

            (adapter as any).codexSessionsDir = sessionsDir;
            mockedBatchGetSessionFileBirthtimes.mockReturnValue([
                {
                    sessionId: 'sess-late',
                    filePath: sessionFile,
                    projectDir: dateDir,
                    birthtimeMs: lateBirthtime,
                    resolvedCwd: '',
                },
            ]);

            const agents = await adapter.detectAgents();

            expect(agents).toHaveLength(1);
            expect(agents[0]).toMatchObject({
                pid: 102,
                sessionId: 'sess-late',
                summary: 'Late file session',
            });
            expect(mockedMatchProcessesToSessions.mock.calls[0][1][0].birthtimeMs).toBe(new Date(sessionTimestamp).getTime());

            fs.rmSync(tmpDir, { recursive: true, force: true });
        });

        it.each<[string, string | undefined]>([
            ['missing', undefined],
            ['invalid', 'not-a-date'],
        ])('should fall back to file birthtime when session_meta timestamp is %s', async (_label, metaTimestamp) => {
            await useRealSessionMatcher();
            const processStart = new Date('2026-03-18T15:00:00.000Z');
            const fileBirthtime = new Date('2026-03-18T15:00:20.000Z').getTime();
            const processes: ProcessInfo[] = [
                {
                    pid: 103,
                    command: 'codex',
                    cwd: '/repo-a',
                    tty: 'ttys001',
                    startTime: processStart,
                },
            ];
            mockedListAgentProcesses.mockReturnValue(processes);
            mockedEnrichProcesses.mockReturnValue(processes);

            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-test-'));
            const sessionsDir = path.join(tmpDir, 'sessions');
            const dateDir = path.join(sessionsDir, '2026', '03', '18');
            fs.mkdirSync(dateDir, { recursive: true });

            const payload: { id: string; cwd: string; timestamp?: string } = { id: `sess-${_label}`, cwd: '/repo-a' };
            if (metaTimestamp !== undefined) {
                payload.timestamp = metaTimestamp;
            }

            const sessionFile = path.join(dateDir, `sess-${_label}.jsonl`);
            fs.writeFileSync(sessionFile, [
                JSON.stringify({ type: 'session_meta', payload }),
                JSON.stringify({ type: 'event', timestamp: '2026-03-18T15:00:30.000Z', payload: { type: 'token_count', message: `${_label} timestamp session` } }),
            ].join('\n'));

            (adapter as any).codexSessionsDir = sessionsDir;
            mockedBatchGetSessionFileBirthtimes.mockReturnValue([
                {
                    sessionId: `sess-${_label}`,
                    filePath: sessionFile,
                    projectDir: dateDir,
                    birthtimeMs: fileBirthtime,
                    resolvedCwd: '',
                },
            ]);

            const agents = await adapter.detectAgents();

            expect(agents).toHaveLength(1);
            expect(agents[0].sessionId).toBe(`sess-${_label}`);
            expect(mockedMatchProcessesToSessions.mock.calls[0][1][0].birthtimeMs).toBe(fileBirthtime);

            fs.rmSync(tmpDir, { recursive: true, force: true });
        });

        it('should fall back to process-only for unmatched processes', async () => {
            const processes: ProcessInfo[] = [
                { pid: 100, command: 'codex', cwd: '/repo-a', tty: 'ttys001', startTime: new Date() },
                { pid: 200, command: 'codex', cwd: '/repo-b', tty: 'ttys002', startTime: new Date() },
            ];
            mockedListAgentProcesses.mockReturnValue(processes);
            mockedEnrichProcesses.mockReturnValue(processes);

            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-test-'));
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

        it('should match resumed sessions by id even when the JSONL predates the process', async () => {
            const sessionId = '019eabed-4079-7071-9531-b853ddd9914e';
            const processes: ProcessInfo[] = [
                {
                    pid: 88018,
                    command: `codex resume ${sessionId}`,
                    cwd: '/repo-a',
                    tty: 'ttys001',
                    startTime: new Date('2026-06-10T12:00:00.000Z'),
                },
            ];
            mockedListAgentProcesses.mockReturnValue(processes);
            mockedEnrichProcesses.mockReturnValue(processes);

            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-resume-'));
            const sessionsDir = path.join(tmpDir, 'sessions');
            const dateDir = path.join(sessionsDir, '2026', '06', '09');
            fs.mkdirSync(dateDir, { recursive: true });

            const recentTs = new Date().toISOString();
            const sessionFile = path.join(dateDir, `rollout-2026-06-09T12-28-33-${sessionId}.jsonl`);
            fs.writeFileSync(sessionFile, [
                JSON.stringify({ type: 'session_meta', payload: { id: sessionId, timestamp: recentTs, cwd: '/repo-a' } }),
                JSON.stringify({ type: 'event', timestamp: recentTs, payload: { type: 'agent_message', message: 'resumed codex conversation' } }),
            ].join('\n'));

            (adapter as any).codexSessionsDir = sessionsDir;
            mockedBatchGetSessionFileBirthtimes.mockReturnValue([]);
            const collectAllSpy = vi.spyOn(adapter as any, 'collectAllSessionFiles');

            try {
                const agents = await adapter.detectAgents();

                expect(mockedBatchGetSessionFileBirthtimes).not.toHaveBeenCalled();
                expect(mockedMatchProcessesToSessions).not.toHaveBeenCalled();
                expect(collectAllSpy).not.toHaveBeenCalled();
                expect(agents).toHaveLength(1);
                expect(agents[0]).toMatchObject({
                    type: 'codex',
                    pid: 88018,
                    sessionId,
                    projectPath: '/repo-a',
                    sessionFilePath: sessionFile,
                });
                expect(agents[0].summary).toBe('resumed codex conversation');
            } finally {
                collectAllSpy.mockRestore();
                fs.rmSync(tmpDir, { recursive: true, force: true });
            }
        });

        it('should fall back to all session files for non-time-sortable resume ids', async () => {
            const sessionId = 'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee';
            const processes: ProcessInfo[] = [
                {
                    pid: 88020,
                    command: `codex resume ${sessionId}`,
                    cwd: '/repo-a',
                    tty: 'ttys001',
                    startTime: new Date('2026-06-10T12:00:00.000Z'),
                },
            ];
            mockedListAgentProcesses.mockReturnValue(processes);
            mockedEnrichProcesses.mockReturnValue(processes);

            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-resume-v4-'));
            const sessionsDir = path.join(tmpDir, 'sessions');
            const dateDir = path.join(sessionsDir, '2026', '01', '02');
            fs.mkdirSync(dateDir, { recursive: true });

            const recentTs = new Date().toISOString();
            const sessionFile = path.join(dateDir, `${sessionId}.jsonl`);
            fs.writeFileSync(sessionFile, [
                JSON.stringify({ type: 'session_meta', payload: { id: sessionId, timestamp: recentTs, cwd: '/repo-a' } }),
                JSON.stringify({ type: 'event', timestamp: recentTs, payload: { type: 'agent_message', message: 'legacy id conversation' } }),
            ].join('\n'));

            (adapter as any).codexSessionsDir = sessionsDir;
            mockedBatchGetSessionFileBirthtimes.mockReturnValue([]);
            const collectAllSpy = vi.spyOn(adapter as any, 'collectAllSessionFiles');

            try {
                const agents = await adapter.detectAgents();

                expect(collectAllSpy).toHaveBeenCalledOnce();
                expect(agents).toHaveLength(1);
                expect(agents[0]).toMatchObject({
                    pid: 88020,
                    sessionId,
                    sessionFilePath: sessionFile,
                });
            } finally {
                collectAllSpy.mockRestore();
                fs.rmSync(tmpDir, { recursive: true, force: true });
            }
        });

        it('should fall back to process-only when a resumed session becomes unreadable after direct matching', async () => {
            const sessionId = '019eabed-4079-7071-9531-b853ddd9914e';
            const processes: ProcessInfo[] = [
                {
                    pid: 88019,
                    command: `codex resume ${sessionId}`,
                    cwd: '/repo-a',
                    tty: 'ttys001',
                    startTime: new Date('2026-06-10T12:00:00.000Z'),
                },
            ];
            mockedListAgentProcesses.mockReturnValue(processes);
            mockedEnrichProcesses.mockReturnValue(processes);

            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-resume-gone-'));
            const sessionsDir = path.join(tmpDir, 'sessions');
            const dateDir = path.join(sessionsDir, '2026', '06', '09');
            fs.mkdirSync(dateDir, { recursive: true });

            const sessionFile = path.join(dateDir, `rollout-2026-06-09T12-28-33-${sessionId}.jsonl`);

            (adapter as any).codexSessionsDir = sessionsDir;
            const findSpy = vi.spyOn(adapter as any, 'findSessionFileById').mockReturnValue({
                sessionId,
                filePath: sessionFile,
                projectDir: dateDir,
                birthtimeMs: Date.now(),
                resolvedCwd: '/repo-a',
            });
            mockedBatchGetSessionFileBirthtimes.mockReturnValue([]);

            try {
                const agents = await adapter.detectAgents();

                expect(agents).toHaveLength(1);
                expect(agents[0]).toMatchObject({
                    type: 'codex',
                    pid: 88019,
                    sessionId: 'pid-88019',
                    projectPath: '/repo-a',
                });
                expect(agents[0].sessionFilePath).toBeUndefined();
            } finally {
                findSpy.mockRestore();
                fs.rmSync(tmpDir, { recursive: true, force: true });
            }
        });

        it('should map a running Codex process from the hook session mapping', async () => {
            const originalHome = process.env.HOME;
            const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-mapping-'));
            process.env.HOME = tmpHome;

            try {
                const mappedAdapter = new CodexAdapter(new AgentRegistry(path.join(tmpHome, 'agents.json')));
                const sessionsDir = path.join(tmpHome, '.codex', 'sessions');
                const dateDir = path.join(sessionsDir, '2026', '06', '26');
                const mappingPath = path.join(tmpHome, '.codex', 'ai-devkit', 'sessions.json');
                const sessionFile = path.join(dateDir, 'rollout-2026-06-26T09-56-12-sess-mapped.jsonl');
                const recentTs = new Date().toISOString();

                fs.mkdirSync(dateDir, { recursive: true });
                fs.mkdirSync(path.dirname(mappingPath), { recursive: true });
                fs.writeFileSync(sessionFile, [
                    JSON.stringify({ type: 'session_meta', payload: { id: 'sess-mapped', timestamp: recentTs, cwd: '/repo-mapped' } }),
                    JSON.stringify({ type: 'event', timestamp: recentTs, payload: { type: 'agent_message', message: 'mapped conversation' } }),
                ].join('\n'));
                fs.writeFileSync(mappingPath, JSON.stringify({ 5151: sessionFile }));

                const processes: ProcessInfo[] = [
                    {
                        pid: 5151,
                        command: 'codex',
                        cwd: '/repo-mapped',
                        tty: 'ttys001',
                        startTime: new Date('2026-06-26T09:56:12.000Z'),
                    },
                ];
                mockedListAgentProcesses.mockReturnValue(processes);
                mockedEnrichProcesses.mockReturnValue(processes);

                const agents = await mappedAdapter.detectAgents();

                expect(agents).toHaveLength(1);
                expect(agents[0]).toMatchObject({
                    type: 'codex',
                    pid: 5151,
                    sessionId: 'sess-mapped',
                    projectPath: '/repo-mapped',
                    summary: 'mapped conversation',
                    sessionFilePath: sessionFile,
                });
                expect(mockedBatchGetSessionFileBirthtimes).not.toHaveBeenCalled();
                expect(mockedMatchProcessesToSessions).not.toHaveBeenCalled();
            } finally {
                process.env.HOME = originalHome;
                fs.rmSync(tmpHome, { recursive: true, force: true });
            }
        });

        it('should fall back to legacy matching when mapped session file cannot be parsed', async () => {
            const originalHome = process.env.HOME;
            const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-mapping-fallback-'));
            process.env.HOME = tmpHome;

            try {
                const mappedAdapter = new CodexAdapter(new AgentRegistry(path.join(tmpHome, 'agents.json')));
                const sessionsDir = path.join(tmpHome, '.codex', 'sessions');
                const dateDir = path.join(sessionsDir, '2026', '06', '26');
                const mappingPath = path.join(tmpHome, '.codex', 'ai-devkit', 'sessions.json');
                const badSessionFile = path.join(dateDir, 'bad.jsonl');
                const fallbackSessionFile = path.join(dateDir, 'fallback.jsonl');
                const recentTs = new Date().toISOString();

                fs.mkdirSync(dateDir, { recursive: true });
                fs.mkdirSync(path.dirname(mappingPath), { recursive: true });
                fs.writeFileSync(badSessionFile, '{not-json');
                fs.writeFileSync(fallbackSessionFile, [
                    JSON.stringify({ type: 'session_meta', payload: { id: 'sess-fallback', timestamp: recentTs, cwd: '/repo-fallback' } }),
                    JSON.stringify({ type: 'event', timestamp: recentTs, payload: { type: 'token_count', message: 'fallback conversation' } }),
                ].join('\n'));
                fs.writeFileSync(mappingPath, JSON.stringify({ 6161: badSessionFile }));

                const processes: ProcessInfo[] = [
                    {
                        pid: 6161,
                        command: 'codex',
                        cwd: '/repo-fallback',
                        tty: 'ttys001',
                        startTime: new Date('2026-06-26T09:56:12.000Z'),
                    },
                ];
                const fallbackSession: SessionFile = {
                    sessionId: 'sess-fallback',
                    filePath: fallbackSessionFile,
                    projectDir: dateDir,
                    birthtimeMs: new Date('2026-06-26T09:56:15.000Z').getTime(),
                    resolvedCwd: '',
                };
                mockedListAgentProcesses.mockReturnValue(processes);
                mockedEnrichProcesses.mockReturnValue(processes);
                mockedBatchGetSessionFileBirthtimes.mockReturnValue([fallbackSession]);
                mockedMatchProcessesToSessions.mockReturnValue([
                    {
                        process: processes[0],
                        session: { ...fallbackSession, resolvedCwd: '/repo-fallback' },
                        deltaMs: 3000,
                    },
                ]);

                const agents = await mappedAdapter.detectAgents();

                expect(agents).toHaveLength(1);
                expect(agents[0]).toMatchObject({
                    pid: 6161,
                    sessionId: 'sess-fallback',
                    summary: 'fallback conversation',
                    sessionFilePath: fallbackSessionFile,
                });
                expect(mockedMatchProcessesToSessions).toHaveBeenCalledWith(
                    [processes[0]],
                    expect.arrayContaining([expect.objectContaining({ filePath: fallbackSessionFile })]),
                );
            } finally {
                process.env.HOME = originalHome;
                fs.rmSync(tmpHome, { recursive: true, force: true });
            }
        });
    });

    describe('detectAgents — registry cache short-circuit', () => {
        let tmpDir: string;
        let regPath: string;
        let registry: AgentRegistry;
        let cachedAdapter: CodexAdapter;
        let sessionFilePath: string;

        function registerEntry(over: Partial<RegistryEntry> = {}): void {
            registry.register({
                name: 'codex-100',
                type: 'codex',
                pid: 100,
                tmuxSession: '',
                cwd: '/repo-a',
                startedAt: '2026-05-30T00:00:00.000Z',
                sessionId: 'sess-cached',
                sessionFilePath,
                ...over,
            });
        }

        beforeEach(() => {
            tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-cache-'));
            regPath = path.join(tmpDir, 'agents.json');
            registry = new AgentRegistry(regPath);
            cachedAdapter = new CodexAdapter(registry);

            const recentTs = new Date().toISOString();
            sessionFilePath = path.join(tmpDir, 'sess-cached.jsonl');
            fs.writeFileSync(sessionFilePath, [
                JSON.stringify({ type: 'session_meta', payload: { id: 'sess-cached', timestamp: recentTs, cwd: '/repo-a' } }),
                JSON.stringify({ type: 'event', timestamp: recentTs, payload: { type: 'token_count', message: 'Hello from cache' } }),
            ].join('\n'));
        });

        afterEach(() => {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        });

        it('short-circuits matching when registry has a valid entry', async () => {
            registerEntry();
            const processes: ProcessInfo[] = [
                { pid: 100, command: 'codex', cwd: '/repo-a', tty: 'ttys001', startTime: new Date() },
            ];
            mockedListAgentProcesses.mockReturnValue(processes);
            mockedEnrichProcesses.mockReturnValue(processes);

            const agents = await cachedAdapter.detectAgents();

            expect(agents).toHaveLength(1);
            expect(agents[0]).toMatchObject({
                type: 'codex',
                pid: 100,
                sessionId: 'sess-cached',
                sessionFilePath,
                summary: 'Hello from cache',
            });
            expect(mockedMatchProcessesToSessions).not.toHaveBeenCalled();
            expect(mockedBatchGetSessionFileBirthtimes).not.toHaveBeenCalled();
        });

        it('falls through when no registry entry exists for the pid', async () => {
            const processes: ProcessInfo[] = [
                { pid: 100, command: 'codex', cwd: '/repo-a', tty: 'ttys001', startTime: new Date() },
            ];
            mockedListAgentProcesses.mockReturnValue(processes);
            mockedEnrichProcesses.mockReturnValue(processes);
            (cachedAdapter as any).codexSessionsDir = '/nonexistent';

            const agents = await cachedAdapter.detectAgents();

            expect(agents[0].sessionId).toBe('pid-100');
        });

        it('falls through when registry entry type does not match', async () => {
            registerEntry({ type: 'claude' });
            const processes: ProcessInfo[] = [
                { pid: 100, command: 'codex', cwd: '/repo-a', tty: 'ttys001', startTime: new Date() },
            ];
            mockedListAgentProcesses.mockReturnValue(processes);
            mockedEnrichProcesses.mockReturnValue(processes);
            (cachedAdapter as any).codexSessionsDir = '/nonexistent';

            const agents = await cachedAdapter.detectAgents();

            expect(agents[0].sessionId).toBe('pid-100');
            expect(mockedMatchProcessesToSessions).not.toHaveBeenCalled();
        });

        it('falls through when the cached session file no longer exists', async () => {
            registerEntry({ sessionFilePath: path.join(tmpDir, 'deleted.jsonl') });
            const processes: ProcessInfo[] = [
                { pid: 100, command: 'codex', cwd: '/repo-a', tty: 'ttys001', startTime: new Date() },
            ];
            mockedListAgentProcesses.mockReturnValue(processes);
            mockedEnrichProcesses.mockReturnValue(processes);
            (cachedAdapter as any).codexSessionsDir = '/nonexistent';

            const agents = await cachedAdapter.detectAgents();

            expect(agents[0].sessionId).toBe('pid-100');
        });
    });

    describe('discoverSessions', () => {
        let tmpDir: string;

        beforeEach(() => {
            tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-test-'));
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

        it('should use session_meta timestamp as the matching birthtime when valid', () => {
            const sessionsDir = path.join(tmpDir, 'sessions');
            (adapter as any).codexSessionsDir = sessionsDir;
            const discoverSessions = (adapter as any).discoverSessions.bind(adapter);

            const dateDir = path.join(sessionsDir, '2026', '03', '18');
            fs.mkdirSync(dateDir, { recursive: true });

            const sessionFile = path.join(dateDir, 'sess-meta-time.jsonl');
            const metaTimestamp = '2026-03-18T15:00:05.000Z';
            fs.writeFileSync(sessionFile,
                JSON.stringify({ type: 'session_meta', payload: { id: 'sess-meta-time', timestamp: metaTimestamp, cwd: '/repo-a' } }),
            );

            mockedBatchGetSessionFileBirthtimes.mockReturnValue([
                {
                    sessionId: 'sess-meta-time',
                    filePath: sessionFile,
                    projectDir: dateDir,
                    birthtimeMs: new Date('2026-03-18T15:05:30.000Z').getTime(),
                    resolvedCwd: '',
                },
            ]);

            const { sessions } = discoverSessions([
                { pid: 1, command: 'codex', cwd: '/repo-a', tty: '', startTime: new Date('2026-03-18T15:00:00Z') },
            ]);

            expect(sessions[0].resolvedCwd).toBe('/repo-a');
            expect(sessions[0].birthtimeMs).toBe(new Date(metaTimestamp).getTime());
        });

        it('should tolerate malformed session_meta and unreadable files', () => {
            const sessionsDir = path.join(tmpDir, 'sessions');
            (adapter as any).codexSessionsDir = sessionsDir;
            const discoverSessions = (adapter as any).discoverSessions.bind(adapter);

            const dateDir = path.join(sessionsDir, '2026', '03', '18');
            fs.mkdirSync(dateDir, { recursive: true });

            const malformedFile = path.join(dateDir, 'malformed.jsonl');
            const missingFile = path.join(dateDir, 'missing.jsonl');
            fs.writeFileSync(malformedFile, '{not valid json');

            mockedBatchGetSessionFileBirthtimes.mockReturnValue([
                {
                    sessionId: 'malformed',
                    filePath: malformedFile,
                    projectDir: dateDir,
                    birthtimeMs: 1710800324000,
                    resolvedCwd: '',
                },
                {
                    sessionId: 'missing',
                    filePath: missingFile,
                    projectDir: dateDir,
                    birthtimeMs: 1710800325000,
                    resolvedCwd: '',
                },
            ]);

            const result = discoverSessions([
                { pid: 1, command: 'codex', cwd: '/repo', tty: '', startTime: new Date('2026-03-18T15:00:00Z') },
            ]);

            expect(result.sessions).toHaveLength(2);
            expect(result.sessions[0].resolvedCwd).toBe('');
            expect(result.sessions[1].resolvedCwd).toBe('');
            expect(result.contentCache.has(malformedFile)).toBe(true);
            expect(result.contentCache.has(missingFile)).toBe(false);
        });
    });

    describe('findSessionFileById', () => {
        let tmpDir: string;
        let sessionsDir: string;
        const sessionId = 'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee';

        beforeEach(() => {
            tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-resume-find-'));
            sessionsDir = path.join(tmpDir, 'sessions');
            fs.mkdirSync(path.join(sessionsDir, '2026', '03', '18'), { recursive: true });
            (adapter as any).codexSessionsDir = sessionsDir;
        });

        afterEach(() => {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        });

        function writeResumeSession(timestamp?: string): string {
            const filePath = path.join(sessionsDir, '2026', '03', '18', `${sessionId}.jsonl`);
            const payload: { id: string; cwd: string; timestamp?: string } = { id: sessionId, cwd: '/repo-a' };
            if (timestamp !== undefined) {
                payload.timestamp = timestamp;
            }
            fs.writeFileSync(filePath, JSON.stringify({ type: 'session_meta', payload }));
            return filePath;
        }

        it('should return session_meta timestamp as birthtimeMs when valid', () => {
            const metaTimestamp = '2026-03-18T15:00:05.000Z';
            writeResumeSession(metaTimestamp);
            const findSessionFileById = (adapter as any).findSessionFileById.bind(adapter);

            const session = findSessionFileById(sessionId);

            expect(session).toMatchObject({
                sessionId,
                resolvedCwd: '/repo-a',
                birthtimeMs: new Date(metaTimestamp).getTime(),
            });
        });

        it.each<[string, string | undefined]>([
            ['missing', undefined],
            ['invalid', 'not-a-date'],
        ])('should fall back to stat birthtimeMs when session_meta timestamp is %s', (_label, metaTimestamp) => {
            const sessionFile = writeResumeSession(metaTimestamp);
            const stat = fs.statSync(sessionFile);
            const findSessionFileById = (adapter as any).findSessionFileById.bind(adapter);

            const session = findSessionFileById(sessionId);

            expect(session).not.toBeNull();
            expect(session.birthtimeMs).toBe(stat.birthtimeMs);
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
                tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-test-'));
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
            tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-conv-'));
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

    describe('listSessions', () => {
        let tmpDir: string;
        let sessionsDir: string;

        beforeEach(() => {
            tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-list-'));
            sessionsDir = path.join(tmpDir, 'sessions');
            fs.mkdirSync(sessionsDir, { recursive: true });
            (adapter as any).codexSessionsDir = sessionsDir;
        });

        afterEach(() => {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        });

        function writeCodexSession(dateDir: string, sessionId: string, lines: object[]): string {
            fs.mkdirSync(dateDir, { recursive: true });
            const filePath = path.join(dateDir, `${sessionId}.jsonl`);
            fs.writeFileSync(filePath, lines.map((l) => JSON.stringify(l)).join('\n'));
            return filePath;
        }

        it('returns empty when sessions dir does not exist', async () => {
            fs.rmSync(sessionsDir, { recursive: true, force: true });
            const result = await adapter.listSessions();
            expect(result).toEqual([]);
        });

        it('walks every YYYY/MM/DD dir and returns all sessions', async () => {
            const dayA = path.join(sessionsDir, '2025', '01', '01');
            const dayB = path.join(sessionsDir, '2025', '02', '03');
            writeCodexSession(dayA, 'sess-a', [
                { type: 'session_meta', payload: { id: 'sess-a', cwd: '/repo-a', timestamp: '2025-01-01T00:00:00Z' } },
                { type: 'event', timestamp: '2025-01-01T00:00:01Z', payload: { type: 'user_message', message: 'msg-a' } },
            ]);
            writeCodexSession(dayB, 'sess-b', [
                { type: 'session_meta', payload: { id: 'sess-b', cwd: '/repo-b', timestamp: '2025-02-03T00:00:00Z' } },
                { type: 'event', timestamp: '2025-02-03T00:00:01Z', payload: { type: 'user_message', message: 'msg-b' } },
            ]);

            const result = await adapter.listSessions();

            expect(result).toHaveLength(2);
            const byId = Object.fromEntries(result.map((r) => [r.sessionId, r]));
            expect(byId['sess-a']).toMatchObject({
                type: 'codex',
                cwd: '/repo-a',
                firstUserMessage: 'msg-a',
            });
            expect(byId['sess-b']).toMatchObject({
                type: 'codex',
                cwd: '/repo-b',
                firstUserMessage: 'msg-b',
            });
        });

        it('applies strict-equality cwd filter against session_meta cwd', async () => {
            const day = path.join(sessionsDir, '2025', '01', '01');
            writeCodexSession(day, 'keep', [
                { type: 'session_meta', payload: { id: 'keep', cwd: '/repo', timestamp: '2025-01-01T00:00:00Z' } },
                { type: 'event', timestamp: '2025-01-01T00:00:01Z', payload: { type: 'user_message', message: 'yes' } },
            ]);
            writeCodexSession(day, 'drop', [
                { type: 'session_meta', payload: { id: 'drop', cwd: '/other', timestamp: '2025-01-01T00:01:00Z' } },
                { type: 'event', timestamp: '2025-01-01T00:01:01Z', payload: { type: 'user_message', message: 'no' } },
            ]);

            const result = await adapter.listSessions({ cwd: '/repo' });

            expect(result).toHaveLength(1);
            expect(result[0].sessionId).toBe('keep');
        });

        it('skips files without a session_meta first line', async () => {
            const day = path.join(sessionsDir, '2025', '01', '01');
            writeCodexSession(day, 'bad', [
                { type: 'event', timestamp: '2025-01-01T00:00:00Z', payload: { type: 'user_message', message: 'orphan' } },
            ]);
            writeCodexSession(day, 'good', [
                { type: 'session_meta', payload: { id: 'good', cwd: '/repo', timestamp: '2025-01-01T00:00:00Z' } },
                { type: 'event', timestamp: '2025-01-01T00:00:01Z', payload: { type: 'user_message', message: 'ok' } },
            ]);

            const result = await adapter.listSessions();
            expect(result).toHaveLength(1);
            expect(result[0].sessionId).toBe('good');
        });

        it('captures the first user_message as firstUserMessage', async () => {
            const day = path.join(sessionsDir, '2025', '01', '01');
            writeCodexSession(day, 's', [
                { type: 'session_meta', payload: { id: 's', cwd: '/repo', timestamp: '2025-01-01T00:00:00Z' } },
                { type: 'event', timestamp: '2025-01-01T00:00:01Z', payload: { type: 'agent_message', message: 'preamble' } },
                { type: 'event', timestamp: '2025-01-01T00:00:02Z', payload: { type: 'user_message', message: 'first user' } },
                { type: 'event', timestamp: '2025-01-01T00:00:03Z', payload: { type: 'user_message', message: 'second user' } },
            ]);

            const result = await adapter.listSessions({ cwd: '/repo' });

            expect(result).toHaveLength(1);
            expect(result[0].firstUserMessage).toBe('first user');
        });

        it('returns empty firstUserMessage when no user_message exists', async () => {
            const day = path.join(sessionsDir, '2025', '01', '01');
            writeCodexSession(day, 's', [
                { type: 'session_meta', payload: { id: 's', cwd: '/repo', timestamp: '2025-01-01T00:00:00Z' } },
                { type: 'event', timestamp: '2025-01-01T00:00:01Z', payload: { type: 'agent_message', message: 'agent only' } },
            ]);

            const result = await adapter.listSessions({ cwd: '/repo' });
            expect(result).toHaveLength(1);
            expect(result[0].firstUserMessage).toBe('');
        });
    });
});

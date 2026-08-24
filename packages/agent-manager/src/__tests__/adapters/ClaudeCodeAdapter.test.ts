/**
 * Tests for ClaudeCodeAdapter
 */

import type { MockedFunction } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

import { ClaudeCodeAdapter } from '../../providers/claude/ClaudeCodeAdapter.js';
import type { ProcessInfo } from '../../adapters/AgentAdapter.js';
import { AgentStatus } from '../../adapters/AgentAdapter.js';
import { listAgentProcesses, enrichProcesses, captureProcessSnapshot } from '../../utils/process.js';
import { batchGetSessionFileBirthtimes } from '../../utils/session.js';
import type { SessionFile } from '../../utils/session.js';
import { matchProcessesToSessions, generateAgentName } from '../../utils/matching.js';
import type { MatchResult } from '../../utils/matching.js';
import * as os from 'os';
vi.mock('../../utils/process.js', async (importOriginal) => {
    const actual = await importOriginal() as typeof import('../../utils/process.js');
    return {
        ...actual,
        listAgentProcesses: vi.fn(),
        enrichProcesses: vi.fn(),
        captureProcessSnapshot: vi.fn(),
    };
});

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
const mockedCaptureProcessSnapshot = captureProcessSnapshot as MockedFunction<typeof captureProcessSnapshot>;
const mockedBatchGetSessionFileBirthtimes = batchGetSessionFileBirthtimes as MockedFunction<typeof batchGetSessionFileBirthtimes>;
const mockedMatchProcessesToSessions = matchProcessesToSessions as MockedFunction<typeof matchProcessesToSessions>;
const mockedGenerateAgentName = generateAgentName as MockedFunction<typeof generateAgentName>;
describe('ClaudeCodeAdapter', () => {
    let adapter: ClaudeCodeAdapter;

    beforeEach(() => {
        adapter = new ClaudeCodeAdapter();
        mockedListAgentProcesses.mockReset();
        mockedEnrichProcesses.mockReset();
        mockedCaptureProcessSnapshot.mockReset();
        mockedBatchGetSessionFileBirthtimes.mockReset();
        mockedMatchProcessesToSessions.mockReset();
        mockedGenerateAgentName.mockReset();
        // Default: enrichProcesses returns what it receives
        mockedEnrichProcesses.mockImplementation((procs) => procs);
        // Compatibility shim for standalone adapter discovery; the manager captures once and slices by name.
        mockedCaptureProcessSnapshot.mockImplementation(async (names) => (
            enrichProcesses(names.flatMap((name) => listAgentProcesses(name)))
        ));
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
            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-test-'));
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
            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-test-'));
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

        it('should match via --resume <uuid> in command line and skip PID-file/legacy', async () => {
            const sessionId = '0555f803-7eca-4fc6-a1e0-34dbf86b33b2';
            const processes: ProcessInfo[] = [
                {
                    pid: 41920,
                    command: `claude --resume ${sessionId}`,
                    cwd: '/project/resumed',
                    tty: 'ttys001',
                    startTime: new Date(),
                },
            ];
            mockedListAgentProcesses.mockReturnValue(processes);
            mockedEnrichProcesses.mockReturnValue(processes);

            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-resume-'));
            const projectsDir = path.join(tmpDir, 'projects');
            const projDir = path.join(projectsDir, '-project-resumed');
            fs.mkdirSync(projDir, { recursive: true });

            const jsonlPath = path.join(projDir, `${sessionId}.jsonl`);
            fs.writeFileSync(jsonlPath, [
                JSON.stringify({ type: 'user', timestamp: new Date().toISOString(), cwd: '/project/resumed', message: { content: 'resumed conversation' } }),
                JSON.stringify({ type: 'assistant', timestamp: new Date().toISOString() }),
            ].join('\n'));

            (adapter as any).projectsDir = projectsDir;
            (adapter as any).sessionsDir = path.join(tmpDir, 'sessions'); // empty — no PID file

            const agents = await adapter.detectAgents();

            // Legacy matching helpers must NOT have been consulted — resume match was authoritative
            expect(mockedBatchGetSessionFileBirthtimes).not.toHaveBeenCalled();
            expect(mockedMatchProcessesToSessions).not.toHaveBeenCalled();

            expect(agents).toHaveLength(1);
            expect(agents[0]).toMatchObject({
                type: 'claude',
                pid: 41920,
                sessionId,
                projectPath: '/project/resumed',
            });
            expect(agents[0].summary).toContain('resumed conversation');

            fs.rmSync(tmpDir, { recursive: true, force: true });
        });

        it('should fall through when --resume points to a JSONL that does not exist', async () => {
            const processes: ProcessInfo[] = [
                {
                    pid: 41921,
                    command: 'claude --resume aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
                    cwd: '/project/missing',
                    tty: 'ttys001',
                    startTime: new Date(),
                },
            ];
            mockedListAgentProcesses.mockReturnValue(processes);
            mockedEnrichProcesses.mockReturnValue(processes);

            // No projects dir, no PID file → both matchers fail → process-only
            (adapter as any).projectsDir = '/nonexistent';
            (adapter as any).sessionsDir = '/nonexistent';

            const agents = await adapter.detectAgents();

            expect(agents).toHaveLength(1);
            expect(agents[0].sessionId).toBe('pid-41921');
            expect(agents[0].status).toBe(AgentStatus.IDLE);
        });

        it('should use PID file for direct match and skip legacy matching for that process', async () => {
            const startTime = new Date();
            const processes: ProcessInfo[] = [
                { pid: 55001, command: 'claude', cwd: '/project/direct', tty: 'ttys001', startTime },
            ];
            mockedListAgentProcesses.mockReturnValue(processes);
            mockedEnrichProcesses.mockReturnValue(processes);

            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-pid-test-'));
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

        it('should prefer PID-file live status over JSONL-derived status and surface waitingFor in summary', async () => {
            const startTime = new Date();
            const processes: ProcessInfo[] = [
                { pid: 55050, command: 'claude', cwd: '/project/wait', tty: 'ttys001', startTime },
            ];
            mockedListAgentProcesses.mockReturnValue(processes);
            mockedEnrichProcesses.mockReturnValue(processes);

            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-pid-wait-'));
            const sessionsDir = path.join(tmpDir, 'sessions');
            const projectsDir = path.join(tmpDir, 'projects');
            const projDir = path.join(projectsDir, '-project-wait');
            fs.mkdirSync(sessionsDir, { recursive: true });
            fs.mkdirSync(projDir, { recursive: true });

            const sessionId = 'wait-session';
            const jsonlPath = path.join(projDir, `${sessionId}.jsonl`);
            // PID file's live status must win over JSONL-derived status.
            fs.writeFileSync(jsonlPath, [
                JSON.stringify({ type: 'user', timestamp: new Date().toISOString(), cwd: '/project/wait', message: { content: '/reddit-commenter' } }),
                JSON.stringify({ type: 'permission-mode', timestamp: new Date().toISOString(), permissionMode: 'default' }),
            ].join('\n'));

            fs.writeFileSync(
                path.join(sessionsDir, '55050.json'),
                JSON.stringify({
                    pid: 55050, sessionId, cwd: '/project/wait',
                    startedAt: startTime.getTime(),
                    kind: 'interactive', entrypoint: 'cli',
                    status: 'waiting', waitingFor: 'approve Read',
                }),
            );

            (adapter as any).sessionsDir = sessionsDir;
            (adapter as any).projectsDir = projectsDir;

            const agents = await adapter.detectAgents();

            expect(agents).toHaveLength(1);
            expect(agents[0].status).toBe(AgentStatus.WAITING);
            expect(agents[0].summary).toContain('/reddit-commenter');
            expect(agents[0].summary).toContain('waiting for approve Read');

            fs.rmSync(tmpDir, { recursive: true, force: true });
        });

        it('should resolve PID-file status: "idle" to AgentStatus.IDLE even when JSONL would say UNKNOWN', async () => {
            const startTime = new Date();
            const processes: ProcessInfo[] = [
                { pid: 55051, command: 'claude', cwd: '/project/idle', tty: 'ttys001', startTime },
            ];
            mockedListAgentProcesses.mockReturnValue(processes);
            mockedEnrichProcesses.mockReturnValue(processes);

            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-pid-idle-'));
            const sessionsDir = path.join(tmpDir, 'sessions');
            const projectsDir = path.join(tmpDir, 'projects');
            const projDir = path.join(projectsDir, '-project-idle');
            fs.mkdirSync(sessionsDir, { recursive: true });
            fs.mkdirSync(projDir, { recursive: true });

            const sessionId = 'idle-session';
            const jsonlPath = path.join(projDir, `${sessionId}.jsonl`);
            fs.writeFileSync(jsonlPath, [
                JSON.stringify({ type: 'user', timestamp: new Date().toISOString(), cwd: '/project/idle', message: { content: 'hello' } }),
                JSON.stringify({ type: 'permission-mode', timestamp: new Date().toISOString(), permissionMode: 'default' }),
            ].join('\n'));

            fs.writeFileSync(
                path.join(sessionsDir, '55051.json'),
                JSON.stringify({
                    pid: 55051, sessionId, cwd: '/project/idle',
                    startedAt: startTime.getTime(),
                    kind: 'interactive', entrypoint: 'cli',
                    status: 'idle',
                }),
            );

            (adapter as any).sessionsDir = sessionsDir;
            (adapter as any).projectsDir = projectsDir;

            const agents = await adapter.detectAgents();

            expect(agents).toHaveLength(1);
            expect(agents[0].status).toBe(AgentStatus.IDLE);
            // No waitingFor in PID file → summary is just the last user message
            expect(agents[0].summary).toBe('hello');

            fs.rmSync(tmpDir, { recursive: true, force: true });
        });

        it('should fall back to JSONL-derived status when PID-file status is missing or unrecognized', async () => {
            const startTime = new Date();
            const processes: ProcessInfo[] = [
                { pid: 55052, command: 'claude', cwd: '/project/legacy', tty: 'ttys001', startTime },
            ];
            mockedListAgentProcesses.mockReturnValue(processes);
            mockedEnrichProcesses.mockReturnValue(processes);

            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-pid-nostat-'));
            const sessionsDir = path.join(tmpDir, 'sessions');
            const projectsDir = path.join(tmpDir, 'projects');
            const projDir = path.join(projectsDir, '-project-legacy');
            fs.mkdirSync(sessionsDir, { recursive: true });
            fs.mkdirSync(projDir, { recursive: true });

            const sessionId = 'legacy-session';
            const jsonlPath = path.join(projDir, `${sessionId}.jsonl`);
            // Last entry is assistant → JSONL parser yields WAITING.
            fs.writeFileSync(jsonlPath, [
                JSON.stringify({ type: 'user', timestamp: new Date().toISOString(), cwd: '/project/legacy', message: { content: 'do the thing' } }),
                JSON.stringify({ type: 'assistant', timestamp: new Date().toISOString() }),
            ].join('\n'));

            // PID file with unrecognized status string — adapter must ignore it and use parser
            fs.writeFileSync(
                path.join(sessionsDir, '55052.json'),
                JSON.stringify({
                    pid: 55052, sessionId, cwd: '/project/legacy',
                    startedAt: startTime.getTime(),
                    kind: 'interactive', entrypoint: 'cli',
                    status: 'fantastical-future-state',
                }),
            );

            (adapter as any).sessionsDir = sessionsDir;
            (adapter as any).projectsDir = projectsDir;

            const agents = await adapter.detectAgents();

            expect(agents).toHaveLength(1);
            expect(agents[0].status).toBe(AgentStatus.WAITING);

            fs.rmSync(tmpDir, { recursive: true, force: true });
        });

        it('should pick up live status from PID file even when matched via --resume', async () => {
            const sessionId = 'aaaaaaaa-1111-2222-3333-444444444444';
            const startTime = new Date();
            const processes: ProcessInfo[] = [
                {
                    pid: 55053,
                    command: `claude --resume ${sessionId}`,
                    cwd: '/project/resume-wait',
                    tty: 'ttys001',
                    startTime,
                },
            ];
            mockedListAgentProcesses.mockReturnValue(processes);
            mockedEnrichProcesses.mockReturnValue(processes);

            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-resume-wait-'));
            const sessionsDir = path.join(tmpDir, 'sessions');
            const projectsDir = path.join(tmpDir, 'projects');
            const projDir = path.join(projectsDir, '-project-resume-wait');
            fs.mkdirSync(sessionsDir, { recursive: true });
            fs.mkdirSync(projDir, { recursive: true });

            const jsonlPath = path.join(projDir, `${sessionId}.jsonl`);
            fs.writeFileSync(jsonlPath, [
                JSON.stringify({ type: 'user', timestamp: new Date().toISOString(), cwd: '/project/resume-wait', message: { content: 'resumed work' } }),
                JSON.stringify({ type: 'permission-mode', timestamp: new Date().toISOString(), permissionMode: 'default' }),
            ].join('\n'));

            fs.writeFileSync(
                path.join(sessionsDir, '55053.json'),
                JSON.stringify({
                    pid: 55053, sessionId, cwd: '/project/resume-wait',
                    startedAt: startTime.getTime(),
                    kind: 'interactive', entrypoint: 'cli',
                    status: 'waiting', waitingFor: 'approve Bash',
                }),
            );

            (adapter as any).sessionsDir = sessionsDir;
            (adapter as any).projectsDir = projectsDir;

            const agents = await adapter.detectAgents();

            expect(agents).toHaveLength(1);
            expect(agents[0].status).toBe(AgentStatus.WAITING);
            expect(agents[0].summary).toContain('resumed work');
            expect(agents[0].summary).toContain('waiting for approve Bash');

            fs.rmSync(tmpDir, { recursive: true, force: true });
        });

        it('should fall back to process-only when direct-matched JSONL becomes unreadable', async () => {
            const startTime = new Date();
            const processes: ProcessInfo[] = [
                { pid: 66001, command: 'claude', cwd: '/project/gone', tty: 'ttys001', startTime },
            ];
            mockedListAgentProcesses.mockReturnValue(processes);
            mockedEnrichProcesses.mockReturnValue(processes);

            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-gone-'));
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
            vi.spyOn((adapter as any).parser, 'readSession').mockReturnValueOnce(null);

            const agents = await adapter.detectAgents();

            // matchedPids.delete called → process falls back to IDLE
            expect(agents).toHaveLength(1);
            expect(agents[0].sessionId).toBe('pid-66001');
            expect(agents[0].status).toBe(AgentStatus.IDLE);

            fs.rmSync(tmpDir, { recursive: true, force: true });
            vi.restoreAllMocks();
        });

        it('should fall back to process-only when legacy-matched JSONL becomes unreadable', async () => {
            const startTime = new Date();
            const processes: ProcessInfo[] = [
                { pid: 66002, command: 'claude', cwd: '/project/legacy-gone', tty: 'ttys001', startTime },
            ];
            mockedListAgentProcesses.mockReturnValue(processes);
            mockedEnrichProcesses.mockReturnValue(processes);

            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-lgone-'));
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
            vi.spyOn((adapter as any).parser, 'readSession').mockReturnValueOnce(null);

            const agents = await adapter.detectAgents();

            expect(agents).toHaveLength(1);
            expect(agents[0].sessionId).toBe('pid-66002');
            expect(agents[0].status).toBe(AgentStatus.IDLE);

            fs.rmSync(tmpDir, { recursive: true, force: true });
            vi.restoreAllMocks();
        });

        it('should mix direct PID-file matches and legacy matches across processes', async () => {
            const startTime = new Date();
            const processes: ProcessInfo[] = [
                { pid: 55002, command: 'claude', cwd: '/project/alpha', tty: 'ttys001', startTime },
                { pid: 55003, command: 'claude', cwd: '/project/beta', tty: 'ttys002', startTime },
            ];
            mockedListAgentProcesses.mockReturnValue(processes);
            mockedEnrichProcesses.mockReturnValue(processes);

            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-mix-test-'));
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
            tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-test-'));
            (adapter as any).projectsDir = path.join(tmpDir, 'projects');
        });

        afterEach(() => {
            fs.rmSync(tmpDir, { recursive: true, force: true });
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
            tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-conv-'));
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

    describe('listSessions', () => {
        let tmpDir: string;
        let projectsDir: string;

        beforeEach(() => {
            tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-list-'));
            projectsDir = path.join(tmpDir, 'projects');
            fs.mkdirSync(projectsDir, { recursive: true });
            (adapter as any).projectsDir = projectsDir;
        });

        afterEach(() => {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        });

        function writeSession(projectDir: string, sessionId: string, lines: object[]): string {
            fs.mkdirSync(projectDir, { recursive: true });
            const filePath = path.join(projectDir, `${sessionId}.jsonl`);
            fs.writeFileSync(filePath, lines.map((l) => JSON.stringify(l)).join('\n'));
            return filePath;
        }

        it('returns empty when projects dir does not exist', async () => {
            fs.rmSync(projectsDir, { recursive: true, force: true });
            const result = await adapter.listSessions();
            expect(result).toEqual([]);
        });

        it('returns sessions from a single cwd-scoped project dir', async () => {
            const cwd = '/Users/test/proj';
            const projDir = path.join(projectsDir, '-Users-test-proj');
            const filePath = writeSession(projDir, 'sess-1', [
                { type: 'user', timestamp: '2025-01-01T00:00:00Z', cwd, message: { content: 'first prompt' } },
                { type: 'assistant', timestamp: '2025-01-01T00:01:00Z' },
            ]);

            const result = await adapter.listSessions({ cwd });

            expect(result).toHaveLength(1);
            expect(result[0]).toMatchObject({
                type: 'claude',
                sessionId: 'sess-1',
                cwd,
                firstUserMessage: 'first prompt',
                sessionFilePath: filePath,
            });
            expect(result[0].lastActive).toBeInstanceOf(Date);
            expect(result[0].startedAt).toBeInstanceOf(Date);
        });

        it('lists sessions from all project dirs when no cwd filter', async () => {
            const cwdA = '/Users/test/proj-a';
            const cwdB = '/Users/test/proj-b';
            writeSession(path.join(projectsDir, '-Users-test-proj-a'), 'a', [
                { type: 'user', timestamp: '2025-01-01T00:00:00Z', cwd: cwdA, message: { content: 'msg-a' } },
            ]);
            writeSession(path.join(projectsDir, '-Users-test-proj-b'), 'b', [
                { type: 'user', timestamp: '2025-01-02T00:00:00Z', cwd: cwdB, message: { content: 'msg-b' } },
            ]);

            const result = await adapter.listSessions();

            expect(result).toHaveLength(2);
            expect(result.map((r) => r.sessionId).sort()).toEqual(['a', 'b']);
            const cwds = result.map((r) => r.cwd).sort();
            expect(cwds).toEqual([cwdA, cwdB]);
        });

        it('drops sessions whose recorded cwd does not match opts.cwd (strict equality)', async () => {
            const cwdReal = '/Users/test/foo';
            const cwdRequested = '/Users/test/foo/sub';
            writeSession(path.join(projectsDir, '-Users-test-foo'), 's', [
                { type: 'user', timestamp: '2025-01-01T00:00:00Z', cwd: cwdReal, message: { content: 'hi' } },
            ]);

            // Encoded dir for the requested cwd doesn't exist → return []
            const result = await adapter.listSessions({ cwd: cwdRequested });
            expect(result).toEqual([]);
        });

        it('drops sessions whose recorded cwd disagrees with the encoded dir', async () => {
            // Edge case: encoded dir lookup matches, but session content
            // records a different cwd. Strict-equality filter must reject.
            const requested = '/Users/test/proj';
            const projDir = path.join(projectsDir, '-Users-test-proj');
            writeSession(projDir, 's', [
                { type: 'user', timestamp: '2025-01-01T00:00:00Z', cwd: '/different/path', message: { content: 'mismatch' } },
            ]);

            const result = await adapter.listSessions({ cwd: requested });
            expect(result).toEqual([]);
        });

        it('finds sessions whose recorded cwd lives in a different encoded dir (worktree case)', async () => {
            // Real-world case: Claude Code is launched in /repo, then chdirs into
            // /repo/.worktrees/feature. The session file is stored under the
            // ENCODED launch dir, but its content records the worktree path.
            // listSessions({ cwd: worktree }) must still find it.
            const launchDir = path.join(projectsDir, '-repo');
            const worktreeCwd = '/repo/.worktrees/feature';
            writeSession(launchDir, 'wt', [
                { type: 'user', timestamp: '2025-01-01T00:00:00Z', cwd: worktreeCwd, message: { content: 'in worktree' } },
            ]);

            const result = await adapter.listSessions({ cwd: worktreeCwd });
            expect(result).toHaveLength(1);
            expect(result[0]).toMatchObject({
                sessionId: 'wt',
                cwd: worktreeCwd,
                firstUserMessage: 'in worktree',
            });
        });

        it('skips malformed session files', async () => {
            const cwd = '/Users/test/p';
            const projDir = path.join(projectsDir, '-Users-test-p');
            fs.mkdirSync(projDir, { recursive: true });
            fs.writeFileSync(path.join(projDir, 'bad.jsonl'), 'not valid json');
            writeSession(projDir, 'good', [
                { type: 'user', timestamp: '2025-01-01T00:00:00Z', cwd, message: { content: 'ok' } },
            ]);

            const result = await adapter.listSessions({ cwd });
            expect(result).toHaveLength(1);
            expect(result[0].sessionId).toBe('good');
        });

        it('captures first user message after filtering noise', async () => {
            const cwd = '/Users/test/q';
            writeSession(path.join(projectsDir, '-Users-test-q'), 's', [
                { type: 'user', timestamp: '2025-01-01T00:00:00Z', cwd, message: { content: 'Tool loaded.' } },
                { type: 'user', timestamp: '2025-01-01T00:00:01Z', cwd, message: { content: 'real first prompt' } },
                { type: 'user', timestamp: '2025-01-01T00:00:02Z', cwd, message: { content: 'second prompt' } },
            ]);

            const result = await adapter.listSessions({ cwd });
            expect(result).toHaveLength(1);
            expect(result[0].firstUserMessage).toBe('real first prompt');
        });

        it('returns empty firstUserMessage when no user message exists', async () => {
            const cwd = '/Users/test/empty';
            writeSession(path.join(projectsDir, '-Users-test-empty'), 's', [
                { type: 'assistant', timestamp: '2025-01-01T00:00:00Z' },
            ]);

            const result = await adapter.listSessions({ cwd });
            expect(result).toHaveLength(1);
            expect(result[0].firstUserMessage).toBe('');
        });
    });
});

/**
 * Tests for CopilotAdapter
 */

import type { MockedFunction } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { CopilotAdapter } from '../../adapters/CopilotAdapter.js';
import type { ProcessInfo } from '../../adapters/AgentAdapter.js';
import { AgentStatus } from '../../adapters/AgentAdapter.js';
import { listAgentProcesses, enrichProcesses } from '../../utils/process.js';
import { generateAgentName } from '../../utils/matching.js';

vi.mock('../../utils/process.js', () => ({
    listAgentProcesses: vi.fn(),
    enrichProcesses: vi.fn(),
}));

vi.mock('../../utils/matching.js', () => ({
    generateAgentName: vi.fn(),
}));

const mockedListAgentProcesses = listAgentProcesses as MockedFunction<typeof listAgentProcesses>;
const mockedEnrichProcesses = enrichProcesses as MockedFunction<typeof enrichProcesses>;
const mockedGenerateAgentName = generateAgentName as MockedFunction<typeof generateAgentName>;

describe('CopilotAdapter', () => {
    let adapter: CopilotAdapter;
    let tmpDir: string;
    let sessionStateDir: string;

    beforeEach(() => {
        adapter = new CopilotAdapter();
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-test-'));
        sessionStateDir = path.join(tmpDir, 'session-state');
        fs.mkdirSync(sessionStateDir, { recursive: true });
        (adapter as any).sessionStateDir = sessionStateDir;

        mockedListAgentProcesses.mockReset();
        mockedEnrichProcesses.mockReset();
        mockedGenerateAgentName.mockReset();
        mockedEnrichProcesses.mockImplementation((procs) => procs);
        mockedGenerateAgentName.mockImplementation((cwd, pid) => `${path.basename(cwd) || 'unknown'} (${pid})`);
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    function writeSession(
        sessionId: string,
        options: {
            events?: Array<object | string>;
            workspace?: Record<string, string>;
            lockPid?: number | string;
        },
    ): string {
        const sessionDir = path.join(sessionStateDir, sessionId);
        fs.mkdirSync(sessionDir, { recursive: true });

        if (options.events) {
            const lines = options.events.map((entry) => (
                typeof entry === 'string' ? entry : JSON.stringify(entry)
            ));
            fs.writeFileSync(path.join(sessionDir, 'events.jsonl'), lines.join('\n'));
        }

        if (options.workspace) {
            const lines = Object.entries(options.workspace).map(([key, value]) => `${key}: ${value}`);
            fs.writeFileSync(path.join(sessionDir, 'workspace.yaml'), lines.join('\n'));
        }

        if (options.lockPid !== undefined) {
            fs.writeFileSync(path.join(sessionDir, `inuse.${options.lockPid}.lock`), '');
        }

        return sessionDir;
    }

    function sessionStart(sessionId: string, cwd: string, startTime = '2026-06-09T09:50:00.000Z'): object {
        return {
            type: 'session.start',
            data: {
                sessionId,
                startTime,
                context: {
                    cwd,
                    gitRoot: cwd,
                    branch: 'main',
                },
            },
            timestamp: startTime,
        };
    }

    describe('initialization', () => {
        it('exposes copilot type', () => {
            expect(adapter.type).toBe('copilot');
        });
    });

    describe('canHandle', () => {
        it('returns true for copilot commands', () => {
            expect(adapter.canHandle({ pid: 1, command: 'copilot', cwd: '/repo', tty: 'ttys001' })).toBe(true);
        });

        it('returns true for full-path Homebrew copilot commands', () => {
            expect(adapter.canHandle({
                pid: 2,
                command: '/opt/homebrew/Caskroom/copilot-cli/1.0.60/copilot',
                cwd: '/repo',
                tty: 'ttys002',
            })).toBe(true);
        });

        it('returns true for copilot.exe commands', () => {
            expect(adapter.canHandle({ pid: 3, command: '/usr/bin/copilot.exe', cwd: '/repo', tty: 'ttys003' })).toBe(true);
        });

        it('returns false when copilot appears only in an argument', () => {
            expect(adapter.canHandle({
                pid: 4,
                command: 'node /repo/copilot-plugin/index.js',
                cwd: '/repo',
                tty: 'ttys004',
            })).toBe(false);
        });
    });

    describe('detectAgents', () => {
        it('returns empty list when no copilot process is running', async () => {
            mockedListAgentProcesses.mockReturnValue([]);

            const agents = await adapter.detectAgents();

            expect(agents).toEqual([]);
            expect(mockedListAgentProcesses).toHaveBeenCalledWith('copilot');
        });

        it('maps matching inuse lock and events to an active agent', async () => {
            const processes: ProcessInfo[] = [
                { pid: 14096, command: '/opt/homebrew/Caskroom/copilot-cli/1.0.60/copilot', cwd: '/repo', tty: 'ttys001' },
            ];
            mockedListAgentProcesses.mockReturnValue(processes);
            mockedEnrichProcesses.mockReturnValue(processes);
            writeSession('sess-a', {
                lockPid: 14096,
                events: [
                    sessionStart('sess-a', '/repo', '2026-06-09T09:50:00.000Z'),
                    { type: 'user.message', data: { content: 'Build the Copilot adapter' }, timestamp: new Date().toISOString() },
                    { type: 'assistant.message', data: { content: 'I will inspect the code.' }, timestamp: new Date().toISOString() },
                ],
                workspace: {
                    id: 'sess-a',
                    cwd: '/fallback',
                    name: 'Fallback Name',
                    created_at: '2026-06-09T09:49:00.000Z',
                    updated_at: '2026-06-09T09:51:00.000Z',
                },
            });

            const agents = await adapter.detectAgents();

            expect(agents).toHaveLength(1);
            expect(agents[0]).toMatchObject({
                type: 'copilot',
                status: AgentStatus.WAITING,
                pid: 14096,
                projectPath: '/repo',
                sessionId: 'sess-a',
                summary: 'Build the Copilot adapter',
                sessionFilePath: path.join(sessionStateDir, 'sess-a', 'events.jsonl'),
            });
        });

        it('ignores invalid and unmatched lock PIDs', async () => {
            const processes: ProcessInfo[] = [
                { pid: 100, command: 'copilot', cwd: '/repo', tty: 'ttys001' },
            ];
            mockedListAgentProcesses.mockReturnValue(processes);
            mockedEnrichProcesses.mockReturnValue(processes);
            writeSession('invalid', {
                lockPid: 'not-a-pid',
                events: [sessionStart('invalid', '/invalid')],
            });
            writeSession('unmatched', {
                lockPid: 999999,
                events: [sessionStart('unmatched', '/unmatched')],
            });

            const agents = await adapter.detectAgents();

            expect(agents).toHaveLength(1);
            expect(agents[0]).toMatchObject({
                pid: 100,
                sessionId: 'pid-100',
                summary: 'Copilot process running',
            });
        });

        it('falls back to process-only agent when no session lock matches', async () => {
            const processes: ProcessInfo[] = [
                { pid: 200, command: 'copilot', cwd: '/repo-b', tty: 'ttys002' },
            ];
            mockedListAgentProcesses.mockReturnValue(processes);
            mockedEnrichProcesses.mockReturnValue(processes);

            const agents = await adapter.detectAgents();

            expect(agents).toHaveLength(1);
            expect(agents[0]).toMatchObject({
                type: 'copilot',
                status: AgentStatus.RUNNING,
                pid: 200,
                projectPath: '/repo-b',
                sessionId: 'pid-200',
                summary: 'Copilot process running',
            });
        });

        it('does not add duplicate process-only agent for wrapper process in the same terminal', async () => {
            const processes: ProcessInfo[] = [
                { pid: 14095, command: 'copilot', cwd: '/repo', tty: 'ttys001' },
                { pid: 14096, command: '/opt/homebrew/Caskroom/copilot-cli/1.0.60/copilot', cwd: '/repo', tty: 'ttys001' },
            ];
            mockedListAgentProcesses.mockReturnValue(processes);
            mockedEnrichProcesses.mockReturnValue(processes);
            writeSession('sess-wrapper', {
                lockPid: 14096,
                events: [
                    sessionStart('sess-wrapper', '/repo', '2026-06-09T09:50:00.000Z'),
                    { type: 'user.message', data: { content: 'hello' }, timestamp: new Date().toISOString() },
                ],
            });

            const agents = await adapter.detectAgents();

            expect(agents).toHaveLength(1);
            expect(agents[0]).toMatchObject({
                pid: 14096,
                sessionId: 'sess-wrapper',
            });
        });

        it('uses workspace metadata when events are missing', async () => {
            const processes: ProcessInfo[] = [
                { pid: 300, command: 'copilot', cwd: '/proc-cwd', tty: 'ttys003' },
            ];
            mockedListAgentProcesses.mockReturnValue(processes);
            mockedEnrichProcesses.mockReturnValue(processes);
            writeSession('workspace-only', {
                lockPid: 300,
                workspace: {
                    id: 'workspace-only',
                    cwd: '/workspace-cwd',
                    name: 'Workspace Session',
                    created_at: '2026-06-09T09:00:00.000Z',
                    updated_at: '2026-06-09T09:10:00.000Z',
                },
            });

            const agents = await adapter.detectAgents();

            expect(agents).toHaveLength(1);
            expect(agents[0]).toMatchObject({
                pid: 300,
                projectPath: '/workspace-cwd',
                sessionId: 'workspace-only',
                summary: 'Workspace Session',
            });
        });
    });

    describe('getConversation', () => {
        it('parses user and assistant message events', () => {
            const sessionDir = writeSession('conv', {
                events: [
                    sessionStart('conv', '/repo'),
                    { type: 'user.message', data: { content: 'hello' }, timestamp: '2026-06-09T09:50:01.000Z' },
                    { type: 'assistant.message', data: { content: 'Hi there' }, timestamp: '2026-06-09T09:50:02.000Z' },
                ],
            });

            const messages = adapter.getConversation(path.join(sessionDir, 'events.jsonl'));

            expect(messages).toEqual([
                { role: 'user', content: 'hello', timestamp: '2026-06-09T09:50:01.000Z' },
                { role: 'assistant', content: 'Hi there', timestamp: '2026-06-09T09:50:02.000Z' },
            ]);
        });

        it('includes system/info/warning messages only in verbose mode', () => {
            const sessionDir = writeSession('verbose', {
                events: [
                    { type: 'session.warning', data: { message: 'MCP failed' }, timestamp: '2026-06-09T09:50:01.000Z' },
                    { type: 'tool.execution_complete', data: { result: { content: 'Tool result' } }, timestamp: '2026-06-09T09:50:02.000Z' },
                ],
            });
            const filePath = path.join(sessionDir, 'events.jsonl');

            expect(adapter.getConversation(filePath)).toEqual([]);
            expect(adapter.getConversation(filePath, { verbose: true })).toEqual([
                { role: 'system', content: 'MCP failed', timestamp: '2026-06-09T09:50:01.000Z' },
                { role: 'system', content: 'Tool result', timestamp: '2026-06-09T09:50:02.000Z' },
            ]);
        });

        it('skips malformed JSONL lines and missing text', () => {
            const sessionDir = writeSession('malformed', {
                events: [
                    'not json',
                    { type: 'user.message', data: { content: 'valid' }, timestamp: '2026-06-09T09:50:01.000Z' },
                    { type: 'assistant.message', data: {}, timestamp: '2026-06-09T09:50:02.000Z' },
                ],
            });

            const messages = adapter.getConversation(path.join(sessionDir, 'events.jsonl'));

            expect(messages).toEqual([
                { role: 'user', content: 'valid', timestamp: '2026-06-09T09:50:01.000Z' },
            ]);
        });

        it('returns empty array for missing file', () => {
            expect(adapter.getConversation(path.join(tmpDir, 'missing.jsonl'))).toEqual([]);
        });
    });

    describe('listSessions', () => {
        it('returns historical sessions without active locks', async () => {
            writeSession('history-a', {
                events: [
                    sessionStart('history-a', '/repo-a', '2026-06-09T09:00:00.000Z'),
                    { type: 'user.message', data: { content: 'first user' }, timestamp: '2026-06-09T09:00:01.000Z' },
                    { type: 'assistant.message', data: { content: 'answer' }, timestamp: '2026-06-09T09:00:02.000Z' },
                ],
            });
            writeSession('history-b', {
                events: [
                    sessionStart('history-b', '/repo-b', '2026-06-09T10:00:00.000Z'),
                    { type: 'user.message', data: { content: 'other user' }, timestamp: '2026-06-09T10:00:01.000Z' },
                ],
            });

            const sessions = await adapter.listSessions();

            expect(sessions).toHaveLength(2);
            const byId = Object.fromEntries(sessions.map((session) => [session.sessionId, session]));
            expect(byId['history-a']).toMatchObject({
                type: 'copilot',
                cwd: '/repo-a',
                firstUserMessage: 'first user',
                sessionFilePath: path.join(sessionStateDir, 'history-a', 'events.jsonl'),
            });
            expect(byId['history-b']).toMatchObject({
                type: 'copilot',
                cwd: '/repo-b',
                firstUserMessage: 'other user',
            });
        });

        it('applies strict cwd filter', async () => {
            writeSession('keep', { events: [sessionStart('keep', '/repo')] });
            writeSession('drop', { events: [sessionStart('drop', '/other')] });

            const sessions = await adapter.listSessions({ cwd: '/repo' });

            expect(sessions).toHaveLength(1);
            expect(sessions[0].sessionId).toBe('keep');
        });

        it('uses workspace fallback for historical sessions without events', async () => {
            writeSession('workspace-history', {
                workspace: {
                    id: 'workspace-history',
                    cwd: '/workspace-repo',
                    name: 'Workspace History',
                    created_at: '2026-06-09T08:00:00.000Z',
                    updated_at: '2026-06-09T08:10:00.000Z',
                },
            });

            const sessions = await adapter.listSessions();

            expect(sessions).toHaveLength(1);
            expect(sessions[0]).toMatchObject({
                type: 'copilot',
                sessionId: 'workspace-history',
                cwd: '/workspace-repo',
                firstUserMessage: '',
                sessionFilePath: path.join(sessionStateDir, 'workspace-history', 'events.jsonl'),
            });
        });

        it('skips session directories without events or workspace metadata', async () => {
            fs.mkdirSync(path.join(sessionStateDir, 'empty'), { recursive: true });

            const sessions = await adapter.listSessions();

            expect(sessions).toEqual([]);
        });

        it('returns empty when session-state directory does not exist', async () => {
            (adapter as any).sessionStateDir = path.join(tmpDir, 'missing');

            await expect(adapter.listSessions()).resolves.toEqual([]);
        });
    });
});

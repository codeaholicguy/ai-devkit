/**
 * Tests for KiroAdapter
 */

import type { MockedFunction } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { KiroAdapter } from '../../adapters/KiroAdapter.js';
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

describe('KiroAdapter', () => {
    let adapter: KiroAdapter;
    let tmpHome: string;
    let sessionsDir: string;

    beforeEach(() => {
        tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'kiro-adapter-test-'));
        process.env.HOME = tmpHome;
        sessionsDir = path.join(tmpHome, '.kiro', 'sessions', 'cli');
        fs.mkdirSync(sessionsDir, { recursive: true });

        adapter = new KiroAdapter();
        mockedListAgentProcesses.mockReset();
        mockedEnrichProcesses.mockReset();
        mockedGenerateAgentName.mockReset();

        mockedEnrichProcesses.mockImplementation((procs) => procs);
        mockedGenerateAgentName.mockImplementation((cwd: string, pid: number) => {
            const folder = path.basename(cwd) || 'unknown';
            return `${folder} (${pid})`;
        });
    });

    afterEach(() => {
        fs.rmSync(tmpHome, { recursive: true, force: true });
    });

    it('exposes kiro type', () => {
        expect(adapter.type).toBe('kiro');
    });

    it('identifies Kiro commands without matching unrelated paths', () => {
        expect(adapter.canHandle({ pid: 1, command: 'kiro-cli', cwd: '/repo', tty: 'ttys001' })).toBe(true);
        expect(adapter.canHandle({ pid: 2, command: '/usr/local/bin/kiro --model x', cwd: '/repo', tty: 'ttys002' })).toBe(true);
        expect(adapter.canHandle({ pid: 3, command: 'node /opt/kiro/bin/kiro-cli.js', cwd: '/repo', tty: 'ttys003' })).toBe(true);
        expect(adapter.canHandle({ pid: 4, command: 'node /repo/feature-kiro-adapter/script.js', cwd: '/repo', tty: 'ttys004' })).toBe(false);
    });

    it('maps a running Kiro process through its session lock and metadata', async () => {
        const cwd = '/repo/project-a';
        const proc = makeProcess({ pid: 101, cwd: '/process/cwd' });
        const updatedAt = new Date().toISOString();
        const sessionFile = writeKiroSession('sess-101', cwd, [
            prompt('implement Kiro adapter', 1781098057),
            assistantText('working on it'),
        ], 101, updatedAt);
        mockedListAgentProcesses.mockReturnValue([proc]);

        const agents = await adapter.detectAgents();

        expect(agents).toHaveLength(1);
        expect(agents[0]).toMatchObject({
            type: 'kiro',
            pid: 101,
            projectPath: cwd,
            sessionId: 'sess-101',
            summary: 'implement Kiro adapter',
            status: AgentStatus.WAITING,
            sessionFilePath: sessionFile,
            lastActive: new Date(updatedAt),
        });
    });

    it('uses only a lock whose PID belongs to a running Kiro process', async () => {
        writeKiroSession('ended-session', '/repo/ended', [
            prompt('old conversation', 1781098057),
        ]);
        writeKiroSession('other-process', '/repo/other', [
            prompt('other conversation', 1781098057),
        ], 999);
        const proc = makeProcess({ pid: 202, cwd: '/repo/current' });
        mockedListAgentProcesses.mockReturnValue([proc]);

        const agents = await adapter.detectAgents();

        expect(agents).toEqual([
            expect.objectContaining({
                pid: 202,
                projectPath: '/repo/current',
                sessionId: 'pid-202',
                summary: 'Kiro process running',
            }),
        ]);
    });

    it('ignores malformed lock files', async () => {
        writeKiroSession('bad-lock', '/repo/project', [prompt('hello', 1781098057)]);
        fs.writeFileSync(path.join(sessionsDir, 'bad-lock.lock'), '{bad json');
        const proc = makeProcess({ pid: 303, cwd: '/repo/project' });
        mockedListAgentProcesses.mockReturnValue([proc]);

        const agents = await adapter.detectAgents();

        expect(agents[0]).toMatchObject({ sessionId: 'pid-303' });
    });

    it('reports running while the latest assistant event invokes a tool', async () => {
        writeKiroSession('tool-session', '/repo/project', [
            prompt('inspect the file', Math.floor(Date.now() / 1000)),
            assistantTool('fs_read', { path: '/repo/project/file.ts' }),
        ], 404, new Date().toISOString());
        const proc = makeProcess({ pid: 404, cwd: '/repo/project' });
        mockedListAgentProcesses.mockReturnValue([proc]);

        const agents = await adapter.detectAgents();

        expect(agents[0].status).toBe(AgentStatus.RUNNING);
    });

    it('returns a process-only agent when the locked transcript is missing', async () => {
        fs.writeFileSync(path.join(sessionsDir, 'missing.lock'), JSON.stringify({ pid: 505 }));
        const proc = makeProcess({ pid: 505, cwd: '/repo/project-e' });
        mockedListAgentProcesses.mockReturnValue([proc]);

        const agents = await adapter.detectAgents();

        expect(agents).toEqual([
            expect.objectContaining({
                type: 'kiro',
                status: AgentStatus.RUNNING,
                pid: 505,
                projectPath: '/repo/project-e',
                sessionId: 'pid-505',
                summary: 'Kiro process running',
            }),
        ]);
    });

    it('reads real Kiro prompt and assistant message envelopes', () => {
        const sessionFile = writeKiroSession('conversation', '/repo/project-f', [
            prompt('hello kiro', 1781098057),
            assistantText('Hello! How can I help?'),
            '{not json',
        ]);

        expect(adapter.getConversation(sessionFile)).toEqual([
            { role: 'user', content: 'hello kiro', timestamp: '2026-06-10T13:27:37.000Z' },
            { role: 'assistant', content: 'Hello! How can I help?', timestamp: undefined },
        ]);
    });

    it('includes Kiro tool use and results only in verbose conversation mode', () => {
        const sessionFile = writeKiroSession('tools', '/repo/project-tools', [
            prompt('read package.json', 1781098057),
            assistantTool('fs_read', { path: 'package.json' }),
            toolResult('contents', 'success'),
            assistantText('Done.'),
        ]);

        expect(adapter.getConversation(sessionFile)).toEqual([
            { role: 'user', content: 'read package.json', timestamp: '2026-06-10T13:27:37.000Z' },
            { role: 'assistant', content: 'Done.', timestamp: undefined },
        ]);
        expect(adapter.getConversation(sessionFile, { verbose: true })).toEqual([
            { role: 'user', content: 'read package.json', timestamp: '2026-06-10T13:27:37.000Z' },
            { role: 'assistant', content: '[Tool: fs_read] {"path":"package.json"}', timestamp: undefined },
            { role: 'system', content: '[Tool Result] contents', timestamp: undefined },
            { role: 'assistant', content: 'Done.', timestamp: undefined },
        ]);
    });

    it('lists historical sessions using metadata and applies cwd filtering', async () => {
        const matchingCwd = '/repo/project-g';
        const matchingSession = writeKiroSession('sess-g', matchingCwd, [
            prompt('first matching message', 1781098057),
            assistantText('response'),
        ]);
        writeKiroSession('sess-h', '/repo/project-h', [
            prompt('other message', 1781098057),
        ]);

        const sessions = await adapter.listSessions({ cwd: matchingCwd });

        expect(sessions).toEqual([
            expect.objectContaining({
                type: 'kiro',
                sessionId: 'sess-g',
                cwd: matchingCwd,
                firstUserMessage: 'first matching message',
                startedAt: new Date('2026-06-10T13:27:17.000Z'),
                lastActive: new Date('2026-06-10T13:27:40.000Z'),
                sessionFilePath: matchingSession,
            }),
        ]);
    });

    function makeProcess(overrides: Partial<ProcessInfo>): ProcessInfo {
        return {
            pid: 1,
            command: 'kiro-cli chat',
            cwd: '/repo',
            tty: 'ttys001',
            startTime: new Date('2026-06-10T13:27:17.000Z'),
            ...overrides,
        };
    }

    function writeKiroSession(
        sessionId: string,
        cwd: string,
        entries: Array<Record<string, unknown> | string>,
        pid?: number,
        updatedAt = '2026-06-10T13:27:40.000Z',
    ): string {
        fs.writeFileSync(path.join(sessionsDir, `${sessionId}.json`), JSON.stringify({
            session_id: sessionId,
            cwd,
            created_at: '2026-06-10T13:27:17.000Z',
            updated_at: updatedAt,
            title: 'Session title',
        }));
        const filePath = path.join(sessionsDir, `${sessionId}.jsonl`);
        fs.writeFileSync(
            filePath,
            entries.map((entry) => typeof entry === 'string' ? entry : JSON.stringify(entry)).join('\n'),
        );
        if (pid !== undefined) {
            fs.writeFileSync(path.join(sessionsDir, `${sessionId}.lock`), JSON.stringify({
                pid,
                started_at: '2026-06-10T13:27:17.000Z',
            }));
        }
        return filePath;
    }

    function prompt(text: string, timestamp: number): Record<string, unknown> {
        return {
            version: 'v1',
            kind: 'Prompt',
            data: {
                content: [{ kind: 'text', data: text }],
                meta: { timestamp },
            },
        };
    }

    function assistantText(text: string): Record<string, unknown> {
        return {
            version: 'v1',
            kind: 'AssistantMessage',
            data: { content: [{ kind: 'text', data: text }] },
        };
    }

    function assistantTool(name: string, input: Record<string, unknown>): Record<string, unknown> {
        return {
            version: 'v1',
            kind: 'AssistantMessage',
            data: {
                content: [{
                    kind: 'toolUse',
                    data: { toolUseId: 'tool-1', name, input },
                }],
            },
        };
    }

    function toolResult(result: string, status: string): Record<string, unknown> {
        return {
            version: 'v1',
            kind: 'ToolResults',
            data: {
                content: [{
                    kind: 'toolResult',
                    data: { toolUseId: 'tool-1', status, result },
                }],
            },
        };
    }
});

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
import { AgentRegistry } from '../../utils/AgentRegistry.js';
import { listAgentProcesses, enrichProcesses } from '../../utils/process.js';
import { matchProcessesToSessions, generateAgentName } from '../../utils/matching.js';

vi.mock('../../utils/process.js', () => ({
    listAgentProcesses: vi.fn(),
    enrichProcesses: vi.fn(),
}));

vi.mock('../../utils/matching.js', () => ({
    matchProcessesToSessions: vi.fn(),
    generateAgentName: vi.fn(),
}));

const mockedListAgentProcesses = listAgentProcesses as MockedFunction<typeof listAgentProcesses>;
const mockedEnrichProcesses = enrichProcesses as MockedFunction<typeof enrichProcesses>;
const mockedMatchProcessesToSessions = matchProcessesToSessions as MockedFunction<typeof matchProcessesToSessions>;
const mockedGenerateAgentName = generateAgentName as MockedFunction<typeof generateAgentName>;

describe('KiroAdapter', () => {
    let adapter: KiroAdapter;
    let tmpHome: string;
    let sessionsDir: string;

    beforeEach(() => {
        tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'kiro-adapter-test-'));
        process.env.HOME = tmpHome;
        sessionsDir = path.join(tmpHome, '.kiro', 'cli', 'sessions');
        fs.mkdirSync(sessionsDir, { recursive: true });

        adapter = new KiroAdapter(new AgentRegistry(path.join(tmpHome, 'agents.json')));
        mockedListAgentProcesses.mockReset();
        mockedEnrichProcesses.mockReset();
        mockedMatchProcessesToSessions.mockReset();
        mockedGenerateAgentName.mockReset();

        mockedEnrichProcesses.mockImplementation((procs) => procs);
        mockedMatchProcessesToSessions.mockReturnValue([]);
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

    it('maps a running Kiro process to the tracker session for its PID', async () => {
        const cwd = '/repo/project-a';
        const proc = makeProcess({ pid: 101, cwd });
        const sessionFile = writeKiroSession(cwd, [
            { type: 'session_meta', timestamp: '2026-06-10T08:58:20.754Z', sessionId: 'sess-101', cwd },
            { role: 'user', timestamp: '2026-06-10T08:58:21.000Z', content: 'implement Kiro adapter' },
            { role: 'assistant', timestamp: new Date().toISOString(), content: 'working on it' },
        ]);
        fs.writeFileSync(
            path.join(tmpHome, '.kiro', 'cli', 'sessions.json'),
            JSON.stringify({ 101: sessionFile }),
        );
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
        });
        expect(mockedMatchProcessesToSessions).not.toHaveBeenCalled();
    });

    it('truncates long user prompts in detected agent summaries', async () => {
        const cwd = '/repo/project-long-summary';
        const proc = makeProcess({ pid: 112, cwd });
        const longPrompt = 'x'.repeat(140);
        const sessionFile = writeKiroSession(cwd, [
            { type: 'session', timestamp: '2026-06-10T08:58:20.754Z', id: 'sess-long', cwd },
            { role: 'user', timestamp: '2026-06-10T08:58:21.000Z', content: longPrompt },
        ]);
        fs.writeFileSync(
            path.join(tmpHome, '.kiro', 'cli', 'sessions.json'),
            JSON.stringify({ 112: sessionFile }),
        );
        mockedListAgentProcesses.mockReturnValue([proc]);

        const agents = await adapter.detectAgents();

        expect(agents[0].summary).toHaveLength(120);
        expect(agents[0].summary.endsWith('...')).toBe(true);
    });

    it('uses the filename session id fallback and reports running when the latest message is from the user', async () => {
        const cwd = '/repo/project-filename-fallback';
        const proc = makeProcess({ pid: 113, cwd });
        const sessionFile = writeKiroSessionWithFileName(cwd, 'plain-session.jsonl', [
            { role: 'user', timestamp: new Date().toISOString(), content: 'still working' },
        ]);
        fs.writeFileSync(
            path.join(tmpHome, '.kiro', 'cli', 'sessions.json'),
            JSON.stringify({ 113: sessionFile }),
        );
        mockedListAgentProcesses.mockReturnValue([proc]);

        const agents = await adapter.detectAgents();

        expect(agents[0]).toMatchObject({
            sessionId: 'plain-session',
            summary: 'still working',
            status: AgentStatus.RUNNING,
        });
    });

    it('falls back to legacy matching when sessions.json is missing', async () => {
        const cwd = '/repo/project-b';
        const proc = makeProcess({ pid: 202, cwd });
        const sessionFile = writeKiroSession(cwd, [
            { timestamp: '2026-06-10T08:58:20.754Z', sessionId: 'sess-202' },
            { role: 'user', timestamp: '2026-06-10T08:58:21.000Z', content: 'fallback matching please' },
        ]);
        mockedListAgentProcesses.mockReturnValue([proc]);
        mockedMatchProcessesToSessions.mockReturnValue([
            {
                process: proc,
                session: {
                    sessionId: 'sess-202',
                    filePath: sessionFile,
                    projectDir: path.dirname(sessionFile),
                    birthtimeMs: Date.now(),
                    resolvedCwd: cwd,
                },
                deltaMs: 0,
            },
        ]);

        const agents = await adapter.detectAgents();

        expect(agents).toHaveLength(1);
        expect(agents[0]).toMatchObject({
            type: 'kiro',
            pid: 202,
            projectPath: cwd,
            sessionId: 'sess-202',
            summary: 'fallback matching please',
        });
        expect(mockedMatchProcessesToSessions).toHaveBeenCalledWith(
            [proc],
            expect.arrayContaining([
                expect.objectContaining({ filePath: sessionFile, resolvedCwd: cwd }),
            ]),
        );
    });

    it('ignores malformed tracker metadata and still falls back to legacy matching', async () => {
        const cwd = '/repo/project-c';
        const proc = makeProcess({ pid: 303, cwd });
        const sessionFile = writeKiroSession(cwd, [
            { timestamp: '2026-06-10T08:58:20.754Z', sessionId: 'sess-303', cwd },
            { role: 'user', timestamp: '2026-06-10T08:58:21.000Z', content: 'recover from bad tracker' },
        ]);
        fs.writeFileSync(path.join(tmpHome, '.kiro', 'cli', 'sessions.json'), '{bad json');
        mockedListAgentProcesses.mockReturnValue([proc]);
        mockedMatchProcessesToSessions.mockReturnValue([
            {
                process: proc,
                session: {
                    sessionId: 'sess-303',
                    filePath: sessionFile,
                    projectDir: path.dirname(sessionFile),
                    birthtimeMs: Date.now(),
                    resolvedCwd: cwd,
                },
                deltaMs: 0,
            },
        ]);

        const agents = await adapter.detectAgents();

        expect(agents).toHaveLength(1);
        expect(agents[0].sessionId).toBe('sess-303');
    });

    it('falls back to legacy matching when a trusted tracker session is unparseable', async () => {
        const cwd = '/repo/project-bad-tracker-session';
        const proc = makeProcess({ pid: 304, cwd });
        const badSessionFile = writeKiroSessionWithFileName(cwd, 'bad.jsonl', ['{not json']);
        const fallbackSessionFile = writeKiroSession(cwd, [
            { timestamp: '2026-06-10T08:58:20.754Z', sessionId: 'sess-304', cwd },
            { role: 'user', timestamp: '2026-06-10T08:58:21.000Z', content: 'fallback after bad tracker session' },
        ]);
        fs.writeFileSync(
            path.join(tmpHome, '.kiro', 'cli', 'sessions.json'),
            JSON.stringify({ 304: badSessionFile }),
        );
        mockedListAgentProcesses.mockReturnValue([proc]);
        mockedMatchProcessesToSessions.mockReturnValue([
            {
                process: proc,
                session: {
                    sessionId: 'sess-304',
                    filePath: fallbackSessionFile,
                    projectDir: path.dirname(fallbackSessionFile),
                    birthtimeMs: Date.now(),
                    resolvedCwd: cwd,
                },
                deltaMs: 0,
            },
        ]);

        const agents = await adapter.detectAgents();

        expect(agents).toHaveLength(1);
        expect(agents[0]).toMatchObject({
            sessionId: 'sess-304',
            summary: 'fallback after bad tracker session',
            sessionFilePath: fallbackSessionFile,
        });
        expect(mockedMatchProcessesToSessions).toHaveBeenCalled();
    });

    it('does not trust tracker paths outside the Kiro sessions directory', async () => {
        const cwd = '/repo/project-d';
        const proc = makeProcess({ pid: 404, cwd });
        const outside = path.join(tmpHome, 'outside.jsonl');
        fs.writeFileSync(outside, JSON.stringify({ role: 'user', content: 'nope' }));
        fs.writeFileSync(
            path.join(tmpHome, '.kiro', 'cli', 'sessions.json'),
            JSON.stringify({ 404: outside }),
        );
        mockedListAgentProcesses.mockReturnValue([proc]);

        const agents = await adapter.detectAgents();

        expect(agents).toHaveLength(1);
        expect(agents[0]).toMatchObject({
            type: 'kiro',
            pid: 404,
            sessionId: 'pid-404',
            summary: 'Kiro process running',
        });
    });

    it('returns a process-only agent when no session can be matched', async () => {
        const proc = makeProcess({ pid: 505, cwd: '/repo/project-e' });
        mockedListAgentProcesses.mockReturnValue([proc]);

        const agents = await adapter.detectAgents();

        expect(agents).toHaveLength(1);
        expect(agents[0]).toMatchObject({
            type: 'kiro',
            status: AgentStatus.RUNNING,
            pid: 505,
            projectPath: '/repo/project-e',
            sessionId: 'pid-505',
            summary: 'Kiro process running',
        });
    });

    it('reads user and assistant conversation messages from JSONL', () => {
        const cwd = '/repo/project-f';
        const sessionFile = writeKiroSession(cwd, [
            { role: 'system', timestamp: '2026-06-10T08:58:20.000Z', content: 'hidden' },
            { role: 'user', timestamp: '2026-06-10T08:58:21.000Z', content: 'hello kiro' },
            { type: 'assistant', timestamp: '2026-06-10T08:58:22.000Z', message: { content: 'hello human' } },
            '{not json',
        ]);

        expect(adapter.getConversation(sessionFile)).toEqual([
            { role: 'user', content: 'hello kiro', timestamp: '2026-06-10T08:58:21.000Z' },
            { role: 'assistant', content: 'hello human', timestamp: '2026-06-10T08:58:22.000Z' },
        ]);
    });

    it('includes system entries only in verbose conversation mode', () => {
        const cwd = '/repo/project-verbose';
        const sessionFile = writeKiroSession(cwd, [
            { role: 'system', timestamp: '2026-06-10T08:58:20.000Z', content: 'model changed' },
            { role: 'user', timestamp: '2026-06-10T08:58:21.000Z', content: 'visible' },
        ]);

        expect(adapter.getConversation(sessionFile)).toEqual([
            { role: 'user', content: 'visible', timestamp: '2026-06-10T08:58:21.000Z' },
        ]);
        expect(adapter.getConversation(sessionFile, { verbose: true })).toEqual([
            { role: 'system', content: 'model changed', timestamp: '2026-06-10T08:58:20.000Z' },
            { role: 'user', content: 'visible', timestamp: '2026-06-10T08:58:21.000Z' },
        ]);
    });

    it('reads real Kiro message entries with nested role and text parts', async () => {
        const cwd = '/repo/project-real';
        const proc = makeProcess({ pid: 606, cwd });
        const sessionFile = writeKiroSession(cwd, [
            { type: 'session', version: 3, id: 'sess-real', timestamp: '2026-06-10T13:27:17.581Z', cwd },
            { type: 'model_change', id: 'model-1', timestamp: '2026-06-10T13:27:17.655Z', modelId: 'claude-sonnet-4-6' },
            {
                type: 'message',
                id: 'msg-user',
                timestamp: '2026-06-10T13:27:37.975Z',
                message: {
                    role: 'user',
                    content: [{ type: 'text', text: 'hello' }],
                    timestamp: 1781098057974,
                },
            },
            {
                type: 'message',
                id: 'msg-assistant',
                timestamp: '2026-06-10T13:27:40.161Z',
                message: {
                    role: 'assistant',
                    content: [{ type: 'text', text: 'Hello! How can I help you today?' }],
                    provider: 'anthropic',
                    model: 'claude-sonnet-4-6',
                    timestamp: 1781098058012,
                },
            },
        ]);
        fs.writeFileSync(
            path.join(tmpHome, '.kiro', 'cli', 'sessions.json'),
            JSON.stringify({ 606: sessionFile }),
        );
        mockedListAgentProcesses.mockReturnValue([proc]);

        expect(adapter.getConversation(sessionFile)).toEqual([
            { role: 'user', content: 'hello', timestamp: '2026-06-10T13:27:37.975Z' },
            { role: 'assistant', content: 'Hello! How can I help you today?', timestamp: '2026-06-10T13:27:40.161Z' },
        ]);

        const agents = await adapter.detectAgents();
        expect(agents[0]).toMatchObject({
            sessionId: 'sess-real',
            summary: 'hello',
            lastActive: new Date('2026-06-10T13:27:40.161Z'),
        });
    });

    it('lists historical sessions and applies cwd filtering', async () => {
        const matchingCwd = '/repo/project-g';
        const otherCwd = '/repo/project-h';
        const matchingSession = writeKiroSession(matchingCwd, [
            { timestamp: '2026-06-10T08:58:20.754Z', sessionId: 'sess-g', cwd: matchingCwd },
            { role: 'user', timestamp: '2026-06-10T08:58:21.000Z', content: 'first matching message' },
        ]);
        writeKiroSession(otherCwd, [
            { timestamp: '2026-06-10T08:58:20.754Z', sessionId: 'sess-h', cwd: otherCwd },
            { role: 'user', timestamp: '2026-06-10T08:58:21.000Z', content: 'other message' },
        ]);

        const sessions = await adapter.listSessions({ cwd: matchingCwd });

        expect(sessions).toEqual([
            expect.objectContaining({
                type: 'kiro',
                sessionId: 'sess-g',
                cwd: matchingCwd,
                firstUserMessage: 'first matching message',
                sessionFilePath: matchingSession,
            }),
        ]);
    });

    function makeProcess(overrides: Partial<ProcessInfo>): ProcessInfo {
        return {
            pid: 1,
            command: 'kiro',
            cwd: '/repo',
            tty: 'ttys001',
            startTime: new Date('2026-06-10T08:58:20.000Z'),
            ...overrides,
        };
    }

    function writeKiroSession(cwd: string, entries: Array<Record<string, unknown> | string>): string {
        const projectDir = path.join(sessionsDir, encodeProjectDir(cwd));
        fs.mkdirSync(projectDir, { recursive: true });
        const sessionId = entries
            .map((entry) => typeof entry === 'string' ? undefined : entry.sessionId)
            .find((value): value is string => typeof value === 'string') ?? cryptoRandomSessionId();
        const filePath = path.join(projectDir, `2026-06-10T08-58-20-754Z_${sessionId}.jsonl`);
        fs.writeFileSync(
            filePath,
            entries.map((entry) => typeof entry === 'string' ? entry : JSON.stringify(entry)).join('\n'),
        );
        return filePath;
    }

    function writeKiroSessionWithFileName(cwd: string, fileName: string, entries: Array<Record<string, unknown> | string>): string {
        const projectDir = path.join(sessionsDir, encodeProjectDir(cwd));
        fs.mkdirSync(projectDir, { recursive: true });
        const filePath = path.join(projectDir, fileName);
        fs.writeFileSync(
            filePath,
            entries.map((entry) => typeof entry === 'string' ? entry : JSON.stringify(entry)).join('\n'),
        );
        return filePath;
    }

    function encodeProjectDir(cwd: string): string {
        return cwd.replace(/\//g, '-').replace(/^-?/, '--') + '--';
    }

    function cryptoRandomSessionId(): string {
        return `019eb0c1-06d2-71ed-90ee-${Math.random().toString(16).slice(2, 14).padEnd(12, '0')}`;
    }
});

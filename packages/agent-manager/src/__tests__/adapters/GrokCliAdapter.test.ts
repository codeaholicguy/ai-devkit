/**
 * Tests for GrokCliAdapter
 *
 * The adapter resolves a live process to its cwd via ~/.grok/active_sessions.json
 * and reads session details from chat_history.jsonl (not summary.json/updates.jsonl).
 */

import type { MockedFunction } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { GrokCliAdapter } from '../../adapters/GrokCliAdapter.js';
import type { ProcessInfo } from '../../adapters/AgentAdapter.js';
import { AgentStatus } from '../../adapters/AgentAdapter.js';
import { listAgentProcesses, enrichProcesses } from '../../utils/process.js';
import { generateAgentName } from '../../utils/matching.js';

vi.mock('../../utils/process.js', async (importOriginal) => {
    const actual = (await importOriginal()) as typeof import('../../utils/process.js');
    return {
        ...actual,
        listAgentProcesses: vi.fn(),
        enrichProcesses: vi.fn(),
    };
});

vi.mock('../../utils/matching.js', async (importOriginal) => {
    const actual = (await importOriginal()) as typeof import('../../utils/matching.js');
    return {
        ...actual,
        generateAgentName: vi.fn(),
    };
});

const mockedListAgentProcesses = listAgentProcesses as MockedFunction<typeof listAgentProcesses>;
const mockedEnrichProcesses = enrichProcesses as MockedFunction<typeof enrichProcesses>;
const mockedGenerateAgentName = generateAgentName as MockedFunction<typeof generateAgentName>;

const SESSION_ID = '019f16c3-5d5d-7dc3-85d1-bc629416ca2d';

/** A user transcript record: the real prompt wrapped in <user_query> like Grok writes it. */
const userRecord = (text: string) => ({
    type: 'user',
    content: [{ type: 'text', text: `<user_query>\n${text}\n</user_query>` }],
});
/** A user context-injection record (no <user_query>) — should be ignored as a prompt. */
const contextRecord = (text: string) => ({ type: 'user', content: [{ type: 'text', text }] });
const assistantRecord = (text: string) => ({ type: 'assistant', content: [{ type: 'text', text }] });
const systemRecord = (text: string) => ({ type: 'system', content: text });

describe('GrokCliAdapter', () => {
    let adapter: GrokCliAdapter;
    let tmpHome: string;
    let cwd: string;

    beforeEach(() => {
        tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'grok-adapter-test-'));
        process.env.HOME = tmpHome;
        delete process.env.GROK_HOME;
        cwd = '/Users/dev/my-project';

        adapter = new GrokCliAdapter();

        mockedListAgentProcesses.mockReset();
        mockedEnrichProcesses.mockReset();
        mockedGenerateAgentName.mockReset();

        mockedEnrichProcesses.mockImplementation((procs) => procs);
        mockedGenerateAgentName.mockImplementation((c: string, pid: number) => `${path.basename(c) || 'unknown'}-${pid}`);
    });

    afterEach(() => {
        fs.rmSync(tmpHome, { recursive: true, force: true });
    });

    /** Write a session dir under ~/.grok/sessions/<enc(cwd)>/<id>/chat_history.jsonl. */
    function writeSession(opts: {
        sessionCwd?: string;
        id?: string;
        records?: object[];
        chat?: boolean;
        mtime?: Date;
    }): string {
        const sessionCwd = opts.sessionCwd ?? cwd;
        const id = opts.id ?? SESSION_ID;
        const sessionDir = path.join(tmpHome, '.grok', 'sessions', encodeURIComponent(sessionCwd), id);
        fs.mkdirSync(sessionDir, { recursive: true });

        if (opts.chat !== false) {
            const records = opts.records ?? [userRecord('fix the bug')];
            const chatPath = path.join(sessionDir, 'chat_history.jsonl');
            fs.writeFileSync(chatPath, records.map((r) => JSON.stringify(r)).join('\n'));
            if (opts.mtime) fs.utimesSync(chatPath, opts.mtime, opts.mtime);
        }

        return sessionDir;
    }

    /** Write ~/.grok/active_sessions.json (the live pid -> cwd registry). */
    function writeActiveSessions(entries: Array<{ pid: number; cwd: string; opened_at?: number }>): void {
        fs.mkdirSync(path.join(tmpHome, '.grok'), { recursive: true });
        fs.writeFileSync(path.join(tmpHome, '.grok', 'active_sessions.json'), JSON.stringify(entries));
    }

    function proc(overrides: Partial<ProcessInfo> = {}): ProcessInfo {
        return { pid: 4242, ppid: 1, command: 'grok', cwd, tty: 'ttys010', startTime: new Date(), ...overrides };
    }

    describe('initialization', () => {
        it('exposes the grok_cli type', () => {
            expect(adapter.type).toBe('grok_cli');
        });
    });

    describe('canHandle', () => {
        it('returns true for a plain grok command', () => {
            expect(adapter.canHandle(proc({ command: 'grok' }))).toBe(true);
        });

        it('returns true for grok with a full path and args', () => {
            expect(adapter.canHandle(proc({ command: '/Users/dev/.grok/bin/grok --always-approve' }))).toBe(true);
        });

        it('returns false for non-grok processes', () => {
            expect(adapter.canHandle(proc({ command: 'node app.js' }))).toBe(false);
        });

        it('returns false when "grok" appears only in an argument path', () => {
            expect(adapter.canHandle(proc({ command: 'node /path/to/grok-thing.js' }))).toBe(false);
        });
    });

    describe('detectAgents', () => {
        it('returns [] when there are no grok processes', async () => {
            mockedListAgentProcesses.mockReturnValue([]);
            expect(await adapter.detectAgents()).toEqual([]);
        });

        it('resolves the cwd via active_sessions.json (authoritative over the process cwd)', async () => {
            const realCwd = '/Users/dev/real-project';
            writeSession({ sessionCwd: realCwd });
            // The process cwd is stale/wrong; active_sessions.json has the truth.
            writeActiveSessions([{ pid: 4242, cwd: realCwd, opened_at: 1 }]);
            mockedListAgentProcesses.mockReturnValue([proc({ cwd: '/wrong/path' })]);

            const agents = await adapter.detectAgents();

            expect(agents).toHaveLength(1);
            expect(agents[0]).toMatchObject({
                type: 'grok_cli',
                pid: 4242,
                projectPath: realCwd,
                sessionId: SESSION_ID,
                summary: 'fix the bug',
            });
            expect(agents[0].sessionFilePath).toBe(
                path.join(tmpHome, '.grok', 'sessions', encodeURIComponent(realCwd), SESSION_ID, 'chat_history.jsonl'),
            );
        });

        it('falls back to the process cwd when the pid is not in active_sessions.json', async () => {
            writeSession({});
            writeActiveSessions([{ pid: 9999, cwd: '/somewhere/else' }]);
            mockedListAgentProcesses.mockReturnValue([proc()]);

            const agents = await adapter.detectAgents();

            expect(agents[0]).toMatchObject({ projectPath: cwd, sessionId: SESSION_ID });
        });

        it('picks the most recently active session dir when a cwd has several', async () => {
            const older = new Date(Date.now() - 60 * 60 * 1000);
            writeSession({ id: '019f0000-0000-7000-8000-00000000000a', records: [userRecord('old one')], mtime: older });
            writeSession({ id: '019f0000-0000-7000-8000-00000000000b', records: [userRecord('newest one')] });
            mockedListAgentProcesses.mockReturnValue([proc()]);

            const agents = await adapter.detectAgents();

            expect(agents[0].sessionId).toBe('019f0000-0000-7000-8000-00000000000b');
            expect(agents[0].summary).toBe('newest one');
        });

        it('falls back to a process-only RUNNING agent when no session matches', async () => {
            mockedListAgentProcesses.mockReturnValue([proc()]);

            const agents = await adapter.detectAgents();

            expect(agents).toHaveLength(1);
            expect(agents[0].status).toBe(AgentStatus.RUNNING);
            expect(agents[0].sessionId).toBe('pid-4242');
            expect(agents[0].sessionFilePath).toBeUndefined();
        });

        it('treats a session dir without chat_history.jsonl as no match (process-only)', async () => {
            writeSession({ chat: false });
            mockedListAgentProcesses.mockReturnValue([proc()]);

            const agents = await adapter.detectAgents();

            expect(agents).toHaveLength(1);
            expect(agents[0].sessionId).toBe('pid-4242');
        });
    });

    describe('getConversation', () => {
        it('maps user (<user_query>) and assistant records to roles', () => {
            const dir = writeSession({ records: [userRecord('hi'), assistantRecord('hello')] });
            expect(adapter.getConversation(path.join(dir, 'chat_history.jsonl'))).toEqual([
                { role: 'user', content: 'hi' },
                { role: 'assistant', content: 'hello' },
            ]);
        });

        it('accepts a session dir path and skips context-injection user records', () => {
            const dir = writeSession({
                records: [contextRecord('<user_info>OS: macos</user_info>'), userRecord('do the thing')],
            });
            expect(adapter.getConversation(dir)).toEqual([{ role: 'user', content: 'do the thing' }]);
        });

        it('skips malformed lines', () => {
            const dir = writeSession({ records: [userRecord('hi')] });
            fs.appendFileSync(path.join(dir, 'chat_history.jsonl'), '\n{bad json');
            expect(adapter.getConversation(dir)).toEqual([{ role: 'user', content: 'hi' }]);
        });

        it('excludes system records unless verbose', () => {
            const dir = writeSession({ records: [systemRecord('You are Grok'), userRecord('go')] });
            expect(adapter.getConversation(dir)).toEqual([{ role: 'user', content: 'go' }]);
            expect(adapter.getConversation(dir, { verbose: true }).map((m) => m.role)).toEqual(['system', 'user']);
        });
    });

    describe('detectAgents status + summary mapping', () => {
        const detectFirst = async () => (await adapter.detectAgents())[0];

        it('marks WAITING when the last transcript turn is an assistant message', async () => {
            writeSession({ records: [userRecord('go'), assistantRecord('done')] });
            mockedListAgentProcesses.mockReturnValue([proc()]);
            expect((await detectFirst()).status).toBe(AgentStatus.WAITING);
        });

        it('marks RUNNING when the last transcript turn is a user message', async () => {
            writeSession({ records: [userRecord('still there?')] });
            mockedListAgentProcesses.mockReturnValue([proc()]);
            expect((await detectFirst()).status).toBe(AgentStatus.RUNNING);
        });

        it('marks IDLE when chat_history.jsonl is older than the threshold', async () => {
            const old = new Date(Date.now() - 10 * 60 * 1000);
            writeSession({ records: [userRecord('go')], mtime: old });
            mockedListAgentProcesses.mockReturnValue([proc()]);
            expect((await detectFirst()).status).toBe(AgentStatus.IDLE);
        });

        it('uses the last user prompt as the agent summary', async () => {
            writeSession({ records: [userRecord('refactor the parser'), assistantRecord('on it')] });
            mockedListAgentProcesses.mockReturnValue([proc()]);
            expect((await detectFirst()).summary).toBe('refactor the parser');
        });
    });

    describe('listSessions', () => {
        it('returns [] when the sessions dir does not exist', async () => {
            expect(await adapter.listSessions()).toEqual([]);
        });

        it('lists historical sessions with cwd decoded from the group dir', async () => {
            writeSession({});
            const summaries = await adapter.listSessions();
            expect(summaries).toHaveLength(1);
            expect(summaries[0]).toMatchObject({
                type: 'grok_cli',
                sessionId: SESSION_ID,
                cwd,
                firstUserMessage: 'fix the bug',
            });
            expect(summaries[0].sessionFilePath).toBe(
                path.join(tmpHome, '.grok', 'sessions', encodeURIComponent(cwd), SESSION_ID, 'chat_history.jsonl'),
            );
        });

        it('applies the cwd filter against the decoded cwd', async () => {
            writeSession({ sessionCwd: '/Users/dev/project-a', id: '019f0000-0000-7000-8000-00000000000a' });
            writeSession({ sessionCwd: '/Users/dev/project-b', id: '019f0000-0000-7000-8000-00000000000b' });

            const all = await adapter.listSessions();
            expect(all).toHaveLength(2);

            const filtered = await adapter.listSessions({ cwd: '/Users/dev/project-a' });
            expect(filtered).toHaveLength(1);
            expect(filtered[0].cwd).toBe('/Users/dev/project-a');
        });

        it('skips non-session entries (e.g. prompt_history.jsonl) in a group dir', async () => {
            writeSession({});
            // Grok writes a group-level prompt_history.jsonl alongside session dirs.
            fs.writeFileSync(
                path.join(tmpHome, '.grok', 'sessions', encodeURIComponent(cwd), 'prompt_history.jsonl'),
                '{"text":"noise"}',
            );
            const summaries = await adapter.listSessions();
            expect(summaries).toHaveLength(1);
        });
    });
});

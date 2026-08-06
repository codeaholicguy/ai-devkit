/**
 * Tests for AntigravityCliAdapter
 *
 * The adapter resolves a live `agy` process to its conversation via
 * ~/.gemini/antigravity-cli/cache/last_conversations.json (cwd -> conversationId)
 * and reads session details from brain/<id>/.system_generated/logs/transcript.jsonl.
 */

import type { MockedFunction } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { AntigravityCliAdapter } from '../../adapters/AntigravityCliAdapter.js';
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

const CONVERSATION_ID = '10485e13-2742-4e9e-b286-ac0606f0cb1e';

const iso = (d: Date) => d.toISOString().replace(/\.\d+Z$/, 'Z');
/** A user transcript record: real prompt wrapped in <USER_REQUEST> like agy writes it. */
const userRecord = (text: string, at?: Date) => ({
    source: 'USER_EXPLICIT',
    type: 'USER_INPUT',
    created_at: iso(at ?? new Date()),
    content: `<USER_REQUEST>\n${text}\n</USER_REQUEST>\n<ADDITIONAL_CONTEXT>ignored</ADDITIONAL_CONTEXT>`,
});
const modelRecord = (text: string, at?: Date) => ({
    source: 'MODEL',
    type: 'PLANNER_RESPONSE',
    created_at: iso(at ?? new Date()),
    content: text,
});
/** A MODEL tool-call record (e.g. RUN_COMMAND) — execution detail, not a reply. */
const toolRecord = (text: string, at?: Date) => ({
    source: 'MODEL',
    type: 'RUN_COMMAND',
    created_at: iso(at ?? new Date()),
    content: text,
});
const systemRecord = (text: string, at?: Date) => ({
    source: 'SYSTEM',
    type: 'CHECKPOINT',
    created_at: iso(at ?? new Date()),
    content: text,
});

describe('AntigravityCliAdapter', () => {
    let adapter: AntigravityCliAdapter;
    let base: string;
    let cwd: string;

    beforeEach(() => {
        base = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-adapter-test-'));
        process.env.ANTIGRAVITY_CLI_HOME = base;
        cwd = '/Users/dev/my-project';

        adapter = new AntigravityCliAdapter();

        mockedListAgentProcesses.mockReset();
        mockedEnrichProcesses.mockReset();
        mockedGenerateAgentName.mockReset();

        mockedEnrichProcesses.mockImplementation((procs) => procs);
        mockedGenerateAgentName.mockImplementation((c: string, pid: number) => `${path.basename(c) || 'unknown'}-${pid}`);
    });

    afterEach(() => {
        delete process.env.ANTIGRAVITY_CLI_HOME;
        fs.rmSync(base, { recursive: true, force: true });
    });

    /** Write brain/<id>/.system_generated/logs/transcript.jsonl. */
    function writeTranscript(opts: { id?: string; records?: object[]; transcript?: boolean }): string {
        const id = opts.id ?? CONVERSATION_ID;
        const dir = path.join(base, 'brain', id, '.system_generated', 'logs');
        fs.mkdirSync(dir, { recursive: true });
        if (opts.transcript !== false) {
            const records = opts.records ?? [userRecord('fix the bug')];
            fs.writeFileSync(path.join(dir, 'transcript.jsonl'), records.map((r) => JSON.stringify(r)).join('\n'));
        }
        return path.join(dir, 'transcript.jsonl');
    }

    /** Write cache/last_conversations.json (cwd -> conversationId). */
    function writeRegistry(map: Record<string, string>): void {
        const dir = path.join(base, 'cache');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'last_conversations.json'), JSON.stringify(map));
    }

    function proc(overrides: Partial<ProcessInfo> = {}): ProcessInfo {
        return { pid: 4242, ppid: 1, command: 'agy', cwd, tty: 'ttys010', startTime: new Date(), ...overrides };
    }

    describe('initialization', () => {
        it('exposes the antigravity_cli type', () => {
            expect(adapter.type).toBe('antigravity_cli');
        });
    });

    describe('canHandle', () => {
        it('returns true for a plain agy command', () => {
            expect(adapter.canHandle(proc({ command: 'agy' }))).toBe(true);
        });

        it('returns true for agy with a full path and args', () => {
            expect(adapter.canHandle(proc({ command: '/Users/dev/.local/bin/agy --dangerously-skip-permissions' }))).toBe(true);
        });

        it('returns false for non-agy processes', () => {
            expect(adapter.canHandle(proc({ command: 'node app.js' }))).toBe(false);
        });

        it('returns false when "agy" appears only in an argument path', () => {
            expect(adapter.canHandle(proc({ command: 'node /path/to/agy-thing.js' }))).toBe(false);
        });
    });

    describe('detectAgents', () => {
        it('returns [] when there are no agy processes', async () => {
            mockedListAgentProcesses.mockReturnValue([]);
            expect(await adapter.detectAgents()).toEqual([]);
        });

        it('resolves the conversation via last_conversations.json (cwd -> id)', async () => {
            writeTranscript({});
            writeRegistry({ [cwd]: CONVERSATION_ID });
            mockedListAgentProcesses.mockReturnValue([proc()]);

            const agents = await adapter.detectAgents();

            expect(agents).toHaveLength(1);
            expect(agents[0]).toMatchObject({
                type: 'antigravity_cli',
                pid: 4242,
                projectPath: cwd,
                sessionId: CONVERSATION_ID,
                summary: 'fix the bug',
            });
            expect(agents[0].sessionFilePath).toBe(
                path.join(base, 'brain', CONVERSATION_ID, '.system_generated', 'logs', 'transcript.jsonl'),
            );
        });

        it('falls back to a process-only RUNNING agent when the cwd is not in the registry', async () => {
            writeTranscript({});
            writeRegistry({ '/some/other/cwd': CONVERSATION_ID });
            mockedListAgentProcesses.mockReturnValue([proc()]);

            const agents = await adapter.detectAgents();

            expect(agents).toHaveLength(1);
            expect(agents[0].status).toBe(AgentStatus.RUNNING);
            expect(agents[0].sessionId).toBe('pid-4242');
            expect(agents[0].sessionFilePath).toBeUndefined();
        });

        it('is process-only when the mapped conversation has no transcript', async () => {
            writeTranscript({ transcript: false });
            writeRegistry({ [cwd]: CONVERSATION_ID });
            mockedListAgentProcesses.mockReturnValue([proc()]);

            const agents = await adapter.detectAgents();

            expect(agents[0].sessionId).toBe('pid-4242');
        });
    });

    describe('getConversation', () => {
        it('maps USER_INPUT (<USER_REQUEST>) and MODEL records to roles', () => {
            const file = writeTranscript({ records: [userRecord('hi'), modelRecord('hello')] });
            expect(adapter.getConversation(file)).toEqual([
                { role: 'user', content: 'hi' },
                { role: 'assistant', content: 'hello' },
            ]);
        });

        it('accepts a bare conversation id and skips malformed lines', () => {
            const file = writeTranscript({ records: [userRecord('hi')] });
            fs.appendFileSync(file, '\n{bad json');
            expect(adapter.getConversation(CONVERSATION_ID)).toEqual([{ role: 'user', content: 'hi' }]);
        });

        it('excludes SYSTEM records unless verbose', () => {
            const file = writeTranscript({ records: [systemRecord('checkpoint'), userRecord('go')] });
            expect(adapter.getConversation(file)).toEqual([{ role: 'user', content: 'go' }]);
            expect(adapter.getConversation(file, { verbose: true }).map((m) => m.role)).toEqual(['system', 'user']);
        });

        it('excludes MODEL tool-call (RUN_COMMAND) records except in verbose', () => {
            const file = writeTranscript({ records: [userRecord('go'), toolRecord('ran: echo hi'), modelRecord('done')] });
            // A tool call is not an assistant reply; only USER_INPUT + PLANNER_RESPONSE show.
            expect(adapter.getConversation(file)).toEqual([
                { role: 'user', content: 'go' },
                { role: 'assistant', content: 'done' },
            ]);
            expect(adapter.getConversation(file, { verbose: true }).map((m) => m.role)).toEqual(['user', 'system', 'assistant']);
        });
    });

    describe('detectAgents status + summary mapping', () => {
        const detectFirst = async () => (await adapter.detectAgents())[0];

        it('marks WAITING when the last reply is a PLANNER_RESPONSE (after a tool call)', async () => {
            writeTranscript({ records: [userRecord('go'), toolRecord('ran: echo hi'), modelRecord('done')] });
            writeRegistry({ [cwd]: CONVERSATION_ID });
            mockedListAgentProcesses.mockReturnValue([proc()]);
            expect((await detectFirst()).status).toBe(AgentStatus.WAITING);
        });

        it('marks RUNNING when the last transcript turn is a USER_INPUT message', async () => {
            writeTranscript({ records: [userRecord('still there?')] });
            writeRegistry({ [cwd]: CONVERSATION_ID });
            mockedListAgentProcesses.mockReturnValue([proc()]);
            expect((await detectFirst()).status).toBe(AgentStatus.RUNNING);
        });

        it('marks IDLE when the last created_at is older than the threshold', async () => {
            const old = new Date(Date.now() - 10 * 60 * 1000);
            writeTranscript({ records: [userRecord('go', old)] });
            writeRegistry({ [cwd]: CONVERSATION_ID });
            mockedListAgentProcesses.mockReturnValue([proc()]);
            expect((await detectFirst()).status).toBe(AgentStatus.IDLE);
        });

        it('uses the last user request as the agent summary', async () => {
            writeTranscript({ records: [userRecord('refactor the parser'), modelRecord('on it')] });
            writeRegistry({ [cwd]: CONVERSATION_ID });
            mockedListAgentProcesses.mockReturnValue([proc()]);
            expect((await detectFirst()).summary).toBe('refactor the parser');
        });
    });

    describe('listSessions', () => {
        it('returns [] when there is no registry', async () => {
            expect(await adapter.listSessions()).toEqual([]);
        });

        it('lists sessions from the registry with cwd + first user message', async () => {
            writeTranscript({});
            writeRegistry({ [cwd]: CONVERSATION_ID });
            const summaries = await adapter.listSessions();
            expect(summaries).toHaveLength(1);
            expect(summaries[0]).toMatchObject({
                type: 'antigravity_cli',
                sessionId: CONVERSATION_ID,
                cwd,
                firstUserMessage: 'fix the bug',
            });
        });

        it('applies the cwd filter', async () => {
            writeTranscript({ id: 'aaa0000a-0000-4000-8000-00000000000a', records: [userRecord('a')] });
            writeTranscript({ id: 'bbb0000b-0000-4000-8000-00000000000b', records: [userRecord('b')] });
            writeRegistry({
                '/Users/dev/project-a': 'aaa0000a-0000-4000-8000-00000000000a',
                '/Users/dev/project-b': 'bbb0000b-0000-4000-8000-00000000000b',
            });

            const all = await adapter.listSessions();
            expect(all).toHaveLength(2);

            const filtered = await adapter.listSessions({ cwd: '/Users/dev/project-a' });
            expect(filtered).toHaveLength(1);
            expect(filtered[0].cwd).toBe('/Users/dev/project-a');
        });
    });
});

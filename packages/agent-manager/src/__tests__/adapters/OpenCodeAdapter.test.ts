/**
 * Tests for OpenCodeAdapter
 */

import * as fs from 'fs';
import * as path from 'path';
import { beforeEach, afterEach, describe, expect, it, jest } from '@jest/globals';
import { OpenCodeAdapter } from '../../adapters/OpenCodeAdapter';
import type { ProcessInfo } from '../../adapters/AgentAdapter';
import { AgentStatus } from '../../adapters/AgentAdapter';
import { listAgentProcesses, enrichProcesses } from '../../utils/process';
import { generateAgentName } from '../../utils/matching';

jest.mock('../../utils/process', () => ({
    listAgentProcesses: jest.fn(),
    enrichProcesses: jest.fn(),
}));

jest.mock('../../utils/matching', () => ({
    generateAgentName: jest.fn(),
    matchProcessesToSessions: jest.fn(),
}));

const mockedListAgentProcesses = listAgentProcesses as jest.MockedFunction<typeof listAgentProcesses>;
const mockedEnrichProcesses = enrichProcesses as jest.MockedFunction<typeof enrichProcesses>;
const mockedGenerateAgentName = generateAgentName as jest.MockedFunction<typeof generateAgentName>;

// ---------------------------------------------------------------------------
// SQLite mock helpers
// ---------------------------------------------------------------------------

function makeDb(queries: {
    session?: Array<{ id: string; directory: string; time_created: number }>;
    lastPart?: {
        role: string;
        timeUpdated: number;
        partType?: string | null;
        toolStatus?: string | null;
    } | null;
    firstUserText?: { text: string } | null;
    parts?: Array<{ role: string; partData: string; timeCreated: number }>;
}) {
    const prepareImpl = (sql: string) => {
        const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();

        if (normalized.includes('from session')) {
            return {
                all: () => (queries.session ?? []).map((r) => ({
                    id: r.id, directory: r.directory, timeCreated: r.time_created,
                })),
                get: (dir: string) => {
                    const match = (queries.session ?? []).find((r) => r.directory === dir);
                    if (!match) return undefined;
                    return { id: match.id, directory: match.directory, time_created: match.time_created };
                },
            };
        }

        if (normalized.includes('order by p.time_updated desc')) {
            return {
                get: () => queries.lastPart === undefined
                    ? undefined
                    : queries.lastPart
                        ? {
                            role: queries.lastPart.role,
                            timeUpdated: queries.lastPart.timeUpdated,
                            partType: queries.lastPart.partType ?? null,
                            toolStatus: queries.lastPart.toolStatus ?? null,
                        }
                        : undefined,
            };
        }

        if (normalized.includes("json_extract(m.data, '$.role') = 'user'")) {
            return {
                get: () => queries.firstUserText === undefined
                    ? undefined
                    : queries.firstUserText ?? undefined,
            };
        }

        if (normalized.includes('order by p.time_created asc')) {
            return {
                all: () => queries.parts ?? [],
            };
        }

        return { all: () => [], get: () => undefined };
    };

    return { prepare: prepareImpl, close: jest.fn() };
}

function makeDbConstructor(db: ReturnType<typeof makeDb>) {
    return jest.fn().mockReturnValue(db);
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

describe('OpenCodeAdapter', () => {
    let adapter: OpenCodeAdapter;
    let tmpDir: string;
    let dbPath: string;

    beforeEach(() => {
        adapter = new OpenCodeAdapter();

        mockedListAgentProcesses.mockReset();
        mockedEnrichProcesses.mockReset();
        mockedGenerateAgentName.mockReset();

        mockedEnrichProcesses.mockImplementation((procs) => procs);
        mockedGenerateAgentName.mockImplementation((cwd, pid) => {
            const folder = path.basename(cwd) || 'unknown';
            return `${folder}-${pid}`;
        });

        // Point dbPath to a temp location by default (not existing)
        tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'opencode-test-'));
        dbPath = path.join(tmpDir, 'opencode.db');
        (adapter as any).dbPath = dbPath;
        (adapter as any).db = null;
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        jest.restoreAllMocks();
    });

    // -------------------------------------------------------------------------

    describe('type', () => {
        it('exposes opencode type', () => {
            expect(adapter.type).toBe('opencode');
        });
    });

    // -------------------------------------------------------------------------

    describe('canHandle', () => {
        it('returns true for opencode command', () => {
            expect(adapter.canHandle({ pid: 1, command: 'opencode', cwd: '/repo', tty: 'ttys001' })).toBe(true);
        });

        it('returns true for full path opencode', () => {
            expect(adapter.canHandle({ pid: 2, command: '/usr/local/bin/opencode serve', cwd: '/repo', tty: 'ttys002' })).toBe(true);
        });

        it('returns true for opencode.exe with unix-style path', () => {
            expect(adapter.canHandle({ pid: 3, command: '/usr/bin/opencode.exe', cwd: '/repo', tty: 'ttys003' })).toBe(true);
        });

        it('returns false for non-opencode processes', () => {
            expect(adapter.canHandle({ pid: 4, command: 'node server.js', cwd: '/repo', tty: 'ttys004' })).toBe(false);
        });

        it('returns false when opencode appears only in path args', () => {
            expect(adapter.canHandle({
                pid: 5,
                command: 'node /projects/opencode-plugin/index.js',
                cwd: '/repo',
                tty: 'ttys005',
            })).toBe(false);
        });
    });

    // -------------------------------------------------------------------------

    describe('detectAgents', () => {
        it('returns empty list when no opencode processes running', async () => {
            mockedListAgentProcesses.mockReturnValue([]);

            const agents = await adapter.detectAgents();

            expect(agents).toEqual([]);
            expect(mockedListAgentProcesses).toHaveBeenCalledWith('opencode');
        });

        it('returns process-only agent when DB does not exist', async () => {
            const procs: ProcessInfo[] = [
                { pid: 100, command: 'opencode', cwd: '/repo', tty: 'ttys001' },
            ];
            mockedListAgentProcesses.mockReturnValue(procs);
            mockedEnrichProcesses.mockReturnValue(procs);
            // dbPath does not exist → openDb returns null

            const agents = await adapter.detectAgents();

            expect(agents).toHaveLength(1);
            expect(agents[0]).toMatchObject({
                type: 'opencode',
                status: AgentStatus.RUNNING,
                pid: 100,
                projectPath: '/repo',
                sessionId: 'pid-100',
                summary: 'OpenCode process running',
            });
        });

        it('returns process-only agent when no session matches CWD', async () => {
            const procs: ProcessInfo[] = [
                { pid: 100, command: 'opencode', cwd: '/repo', tty: 'ttys001' },
            ];
            mockedListAgentProcesses.mockReturnValue(procs);
            mockedEnrichProcesses.mockReturnValue(procs);

            fs.writeFileSync(dbPath, ''); // file exists but empty → sqlite throws
            const db = makeDb({ session: [] }); // no matching session
            jest.mock('better-sqlite3', () => makeDbConstructor(db));
            // Inject db directly to bypass fs.existsSync + require
            (adapter as any).db = db;

            const agents = await adapter.detectAgents();

            expect(agents).toHaveLength(1);
            expect(agents[0]).toMatchObject({
                type: 'opencode',
                status: AgentStatus.RUNNING,
                sessionId: 'pid-100',
            });
        });

        it('returns waiting agent when assistant turn finished and quiet past freshness window', async () => {
            const now = Date.now();
            const procs: ProcessInfo[] = [
                { pid: 200, command: 'opencode', cwd: '/my-project', tty: 'ttys002' },
            ];
            mockedListAgentProcesses.mockReturnValue(procs);
            mockedEnrichProcesses.mockReturnValue(procs);

            const db = makeDb({
                session: [{ id: 'sess-001', directory: '/my-project', time_created: now - 60000 }],
                // 30s ago, beyond MID_TURN_FRESHNESS_SEC (5s) → assistant turn is done
                lastPart: { role: 'assistant', timeUpdated: now - 30_000, partType: 'text' },
                firstUserText: { text: 'Refactor the auth module' },
            });
            (adapter as any).db = db;

            const agents = await adapter.detectAgents();

            expect(agents).toHaveLength(1);
            expect(agents[0]).toMatchObject({
                type: 'opencode',
                status: AgentStatus.WAITING,
                sessionId: 'sess-001',
                summary: 'Refactor the auth module',
            });
        });

        it('returns running when assistant tool is actively executing', async () => {
            const now = Date.now();
            const procs: ProcessInfo[] = [
                { pid: 250, command: 'opencode', cwd: '/proj', tty: 'ttys004' },
            ];
            mockedListAgentProcesses.mockReturnValue(procs);
            mockedEnrichProcesses.mockReturnValue(procs);

            // Tool has been running for 2 minutes; assistant role; tool state 'running'
            const db = makeDb({
                session: [{ id: 'sess-tool', directory: '/proj', time_created: now - 180_000 }],
                lastPart: {
                    role: 'assistant',
                    timeUpdated: now - 120_000,
                    partType: 'tool',
                    toolStatus: 'running',
                },
                firstUserText: { text: 'Run the build' },
            });
            (adapter as any).db = db;

            const agents = await adapter.detectAgents();

            // Must be RUNNING — would previously have been WAITING (the bug)
            expect(agents[0]).toMatchObject({
                status: AgentStatus.RUNNING,
                sessionId: 'sess-tool',
            });
        });

        it('returns running when assistant part was updated within freshness window', async () => {
            const now = Date.now();
            const procs: ProcessInfo[] = [
                { pid: 260, command: 'opencode', cwd: '/proj-b', tty: 'ttys005' },
            ];
            mockedListAgentProcesses.mockReturnValue(procs);
            mockedEnrichProcesses.mockReturnValue(procs);

            // 2 seconds ago, within MID_TURN_FRESHNESS_SEC → still mid-turn
            const db = makeDb({
                session: [{ id: 'sess-mid', directory: '/proj-b', time_created: now - 60_000 }],
                lastPart: { role: 'assistant', timeUpdated: now - 2000, partType: 'text' },
                firstUserText: null,
            });
            (adapter as any).db = db;

            const agents = await adapter.detectAgents();
            expect(agents[0].status).toBe(AgentStatus.RUNNING);
        });

        it('returns running agent when last role is user', async () => {
            const now = Date.now();
            const procs: ProcessInfo[] = [
                { pid: 300, command: 'opencode', cwd: '/work', tty: 'ttys003' },
            ];
            mockedListAgentProcesses.mockReturnValue(procs);
            mockedEnrichProcesses.mockReturnValue(procs);

            const db = makeDb({
                session: [{ id: 'sess-002', directory: '/work', time_created: now - 30000 }],
                // User just sent a message, 30s ago → past freshness, role user → RUNNING
                lastPart: { role: 'user', timeUpdated: now - 30_000, partType: 'text' },
                firstUserText: { text: 'Add unit tests' },
            });
            (adapter as any).db = db;

            const agents = await adapter.detectAgents();

            expect(agents[0]).toMatchObject({
                status: AgentStatus.RUNNING,
                sessionId: 'sess-002',
            });
        });

        it('returns idle agent when last activity exceeds threshold', async () => {
            const now = Date.now();
            const staleTime = now - 10 * 60 * 1000; // 10 minutes ago
            const procs: ProcessInfo[] = [
                { pid: 400, command: 'opencode', cwd: '/old-work', tty: 'ttys004' },
            ];
            mockedListAgentProcesses.mockReturnValue(procs);
            mockedEnrichProcesses.mockReturnValue(procs);

            const db = makeDb({
                session: [{ id: 'sess-003', directory: '/old-work', time_created: staleTime }],
                lastPart: { role: 'assistant', timeUpdated: staleTime },
                firstUserText: null,
            });
            (adapter as any).db = db;

            const agents = await adapter.detectAgents();

            expect(agents[0]).toMatchObject({
                status: AgentStatus.IDLE,
                sessionId: 'sess-003',
            });
        });
    });

    // -------------------------------------------------------------------------

    describe('getConversation', () => {
        it('returns empty array for invalid session ref', () => {
            const messages = adapter.getConversation('/no-separator-here');
            expect(messages).toEqual([]);
        });

        it('returns text messages from session parts', () => {
            const db = makeDb({
                parts: [
                    { role: 'user', partData: JSON.stringify({ type: 'text', text: 'Hello agent' }), timeCreated: 1000 },
                    { role: 'assistant', partData: JSON.stringify({ type: 'text', text: 'Hi, how can I help?' }), timeCreated: 2000 },
                ],
            });
            (adapter as any).db = db;

            const ref = `${dbPath}::sess-abc`;
            const messages = adapter.getConversation(ref);

            expect(messages).toHaveLength(2);
            expect(messages[0]).toEqual({ role: 'user', content: 'Hello agent' });
            expect(messages[1]).toEqual({ role: 'assistant', content: 'Hi, how can I help?' });
        });

        it('skips reasoning parts when verbose is false', () => {
            const db = makeDb({
                parts: [
                    { role: 'assistant', partData: JSON.stringify({ type: 'reasoning', reasoning: 'internal thought' }), timeCreated: 1000 },
                    { role: 'assistant', partData: JSON.stringify({ type: 'text', text: 'Answer' }), timeCreated: 2000 },
                ],
            });
            (adapter as any).db = db;

            const messages = adapter.getConversation(`${dbPath}::sess-x`);
            expect(messages).toHaveLength(1);
            expect(messages[0].content).toBe('Answer');
        });

        it('includes reasoning and tool parts when verbose is true', () => {
            const db = makeDb({
                parts: [
                    { role: 'assistant', partData: JSON.stringify({ type: 'reasoning', reasoning: 'my thinking' }), timeCreated: 1000 },
                    { role: 'assistant', partData: JSON.stringify({ type: 'tool', tool: 'read_file' }), timeCreated: 2000 },
                ],
            });
            (adapter as any).db = db;

            const messages = adapter.getConversation(`${dbPath}::sess-y`, { verbose: true });
            expect(messages).toHaveLength(2);
            expect(messages[0].content).toContain('my thinking');
            expect(messages[1].content).toContain('read_file');
        });

        it('returns empty array when DB cannot be opened', () => {
            // db is null, dbPath does not exist
            (adapter as any).db = null;
            const messages = adapter.getConversation(`${dbPath}::sess-z`);
            expect(messages).toEqual([]);
        });
    });

    // -------------------------------------------------------------------------

    describe('listSessions', () => {
        it('returns empty array when DB does not exist', async () => {
            const sessions = await adapter.listSessions();
            expect(sessions).toEqual([]);
        });

        it('returns all sessions from DB', async () => {
            const now = Date.now();
            const db = makeDb({
                session: [
                    { id: 'sess-a', directory: '/proj-a', time_created: now - 3000 },
                    { id: 'sess-b', directory: '/proj-b', time_created: now - 6000 },
                ],
                lastPart: null,
                firstUserText: { text: 'Build the feature' },
            });
            (adapter as any).db = db;

            const sessions = await adapter.listSessions();

            expect(sessions).toHaveLength(2);
            expect(sessions[0]).toMatchObject({ type: 'opencode', sessionId: 'sess-a', cwd: '/proj-a' });
            expect(sessions[1]).toMatchObject({ type: 'opencode', sessionId: 'sess-b', cwd: '/proj-b' });
            expect(sessions[0].sessionFilePath).toContain('sess-a');
        });

        it('filters sessions by cwd when opts.cwd is set', async () => {
            const now = Date.now();
            const db = makeDb({
                session: [
                    { id: 'sess-a', directory: '/proj-a', time_created: now - 3000 },
                    { id: 'sess-b', directory: '/proj-b', time_created: now - 6000 },
                ],
                lastPart: null,
                firstUserText: null,
            });
            (adapter as any).db = db;

            const sessions = await adapter.listSessions({ cwd: '/proj-a' });

            expect(sessions).toHaveLength(1);
            expect(sessions[0].sessionId).toBe('sess-a');
        });

        it('uses session time_created as startedAt and lastActive when no parts exist', async () => {
            const timeCreated = Date.now() - 120000;
            const db = makeDb({
                session: [{ id: 'sess-c', directory: '/repo', time_created: timeCreated }],
                lastPart: null,
                firstUserText: null,
            });
            (adapter as any).db = db;

            const [session] = await adapter.listSessions();

            expect(session.startedAt.getTime()).toBeCloseTo(timeCreated, -2);
            expect(session.lastActive.getTime()).toBeCloseTo(timeCreated, -2);
        });
    });
});

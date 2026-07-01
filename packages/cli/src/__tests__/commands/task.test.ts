import type { MockedFunction } from 'vitest';
import { Command } from 'commander';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { registerTaskCommand } from '../../commands/task.js';
import { ui } from '../../util/terminal-ui.js';

// Mock the task-manager package so the command layer is tested in isolation,
// mirroring the memory command test pattern.
const mockTaskService = {
    create: vi.fn(),
    get: vi.fn(),
    resolveTask: vi.fn(),
    list: vi.fn(),
    update: vi.fn(),
    setPhase: vi.fn(),
    setStatus: vi.fn(),
    setProgress: vi.fn(),
    setNextStep: vi.fn(),
    addBlocker: vi.fn(),
    resolveBlocker: vi.fn(),
    addEvidence: vi.fn(),
    addArtifact: vi.fn(),
    setAttribution: vi.fn(),
    addNote: vi.fn(),
    close: vi.fn(),
    addEvent: vi.fn(),
    getEvents: vi.fn(),
};

const TASK_ID = '11111111-1111-4111-8111-111111111111';
const SECOND_TASK_ID = '22222222-2222-4222-8222-222222222222';
const EVENT_ID = '33333333-3333-4333-8333-333333333333';
const BLOCKER_ID = '44444444-4444-4444-8444-444444444444';
const EVIDENCE_ID = '55555555-5555-4555-8555-555555555555';

vi.mock('@ai-devkit/task-manager', () => ({
    createTaskService: vi.fn(() => mockTaskService),
    resolveCurrentActor: vi.fn((override?: Record<string, unknown>) =>
        override ? { agentId: 'resolved-agent', ...override } : null
    ),
    isTaskEventType: vi.fn((t: string) => t.startsWith('task.')),
    AmbiguousTaskRefError: class AmbiguousTaskRefError extends Error {},
    TaskNotFoundError: class TaskNotFoundError extends Error {},
}));

vi.mock('../../util/terminal-ui.js', () => ({
    ui: {
        error: vi.fn(),
        warning: vi.fn(),
        success: vi.fn(),
        text: vi.fn(),
        table: vi.fn(),
    },
}));

function sampleTask(overrides: Record<string, unknown> = {}) {
    return {
        taskId: TASK_ID,
        title: 'Sample task',
        summary: null,
        feature: 'demo',
        status: 'open',
        phase: null,
        phaseEnteredAt: null,
        progress: { text: null, percent: null },
        nextStep: null,
        blockers: [],
        evidence: [],
        artifacts: [],
        attribution: null,
        links: {},
        tags: [],
        meta: {},
        createdAt: '2026-07-01T12:00:00.000Z',
        updatedAt: '2026-07-01T12:00:00.000Z',
        createdBy: null,
        eventCount: 1,
        lastEventAt: '2026-07-01T12:00:00.000Z',
        ...overrides,
    };
}

describe('task command', () => {
    const mockedUi = vi.mocked(ui);
    let consoleLogSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.clearAllMocks();
        Object.values(mockTaskService).forEach((fn) => (fn as ReturnType<typeof vi.fn>).mockReset());
        consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    });

    describe('create', () => {
        it('creates a task and prints JSON', async () => {
            const task = sampleTask();
            mockTaskService.create.mockResolvedValue(task);

            const program = new Command();
            registerTaskCommand(program);
            await program.parseAsync([
                'node', 'test', 'task', 'create',
                '--title', 'Sample task',
                '--feature', 'demo',
                '--json',
            ]);

            expect(mockTaskService.create).toHaveBeenCalledWith(
                expect.objectContaining({ title: 'Sample task', feature: 'demo' })
            );
            expect(consoleLogSpy).toHaveBeenCalledWith(JSON.stringify(task, null, 2));
        });

        it('parses tags and links', async () => {
            mockTaskService.create.mockResolvedValue(sampleTask());
            const program = new Command();
            registerTaskCommand(program);
            await program.parseAsync([
                'node', 'test', 'task', 'create',
                '--title', 'T',
                '--tags', 'a,b',
                '--branch', 'feature-x',
                '--pr', 'https://github.com/x/pull/1',
                '--json',
            ]);

            expect(mockTaskService.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    tags: ['a', 'b'],
                    links: expect.objectContaining({
                        branch: 'feature-x',
                        pr: 'https://github.com/x/pull/1',
                    }),
                })
            );
        });
    });

    describe('list', () => {
        it('renders a table by default', async () => {
            mockTaskService.list.mockResolvedValue([sampleTask(), sampleTask({ taskId: SECOND_TASK_ID, title: 'Other' })]);
            const program = new Command();
            registerTaskCommand(program);
            await program.parseAsync(['node', 'test', 'task', 'list']);

            expect(mockedUi.table).toHaveBeenCalled();
            const args = (mockedUi.table as MockedFunction<typeof ui.table>).mock.calls[0]![0];
            expect(args.headers).toEqual(['id', 'title', 'status', 'phase', 'feature']);
            expect(args.rows).toHaveLength(2);
        });

        it('prints JSON with --json', async () => {
            const tasks = [sampleTask()];
            mockTaskService.list.mockResolvedValue(tasks);
            const program = new Command();
            registerTaskCommand(program);
            await program.parseAsync(['node', 'test', 'task', 'list', '--json']);
            expect(consoleLogSpy).toHaveBeenCalledWith(JSON.stringify(tasks, null, 2));
        });

        it('warns when empty', async () => {
            mockTaskService.list.mockResolvedValue([]);
            const program = new Command();
            registerTaskCommand(program);
            await program.parseAsync(['node', 'test', 'task', 'list']);
            expect(mockedUi.warning).toHaveBeenCalledWith('No tasks found.');
        });
    });

    describe('show', () => {
        it('resolves the id and prints JSON with --events', async () => {
            const task = sampleTask();
            mockTaskService.resolveTask.mockResolvedValue(task);
            mockTaskService.get.mockResolvedValue(task);
            const events = [{ eventId: EVENT_ID, type: 'task.created', ts: 't', actor: null, taskId: task.taskId, payload: {} }];
            mockTaskService.getEvents.mockResolvedValue(events);

            const program = new Command();
            registerTaskCommand(program);
            await program.parseAsync(['node', 'test', 'task', 'show', 'demo', '--events', '--json']);

            expect(mockTaskService.resolveTask).toHaveBeenCalledWith('demo');
            expect(consoleLogSpy).toHaveBeenCalledWith(
                JSON.stringify({ task, events }, null, 2)
            );
        });

        it('prints an error when no task resolves', async () => {
            mockTaskService.resolveTask.mockResolvedValue(null);
            const program = new Command();
            registerTaskCommand(program);
            await program.parseAsync(['node', 'test', 'task', 'show', 'missing']);
            expect(mockedUi.error).toHaveBeenCalledWith('No task found for "missing".');
        });
    });

    describe('phase / status / progress / next', () => {
        it('sets phase by feature key', async () => {
            const task = sampleTask({ phase: 'design' });
            mockTaskService.resolveTask.mockResolvedValue(task);
            mockTaskService.setPhase.mockResolvedValue(task);

            const program = new Command();
            registerTaskCommand(program);
            await program.parseAsync(['node', 'test', 'task', 'phase', 'demo', 'design', '--json']);

            expect(mockTaskService.setPhase).toHaveBeenCalledWith(TASK_ID, 'design', expect.any(Object));
        });

        it('sets progress with percent and text', async () => {
            const task = sampleTask();
            mockTaskService.resolveTask.mockResolvedValue(task);
            mockTaskService.setProgress.mockResolvedValue(task);

            const program = new Command();
            registerTaskCommand(program);
            await program.parseAsync(['node', 'test', 'task', 'progress', 'demo', '--text', 'half', '--percent', '50', '--json']);

            expect(mockTaskService.setProgress).toHaveBeenCalledWith(
                task.taskId,
                { text: 'half', percent: 50 },
                expect.any(Object)
            );
        });

        it('clears progress with --clear', async () => {
            const task = sampleTask();
            mockTaskService.resolveTask.mockResolvedValue(task);
            mockTaskService.setProgress.mockResolvedValue(task);

            const program = new Command();
            registerTaskCommand(program);
            await program.parseAsync(['node', 'test', 'task', 'progress', 'demo', '--clear']);
            expect(mockTaskService.setProgress).toHaveBeenCalledWith(
                task.taskId,
                { text: null, percent: null },
                expect.any(Object)
            );
        });

        it('sets next step from variadic args', async () => {
            const task = sampleTask();
            mockTaskService.resolveTask.mockResolvedValue(task);
            mockTaskService.setNextStep.mockResolvedValue(task);

            const program = new Command();
            registerTaskCommand(program);
            await program.parseAsync(['node', 'test', 'task', 'next', 'demo', 'write', 'tests', '--json']);
            expect(mockTaskService.setNextStep).toHaveBeenCalledWith(task.taskId, 'write tests', expect.any(Object));
        });
    });

    describe('blocker', () => {
        it('adds a blocker with variadic text', async () => {
            const task = sampleTask();
            mockTaskService.resolveTask.mockResolvedValue(task);
            mockTaskService.addBlocker.mockResolvedValue({ task, blockerId: BLOCKER_ID });

            const program = new Command();
            registerTaskCommand(program);
            await program.parseAsync(['node', 'test', 'task', 'blocker', 'demo', 'add', 'waiting', 'on', 'x', '--json']);
            expect(mockTaskService.addBlocker).toHaveBeenCalledWith(
                task.taskId,
                { text: 'waiting on x' },
                expect.any(Object)
            );
        });

        it('resolves a blocker by id', async () => {
            const task = sampleTask();
            mockTaskService.resolveTask.mockResolvedValue(task);
            mockTaskService.resolveBlocker.mockResolvedValue(task);

            const program = new Command();
            registerTaskCommand(program);
            await program.parseAsync(['node', 'test', 'task', 'blocker', 'demo', 'resolve', BLOCKER_ID, '--json']);
            expect(mockTaskService.resolveBlocker).toHaveBeenCalledWith(task.taskId, BLOCKER_ID, expect.any(Object));
        });
    });

    describe('evidence', () => {
        it('records passing evidence with command and exit code', async () => {
            const task = sampleTask();
            mockTaskService.resolveTask.mockResolvedValue(task);
            mockTaskService.addEvidence.mockResolvedValue({ task, evidenceId: EVIDENCE_ID });

            const program = new Command();
            registerTaskCommand(program);
            await program.parseAsync([
                'node', 'test', 'task', 'evidence', 'demo',
                '--command', 'nx test', '--exit-code', '0', '--passed', '--summary', 'green',
                '--json',
            ]);
            expect(mockTaskService.addEvidence).toHaveBeenCalledWith(
                task.taskId,
                expect.objectContaining({ command: 'nx test', exitCode: 0, passed: true, summary: 'green' }),
                expect.any(Object)
            );
        });

        it('errors when neither --passed nor --failed is given', async () => {
            const task = sampleTask();
            mockTaskService.resolveTask.mockResolvedValue(task);
            const program = new Command();
            registerTaskCommand(program);
            await program.parseAsync(['node', 'test', 'task', 'evidence', 'demo', '--command', 'x']);
            expect(mockedUi.error).toHaveBeenCalledWith(expect.stringContaining('--passed'));
        });

        it('collects repeatable --artifact refs', async () => {
            const task = sampleTask();
            mockTaskService.resolveTask.mockResolvedValue(task);
            mockTaskService.addEvidence.mockResolvedValue({ task, evidenceId: EVIDENCE_ID });

            const program = new Command();
            registerTaskCommand(program);
            await program.parseAsync([
                'node', 'test', 'task', 'evidence', 'demo', '--passed',
                '--artifact', '/a.log', '--artifact', '/b.log', '--json',
            ]);
            expect(mockTaskService.addEvidence).toHaveBeenCalledWith(
                task.taskId,
                expect.objectContaining({ artifacts: ['/a.log', '/b.log'] }),
                expect.any(Object)
            );
        });
    });

    describe('note', () => {
        it('appends a note from variadic text', async () => {
            const task = sampleTask();
            mockTaskService.resolveTask.mockResolvedValue(task);
            mockTaskService.addNote.mockResolvedValue(task);

            const program = new Command();
            registerTaskCommand(program);
            await program.parseAsync(['node', 'test', 'task', 'note', 'demo', 'quick', 'note', '--json']);
            expect(mockTaskService.addNote).toHaveBeenCalledWith(task.taskId, 'quick note', expect.any(Object));
        });
    });

    describe('event', () => {
        it('appends a custom event defaulting to task.custom with parsed payload', async () => {
            const task = sampleTask();
            mockTaskService.resolveTask.mockResolvedValue(task);
            const event = { eventId: EVENT_ID, taskId: task.taskId, ts: 't', type: 'task.custom', actor: null, payload: { name: 'tick' } };
            mockTaskService.addEvent.mockResolvedValue(event);

            const program = new Command();
            registerTaskCommand(program);
            await program.parseAsync([
                'node', 'test', 'task', 'event', 'demo',
                '--payload', '{"name":"tick"}', '--json',
            ]);
            expect(mockTaskService.addEvent).toHaveBeenCalledWith(
                task.taskId,
                'task.custom',
                { name: 'tick' },
                expect.any(Object)
            );
            expect(consoleLogSpy).toHaveBeenCalledWith(JSON.stringify(event, null, 2));
        });

        it('reads payload from @file', async () => {
            const task = sampleTask();
            mockTaskService.resolveTask.mockResolvedValue(task);
            mockTaskService.addEvent.mockResolvedValue({
                eventId: EVENT_ID, taskId: task.taskId, ts: 't', type: 'task.custom', actor: null, payload: {},
            });
            const tmp = path.join(os.tmpdir(), `evt-${Date.now()}.json`);
            fs.writeFileSync(tmp, JSON.stringify({ name: 'from-file' }), 'utf8');

            const program = new Command();
            registerTaskCommand(program);
            await program.parseAsync(['node', 'test', 'task', 'event', 'demo', '--payload', `@${tmp}`, '--json']);
            expect(mockTaskService.addEvent).toHaveBeenCalledWith(
                task.taskId,
                'task.custom',
                { name: 'from-file' },
                expect.any(Object)
            );
        });
    });

    describe('close', () => {
        it('defaults to completed', async () => {
            const task = sampleTask({ status: 'completed' });
            mockTaskService.resolveTask.mockResolvedValue(task);
            mockTaskService.close.mockResolvedValue(task);

            const program = new Command();
            registerTaskCommand(program);
            await program.parseAsync(['node', 'test', 'task', 'close', 'demo', '--json']);
            expect(mockTaskService.close).toHaveBeenCalledWith(task.taskId, 'completed', expect.any(Object));
        });
    });
});

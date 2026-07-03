import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { TaskRepository } from '../../src/task.repository.js';
import { closeDatabase } from '../../src/database/connection.js';
import { TaskService } from '../../src/task.service.js';
import {
    TaskNotFoundError,
    TaskValidationError,
    AmbiguousTaskRefError,
    TaskResourceNotFoundError,
    UnknownEventTypeError,
} from '../../src/task.errors.js';
import type { Task, TaskEvent } from '../../src/task.types.js';
import { nowIso } from '../../src/task.ids.js';

const MISSING_TASK_ID = '00000000-0000-4000-8000-000000000099';
const MISSING_BLOCKER_ID = '00000000-0000-4000-8000-000000000098';

/** Write a minimal task directly to the repository (bypasses service.create's
 * random id generation), for tests that need controlled ids. */
async function writeDirectTask(repository: TaskRepository, taskId: string): Promise<void> {
    const now = nowIso();
    const task: Task = {
        taskId,
        title: 'T',
        summary: null,
        name: null,
        status: 'open',
        phase: null,
        phaseEnteredAt: null,
        progress: { text: null },
        nextStep: null,
        blockers: [],
        evidence: [],
        artifacts: [],
        attribution: null,
        links: {},
        tags: [],
        meta: {},
        createdAt: now,
        updatedAt: now,
        createdBy: null,
        eventCount: 0,
        lastEventAt: null,
    };
    await repository.writeTask(task);
}

describe('TaskService (integration with TaskRepository)', () => {
    let dir: string;
    let repository: TaskRepository;
    let service: TaskService;

    beforeEach(() => {
        closeDatabase();
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-service-'));
        repository = new TaskRepository(path.join(dir, 'tasks.db'));
        service = new TaskService(repository);
    });

    afterEach(() => {
        closeDatabase();
        fs.rmSync(dir, { recursive: true, force: true });
    });

    async function readEventsFromDisk(taskId: string): Promise<TaskEvent[]> {
        return service.getEvents(taskId);
    }

    describe('create', () => {
        it('creates a task with stable id and task.created event', async () => {
            const task = await service.create({ title: 'Ship feature X', name: 'feature-x' });
            expect(task.taskId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
            expect(task.status).toBe('open');
            expect(task.name).toBe('feature-x');
            expect(task.eventCount).toBe(1);
            expect(task.lastEventAt).not.toBeNull();

            const events = await readEventsFromDisk(task.taskId);
            expect(events).toHaveLength(1);
            expect(events[0]!.type).toBe('task.created');
            expect(events[0]!.payload).toMatchObject({ title: 'Ship feature X', status: 'open' });
        });

        it('rejects empty title', async () => {
            await expect(service.create({ title: '   ' })).rejects.toBeInstanceOf(TaskValidationError);
        });

        it('rejects invalid task name', async () => {
            await expect(service.create({ title: 'T', name: 'Bad Feature!' })).rejects.toBeInstanceOf(
                TaskValidationError
            );
        });

        it('allows null name for ad-hoc tasks', async () => {
            const task = await service.create({ title: 'Ad-hoc debug' });
            expect(task.name).toBeNull();
        });

        it('sets phase and phaseEnteredAt when provided', async () => {
            const task = await service.create({ title: 'T', phase: 'requirements' });
            expect(task.phase).toBe('requirements');
            expect(task.phaseEnteredAt).not.toBeNull();
        });
    });

    describe('get', () => {
        it('throws TaskNotFoundError for missing task', async () => {
            await expect(service.get(MISSING_TASK_ID)).rejects.toBeInstanceOf(TaskNotFoundError);
        });
    });

    describe('state setters', () => {
        it('setPhase mutates snapshot and emits task.phase.set with previous', async () => {
            const task = await service.create({ title: 'T', phase: 'requirements' });
            const updated = await service.setPhase(task.taskId, 'design');
            expect(updated.phase).toBe('design');
            expect(updated.phaseEnteredAt).not.toBeNull();

            const events = await readEventsFromDisk(task.taskId);
            const phaseEvent = events.find((e) => e.type === 'task.phase.set');
            expect(phaseEvent).toBeDefined();
            expect(phaseEvent!.payload).toMatchObject({ phase: 'design', previous: 'requirements' });
        });

        it('setStatus validates the status enum', async () => {
            const task = await service.create({ title: 'T' });
            await expect(service.setStatus(task.taskId, 'bogus' as never)).rejects.toBeInstanceOf(
                TaskValidationError
            );
            const updated = await service.setStatus(task.taskId, 'active');
            expect(updated.status).toBe('active');
        });

        it('setProgress stores text', async () => {
            const task = await service.create({ title: 'T' });
            const updated = await service.setProgress(task.taskId, { text: 'implementation started' });
            expect(updated.progress).toEqual({ text: 'implementation started' });
        });

        it('setNextStep trims and stores; --clear sets null', async () => {
            const task = await service.create({ title: 'T' });
            const updated = await service.setNextStep(task.taskId, '  write tests  ');
            expect(updated.nextStep).toBe('write tests');
            const cleared = await service.setNextStep(task.taskId, null);
            expect(cleared.nextStep).toBeNull();
        });
    });

    describe('blockers', () => {
        it('addBlocker then resolveBlocker updates status', async () => {
            const task = await service.create({ title: 'T' });
            const { blockerId } = await service.addBlocker(task.taskId, { text: 'blocked by X' });
            expect(blockerId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

            let updated = await service.get(task.taskId);
            expect(updated.blockers).toHaveLength(1);
            expect(updated.blockers[0]).toMatchObject({ status: 'open', text: 'blocked by X' });

            updated = await service.resolveBlocker(task.taskId, blockerId);
            expect(updated.blockers[0]!.status).toBe('resolved');
            expect(updated.blockers[0]!.resolvedAt).not.toBeNull();

            const events = await readEventsFromDisk(task.taskId);
            expect(events.some((e) => e.type === 'task.blocker.add')).toBe(true);
            expect(events.some((e) => e.type === 'task.blocker.resolve')).toBe(true);
        });

        it('resolveBlocker throws for unknown blocker', async () => {
            const task = await service.create({ title: 'T' });
            await expect(
                service.resolveBlocker(task.taskId, MISSING_BLOCKER_ID)
            ).rejects.toBeInstanceOf(TaskResourceNotFoundError);
        });
    });

    describe('evidence + artifacts', () => {
        it('addEvidence records passed/fail and command', async () => {
            const task = await service.create({ title: 'T' });
            const { evidenceId } = await service.addEvidence(task.taskId, {
                command: 'nx test',
                exitCode: 0,
                passed: true,
                summary: 'all green',
            });
            expect(evidenceId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
            const updated = await service.get(task.taskId);
            expect(updated.evidence).toHaveLength(1);
            expect(updated.evidence[0]).toMatchObject({
                passed: true,
                exitCode: 0,
                command: 'nx test',
                summary: 'all green',
            });
        });

        it('addEvidence requires passed boolean', async () => {
            const task = await service.create({ title: 'T' });
            await expect(
                service.addEvidence(task.taskId, { passed: 'yes' as never })
            ).rejects.toBeInstanceOf(TaskValidationError);
        });

        it('addArtifact stores a path reference (never copies)', async () => {
            const task = await service.create({ title: 'T' });
            const { artifactId } = await service.addArtifact(task.taskId, {
                path: '/tmp/build.log',
                kind: 'log',
                description: 'build output',
            });
            expect(artifactId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
            const updated = await service.get(task.taskId);
            expect(updated.artifacts[0]).toMatchObject({ path: '/tmp/build.log', kind: 'log' });
        });
    });

    describe('attribution + notes', () => {
        it('setAttribution sets current owner', async () => {
            const task = await service.create({ title: 'T' });
            const updated = await service.setAttribution(task.taskId, {
                agentId: 'agent-7',
                agentType: 'pi',
            });
            expect(updated.attribution).toMatchObject({ agentId: 'agent-7', agentType: 'pi' });
        });

        it('addNote appends an event without mutating snapshot state', async () => {
            const task = await service.create({ title: 'T' });
            const before = await service.get(task.taskId);
            const updated = await service.addNote(task.taskId, 'a quick note');
            expect(updated.title).toBe(before.title);
            expect(updated.eventCount).toBe(before.eventCount + 1);
            const events = await readEventsFromDisk(task.taskId);
            const note = events.find((e) => e.type === 'task.note.append');
            expect(note).toBeDefined();
            expect(note!.payload).toEqual({ text: 'a quick note' });
        });
    });

    describe('close', () => {
        it('marks task terminal and emits task.closed', async () => {
            const task = await service.create({ title: 'T' });
            const closed = await service.close(task.taskId, 'completed');
            expect(closed.status).toBe('completed');
            const events = await readEventsFromDisk(task.taskId);
            expect(events.some((e) => e.type === 'task.closed')).toBe(true);
        });

        it('is idempotent on an already-terminal task', async () => {
            const task = await service.create({ title: 'T' });
            await service.close(task.taskId, 'completed');
            const before = await service.get(task.taskId);
            await service.close(task.taskId, 'abandoned');
            const after = await service.get(task.taskId);
            expect(after.status).toBe('completed');
            expect(after.eventCount).toBe(before.eventCount);
        });
    });

    describe('update (generic patch)', () => {
        it('patches scalar fields and emits task.updated', async () => {
            const task = await service.create({ title: 'T' });
            const updated = await service.update(task.taskId, {
                title: 'New title',
                tags: ['a', 'b'],
                links: { branch: 'feature-x' },
            });
            expect(updated.title).toBe('New title');
            expect(updated.tags).toEqual(['a', 'b']);
            expect(updated.links.branch).toBe('feature-x');
            const events = await readEventsFromDisk(task.taskId);
            const upd = events.find((e) => e.type === 'task.updated');
            expect(upd).toBeDefined();
            expect(upd!.payload).toHaveProperty('fields');
        });
    });

    describe('resolveTask', () => {
        it('resolves by full id', async () => {
            const task = await service.create({ title: 'T', name: 'feat' });
            expect(await service.resolveTask(task.taskId)).not.toBeNull();
        });

        it('resolves by unique id prefix', async () => {
            const task = await service.create({ title: 'T', name: 'feat' });
            const prefix = task.taskId.slice(0, 8);
            const resolved = await service.resolveTask(prefix);
            expect(resolved?.taskId).toBe(task.taskId);
        });

        it('throws AmbiguousTaskRefError on ambiguous prefix', async () => {
            // Write two tasks directly with ids sharing a common prefix (random
            // UUIDs never collide in practice, so we craft the ids here).
            const t1 = '00000000-0000-4000-8000-0000000000aa';
            const t2 = '00000000-0000-4000-8000-0000000000ab';
            await writeDirectTask(repository, t1);
            await writeDirectTask(repository, t2);
            await expect(service.resolveTask('00000000')).rejects.toBeInstanceOf(
                AmbiguousTaskRefError
            );
        });

        it('resolves by task name to the latest non-terminal task', async () => {
            const a = await service.create({ title: 'A', name: 'feat' });
            const b = await service.create({ title: 'B', name: 'feat' });
            await service.close(a.taskId, 'completed');
            const resolved = await service.resolveTask('feat');
            expect(resolved?.taskId).toBe(b.taskId);
        });

        it('returns null when nothing matches', async () => {
            expect(await service.resolveTask('nonexistent-name')).toBeNull();
        });
    });

    describe('list', () => {
        it('filters by name/status/phase and returns newest first', async () => {
            await service.create({ title: 'A', name: 'feat', phase: 'design' });
            await service.create({ title: 'B', name: 'feat', phase: 'testing' });
            await service.create({ title: 'C', name: 'other' });

            const featTasks = await service.list({ name: 'feat' });
            expect(featTasks).toHaveLength(2);
            expect(featTasks[0]!.title).toBe('B');
        });
    });

    describe('addEvent escape hatch', () => {
        it('applies a stateful mutation then appends', async () => {
            const task = await service.create({ title: 'T' });
            await service.addEvent(task.taskId, 'task.status.set', { status: 'active' });
            const updated = await service.get(task.taskId);
            expect(updated.status).toBe('active');
        });

        it('appends task.custom without mutating snapshot', async () => {
            const task = await service.create({ title: 'T' });
            const before = await service.get(task.taskId);
            await service.addEvent(task.taskId, 'task.custom', { name: 'trace.tick', data: { k: 1 } });
            const after = await service.get(task.taskId);
            expect(after.status).toBe(before.status);
            expect(after.eventCount).toBe(before.eventCount + 1);
        });

        it('rejects unknown event types', async () => {
            const task = await service.create({ title: 'T' });
            await expect(
                service.addEvent(task.taskId, 'task.bogus', {})
            ).rejects.toBeInstanceOf(UnknownEventTypeError);
        });
    });

    describe('getEvents filtering', () => {
        it('filters by type and applies limit', async () => {
            const task = await service.create({ title: 'T' });
            await service.addNote(task.taskId, 'one');
            await service.addNote(task.taskId, 'two');
            const notes = await service.getEvents(task.taskId, { type: 'task.note.append' });
            expect(notes).toHaveLength(2);
            const limited = await service.getEvents(task.taskId, { limit: 1 });
            expect(limited).toHaveLength(1);
        });
    });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { SqliteTaskStore } from '../../src/store/sqlite-store.js';
import { TaskService } from '../../src/service.js';
import {
    TaskNotFoundError,
    TaskValidationError,
    AmbiguousTaskRefError,
    TaskResourceNotFoundError,
    UnknownEventTypeError,
} from '../../src/errors.js';
import type { TaskEvent } from '../../src/types/index.js';

describe('TaskService (integration with SqliteTaskStore)', () => {
    let dir: string;
    let store: SqliteTaskStore;
    let service: TaskService;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-service-'));
        store = new SqliteTaskStore(path.join(dir, 'tasks.db'));
        service = new TaskService(store);
    });

    afterEach(() => {
        store.close();
        fs.rmSync(dir, { recursive: true, force: true });
    });

    async function readEventsFromDisk(taskId: string): Promise<TaskEvent[]> {
        return service.getEvents(taskId);
    }

    describe('create', () => {
        it('creates a task with stable id and task.created event', async () => {
            const task = await service.create({ title: 'Ship feature X', feature: 'feature-x' });
            expect(task.taskId).toMatch(/^task-\d{14}-[0-9a-z]{6}$/);
            expect(task.status).toBe('open');
            expect(task.feature).toBe('feature-x');
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

        it('rejects invalid feature key', async () => {
            await expect(service.create({ title: 'T', feature: 'Bad Feature!' })).rejects.toBeInstanceOf(
                TaskValidationError
            );
        });

        it('allows null feature for ad-hoc tasks', async () => {
            const task = await service.create({ title: 'Ad-hoc debug' });
            expect(task.feature).toBeNull();
        });

        it('sets phase and phaseEnteredAt when provided', async () => {
            const task = await service.create({ title: 'T', phase: 'requirements' });
            expect(task.phase).toBe('requirements');
            expect(task.phaseEnteredAt).not.toBeNull();
        });
    });

    describe('get', () => {
        it('throws TaskNotFoundError for missing task', async () => {
            await expect(service.get('task-missing')).rejects.toBeInstanceOf(TaskNotFoundError);
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

        it('setProgress validates percent range', async () => {
            const task = await service.create({ title: 'T' });
            await expect(
                service.setProgress(task.taskId, { percent: 150 })
            ).rejects.toBeInstanceOf(TaskValidationError);
            const updated = await service.setProgress(task.taskId, { text: 'halfway', percent: 50 });
            expect(updated.progress).toEqual({ text: 'halfway', percent: 50 });
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
            expect(blockerId).toMatch(/^blk-/);

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
                service.resolveBlocker(task.taskId, 'blk-missing')
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
            expect(evidenceId).toMatch(/^evd-/);
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
            expect(artifactId).toMatch(/^art-/);
            const updated = await service.get(task.taskId);
            expect(updated.artifacts[0]).toMatchObject({ path: '/tmp/build.log', kind: 'log' });
            // Artifacts are references only: no file is copied, and the DB stores
            // only the snapshot referencing the path.
            expect(store.snapshotContains(task.taskId, '/tmp/build.log')).toBe(true);
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
            // title/phase unchanged; eventCount bumped.
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
            const task = await service.create({ title: 'T', feature: 'feat' });
            expect(await service.resolveTask(task.taskId)).not.toBeNull();
        });

        it('resolves by unique id prefix', async () => {
            const task = await service.create({ title: 'T', feature: 'feat' });
            const prefix = task.taskId.slice(0, 18); // task-<14digits>-
            const resolved = await service.resolveTask(prefix);
            expect(resolved?.taskId).toBe(task.taskId);
        });

        it('throws AmbiguousTaskRefError on ambiguous prefix', async () => {
            // Create two tasks at the same second so prefixes overlap.
            const t1 = await service.create({ title: 'A' });
            const t2 = await service.create({ title: 'B' });
            const prefix = 'task-';
            // Both match "task-".
            await expect(service.resolveTask(prefix)).rejects.toBeInstanceOf(AmbiguousTaskRefError);
            // touch t1/t2 to satisfy no-unused (they are used implicitly via store).
            expect(t1.taskId).not.toBe(t2.taskId);
        });

        it('resolves by feature key to the latest non-terminal task', async () => {
            const a = await service.create({ title: 'A', feature: 'feat' });
            const b = await service.create({ title: 'B', feature: 'feat' });
            await service.close(a.taskId, 'completed'); // a is terminal
            const resolved = await service.resolveTask('feat');
            expect(resolved?.taskId).toBe(b.taskId);
        });

        it('returns null when nothing matches', async () => {
            expect(await service.resolveTask('nonexistent-feature')).toBeNull();
        });
    });

    describe('list', () => {
        it('filters by feature/status/phase and returns newest first', async () => {
            await service.create({ title: 'A', feature: 'feat', phase: 'design' });
            await service.create({ title: 'B', feature: 'feat', phase: 'testing' });
            await service.create({ title: 'C', feature: 'other' });

            const featTasks = await service.list({ feature: 'feat' });
            expect(featTasks).toHaveLength(2);
            // Newest first.
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

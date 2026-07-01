import { describe, expect, it } from 'vitest';
import { InMemoryTaskService } from '../src/in-memory.js';
import { AmbiguousTaskPrefixError, TaskNotFoundError } from '../src/contract.js';
import type { TaskEvent } from '../src/contract.js';

describe('InMemoryTaskService (contract conformance)', () => {
    it('creates a task with task.created event and cached counts', async () => {
        const svc = new InMemoryTaskService();
        const task = await svc.create({ title: 'Auth', feature: 'auth' });
        expect(task.taskId).toMatch(/^task-\d{14}-[0-9a-z]{4}$/);
        expect(task.status).toBe('open');
        expect(task.phase).toBeNull();
        expect(task.eventCount).toBe(1);
        const events = await svc.getEvents(task.taskId);
        expect(events[0]!.type).toBe('task.created');
        expect(events[0]!.payload).toMatchObject({ title: 'Auth', feature: 'auth', status: 'open' });
    });

    it('resolveTask: full id -> prefix -> feature (latest non-terminal)', async () => {
        const svc = new InMemoryTaskService();
        const a = await svc.create({ title: 'A', feature: 'auth' });
        // force a later createdAt for the second task with same feature
        const b = await svc.create({ title: 'B', feature: 'auth' });
        const byFeature = await svc.resolveTask({ feature: 'auth' });
        expect(byFeature?.taskId).toBe(b.taskId);
        // Use a prefix long enough to be unique (both IDs share the same-second
        // timestamp, so we must include part of the random suffix).
        const byPrefix = await svc.resolveTask(b.taskId.slice(0, b.taskId.length - 2));
        expect(byPrefix?.taskId).toBe(b.taskId);
        const byFull = await svc.resolveTask(a.taskId);
        expect(byFull?.taskId).toBe(a.taskId);

        // terminal task is skipped in feature resolution
        await svc.close(b.taskId, 'completed');
        const afterClose = await svc.resolveTask({ feature: 'auth' });
        expect(afterClose?.taskId).toBe(a.taskId);
    });

    it('resolveTask: ambiguous prefix throws', async () => {
        const svc = new InMemoryTaskService();
        const a = await svc.create({ title: 'A' });
        const b = await svc.create({ title: 'B' });
        // both share the "task-" prefix; a short prefix is ambiguous
        await expect(svc.resolveTask('task-')).rejects.toBeInstanceOf(AmbiguousTaskPrefixError);
        // sanity: full ids still resolve
        expect((await svc.resolveTask(a.taskId))?.taskId).toBe(a.taskId);
        expect((await svc.resolveTask(b.taskId))?.taskId).toBe(b.taskId);
    });

    it('get throws TaskNotFoundError on miss', async () => {
        const svc = new InMemoryTaskService();
        await expect(svc.get('task-nope-0000')).rejects.toBeInstanceOf(TaskNotFoundError);
    });

    it('mutators append the matching event type and mutate snapshot', async () => {
        const svc = new InMemoryTaskService();
        const t = await svc.create({ title: 'T', feature: 'f', phase: 'design' });
        const id = t.taskId;
        await svc.setPhase(id, 'implementation');
        await svc.setStatus(id, 'active');
        await svc.setProgress(id, { percent: 50 });
        await svc.setNextStep(id, 'do the thing');
        const { blockerId } = await svc.addBlocker(id, { text: 'blocked on review' });
        await svc.resolveBlocker(id, blockerId);
        const { evidenceId } = await svc.addEvidence(id, { command: 'nx test', exitCode: 0, passed: true, summary: 'green' });
        await svc.setAttribution(id, { agentId: 'agent-a' });
        await svc.addNote(id, 'heads up');
        await svc.close(id, 'completed');

        const types = (await svc.getEvents(id)).map((e) => e.type);
        expect(types).toContain('task.phase.set');
        expect(types).toContain('task.status.set');
        expect(types).toContain('task.progress.set');
        expect(types).toContain('task.next_step.set');
        expect(types).toContain('task.blocker.add');
        expect(types).toContain('task.blocker.resolve');
        expect(types).toContain('task.evidence.add');
        expect(types).toContain('task.attribution.set');
        expect(types).toContain('task.note.append');
        expect(types).toContain('task.closed');

        const final = await svc.get(id);
        expect(final!.status).toBe('completed');
        expect(final!.phase).toBe('implementation');
        expect(final!.progress.percent).toBe(50);
        expect(final!.nextStep).toBe('do the thing');
        expect(final!.blockers.every((b) => b.status === 'resolved')).toBe(true);
        expect(final!.evidence[0]!.evidenceId).toBe(evidenceId);
        expect(final!.evidence[0]!.passed).toBe(true);
        expect(final!.attribution?.agentId).toBe('agent-a');
    });

    it('note.append and custom are event-only (no snapshot field mutation)', async () => {
        const svc = new InMemoryTaskService();
        const t = await svc.create({ title: 'T', feature: 'f' });
        const before = await svc.get(t.taskId);
        await svc.addNote(t.taskId, 'freeform note');
        await svc.addEvent(t.taskId, 'task.custom', { name: 'lifecycle.tick', data: { ms: 42 } });
        const after = await svc.get(t.taskId);
        // No new first-class field carries note/custom payload; updatedAt moves.
        expect(after!.nextStep).toBe(before!.nextStep);
        expect(after!.progress).toEqual(before!.progress);
        const events = await svc.getEvents(t.taskId);
        const custom: TaskEvent | undefined = events.find((e) => e.type === 'task.custom');
        expect(custom?.payload).toMatchObject({ name: 'lifecycle.tick', data: { ms: 42 } });
    });

    it('forwards actor as the emitting actor on events', async () => {
        const svc = new InMemoryTaskService();
        const t = await svc.create({ title: 'T', feature: 'f', actor: { agentId: 'creator' } });
        await svc.setPhase(t.taskId, 'implementation', { actor: { agentId: 'agent-b' } });
        const events = await svc.getEvents(t.taskId);
        const phaseEvt = events.find((e) => e.type === 'task.phase.set')!;
        expect(phaseEvt.actor?.agentId).toBe('agent-b');
        expect(events[0]!.actor?.agentId).toBe('creator');
    });
});

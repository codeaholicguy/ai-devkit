import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryTaskService } from '../src/in-memory.js';
import { TaskTracer } from '../src/TaskTracer.js';
import type { TaskEvent } from '../src/contract.js';

describe('TaskTracer semantic → contract mapping', () => {
    let svc: InMemoryTaskService;
    let tracer: TaskTracer;
    let taskId: string;

    beforeEach(async () => {
        svc = new InMemoryTaskService();
        tracer = new TaskTracer(svc);
        const { task } = await tracer.ensureFeatureTask({ feature: 'auth', phase: 'design' });
        taskId = task.taskId;
    });

    it('ensureFeatureTask creates on miss and reuses on hit', async () => {
        const first = await tracer.ensureFeatureTask({ feature: 'auth' });
        expect(first.created).toBe(false);
        expect(first.task.taskId).toBe(taskId);
        const other = await tracer.ensureFeatureTask({ feature: 'brand-new' });
        expect(other.created).toBe(true);
    });

    async function lastEvent(id: string): Promise<TaskEvent> {
        const events = await svc.getEvents(id);
        return events[events.length - 1]!;
    }

    it('enterPhase -> task.phase.set', async () => {
        await tracer.enterPhase(taskId, 'implementation');
        const e = await lastEvent(taskId);
        expect(e.type).toBe('task.phase.set');
        expect(e.payload).toMatchObject({ phase: 'implementation', previous: 'design' });
        expect((await svc.get(taskId)).phase).toBe('implementation');
    });

    it('updateProgress -> task.progress.set', async () => {
        await tracer.updateProgress(taskId, { text: 'halfway', percent: 50 });
        const e = await lastEvent(taskId);
        expect(e.type).toBe('task.progress.set');
        expect(e.payload).toMatchObject({ percent: 50, text: 'halfway' });
    });

    it('setNextStep -> task.next_step.set', async () => {
        await tracer.setNextStep(taskId, 'write tests');
        const e = await lastEvent(taskId);
        expect(e.type).toBe('task.next_step.set');
        expect(e.payload).toMatchObject({ step: 'write tests' });
    });

    it('raiseBlocker/resolveBlocker -> task.blocker.add/resolve', async () => {
        const { blockerId } = await tracer.raiseBlocker(taskId, 'waiting on API');
        let e = await lastEvent(taskId);
        expect(e.type).toBe('task.blocker.add');
        expect(e.payload).toMatchObject({ blockerId, text: 'waiting on API' });
        await tracer.resolveBlocker(taskId, blockerId);
        e = await lastEvent(taskId);
        expect(e.type).toBe('task.blocker.resolve');
        expect(e.payload).toMatchObject({ blockerId });
    });

    it('recordValidation -> task.evidence.add', async () => {
        const { evidenceId } = await tracer.recordValidation(taskId, {
            command: 'nx test',
            exitCode: 0,
            passed: true,
            summary: 'all green',
            artifacts: ['packages/task-tracer/dist'],
        });
        const e = await lastEvent(taskId);
        expect(e.type).toBe('task.evidence.add');
        expect(e.payload).toMatchObject({ evidenceId, command: 'nx test', exitCode: 0, passed: true });
    });

    it('setAttribution -> task.attribution.set', async () => {
        await tracer.setAttribution(taskId, { agentId: 'agent-a', agentType: 'pi' });
        const e = await lastEvent(taskId);
        expect(e.type).toBe('task.attribution.set');
        expect(e.payload).toMatchObject({ agentId: 'agent-a', agentType: 'pi' });
        expect((await svc.get(taskId)).attribution?.agentId).toBe('agent-a');
    });

    it('addNote -> task.note.append (event-only, no snapshot mutation)', async () => {
        const before = await svc.get(taskId);
        await tracer.addNote(taskId, 'remember to lint');
        const after = await svc.get(taskId);
        const e = await lastEvent(taskId);
        expect(e.type).toBe('task.note.append');
        expect(e.payload).toMatchObject({ text: 'remember to lint' });
        // no new first-class field carries the note
        expect(after!.nextStep).toBe(before!.nextStep);
        expect(after!.progress).toEqual(before!.progress);
    });

    it('recordCustom -> task.custom (event-only observability)', async () => {
        const before = await svc.get(taskId);
        await tracer.recordCustom(taskId, { name: 'lifecycle.start', data: { runId: 'r1' } });
        const after = await svc.get(taskId);
        const e = await lastEvent(taskId);
        expect(e.type).toBe('task.custom');
        expect(e.payload).toMatchObject({ name: 'lifecycle.start', data: { runId: 'r1' } });
        expect(after!.progress).toEqual(before!.progress);
    });

    it('closeTask -> task.closed', async () => {
        await tracer.closeTask(taskId, 'completed');
        const e = await lastEvent(taskId);
        expect(e.type).toBe('task.closed');
        expect(e.payload).toMatchObject({ status: 'completed' });
        expect((await svc.get(taskId)).status).toBe('completed');
    });

    it('forwards explicit actor through opts.actor', async () => {
        const actor = { agentId: 'explicit' };
        await tracer.enterPhase(taskId, 'testing', { actor });
        const e = await lastEvent(taskId);
        expect(e.actor?.agentId).toBe('explicit');
    });
});

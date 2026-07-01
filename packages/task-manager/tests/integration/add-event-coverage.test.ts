import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { SqliteTaskStore } from '../../src/store/sqlite-store.js';
import { TaskService } from '../../src/service.js';
import { TaskStoreError, TaskNotFoundError } from '../../src/errors.js';
import { makeUniqueId, makeTaskId } from '../../src/ids.js';

/**
 * Coverage-focused tests for the low-level addEvent escape hatch (each stateful
 * type applies a snapshot mutation) and for store error branches.
 */
function createStore(): { store: SqliteTaskStore; dir: string } {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-evt-'));
    const store = new SqliteTaskStore(path.join(dir, 'tasks.db'));
    return { store, dir };
}

describe('addEvent escape hatch — every stateful type', () => {
    let dir: string;
    let store: SqliteTaskStore;
    let service: TaskService;

    beforeEach(() => {
        ({ store, dir } = createStore());
        service = new TaskService(store);
    });

    afterEach(() => {
        store.close();
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('task.updated applies a generic patch via addEvent', async () => {
        const task = await service.create({ title: 'T' });
        await service.addEvent(task.taskId, 'task.updated', {
            patch: { title: 'Patched', tags: ['x'] },
            fields: ['title', 'tags'],
        });
        const updated = await service.get(task.taskId);
        expect(updated.title).toBe('Patched');
        expect(updated.tags).toEqual(['x']);
    });

    it('task.phase.set sets phase via addEvent', async () => {
        const task = await service.create({ title: 'T' });
        await service.addEvent(task.taskId, 'task.phase.set', { phase: 'planning' });
        expect((await service.get(task.taskId)).phase).toBe('planning');
    });

    it('task.status.set sets status via addEvent', async () => {
        const task = await service.create({ title: 'T' });
        await service.addEvent(task.taskId, 'task.status.set', { status: 'blocked' });
        expect((await service.get(task.taskId)).status).toBe('blocked');
    });

    it('task.progress.set sets progress via addEvent', async () => {
        const task = await service.create({ title: 'T' });
        await service.addEvent(task.taskId, 'task.progress.set', { text: 'go', percent: 25 });
        expect((await service.get(task.taskId)).progress).toEqual({ text: 'go', percent: 25 });
    });

    it('task.next_step.set sets nextStep via addEvent', async () => {
        const task = await service.create({ title: 'T' });
        await service.addEvent(task.taskId, 'task.next_step.set', { step: 'do thing' });
        expect((await service.get(task.taskId)).nextStep).toBe('do thing');
    });

    it('task.blocker.add adds a blocker via addEvent', async () => {
        const task = await service.create({ title: 'T' });
        await service.addEvent(task.taskId, 'task.blocker.add', {
            blockerId: 'blk-1',
            text: 'stuck',
        });
        const updated = await service.get(task.taskId);
        expect(updated.blockers).toHaveLength(1);
        expect(updated.blockers[0]).toMatchObject({ blockerId: 'blk-1', text: 'stuck' });
    });

    it('task.blocker.resolve resolves via addEvent', async () => {
        const task = await service.create({ title: 'T' });
        await service.addEvent(task.taskId, 'task.blocker.add', {
            blockerId: 'blk-1',
            text: 'stuck',
        });
        await service.addEvent(task.taskId, 'task.blocker.resolve', { blockerId: 'blk-1' });
        const updated = await service.get(task.taskId);
        expect(updated.blockers[0]!.status).toBe('resolved');
    });

    it('task.evidence.add records evidence via addEvent', async () => {
        const task = await service.create({ title: 'T' });
        await service.addEvent(task.taskId, 'task.evidence.add', {
            evidenceId: 'evd-1',
            command: 'nx build',
            exitCode: 0,
            passed: true,
        });
        const updated = await service.get(task.taskId);
        expect(updated.evidence).toHaveLength(1);
        expect(updated.evidence[0]).toMatchObject({ evidenceId: 'evd-1', passed: true });
    });

    it('task.artifact.add adds an artifact via addEvent', async () => {
        const task = await service.create({ title: 'T' });
        await service.addEvent(task.taskId, 'task.artifact.add', {
            artifactId: 'art-1',
            path: '/tmp/x',
        });
        const updated = await service.get(task.taskId);
        expect(updated.artifacts[0]).toMatchObject({ artifactId: 'art-1', path: '/tmp/x' });
    });

    it('task.attribution.set sets attribution via addEvent', async () => {
        const task = await service.create({ title: 'T' });
        await service.addEvent(task.taskId, 'task.attribution.set', { agentId: 'a1' });
        const updated = await service.get(task.taskId);
        expect(updated.attribution).toMatchObject({ agentId: 'a1' });
    });

    it('task.closed closes the task via addEvent', async () => {
        const task = await service.create({ title: 'T' });
        await service.addEvent(task.taskId, 'task.closed', { status: 'abandoned' });
        expect((await service.get(task.taskId)).status).toBe('abandoned');
    });

    it('task.created is a safe no-op via addEvent (already handled at create)', async () => {
        const task = await service.create({ title: 'T' });
        const evt = await service.addEvent(task.taskId, 'task.created', {
            title: 'X',
            status: 'open',
        });
        expect(evt.type).toBe('task.created');
        // Title unchanged.
        expect((await service.get(task.taskId)).title).toBe('T');
    });
});

describe('store error branches', () => {
    let dir: string;
    let store: SqliteTaskStore;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-store-err-'));
        store = new SqliteTaskStore(path.join(dir, 'tasks.db'));
    });

    afterEach(() => {
        store.close();
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('readTask wraps a corrupt snapshot as TaskStoreError', async () => {
        const taskId = 'task-20260101010101-aaaa';
        store.writeTaskDirect(taskId, '{ not valid json');
        await expect(store.readTask(taskId)).rejects.toBeInstanceOf(TaskStoreError);
    });

    it('readEvents wraps a corrupt event payload as TaskStoreError', async () => {
        const taskId = 'task-20260101010101-aaaa';
        await store.writeTask({
            taskId,
            title: 'T',
            summary: null,
            feature: null,
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
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            createdBy: null,
            eventCount: 0,
            lastEventAt: null,
        });
        store.appendEventDirect(taskId, 'evt-x', 'task.custom', '{ bad json');
        await expect(store.readEvents(taskId)).rejects.toBeInstanceOf(TaskStoreError);
    });

    it('opening a store at an invalid path throws TaskStoreError', () => {
        const blockFile = path.join(dir, 'blocker');
        fs.writeFileSync(blockFile, 'x', 'utf8');
        expect(() => new SqliteTaskStore(path.join(blockFile, 'tasks.db'))).toThrow(
            TaskStoreError
        );
    });
});

describe('service edge cases', () => {
    let dir: string;
    let store: SqliteTaskStore;
    let service: TaskService;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-edge-'));
        store = new SqliteTaskStore(path.join(dir, 'tasks.db'));
        service = new TaskService(store);
    });

    afterEach(() => {
        store.close();
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('update with empty patch is a no-op', async () => {
        const task = await service.create({ title: 'T' });
        const before = await service.get(task.taskId);
        const result = await service.update(task.taskId, {});
        expect(result.eventCount).toBe(before.eventCount);
    });

    it('addBlocker rejects empty text', async () => {
        const task = await service.create({ title: 'T' });
        await expect(service.addBlocker(task.taskId, { text: '   ' })).rejects.toBeInstanceOf(
            Error
        );
    });

    it('addEvidence rejects missing passed', async () => {
        const task = await service.create({ title: 'T' });
        await expect(service.addEvidence(task.taskId, { passed: 1 as never })).rejects.toThrow();
    });

    it('addArtifact rejects empty path', async () => {
        const task = await service.create({ title: 'T' });
        await expect(service.addArtifact(task.taskId, { path: '  ' })).rejects.toThrow();
    });

    it('addNote rejects empty text', async () => {
        const task = await service.create({ title: 'T' });
        await expect(service.addNote(task.taskId, '  ')).rejects.toThrow();
    });

    it('setProgress clear via null text', async () => {
        const task = await service.create({ title: 'T' });
        await service.setProgress(task.taskId, { text: 'hi', percent: 10 });
        const cleared = await service.setProgress(task.taskId, { text: null });
        expect(cleared.progress.text).toBeNull();
    });

    it('resolveBlocker is idempotent on already-resolved blocker', async () => {
        const task = await service.create({ title: 'T' });
        const { blockerId } = await service.addBlocker(task.taskId, { text: 'x' });
        await service.resolveBlocker(task.taskId, blockerId);
        const before = await service.get(task.taskId);
        await service.resolveBlocker(task.taskId, blockerId);
        const after = await service.get(task.taskId);
        expect(after.eventCount).toBe(before.eventCount);
    });

    it('addEvent throws TaskNotFoundError for a missing task', async () => {
        await expect(
            service.addEvent('task-missing', 'task.custom', { name: 'x' })
        ).rejects.toBeInstanceOf(TaskNotFoundError);
    });

    it('list with limit slices results', async () => {
        await service.create({ title: 'A' });
        await service.create({ title: 'B' });
        await service.create({ title: 'C' });
        const limited = await service.list({ limit: 2 });
        expect(limited).toHaveLength(2);
    });

    it('list with limit 0 returns empty', async () => {
        await service.create({ title: 'A' });
        expect(await service.list({ limit: 0 })).toHaveLength(0);
    });

    it('makeUniqueId falls back to extended suffix after repeated collisions', () => {
        const taken = new Set<string>();
        let count = 0;
        const exists = (candidate: string): boolean => {
            count++;
            taken.add(candidate);
            return count <= 30; // force the retry cap path
        };
        const id = makeUniqueId('task', exists, () => makeTaskId());
        expect(id).toMatch(/^task-\d{14}-[0-9a-z]{4,}$/);
    });
});

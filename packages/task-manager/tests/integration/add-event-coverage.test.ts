import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { TaskRepository } from '../../src/task.repository.js';
import { getDatabase, closeDatabase } from '../../src/database/connection.js';
import { TaskService } from '../../src/task.service.js';
import { TaskRepositoryError, TaskNotFoundError } from '../../src/task.errors.js';
import { nowIso } from '../../src/task.ids.js';

const TASK_ID = '00000000-0000-4000-8000-000000000001';
const MISSING_TASK_ID = '00000000-0000-4000-8000-000000000099';
const EVENT_ID = '00000000-0000-4000-8000-000000000002';
const BLOCKER_ID = '00000000-0000-4000-8000-000000000003';
const EVIDENCE_ID = '00000000-0000-4000-8000-000000000004';
const ARTIFACT_ID = '00000000-0000-4000-8000-000000000005';

/** Write a raw snapshot string directly (bypassing JSON encoding), mirroring how
 * @ai-devkit/memory's repository tests inject raw rows for error-path coverage. */
function writeRawSnapshot(dbPath: string, taskId: string, rawSnapshot: string): void {
    const now = nowIso();
    getDatabase({ dbPath }).execute(
        `INSERT OR REPLACE INTO tasks (task_id, snapshot, name, status, phase, created_at, updated_at)
         VALUES (?, ?, NULL, 'open', NULL, ?, ?)`,
        [taskId, rawSnapshot, now, now]
    );
}

function appendRawEvent(
    dbPath: string,
    taskId: string,
    eventId: string,
    type: string,
    rawPayload: string
): void {
    getDatabase({ dbPath }).execute(
        `INSERT INTO task_events (event_id, task_id, ts, type, actor, payload)
         VALUES (?, ?, ?, ?, NULL, ?)`,
        [eventId, taskId, nowIso(), type, rawPayload]
    );
}

function createRepository(): { repository: TaskRepository; dir: string } {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-evt-'));
    const repository = new TaskRepository(path.join(dir, 'tasks.db'));
    return { repository, dir };
}

describe('addEvent escape hatch — every stateful type', () => {
    let dir: string;
    let repository: TaskRepository;
    let service: TaskService;

    beforeEach(() => {
        closeDatabase();
        ({ repository, dir } = createRepository());
        service = new TaskService(repository);
    });

    afterEach(() => {
        closeDatabase();
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
        await service.addEvent(task.taskId, 'task.progress.set', { text: 'go' });
        expect((await service.get(task.taskId)).progress).toEqual({ text: 'go' });
    });

    it('task.next_step.set sets nextStep via addEvent', async () => {
        const task = await service.create({ title: 'T' });
        await service.addEvent(task.taskId, 'task.next_step.set', { step: 'do thing' });
        expect((await service.get(task.taskId)).nextStep).toBe('do thing');
    });

    it('task.blocker.add adds a blocker via addEvent', async () => {
        const task = await service.create({ title: 'T' });
        await service.addEvent(task.taskId, 'task.blocker.add', {
            blockerId: BLOCKER_ID,
            text: 'stuck',
        });
        const updated = await service.get(task.taskId);
        expect(updated.blockers).toHaveLength(1);
        expect(updated.blockers[0]).toMatchObject({ blockerId: BLOCKER_ID, text: 'stuck' });
    });

    it('task.blocker.resolve resolves via addEvent', async () => {
        const task = await service.create({ title: 'T' });
        await service.addEvent(task.taskId, 'task.blocker.add', {
            blockerId: BLOCKER_ID,
            text: 'stuck',
        });
        await service.addEvent(task.taskId, 'task.blocker.resolve', { blockerId: BLOCKER_ID });
        const updated = await service.get(task.taskId);
        expect(updated.blockers[0]!.status).toBe('resolved');
    });

    it('task.evidence.add records evidence via addEvent', async () => {
        const task = await service.create({ title: 'T' });
        await service.addEvent(task.taskId, 'task.evidence.add', {
            evidenceId: EVIDENCE_ID,
            command: 'nx build',
            exitCode: 0,
            passed: true,
        });
        const updated = await service.get(task.taskId);
        expect(updated.evidence).toHaveLength(1);
        expect(updated.evidence[0]).toMatchObject({ evidenceId: EVIDENCE_ID, passed: true });
    });

    it('task.artifact.add adds an artifact via addEvent', async () => {
        const task = await service.create({ title: 'T' });
        await service.addEvent(task.taskId, 'task.artifact.add', {
            artifactId: ARTIFACT_ID,
            path: '/tmp/x',
        });
        const updated = await service.get(task.taskId);
        expect(updated.artifacts[0]).toMatchObject({ artifactId: ARTIFACT_ID, path: '/tmp/x' });
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

describe('repository error branches', () => {
    let dir: string;
    let dbPath: string;
    let repository: TaskRepository;

    beforeEach(() => {
        closeDatabase();
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-repository-err-'));
        dbPath = path.join(dir, 'tasks.db');
        repository = new TaskRepository(dbPath);
    });

    afterEach(() => {
        closeDatabase();
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('readTask wraps a corrupt snapshot as TaskRepositoryError', async () => {
        writeRawSnapshot(dbPath, TASK_ID, '{ not valid json');
        await expect(repository.readTask(TASK_ID)).rejects.toBeInstanceOf(TaskRepositoryError);
    });

    it('readEvents wraps a corrupt event payload as TaskRepositoryError', async () => {
        await repository.writeTask({
            taskId: TASK_ID,
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
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            createdBy: null,
            eventCount: 0,
            lastEventAt: null,
        });
        appendRawEvent(dbPath, TASK_ID, EVENT_ID, 'task.custom', '{ bad json');
        await expect(repository.readEvents(TASK_ID)).rejects.toBeInstanceOf(TaskRepositoryError);
    });

    it('using a repository at an invalid path surfaces TaskRepositoryError on use', async () => {
        const blockFile = path.join(dir, 'blocker');
        fs.writeFileSync(blockFile, 'x', 'utf8');
        const bad = new TaskRepository(path.join(blockFile, 'tasks.db'));
        await expect(bad.exists('x')).rejects.toBeInstanceOf(TaskRepositoryError);
    });
});

describe('service edge cases', () => {
    let dir: string;
    let repository: TaskRepository;
    let service: TaskService;

    beforeEach(() => {
        closeDatabase();
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-edge-'));
        repository = new TaskRepository(path.join(dir, 'tasks.db'));
        service = new TaskService(repository);
    });

    afterEach(() => {
        closeDatabase();
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
        await service.setProgress(task.taskId, { text: 'hi' });
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
            service.addEvent(MISSING_TASK_ID, 'task.custom', { name: 'x' })
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
});

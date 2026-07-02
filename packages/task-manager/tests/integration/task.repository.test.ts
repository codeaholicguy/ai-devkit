import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { TaskRepository } from '../../src/task.repository.js';
import {
    resolveDbPath,
    DatabaseConnection,
    getDatabase,
    closeDatabase,
    DEFAULT_DB_PATH,
} from '../../src/database/connection.js';
import { getSchemaVersion, initializeSchema } from '../../src/database/schema.js';
import { TaskRepositoryError } from '../../src/task.errors.js';
import type { Task, TaskEvent } from '../../src/task.types.js';
import { makeTaskId, makeEventId, nowIso } from '../../src/task.ids.js';
import { createTaskService } from '../../src/index.js';

const TASK_ID = '00000000-0000-4000-8000-000000000001';
const SECOND_TASK_ID = '00000000-0000-4000-8000-000000000002';
const MISSING_TASK_ID = '00000000-0000-4000-8000-000000000099';
const EVENT_ID = '00000000-0000-4000-8000-000000000003';

function makeTask(overrides: Partial<Task> = {}): Task {
    const taskId = makeTaskId();
    return {
        taskId,
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
        createdAt: nowIso(),
        updatedAt: nowIso(),
        createdBy: null,
        eventCount: 0,
        lastEventAt: null,
        ...overrides,
    };
}

function makeEvent(taskId: string, overrides: Partial<TaskEvent> = {}): TaskEvent {
    return {
        eventId: makeEventId(),
        taskId,
        ts: nowIso(),
        type: 'task.created',
        actor: null,
        payload: { title: 'A' },
        ...overrides,
    };
}

/** Write a raw snapshot string directly (bypassing JSON encoding), mirroring how
 * @ai-devkit/memory's repository tests inject raw rows for error-path coverage. */
function writeRawSnapshot(dbPath: string, taskId: string, rawSnapshot: string): void {
    const now = nowIso();
    getDatabase({ dbPath }).execute(
        `INSERT OR REPLACE INTO tasks (task_id, snapshot, feature, status, phase, created_at, updated_at)
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

describe('TaskRepository', () => {
    let dir: string;
    let dbPath: string;
    let repository: TaskRepository;

    beforeEach(() => {
        closeDatabase();
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-sqlite-'));
        dbPath = path.join(dir, 'tasks.db');
        repository = new TaskRepository(dbPath);
    });

    afterEach(() => {
        closeDatabase();
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('writes and reads a task snapshot round-trip', async () => {
        const task = makeTask({ title: 'Hello', feature: 'feat', status: 'active', phase: 'design' });
        await repository.writeTask(task);
        const read = await repository.readTask(task.taskId);
        expect(read).toEqual(task);
    });

    it('returns null for a missing task', async () => {
        expect(await repository.readTask(MISSING_TASK_ID)).toBeNull();
    });

    it('exists() reflects presence of a task row', async () => {
        const task = makeTask();
        expect(await repository.exists(task.taskId)).toBe(false);
        await repository.writeTask(task);
        expect(await repository.exists(task.taskId)).toBe(true);
    });

    it('writeTask upserts (INSERT OR REPLACE) on repeat writes', async () => {
        const task = makeTask({ title: 'v1' });
        await repository.writeTask(task);
        await repository.writeTask({ ...task, title: 'v2', updatedAt: nowIso() });
        const read = await repository.readTask(task.taskId);
        expect(read?.title).toBe('v2');
    });

    it('listTaskIds returns all task ids', async () => {
        await repository.writeTask(makeTask({ taskId: TASK_ID }));
        await repository.writeTask(makeTask({ taskId: SECOND_TASK_ID }));
        const ids = await repository.listTaskIds();
        expect(ids.sort()).toEqual([TASK_ID, SECOND_TASK_ID]);
    });

    it('returns [] for listTaskIds when empty', async () => {
        expect(await repository.listTaskIds()).toEqual([]);
    });

    it('appends events and reads them back in insertion order', async () => {
        await repository.writeTask(makeTask({ taskId: TASK_ID }));
        const e1 = makeEvent(TASK_ID, { type: 'task.phase.set', payload: { phase: 'design' } });
        const e2 = makeEvent(TASK_ID, { type: 'task.note.append', payload: { text: 'hi' } });
        await repository.appendEvent(e1);
        await repository.appendEvent(e2);

        const events = await repository.readEvents(TASK_ID);
        expect(events).toHaveLength(2);
        expect(events[0]).toEqual(e1);
        expect(events[1]).toEqual(e2);
    });

    it('preserves actor (nullable JSON) and payload through round-trip', async () => {
        await repository.writeTask(makeTask({ taskId: TASK_ID }));
        const evt = makeEvent(TASK_ID, {
            type: 'task.attribution.set',
            actor: { agentId: 'a1', agentType: 'pi', pid: 123 },
            payload: { agentId: 'a1' },
        });
        await repository.appendEvent(evt);
        const read = await repository.readEvents(TASK_ID);
        expect(read[0]).toEqual(evt);
    });

    it('returns [] for events when none exist', async () => {
        expect(await repository.readEvents(MISSING_TASK_ID)).toEqual([]);
    });

    it('wraps a corrupt snapshot read as TaskRepositoryError', async () => {
        writeRawSnapshot(dbPath, TASK_ID, '{ not valid json');
        await expect(repository.readTask(TASK_ID)).rejects.toBeInstanceOf(TaskRepositoryError);
    });

    it('wraps a corrupt event payload read as TaskRepositoryError', async () => {
        await repository.writeTask(makeTask({ taskId: TASK_ID }));
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

describe('resolveDbPath', () => {
    it('uses explicit argument first', () => {
        expect(resolveDbPath('/explicit/tasks.db')).toBe('/explicit/tasks.db');
    });

    it('trims explicit arguments', () => {
        expect(resolveDbPath('  /explicit/tasks.db  ')).toBe('/explicit/tasks.db');
    });

    it('falls back to ~/.ai-devkit/tasks.db when nothing is set', () => {
        expect(resolveDbPath()).toBe(path.join(os.homedir(), '.ai-devkit', 'tasks.db'));
        expect(DEFAULT_DB_PATH).toBe(path.join(os.homedir(), '.ai-devkit', 'tasks.db'));
    });
});

describe('createTaskService', () => {
    let dir: string;

    beforeEach(() => {
        closeDatabase();
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-service-factory-'));
    });

    afterEach(() => {
        closeDatabase();
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('uses an explicit path when provided', async () => {
        const dbPath = path.join(dir, 'configured-tasks.db');
        const service = createTaskService(dbPath);
        await service.create({ title: 'From explicit path' });
        expect(fs.existsSync(dbPath)).toBe(true);
    });
});

describe('schema + connection', () => {
    let dir: string;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-schema-'));
    });

    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('initializeSchema brings a fresh connection to version 1', () => {
        const conn = new DatabaseConnection({ dbPath: path.join(dir, 'tasks.db') });
        expect(getSchemaVersion(conn)).toBe(0);
        initializeSchema(conn);
        expect(getSchemaVersion(conn)).toBe(1);
        conn.close();
    });

    it('initializeSchema is idempotent (running again does not bump version)', () => {
        const dbPath = path.join(dir, 'tasks.db');
        const conn = new DatabaseConnection({ dbPath });
        initializeSchema(conn);
        initializeSchema(conn);
        expect(getSchemaVersion(conn)).toBe(1);
        conn.close();
    });
});

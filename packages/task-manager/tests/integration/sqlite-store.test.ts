import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { SqliteTaskStore } from '../../src/store/sqlite-store.js';
import { resolveDbPath, DatabaseConnection } from '../../src/database/connection.js';
import { getSchemaVersion } from '../../src/database/schema.js';
import { TaskStoreError } from '../../src/errors.js';
import type { Task, TaskEvent } from '../../src/types/index.js';
import { makeTaskId, makeEventId, nowIso } from '../../src/ids.js';

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

describe('SqliteTaskStore', () => {
    let dir: string;
    let dbPath: string;
    let store: SqliteTaskStore;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-sqlite-'));
        dbPath = path.join(dir, 'tasks.db');
        store = new SqliteTaskStore(dbPath);
    });

    afterEach(() => {
        store.close();
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('writes and reads a task snapshot round-trip', async () => {
        const task = makeTask({ title: 'Hello', feature: 'feat', status: 'active', phase: 'design' });
        await store.writeTask(task);
        const read = await store.readTask(task.taskId);
        expect(read).toEqual(task);
    });

    it('returns null for a missing task', async () => {
        expect(await store.readTask('task-missing')).toBeNull();
    });

    it('exists() reflects presence of a task row', async () => {
        const task = makeTask();
        expect(await store.exists(task.taskId)).toBe(false);
        await store.writeTask(task);
        expect(await store.exists(task.taskId)).toBe(true);
    });

    it('writeTask upserts (INSERT OR REPLACE) on repeat writes', async () => {
        const task = makeTask({ title: 'v1' });
        await store.writeTask(task);
        await store.writeTask({ ...task, title: 'v2', updatedAt: nowIso() });
        const read = await store.readTask(task.taskId);
        expect(read?.title).toBe('v2');
    });

    it('listTaskIds returns all task ids', async () => {
        await store.writeTask(makeTask({ taskId: 'task-20260101010101-aaaa' }));
        await store.writeTask(makeTask({ taskId: 'task-20260202020202-bbbb' }));
        const ids = await store.listTaskIds();
        expect(ids.sort()).toEqual(['task-20260101010101-aaaa', 'task-20260202020202-bbbb']);
    });

    it('returns [] for listTaskIds when empty', async () => {
        expect(await store.listTaskIds()).toEqual([]);
    });

    it('appends events and reads them back in insertion order', async () => {
        const taskId = 'task-20260101010101-aaaa';
        await store.writeTask(makeTask({ taskId }));
        const e1 = makeEvent(taskId, { type: 'task.phase.set', payload: { phase: 'design' } });
        const e2 = makeEvent(taskId, { type: 'task.note.append', payload: { text: 'hi' } });
        await store.appendEvent(e1);
        await store.appendEvent(e2);

        const events = await store.readEvents(taskId);
        expect(events).toHaveLength(2);
        expect(events[0]).toEqual(e1);
        expect(events[1]).toEqual(e2);
    });

    it('preserves actor (nullable JSON) and payload through round-trip', async () => {
        const taskId = 'task-20260101010101-aaaa';
        await store.writeTask(makeTask({ taskId }));
        const evt = makeEvent(taskId, {
            type: 'task.attribution.set',
            actor: { agentId: 'a1', agentType: 'pi', pid: 123 },
            payload: { agentId: 'a1' },
        });
        await store.appendEvent(evt);
        const read = await store.readEvents(taskId);
        expect(read[0]).toEqual(evt);
    });

    it('returns [] for events when none exist', async () => {
        expect(await store.readEvents('task-none')).toEqual([]);
    });

    it('nextTaskId returns a valid, non-colliding id', async () => {
        const id = await store.nextTaskId();
        expect(id).toMatch(/^task-\d{14}-[0-9a-z]{6}$/);
        expect(await store.exists(id)).toBe(false);
    });

    it('nextEventId returns a valid id', async () => {
        expect(await store.nextEventId()).toMatch(/^evt-\d{14}-[0-9a-z]{6}$/);
    });

    it('nextTaskId avoids an existing id', async () => {
        const existing = 'task-20260101010101-aaaa';
        await store.writeTask(makeTask({ taskId: existing }));
        // makeUniqueId retries until non-colliding; the result must differ.
        const id = await store.nextTaskId();
        expect(id).not.toBe(existing);
    });

    it('wraps a corrupt snapshot read as TaskStoreError', async () => {
        const taskId = 'task-20260101010101-aaaa';
        // Insert a row with invalid JSON directly.
        store.writeTaskDirect(taskId, '{ not valid json');
        await expect(store.readTask(taskId)).rejects.toBeInstanceOf(TaskStoreError);
    });

    it('wraps a corrupt event payload read as TaskStoreError', async () => {
        const taskId = 'task-20260101010101-aaaa';
        await store.writeTask(makeTask({ taskId }));
        store.appendEventDirect(taskId, 'evt-x', 'task.custom', '{ bad json');
        await expect(store.readEvents(taskId)).rejects.toBeInstanceOf(TaskStoreError);
    });

    it('opening a store at an invalid path throws TaskStoreError', () => {
        const blockFile = path.join(dir, 'blocker');
        fs.writeFileSync(blockFile, 'x', 'utf8');
        expect(() => new SqliteTaskStore(path.join(blockFile, 'tasks.db'))).toThrow(TaskStoreError);
    });
});

describe('resolveDbPath', () => {
    const origEnv = { ...process.env };

    afterEach(() => {
        process.env = { ...origEnv };
    });

    it('uses explicit argument first', () => {
        expect(resolveDbPath('/explicit/tasks.db')).toBe('/explicit/tasks.db');
    });

    it('falls back to AIDEVKIT_TASKS_DB when no argument', () => {
        process.env.AIDEVKIT_TASKS_DB = '/from/env/tasks.db';
        expect(resolveDbPath()).toBe('/from/env/tasks.db');
    });

    it('falls back to ~/.ai-devkit/tasks.db when nothing is set', () => {
        delete process.env.AIDEVKIT_TASKS_DB;
        const home = process.env.HOME || process.env.USERPROFILE || '';
        expect(resolveDbPath()).toBe(path.join(home, '.ai-devkit', 'tasks.db'));
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

    it('initializes schema to version 1 on open', () => {
        const conn = new DatabaseConnection({ dbPath: path.join(dir, 'tasks.db') });
        expect(getSchemaVersion(conn)).toBe(1);
        conn.close();
    });

    it('is idempotent (reopening does not bump version)', () => {
        const dbPath = path.join(dir, 'tasks.db');
        const c1 = new DatabaseConnection({ dbPath });
        c1.close();
        const c2 = new DatabaseConnection({ dbPath });
        expect(getSchemaVersion(c2)).toBe(1);
        c2.close();
    });
});

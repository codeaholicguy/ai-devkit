import type { Task, TaskEvent } from './task.types.js';
import { TaskRepositoryError } from './task.errors.js';
import {
    getDatabase,
    DEFAULT_DB_PATH,
    type DatabaseConnection,
} from './database/connection.js';

interface EventRow {
    event_id: string;
    task_id: string;
    ts: string;
    type: string;
    actor: string | null;
    payload: string;
}

function describeError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/**
 * Task persistence. Stores each task snapshot as one row (full Task JSON plus
 * indexed query columns) and each event as one row in an append-only `task_events`
 * table. Holds only a DB path and obtains the shared connection from `getDatabase`
 * on each operation (mirrors @ai-devkit/memory's connection lifecycle).
 *
 * Storage layout (see src/database/migrations/001_initial.sql):
 *   - `tasks`        — one row per task snapshot (full Task JSON + indexed cols)
 *   - `task_events`  — append-only event history (one row per event)
 *
 * Default DB path: ~/.ai-devkit/tasks.db (override via the `dbPath` arg; see
 * resolveDbPath). Long-running callers release the shared
 * connection with `closeDatabase()`.
 */
export class TaskRepository {
    private readonly dbPath: string;

    constructor(dbPath: string = DEFAULT_DB_PATH) {
        this.dbPath = dbPath;
    }

    private db(): DatabaseConnection {
        try {
            return getDatabase({ dbPath: this.dbPath });
        } catch (error) {
            throw new TaskRepositoryError('Failed to open task database', {
                originalError: describeError(error),
            });
        }
    }

    async exists(taskId: string): Promise<boolean> {
        const row = this.db().queryOne<{ task_id: string }>(
            'SELECT task_id FROM tasks WHERE task_id = ?',
            [taskId]
        );
        return row !== undefined;
    }

    async readTask(taskId: string): Promise<Task | null> {
        const row = this.db().queryOne<{ snapshot: string }>(
            'SELECT snapshot FROM tasks WHERE task_id = ?',
            [taskId]
        );
        if (!row) {
            return null;
        }
        try {
            return JSON.parse(row.snapshot) as Task;
        } catch (error) {
            throw new TaskRepositoryError(`Failed to read task ${taskId}`, {
                taskId,
                originalError: describeError(error),
            });
        }
    }

    async writeTask(task: Task): Promise<void> {
        const snapshot = JSON.stringify(task);
        try {
            this.db().execute(
                `INSERT OR REPLACE INTO tasks (task_id, snapshot, feature, status, phase, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    task.taskId,
                    snapshot,
                    task.feature,
                    task.status,
                    task.phase,
                    task.createdAt,
                    task.updatedAt,
                ]
            );
        } catch (error) {
            throw new TaskRepositoryError(`Failed to write task ${task.taskId}`, {
                taskId: task.taskId,
                originalError: describeError(error),
            });
        }
    }

    async listTaskIds(): Promise<string[]> {
        const rows = this.db().query<{ task_id: string }>('SELECT task_id FROM tasks');
        return rows.map((r) => r.task_id);
    }

    async readEvents(taskId: string): Promise<TaskEvent[]> {
        const rows = this.db().query<EventRow>(
            `SELECT event_id, task_id, ts, type, actor, payload
             FROM task_events WHERE task_id = ? ORDER BY id ASC`,
            [taskId]
        );
        const events: TaskEvent[] = [];
        for (const row of rows) {
            try {
                events.push({
                    eventId: row.event_id,
                    taskId: row.task_id,
                    ts: row.ts,
                    type: row.type as TaskEvent['type'],
                    actor: row.actor ? (JSON.parse(row.actor) as TaskEvent['actor']) : null,
                    payload: JSON.parse(row.payload) as Record<string, unknown>,
                });
            } catch (error) {
                throw new TaskRepositoryError(`Failed to read events for task ${taskId}`, {
                    taskId,
                    eventId: row.event_id,
                    originalError: describeError(error),
                });
            }
        }
        return events;
    }

    async appendEvent(event: TaskEvent): Promise<void> {
        try {
            this.db().execute(
                `INSERT INTO task_events (event_id, task_id, ts, type, actor, payload)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    event.eventId,
                    event.taskId,
                    event.ts,
                    event.type,
                    event.actor ? JSON.stringify(event.actor) : null,
                    JSON.stringify(event.payload),
                ]
            );
        } catch (error) {
            throw new TaskRepositoryError(`Failed to append event for task ${event.taskId}`, {
                taskId: event.taskId,
                eventId: event.eventId,
                originalError: describeError(error),
            });
        }
    }
}

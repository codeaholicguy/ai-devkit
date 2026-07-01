import type { Task, TaskEvent } from '../types/index.js';
import type { TaskStore } from './types.js';
import { TaskStoreError } from '../errors.js';
import { makeTaskId, makeEventId, makeUniqueId } from '../ids.js';
import { DatabaseConnection } from '../database/connection.js';

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

function nowIsoStr(): string {
    return new Date().toISOString();
}

/**
 * SQLite-backed `TaskStore`. Stores each task snapshot as one row (with the full
 * Task JSON plus indexed query columns) and each event as one row in an
 * append-only `task_events` table. Preserves the logical model (snapshot +
 * append-only event history) while storing it physically in SQLite.
 *
 * Default DB path: ~/.ai-devkit/tasks.db (see resolveDbPath).
 *
 * Owns its connection by default (opened in the constructor, closed via
 * `close()`). A caller may inject an existing `DatabaseConnection` to share one.
 */
export class SqliteTaskStore implements TaskStore {
    private readonly conn: DatabaseConnection;
    private readonly ownsConnection: boolean;

    constructor(connOrPath?: DatabaseConnection | string) {
        try {
            if (connOrPath instanceof DatabaseConnection) {
                this.conn = connOrPath;
                this.ownsConnection = false;
            } else {
                this.conn = new DatabaseConnection({ dbPath: connOrPath });
                this.ownsConnection = true;
            }
        } catch (error) {
            throw new TaskStoreError('Failed to open task database', {
                originalError: describeError(error),
            });
        }
    }

    async exists(taskId: string): Promise<boolean> {
        return this.existsSync(taskId);
    }

    private existsSync(taskId: string): boolean {
        const row = this.conn.queryOne<{ task_id: string }>(
            'SELECT task_id FROM tasks WHERE task_id = ?',
            [taskId]
        );
        return row !== undefined;
    }

    async readTask(taskId: string): Promise<Task | null> {
        const row = this.conn.queryOne<{ snapshot: string }>(
            'SELECT snapshot FROM tasks WHERE task_id = ?',
            [taskId]
        );
        if (!row) {
            return null;
        }
        try {
            return JSON.parse(row.snapshot) as Task;
        } catch (error) {
            throw new TaskStoreError(`Failed to read task ${taskId}`, {
                taskId,
                originalError: describeError(error),
            });
        }
    }

    async writeTask(task: Task): Promise<void> {
        const snapshot = JSON.stringify(task);
        try {
            this.conn.execute(
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
            throw new TaskStoreError(`Failed to write task ${task.taskId}`, {
                taskId: task.taskId,
                originalError: describeError(error),
            });
        }
    }

    async listTaskIds(): Promise<string[]> {
        const rows = this.conn.query<{ task_id: string }>('SELECT task_id FROM tasks');
        return rows.map((r) => r.task_id);
    }

    async readEvents(taskId: string): Promise<TaskEvent[]> {
        const rows = this.conn.query<EventRow>(
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
                throw new TaskStoreError(`Failed to read events for task ${taskId}`, {
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
            this.conn.execute(
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
            throw new TaskStoreError(`Failed to append event for task ${event.taskId}`, {
                taskId: event.taskId,
                eventId: event.eventId,
                originalError: describeError(error),
            });
        }
    }

    async nextTaskId(): Promise<string> {
        return makeUniqueId('task', (candidate) => this.existsSync(candidate), makeTaskId);
    }

    async nextEventId(): Promise<string> {
        // Uniqueness is enforced by the UNIQUE constraint on task_events.event_id.
        return makeEventId();
    }

    /** Close the owned database connection (no-op when an external connection was injected). */
    close(): void {
        if (this.ownsConnection) {
            this.conn.close();
        }
    }

    // -----------------------------------------------------------------------
    // Low-level helpers (testing / DB inspection)
    // -----------------------------------------------------------------------

    /** Insert a raw snapshot string, bypassing JSON encoding (for testing error paths). */
    writeTaskDirect(taskId: string, rawSnapshot: string): void {
        this.conn.execute(
            `INSERT OR REPLACE INTO tasks (task_id, snapshot, feature, status, phase, created_at, updated_at)
             VALUES (?, ?, NULL, 'open', NULL, ?, ?)`,
            [taskId, rawSnapshot, nowIsoStr(), nowIsoStr()]
        );
    }

    /** Insert a raw event payload string, bypassing JSON encoding (for testing error paths). */
    appendEventDirect(taskId: string, eventId: string, type: string, rawPayload: string): void {
        this.conn.execute(
            `INSERT INTO task_events (event_id, task_id, ts, type, actor, payload)
             VALUES (?, ?, ?, ?, NULL, ?)`,
            [eventId, taskId, nowIsoStr(), type, rawPayload]
        );
    }

    /** Whether the stored snapshot JSON contains `needle` (testing / inspection helper). */
    snapshotContains(taskId: string, needle: string): boolean {
        const row = this.conn.queryOne<{ snapshot: string }>(
            'SELECT snapshot FROM tasks WHERE task_id = ?',
            [taskId]
        );
        return row !== undefined && row.snapshot.includes(needle);
    }
}

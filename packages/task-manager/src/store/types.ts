import type { Task, TaskEvent } from '../types/index.js';

/**
 * Storage Provider Interface (SPI). Only the task-manager package implements
 * this; callers (CLI, skills, consumers) use `TaskService` and never touch
 * storage. The default implementation is `SqliteTaskStore`; a future store can
 * implement this same interface without changing any caller.
 */
export interface TaskStore {
    exists(taskId: string): Promise<boolean>;
    readTask(taskId: string): Promise<Task | null>;
    writeTask(task: Task): Promise<void>;
    listTaskIds(): Promise<string[]>;
    readEvents(taskId: string): Promise<TaskEvent[]>;
    appendEvent(event: TaskEvent): Promise<void>;
    /** Generate a collision-safe task id for a new task. */
    nextTaskId(): Promise<string>;
    /** Generate a collision-safe event id for a new event. */
    nextEventId(): Promise<string>;
}

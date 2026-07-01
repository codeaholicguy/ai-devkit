/**
 * Contract port for the ai-devkit Task system.
 *
 * This file mirrors the LOCKED Task/TaskEvent contract authored by
 * `feature-task-system` (see `docs/ai/design/2026-07-01-feature-task-system.CONTRACT.md`).
 * Field names, event-type strings, and the `ITaskService` method surface are
 * verbatim from that contract. All methods are async (Promise-returning).
 *
 * `task-tracer` consumes this port only — it never touches task storage. When
 * `@ai-devkit/task-manager` ships, its `TaskService` implements this interface
 * and is injected into `TaskTracer` with no mapping-logic changes.
 *
 * If the shipped package diverges from these names, the sibling worker will ping
 * before publishing (coordination commitment).
 */

// ---------------------------------------------------------------------------
// Sub-objects
// ---------------------------------------------------------------------------

export interface Actor {
    agentId?: string;
    agentType?: string;
    pid?: number;
    sessionId?: string;
}

export interface TaskBlocker {
    blockerId: string; // blk-<ts>-<4>
    text: string;
    status: 'open' | 'resolved';
    raisedAt: string; // ISO 8601
    resolvedAt: string | null;
    raisedBy: Actor | null;
}

export interface TaskEvidence {
    evidenceId: string; // evd-<ts>-<4>
    command: string | null;
    exitCode: number | null;
    passed: boolean;
    summary: string | null;
    artifacts: string[]; // REFERENCE only
    recordedAt: string; // ISO 8601
    actor: Actor | null;
}

export interface TaskArtifact {
    artifactId: string; // art-<ts>-<4>
    path: string; // REFERENCE only (never copied)
    kind: string | null;
    description: string | null;
    addedAt: string; // ISO 8601
}

export interface TaskLinks {
    branch?: string;
    worktree?: string;
    pr?: string;
    commits?: string[];
}

// ---------------------------------------------------------------------------
// Task snapshot + TaskEvent
// ---------------------------------------------------------------------------

export type TaskStatus = 'open' | 'active' | 'blocked' | 'completed' | 'abandoned';

export interface TaskProgress {
    text: string | null;
    percent: number | null; // 0..100
}

export interface Task {
    taskId: string; // task-<YYYYMMDDHHMMSS>-<4 base36>, IMMUTABLE
    title: string;
    summary: string | null;
    feature: string | null; // kebab-case key, nullable for ad-hoc tasks
    status: TaskStatus;
    phase: string | null; // free-form; recommended enum left to callers
    phaseEnteredAt: string | null; // ISO 8601
    progress: TaskProgress;
    nextStep: string | null;
    blockers: TaskBlocker[];
    evidence: TaskEvidence[];
    artifacts: TaskArtifact[];
    attribution: Actor | null; // current owner
    links: TaskLinks;
    tags: string[];
    meta: Record<string, string | number | boolean | null>;
    createdAt: string; // ISO 8601
    updatedAt: string; // ISO 8601
    createdBy: Actor | null;
    eventCount: number; // cached derivation
    lastEventAt: string | null; // cached derivation
}

/**
 * CLOSED SET of TaskEvent type strings. FROZEN by the contract.
 * Stateful types mutate the snapshot AND append an event.
 * `task.note.append` / `task.custom` are event-only (no snapshot mutation).
 */
export const TASK_EVENT_TYPES = [
    'task.created',
    'task.updated',
    'task.phase.set',
    'task.status.set',
    'task.progress.set',
    'task.next_step.set',
    'task.blocker.add',
    'task.blocker.resolve',
    'task.evidence.add',
    'task.artifact.add',
    'task.attribution.set',
    'task.note.append',
    'task.custom',
    'task.closed',
] as const;

export type TaskEventType = (typeof TASK_EVENT_TYPES)[number];

export interface TaskEvent {
    eventId: string; // evt-<ts>-<4>
    taskId: string;
    ts: string; // ISO 8601
    type: TaskEventType;
    actor: Actor | null; // who emitted (auto-resolved if caller omits)
    payload: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Inputs (mirror of TaskService method inputs)
// ---------------------------------------------------------------------------

export interface CreateTaskInput {
    title: string;
    feature?: string;
    summary?: string;
    phase?: string;
    tags?: string[];
    links?: TaskLinks;
    meta?: Record<string, string | number | boolean | null>;
    actor?: Actor;
}

export interface UpdateTaskInput {
    title?: string;
    summary?: string;
    tags?: string[];
    links?: TaskLinks;
    meta?: Record<string, string | number | boolean | null>;
}

export interface TaskRef {
    feature: string;
}

export interface ListFilter {
    feature?: string;
    status?: TaskStatus;
    phase?: string;
    limit?: number;
}

export interface ProgressInput {
    text?: string | null;
    percent?: number | null;
}

export interface AddBlockerInput {
    text: string;
}

export interface AddEvidenceInput {
    command?: string | null;
    exitCode?: number | null;
    passed: boolean;
    summary?: string | null;
    artifacts?: string[];
}

export interface AddArtifactInput {
    path: string;
    kind?: string | null;
    description?: string | null;
}

export interface MutatorOptions {
    actor?: Actor;
}

export interface AddBlockerResult {
    task: Task;
    blockerId: string;
}
export interface AddEvidenceResult {
    task: Task;
    evidenceId: string;
}
export interface AddArtifactResult {
    task: Task;
    artifactId: string;
}

export interface EventFilter {
    type?: TaskEventType;
    limit?: number;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class TaskNotFoundError extends Error {
    constructor(public taskId: string) {
        super(`Task not found: ${taskId}`);
        this.name = 'TaskNotFoundError';
    }
}

export class AmbiguousTaskPrefixError extends Error {
    constructor(public prefix: string, public matches: string[]) {
        super(`Ambiguous task id prefix "${prefix}": ${matches.join(', ')}`);
        this.name = 'AmbiguousTaskPrefixError';
    }
}

// ---------------------------------------------------------------------------
// Service port (async). Mirrors `class TaskService` from the locked contract.
// Consume this; never implement storage here.
// ---------------------------------------------------------------------------

export interface ITaskService {
    create(input: CreateTaskInput): Promise<Task>;
    get(taskId: string): Promise<Task>;
    resolveTask(ref: string | TaskRef | { taskId: string }): Promise<Task | null>;
    list(filter?: ListFilter): Promise<Task[]>;

    update(taskId: string, patch: UpdateTaskInput, opts?: MutatorOptions): Promise<Task>;
    setPhase(taskId: string, phase: string | null, opts?: MutatorOptions): Promise<Task>;
    setStatus(taskId: string, status: TaskStatus, opts?: MutatorOptions): Promise<Task>;
    setProgress(taskId: string, progress: ProgressInput, opts?: MutatorOptions): Promise<Task>;
    setNextStep(taskId: string, step: string | null, opts?: MutatorOptions): Promise<Task>;

    addBlocker(taskId: string, input: AddBlockerInput, opts?: MutatorOptions): Promise<AddBlockerResult>;
    resolveBlocker(taskId: string, blockerId: string, opts?: MutatorOptions): Promise<Task>;
    addEvidence(taskId: string, input: AddEvidenceInput, opts?: MutatorOptions): Promise<AddEvidenceResult>;
    addArtifact(taskId: string, input: AddArtifactInput, opts?: MutatorOptions): Promise<AddArtifactResult>;
    setAttribution(taskId: string, actor: Actor, opts?: MutatorOptions): Promise<Task>;

    addNote(taskId: string, text: string, opts?: MutatorOptions): Promise<Task>;
    close(taskId: string, status: 'completed' | 'abandoned', opts?: MutatorOptions): Promise<Task>;

    addEvent(taskId: string, type: TaskEventType, payload: Record<string, unknown>, opts?: MutatorOptions): Promise<TaskEvent>;
    getEvents(taskId: string, filter?: EventFilter): Promise<TaskEvent[]>;
}

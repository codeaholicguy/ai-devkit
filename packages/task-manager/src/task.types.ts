/**
 * Task system types.
 *
 * Type names, field names, and the TaskEventType union strings are the package's
 * public surface; consumers (CLI, skills) wire up against them directly.
 */

/**
 * Attribution unit: who emitted an event or who currently owns a task.
 * All fields optional; a completely-unattributed actor is represented as `null`.
 */
export interface Actor {
    /** Stable agent id from the agent-manager registry, if any. */
    agentId?: string;
    /** Agent type, e.g. "claude" | "codex" | "pi" | "human". */
    agentType?: string;
    /** OS process id of the emitting agent, if known. */
    pid?: number;
    /** Agent session id, if known. */
    sessionId?: string;
}

export type TaskStatus = 'open' | 'active' | 'blocked' | 'completed' | 'abandoned';

/**
 * Workflow phase. Free-form string so structured-debug and custom workflows
 * are not constrained. Recommended lifecycle values:
 * "requirements" | "design" | "planning" | "implementation" | "testing" | "review"
 */
export type LifecyclePhase = string | null;

export interface TaskProgress {
    /** Free-form progress description. */
    text: string | null;
}

export interface TaskLinks {
    branch?: string;
    worktree?: string;
    pr?: string;
    commits?: string[];
}

export interface TaskBlocker {
    /** Raw UUIDv4. */
    blockerId: string;
    text: string;
    status: 'open' | 'resolved';
    raisedAt: string; // ISO 8601
    resolvedAt: string | null; // ISO 8601
    raisedBy: Actor | null;
}

export interface TaskEvidence {
    /** Raw UUIDv4. */
    evidenceId: string;
    command: string | null;
    exitCode: number | null;
    /** true = pass/success, false = fail. Required. */
    passed: boolean;
    /** Inline durable summary text (the "copied" path for verification output). */
    summary: string | null;
    /** Artifact references (artifactId and/or free path strings). */
    artifacts: string[];
    recordedAt: string; // ISO 8601
    actor: Actor | null;
}

export interface TaskArtifact {
    /** Raw UUIDv4. */
    artifactId: string;
    /** Reference only — the file contents are never copied into storage. */
    path: string;
    /** e.g. "log" | "report" | "diff" | "screenshot". */
    kind: string | null;
    description: string | null;
    addedAt: string; // ISO 8601
}

/**
 * Task snapshot. Persisted as JSON in the `tasks` table; authoritative for reads.
 */
export interface Task {
    /** Raw UUIDv4; immutable, never reused. */
    taskId: string;
    title: string;
    summary: string | null;
    /** Kebab-case task key, e.g. "task-system" or "debug-auth-timeout". */
    name: string | null;
    status: TaskStatus;
    phase: LifecyclePhase;
    phaseEnteredAt: string | null; // ISO 8601
    progress: TaskProgress;
    nextStep: string | null;
    blockers: TaskBlocker[];
    evidence: TaskEvidence[];
    artifacts: TaskArtifact[];
    /** Current owner (who owns the task now); per-event emitter is on each event. */
    attribution: Actor | null;
    links: TaskLinks;
    tags: string[];
    /** Free-form tracing extras (kept as primitive values for JSON portability). */
    meta: Record<string, string | number | boolean | null>;
    createdAt: string; // ISO 8601
    updatedAt: string; // ISO 8601
    createdBy: Actor | null;
    /** Cached count of events (derived from the `task_events` table). */
    eventCount: number;
    /** Cached timestamp of the most recent event (derived). */
    lastEventAt: string | null;
}

/**
 * Closed set of event type strings. Do not change the literal values.
 */
export type TaskEventType =
    | 'task.created'
    | 'task.updated'
    | 'task.phase.set'
    | 'task.status.set'
    | 'task.progress.set'
    | 'task.next_step.set'
    | 'task.blocker.add'
    | 'task.blocker.resolve'
    | 'task.evidence.add'
    | 'task.artifact.add'
    | 'task.attribution.set'
    | 'task.note.append'
    | 'task.custom'
    | 'task.closed';

export interface TaskEvent {
    /** Raw UUIDv4. */
    eventId: string;
    taskId: string;
    /** ISO 8601 timestamp. */
    ts: string;
    type: TaskEventType;
    /** Who emitted this event, when the caller provides actor metadata. */
    actor: Actor | null;
    /** Shape depends on `type`; see the contract for per-type payload schemas. */
    payload: Record<string, unknown>;
}

export interface TaskCreatedPayload {
    title: string;
    name?: string | null;
    summary?: string | null;
    status: TaskStatus;
    phase?: LifecyclePhase;
}

export interface TaskUpdatedPayload {
    patch: Partial<Pick<Task, 'title' | 'summary' | 'tags' | 'links' | 'meta'>>;
    fields: string[];
}

export interface TaskPhaseSetPayload {
    phase: LifecyclePhase;
    previous?: LifecyclePhase;
}

export interface TaskStatusSetPayload {
    status: TaskStatus;
    previous?: TaskStatus;
}

export interface TaskProgressSetPayload {
    text?: string | null;
}

export interface TaskNextStepSetPayload {
    step: string | null;
}

export interface TaskBlockerAddPayload {
    blockerId: string;
    text: string;
}

export interface TaskBlockerResolvePayload {
    blockerId: string;
}

export interface TaskEvidenceAddPayload {
    evidenceId: string;
    command?: string | null;
    exitCode?: number | null;
    passed: boolean;
    summary?: string | null;
    artifacts?: string[];
}

export interface TaskArtifactAddPayload {
    artifactId: string;
    path: string;
    kind?: string | null;
    description?: string | null;
}

export interface TaskAttributionSetPayload {
    agentId?: string;
    agentType?: string;
    pid?: number;
    sessionId?: string;
}

export interface TaskNoteAppendPayload {
    text: string;
}

export interface TaskCustomPayload {
    name: string;
    data?: Record<string, unknown>;
}

export interface TaskClosedPayload {
    status: 'completed' | 'abandoned';
}

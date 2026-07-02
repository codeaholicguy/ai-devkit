import type {
    Actor,
    LifecyclePhase,
    Task,
    TaskArtifact,
    TaskBlocker,
    TaskEvent,
    TaskEventType,
    TaskEvidence,
    TaskLinks,
    TaskProgress,
    TaskStatus,
} from './task.types.js';
import type { TaskRepository } from './task.repository.js';
import {
    AmbiguousTaskRefError,
    TaskNotFoundError,
    TaskResourceNotFoundError,
    TaskValidationError,
    UnknownEventTypeError,
    isTaskEventType,
} from './task.errors.js';
import { makeArtifactId, makeBlockerId, makeEvidenceId, makeEventId, makeTaskId, nowIso } from './task.ids.js';

export interface TaskMutationOptions {
    actor?: Actor;
}

export interface TaskCreateInput {
    title: string;
    feature?: string;
    summary?: string | null;
    phase?: LifecyclePhase;
    tags?: string[];
    links?: Partial<TaskLinks>;
    meta?: Record<string, string | number | boolean | null>;
    actor?: Actor;
}

export interface TaskUpdatePatch {
    title?: string;
    summary?: string;
    tags?: string[];
    links?: Partial<TaskLinks>;
    meta?: Record<string, string | number | boolean | null>;
}

export interface TaskListFilter {
    feature?: string;
    status?: TaskStatus;
    phase?: LifecyclePhase;
    limit?: number;
}

export interface TaskEventsFilter {
    type?: TaskEventType;
    limit?: number;
}

export type TaskRef = string | { feature: string } | { taskId: string };

const TERMINAL_STATUSES: ReadonlySet<TaskStatus> = new Set<TaskStatus>(['completed', 'abandoned']);

function isTerminal(task: Task): boolean {
    return TERMINAL_STATUSES.has(task.status);
}

function validateTitle(title: string): void {
    const trimmed = title.trim();
    if (!trimmed) {
        throw new TaskValidationError('Task title must be a non-empty string.');
    }
    if (trimmed.length > 300) {
        throw new TaskValidationError('Task title must be at most 300 characters.');
    }
}

function validatePercent(percent: number | null | undefined): number | null {
    if (percent === null || percent === undefined) {
        return null;
    }
    if (typeof percent !== 'number' || Number.isNaN(percent)) {
        throw new TaskValidationError('progress.percent must be a number.');
    }
    if (percent < 0 || percent > 100) {
        throw new TaskValidationError('progress.percent must be between 0 and 100 (inclusive).');
    }
    return percent;
}

function validateStatus(status: string): asserts status is TaskStatus {
    const valid: TaskStatus[] = ['open', 'active', 'blocked', 'completed', 'abandoned'];
    if (!valid.includes(status as TaskStatus)) {
        throw new TaskValidationError(
            `Invalid status "${status}". Expected one of: ${valid.join(', ')}`
        );
    }
}

function validateFeature(feature: string | null | undefined): string | null {
    if (feature === null || feature === undefined || feature === '') {
        return null;
    }
    const trimmed = feature.trim();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(trimmed)) {
        throw new TaskValidationError(
            `Invalid feature key "${trimmed}". Use kebab-case (lowercase letters, digits, hyphens).`
        );
    }
    return trimmed;
}

/**
 * TaskService — the public task API. Consumed by the CLI, skills, and other
 * packages. All methods are async; they delegate persistence to `TaskRepository`
 * and never touch the database directly.
 *
 * Public methods:
 *   create, get, resolveTask, list, update, setPhase, setStatus, setProgress,
 *   setNextStep, addBlocker, resolveBlocker, addEvidence, addArtifact,
 *   setAttribution, addNote, close, addEvent, getEvents.
 */
export class TaskService {
    constructor(private readonly repository: TaskRepository) {}

    async create(input: TaskCreateInput): Promise<Task> {
        validateTitle(input.title);
        const feature = validateFeature(input.feature ?? null);

        const now = nowIso();
        const actor = input.actor ?? null;
        const taskId = makeTaskId();

        const task: Task = {
            taskId,
            title: input.title.trim(),
            summary: input.summary?.trim() || null,
            feature,
            status: 'open',
            phase: input.phase ?? null,
            phaseEnteredAt: input.phase ? now : null,
            progress: { text: null, percent: null },
            nextStep: null,
            blockers: [],
            evidence: [],
            artifacts: [],
            attribution: actor,
            links: {
                branch: input.links?.branch,
                worktree: input.links?.worktree,
                pr: input.links?.pr,
                commits: input.links?.commits,
            },
            tags: input.tags ? [...input.tags] : [],
            meta: input.meta ? { ...input.meta } : {},
            createdAt: now,
            updatedAt: now,
            createdBy: actor,
            eventCount: 0,
            lastEventAt: null,
        };

        await this.repository.writeTask(task);

        await this.appendEventInternal(task.taskId, 'task.created', {
            title: task.title,
            feature: task.feature,
            summary: task.summary,
            status: task.status,
            phase: task.phase,
        }, actor);

        return this.refreshCachedCounters(task);
    }

    async get(taskId: string): Promise<Task> {
        return this.requireTask(taskId);
    }

    /**
     * Resolve a task reference. Order:
     *   1. full taskId
     *   2. unique taskId prefix (error if ambiguous)
     *   3. feature key -> latest non-terminal task with that feature
     * Returns null if nothing matches.
     */
    async resolveTask(ref: TaskRef): Promise<Task | null> {
        if (typeof ref === 'object') {
            if ('taskId' in ref) {
                return this.repository.readTask(ref.taskId);
            }
            return this.latestNonTerminalByFeature(ref.feature);
        }

        const direct = await this.repository.readTask(ref);
        if (direct) {
            return direct;
        }

        const ids = await this.repository.listTaskIds();
        const prefixed = ids.filter((id) => id.startsWith(ref));
        if (prefixed.length === 1) {
            const match = await this.repository.readTask(prefixed[0]!);
            return match;
        }
        if (prefixed.length > 1) {
            throw new AmbiguousTaskRefError(ref, prefixed);
        }

        return this.latestNonTerminalByFeature(ref);
    }

    async list(filter: TaskListFilter = {}): Promise<Task[]> {
        const ids = await this.repository.listTaskIds();
        const tasks: Task[] = [];
        for (const id of ids) {
            const task = await this.repository.readTask(id);
            if (!task) {
                continue;
            }
            if (filter.feature && task.feature !== filter.feature) {
                continue;
            }
            if (filter.status && task.status !== filter.status) {
                continue;
            }
            if (filter.phase && task.phase !== filter.phase) {
                continue;
            }
            tasks.push(task);
        }
        // Newest first: primary sort by createdAt (descending), tie-break by taskId so
        // same-second creations remain deterministic.
        tasks.sort((a, b) => {
            const byCreated = b.createdAt.localeCompare(a.createdAt);
            if (byCreated !== 0) {
                return byCreated;
            }
            return b.taskId.localeCompare(a.taskId);
        });
        if (filter.limit !== undefined && filter.limit >= 0) {
            return tasks.slice(0, filter.limit);
        }
        return tasks;
    }

    async update(taskId: string, patch: TaskUpdatePatch, opts?: TaskMutationOptions): Promise<Task> {
        const task = await this.requireTask(taskId);
        const fields: string[] = [];
        if (patch.title !== undefined) {
            validateTitle(patch.title);
            task.title = patch.title.trim();
            fields.push('title');
        }
        if (patch.summary !== undefined) {
            task.summary = patch.summary.trim() || null;
            fields.push('summary');
        }
        if (patch.tags !== undefined) {
            task.tags = [...patch.tags];
            fields.push('tags');
        }
        if (patch.links !== undefined) {
            task.links = mergeLinks(task.links, patch.links);
            fields.push('links');
        }
        if (patch.meta !== undefined) {
            task.meta = { ...patch.meta };
            fields.push('meta');
        }
        if (fields.length === 0) {
            return task;
        }
        return this.persistAndRecord(task, 'task.updated', { patch, fields }, opts);
    }

    async setPhase(taskId: string, phase: LifecyclePhase, opts?: TaskMutationOptions): Promise<Task> {
        const task = await this.requireTask(taskId);
        const previous = task.phase;
        const normalized = phase === '' ? null : phase;
        if (previous === normalized && task.phaseEnteredAt !== null) {
            return task;
        }
        task.phase = normalized;
        task.phaseEnteredAt = normalized === null ? null : nowIso();
        return this.persistAndRecord(task, 'task.phase.set', { phase: normalized, previous }, opts);
    }

    async setStatus(taskId: string, status: TaskStatus, opts?: TaskMutationOptions): Promise<Task> {
        validateStatus(status);
        const task = await this.requireTask(taskId);
        const previous = task.status;
        if (previous === status) {
            return task;
        }
        task.status = status;
        return this.persistAndRecord(task, 'task.status.set', { status, previous }, opts);
    }

    async setProgress(
        taskId: string,
        progress: { text?: string | null; percent?: number | null },
        opts?: TaskMutationOptions
    ): Promise<Task> {
        const task = await this.requireTask(taskId);
        const next: TaskProgress = {
            text: progress.text === undefined ? task.progress.text : progress.text,
            percent:
                progress.percent === undefined
                    ? task.progress.percent
                    : validatePercent(progress.percent),
        };
        task.progress = next;
        return this.persistAndRecord(
            task,
            'task.progress.set',
            { text: next.text, percent: next.percent },
            opts
        );
    }

    async setNextStep(taskId: string, step: string | null, opts?: TaskMutationOptions): Promise<Task> {
        const task = await this.requireTask(taskId);
        const normalized = step === null || step.trim() === '' ? null : step.trim();
        if (task.nextStep === normalized) {
            return task;
        }
        task.nextStep = normalized;
        return this.persistAndRecord(task, 'task.next_step.set', { step: normalized }, opts);
    }

    async addBlocker(
        taskId: string,
        input: { text: string },
        opts?: TaskMutationOptions
    ): Promise<{ task: Task; blockerId: string }> {
        const text = input.text?.trim();
        if (!text) {
            throw new TaskValidationError('Blocker text must be a non-empty string.');
        }
        const task = await this.requireTask(taskId);
        const blockerId = makeBlockerId();
        const blocker: TaskBlocker = {
            blockerId,
            text,
            status: 'open',
            raisedAt: nowIso(),
            resolvedAt: null,
            raisedBy: opts?.actor ?? null,
        };
        task.blockers = [...task.blockers, blocker];
        const updated = await this.persistAndRecord(
            task,
            'task.blocker.add',
            { blockerId, text },
            opts
        );
        return { task: updated, blockerId };
    }

    async resolveBlocker(taskId: string, blockerId: string, opts?: TaskMutationOptions): Promise<Task> {
        const task = await this.requireTask(taskId);
        const blocker = task.blockers.find((b) => b.blockerId === blockerId);
        if (!blocker) {
            throw new TaskResourceNotFoundError(taskId, 'Blocker', blockerId);
        }
        if (blocker.status === 'resolved') {
            return task;
        }
        blocker.status = 'resolved';
        blocker.resolvedAt = nowIso();
        task.blockers = [...task.blockers];
        return this.persistAndRecord(task, 'task.blocker.resolve', { blockerId }, opts);
    }

    async addEvidence(
        taskId: string,
        input: {
            command?: string | null;
            exitCode?: number | null;
            passed: boolean;
            summary?: string | null;
            artifacts?: string[];
        },
        opts?: TaskMutationOptions
    ): Promise<{ task: Task; evidenceId: string }> {
        if (typeof input.passed !== 'boolean') {
            throw new TaskValidationError('Evidence `passed` must be a boolean.');
        }
        const task = await this.requireTask(taskId);
        const evidenceId = makeEvidenceId();
        const evidence: TaskEvidence = {
            evidenceId,
            command: input.command ?? null,
            exitCode: input.exitCode ?? null,
            passed: input.passed,
            summary: input.summary ?? null,
            artifacts: input.artifacts ? [...input.artifacts] : [],
            recordedAt: nowIso(),
            actor: opts?.actor ?? null,
        };
        task.evidence = [...task.evidence, evidence];
        const updated = await this.persistAndRecord(task, 'task.evidence.add', {
            evidenceId,
            command: evidence.command,
            exitCode: evidence.exitCode,
            passed: evidence.passed,
            summary: evidence.summary,
            artifacts: evidence.artifacts,
        }, opts);
        return { task: updated, evidenceId };
    }

    async addArtifact(
        taskId: string,
        input: { path: string; kind?: string | null; description?: string | null },
        opts?: TaskMutationOptions
    ): Promise<{ task: Task; artifactId: string }> {
        const artifactPath = input.path?.trim();
        if (!artifactPath) {
            throw new TaskValidationError('Artifact path must be a non-empty string.');
        }
        const task = await this.requireTask(taskId);
        const artifactId = makeArtifactId();
        const artifact: TaskArtifact = {
            artifactId,
            path: artifactPath,
            kind: input.kind ?? null,
            description: input.description ?? null,
            addedAt: nowIso(),
        };
        task.artifacts = [...task.artifacts, artifact];
        const updated = await this.persistAndRecord(
            task,
            'task.artifact.add',
            {
                artifactId,
                path: artifact.path,
                kind: artifact.kind,
                description: artifact.description,
            },
            opts
        );
        return { task: updated, artifactId };
    }

    async setAttribution(taskId: string, actor: Actor, opts?: TaskMutationOptions): Promise<Task> {
        const task = await this.requireTask(taskId);
        task.attribution = actor;
        const payload = {
            agentId: actor.agentId,
            agentType: actor.agentType,
            pid: actor.pid,
            sessionId: actor.sessionId,
        };
        return this.persistAndRecord(task, 'task.attribution.set', payload, opts);
    }

    async addNote(taskId: string, text: string, opts?: TaskMutationOptions): Promise<Task> {
        const trimmed = text?.trim();
        if (!trimmed) {
            throw new TaskValidationError('Note text must be a non-empty string.');
        }
        const task = await this.requireTask(taskId);
        // Event-only: no snapshot mutation beyond cached counters.
        const actor = opts?.actor ?? null;
        await this.appendEventInternal(task.taskId, 'task.note.append', { text: trimmed }, actor);
        return this.refreshCachedCounters(task);
    }

    async close(
        taskId: string,
        status: 'completed' | 'abandoned',
        opts?: TaskMutationOptions
    ): Promise<Task> {
        const task = await this.requireTask(taskId);
        if (isTerminal(task)) {
            return task;
        }
        task.status = status;
        return this.persistAndRecord(task, 'task.closed', { status }, opts);
    }

    /**
     * Low-level event append. For a known stateful `type` it applies the matching
     * snapshot mutation then appends; for non-mutating types it appends only.
     * Used internally by the typed setters; exposed for the tracing worker's
     * `task.custom` observability needs and for callers that know the contract.
     */
    async addEvent(
        taskId: string,
        type: string,
        payload: Record<string, unknown>,
        opts?: TaskMutationOptions
    ): Promise<TaskEvent> {
        if (!isTaskEventType(type)) {
            throw new UnknownEventTypeError(type);
        }
        const task = await this.requireTask(taskId);
        const actor = opts?.actor ?? null;

        const mutated = this.applyEventToSnapshot(task, type, payload, actor);
        if (mutated) {
            await this.repository.writeTask(task);
        }
        const event = await this.appendEventInternal(taskId, type, payload, actor);
        await this.refreshCachedCounters(task);
        return event;
    }

    async getEvents(taskId: string, filter: TaskEventsFilter = {}): Promise<TaskEvent[]> {
        await this.requireTask(taskId);
        let events = await this.repository.readEvents(taskId);
        if (filter.type) {
            events = events.filter((e) => e.type === filter.type);
        }
        if (filter.limit !== undefined && filter.limit >= 0) {
            events = events.slice(0, filter.limit);
        }
        return events;
    }

    private async requireTask(taskId: string): Promise<Task> {
        const task = await this.repository.readTask(taskId);
        if (!task) {
            throw new TaskNotFoundError(taskId);
        }
        return task;
    }

    private async latestNonTerminalByFeature(feature: string): Promise<Task | null> {
        const tasks = await this.list({ feature });
        return tasks.find((t) => !isTerminal(t)) ?? null;
    }

    /**
     * Persist the mutated task snapshot and append a stateful event.
     * Refreshes cached counters (eventCount/lastEventAt) from the event stream.
     */
    private async persistAndRecord(
        task: Task,
        type: TaskEventType,
        payload: Record<string, unknown>,
        opts?: TaskMutationOptions
    ): Promise<Task> {
        const actor = opts?.actor ?? null;
        task.updatedAt = nowIso();
        await this.repository.writeTask(task);
        await this.appendEventInternal(task.taskId, type, payload, actor);
        return this.refreshCachedCounters(task);
    }

    private async appendEventInternal(
        taskId: string,
        type: TaskEventType,
        payload: Record<string, unknown>,
        actor: Actor | null
    ): Promise<TaskEvent> {
        const event: TaskEvent = {
            eventId: makeEventId(),
            taskId,
            ts: nowIso(),
            type,
            actor,
            payload,
        };
        await this.repository.appendEvent(event);
        return event;
    }

    /**
     * Re-read events to refresh cached counters. Cheaper than a full replay for MVP
     * (counts/last-timestamp only); a future event-sourced rebuild is documented.
     */
    private async refreshCachedCounters(task: Task): Promise<Task> {
        const events = await this.repository.readEvents(task.taskId);
        task.eventCount = events.length;
        task.lastEventAt = events.length > 0 ? events[events.length - 1]!.ts : null;
        await this.repository.writeTask(task);
        return task;
    }

    /**
     * Apply a typed event's payload to the in-memory snapshot. Returns whether the
     * snapshot was mutated. Used by the low-level `addEvent` escape hatch.
     */
    private applyEventToSnapshot(
        task: Task,
        type: TaskEventType,
        payload: Record<string, unknown>,
        actor: Actor | null
    ): boolean {
        switch (type) {
            case 'task.created':
                // Already handled at create time; no-op if received via addEvent.
                return false;
            case 'task.updated': {
                const patch = (payload.patch as TaskUpdatePatch) ?? {};
                if (patch.title !== undefined) {
                    task.title = patch.title;
                }
                if (patch.summary !== undefined) {
                    task.summary = patch.summary;
                }
                if (patch.tags !== undefined) {
                    task.tags = [...patch.tags];
                }
                if (patch.links !== undefined) {
                    task.links = mergeLinks(task.links, patch.links);
                }
                if (patch.meta !== undefined) {
                    task.meta = { ...patch.meta };
                }
                return true;
            }
            case 'task.phase.set': {
                const phase = (payload.phase as LifecyclePhase) ?? null;
                task.phase = phase;
                task.phaseEnteredAt = phase === null ? null : nowIso();
                return true;
            }
            case 'task.status.set': {
                task.status = payload.status as TaskStatus;
                return true;
            }
            case 'task.progress.set': {
                task.progress = {
                    text: (payload.text as string | null | undefined) ?? null,
                    percent: (payload.percent as number | null | undefined) ?? null,
                };
                return true;
            }
            case 'task.next_step.set': {
                task.nextStep = (payload.step as string | null) ?? null;
                return true;
            }
            case 'task.blocker.add': {
                task.blockers = [
                    ...task.blockers,
                    {
                        blockerId: payload.blockerId as string,
                        text: payload.text as string,
                        status: 'open',
                        raisedAt: nowIso(),
                        resolvedAt: null,
                        raisedBy: actor,
                    },
                ];
                return true;
            }
            case 'task.blocker.resolve': {
                const id = payload.blockerId as string;
                task.blockers = task.blockers.map((b) =>
                    b.blockerId === id ? { ...b, status: 'resolved', resolvedAt: nowIso() } : b
                );
                return true;
            }
            case 'task.evidence.add': {
                task.evidence = [
                    ...task.evidence,
                    {
                        evidenceId: payload.evidenceId as string,
                        command: (payload.command as string | null | undefined) ?? null,
                        exitCode: (payload.exitCode as number | null | undefined) ?? null,
                        passed: Boolean(payload.passed),
                        summary: (payload.summary as string | null | undefined) ?? null,
                        artifacts: (payload.artifacts as string[] | undefined) ?? [],
                        recordedAt: nowIso(),
                        actor,
                    },
                ];
                return true;
            }
            case 'task.artifact.add': {
                task.artifacts = [
                    ...task.artifacts,
                    {
                        artifactId: payload.artifactId as string,
                        path: payload.path as string,
                        kind: (payload.kind as string | null | undefined) ?? null,
                        description: (payload.description as string | null | undefined) ?? null,
                        addedAt: nowIso(),
                    },
                ];
                return true;
            }
            case 'task.attribution.set': {
                task.attribution = {
                    agentId: payload.agentId as string | undefined,
                    agentType: payload.agentType as string | undefined,
                    pid: payload.pid as number | undefined,
                    sessionId: payload.sessionId as string | undefined,
                };
                return true;
            }
            case 'task.closed': {
                task.status = payload.status as TaskStatus;
                return true;
            }
            case 'task.note.append':
            case 'task.custom':
                return false;
            default:
                return false;
        }
    }
}

function mergeLinks(base: TaskLinks, patch: Partial<TaskLinks>): TaskLinks {
    const merged: TaskLinks = { ...base };
    if (patch.branch !== undefined) merged.branch = patch.branch;
    if (patch.worktree !== undefined) merged.worktree = patch.worktree;
    if (patch.pr !== undefined) merged.pr = patch.pr;
    if (patch.commits !== undefined) merged.commits = [...patch.commits];
    return merged;
}

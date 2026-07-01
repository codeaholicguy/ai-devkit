/**
 * In-memory implementation of `ITaskService`.
 *
 * This is a TEST DOUBLE for unit-testing the tracing mapping against the exact
 * locked semantics. It is NOT shipped task storage — the real
 * `@ai-devkit/task-manager` owns storage. When that ships, the real `TaskService`
 * is injected instead and this file is used only by tests.
 *
 * Conformance:
 * - ID format: `<prefix><YYYYMMDDHHMMSS>-<4 base36>`, collision-safe via suffix regen.
 * - Resolution order: full taskId → unique prefix → feature→latest non-terminal.
 * - Stateful event types mutate the snapshot AND append; note/custom append only.
 * - eventCount/lastEventAt cached derivations.
 * - Actor auto-resolution: omitted → null (valid per contract; real service fills
 *   from flags/env/registry).
 */

import type {
    Actor,
    AddArtifactInput,
    AddBlockerInput,
    AddEvidenceInput,
    CreateTaskInput,
    EventFilter,
    ITaskService,
    ListFilter,
    MutatorOptions,
    ProgressInput,
    Task,
    TaskEvent,
    TaskEventType,
    TaskRef,
    TaskStatus,
    UpdateTaskInput,
} from './contract.js';
import { AmbiguousTaskPrefixError, TaskNotFoundError } from './contract.js';

const TERMINAL_STATUSES: ReadonlySet<TaskStatus> = new Set(['completed', 'abandoned']);

function base36(n: number): string {
    return n.toString(36);
}

function randomSuffix(len = 4): string {
    let s = '';
    for (let i = 0; i < len; i += 1) {
        s += base36(Math.floor(Math.random() * 36));
    }
    return s.padStart(len, '0');
}

function timestampStamp(d = new Date()): string {
    const pad = (x: number, n = 2) => String(x).padStart(n, '0');
    return (
        `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
        `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`
    );
}

function isoNow(): string {
    return new Date().toISOString();
}

export class InMemoryTaskService implements ITaskService {
    private readonly tasks = new Map<string, Task>();
    private readonly events = new Map<string, TaskEvent[]>();
    /** monotonic counter to keep IDs unique even within the same second */
    private seq = 0;

    private nextId(prefix: string): string {
        this.seq += 1;
        const stamp = timestampStamp();
        // incorporate sequence + randomness for collision safety
        const suffix = `${base36(this.seq % 36)}${randomSuffix(3)}`;
        const id = `${prefix}${stamp}-${suffix}`;
        return id;
    }

    private newEvent(
        taskId: string,
        type: TaskEventType,
        payload: Record<string, unknown>,
        actor?: Actor,
    ): TaskEvent {
        const evt: TaskEvent = {
            eventId: this.nextId('evt-'),
            taskId,
            ts: isoNow(),
            type,
            actor: actor ?? null,
            payload,
        };
        const list = this.events.get(taskId) ?? [];
        list.push(evt);
        this.events.set(taskId, list);
        return evt;
    }

    private touch(task: Task, at = isoNow()): void {
        task.updatedAt = at;
        task.eventCount = this.events.get(task.taskId)?.length ?? 0;
        task.lastEventAt = at;
    }

    private resolve(id: string): Task {
        const task = this.tasks.get(id);
        if (!task) throw new TaskNotFoundError(id);
        return task;
    }

    // -- create / read ----------------------------------------------------

    async create(input: CreateTaskInput): Promise<Task> {
        const now = isoNow();
        const taskId = this.nextId('task-');
        const task: Task = {
            taskId,
            title: input.title,
            summary: input.summary ?? null,
            feature: input.feature ?? null,
            status: 'open',
            phase: input.phase ?? null,
            phaseEnteredAt: input.phase ? now : null,
            progress: { text: null, percent: null },
            nextStep: null,
            blockers: [],
            evidence: [],
            artifacts: [],
            attribution: input.actor ?? null,
            links: input.links ?? {},
            tags: input.tags ? [...input.tags] : [],
            meta: input.meta ? { ...input.meta } : {},
            createdAt: now,
            updatedAt: now,
            createdBy: input.actor ?? null,
            eventCount: 0,
            lastEventAt: null,
        };
        this.tasks.set(taskId, task);
        this.events.set(taskId, []);
        this.newEvent(
            taskId,
            'task.created',
            {
                title: input.title,
                feature: input.feature,
                summary: input.summary,
                status: 'open',
                phase: input.phase,
            },
            input.actor,
        );
        this.touch(task, now);
        return structuredClone(task);
    }

    async get(taskId: string): Promise<Task> {
        return structuredClone(this.resolve(taskId));
    }

    async resolveTask(ref: string | TaskRef | { taskId: string }): Promise<Task | null> {
        // Normalize: a bare string is a taskId (full or prefix).
        if (typeof ref === 'string') {
            // (1) full match
            if (this.tasks.has(ref)) return structuredClone(this.tasks.get(ref)!);
            // (2) unique prefix
            const prefixMatches: string[] = [];
            for (const id of this.tasks.keys()) {
                if (id.startsWith(ref)) prefixMatches.push(id);
            }
            if (prefixMatches.length === 1) {
                return structuredClone(this.tasks.get(prefixMatches[0]!)!);
            }
            if (prefixMatches.length > 1) {
                throw new AmbiguousTaskPrefixError(ref, prefixMatches);
            }
            // (3) treat as feature key -> latest non-terminal
            return this.latestNonTerminalByFeature(ref);
        }
        if ('feature' in ref && typeof ref.feature === 'string') {
            return this.latestNonTerminalByFeature(ref.feature);
        }
        if ('taskId' in ref && typeof ref.taskId === 'string') {
            return this.resolveTask(ref.taskId);
        }
        return null;
    }

    private latestNonTerminalByFeature(feature: string): Task | null {
        // Map preserves insertion order; the last matching non-terminal task is
        // the most recently created. This is robust against same-millisecond ties.
        let best: Task | null = null;
        for (const task of this.tasks.values()) {
            if (task.feature !== feature) continue;
            if (TERMINAL_STATUSES.has(task.status)) continue;
            best = task;
        }
        return best ? structuredClone(best) : null;
    }

    async list(filter?: ListFilter): Promise<Task[]> {
        let items = [...this.tasks.values()];
        if (filter?.feature) items = items.filter((t) => t.feature === filter.feature);
        if (filter?.status) items = items.filter((t) => t.status === filter.status);
        if (filter?.phase) items = items.filter((t) => t.phase === filter.phase);
        items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
        if (filter?.limit !== undefined) items = items.slice(0, filter.limit);
        return items.map((t) => structuredClone(t));
    }

    // -- update -----------------------------------------------------------

    async update(taskId: string, patch: UpdateTaskInput, opts?: MutatorOptions): Promise<Task> {
        const task = this.resolve(taskId);
        const fields: string[] = [];
        if (patch.title !== undefined) {
            task.title = patch.title;
            fields.push('title');
        }
        if (patch.summary !== undefined) {
            task.summary = patch.summary;
            fields.push('summary');
        }
        if (patch.tags !== undefined) {
            task.tags = [...patch.tags];
            fields.push('tags');
        }
        if (patch.links !== undefined) {
            task.links = { ...task.links, ...patch.links };
            fields.push('links');
        }
        if (patch.meta !== undefined) {
            task.meta = { ...task.meta, ...patch.meta };
            fields.push('meta');
        }
        this.newEvent(
            taskId,
            'task.updated',
            { patch: this.stripUndefined(patch), fields },
            opts?.actor,
        );
        this.touch(task);
        return structuredClone(task);
    }

    async setPhase(taskId: string, phase: string | null, opts?: MutatorOptions): Promise<Task> {
        const task = this.resolve(taskId);
        const previous = task.phase;
        task.phase = phase;
        task.phaseEnteredAt = phase === null ? null : isoNow();
        this.newEvent(taskId, 'task.phase.set', { phase, previous: previous ?? undefined }, opts?.actor);
        this.touch(task);
        return structuredClone(task);
    }

    async setStatus(taskId: string, status: TaskStatus, opts?: MutatorOptions): Promise<Task> {
        const task = this.resolve(taskId);
        const previous = task.status;
        task.status = status;
        this.newEvent(taskId, 'task.status.set', { status, previous }, opts?.actor);
        this.touch(task);
        return structuredClone(task);
    }

    async setProgress(taskId: string, progress: ProgressInput, opts?: MutatorOptions): Promise<Task> {
        const task = this.resolve(taskId);
        if (progress.text !== undefined) task.progress.text = progress.text ?? null;
        if (progress.percent !== undefined) task.progress.percent = progress.percent ?? null;
        this.newEvent(
            taskId,
            'task.progress.set',
            { text: task.progress.text ?? undefined, percent: task.progress.percent ?? undefined },
            opts?.actor,
        );
        this.touch(task);
        return structuredClone(task);
    }

    async setNextStep(taskId: string, step: string | null, opts?: MutatorOptions): Promise<Task> {
        const task = this.resolve(taskId);
        task.nextStep = step;
        this.newEvent(taskId, 'task.next_step.set', { step }, opts?.actor);
        this.touch(task);
        return structuredClone(task);
    }

    // -- blockers / evidence / artifacts ---------------------------------

    async addBlocker(
        taskId: string,
        input: AddBlockerInput,
        opts?: MutatorOptions,
    ): Promise<{ task: Task; blockerId: string }> {
        const task = this.resolve(taskId);
        const blockerId = this.nextId('blk-');
        const now = isoNow();
        task.blockers = [
            ...task.blockers,
            {
                blockerId,
                text: input.text,
                status: 'open',
                raisedAt: now,
                resolvedAt: null,
                raisedBy: opts?.actor ?? null,
            },
        ];
        this.newEvent(taskId, 'task.blocker.add', { blockerId, text: input.text }, opts?.actor);
        this.touch(task);
        return { task: structuredClone(task), blockerId };
    }

    async resolveBlocker(taskId: string, blockerId: string, opts?: MutatorOptions): Promise<Task> {
        const task = this.resolve(taskId);
        let found = false;
        task.blockers = task.blockers.map((b) => {
            if (b.blockerId === blockerId && b.status === 'open') {
                found = true;
                return { ...b, status: 'resolved', resolvedAt: isoNow() };
            }
            return b;
        });
        if (!found) {
            throw new Error(`Blocker not found or already resolved: ${blockerId}`);
        }
        this.newEvent(taskId, 'task.blocker.resolve', { blockerId }, opts?.actor);
        this.touch(task);
        return structuredClone(task);
    }

    async addEvidence(
        taskId: string,
        input: AddEvidenceInput,
        opts?: MutatorOptions,
    ): Promise<{ task: Task; evidenceId: string }> {
        const task = this.resolve(taskId);
        const evidenceId = this.nextId('evd-');
        const now = isoNow();
        task.evidence = [
            ...task.evidence,
            {
                evidenceId,
                command: input.command ?? null,
                exitCode: input.exitCode ?? null,
                passed: input.passed,
                summary: input.summary ?? null,
                artifacts: input.artifacts ? [...input.artifacts] : [],
                recordedAt: now,
                actor: opts?.actor ?? null,
            },
        ];
        this.newEvent(
            taskId,
            'task.evidence.add',
            {
                evidenceId,
                command: input.command ?? undefined,
                exitCode: input.exitCode ?? undefined,
                passed: input.passed,
                summary: input.summary ?? undefined,
                artifacts: input.artifacts,
            },
            opts?.actor,
        );
        this.touch(task);
        return { task: structuredClone(task), evidenceId };
    }

    async addArtifact(
        taskId: string,
        input: AddArtifactInput,
        opts?: MutatorOptions,
    ): Promise<{ task: Task; artifactId: string }> {
        const task = this.resolve(taskId);
        const artifactId = this.nextId('art-');
        const now = isoNow();
        task.artifacts = [
            ...task.artifacts,
            {
                artifactId,
                path: input.path,
                kind: input.kind ?? null,
                description: input.description ?? null,
                addedAt: now,
            },
        ];
        this.newEvent(
            taskId,
            'task.artifact.add',
            {
                artifactId,
                path: input.path,
                kind: input.kind ?? undefined,
                description: input.description ?? undefined,
            },
            opts?.actor,
        );
        this.touch(task);
        return { task: structuredClone(task), artifactId };
    }

    async setAttribution(taskId: string, actor: Actor, opts?: MutatorOptions): Promise<Task> {
        const task = this.resolve(taskId);
        task.attribution = actor;
        this.newEvent(
            taskId,
            'task.attribution.set',
            {
                agentId: actor.agentId,
                agentType: actor.agentType,
                pid: actor.pid,
                sessionId: actor.sessionId,
            },
            opts?.actor,
        );
        this.touch(task);
        return structuredClone(task);
    }

    async addNote(taskId: string, text: string, opts?: MutatorOptions): Promise<Task> {
        const task = this.resolve(taskId);
        // event-only, no snapshot mutation
        this.newEvent(taskId, 'task.note.append', { text }, opts?.actor);
        this.touch(task);
        return structuredClone(task);
    }

    async close(
        taskId: string,
        status: 'completed' | 'abandoned',
        opts?: MutatorOptions,
    ): Promise<Task> {
        const task = this.resolve(taskId);
        task.status = status;
        this.newEvent(taskId, 'task.closed', { status }, opts?.actor);
        this.touch(task);
        return structuredClone(task);
    }

    async addEvent(
        taskId: string,
        type: TaskEventType,
        payload: Record<string, unknown>,
        opts?: MutatorOptions,
    ): Promise<TaskEvent> {
        // Resolve + apply the stateful mutation, then append. For note/custom it
        // is append-only. This routes through the typed mutators so behavior is
        // identical to direct method calls.
        this.resolve(taskId);
        switch (type) {
            case 'task.phase.set': {
                const phase = (payload.phase as string | undefined) ?? null;
                await this.setPhase(taskId, phase, opts);
                break;
            }
            case 'task.status.set':
                await this.setStatus(taskId, payload.status as TaskStatus, opts);
                break;
            case 'task.progress.set':
                await this.setProgress(taskId, { text: payload.text as string | null, percent: payload.percent as number | null }, opts);
                break;
            case 'task.next_step.set':
                await this.setNextStep(taskId, payload.step as string | null, opts);
                break;
            case 'task.blocker.add':
                await this.addBlocker(taskId, { text: payload.text as string }, opts);
                break;
            case 'task.blocker.resolve':
                await this.resolveBlocker(taskId, payload.blockerId as string, opts);
                break;
            case 'task.evidence.add':
                await this.addEvidence(
                    taskId,
                    {
                        command: payload.command as string | undefined,
                        exitCode: payload.exitCode as number | undefined,
                        passed: payload.passed as boolean,
                        summary: payload.summary as string | undefined,
                        artifacts: payload.artifacts as string[] | undefined,
                    },
                    opts,
                );
                break;
            case 'task.artifact.add':
                await this.addArtifact(
                    taskId,
                    {
                        path: payload.path as string,
                        kind: payload.kind as string | null | undefined,
                        description: payload.description as string | null | undefined,
                    },
                    opts,
                );
                break;
            case 'task.attribution.set':
                await this.setAttribution(
                    taskId,
                    {
                        agentId: payload.agentId as string | undefined,
                        agentType: payload.agentType as string | undefined,
                        pid: payload.pid as number | undefined,
                        sessionId: payload.sessionId as string | undefined,
                    },
                    opts,
                );
                break;
            case 'task.note.append':
                await this.addNote(taskId, payload.text as string, opts);
                break;
            case 'task.created':
            case 'task.updated':
            case 'task.closed':
                // These are owned by their dedicated methods; via addEvent we
                // still append for observability without re-running creation.
                this.newEvent(taskId, type, payload, opts?.actor);
                break;
            case 'task.custom':
                this.newEvent(taskId, type, payload, opts?.actor);
                break;
            default: {
                const _exhaustive: never = type;
                throw new Error(`Unhandled event type: ${String(_exhaustive)}`);
            }
        }
        const list = this.events.get(taskId)!;
        return structuredClone(list[list.length - 1]!);
    }

    async getEvents(taskId: string, filter?: EventFilter): Promise<TaskEvent[]> {
        this.resolve(taskId);
        let items = [...(this.events.get(taskId) ?? [])];
        if (filter?.type) items = items.filter((e) => e.type === filter.type);
        if (filter?.limit !== undefined) items = items.slice(-filter.limit);
        return items.map((e) => structuredClone(e));
    }

    private stripUndefined<T extends object>(obj: T): Partial<T> {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(obj)) {
            if (v !== undefined) out[k] = v;
        }
        return out as Partial<T>;
    }
}

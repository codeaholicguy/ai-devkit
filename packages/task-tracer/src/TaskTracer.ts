/**
 * TaskTracer — the tracing semantic layer.
 *
 * Maps dev-lifecycle / structured-debug progress semantics onto the LOCKED Task
 * contract. Task is the durable unit; tracing = task progress/events. This class
 * owns NO storage and emits NO new event types — each method calls exactly one
 * `ITaskService` mutator.
 *
 * Semantic → contract mapping (centralized here):
 *   ensureFeatureTask  -> resolveTask({feature}) then create(...) on miss
 *   enterPhase         -> setPhase            (task.phase.set)     [phase.enter/exit]
 *   setStatus          -> setStatus           (task.status.set)
 *   updateProgress     -> setProgress         (task.progress.set)  [progress.update]
 *   setNextStep        -> setNextStep         (task.next_step.set)
 *   raiseBlocker       -> addBlocker          (task.blocker.add)   [blocker.add]
 *   resolveBlocker     -> resolveBlocker      (task.blocker.resolve)
 *   recordValidation   -> addEvidence         (task.evidence.add)  [validation.record]
 *   setAttribution     -> setAttribution      (task.attribution.set)[attribution.record]
 *   addNote            -> addNote             (task.note.append)
 *   recordCustom       -> addEvent("task.custom")  [observability escape hatch]
 *   closeTask          -> close               (task.closed)
 *
 * Feature↔Task: ONE task per feature default; `phase` is a single first-class
 * field advanced via setPhase. `actor` is optional and forwarded via opts; when
 * omitted the real TaskService auto-resolves from env/registry (null is valid).
 */

import type {
    Actor,
    AddEvidenceInput,
    CreateTaskInput,
    ITaskService,
    MutatorOptions,
    ProgressInput,
    Task,
    TaskRef,
    TaskStatus,
} from './contract.js';

export interface EnsureFeatureTaskInput {
    feature: string;
    title?: string;
    phase?: string;
    tags?: string[];
    actor?: Actor;
}

export interface EnsureFeatureTaskResult {
    task: Task;
    created: boolean;
}

export interface ValidationInput {
    /** The command that produced the evidence, e.g. "nx test". */
    command?: string | null;
    /** Process exit code. */
    exitCode?: number | null;
    /** Whether the validation passed. Required. */
    passed: boolean;
    /** Inline durable summary text (point at files via artifacts instead). */
    summary?: string | null;
    /** Reference-only artifact paths. */
    artifacts?: string[];
}

export interface CustomObservation {
    /** Custom observation name (arbitrary, must not change task state). */
    name: string;
    /** Arbitrary JSON object; do not assume keys. */
    data?: Record<string, unknown>;
}

export class TaskTracer {
    constructor(private readonly service: ITaskService) {}

    /**
     * Resolve the feature's current task (latest non-terminal) or create it.
     * This is the recommended entry point at the start of a dev-lifecycle run.
     */
    async ensureFeatureTask(input: EnsureFeatureTaskInput): Promise<EnsureFeatureTaskResult> {
        const existing = await this.service.resolveTask({ feature: input.feature } as TaskRef);
        if (existing) return { task: existing, created: false };
        const createInput: CreateTaskInput = {
            title: input.title ?? `Feature: ${input.feature}`,
            feature: input.feature,
            phase: input.phase,
            tags: input.tags,
            actor: input.actor,
        };
        const task = await this.service.create(createInput);
        return { task, created: true };
    }

    /** phase.enter / phase.exit semantics. */
    async enterPhase(
        taskId: string,
        phase: string | null,
        opts?: MutatorOptions,
    ): Promise<Task> {
        return this.service.setPhase(taskId, phase, opts);
    }

    /** Advance task status (e.g. open→active, *→blocked). */
    async setStatus(taskId: string, status: TaskStatus, opts?: MutatorOptions): Promise<Task> {
        return this.service.setStatus(taskId, status, opts);
    }

    /** progress.update semantics. */
    async updateProgress(
        taskId: string,
        progress: ProgressInput,
        opts?: MutatorOptions,
    ): Promise<Task> {
        return this.service.setProgress(taskId, progress, opts);
    }

    /** next_step.set semantics. */
    async setNextStep(taskId: string, step: string | null, opts?: MutatorOptions): Promise<Task> {
        return this.service.setNextStep(taskId, step, opts);
    }

    /** blocker.add semantics. Returns the new blockerId. */
    async raiseBlocker(
        taskId: string,
        text: string,
        opts?: MutatorOptions,
    ): Promise<{ task: Task; blockerId: string }> {
        return this.service.addBlocker(taskId, { text }, opts);
    }

    /** blocker.resolve semantics. */
    async resolveBlocker(
        taskId: string,
        blockerId: string,
        opts?: MutatorOptions,
    ): Promise<Task> {
        return this.service.resolveBlocker(taskId, blockerId, opts);
    }

    /**
     * validation.record semantics — record fresh verification evidence.
     * Driven by the `verify`/`tdd`/`dev-testing` skills after a real run.
     */
    async recordValidation(
        taskId: string,
        validation: ValidationInput,
        opts?: MutatorOptions,
    ): Promise<{ task: Task; evidenceId: string }> {
        const input: AddEvidenceInput = {
            command: validation.command ?? null,
            exitCode: validation.exitCode ?? null,
            passed: validation.passed,
            summary: validation.summary ?? null,
            artifacts: validation.artifacts,
        };
        return this.service.addEvidence(taskId, input, opts);
    }

    /** attribution.record semantics — set the current owner. */
    async setAttribution(taskId: string, actor: Actor, opts?: MutatorOptions): Promise<Task> {
        return this.service.setAttribution(taskId, actor, opts);
    }

    /** note.append semantics (event-only, no snapshot mutation). */
    async addNote(taskId: string, text: string, opts?: MutatorOptions): Promise<Task> {
        return this.service.addNote(taskId, text, opts);
    }

    /**
     * Generic observability escape hatch (task.custom). Event-only — never
     * mutates task state. Use for tracing telemetry that does not map to a
     * stateful semantic.
     */
    async recordCustom(
        taskId: string,
        observation: CustomObservation,
        opts?: MutatorOptions,
    ): Promise<Task> {
        const payload: Record<string, unknown> = { name: observation.name };
        if (observation.data !== undefined) payload.data = observation.data;
        await this.service.addEvent(taskId, 'task.custom', payload, opts);
        return this.service.get(taskId);
    }

    /** task.closed semantics — mark lifecycle end. */
    async closeTask(
        taskId: string,
        status: 'completed' | 'abandoned',
        opts?: MutatorOptions,
    ): Promise<Task> {
        return this.service.close(taskId, status, opts);
    }
}

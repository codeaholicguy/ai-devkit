/**
 * Read surface for orchestrator / parent agents.
 *
 * `readStatus` projects a task snapshot into a routing-friendly digest:
 * current phase, progress, next step, open blockers, last validation (with a
 * staleness flag), updatedAt, and attribution. This is the answer to
 * "where are we right now?" across agents and sessions.
 */

import type { Actor, ITaskService, Task, TaskRef } from './contract.js';

export const DEFAULT_STALE_AFTER_MS = 24 * 60 * 60 * 1000; // 24h

export interface OpenBlockerDigest {
    blockerId: string;
    text: string;
    raisedAt: string;
    raisedBy: Actor | null;
}

export interface LastValidationDigest {
    evidenceId: string;
    command: string | null;
    exitCode: number | null;
    passed: boolean;
    summary: string | null;
    recordedAt: string;
    actor: Actor | null;
    stale: boolean;
}

export interface StatusDigest {
    taskId: string;
    feature: string | null;
    status: Task['status'];
    phase: string | null;
    phaseEnteredAt: string | null;
    progress: Task['progress'];
    nextStep: string | null;
    openBlockers: OpenBlockerDigest[];
    lastValidation: LastValidationDigest | null;
    updatedAt: string;
    attribution: Actor | null;
    eventCount: number;
    lastEventAt: string | null;
}

export interface ReadStatusOptions {
    /** Evidence older than this is flagged stale. Default 24h. */
    staleAfterMs?: number;
}

/**
 * Resolve a task by ref (feature key, taskId, or prefix) and project a digest.
 * Returns null if no task matches.
 */
export async function readStatus(
    service: ITaskService,
    ref: string | TaskRef | { taskId: string },
    options: ReadStatusOptions = {},
): Promise<StatusDigest | null> {
    const task = await service.resolveTask(ref);
    if (!task) return null;
    return digest(task, options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS);
}

export function digest(task: Task, staleAfterMs: number = DEFAULT_STALE_AFTER_MS): StatusDigest {
    const openBlockers: OpenBlockerDigest[] = task.blockers
        .filter((b) => b.status === 'open')
        .map((b) => ({
            blockerId: b.blockerId,
            text: b.text,
            raisedAt: b.raisedAt,
            raisedBy: b.raisedBy,
        }));

    let lastValidation: LastValidationDigest | null = null;
    if (task.evidence.length > 0) {
        // evidence is append-only; latest is last by recordedAt (fall back to order)
        const latest = task.evidence.reduce((acc, e) =>
            e.recordedAt > acc.recordedAt ? e : acc,
        );
        const age = Date.now() - new Date(latest.recordedAt).getTime();
        lastValidation = {
            evidenceId: latest.evidenceId,
            command: latest.command,
            exitCode: latest.exitCode,
            passed: latest.passed,
            summary: latest.summary,
            recordedAt: latest.recordedAt,
            actor: latest.actor,
            // Stale when evidence is at least as old as the threshold. Boundary is
            // inclusive so a threshold of 0 flags any recorded evidence as stale.
            stale: age >= staleAfterMs,
        };
    }

    return {
        taskId: task.taskId,
        feature: task.feature,
        status: task.status,
        phase: task.phase,
        phaseEnteredAt: task.phaseEnteredAt,
        progress: task.progress,
        nextStep: task.nextStep,
        openBlockers,
        lastValidation,
        updatedAt: task.updatedAt,
        attribution: task.attribution,
        eventCount: task.eventCount,
        lastEventAt: task.lastEventAt,
    };
}

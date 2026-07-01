import { describe, expect, it } from 'vitest';
import { TASK_EVENT_TYPES } from '../src/contract.js';

describe('contract event types', () => {
    it('exposes the closed (frozen) set from the locked contract', () => {
        // Must match the locked contract exactly. If this changes, the upstream
        // contract changed and tracing must be re-reviewed.
        expect([...TASK_EVENT_TYPES].sort()).toEqual(
            [
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
            ].sort(),
        );
    });

    it('has no duplicates', () => {
        expect(new Set(TASK_EVENT_TYPES).size).toBe(TASK_EVENT_TYPES.length);
    });
});

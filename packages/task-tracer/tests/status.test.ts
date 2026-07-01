import { describe, expect, it } from 'vitest';
import { InMemoryTaskService } from '../src/in-memory.js';
import { readStatus, digest, DEFAULT_STALE_AFTER_MS } from '../src/status.js';

describe('readStatus / digest', () => {
    it('returns null when no task matches the feature', async () => {
        const svc = new InMemoryTaskService();
        const got = await readStatus(svc, { feature: 'nope' });
        expect(got).toBeNull();
    });

    it('projects phase, progress, nextStep, blockers, attribution', async () => {
        const svc = new InMemoryTaskService();
        const t = await svc.create({ title: 'T', feature: 'auth', phase: 'design' });
        await svc.setStatus(t.taskId, 'active');
        await svc.setProgress(t.taskId, { percent: 30, text: 'design drafting' });
        await svc.setNextStep(t.taskId, 'finish design');
        await svc.addBlocker(t.taskId, { text: 'need input' });
        await svc.setAttribution(t.taskId, { agentId: 'agent-a' });

        const d = await readStatus(svc, { feature: 'auth' });
        expect(d).not.toBeNull();
        expect(d!.phase).toBe('design');
        expect(d!.status).toBe('active');
        expect(d!.progress.percent).toBe(30);
        expect(d!.nextStep).toBe('finish design');
        expect(d!.openBlockers).toHaveLength(1);
        expect(d!.openBlockers[0]!.text).toBe('need input');
        expect(d!.attribution?.agentId).toBe('agent-a');
        expect(d!.lastValidation).toBeNull();
    });

    it('lastValidation uses the most recent evidence and flags staleness', async () => {
        const svc = new InMemoryTaskService();
        const t = await svc.create({ title: 'T', feature: 'auth' });
        await svc.addEvidence(t.taskId, { command: 'nx test', exitCode: 1, passed: false, summary: 'red' });
        // recent evidence -> not stale with default threshold
        let d = digest(await svc.get(t.taskId));
        expect(d.lastValidation).not.toBeNull();
        expect(d.lastValidation!.passed).toBe(false);
        expect(d.lastValidation!.stale).toBe(false);

        // threshold of 0ms -> any evidence is stale
        d = digest(await svc.get(t.taskId), 0);
        expect(d.lastValidation!.stale).toBe(true);
        void DEFAULT_STALE_AFTER_MS;
    });

    it('resolves open blockers only', async () => {
        const svc = new InMemoryTaskService();
        const t = await svc.create({ title: 'T', feature: 'auth' });
        const { blockerId } = await svc.addBlocker(t.taskId, { text: 'one' });
        await svc.addBlocker(t.taskId, { text: 'two' });
        await svc.resolveBlocker(t.taskId, blockerId);
        const d = digest(await svc.get(t.taskId));
        expect(d.openBlockers.map((b) => b.text)).toEqual(['two']);
    });
});

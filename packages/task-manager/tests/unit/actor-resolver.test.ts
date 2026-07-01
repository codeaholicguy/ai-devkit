import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveCurrentActor, ATTRIB_ENV } from '../../src/actor-resolver.js';

describe('resolveCurrentActor', () => {
    const origEnv = { ...process.env };

    beforeEach(() => {
        for (const key of Object.values(ATTRIB_ENV)) {
            delete process.env[key];
        }
    });

    afterEach(() => {
        for (const [key, value] of Object.entries(origEnv)) {
            if (Object.values(ATTRIB_ENV).includes(key as never)) {
                if (value === undefined) {
                    delete process.env[key];
                } else {
                    process.env[key] = value;
                }
            }
        }
    });

    it('resolves pid from process.pid when no env is set', () => {
        const actor = resolveCurrentActor();
        expect(actor).not.toBeNull();
        expect(actor?.pid).toBe(process.pid);
    });

    it('reads agent attribution from environment variables', () => {
        process.env[ATTRIB_ENV.agentId] = 'agent-42';
        process.env[ATTRIB_ENV.agentType] = 'claude';
        process.env[ATTRIB_ENV.sessionId] = 'sess-abc';
        process.env[ATTRIB_ENV.agentPid] = '999';

        const actor = resolveCurrentActor();
        expect(actor).toEqual({
            agentId: 'agent-42',
            agentType: 'claude',
            sessionId: 'sess-abc',
            pid: 999,
        });
    });

    it('ignores a non-numeric AI_DEVKIT_AGENT_PID and falls back to process.pid', () => {
        process.env[ATTRIB_ENV.agentPid] = 'not-a-number';
        const actor = resolveCurrentActor();
        expect(actor?.pid).toBe(process.pid);
    });

    it('explicit override takes precedence over environment', () => {
        process.env[ATTRIB_ENV.agentId] = 'env-agent';
        const actor = resolveCurrentActor({ agentId: 'override-agent', agentType: 'pi' });
        expect(actor?.agentId).toBe('override-agent');
        expect(actor?.agentType).toBe('pi');
    });

    it('returns a pid-only actor when no agent context resolves', () => {
        const actor = resolveCurrentActor();
        expect(actor).not.toBeNull();
        expect(Object.keys(actor!)).toEqual(['pid']);
    });
});

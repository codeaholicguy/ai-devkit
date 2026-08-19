import { describe, expect, it } from 'vitest';

describe('durable-agent public domain', () => {
    it('exports a classified busy error without exposing prompt data', async () => {
        const api = await import('../../index.js') as Record<string, unknown>;

        expect(api).toHaveProperty('DurableAgentBusyError');
        const ErrorType = api.DurableAgentBusyError as new (agentId: string, name: string) => Error & {
            code: string;
            agentId: string;
        };
        const error = new ErrorType('agent-id', 'reviewer');

        expect(error).toMatchObject({
            name: 'DurableAgentBusyError',
            code: 'DURABLE_AGENT_BUSY',
            agentId: 'agent-id',
            message: 'Durable agent "reviewer" is busy.',
        });
    });
});

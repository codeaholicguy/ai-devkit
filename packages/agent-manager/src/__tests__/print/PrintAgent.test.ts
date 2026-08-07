import { describe, expect, it } from 'vitest';

describe('print-agent public domain', () => {
    it('exports a classified busy error without exposing prompt data', async () => {
        const api = await import('../../index.js') as Record<string, unknown>;

        expect(api).toHaveProperty('PrintAgentBusyError');
        const ErrorType = api.PrintAgentBusyError as new (agentId: string, name: string) => Error & {
            code: string;
            agentId: string;
        };
        const error = new ErrorType('agent-id', 'reviewer');

        expect(error).toMatchObject({
            name: 'PrintAgentBusyError',
            code: 'PRINT_AGENT_BUSY',
            agentId: 'agent-id',
            message: 'Print agent "reviewer" is busy.',
        });
    });
});

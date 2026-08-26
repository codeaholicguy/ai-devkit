import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    ClaudePrintAgentService,
    DurableAgentRepository,
    type ProcessInspector,
} from '../../index.js';

const roots: string[] = [];

afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('Claude durable-agent fake-provider journey', () => {
    it('creates without invocation, then starts and resumes the same session through stdin', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'durable-agent-integration-'));
        roots.push(root);
        const cwd = path.join(root, 'project');
        fs.mkdirSync(cwd);
        const processInspector: ProcessInspector = {
            getIdentity: (pid) => ({ pid, startedAt: `process-${pid}` }),
        };
        const repository = new DurableAgentRepository({
            dbPath: path.join(root, 'state', 'agents.db'),
            processInspector,
        });
        const runner = {
            run: vi.fn().mockImplementation(async (request) => {
                await request.onSpawn({ pid: 42, startedAt: 'process-42' });
                return { sessionId: request.agent.providerSessionId, result: `answer:${request.prompt}`, exitCode: 0 };
            }),
        };
        const service = new ClaudePrintAgentService({
            repository,
            probe: { validate: vi.fn() },
            runner,
        });

        const created = await service.create({ name: 'reviewer', cwd });

        await expect(service.send(created.id, 'first secret')).resolves.toMatchObject({ result: 'answer:first secret' });
        await expect(service.send(created.id, 'follow up')).resolves.toMatchObject({ result: 'answer:follow up' });

        expect(runner.run.mock.calls[0][0]).toMatchObject({ firstRun: true, prompt: 'first secret' });
        expect(runner.run.mock.calls[1][0]).toMatchObject({ firstRun: false, prompt: 'follow up' });

        const persisted = await repository.getById(created.id);
        expect(persisted).toMatchObject({ state: 'ready', sessionHealth: 'healthy' });
    });
});

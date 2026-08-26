import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    CodexPrintError,
    CodexPrintAgentService,
    DurableAgentRepository,
    type ProcessInspector,
} from '../../index.js';

const SESSION = '22222222-2222-4222-8222-222222222222';
const roots: string[] = [];

afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('Codex print-agent fake-provider journey', () => {
    it('creates unbound, then binds and explicitly resumes the provider-minted session', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-print-integration-'));
        roots.push(root);
        const cwd = path.join(root, 'project');
        fs.mkdirSync(cwd);
        const processInspector: ProcessInspector = {
            getIdentity: (pid) => ({ pid, startedAt: `process-${pid}` }),
        };
        const repository = new DurableAgentRepository({ dbPath: path.join(root, 'agents.db'), processInspector });
        const runner = {
            run: vi.fn().mockImplementation(async (request) => {
                await request.onSpawn({ pid: 42, startedAt: 'process-42' });
                await request.onSession(SESSION);
                return { sessionId: SESSION, result: `answer:${request.prompt}`, messages: [`answer:${request.prompt}`], exitCode: 0 };
            }),
        };
        const service = new CodexPrintAgentService({
            repository, probe: { validate: vi.fn() }, runner,
        });

        const created = await service.create({ name: 'reviewer', cwd });
        expect(created).toMatchObject({ provider: 'codex', providerSessionId: null, sessionHealth: 'uninitialized' });

        const first = await service.send(created.id, 'first secret');
        expect(first).toMatchObject({ result: 'answer:first secret' });
        const bound = await repository.getById(created.id);
        expect(bound?.providerSessionId).toBe(first.sessionId);
        await expect(service.send(created.id, 'follow up')).resolves.toMatchObject({ result: 'answer:follow up' });

        expect(runner.run.mock.calls[0][0].agent).toMatchObject({ providerSessionId: null });
        expect(runner.run.mock.calls[1][0].agent).toMatchObject({ providerSessionId: SESSION });
    });

    it('retains a first-run binding when the provider fails after thread start', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-print-bind-failure-'));
        roots.push(root);
        const cwd = path.join(root, 'project');
        fs.mkdirSync(cwd);
        const processInspector: ProcessInspector = {
            getIdentity: (pid) => ({ pid, startedAt: `process-${pid}` }),
        };
        const repository = new DurableAgentRepository({ dbPath: path.join(root, 'agents.db'), processInspector });
        const runner = {
            run: vi.fn().mockImplementation(async (request) => {
                await request.onSpawn({ pid: 42, startedAt: 'process-42' });
                await request.onSession(SESSION);
                throw new CodexPrintError('Codex print run failed.', 'CODEX_PROCESS');
            }),
        };
        const service = new CodexPrintAgentService({
            repository, probe: { validate: vi.fn() }, runner,
        });
        const created = await service.create({ name: 'reviewer', cwd });

        await expect(service.send(created.id, 'secret')).rejects.toMatchObject({ code: 'CODEX_PROCESS' });
        expect((await repository.getById(created.id))).toMatchObject({
            providerSessionId: SESSION, state: 'degraded', sessionHealth: 'unknown',
        });
    });
});

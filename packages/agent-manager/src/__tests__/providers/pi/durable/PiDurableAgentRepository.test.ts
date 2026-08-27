import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DurableAgentRepository } from '../../../../durable/DurableAgentRepository.js';

const roots: string[] = [];

afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('Pi durable-agent repository sessions', () => {
    it('assigns a non-null session at creation and rejects deferred binding', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-durable-repository-'));
        roots.push(root);
        const cwd = path.join(root, 'project');
        fs.mkdirSync(cwd);
        const repository = new DurableAgentRepository({
            dbPath: path.join(root, 'agents.db'),
            processInspector: { getIdentity: (pid) => ({ pid, startedAt: 'owner-start' }) },
        });

        const agent = await repository.create({ name: 'reviewer', cwd, provider: 'pi' });
        expect(agent).toMatchObject({ provider: 'pi', sessionHealth: 'uninitialized' });
        expect(agent.providerSessionId).toMatch(/^[0-9a-f-]{36}$/);

        const run = await repository.acquireRun(agent.id);
        await expect(repository.bindProviderSession(agent.id, run.token, crypto.randomUUID()))
            .rejects.toThrow('Only Codex durable sessions can be bound after creation.');
    });
});

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DurableAgentRepository } from '../../durable/DurableAgentRepository.js';

const SESSION = '22222222-2222-4222-8222-222222222222';
const OTHER_SESSION = '33333333-3333-4333-8333-333333333333';
const roots: string[] = [];

afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function fixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-durable-repository-'));
    roots.push(root);
    const cwd = path.join(root, 'project');
    fs.mkdirSync(cwd);
    const processInspector = { getIdentity: (pid: number) => ({ pid, startedAt: 'owner-start' }) };
    return { cwd, repository: new DurableAgentRepository({ dbPath: path.join(root, 'agents.db'), processInspector }) };
}

describe('Codex durable-agent repository binding', () => {
    it('creates Codex agents unbound and binds during the owned run', async () => {
        const { cwd, repository } = fixture();
        const agent = await repository.create({ name: 'reviewer', cwd, provider: 'codex' });
        expect(agent).toMatchObject({ provider: 'codex', mode: 'durable', providerSessionId: null });

        const run = await repository.acquireRun(agent.id);
        const bound = await repository.bindProviderSession(agent.id, run.token, SESSION);
        expect(bound.providerSessionId).toBe(SESSION);
        await expect(repository.bindProviderSession(agent.id, run.token, SESSION))
            .resolves.toMatchObject({ providerSessionId: SESSION });
    });

    it('rejects invalid, stale, replacement, and duplicate bindings', async () => {
        const { cwd, repository } = fixture();
        const first = await repository.create({ name: 'first', cwd, provider: 'codex' });
        const second = await repository.create({ name: 'second', cwd, provider: 'codex' });
        const firstRun = await repository.acquireRun(first.id);
        const secondRun = await repository.acquireRun(second.id);

        await expect(repository.bindProviderSession(first.id, 'stale', SESSION))
            .rejects.toMatchObject({ code: 'DURABLE_AGENT_REPOSITORY' });
        await expect(repository.bindProviderSession(first.id, firstRun.token, 'invalid'))
            .rejects.toMatchObject({ code: 'DURABLE_AGENT_REPOSITORY' });
        await repository.bindProviderSession(first.id, firstRun.token, SESSION);
        await expect(repository.bindProviderSession(first.id, firstRun.token, OTHER_SESSION))
            .rejects.toMatchObject({ code: 'CODEX_SESSION_MISMATCH' });
        await expect(repository.bindProviderSession(second.id, secondRun.token, SESSION))
            .rejects.toMatchObject({ code: 'CODEX_SESSION_MISMATCH' });
    });
});

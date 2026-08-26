import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { CodexCliProbe, CodexPrintAgentService, CodexPrintRunner, DurableAgentRepository } from '../../index.js';

const roots: string[] = [];
const originalCapture = process.env.AI_DEVKIT_FAKE_CODEX_CAPTURE;

afterEach(() => {
    if (originalCapture === undefined) delete process.env.AI_DEVKIT_FAKE_CODEX_CAPTURE;
    else process.env.AI_DEVKIT_FAKE_CODEX_CAPTURE = originalCapture;
    delete process.env.AI_DEVKIT_FAKE_CODEX_MODE;
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('Codex print-agent fake-provider journey', () => {
    it('creates unbound, then binds and explicitly resumes the provider-minted session', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-print-integration-'));
        roots.push(root);
        const cwd = path.join(root, 'project');
        fs.mkdirSync(cwd);
        const capture = path.join(root, 'capture.jsonl');
        process.env.AI_DEVKIT_FAKE_CODEX_CAPTURE = capture;
        const executable = fileURLToPath(new URL('../fixtures/fake-codex.cjs', import.meta.url));
        const repository = new DurableAgentRepository({ dbPath: path.join(root, 'agents.db') });
        const service = new CodexPrintAgentService({
            repository, probe: new CodexCliProbe({ executable }), runner: new CodexPrintRunner(), executable,
        });

        const created = await service.create({ name: 'reviewer', cwd });
        expect(created).toMatchObject({ provider: 'codex', providerSessionId: null, sessionHealth: 'uninitialized' });
        expect(fs.existsSync(capture)).toBe(false);

        const first = await service.send(created.id, 'first secret');
        expect(first).toMatchObject({ result: 'answer:first secret' });
        const bound = await repository.getById(created.id);
        expect(bound?.providerSessionId).toBe(first.sessionId);
        await expect(service.send(created.id, 'follow up')).resolves.toMatchObject({ result: 'answer:follow up' });

        const invocations = fs.readFileSync(capture, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
        expect(invocations[0]).toMatchObject({ args: ['exec', '--json', '-'], prompt: 'first secret', cwd: fs.realpathSync(cwd) });
        expect(invocations[1]).toMatchObject({
            args: ['exec', 'resume', '--json', first.sessionId, '-'], prompt: 'follow up', cwd: fs.realpathSync(cwd),
        });
        expect(JSON.stringify(invocations.map((entry) => entry.args))).not.toContain('first secret');
    });

    it('retains a first-run binding when the provider fails after thread start', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-print-bind-failure-'));
        roots.push(root);
        const cwd = path.join(root, 'project');
        fs.mkdirSync(cwd);
        const executable = fileURLToPath(new URL('../fixtures/fake-codex.cjs', import.meta.url));
        const repository = new DurableAgentRepository({ dbPath: path.join(root, 'agents.db') });
        const service = new CodexPrintAgentService({
            repository, probe: new CodexCliProbe({ executable }), runner: new CodexPrintRunner(), executable,
        });
        const created = await service.create({ name: 'reviewer', cwd });
        process.env.AI_DEVKIT_FAKE_CODEX_MODE = 'fail-after-bind';

        await expect(service.send(created.id, 'secret')).rejects.toMatchObject({ code: 'CODEX_PROCESS' });
        expect((await repository.getById(created.id))).toMatchObject({
            providerSessionId: '22222222-2222-4222-8222-222222222222', state: 'degraded', sessionHealth: 'unknown',
        });
    });
});

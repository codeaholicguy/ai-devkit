import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
    ClaudeCliProbe,
    ClaudePrintAgentService,
    ClaudePrintRunner,
    DurableAgentRepository,
} from '../../index.js';

const roots: string[] = [];
const originalCapture = process.env.AI_DEVKIT_FAKE_CLAUDE_CAPTURE;

afterEach(() => {
    if (originalCapture === undefined) delete process.env.AI_DEVKIT_FAKE_CLAUDE_CAPTURE;
    else process.env.AI_DEVKIT_FAKE_CLAUDE_CAPTURE = originalCapture;
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('Claude durable-agent fake-provider journey', () => {
    it('creates without invocation, then starts and resumes the same session through stdin', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'durable-agent-integration-'));
        roots.push(root);
        const cwd = path.join(root, 'project');
        fs.mkdirSync(cwd);
        const capture = path.join(root, 'capture.jsonl');
        process.env.AI_DEVKIT_FAKE_CLAUDE_CAPTURE = capture;
        const executable = fileURLToPath(new URL('../fixtures/fake-claude.cjs', import.meta.url));
        const repository = new DurableAgentRepository({ dbPath: path.join(root, 'state', 'agents.db') });
        const service = new ClaudePrintAgentService({
            repository,
            probe: new ClaudeCliProbe({ executable }),
            runner: new ClaudePrintRunner(),
            executable,
        });

        const created = await service.create({ name: 'reviewer', cwd });
        expect(fs.existsSync(capture)).toBe(false);

        await expect(service.send(created.id, 'first secret')).resolves.toMatchObject({ result: 'answer:first secret' });
        await expect(service.send(created.id, 'follow up')).resolves.toMatchObject({ result: 'answer:follow up' });

        const invocations = fs.readFileSync(capture, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
        expect(invocations[0]).toMatchObject({ prompt: 'first secret', cwd: fs.realpathSync(cwd) });
        expect(invocations[0].args).toContain('--session-id');
        expect(invocations[0].args).not.toContain('first secret');
        expect(invocations[1]).toMatchObject({ prompt: 'follow up', cwd: fs.realpathSync(cwd) });
        expect(invocations[1].args).toContain('--resume');
        expect(invocations[1].args[invocations[1].args.indexOf('--resume') + 1]).toBe(created.providerSessionId);

        const persisted = await repository.getById(created.id);
        expect(persisted).toMatchObject({ state: 'ready', sessionHealth: 'healthy' });
    });
});

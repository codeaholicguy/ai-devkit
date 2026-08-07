import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

const tempDirs: string[] = [];

afterEach(() => {
    for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

async function loadStore(): Promise<any> {
    const api = await import('../../index.js') as Record<string, unknown>;
    expect(api).toHaveProperty('PrintAgentStore');
    return api.PrintAgentStore;
}

function fixture(): { root: string; cwd: string; filePath: string } {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'print-agent-store-'));
    tempDirs.push(root);
    const cwd = path.join(root, 'project');
    fs.mkdirSync(cwd);
    return { root, cwd, filePath: path.join(root, 'state', 'print-agents.json') };
}

describe('PrintAgentStore create/list/resolve', () => {
    it('creates distinct durable identities with a canonical cwd and lists them', async () => {
        const PrintAgentStore = await loadStore();
        const { cwd, filePath } = fixture();
        const store = new PrintAgentStore({ filePath, now: () => new Date('2026-08-07T09:00:00Z') });

        const agent = await store.create({ name: 'reviewer', cwd });

        expect(agent).toMatchObject({
            name: 'reviewer',
            provider: 'claude',
            mode: 'print',
            cwd: fs.realpathSync(cwd),
            state: 'ready',
            sessionHealth: 'uninitialized',
            activeRun: null,
        });
        expect(agent.id).toMatch(/^[0-9a-f-]{36}$/);
        expect(agent.providerSessionId).toMatch(/^[0-9a-f-]{36}$/);
        expect(agent.id).not.toBe(agent.providerSessionId);
        expect(await store.list()).toEqual([agent]);
        expect(fs.statSync(filePath).mode & 0o777).toBe(0o600);
    });

    it('resolves exact ids and names and rejects duplicate names', async () => {
        const PrintAgentStore = await loadStore();
        const { cwd, filePath } = fixture();
        const store = new PrintAgentStore({ filePath });
        const agent = await store.create({ name: 'Reviewer', cwd });

        expect(await store.resolve(agent.id)).toMatchObject({ id: agent.id });
        expect(await store.resolve('reviewer')).toMatchObject({ id: agent.id });
        expect(await store.resolve('view')).toBeNull();
        await expect(store.create({ name: 'reviewer', cwd })).rejects.toMatchObject({
            code: 'PRINT_AGENT_NAME_CONFLICT',
        });
    });

    it('rejects missing cwd, malformed storage, and symlinked store targets', async () => {
        const PrintAgentStore = await loadStore();
        const { root, cwd, filePath } = fixture();
        const store = new PrintAgentStore({ filePath });

        await expect(store.create({ name: 'missing', cwd: path.join(root, 'missing') }))
            .rejects.toMatchObject({ code: 'PRINT_AGENT_STORE' });

        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, '{bad json', { mode: 0o600 });
        await expect(store.list()).rejects.toMatchObject({ code: 'PRINT_AGENT_STORE' });

        fs.rmSync(filePath);
        const target = path.join(root, 'target.json');
        fs.writeFileSync(target, JSON.stringify({ version: 1, agents: [] }));
        fs.symlinkSync(target, filePath);
        await expect(store.create({ name: 'unsafe', cwd })).rejects.toMatchObject({
            code: 'PRINT_AGENT_STORE',
        });
    });

    it('recovers an abandoned old mutation lock after a crash', async () => {
        const PrintAgentStore = await loadStore();
        const { cwd, filePath } = fixture();
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        const lockPath = `${filePath}.lock`;
        fs.mkdirSync(lockPath);
        const old = new Date(Date.now() - 60_000);
        fs.utimesSync(lockPath, old, old);
        const store = new PrintAgentStore({ filePath, mutationLockStaleMs: 10 });

        await expect(store.create({ name: 'recovered', cwd })).resolves.toMatchObject({ name: 'recovered' });
    });
});

describe('PrintAgentStore run ownership', () => {
    it('fails fast when another exact owner is live and completes only for its token', async () => {
        const PrintAgentStore = await loadStore();
        const { cwd, filePath } = fixture();
        const live = new Map<number, string>([[process.pid, 'owner-start']]);
        const processInspector = { getIdentity: (pid: number) => {
            const startedAt = live.get(pid);
            return startedAt ? { pid, startedAt } : null;
        } };
        const store = new PrintAgentStore({ filePath, processInspector });
        const agent = await store.create({ name: 'runner', cwd });

        const acquired = await store.acquireRun(agent.id);
        await expect(store.acquireRun(agent.id)).rejects.toMatchObject({ code: 'PRINT_AGENT_BUSY' });
        await expect(store.completeRun(agent.id, 'wrong-token', {
            status: 'succeeded', exitCode: 0, summary: 'done', sessionHealth: 'healthy',
        })).rejects.toMatchObject({ code: 'PRINT_AGENT_STORE' });

        const completed = await store.completeRun(agent.id, acquired.token, {
            status: 'succeeded', exitCode: 0, summary: 'done', sessionHealth: 'healthy',
        });
        expect(completed).toMatchObject({ state: 'ready', sessionHealth: 'healthy', activeRun: null });
    });

    it('retains busy for a live provider then recovers a dead run without signaling it', async () => {
        const PrintAgentStore = await loadStore();
        const { cwd, filePath } = fixture();
        const live = new Map<number, string>([[process.pid, 'owner-start'], [4242, 'provider-start']]);
        const processInspector = { getIdentity: (pid: number) => {
            const startedAt = live.get(pid);
            return startedAt ? { pid, startedAt } : null;
        } };
        const first = new PrintAgentStore({ filePath, processInspector });
        const agent = await first.create({ name: 'recoverable', cwd });
        const run = await first.acquireRun(agent.id);
        await first.recordProviderProcess(agent.id, run.token, { pid: 4242, startedAt: 'provider-start' });

        live.delete(process.pid);
        await expect(first.acquireRun(agent.id)).rejects.toMatchObject({ code: 'PRINT_AGENT_BUSY' });

        live.delete(4242);
        live.set(process.pid, 'replacement-owner-start');
        const recovered = await first.acquireRun(agent.id);
        expect(recovered.agent).toMatchObject({
            state: 'running',
            lastResult: { status: 'interrupted' },
        });
        await first.completeRun(agent.id, recovered.token, {
            status: 'failed', exitCode: 1, summary: 'failed', sessionHealth: 'unknown',
        });
    });

    it('reconciles an old incomplete lock to degraded during list', async () => {
        const PrintAgentStore = await loadStore();
        const { root, cwd, filePath } = fixture();
        const live = new Map<number, string>([[process.pid, 'owner-start']]);
        const store = new PrintAgentStore({ filePath, incompleteLockGraceMs: 10, processInspector: {
            getIdentity: (pid: number) => {
                const startedAt = live.get(pid);
                return startedAt ? { pid, startedAt } : null;
            },
        } });
        const agent = await store.create({ name: 'crashed', cwd });
        await store.acquireRun(agent.id);
        const lockPath = path.join(root, 'state', 'print-agent-locks', `${agent.id}.lock`);
        fs.unlinkSync(path.join(lockPath, 'owner.json'));
        const old = new Date(Date.now() - 1000);
        fs.utimesSync(lockPath, old, old);
        live.clear();

        const listed = await store.list();

        expect(listed[0]).toMatchObject({
            state: 'degraded',
            sessionHealth: 'unknown',
            activeRun: null,
            lastResult: { status: 'interrupted' },
        });
    });

    it('rejects send acquisition when the bound cwd is replaced by a symlink', async () => {
        const PrintAgentStore = await loadStore();
        const { root, cwd, filePath } = fixture();
        const store = new PrintAgentStore({ filePath });
        const agent = await store.create({ name: 'bound', cwd });
        const moved = path.join(root, 'moved-project');
        const other = path.join(root, 'other-project');
        fs.renameSync(cwd, moved);
        fs.mkdirSync(other);
        fs.symlinkSync(other, cwd);

        await expect(store.acquireRun(agent.id)).rejects.toMatchObject({ code: 'PRINT_AGENT_STORE' });
    });
});

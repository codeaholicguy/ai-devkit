import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { PrintAgentStore } from '../../print/PrintAgentStore.js';

const roots: string[] = [];
afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function fixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'print-agent-sqlite-'));
    roots.push(root);
    const cwd = path.join(root, 'project');
    fs.mkdirSync(cwd);
    return {
        root,
        cwd,
        filePath: path.join(root, 'state', 'print-agents.json'),
        dbPath: path.join(root, 'state', 'agents.db'),
    };
}

describe('PrintAgentStore SQLite migration', () => {
    it('maps an injected JSON path to a sibling db path while explicit dbPath wins', async () => {
        const { cwd, filePath, dbPath } = fixture();
        const mapped = new PrintAgentStore({ filePath });
        await mapped.create({ name: 'mapped', cwd });
        expect(fs.existsSync(filePath.replace(/\.json$/, '.db'))).toBe(true);

        const explicit = new PrintAgentStore({ filePath, dbPath });
        await explicit.create({ name: 'explicit', cwd });
        expect(fs.existsSync(dbPath)).toBe(true);
    });

    it('imports legacy JSON once, backs it up after commit, and reopens idempotently', async () => {
        const { cwd, filePath } = fixture();
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        const agent = {
            id: crypto.randomUUID(), name: 'legacy', provider: 'claude', mode: 'print', cwd,
            providerSessionId: crypto.randomUUID(), state: 'ready', sessionHealth: 'healthy',
            createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
            lastActiveAt: null, lastResult: null, activeRun: null,
        };
        fs.writeFileSync(filePath, JSON.stringify({ version: 1, agents: [agent] }));

        const first = new PrintAgentStore({ filePath });
        expect(await first.list()).toEqual([agent]);
        expect(fs.existsSync(filePath)).toBe(false);
        expect(fs.existsSync(`${filePath}.migrated-v1.bak`)).toBe(true);
        const second = new PrintAgentStore({ filePath });
        expect(await second.list()).toEqual([agent]);
    });

    it('rolls back invalid legacy input and leaves the source intact', () => {
        const { filePath } = fixture();
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, JSON.stringify({ version: 1, agents: [{ id: 'bad' }] }));
        expect(() => new PrintAgentStore({ filePath })).toThrow(/Invalid print-agent store/);
        expect(fs.existsSync(filePath)).toBe(true);
    });

    it('rejects a symlinked legacy file without changing its target', () => {
        const { root, filePath } = fixture();
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        const target = path.join(root, 'legacy-target.json');
        fs.writeFileSync(target, JSON.stringify({ version: 1, agents: [] }));
        fs.symlinkSync(target, filePath);
        expect(() => new PrintAgentStore({ filePath })).toThrow(/symbolic link/i);
        expect(fs.existsSync(target)).toBe(true);
    });

    it('rolls back a partially attempted import and can reopen after the source is repaired', async () => {
        const { cwd, filePath } = fixture();
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        const base = {
            id: crypto.randomUUID(), provider: 'claude', mode: 'print', cwd,
            providerSessionId: crypto.randomUUID(), state: 'ready', sessionHealth: 'healthy',
            createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
            lastActiveAt: null, lastResult: null, activeRun: null,
        };
        fs.writeFileSync(filePath, JSON.stringify({ version: 1, agents: [
            { ...base, name: 'duplicate' },
            { ...base, id: crypto.randomUUID(), providerSessionId: crypto.randomUUID(), name: 'DUPLICATE' },
        ] }));
        expect(() => new PrintAgentStore({ filePath })).toThrow(/Invalid print-agent store/);
        const raw = new Database(filePath.replace(/\.json$/, '.db'));
        expect(raw.prepare('SELECT count(*) AS count FROM durable_agents').get()).toEqual({ count: 0 });
        expect(raw.prepare('SELECT count(*) AS count FROM durable_agent_metadata').get()).toEqual({ count: 0 });
        raw.close();
        fs.writeFileSync(filePath, JSON.stringify({ version: 1, agents: [{ ...base, name: 'repaired' }] }));
        expect(await new PrintAgentStore({ filePath }).list()).toHaveLength(1);
    });

    it('maps a corrupt database to a store error', () => {
        const { dbPath } = fixture();
        fs.mkdirSync(path.dirname(dbPath), { recursive: true });
        fs.writeFileSync(dbPath, 'not sqlite');
        expect(() => new PrintAgentStore({ dbPath })).toThrow(/Cannot open print-agent database/);
    });
});

describe('PrintAgentStore SQLite concurrency', () => {
    it('allows exactly one acquisition across two connections', async () => {
        const { cwd, dbPath } = fixture();
        const identity = { pid: process.pid, startedAt: 'owner-start' };
        const processInspector = { getIdentity: (pid: number) => pid === process.pid ? identity : null };
        const first = new PrintAgentStore({ dbPath, processInspector });
        const second = new PrintAgentStore({ dbPath, processInspector });
        const agent = await first.create({ name: 'race', cwd });
        const results = await Promise.allSettled([first.acquireRun(agent.id), second.acquireRun(agent.id)]);
        expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
        const rejected = results.find(({ status }) => status === 'rejected');
        expect(rejected).toMatchObject({ reason: { code: 'PRINT_AGENT_BUSY' } });
    });

    it('keeps readonly listing pure', async () => {
        const { cwd, dbPath } = fixture();
        const live = new Map([[process.pid, 'owner-start']]);
        const processInspector = { getIdentity: (pid: number) => {
            const startedAt = live.get(pid);
            return startedAt ? { pid, startedAt } : null;
        } };
        const writable = new PrintAgentStore({ dbPath, processInspector });
        const agent = await writable.create({ name: 'readonly', cwd });
        await writable.acquireRun(agent.id);
        live.clear();
        const readonly = new PrintAgentStore({ dbPath, readonly: true, processInspector });
        expect((await readonly.list())[0]?.state).toBe('running');
    });

    it('rejects stale tokens and caps the persisted completion summary', async () => {
        const { cwd, dbPath } = fixture();
        const processInspector = { getIdentity: (pid: number) => ({ pid, startedAt: 'owner-start' }) };
        const store = new PrintAgentStore({ dbPath, processInspector });
        const agent = await store.create({ name: 'token', cwd });
        const run = await store.acquireRun(agent.id);
        await expect(store.recordProviderProcess(agent.id, 'stale', { pid: 42, startedAt: 'provider' }))
            .rejects.toMatchObject({ code: 'PRINT_AGENT_STORE' });
        const completed = await store.completeRun(agent.id, run.token, {
            status: 'succeeded', exitCode: 0, summary: 'x'.repeat(5000), sessionHealth: 'healthy',
        });
        expect(completed.lastResult?.summary).toHaveLength(4096);
    });

    it('does not reconcile over ownership changed after process inspection', async () => {
        const { cwd, dbPath } = fixture();
        let inspect: (() => void) | undefined;
        const processInspector = { getIdentity: (pid: number) => {
            if (inspect) inspect();
            return inspect ? null : { pid, startedAt: 'owner-start' };
        } };
        const store = new PrintAgentStore({ dbPath, processInspector });
        const agent = await store.create({ name: 'cas', cwd });
        await store.acquireRun(agent.id);
        const other = new Database(dbPath);
        inspect = () => {
            inspect = undefined;
            other.prepare(`UPDATE durable_agents SET
                active_run_token = 'replacement-token', active_owner_started_at = 'replacement-owner'
                WHERE id = ?`).run(agent.id);
        };

        await store.reconcile();

        expect(other.prepare('SELECT state, active_run_token FROM durable_agents WHERE id = ?').get(agent.id))
            .toEqual({ state: 'running', active_run_token: 'replacement-token' });
        other.close();
    });
});

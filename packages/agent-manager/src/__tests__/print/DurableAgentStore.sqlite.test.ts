import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { DurableAgentStore } from '../../print/DurableAgentStore.js';

const roots: string[] = [];
afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function fixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'durable-agent-sqlite-'));
    roots.push(root);
    const cwd = path.join(root, 'project');
    fs.mkdirSync(cwd);
    return { root, cwd, dbPath: path.join(root, 'state', 'agents.db') };
}

describe('DurableAgentStore SQLite concurrency', () => {
    it('allows exactly one acquisition across two connections', async () => {
        const { cwd, dbPath } = fixture();
        const identity = { pid: process.pid, startedAt: 'owner-start' };
        const processInspector = { getIdentity: (pid: number) => pid === process.pid ? identity : null };
        const first = new DurableAgentStore({ dbPath, processInspector });
        const second = new DurableAgentStore({ dbPath, processInspector });
        const agent = await first.create({ name: 'race', cwd });
        const results = await Promise.allSettled([first.acquireRun(agent.id), second.acquireRun(agent.id)]);
        expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
        const rejected = results.find(({ status }) => status === 'rejected');
        expect(rejected).toMatchObject({ reason: { code: 'DURABLE_AGENT_BUSY' } });
    });

    it('accepts deprecated lock options without creating lock artifacts', async () => {
        const { root, cwd, dbPath } = fixture();
        const store = new DurableAgentStore({
            dbPath, lockTimeoutMs: 1, incompleteLockGraceMs: 1, mutationLockStaleMs: 1,
        });
        await store.create({ name: 'lockless', cwd });
        expect(fs.existsSync(`${dbPath}.lock`)).toBe(false);
        expect(fs.existsSync(path.join(root, 'state', 'durable-agent-locks'))).toBe(false);
    });

    it('keeps readonly listing pure', async () => {
        const { cwd, dbPath } = fixture();
        const live = new Map([[process.pid, 'owner-start']]);
        const processInspector = { getIdentity: (pid: number) => {
            const startedAt = live.get(pid);
            return startedAt ? { pid, startedAt } : null;
        } };
        const writable = new DurableAgentStore({ dbPath, processInspector });
        const agent = await writable.create({ name: 'readonly', cwd });
        await writable.acquireRun(agent.id);
        live.clear();
        const readonly = new DurableAgentStore({ dbPath, readonly: true, processInspector });
        expect((await readonly.list())[0]?.state).toBe('running');
    });

    it('rejects stale tokens and caps the persisted completion summary', async () => {
        const { cwd, dbPath } = fixture();
        const processInspector = { getIdentity: (pid: number) => ({ pid, startedAt: 'owner-start' }) };
        const store = new DurableAgentStore({ dbPath, processInspector });
        const agent = await store.create({ name: 'token', cwd });
        const run = await store.acquireRun(agent.id);
        await expect(store.recordProviderProcess(agent.id, 'stale', { pid: 42, startedAt: 'provider' }))
            .rejects.toMatchObject({ code: 'DURABLE_AGENT_STORE' });
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
        const store = new DurableAgentStore({ dbPath, processInspector });
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

    it('maps a corrupt database to a store error', () => {
        const { dbPath } = fixture();
        fs.mkdirSync(path.dirname(dbPath), { recursive: true });
        fs.writeFileSync(dbPath, 'not sqlite');
        expect(() => new DurableAgentStore({ dbPath })).toThrow(/Cannot open durable-agent database/);
    });
});

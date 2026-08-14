import fs from 'fs';
import os from 'os';
import path from 'path';
import { AgentRegistry, RenameNotFoundError, RenameConflictError, type RegistryEntry } from '../../utils/AgentRegistry.js';

function makeEntry(over: Partial<RegistryEntry> = {}): RegistryEntry {
    return {
        name: 'agent1',
        type: 'claude',
        pid: process.pid,
        tmuxSession: 'agent1',
        cwd: '/tmp',
        startedAt: '2026-05-30T00:00:00.000Z',
        sessionId: 'sid-1',
        sessionFilePath: '/tmp/session.jsonl',
        ...over,
    };
}

describe('AgentRegistry', () => {
    let tmpDir: string;
    let regPath: string;
    let registry: AgentRegistry;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-registry-'));
        regPath = path.join(tmpDir, 'nested', 'agents.json');
        registry = new AgentRegistry(regPath);
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    describe('register', () => {
        it('creates the SQLite database and parent directory if missing', () => {
            registry.register(makeEntry());
            expect(fs.existsSync(regPath.replace(/\.json$/, '.db'))).toBe(true);
            expect(registry.list()[0].name).toBe('agent1');
        });

        it('appends a new entry when name is unique', () => {
            registry.register(makeEntry({ name: 'a' }));
            registry.register(makeEntry({ name: 'b', pid: process.ppid }));
            expect(registry.list()).toHaveLength(2);
        });

        it('upserts in place when type and pid already exist', () => {
            registry.register(makeEntry({ name: 'a', pid: process.pid }));
            registry.register(makeEntry({ name: 'fallback', pid: process.pid, tmuxSession: '' }));
            const all = registry.list();
            expect(all).toHaveLength(1);
            expect(all[0].pid).toBe(process.pid);
            expect(all[0].name).toBe('a');
        });

        it('does not write through the legacy fixed .tmp path', () => {
            registry.register(makeEntry());
            expect(fs.existsSync(`${regPath}.tmp`)).toBe(false);
        });

        it('persists session fields', () => {
            registry.register(makeEntry({ sessionId: 'sid-xyz', sessionFilePath: '/foo/bar.jsonl' }));
            const saved = registry.list()[0];
            expect(saved.sessionId).toBe('sid-xyz');
            expect(saved.sessionFilePath).toBe('/foo/bar.jsonl');
        });

        it('preserves existing tmuxSession when incoming is empty string', () => {
            registry.register(makeEntry({ name: 'a', tmuxSession: 'pinned' }));
            registry.register(makeEntry({ name: 'fallback', tmuxSession: '', pid: process.pid }));
            const saved = registry.lookup('a');
            expect(saved?.tmuxSession).toBe('pinned');
            expect(saved?.pid).toBe(process.pid);
        });

        it('lets a managed start entry replace a generated fallback for the same pid', () => {
            registry.register(makeEntry({ name: `ai-devkit-${process.pid}`, tmuxSession: '' }));
            registry.register(makeEntry({ name: 'custom-name', tmuxSession: 'custom-name' }));
            expect(registry.lookup('custom-name')?.tmuxSession).toBe('custom-name');
            expect(registry.lookup(`ai-devkit-${process.pid}`)).toBeNull();
            expect(registry.list()).toHaveLength(1);
        });
    });

    describe('registerBatch', () => {
        it('is a no-op on empty array', () => {
            registry.registerBatch([]);
            expect(fs.existsSync(regPath)).toBe(false);
        });

        it('upserts multiple entries in a single batch', () => {
            registry.registerBatch([
                makeEntry({ name: 'a' }),
                makeEntry({ name: 'b', pid: process.pid + 1 }),
                makeEntry({ name: 'c', pid: process.pid + 2 }),
            ]);
            expect(registry.list()).toHaveLength(3);
        });

        it('applies the tmuxSession merge per entry', () => {
            registry.register(makeEntry({ name: 'a', tmuxSession: 'pinned' }));
            registry.registerBatch([
                makeEntry({ name: 'fallback', tmuxSession: '', pid: process.pid }),
                makeEntry({ name: 'b', tmuxSession: '', pid: process.pid + 1 }),
            ]);
            expect(registry.lookup('a')?.tmuxSession).toBe('pinned');
            expect(registry.lookup('a')?.pid).toBe(process.pid);
            expect(registry.lookup('b')?.tmuxSession).toBe('');
        });

        it('handles concurrent registry instances without duplicate pid rows', () => {
            const other = new AgentRegistry(regPath);
            registry.register(makeEntry({ name: `ai-devkit-${process.pid}`, tmuxSession: '' }));
            other.register(makeEntry({ name: 'custom-name', tmuxSession: 'custom-name' }));
            registry.register(makeEntry({ name: `ai-devkit-${process.pid}`, tmuxSession: '' }));

            expect(registry.list()).toHaveLength(1);
            expect(registry.lookup('custom-name')?.pid).toBe(process.pid);
        });

        it('cleans up a cross-type row when its pid has been reused', () => {
            registry.register(makeEntry({ name: 'old-claude', type: 'claude', pid: process.pid }));

            registry.register(makeEntry({
                name: 'new-codex',
                type: 'codex',
                pid: process.pid,
                tmuxSession: '',
            }));

            expect(registry.lookup('old-claude')).toBeNull();
            expect(registry.lookup('new-codex')).toMatchObject({ type: 'codex', pid: process.pid });
            expect(registry.list()).toHaveLength(1);
        });

        it('rolls back the whole batch when a live name conflict rejects one entry', () => {
            registry.register(makeEntry({ name: 'taken', pid: process.pid }));

            expect(() => registry.registerBatch([
                makeEntry({ name: 'fresh', pid: 999998 }),
                makeEntry({ name: 'taken', type: 'codex', pid: 999997 }),
            ])).toThrow(/UNIQUE constraint failed/);

            expect(registry.lookup('fresh')).toBeNull();
            expect(registry.lookup('taken')?.pid).toBe(process.pid);
        });
    });

    describe('lookup', () => {
        it('returns null when name not found', () => {
            expect(registry.lookup('missing')).toBeNull();
        });

        it('returns the entry when name matches', () => {
            registry.register(makeEntry({ name: 'a' }));
            expect(registry.lookup('a')?.name).toBe('a');
        });
    });

    describe('list', () => {
        it('returns empty array when database does not contain entries', () => {
            expect(registry.list()).toEqual([]);
        });

        it('ignores existing legacy agents.json entries', () => {
            const legacyEntry = makeEntry({ name: 'legacy', tmuxSession: 'legacy' });
            fs.mkdirSync(path.dirname(regPath), { recursive: true });
            fs.writeFileSync(regPath, JSON.stringify({ entries: [legacyEntry] }), 'utf8');

            const legacyRegistry = new AgentRegistry(regPath);

            expect(legacyRegistry.lookup('legacy')).toBeNull();
            expect(legacyRegistry.list()).toEqual([]);
            expect(fs.existsSync(regPath.replace(/\.json$/, '.db'))).toBe(true);
        });
    });

    describe('isAlive', () => {
        it('returns true for the current process', () => {
            expect(registry.isAlive(makeEntry({ pid: process.pid }))).toBe(true);
        });

        it('returns false for a PID that does not exist', () => {
            expect(registry.isAlive(makeEntry({ pid: 999999 }))).toBe(false);
        });
    });

    describe('prune', () => {
        it('removes entries whose PIDs are dead', () => {
            registry.register(makeEntry({ name: 'alive', pid: process.pid }));
            registry.register(makeEntry({ name: 'dead', pid: 999999 }));
            registry.prune();
            const remaining = registry.list();
            expect(remaining).toHaveLength(1);
            expect(remaining[0].name).toBe('alive');
        });

        it('is a no-op when all entries are alive', () => {
            registry.register(makeEntry({ pid: process.pid }));
            const before = registry.list();
            registry.prune();
            const after = registry.list();
            expect(after).toEqual(before);
        });

        it('does nothing when file is missing', () => {
            expect(() => registry.prune()).not.toThrow();
        });

        it('keeps forced prune available before the passive cadence is due', () => {
            let nowMs = Date.parse('2026-08-14T10:00:00.000Z');
            const clocked = new AgentRegistry(regPath, {
                now: () => new Date(nowMs),
                pruneIntervalMs: 30_000,
            });
            clocked.register(makeEntry({ name: 'forced', pid: process.pid }));
            const alive = vi.spyOn(clocked, 'isAlive').mockReturnValue(true);
            clocked.pruneIfDue();
            alive.mockReturnValue(false);
            nowMs += 1;

            clocked.prune();

            expect(alive).toHaveBeenCalledTimes(2);
            expect(clocked.lookup('forced')).toBeNull();
        });
    });

    describe('default()', () => {
        it('returns a singleton instance', () => {
            expect(AgentRegistry.default()).toBe(AgentRegistry.default());
        });
    });

    describe('rename', () => {
        it('updates the name of an existing entry', () => {
            registry.register(makeEntry({ name: 'old-name', pid: process.pid }));
            registry.rename('old-name', 'new-name');
            expect(registry.lookup('new-name')?.name).toBe('new-name');
            expect(registry.lookup('old-name')).toBeNull();
        });

        it('preserves all other fields on the renamed entry', () => {
            registry.register(makeEntry({ name: 'old-name', pid: process.pid, tmuxSession: 'old-name', cwd: '/my/cwd' }));
            registry.rename('old-name', 'new-name');
            const entry = registry.lookup('new-name');
            expect(entry?.tmuxSession).toBe('old-name');
            expect(entry?.cwd).toBe('/my/cwd');
            expect(entry?.pid).toBe(process.pid);
        });

        it('throws RenameNotFoundError when current name does not exist', () => {
            expect(() => registry.rename('ghost', 'new-name')).toThrow(RenameNotFoundError);
        });

        it('throws RenameConflictError when new name is already in use by a live entry', () => {
            registry.register(makeEntry({ name: 'agent-a', pid: process.pid }));
            registry.register(makeEntry({ name: 'agent-b', pid: process.ppid }));
            expect(() => registry.rename('agent-a', 'agent-b')).toThrow(RenameConflictError);
        });

        it('succeeds when new name exists only as a stale (dead) entry', () => {
            registry.register(makeEntry({ name: 'agent-a', pid: process.pid }));
            registry.register(makeEntry({ name: 'agent-b', pid: 999999 }));
            expect(() => registry.rename('agent-a', 'agent-b')).not.toThrow();
            expect(registry.lookup('agent-b')?.pid).toBe(process.pid);
        });

        it('does not create the legacy fixed .tmp path on rename', () => {
            registry.register(makeEntry({ name: 'old-name', pid: process.pid }));
            registry.rename('old-name', 'new-name');
            expect(fs.existsSync(`${regPath}.tmp`)).toBe(false);
        });
    });
});

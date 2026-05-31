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
        it('creates the file and parent directory if missing', () => {
            registry.register(makeEntry());
            expect(fs.existsSync(regPath)).toBe(true);
            const parsed = JSON.parse(fs.readFileSync(regPath, 'utf8'));
            expect(parsed.entries).toHaveLength(1);
            expect(parsed.entries[0].name).toBe('agent1');
        });

        it('appends a new entry when name is unique', () => {
            registry.register(makeEntry({ name: 'a' }));
            registry.register(makeEntry({ name: 'b' }));
            expect(registry.list()).toHaveLength(2);
        });

        it('upserts in place when name already exists', () => {
            registry.register(makeEntry({ name: 'a', pid: 100 }));
            registry.register(makeEntry({ name: 'a', pid: 200 }));
            const all = registry.list();
            expect(all).toHaveLength(1);
            expect(all[0].pid).toBe(200);
        });

        it('writes atomically (no leftover .tmp on success)', () => {
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
            registry.register(makeEntry({ name: 'a', tmuxSession: '', pid: 999 }));
            const saved = registry.lookup('a');
            expect(saved?.tmuxSession).toBe('pinned');
            expect(saved?.pid).toBe(999);
        });

        it('replaces tmuxSession when incoming is non-empty', () => {
            registry.register(makeEntry({ name: 'a', tmuxSession: 'old' }));
            registry.register(makeEntry({ name: 'a', tmuxSession: 'new' }));
            expect(registry.lookup('a')?.tmuxSession).toBe('new');
        });
    });

    describe('registerBatch', () => {
        it('is a no-op on empty array', () => {
            registry.registerBatch([]);
            expect(fs.existsSync(regPath)).toBe(false);
        });

        it('upserts multiple entries with a single write', () => {
            const writeSpy = vi.spyOn(fs, 'writeFileSync');
            registry.registerBatch([
                makeEntry({ name: 'a' }),
                makeEntry({ name: 'b' }),
                makeEntry({ name: 'c' }),
            ]);
            expect(writeSpy).toHaveBeenCalledTimes(1);
            writeSpy.mockRestore();
            expect(registry.list()).toHaveLength(3);
        });

        it('applies the tmuxSession merge per entry', () => {
            registry.register(makeEntry({ name: 'a', tmuxSession: 'pinned' }));
            registry.registerBatch([
                makeEntry({ name: 'a', tmuxSession: '', pid: 7 }),
                makeEntry({ name: 'b', tmuxSession: '' }),
            ]);
            expect(registry.lookup('a')?.tmuxSession).toBe('pinned');
            expect(registry.lookup('a')?.pid).toBe(7);
            expect(registry.lookup('b')?.tmuxSession).toBe('');
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
        it('returns empty array when file does not exist', () => {
            expect(registry.list()).toEqual([]);
        });

        it('returns empty array when file is malformed', () => {
            fs.mkdirSync(path.dirname(regPath), { recursive: true });
            fs.writeFileSync(regPath, 'not json', 'utf8');
            expect(registry.list()).toEqual([]);
        });

        it('coerces non-array entries to []', () => {
            fs.mkdirSync(path.dirname(regPath), { recursive: true });
            fs.writeFileSync(regPath, JSON.stringify({ entries: 'oops' }), 'utf8');
            expect(registry.list()).toEqual([]);
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
            const before = fs.readFileSync(regPath, 'utf8');
            registry.prune();
            const after = fs.readFileSync(regPath, 'utf8');
            expect(after).toBe(before);
        });

        it('does nothing when file is missing', () => {
            expect(() => registry.prune()).not.toThrow();
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
            registry.register(makeEntry({ name: 'agent-b', pid: process.pid }));
            expect(() => registry.rename('agent-a', 'agent-b')).toThrow(RenameConflictError);
        });

        it('succeeds when new name exists only as a stale (dead) entry', () => {
            registry.register(makeEntry({ name: 'agent-a', pid: process.pid }));
            registry.register(makeEntry({ name: 'agent-b', pid: 999999 }));
            expect(() => registry.rename('agent-a', 'agent-b')).not.toThrow();
            expect(registry.lookup('agent-b')?.pid).toBe(process.pid);
        });

        it('writes atomically (no leftover .tmp on success)', () => {
            registry.register(makeEntry({ name: 'old-name', pid: process.pid }));
            registry.rename('old-name', 'new-name');
            expect(fs.existsSync(`${regPath}.tmp`)).toBe(false);
        });
    });
});

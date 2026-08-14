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
        vi.restoreAllMocks();
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

        it('preserves an existing name conflict when its probe fails with EPERM', () => {
            registry.register(makeEntry({ name: 'claimed-name', pid: process.pid }));
            vi.spyOn(process, 'kill').mockImplementation(() => {
                throw Object.assign(new Error('operation not permitted'), { code: 'EPERM' });
            });

            expect(() => registry.register(makeEntry({
                name: 'claimed-name',
                pid: process.pid + 1,
            }))).toThrow();
            expect(registry.lookup('claimed-name')?.pid).toBe(process.pid);
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

        it('transfers a same-type name from a live wrapper pid to its detected child pid', () => {
            registry.register(makeEntry({
                name: 'managed-gemini',
                type: 'gemini_cli',
                pid: process.ppid,
                tmuxSession: 'managed-gemini',
                startedAt: '2026-05-30T00:00:00.000Z',
                sessionId: `pid-${process.ppid}`,
                sessionFilePath: '',
            }));

            registry.registerBatch([makeEntry({
                name: 'managed-gemini',
                type: 'gemini_cli',
                pid: process.pid,
                tmuxSession: '',
                startedAt: '2026-05-31T00:00:00.000Z',
                sessionId: 'gemini-session',
                sessionFilePath: '/tmp/gemini-session.json',
            })]);

            expect(registry.list()).toEqual([
                expect.objectContaining({
                    name: 'managed-gemini',
                    type: 'gemini_cli',
                    pid: process.pid,
                    tmuxSession: 'managed-gemini',
                    startedAt: '2026-05-30T00:00:00.000Z',
                    sessionId: 'gemini-session',
                    sessionFilePath: '/tmp/gemini-session.json',
                }),
            ]);
        });

        it('replaces an existing child fallback when transferring its live wrapper name', () => {
            registry.register(makeEntry({
                name: 'managed-gemini',
                type: 'gemini_cli',
                pid: process.ppid,
                tmuxSession: 'managed-gemini',
                startedAt: '2026-05-30T00:00:00.000Z',
                sessionId: `pid-${process.ppid}`,
                sessionFilePath: '',
            }));
            registry.register(makeEntry({
                name: `ai-devkit-${process.pid}`,
                type: 'gemini_cli',
                pid: process.pid,
                tmuxSession: '',
                startedAt: '2026-05-31T00:00:00.000Z',
                sessionId: `pid-${process.pid}`,
                sessionFilePath: '',
            }));

            registry.registerBatch([makeEntry({
                name: 'managed-gemini',
                type: 'gemini_cli',
                pid: process.pid,
                tmuxSession: '',
                startedAt: '2026-06-01T00:00:00.000Z',
                sessionId: 'gemini-session',
                sessionFilePath: '/tmp/gemini-session.json',
            })]);

            expect(registry.list()).toEqual([
                expect.objectContaining({
                    name: 'managed-gemini',
                    type: 'gemini_cli',
                    pid: process.pid,
                    tmuxSession: 'managed-gemini',
                    startedAt: '2026-05-30T00:00:00.000Z',
                    sessionId: 'gemini-session',
                    sessionFilePath: '/tmp/gemini-session.json',
                }),
            ]);
        });

        it('rejects duplicate names introduced within the same batch', () => {
            expect(() => registry.registerBatch([
                makeEntry({ name: 'duplicate', pid: process.pid }),
                makeEntry({ name: 'duplicate', pid: process.ppid }),
            ])).toThrow(/UNIQUE constraint failed: agents\.name/);

            expect(registry.list()).toEqual([]);
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

        it('returns true when the process probe is forbidden with EPERM', () => {
            vi.spyOn(process, 'kill').mockImplementation(() => {
                throw Object.assign(new Error('operation not permitted'), { code: 'EPERM' });
            });

            expect(registry.isAlive(makeEntry())).toBe(true);
        });

        it('returns false when the process probe reports ESRCH', () => {
            vi.spyOn(process, 'kill').mockImplementation(() => {
                throw Object.assign(new Error('no such process'), { code: 'ESRCH' });
            });

            expect(registry.isAlive(makeEntry())).toBe(false);
        });

        it('returns true when the process probe fails without a definitive error code', () => {
            vi.spyOn(process, 'kill').mockImplementation(() => {
                throw new Error('indeterminate probe failure');
            });

            expect(registry.isAlive(makeEntry())).toBe(true);
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

        it('preserves entries when liveness probing fails with EPERM', () => {
            registry.register(makeEntry({ name: 'custom-name', tmuxSession: 'tmux-custom' }));
            vi.spyOn(process, 'kill').mockImplementation(() => {
                throw Object.assign(new Error('operation not permitted'), { code: 'EPERM' });
            });

            registry.prune();

            expect(registry.lookup('custom-name')).toMatchObject({
                name: 'custom-name',
                tmuxSession: 'tmux-custom',
            });
        });

        it('removes entries when liveness probing fails with ESRCH', () => {
            registry.register(makeEntry({ name: 'dead' }));
            vi.spyOn(process, 'kill').mockImplementation(() => {
                throw Object.assign(new Error('no such process'), { code: 'ESRCH' });
            });

            registry.prune();

            expect(registry.lookup('dead')).toBeNull();
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
            registry.register(makeEntry({ name: 'agent-b', pid: process.ppid }));
            expect(() => registry.rename('agent-a', 'agent-b')).toThrow(RenameConflictError);
        });

        it('throws RenameConflictError when the conflicting entry probe fails with EPERM', () => {
            registry.register(makeEntry({ name: 'agent-a', pid: process.pid }));
            registry.register(makeEntry({ name: 'agent-b', pid: process.ppid }));
            vi.spyOn(process, 'kill').mockImplementation(() => {
                throw Object.assign(new Error('operation not permitted'), { code: 'EPERM' });
            });

            expect(() => registry.rename('agent-a', 'agent-b')).toThrow(RenameConflictError);
            expect(registry.lookup('agent-b')?.pid).toBe(process.ppid);
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

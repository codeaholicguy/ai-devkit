import fs from 'fs';
import os from 'os';
import path from 'path';
import { AgentRegistry, type RegistryEntry } from '../../utils/AgentRegistry.js';

function makeEntry(over: Partial<RegistryEntry> = {}): RegistryEntry {
    return {
        name: 'agent1',
        type: 'claude',
        pid: process.pid,
        tmuxSession: 'agent1',
        cwd: '/tmp',
        startedAt: '2026-05-30T00:00:00.000Z',
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
});

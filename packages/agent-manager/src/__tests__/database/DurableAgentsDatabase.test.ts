import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { DatabaseConnection } from '../../database/connection.js';
import { getSchemaVersion } from '../../database/schema.js';

const roots: string[] = [];

afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function dbPath(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'durable-agent-db-'));
    roots.push(root);
    return path.join(root, 'state', 'agents.db');
}

describe('durable agents schema', () => {
    it('keeps the durable-agent schema at version 4 without an interactive identity index', () => {
        const connection = new DatabaseConnection({ dbPath: dbPath() });
        expect(getSchemaVersion(connection)).toBe(4);
        const table = connection.queryOne<{ sql: string }>(
            "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'durable_agents'",
        );
        expect(table?.sql).toContain("DEFAULT 'durable'");
        expect(table?.sql).toContain("state IN ('ready','running','degraded')");
        expect(connection.query<{ name: string }>(
            "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'durable_agents'",
        ).map(({ name }) => name)).toEqual(expect.arrayContaining([
            'idx_durable_agents_state', 'idx_durable_agents_list',
        ]));
        expect(connection.queryOne<{ sql: string }>(
            "SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'idx_agents_identity'",
        )).toBeUndefined();
        connection.close();
    });

    it('upgrades a version 3 database to nullable, unique provider sessions', () => {
        const file = dbPath();
        fs.mkdirSync(path.dirname(file), { recursive: true });
        const raw = new Database(file);
        raw.exec(`
            CREATE TABLE durable_agents (
                id TEXT PRIMARY KEY,
                provider_session_id TEXT NOT NULL UNIQUE
            );
            CREATE TABLE agents (
                type TEXT NOT NULL,
                pid INTEGER NOT NULL,
                session_id TEXT NOT NULL DEFAULT '',
                PRIMARY KEY (type, pid)
            );
            INSERT INTO durable_agents (id, provider_session_id) VALUES ('existing', 'existing-session');
            PRAGMA user_version = 3;
        `);
        raw.close();

        const connection = new DatabaseConnection({ dbPath: file });
        expect(getSchemaVersion(connection)).toBe(4);
        expect(() => connection.execute(
            'INSERT INTO durable_agents (id, provider_session_id) VALUES (?, NULL)', ['codex'],
        )).not.toThrow();
        expect(() => connection.execute(
            'INSERT INTO durable_agents (id, provider_session_id) VALUES (?, ?)', ['duplicate', 'existing-session'],
        )).toThrow(/UNIQUE/i);
        connection.close();
    });

    it('enforces case-insensitive names and active-run consistency but permits new providers', () => {
        const connection = new DatabaseConnection({ dbPath: dbPath() });
        const insert = (name: string, provider: string, state = 'ready') => connection.execute(`
            INSERT INTO durable_agents (
                id, name, provider, mode, cwd, provider_session_id, state, session_health,
                created_at, updated_at
            ) VALUES (?, ?, ?, 'durable', '/tmp', ?, ?, 'uninitialized', ?, ?)
        `, [crypto.randomUUID(), name, provider, crypto.randomUUID(), state, new Date().toISOString(), new Date().toISOString()]);
        expect(() => insert('Alpha', 'future-provider')).not.toThrow();
        expect(() => insert('alpha', 'claude')).toThrow(/UNIQUE/i);
        expect(() => insert('Broken', 'claude', 'running')).toThrow(/CHECK/i);
        connection.close();
    });
});

describe('readonly DatabaseConnection', () => {
    it('opens an already migrated database without changing it', () => {
        const file = dbPath();
        const writable = new DatabaseConnection({ dbPath: file });
        writable.close();
        const before = fs.statSync(file).mtimeMs;
        const readonly = new DatabaseConnection({ dbPath: file, readonly: true });
        expect(readonly.queryOne<{ user_version: number }>('PRAGMA user_version')?.user_version).toBe(4);
        readonly.close();
        expect(fs.statSync(file).mtimeMs).toBe(before);
    });

    it('does not create a missing database or migrate an old one', () => {
        const missing = dbPath();
        expect(() => new DatabaseConnection({ dbPath: missing, readonly: true })).toThrow(/readonly.*exist/i);
        expect(fs.existsSync(missing)).toBe(false);

        fs.mkdirSync(path.dirname(missing), { recursive: true });
        const raw = new Database(missing);
        raw.pragma('user_version = 2');
        raw.close();
        expect(() => new DatabaseConnection({ dbPath: missing, readonly: true })).toThrow(/schema version 3/i);
        expect(new Database(missing, { readonly: true }).pragma('user_version', { simple: true })).toBe(2);
    });
});

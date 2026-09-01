import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DatabaseConnection } from '../../../src/database/connection.js';

const roots: string[] = [];

afterEach(() => {
    vi.restoreAllMocks();
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function dbPath(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-connection-'));
    roots.push(root);
    return path.join(root, 'memory.db');
}

function openInWorker(file: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const worker = new Worker(new URL('./fixtures/connection-worker.ts', import.meta.url), {
            execArgv: ['--loader', 'ts-node/esm'],
            workerData: { dbPath: file },
        });
        worker.once('message', () => resolve());
        worker.once('error', reject);
        worker.once('exit', (code) => {
            if (code !== 0) reject(new Error(`Connection worker exited with code ${code}`));
        });
    });
}

describe('DatabaseConnection configuration', () => {
    it('opens concurrent connections to a fresh shared database without SQLITE_BUSY', async () => {
        const file = dbPath();
        await Promise.all(Array.from({ length: 6 }, () => openInWorker(file)));
    }, 20_000);

    it('skips the WAL mode-set when the database is already in WAL mode', () => {
        const file = dbPath();
        const setup = new Database(file);
        setup.pragma('journal_mode = WAL');
        setup.close();
        const pragma = vi.spyOn(Database.prototype, 'pragma');

        const connection = new DatabaseConnection({ dbPath: file });
        connection.close();

        expect(pragma).not.toHaveBeenCalledWith('journal_mode = WAL');
    });

    it('does not attempt a WAL mode-set for a readonly already-WAL database', () => {
        const file = dbPath();
        const setup = new Database(file);
        setup.pragma('journal_mode = WAL');
        setup.close();
        const pragma = vi.spyOn(Database.prototype, 'pragma');

        const connection = new DatabaseConnection({ dbPath: file, readonly: true });
        connection.close();

        expect(pragma).not.toHaveBeenCalledWith('journal_mode = WAL');
    });
});

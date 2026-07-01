import { readFileSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { DatabaseConnection } from './connection.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function getSchemaVersion(db: DatabaseConnection): number {
    const result = db.instance.pragma('user_version') as { user_version: number }[];
    return result[0]?.user_version ?? 0;
}

function setSchemaVersion(db: DatabaseConnection, version: number): void {
    db.instance.pragma(`user_version = ${version}`);
}

function getMigrationsDir(): string {
    // In production, migrations are in dist/database/migrations
    // In development/testing, they are in src/database/migrations
    return join(__dirname, 'migrations');
}

interface Migration {
    version: number;
    path: string;
    name: string;
}

function getMigrationFiles(): Migration[] {
    const migrationsDir = getMigrationsDir();

    let files: string[];
    try {
        files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
    } catch {
        return [];
    }

    return files.map((file) => {
        const match = file.match(/^(\d+)_(.+)\.sql$/);
        if (!match || !match[1] || !match[2]) {
            throw new Error(`Invalid migration filename: ${file}. Expected format: 001_name.sql`);
        }
        return {
            version: parseInt(match[1], 10),
            name: match[2],
            path: join(migrationsDir, file),
        };
    });
}

/**
 * Run any pending versioned migrations. Idempotent: tracks progress via the
 * `user_version` pragma (mirrors @ai-devkit/memory).
 */
export function initializeSchema(db: DatabaseConnection): void {
    const currentVersion = getSchemaVersion(db);
    const migrations = getMigrationFiles();

    const pendingMigrations = migrations.filter((m) => m.version > currentVersion);

    if (pendingMigrations.length === 0) {
        return;
    }

    for (const migration of pendingMigrations) {
        const sql = readFileSync(migration.path, 'utf-8');

        db.transaction(() => {
            db.instance.exec(sql);
            setSchemaVersion(db, migration.version);
        });
    }
}

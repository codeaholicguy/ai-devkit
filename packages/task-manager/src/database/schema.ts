import { readFileSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { DatabaseConnection } from './connection.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function getSchemaVersion(db: DatabaseConnection): number {
    const result = db.queryOne<{ user_version: number }>('PRAGMA user_version');
    return result?.user_version ?? 0;
}

function setSchemaVersion(db: DatabaseConnection, version: number): void {
    db.execute(`PRAGMA user_version = ${version}`);
}

function getMigrationsDir(): string {
    // In production, migrations are copied to dist/database/migrations by the
    // build script. In development/testing, they live in src/database/migrations.
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
            version: Number.parseInt(match[1], 10),
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
    const pendingMigrations = getMigrationFiles().filter((m) => m.version > currentVersion);

    if (pendingMigrations.length === 0) {
        return;
    }

    for (const migration of pendingMigrations) {
        const sql = readFileSync(migration.path, 'utf8');
        db.transaction(() => {
            db.exec(sql);
            setSchemaVersion(db, migration.version);
        });
    }
}

export function resetSchema(db: DatabaseConnection): void {
    db.transaction(() => {
        db.execute('DROP TABLE IF EXISTS task_events');
        db.execute('DROP TABLE IF EXISTS tasks');
        setSchemaVersion(db, 0);
    });
    initializeSchema(db);
}

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

export function initializeSchema(db: DatabaseConnection): void {
    const currentVersion = getSchemaVersion(db);
    const pendingMigrations = getMigrationFiles().filter((m) => m.version > currentVersion);

    for (const migration of pendingMigrations) {
        const sql = readFileSync(migration.path, 'utf-8');

        db.transaction(() => {
            db.instance.exec(sql);
            setSchemaVersion(db, migration.version);
        });
    }
}

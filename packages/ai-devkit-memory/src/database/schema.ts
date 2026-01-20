import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import type { DatabaseConnection } from './connection';

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
    const distPath = join(__dirname, 'migrations');
    return distPath;
}

function getMigrationFiles(): { version: number; path: string; name: string }[] {
    const migrationsDir = getMigrationsDir();

    let files: string[];
    try {
        files = readdirSync(migrationsDir)
            .filter(f => f.endsWith('.sql'))
            .sort();
    } catch {
        return [];
    }

    return files.map(file => {
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
    const migrations = getMigrationFiles();

    const pendingMigrations = migrations.filter(m => m.version > currentVersion);

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

export function resetSchema(db: DatabaseConnection): void {
    db.transaction(() => {
        db.execute('DROP TABLE IF EXISTS knowledge_fts');
        db.execute('DROP TABLE IF EXISTS knowledge');
        setSchemaVersion(db, 0);
    });

    initializeSchema(db);
}

export function getPendingMigrations(db: DatabaseConnection): string[] {
    const currentVersion = getSchemaVersion(db);
    const migrations = getMigrationFiles();
    return migrations
        .filter(m => m.version > currentVersion)
        .map(m => `${m.version}_${m.name}`);
}

export {
    DatabaseConnection,
    getDatabase,
    closeDatabase,
    resolveDbPath,
    DEFAULT_DB_PATH,
} from './connection.js';
export type { DatabaseOptions } from './connection.js';
export {
    initializeSchema,
    getSchemaVersion,
} from './schema.js';

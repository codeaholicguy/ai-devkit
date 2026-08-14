export {
    DatabaseConnection,
    DEFAULT_AGENT_REGISTRY_DB_PATH,
    resolveAgentRegistryDbPath,
} from './connection.js';
export type { DatabaseOptions } from './connection.js';
export { getSchemaVersion, initializeSchema } from './schema.js';

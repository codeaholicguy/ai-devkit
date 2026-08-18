import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { execFileSync } from 'child_process';
import { DatabaseConnection, resolveAgentRegistryDbPath } from '../database/index.js';
import type { PrintActiveRun, PrintAgent, ProcessIdentity, PrintRunStatus, PrintSessionHealth } from './PrintAgent.js';
import {
    PrintAgentBusyError,
    PrintAgentNameConflictError,
    PrintAgentNotFoundError,
    PrintAgentStoreError,
} from './PrintAgent.js';

interface PrintAgentStoreFile { version: 1; agents: PrintAgent[] }

interface DurableAgentRow {
    id: string; name: string; provider: 'claude'; mode: 'print'; cwd: string; provider_session_id: string;
    state: PrintAgent['state']; session_health: PrintSessionHealth; created_at: string; updated_at: string;
    last_active_at: string | null; last_result_status: PrintRunStatus | null;
    last_result_completed_at: string | null; last_result_exit_code: number | null; last_result_summary: string | null;
    active_run_token: string | null; active_owner_pid: number | null; active_owner_started_at: string | null;
    active_provider_pid: number | null; active_provider_started_at: string | null; active_run_started_at: string | null;
}

export interface CreatePrintAgentInput { name: string; cwd: string }

export interface PrintAgentStoreOptions {
    /** Legacy JSON path retained for one compatibility release and one-time import. */
    filePath?: string;
    dbPath?: string;
    readonly?: boolean;
    /** @deprecated SQLite busy_timeout replaces filesystem lock polling. */
    lockTimeoutMs?: number;
    now?: () => Date;
    processInspector?: ProcessInspector;
    /** @deprecated Active ownership is committed atomically. */
    incompleteLockGraceMs?: number;
    /** @deprecated SQLite transactions replace mutation lock directories. */
    mutationLockStaleMs?: number;
}

export interface ProcessInspector { getIdentity(pid: number): ProcessIdentity | null }
export interface PrintRunCompletion {
    status: PrintRunStatus; exitCode: number | null; summary: string; sessionHealth: PrintSessionHealth;
}

const DEFAULT_FILE = path.join(os.homedir(), '.ai-devkit', 'print-agents.json');
const IMPORT_MARKER = 'legacy_print_agents_json_v1_imported';

export class PrintAgentStore {
    readonly filePath: string;
    readonly dbPath: string;
    private readonly now: () => Date;
    private readonly processInspector: ProcessInspector;
    private readonly readonly: boolean;
    private readonly db: DatabaseConnection;

    constructor(options: PrintAgentStoreOptions = {}) {
        this.filePath = options.filePath ?? (options.dbPath
            ? path.join(path.dirname(options.dbPath), 'print-agents.json')
            : DEFAULT_FILE);
        this.dbPath = options.dbPath ?? resolveAgentRegistryDbPath(
            options.filePath ?? path.join(os.homedir(), '.ai-devkit', 'agents.json'),
        );
        this.now = options.now ?? (() => new Date());
        this.processInspector = options.processInspector ?? new LocalProcessInspector();
        this.readonly = options.readonly ?? false;
        try {
            this.db = new DatabaseConnection({ dbPath: this.dbPath, readonly: this.readonly });
            if (!this.readonly) this.importLegacyJson();
        } catch (error) {
            if (error instanceof PrintAgentStoreError) throw error;
            throw new PrintAgentStoreError(`Cannot open print-agent database: ${(error as Error).message}`);
        }
    }

    async create(input: CreatePrintAgentInput): Promise<PrintAgent> {
        this.assertWritable();
        const cwd = this.canonicalDirectory(input.cwd);
        const timestamp = this.now().toISOString();
        const id = randomUUID();
        let providerSessionId = randomUUID();
        while (providerSessionId === id) providerSessionId = randomUUID();
        try {
            this.db.execute(`INSERT INTO durable_agents (
                id, name, provider, mode, cwd, provider_session_id, state, session_health, created_at, updated_at
            ) VALUES (?, ?, 'claude', 'print', ?, ?, 'ready', 'uninitialized', ?, ?)`,
            [id, input.name, cwd, providerSessionId, timestamp, timestamp]);
        } catch (error) {
            if (/UNIQUE constraint failed: durable_agents\.name/i.test((error as Error).message)) {
                throw new PrintAgentNameConflictError(input.name);
            }
            throw this.storageError('Failed to create print agent', error);
        }
        return this.requireById(id);
    }

    async list(): Promise<PrintAgent[]> {
        if (!this.readonly) await this.reconcile();
        return this.listRaw();
    }

    async getById(id: string): Promise<PrintAgent | null> {
        if (!this.readonly) await this.reconcile();
        return this.findById(id);
    }

    async resolve(reference: string): Promise<PrintAgent | PrintAgent[] | null> {
        const agents = await this.list();
        const byId = agents.find((agent) => agent.id === reference);
        if (byId) return byId;
        const matches = agents.filter((agent) => agent.name.toLowerCase() === reference.toLowerCase());
        return matches.length === 0 ? null : matches.length === 1 ? matches[0]! : matches;
    }

    async acquireRun(id: string): Promise<{ agent: PrintAgent; token: string }> {
        this.assertWritable();
        const snapshot = this.findById(id);
        if (!snapshot) throw new PrintAgentNotFoundError(id);
        this.validateBoundCwd(snapshot.cwd);
        const observed = snapshot.activeRun;
        const observedLive = observed ? this.isActive(observed) : false;
        if (observedLive) throw new PrintAgentBusyError(id, snapshot.name);
        const owner = this.processInspector.getIdentity(process.pid);
        if (!owner) throw new PrintAgentStoreError('Cannot determine the current process identity.');
        const token = randomUUID();
        const startedAt = this.now().toISOString();
        let recovered = false;
        try {
            this.immediate(() => {
                const current = this.findById(id);
                if (!current) throw new PrintAgentNotFoundError(id);
                if (current.state === 'running') {
                    if (!observed || current.activeRun?.token !== observed.token || observedLive) {
                        throw new PrintAgentBusyError(id, current.name);
                    }
                    recovered = true;
                }
                const changed = this.db.execute(`UPDATE durable_agents SET
                    state = 'running', active_run_token = ?, active_owner_pid = ?, active_owner_started_at = ?,
                    active_provider_pid = NULL, active_provider_started_at = NULL, active_run_started_at = ?, updated_at = ?,
                    session_health = CASE WHEN state = 'running' THEN 'unknown' ELSE session_health END,
                    last_result_status = CASE WHEN state = 'running' THEN 'interrupted' ELSE last_result_status END,
                    last_result_completed_at = CASE WHEN state = 'running' THEN ? ELSE last_result_completed_at END,
                    last_result_exit_code = CASE WHEN state = 'running' THEN NULL ELSE last_result_exit_code END,
                    last_result_summary = CASE WHEN state = 'running' THEN 'Previous print run was interrupted.' ELSE last_result_summary END
                    WHERE id = ? AND (state <> 'running' OR (
                        active_run_token = ? AND active_owner_started_at = ? AND active_run_started_at = ?
                    ))
                `, [token, owner.pid, owner.startedAt, startedAt, startedAt, startedAt, id,
                    observed?.token ?? null, observed?.owner.startedAt ?? null, observed?.startedAt ?? null]);
                if (changed.changes !== 1) throw new PrintAgentBusyError(id, current.name);
            });
        } catch (error) {
            if (error instanceof PrintAgentBusyError || error instanceof PrintAgentNotFoundError) throw error;
            if (/busy|locked/i.test((error as Error).message)) throw new PrintAgentBusyError(id, snapshot.name);
            throw this.storageError('Failed to acquire print-agent run', error);
        }
        const agent = this.requireById(id);
        if (recovered && agent.lastResult?.status !== 'interrupted') {
            throw new PrintAgentStoreError('Failed to record interrupted print run.');
        }
        return { agent, token };
    }

    async recordProviderProcess(id: string, token: string, identity: ProcessIdentity): Promise<void> {
        this.assertWritable();
        const changed = this.db.execute(`UPDATE durable_agents SET
            active_provider_pid = ?, active_provider_started_at = ?, updated_at = ?
            WHERE id = ? AND state = 'running' AND active_run_token = ?`,
        [identity.pid, identity.startedAt, this.now().toISOString(), id, token]);
        if (changed.changes !== 1) throw new PrintAgentStoreError('Print run ownership changed.');
    }

    async completeRun(id: string, token: string, result: PrintRunCompletion): Promise<PrintAgent> {
        this.assertWritable();
        const completedAt = this.now().toISOString();
        const changed = this.db.execute(`UPDATE durable_agents SET
            state = ?, session_health = ?, active_run_token = NULL, active_owner_pid = NULL,
            active_owner_started_at = NULL, active_provider_pid = NULL, active_provider_started_at = NULL,
            active_run_started_at = NULL, last_active_at = ?, updated_at = ?, last_result_status = ?,
            last_result_completed_at = ?, last_result_exit_code = ?, last_result_summary = ?
            WHERE id = ? AND state = 'running' AND active_run_token = ?`, [
            result.status === 'succeeded' ? 'ready' : 'degraded', result.sessionHealth, completedAt, completedAt,
            result.status, completedAt, result.exitCode, result.summary.slice(0, 4096), id, token,
        ]);
        if (changed.changes !== 1) throw new PrintAgentStoreError('Print run ownership changed.');
        return this.requireById(id);
    }

    async reconcile(): Promise<void> {
        this.assertWritable();
        const running = this.listRaw().filter((agent) => agent.state === 'running' && agent.activeRun);
        for (const snapshot of running) {
            if (this.isActive(snapshot.activeRun!)) continue;
            const completedAt = this.now().toISOString();
            this.db.execute(`UPDATE durable_agents SET
                state = 'degraded', session_health = 'unknown', active_run_token = NULL,
                active_owner_pid = NULL, active_owner_started_at = NULL, active_provider_pid = NULL,
                active_provider_started_at = NULL, active_run_started_at = NULL, updated_at = ?, last_active_at = ?,
                last_result_status = 'interrupted', last_result_completed_at = ?, last_result_exit_code = NULL,
                last_result_summary = 'Previous print run was interrupted.'
                WHERE id = ? AND state = 'running' AND active_run_token = ?
                    AND active_owner_started_at = ? AND active_run_started_at = ?`, [
                completedAt, completedAt, completedAt, snapshot.id, snapshot.activeRun!.token,
                snapshot.activeRun!.owner.startedAt, snapshot.activeRun!.startedAt,
            ]);
        }
    }

    private importLegacyJson(): void {
        if (!fs.existsSync(this.filePath)) return;
        this.assertNotSymlink(this.filePath);
        const marked = this.db.queryOne('SELECT value FROM durable_agent_metadata WHERE key = ?', [IMPORT_MARKER]);
        if (marked) return;
        let data: PrintAgentStoreFile;
        try {
            const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as unknown;
            if (!this.isStoreFile(parsed) || !parsed.agents.every((agent) => this.isAgent(agent))) throw new Error('invalid schema');
            data = parsed;
        } catch {
            throw new PrintAgentStoreError(`Invalid print-agent store: ${this.filePath}`);
        }
        try {
            this.immediate(() => {
                for (const agent of data.agents) this.insertAgent(agent);
                this.db.execute('INSERT INTO durable_agent_metadata (key, value) VALUES (?, ?)',
                    [IMPORT_MARKER, this.now().toISOString()]);
            });
        } catch (error) {
            throw this.storageError(`Invalid print-agent store: ${this.filePath}`, error);
        }
        try {
            fs.renameSync(this.filePath, `${this.filePath}.migrated-v1.bak`);
        } catch (error) {
            throw this.storageError('Imported print agents but could not preserve the legacy backup', error);
        }
    }

    private insertAgent(agent: PrintAgent): void {
        this.db.execute(`INSERT INTO durable_agents (
            id, name, provider, mode, cwd, provider_session_id, state, session_health, created_at, updated_at,
            last_active_at, last_result_status, last_result_completed_at, last_result_exit_code, last_result_summary,
            active_run_token, active_owner_pid, active_owner_started_at, active_provider_pid,
            active_provider_started_at, active_run_started_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
            agent.id, agent.name, agent.provider, agent.mode, agent.cwd, agent.providerSessionId,
            agent.state, agent.sessionHealth, agent.createdAt, agent.updatedAt, agent.lastActiveAt,
            agent.lastResult?.status ?? null, agent.lastResult?.completedAt ?? null,
            agent.lastResult?.exitCode ?? null, agent.lastResult?.summary.slice(0, 4096) ?? null,
            agent.activeRun?.token ?? null, agent.activeRun?.owner.pid ?? null,
            agent.activeRun?.owner.startedAt ?? null, agent.activeRun?.provider?.pid ?? null,
            agent.activeRun?.provider?.startedAt ?? null, agent.activeRun?.startedAt ?? null,
        ]);
    }

    private immediate<T>(operation: () => T): T {
        this.db.instance.exec('BEGIN IMMEDIATE');
        try {
            const result = operation();
            this.db.instance.exec('COMMIT');
            return result;
        } catch (error) {
            try { this.db.instance.exec('ROLLBACK'); } catch { /* retain original failure */ }
            throw error;
        }
    }

    private listRaw(): PrintAgent[] {
        try {
            return this.db.query<DurableAgentRow>(
                'SELECT * FROM durable_agents ORDER BY updated_at DESC, name COLLATE NOCASE',
            ).map((row) => this.fromRow(row));
        } catch (error) {
            throw this.storageError('Failed to read print-agent database', error);
        }
    }

    private findById(id: string): PrintAgent | null {
        const row = this.db.queryOne<DurableAgentRow>('SELECT * FROM durable_agents WHERE id = ?', [id]);
        return row ? this.fromRow(row) : null;
    }

    private requireById(id: string): PrintAgent {
        const agent = this.findById(id);
        if (!agent) throw new PrintAgentNotFoundError(id);
        return agent;
    }

    private fromRow(row: DurableAgentRow): PrintAgent {
        const activeRun: PrintActiveRun | null = row.active_run_token === null ? null : {
            token: row.active_run_token,
            owner: { pid: row.active_owner_pid!, startedAt: row.active_owner_started_at! },
            provider: row.active_provider_pid === null ? null : {
                pid: row.active_provider_pid, startedAt: row.active_provider_started_at!,
            },
            startedAt: row.active_run_started_at!,
        };
        return {
            id: row.id, name: row.name, provider: row.provider, mode: row.mode, cwd: row.cwd,
            providerSessionId: row.provider_session_id, state: row.state, sessionHealth: row.session_health,
            createdAt: row.created_at, updatedAt: row.updated_at, lastActiveAt: row.last_active_at,
            lastResult: row.last_result_status === null ? null : {
                status: row.last_result_status, completedAt: row.last_result_completed_at!,
                exitCode: row.last_result_exit_code, summary: row.last_result_summary ?? '',
            },
            activeRun,
        };
    }

    private isStoreFile(value: unknown): value is PrintAgentStoreFile {
        if (!value || typeof value !== 'object') return false;
        const record = value as Record<string, unknown>;
        return record.version === 1 && Array.isArray(record.agents);
    }

    private isAgent(value: unknown): value is PrintAgent {
        if (!value || typeof value !== 'object') return false;
        const agent = value as Partial<PrintAgent>;
        const states = ['ready', 'running', 'degraded'];
        const health = ['uninitialized', 'healthy', 'unknown', 'mismatch'];
        return typeof agent.id === 'string' && typeof agent.name === 'string' && agent.provider === 'claude'
            && agent.mode === 'print' && typeof agent.cwd === 'string' && typeof agent.providerSessionId === 'string'
            && states.includes(agent.state ?? '') && health.includes(agent.sessionHealth ?? '')
            && typeof agent.createdAt === 'string' && typeof agent.updatedAt === 'string'
            && (agent.lastActiveAt === null || typeof agent.lastActiveAt === 'string')
            && this.isCanonicalDirectory(agent.cwd)
            && (agent.state === 'running') === (agent.activeRun !== null && agent.activeRun !== undefined)
            && this.validResult(agent.lastResult) && this.validActiveRun(agent.activeRun);
    }

    private validResult(value: PrintAgent['lastResult'] | undefined): boolean {
        return value === null || (!!value && ['succeeded', 'failed', 'interrupted'].includes(value.status)
            && typeof value.completedAt === 'string' && (value.exitCode === null || Number.isInteger(value.exitCode))
            && typeof value.summary === 'string');
    }

    private validActiveRun(value: PrintAgent['activeRun'] | undefined): boolean {
        return value === null || (!!value && typeof value.token === 'string' && typeof value.startedAt === 'string'
            && this.validIdentity(value.owner) && (value.provider === null || this.validIdentity(value.provider)));
    }

    private validIdentity(value: ProcessIdentity | undefined): boolean {
        return !!value && Number.isInteger(value.pid) && value.pid > 0 && typeof value.startedAt === 'string';
    }

    private canonicalDirectory(input: string): string {
        try {
            const resolved = fs.realpathSync(input);
            if (!fs.statSync(resolved).isDirectory()) throw new Error('not a directory');
            return resolved;
        } catch {
            throw new PrintAgentStoreError(`Print agent cwd is not an existing directory: ${input}`);
        }
    }

    private isCanonicalDirectory(input: string): boolean {
        try {
            const stat = fs.lstatSync(input);
            return stat.isDirectory() && !stat.isSymbolicLink() && fs.realpathSync(input) === input;
        } catch {
            return false;
        }
    }

    private validateBoundCwd(bound: string): void {
        try {
            const stat = fs.lstatSync(bound);
            if (!stat.isDirectory() || stat.isSymbolicLink() || fs.realpathSync(bound) !== bound) throw new Error('binding changed');
        } catch {
            throw new PrintAgentStoreError(`Print agent cwd binding is no longer safe: ${bound}`);
        }
    }

    private assertNotSymlink(target: string): void {
        try {
            if (fs.lstatSync(target).isSymbolicLink()) {
                throw new PrintAgentStoreError(`Unsafe symbolic link in print-agent storage: ${target}`);
            }
        } catch (error) {
            if (error instanceof PrintAgentStoreError) throw error;
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                throw new PrintAgentStoreError(`Cannot inspect print-agent storage: ${target}`);
            }
        }
    }

    private isActive(metadata: PrintActiveRun): boolean {
        return this.sameProcess(metadata.owner) || (metadata.provider !== null && this.sameProcess(metadata.provider));
    }

    private sameProcess(expected: ProcessIdentity): boolean {
        const actual = this.processInspector.getIdentity(expected.pid);
        return actual !== null && actual.startedAt === expected.startedAt;
    }

    private assertWritable(): void {
        if (this.readonly) throw new PrintAgentStoreError('Print-agent store is readonly.');
    }

    private storageError(prefix: string, error: unknown): PrintAgentStoreError {
        return error instanceof PrintAgentStoreError ? error
            : new PrintAgentStoreError(`${prefix}: ${(error as Error).message}`);
    }
}

export class LocalProcessInspector implements ProcessInspector {
    getIdentity(pid: number): ProcessIdentity | null {
        if (!Number.isInteger(pid) || pid <= 0) return null;
        try {
            if (process.platform === 'linux') {
                const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
                const close = stat.lastIndexOf(')');
                const fields = stat.slice(close + 2).split(' ');
                const startTicks = fields[19];
                return startTicks ? { pid, startedAt: `linux:${startTicks}` } : null;
            }
            const startedAt = execFileSync('ps', ['-o', 'lstart=', '-p', String(pid)], {
                encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
            }).trim();
            return startedAt ? { pid, startedAt } : null;
        } catch {
            return null;
        }
    }
}

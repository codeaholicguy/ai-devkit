import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { execFileSync } from 'child_process';
import type { PrintAgent, ProcessIdentity, PrintRunStatus, PrintSessionHealth } from './PrintAgent.js';
import {
    PrintAgentBusyError,
    PrintAgentNameConflictError,
    PrintAgentNotFoundError,
    PrintAgentStoreError,
} from './PrintAgent.js';

interface PrintAgentStoreFile {
    version: 1;
    agents: PrintAgent[];
}

export interface CreatePrintAgentInput {
    name: string;
    cwd: string;
}

export interface PrintAgentStoreOptions {
    filePath?: string;
    lockTimeoutMs?: number;
    now?: () => Date;
    processInspector?: ProcessInspector;
    incompleteLockGraceMs?: number;
    mutationLockStaleMs?: number;
}

export interface ProcessInspector {
    getIdentity(pid: number): ProcessIdentity | null;
}

export interface PrintRunCompletion {
    status: PrintRunStatus;
    exitCode: number | null;
    summary: string;
    sessionHealth: PrintSessionHealth;
}

const DEFAULT_FILE = path.join(os.homedir(), '.ai-devkit', 'print-agents.json');

export class PrintAgentStore {
    readonly filePath: string;
    private readonly lockPath: string;
    private readonly lockTimeoutMs: number;
    private readonly now: () => Date;
    private readonly processInspector: ProcessInspector;
    private readonly runLocksRoot: string;
    private readonly incompleteLockGraceMs: number;
    private readonly mutationLockStaleMs: number;

    constructor(options: PrintAgentStoreOptions = {}) {
        this.filePath = options.filePath ?? DEFAULT_FILE;
        this.lockPath = `${this.filePath}.lock`;
        this.lockTimeoutMs = options.lockTimeoutMs ?? 2000;
        this.now = options.now ?? (() => new Date());
        this.processInspector = options.processInspector ?? new LocalProcessInspector();
        this.runLocksRoot = path.join(path.dirname(this.filePath), 'print-agent-locks');
        this.incompleteLockGraceMs = options.incompleteLockGraceMs ?? 30_000;
        this.mutationLockStaleMs = options.mutationLockStaleMs ?? 30_000;
    }

    async create(input: CreatePrintAgentInput): Promise<PrintAgent> {
        const cwd = this.canonicalDirectory(input.cwd);
        return this.withMutationLock(async () => {
            const data = this.readFile();
            if (data.agents.some((agent) => agent.name.toLowerCase() === input.name.toLowerCase())) {
                throw new PrintAgentNameConflictError(input.name);
            }
            const timestamp = this.now().toISOString();
            let id = randomUUID();
            let providerSessionId = randomUUID();
            while (providerSessionId === id) providerSessionId = randomUUID();
            while (data.agents.some((agent) => agent.id === id)) id = randomUUID();
            const agent: PrintAgent = {
                id,
                name: input.name,
                provider: 'claude',
                mode: 'print',
                cwd,
                providerSessionId,
                state: 'ready',
                sessionHealth: 'uninitialized',
                createdAt: timestamp,
                updatedAt: timestamp,
                lastActiveAt: null,
                lastResult: null,
                activeRun: null,
            };
            data.agents.push(agent);
            this.writeFile(data);
            return structuredClone(agent);
        });
    }

    async list(): Promise<PrintAgent[]> {
        await this.reconcile();
        return this.listRaw();
    }

    async getById(id: string): Promise<PrintAgent | null> {
        return (await this.list()).find((agent) => agent.id === id) ?? null;
    }

    async reconcile(): Promise<void> {
        const running = this.listRaw().filter((agent) => agent.state === 'running' && agent.activeRun);
        for (const snapshot of running) {
            const lockPath = this.runLockPath(snapshot.id);
            const metadata = this.readRunLock(snapshot.id);
            if (metadata && this.isActive(metadata)) continue;
            if (!metadata && this.isYoungLock(lockPath)) continue;

            if (fs.existsSync(lockPath)) {
                const quarantine = `${lockPath}.stale-${randomUUID()}`;
                try {
                    fs.renameSync(lockPath, quarantine);
                    this.removeLockDirectory(quarantine);
                } catch {
                    continue;
                }
            }
            const completedAt = this.now().toISOString();
            await this.updateAgent(snapshot.id, (current) => {
                if (current.state !== 'running' || current.activeRun?.token !== snapshot.activeRun?.token) return current;
                return {
                    ...current,
                    state: 'degraded',
                    sessionHealth: 'unknown',
                    activeRun: null,
                    updatedAt: completedAt,
                    lastActiveAt: completedAt,
                    lastResult: {
                        status: 'interrupted',
                        completedAt,
                        exitCode: null,
                        summary: 'Previous print run was interrupted.',
                    },
                };
            });
        }
    }

    async resolve(reference: string): Promise<PrintAgent | PrintAgent[] | null> {
        const agents = await this.list();
        const byId = agents.find((agent) => agent.id === reference);
        if (byId) return byId;
        const matches = agents.filter((agent) => agent.name.toLowerCase() === reference.toLowerCase());
        if (matches.length === 0) return null;
        return matches.length === 1 ? matches[0]! : matches;
    }

    async acquireRun(id: string): Promise<{ agent: PrintAgent; token: string }> {
        const existing = await this.getById(id);
        if (!existing) throw new PrintAgentNotFoundError(id);
        this.validateBoundCwd(existing.cwd);
        const runLock = this.runLockPath(id);
        let recoveredStale = false;

        for (;;) {
            this.ensureRunLocksRoot();
            this.assertNotSymlink(runLock);
            try {
                fs.mkdirSync(runLock, { mode: 0o700 });
                break;
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
                    throw new PrintAgentStoreError(`Cannot acquire print-agent run lock: ${(error as Error).message}`);
                }
                const metadata = this.readRunLock(id);
                if (!metadata || this.isActive(metadata)) {
                    throw new PrintAgentBusyError(id, existing.name);
                }
                const quarantine = `${runLock}.stale-${randomUUID()}`;
                try {
                    fs.renameSync(runLock, quarantine);
                    this.removeLockDirectory(quarantine);
                    recoveredStale = true;
                } catch {
                    // Another contender changed the lock. Retry and inspect the winner.
                }
            }
        }

        const owner = this.processInspector.getIdentity(process.pid);
        if (!owner) {
            this.removeLockDirectory(runLock);
            throw new PrintAgentStoreError('Cannot determine the current process identity.');
        }
        const token = randomUUID();
        const startedAt = this.now().toISOString();
        const activeRun = { token, owner, provider: null, startedAt };
        this.writeRunLock(id, activeRun);

        try {
            const agent = await this.updateAgent(id, (current) => ({
                ...current,
                state: 'running',
                activeRun,
                updatedAt: startedAt,
                ...(recoveredStale ? {
                    sessionHealth: 'unknown' as const,
                    lastResult: {
                        status: 'interrupted' as const,
                        completedAt: startedAt,
                        exitCode: null,
                        summary: 'Previous print run was interrupted.',
                    },
                } : {}),
            }));
            return { agent, token };
        } catch (error) {
            this.removeOwnedRunLock(id, token);
            throw error;
        }
    }

    async recordProviderProcess(id: string, token: string, identity: ProcessIdentity): Promise<void> {
        const metadata = this.requireOwnedRun(id, token);
        const next = { ...metadata, provider: identity };
        this.writeRunLock(id, next);
        await this.updateAgent(id, (agent) => {
            if (agent.activeRun?.token !== token) throw new PrintAgentStoreError('Print run ownership changed.');
            return { ...agent, activeRun: next, updatedAt: this.now().toISOString() };
        });
    }

    async completeRun(id: string, token: string, result: PrintRunCompletion): Promise<PrintAgent> {
        this.requireOwnedRun(id, token);
        const completedAt = this.now().toISOString();
        const agent = await this.updateAgent(id, (current) => {
            if (current.activeRun?.token !== token) throw new PrintAgentStoreError('Print run ownership changed.');
            return {
                ...current,
                state: result.status === 'succeeded' ? 'ready' : 'degraded',
                sessionHealth: result.sessionHealth,
                activeRun: null,
                lastActiveAt: completedAt,
                updatedAt: completedAt,
                lastResult: {
                    status: result.status,
                    completedAt,
                    exitCode: result.exitCode,
                    summary: result.summary.slice(0, 4096),
                },
            };
        });
        this.removeOwnedRunLock(id, token);
        return agent;
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

    private validateBoundCwd(bound: string): void {
        try {
            const stat = fs.lstatSync(bound);
            if (!stat.isDirectory() || stat.isSymbolicLink() || fs.realpathSync(bound) !== bound) {
                throw new Error('binding changed');
            }
        } catch {
            throw new PrintAgentStoreError(`Print agent cwd binding is no longer safe: ${bound}`);
        }
    }

    private ensureSafeParent(): string {
        const parent = path.dirname(this.filePath);
        fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
        const stat = fs.lstatSync(parent);
        if (!stat.isDirectory() || stat.isSymbolicLink()) {
            throw new PrintAgentStoreError(`Unsafe print-agent store directory: ${parent}`);
        }
        return parent;
    }

    private ensureRunLocksRoot(): void {
        this.ensureSafeParent();
        fs.mkdirSync(this.runLocksRoot, { recursive: true, mode: 0o700 });
        const stat = fs.lstatSync(this.runLocksRoot);
        if (!stat.isDirectory() || stat.isSymbolicLink()) {
            throw new PrintAgentStoreError(`Unsafe print-agent lock directory: ${this.runLocksRoot}`);
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

    private readFile(): PrintAgentStoreFile {
        this.ensureSafeParent();
        this.assertNotSymlink(this.filePath);
        if (!fs.existsSync(this.filePath)) return { version: 1, agents: [] };
        try {
            const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as unknown;
            if (!this.isStoreFile(parsed)) throw new Error('invalid schema');
            return parsed;
        } catch {
            throw new PrintAgentStoreError(`Invalid print-agent store: ${this.filePath}`);
        }
    }

    private listRaw(): PrintAgent[] {
        return this.readFile().agents.map((agent) => structuredClone(agent));
    }

    private isStoreFile(value: unknown): value is PrintAgentStoreFile {
        if (!value || typeof value !== 'object') return false;
        const record = value as Record<string, unknown>;
        return record.version === 1 && Array.isArray(record.agents);
    }

    private writeFile(data: PrintAgentStoreFile): void {
        const parent = this.ensureSafeParent();
        this.assertNotSymlink(this.filePath);
        const temp = path.join(parent, `.print-agents-${process.pid}-${randomUUID()}.tmp`);
        this.assertNotSymlink(temp);
        let fd: number | undefined;
        try {
            fd = fs.openSync(temp, 'wx', 0o600);
            fs.writeFileSync(fd, JSON.stringify(data, null, 2), 'utf8');
            fs.fsyncSync(fd);
            fs.closeSync(fd);
            fd = undefined;
            fs.renameSync(temp, this.filePath);
            fs.chmodSync(this.filePath, 0o600);
        } catch (error) {
            if (fd !== undefined) fs.closeSync(fd);
            try { fs.unlinkSync(temp); } catch { /* best effort */ }
            if (error instanceof PrintAgentStoreError) throw error;
            throw new PrintAgentStoreError(`Failed to update print-agent store: ${(error as Error).message}`);
        }
    }

    private async withMutationLock<T>(operation: () => Promise<T>): Promise<T> {
        this.ensureSafeParent();
        const started = Date.now();
        for (;;) {
            this.assertNotSymlink(this.lockPath);
            try {
                fs.mkdirSync(this.lockPath, { mode: 0o700 });
                break;
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
                    throw new PrintAgentStoreError(`Cannot acquire print-agent store lock: ${(error as Error).message}`);
                }
                if (!this.isYoungMutationLock()) {
                    const quarantine = `${this.lockPath}.stale-${randomUUID()}`;
                    try {
                        fs.renameSync(this.lockPath, quarantine);
                        fs.rmdirSync(quarantine);
                        continue;
                    } catch {
                        // Another contender changed the lock. Retry until the bounded timeout.
                    }
                }
                if (Date.now() - started >= this.lockTimeoutMs) {
                    throw new PrintAgentStoreError('Timed out acquiring print-agent store lock.');
                }
                await new Promise((resolve) => setTimeout(resolve, 10));
            }
        }
        try {
            return await operation();
        } finally {
            try { fs.rmdirSync(this.lockPath); } catch { /* surfaced by later contention */ }
        }
    }

    private isYoungMutationLock(): boolean {
        try {
            this.assertNotSymlink(this.lockPath);
            const stat = fs.statSync(this.lockPath);
            return stat.isDirectory() && Date.now() - stat.mtimeMs < this.mutationLockStaleMs;
        } catch {
            return false;
        }
    }

    private async updateAgent(id: string, update: (agent: PrintAgent) => PrintAgent): Promise<PrintAgent> {
        return this.withMutationLock(async () => {
            const data = this.readFile();
            const index = data.agents.findIndex((agent) => agent.id === id);
            if (index < 0) throw new PrintAgentNotFoundError(id);
            const next = update(data.agents[index]!);
            data.agents[index] = next;
            this.writeFile(data);
            return structuredClone(next);
        });
    }

    private runLockPath(id: string): string {
        if (!/^[0-9a-f-]{36}$/i.test(id)) throw new PrintAgentStoreError('Invalid print-agent id.');
        return path.join(this.runLocksRoot, `${id}.lock`);
    }

    private readRunLock(id: string): import('./PrintAgent.js').PrintActiveRun | null {
        const ownerPath = path.join(this.runLockPath(id), 'owner.json');
        try {
            this.assertNotSymlink(ownerPath);
            const value = JSON.parse(fs.readFileSync(ownerPath, 'utf8')) as import('./PrintAgent.js').PrintActiveRun;
            if (!value || typeof value.token !== 'string' || !value.owner || typeof value.owner.pid !== 'number') return null;
            return value;
        } catch {
            return null;
        }
    }

    private writeRunLock(id: string, metadata: import('./PrintAgent.js').PrintActiveRun): void {
        const lockPath = this.runLockPath(id);
        const ownerPath = path.join(lockPath, 'owner.json');
        const tempPath = path.join(lockPath, `.owner-${randomUUID()}.tmp`);
        this.assertNotSymlink(lockPath);
        this.assertNotSymlink(ownerPath);
        fs.writeFileSync(tempPath, JSON.stringify(metadata), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
        fs.renameSync(tempPath, ownerPath);
    }

    private requireOwnedRun(id: string, token: string): import('./PrintAgent.js').PrintActiveRun {
        const metadata = this.readRunLock(id);
        if (!metadata || metadata.token !== token) throw new PrintAgentStoreError('Print run ownership changed.');
        return metadata;
    }

    private isActive(metadata: import('./PrintAgent.js').PrintActiveRun): boolean {
        return this.sameProcess(metadata.owner) || (metadata.provider !== null && this.sameProcess(metadata.provider));
    }

    private sameProcess(expected: ProcessIdentity): boolean {
        const actual = this.processInspector.getIdentity(expected.pid);
        return actual !== null && actual.startedAt === expected.startedAt;
    }

    private isYoungLock(lockPath: string): boolean {
        try {
            this.assertNotSymlink(lockPath);
            return Date.now() - fs.statSync(lockPath).mtimeMs < this.incompleteLockGraceMs;
        } catch {
            return false;
        }
    }

    private removeOwnedRunLock(id: string, token: string): void {
        const metadata = this.readRunLock(id);
        if (!metadata || metadata.token !== token) return;
        this.removeLockDirectory(this.runLockPath(id));
    }

    private removeLockDirectory(lockPath: string): void {
        this.assertNotSymlink(lockPath);
        try {
            for (const name of fs.readdirSync(lockPath)) {
                const entry = path.join(lockPath, name);
                this.assertNotSymlink(entry);
                if (!fs.lstatSync(entry).isFile()) throw new PrintAgentStoreError(`Unsafe entry in print-agent lock: ${entry}`);
                fs.unlinkSync(entry);
            }
            fs.rmdirSync(lockPath);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
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
                if (!startTicks) return null;
                return { pid, startedAt: `linux:${startTicks}` };
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

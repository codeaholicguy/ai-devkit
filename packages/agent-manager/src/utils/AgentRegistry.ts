import fs from 'fs';
import os from 'os';
import path from 'path';
import type { AgentType } from '../adapters/AgentAdapter.js';

export class RenameNotFoundError extends Error {
    constructor(public agentName: string) {
        super(`Agent "${agentName}" not found in registry.`);
        this.name = 'RenameNotFoundError';
    }
}

export class RenameConflictError extends Error {
    constructor(public agentName: string) {
        super(`Agent "${agentName}" is already in use.`);
        this.name = 'RenameConflictError';
    }
}

export interface RegistryEntry {
    name: string;
    type: AgentType;
    pid: number;
    tmuxSession: string;
    cwd: string;
    startedAt: string;  // ISO 8601
    sessionId: string;
    sessionFilePath: string;
}

interface RegistryFile {
    entries: RegistryEntry[];
}

const DEFAULT_REGISTRY_PATH = path.join(os.homedir(), '.ai-devkit', 'agents.json');

let defaultInstance: AgentRegistry | null = null;

export class AgentRegistry {
    private filePath: string;

    constructor(filePath: string = DEFAULT_REGISTRY_PATH) {
        this.filePath = filePath;
    }

    static default(): AgentRegistry {
        if (!defaultInstance) {
            defaultInstance = new AgentRegistry();
        }
        return defaultInstance;
    }

    private readFile(): RegistryFile {
        try {
            const raw = fs.readFileSync(this.filePath, 'utf8');
            const parsed = JSON.parse(raw) as RegistryFile;
            return { entries: Array.isArray(parsed.entries) ? parsed.entries : [] };
        } catch {
            return { entries: [] };
        }
    }

    private writeFile(data: RegistryFile): void {
        const dir = path.dirname(this.filePath);
        fs.mkdirSync(dir, { recursive: true });
        const tmp = `${this.filePath}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
        fs.renameSync(tmp, this.filePath);
    }

    private mergeEntry(incoming: RegistryEntry, existing: RegistryEntry | undefined): RegistryEntry {
        if (!existing) return incoming;
        return {
            ...incoming,
            tmuxSession: incoming.tmuxSession || existing.tmuxSession,
        };
    }

    isAlive(entry: RegistryEntry): boolean {
        try {
            process.kill(entry.pid, 0);
            return true;
        } catch {
            return false;
        }
    }

    prune(): void {
        const data = this.readFile();
        const live = data.entries.filter((e) => this.isAlive(e));
        if (live.length !== data.entries.length) {
            this.writeFile({ entries: live });
        }
    }

    register(entry: RegistryEntry): void {
        this.registerBatch([entry]);
    }

    registerBatch(entries: RegistryEntry[]): void {
        if (entries.length === 0) return;
        const data = this.readFile();
        for (const incoming of entries) {
            const idx = data.entries.findIndex((e) => e.name === incoming.name);
            if (idx >= 0) {
                data.entries[idx] = this.mergeEntry(incoming, data.entries[idx]);
            } else {
                data.entries.push(incoming);
            }
        }
        this.writeFile(data);
    }

    rename(currentName: string, newName: string): void {
        const data = this.readFile();
        const idx = data.entries.findIndex((e) => e.name === currentName);
        if (idx < 0) {
            throw new RenameNotFoundError(currentName);
        }
        const liveEntries = data.entries.filter((e) => this.isAlive(e));
        const conflict = liveEntries.find((e) => e.name === newName);
        if (conflict) {
            throw new RenameConflictError(newName);
        }
        const pruned = liveEntries.map((e) =>
            e.name === currentName ? { ...e, name: newName } : e,
        );
        this.writeFile({ entries: pruned });
    }

    lookup(name: string): RegistryEntry | null {
        const data = this.readFile();
        return data.entries.find((e) => e.name === name) ?? null;
    }

    list(): RegistryEntry[] {
        return this.readFile().entries;
    }
}

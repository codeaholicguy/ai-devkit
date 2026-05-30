import fs from 'fs';
import os from 'os';
import path from 'path';
import type { AgentType } from '../adapters/AgentAdapter.js';

export interface RegistryEntry {
    name: string;
    type: AgentType;
    pid: number;
    tmuxSession: string;
    cwd: string;
    startedAt: string;  // ISO 8601
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
        const data = this.readFile();
        const idx = data.entries.findIndex((e) => e.name === entry.name);
        if (idx >= 0) {
            data.entries[idx] = entry;
        } else {
            data.entries.push(entry);
        }
        this.writeFile(data);
    }

    lookup(name: string): RegistryEntry | null {
        const data = this.readFile();
        return data.entries.find((e) => e.name === name) ?? null;
    }

    list(): RegistryEntry[] {
        return this.readFile().entries;
    }
}

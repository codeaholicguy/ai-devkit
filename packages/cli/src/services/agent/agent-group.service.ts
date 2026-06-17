import fs from 'fs';
import os from 'os';
import path from 'path';

export interface AgentGroup {
    name: string;
    members: string[];
    createdAt: string;
    updatedAt: string;
}

interface AgentGroupFile {
    version: 1;
    groups: AgentGroup[];
}

const DEFAULT_GROUPS_PATH = path.join(os.homedir(), '.ai-devkit', 'agent-groups.json');
const GROUP_NAME_REGEX = /^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$/;

let defaultInstance: AgentGroupService | null = null;

export class AgentGroupNotFoundError extends Error {
    constructor(public groupName: string) {
        super(`Agent group "${groupName}" not found.`);
        this.name = 'AgentGroupNotFoundError';
    }
}

export class AgentGroupConflictError extends Error {
    constructor(public groupName: string) {
        super(`Agent group "${groupName}" already exists.`);
        this.name = 'AgentGroupConflictError';
    }
}

export class AgentGroupInvalidNameError extends Error {
    constructor(public groupName: string) {
        super(`Invalid agent group name "${groupName}".`);
        this.name = 'AgentGroupInvalidNameError';
    }
}

export class AgentGroupInvalidMemberError extends Error {
    constructor(public member: string, message?: string) {
        super(message ?? `Invalid agent group member "${member}".`);
        this.name = 'AgentGroupInvalidMemberError';
    }
}

export class AgentGroupEmptyMembersError extends Error {
    constructor() {
        super('Agent group must contain at least one member.');
        this.name = 'AgentGroupEmptyMembersError';
    }
}

export class AgentGroupStorageError extends Error {
    constructor(public filePath: string, message: string) {
        super(`Failed to read agent groups from "${filePath}": ${message}`);
        this.name = 'AgentGroupStorageError';
    }
}

export class AgentGroupService {
    constructor(private filePath: string = DEFAULT_GROUPS_PATH) {}

    list(): AgentGroup[] {
        return this.readFile().groups;
    }

    get(name: string): AgentGroup | undefined {
        const validName = this.validateName(name);
        return this.readFile().groups.find((group) => group.name === validName);
    }

    create(name: string, members: string[]): AgentGroup {
        const validName = this.validateName(name);
        const validMembers = this.normalizeMembers(members);
        const data = this.readFile();
        if (data.groups.some((group) => group.name === validName)) {
            throw new AgentGroupConflictError(validName);
        }

        const now = new Date().toISOString();
        const group: AgentGroup = {
            name: validName,
            members: validMembers,
            createdAt: now,
            updatedAt: now,
        };
        this.writeFile({ version: 1, groups: [...data.groups, group] });
        return group;
    }

    update(name: string, members: string[]): AgentGroup {
        const validName = this.validateName(name);
        const validMembers = this.normalizeMembers(members);
        const data = this.readFile();
        const index = data.groups.findIndex((group) => group.name === validName);
        if (index < 0) {
            throw new AgentGroupNotFoundError(validName);
        }

        const group: AgentGroup = {
            ...data.groups[index],
            members: validMembers,
            updatedAt: new Date().toISOString(),
        };
        const groups = [...data.groups];
        groups[index] = group;
        this.writeFile({ version: 1, groups });
        return group;
    }

    addMember(name: string, member: string): AgentGroup {
        const group = this.requireGroup(name);
        const normalizedMember = this.normalizeMember(member);
        if (group.members.includes(normalizedMember)) {
            return group;
        }
        return this.update(group.name, [...group.members, normalizedMember]);
    }

    removeMember(name: string, member: string): AgentGroup {
        const group = this.requireGroup(name);
        const normalizedMember = this.normalizeMember(member);
        const members = group.members.filter((entry) => entry !== normalizedMember);
        if (members.length === group.members.length) {
            throw new AgentGroupInvalidMemberError(normalizedMember, `Agent group "${group.name}" does not contain member "${normalizedMember}".`);
        }
        return this.update(group.name, members);
    }

    remove(name: string): void {
        const validName = this.validateName(name);
        const data = this.readFile();
        const groups = data.groups.filter((group) => group.name !== validName);
        if (groups.length === data.groups.length) {
            throw new AgentGroupNotFoundError(validName);
        }
        this.writeFile({ version: 1, groups });
    }

    private requireGroup(name: string): AgentGroup {
        const validName = this.validateName(name);
        const group = this.get(validName);
        if (!group) {
            throw new AgentGroupNotFoundError(validName);
        }
        return group;
    }

    private readFile(): AgentGroupFile {
        if (!fs.existsSync(this.filePath)) {
            return { version: 1, groups: [] };
        }

        let parsed: unknown;
        try {
            parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
        } catch (error) {
            throw new AgentGroupStorageError(this.filePath, (error as Error).message);
        }

        if (!this.isGroupFile(parsed)) {
            throw new AgentGroupStorageError(this.filePath, 'unsupported or malformed agent group file');
        }

        return {
            version: 1,
            groups: parsed.groups.map((group) => ({
                name: group.name,
                members: [...group.members],
                createdAt: group.createdAt,
                updatedAt: group.updatedAt,
            })),
        };
    }

    private writeFile(data: AgentGroupFile): void {
        fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
        const tmp = `${this.filePath}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
        fs.renameSync(tmp, this.filePath);
    }

    private validateName(name: string): string {
        const normalized = name.trim();
        if (!GROUP_NAME_REGEX.test(normalized)) {
            throw new AgentGroupInvalidNameError(name);
        }
        return normalized;
    }

    private normalizeMembers(members: string[]): string[] {
        if (members.length === 0) {
            throw new AgentGroupEmptyMembersError();
        }

        const normalized = members.map((member) => this.normalizeMember(member));
        const seen = new Set<string>();
        for (const member of normalized) {
            if (seen.has(member)) {
                throw new AgentGroupInvalidMemberError(member, `Duplicate agent group member "${member}".`);
            }
            seen.add(member);
        }
        return normalized;
    }

    private normalizeMember(member: string): string {
        const normalized = member.trim();
        if (!normalized) {
            throw new AgentGroupInvalidMemberError(member, 'Agent group member cannot be blank.');
        }
        return normalized;
    }

    private isGroupFile(value: unknown): value is AgentGroupFile {
        if (!value || typeof value !== 'object') return false;
        const candidate = value as Partial<AgentGroupFile>;
        return candidate.version === 1
            && Array.isArray(candidate.groups)
            && candidate.groups.every((group) => (
                group
                && typeof group.name === 'string'
                && Array.isArray(group.members)
                && group.members.every((member) => typeof member === 'string')
                && typeof group.createdAt === 'string'
                && typeof group.updatedAt === 'string'
            ));
    }
}

export function createDefaultAgentGroupService(): AgentGroupService {
    if (!defaultInstance) {
        defaultInstance = new AgentGroupService();
    }
    return defaultInstance;
}

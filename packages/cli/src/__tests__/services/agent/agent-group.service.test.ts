import fs from 'fs';
import os from 'os';
import path from 'path';
import {
    AgentGroupConflictError,
    AgentGroupEmptyMembersError,
    AgentGroupInvalidMemberError,
    AgentGroupInvalidNameError,
    AgentGroupNotFoundError,
    AgentGroupStorageError,
    AgentGroupService,
} from '../../../services/agent/agent-group.service.js';

describe('AgentGroupService', () => {
    let tmpDir: string;
    let groupsPath: string;
    let service: AgentGroupService;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-group-service-'));
        groupsPath = path.join(tmpDir, 'nested', 'agent-groups.json');
        service = new AgentGroupService(groupsPath);
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    function readRaw(): any {
        return JSON.parse(fs.readFileSync(groupsPath, 'utf8'));
    }

    it('returns an empty list when the file is missing', () => {
        expect(service.list()).toEqual([]);
    });

    it('creates the file and parent directory when creating a group', () => {
        const group = service.create('backend-team', ['api', 'worker']);

        expect(group.name).toBe('backend-team');
        expect(group.members).toEqual(['api', 'worker']);
        expect(fs.existsSync(groupsPath)).toBe(true);
        expect(readRaw()).toMatchObject({
            version: 1,
            groups: [{ name: 'backend-team', members: ['api', 'worker'] }],
        });
    });

    it('writes atomically without leaving a temp file on success', () => {
        service.create('backend-team', ['api']);

        expect(fs.existsSync(`${groupsPath}.tmp`)).toBe(false);
    });

    it('gets a group by name', () => {
        service.create('backend-team', ['api']);

        expect(service.get('backend-team')?.members).toEqual(['api']);
        expect(service.get('missing')).toBeUndefined();
    });

    it('rejects invalid group names when getting a group', () => {
        expect(() => service.get('Bad_Name')).toThrow(AgentGroupInvalidNameError);
    });

    it('rejects invalid group names', () => {
        expect(() => service.create('Bad_Name', ['api'])).toThrow(AgentGroupInvalidNameError);
    });

    it('rejects empty member lists', () => {
        expect(() => service.create('backend-team', [])).toThrow(AgentGroupEmptyMembersError);
    });

    it('rejects blank members', () => {
        expect(() => service.create('backend-team', ['api', '  '])).toThrow(AgentGroupInvalidMemberError);
    });

    it('rejects duplicate members after trimming', () => {
        expect(() => service.create('backend-team', ['api', ' api '])).toThrow(AgentGroupInvalidMemberError);
    });

    it('rejects creating an existing group', () => {
        service.create('backend-team', ['api']);

        expect(() => service.create('backend-team', ['worker'])).toThrow(AgentGroupConflictError);
    });

    it('updates a group by replacing all members', () => {
        service.create('backend-team', ['api']);
        const updated = service.update('backend-team', ['worker', 'docs']);

        expect(updated.members).toEqual(['worker', 'docs']);
        expect(service.get('backend-team')?.members).toEqual(['worker', 'docs']);
    });

    it('throws when updating a missing group', () => {
        expect(() => service.update('missing', ['api'])).toThrow(AgentGroupNotFoundError);
    });

    it('adds a new member to an existing group', () => {
        service.create('backend-team', ['api']);
        const updated = service.addMember('backend-team', 'worker');

        expect(updated.members).toEqual(['api', 'worker']);
    });

    it('treats adding an existing member as idempotent', () => {
        service.create('backend-team', ['api']);
        const updated = service.addMember('backend-team', ' api ');

        expect(updated.members).toEqual(['api']);
    });

    it('removes one member from an existing group', () => {
        service.create('backend-team', ['api', 'worker']);
        const updated = service.removeMember('backend-team', 'api');

        expect(updated.members).toEqual(['worker']);
    });

    it('rejects removing the last member', () => {
        service.create('backend-team', ['api']);

        expect(() => service.removeMember('backend-team', 'api')).toThrow(AgentGroupEmptyMembersError);
        expect(service.get('backend-team')?.members).toEqual(['api']);
    });

    it('removes a group', () => {
        service.create('backend-team', ['api']);
        service.remove('backend-team');

        expect(service.list()).toEqual([]);
    });

    it('throws a storage error for malformed JSON', () => {
        fs.mkdirSync(path.dirname(groupsPath), { recursive: true });
        fs.writeFileSync(groupsPath, 'not json', 'utf8');

        expect(() => service.list()).toThrow(AgentGroupStorageError);
    });

    it('throws a storage error for unsupported file versions', () => {
        fs.mkdirSync(path.dirname(groupsPath), { recursive: true });
        fs.writeFileSync(groupsPath, JSON.stringify({ version: 2, groups: [] }), 'utf8');

        expect(() => service.list()).toThrow(AgentGroupStorageError);
    });
});

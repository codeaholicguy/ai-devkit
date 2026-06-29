import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { getAgentRequestPath, readLatestAgentRequest, writeAgentRequest, type AgentRequest } from '../../utils/agent-requests.js';

describe('agent-requests', () => {
    let homeDir: string;

    beforeEach(() => {
        homeDir = mkdtempSync(join(tmpdir(), 'agent-requests-test-'));
    });

    afterEach(() => {
        rmSync(homeDir, { recursive: true, force: true });
    });

    describe('getAgentRequestPath', () => {
        it('returns ~/.ai-devkit/agent-requests/<sessionId>.json', () => {
            expect(getAgentRequestPath(homeDir, 'abc-123')).toBe(
                join(homeDir, '.ai-devkit', 'agent-requests', 'abc-123.json'),
            );
        });
    });

    describe('writeAgentRequest', () => {
        it('creates the directory and file on first write', () => {
            const entry: AgentRequest = {
                sessionId: 'sess-1',
                toolName: 'Bash',
                toolInput: { command: 'ls /tmp' },
                timestamp: '2026-06-29T00:00:00.000Z',
            };
            writeAgentRequest(homeDir, entry);

            expect(readLatestAgentRequest(homeDir, 'sess-1')).toEqual(entry);
        });

        it('overwrites an existing entry on subsequent writes', () => {
            const first: AgentRequest = { sessionId: 'sess-2', toolName: 'Bash', toolInput: { command: 'echo first' }, timestamp: '2026-06-29T00:00:01.000Z' };
            const second: AgentRequest = { sessionId: 'sess-2', toolName: 'Bash', toolInput: { command: 'echo second' }, timestamp: '2026-06-29T00:00:02.000Z' };

            writeAgentRequest(homeDir, first);
            writeAgentRequest(homeDir, second);

            expect(readLatestAgentRequest(homeDir, 'sess-2')).toEqual(second);
        });
    });

    describe('readLatestAgentRequest', () => {
        it('returns null when no file exists for the session', () => {
            expect(readLatestAgentRequest(homeDir, 'no-such-session')).toBeNull();
        });

        it('returns null when the file contains malformed JSON', () => {
            const entry: AgentRequest = { sessionId: 'bad', toolName: 'Bash', toolInput: {}, timestamp: '2026-06-29T00:00:00.000Z' };
            writeAgentRequest(homeDir, entry);
            writeFileSync(getAgentRequestPath(homeDir, 'bad'), 'NOT JSON{{{', 'utf-8');

            expect(readLatestAgentRequest(homeDir, 'bad')).toBeNull();
        });

        it('returns the stored entry when the file is valid', () => {
            const entry: AgentRequest = {
                sessionId: 'good',
                toolName: 'AskUserQuestion',
                toolInput: { question: 'Which option?', options: ['A', 'B'] },
                timestamp: '2026-06-29T12:00:00.000Z',
            };
            writeAgentRequest(homeDir, entry);

            expect(readLatestAgentRequest(homeDir, 'good')).toEqual(entry);
        });
    });
});

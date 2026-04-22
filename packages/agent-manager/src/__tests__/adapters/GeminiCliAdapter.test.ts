/**
 * Tests for GeminiCliAdapter
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { beforeEach, afterEach, describe, expect, it, jest } from '@jest/globals';
import { GeminiCliAdapter } from '../../adapters/GeminiCliAdapter';
import type { ProcessInfo } from '../../adapters/AgentAdapter';
import { AgentStatus } from '../../adapters/AgentAdapter';
import { listAgentProcesses, enrichProcesses } from '../../utils/process';
import { matchProcessesToSessions, generateAgentName } from '../../utils/matching';

jest.mock('../../utils/process', () => ({
    listAgentProcesses: jest.fn(),
    enrichProcesses: jest.fn(),
}));

jest.mock('../../utils/matching', () => ({
    matchProcessesToSessions: jest.fn(),
    generateAgentName: jest.fn(),
}));

const mockedListAgentProcesses = listAgentProcesses as jest.MockedFunction<typeof listAgentProcesses>;
const mockedEnrichProcesses = enrichProcesses as jest.MockedFunction<typeof enrichProcesses>;
const mockedMatchProcessesToSessions = matchProcessesToSessions as jest.MockedFunction<typeof matchProcessesToSessions>;
const mockedGenerateAgentName = generateAgentName as jest.MockedFunction<typeof generateAgentName>;

describe('GeminiCliAdapter', () => {
    let adapter: GeminiCliAdapter;
    let tmpHome: string;

    beforeEach(() => {
        tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-adapter-test-'));
        process.env.HOME = tmpHome;

        adapter = new GeminiCliAdapter();
        mockedListAgentProcesses.mockReset();
        mockedEnrichProcesses.mockReset();
        mockedMatchProcessesToSessions.mockReset();
        mockedGenerateAgentName.mockReset();

        mockedEnrichProcesses.mockImplementation((procs) => procs);
        mockedMatchProcessesToSessions.mockReturnValue([]);
        mockedGenerateAgentName.mockImplementation((cwd: string, pid: number) => {
            const folder = path.basename(cwd) || 'unknown';
            return `${folder} (${pid})`;
        });
    });

    afterEach(() => {
        fs.rmSync(tmpHome, { recursive: true, force: true });
    });

    describe('initialization', () => {
        it('should expose gemini_cli type', () => {
            expect(adapter.type).toBe('gemini_cli');
        });
    });

    describe('canHandle', () => {
        it('should return true for plain gemini command', () => {
            expect(adapter.canHandle({ pid: 1, command: 'gemini', cwd: '/repo', tty: 'ttys001' })).toBe(true);
        });

        it('should return true for gemini with full path (case-insensitive)', () => {
            expect(adapter.canHandle({
                pid: 2,
                command: '/usr/local/bin/GEMINI --yolo',
                cwd: '/repo',
                tty: 'ttys002',
            })).toBe(true);
        });

        it('should return false for non-gemini processes', () => {
            expect(adapter.canHandle({ pid: 3, command: 'node app.js', cwd: '/repo', tty: 'ttys003' })).toBe(false);
        });

        it('should return false when "gemini" appears only in path arguments', () => {
            expect(adapter.canHandle({
                pid: 4,
                command: 'node /path/to/gemini-runner.js',
                cwd: '/repo',
                tty: 'ttys004',
            })).toBe(false);
        });

        it('should return true for Node-invoked gemini script (real install layout)', () => {
            expect(adapter.canHandle({
                pid: 5,
                command: 'node /Users/foo/.volta/tools/image/node/24.14.0/bin/gemini --help',
                cwd: '/repo',
                tty: 'ttys005',
            })).toBe(true);
        });

        it('should return true for Node-invoked gemini.js bundle entrypoint', () => {
            expect(adapter.canHandle({
                pid: 6,
                command: 'node /opt/homebrew/lib/node_modules/@google/gemini-cli/bundle/gemini.js',
                cwd: '/repo',
                tty: 'ttys006',
            })).toBe(true);
        });
    });

    describe('detectAgents', () => {
        it('should return empty array when no gemini processes are running', async () => {
            mockedListAgentProcesses.mockReturnValue([]);
            const agents = await adapter.detectAgents();
            expect(agents).toEqual([]);
        });

        it('should filter non-gemini Node processes out of the node process pool', async () => {
            const geminiProc: ProcessInfo = {
                pid: 100,
                command: 'node /Users/foo/.volta/tools/image/node/24.14.0/bin/gemini --help',
                cwd: '/repo',
                tty: 'ttys001',
                startTime: new Date('2026-04-18T00:00:00Z'),
            };
            const unrelatedNodeProc: ProcessInfo = {
                pid: 200,
                command: 'node /usr/local/bin/eslint src/',
                cwd: '/other-repo',
                tty: 'ttys002',
                startTime: new Date('2026-04-18T00:00:00Z'),
            };
            mockedListAgentProcesses.mockReturnValue([geminiProc, unrelatedNodeProc]);

            const agents = await adapter.detectAgents();
            expect(agents).toHaveLength(1);
            expect(agents[0].pid).toBe(100);
        });

        it('should return process-only agents when no session files exist for the process', async () => {
            const proc: ProcessInfo = {
                pid: 1234,
                command: 'gemini',
                cwd: '/repo',
                tty: 'ttys001',
                startTime: new Date('2026-04-18T00:00:00Z'),
            };
            mockedListAgentProcesses.mockReturnValue([proc]);

            const agents = await adapter.detectAgents();
            expect(agents).toHaveLength(1);
            expect(agents[0]).toMatchObject({
                type: 'gemini_cli',
                pid: 1234,
                projectPath: '/repo',
                status: AgentStatus.RUNNING,
                sessionId: 'pid-1234',
            });
        });

        it('should map a process to its matching session file via projectHash', async () => {
            const cwd = '/repo/project-a';
            const projectHash = hashProjectRoot(cwd);
            const shortId = 'abc123';
            const chatsDir = path.join(tmpHome, '.gemini', 'tmp', shortId, 'chats');
            fs.mkdirSync(chatsDir, { recursive: true });
            const sessionPath = path.join(chatsDir, 'session-2026-04-18T00-00-session1.json');
            const sessionStart = new Date('2026-04-18T00:00:00Z').toISOString();
            fs.writeFileSync(
                sessionPath,
                JSON.stringify({
                    sessionId: 'session1',
                    projectHash,
                    startTime: sessionStart,
                    lastUpdated: sessionStart,
                    kind: 'main',
                    messages: [
                        { id: 'm1', timestamp: sessionStart, type: 'user', content: 'hello gemini' },
                    ],
                }),
            );

            const proc: ProcessInfo = {
                pid: 42,
                command: 'gemini',
                cwd,
                tty: 'ttys001',
                startTime: new Date('2026-04-18T00:00:00Z'),
            };
            mockedListAgentProcesses.mockReturnValue([proc]);
            mockedMatchProcessesToSessions.mockReturnValue([
                {
                    process: proc,
                    session: {
                        sessionId: 'session1',
                        filePath: sessionPath,
                        projectDir: chatsDir,
                        birthtimeMs: Date.now(),
                        resolvedCwd: cwd,
                    },
                    deltaMs: 0,
                },
            ]);

            const agents = await adapter.detectAgents();
            expect(agents).toHaveLength(1);
            expect(agents[0]).toMatchObject({
                type: 'gemini_cli',
                pid: 42,
                projectPath: cwd,
                sessionId: 'session1',
                sessionFilePath: sessionPath,
            });
            expect(agents[0].summary).toContain('hello gemini');
        });

        it('should not match sessions from other projects', async () => {
            const procCwd = '/repo/project-a';
            const otherCwd = '/repo/project-b';
            const otherHash = hashProjectRoot(otherCwd);
            const chatsDir = path.join(tmpHome, '.gemini', 'tmp', 'other', 'chats');
            fs.mkdirSync(chatsDir, { recursive: true });
            const sessionPath = path.join(chatsDir, 'session-2026-04-18T00-00-other.json');
            fs.writeFileSync(
                sessionPath,
                JSON.stringify({
                    sessionId: 'other-session',
                    projectHash: otherHash,
                    startTime: new Date().toISOString(),
                    lastUpdated: new Date().toISOString(),
                    kind: 'main',
                    messages: [],
                }),
            );

            const proc: ProcessInfo = {
                pid: 7,
                command: 'gemini',
                cwd: procCwd,
                tty: 'ttys001',
                startTime: new Date(),
            };
            mockedListAgentProcesses.mockReturnValue([proc]);

            const agents = await adapter.detectAgents();

            const candidateSessions = mockedMatchProcessesToSessions.mock.calls[0]?.[1] ?? [];
            expect(candidateSessions).toHaveLength(0);

            expect(agents).toHaveLength(1);
            expect(agents[0].sessionId).toBe(`pid-${proc.pid}`);
        });
    });

    describe('discoverSessions', () => {
        it('should return empty when ~/.gemini/tmp does not exist', () => {
            const proc: ProcessInfo = {
                pid: 1,
                command: 'gemini',
                cwd: '/repo',
                tty: 'ttys001',
                startTime: new Date(),
            };
            // tmp dir absent by default
            const result = (adapter as any).discoverSessions([proc]);
            expect(result.sessions).toEqual([]);
            expect(result.contentCache.size).toBe(0);
        });

        it('should skip processes with empty cwd when building the hash map', () => {
            const proc: ProcessInfo = {
                pid: 1,
                command: 'gemini',
                cwd: '',
                tty: 'ttys001',
                startTime: new Date(),
            };
            writeSession(tmpHome, 'abc', 'session-x', {
                sessionId: 's1',
                projectHash: hashProjectRoot('/some/where'),
                startTime: new Date().toISOString(),
                lastUpdated: new Date().toISOString(),
                kind: 'main',
                messages: [],
            });

            const result = (adapter as any).discoverSessions([proc]);
            expect(result.sessions).toEqual([]);
        });

        it('should ignore sessions whose projectHash does not match any process cwd', () => {
            const proc: ProcessInfo = {
                pid: 1,
                command: 'gemini',
                cwd: '/repo/a',
                tty: 'ttys001',
                startTime: new Date(),
            };
            writeSession(tmpHome, 'other', 'session-other', {
                sessionId: 's-other',
                projectHash: hashProjectRoot('/repo/different'),
                startTime: new Date().toISOString(),
                lastUpdated: new Date().toISOString(),
                kind: 'main',
                messages: [],
            });

            const result = (adapter as any).discoverSessions([proc]);
            expect(result.sessions).toEqual([]);
        });

        it('should skip malformed JSON files and still return valid ones', () => {
            const cwd = '/repo/valid';
            const proc: ProcessInfo = {
                pid: 1,
                command: 'gemini',
                cwd,
                tty: 'ttys001',
                startTime: new Date(),
            };

            const chatsDir = path.join(tmpHome, '.gemini', 'tmp', 'abc', 'chats');
            fs.mkdirSync(chatsDir, { recursive: true });
            fs.writeFileSync(path.join(chatsDir, 'session-bad.json'), '{ not valid');
            writeSession(tmpHome, 'abc', 'session-good', {
                sessionId: 's-good',
                projectHash: hashProjectRoot(cwd),
                startTime: new Date().toISOString(),
                lastUpdated: new Date().toISOString(),
                kind: 'main',
                messages: [],
            });

            const result = (adapter as any).discoverSessions([proc]);
            expect(result.sessions).toHaveLength(1);
            expect(result.sessions[0].sessionId).toBe('s-good');
        });

        it('should match sessions whose projectHash is a parent of the process cwd (git root case)', () => {
            const gitRoot = '/repo/monorepo';
            const procCwd = '/repo/monorepo/packages/inner';
            const proc: ProcessInfo = {
                pid: 1,
                command: 'gemini',
                cwd: procCwd,
                tty: 'ttys001',
                startTime: new Date(),
            };
            writeSession(tmpHome, 'abc', 'session-rootmatch', {
                sessionId: 's-root',
                // Gemini CLI stores the hash of the walked-up project root,
                // not the process CWD.
                projectHash: hashProjectRoot(gitRoot),
                startTime: new Date().toISOString(),
                lastUpdated: new Date().toISOString(),
                kind: 'main',
                messages: [],
            });

            const result = (adapter as any).discoverSessions([proc]);
            expect(result.sessions).toHaveLength(1);
            expect(result.sessions[0].resolvedCwd).toBe(procCwd);
        });

        it('should skip files that do not start with "session-"', () => {
            const cwd = '/repo/keep';
            const proc: ProcessInfo = {
                pid: 1,
                command: 'gemini',
                cwd,
                tty: 'ttys001',
                startTime: new Date(),
            };

            const chatsDir = path.join(tmpHome, '.gemini', 'tmp', 'abc', 'chats');
            fs.mkdirSync(chatsDir, { recursive: true });
            fs.writeFileSync(
                path.join(chatsDir, 'notsession.json'),
                JSON.stringify({
                    sessionId: 'skip',
                    projectHash: hashProjectRoot(cwd),
                    messages: [],
                }),
            );

            const result = (adapter as any).discoverSessions([proc]);
            expect(result.sessions).toEqual([]);
        });
    });

    describe('helper methods', () => {
        describe('determineStatus', () => {
            it('should return "waiting" when the last message is from gemini', () => {
                const session = {
                    sessionId: 's', projectPath: '', summary: '',
                    sessionStart: new Date(), lastActive: new Date(),
                    lastMessageType: 'gemini',
                };
                expect((adapter as any).determineStatus(session)).toBe(AgentStatus.WAITING);
            });

            it('should return "waiting" when the last message is from assistant', () => {
                const session = {
                    sessionId: 's', projectPath: '', summary: '',
                    sessionStart: new Date(), lastActive: new Date(),
                    lastMessageType: 'assistant',
                };
                expect((adapter as any).determineStatus(session)).toBe(AgentStatus.WAITING);
            });

            it('should return "running" when the last message is from the user', () => {
                const session = {
                    sessionId: 's', projectPath: '', summary: '',
                    sessionStart: new Date(), lastActive: new Date(),
                    lastMessageType: 'user',
                };
                expect((adapter as any).determineStatus(session)).toBe(AgentStatus.RUNNING);
            });

            it('should return "idle" when last activity is older than the threshold', () => {
                const session = {
                    sessionId: 's', projectPath: '', summary: '',
                    sessionStart: new Date(),
                    lastActive: new Date(Date.now() - 10 * 60 * 1000),
                    lastMessageType: 'gemini',
                };
                expect((adapter as any).determineStatus(session)).toBe(AgentStatus.IDLE);
            });
        });

        describe('parseSession', () => {
            it('should parse a valid session file', () => {
                const filePath = writeSession(tmpHome, 'p', 'session-a', {
                    sessionId: 's1',
                    projectHash: 'h',
                    startTime: '2026-04-18T00:00:00Z',
                    lastUpdated: '2026-04-18T00:05:00Z',
                    kind: 'main',
                    directories: ['/repo'],
                    messages: [
                        { id: 'm1', timestamp: '2026-04-18T00:00:01Z', type: 'user', content: 'hello' },
                    ],
                });

                const result = (adapter as any).parseSession(undefined, filePath);
                expect(result).toMatchObject({
                    sessionId: 's1',
                    projectPath: '/repo',
                    summary: 'hello',
                });
            });

            it('should parse from cached content without reading disk', () => {
                const content = JSON.stringify({
                    sessionId: 's2',
                    projectHash: 'h',
                    startTime: '2026-04-18T00:00:00Z',
                    lastUpdated: '2026-04-18T00:00:00Z',
                    messages: [],
                });

                const result = (adapter as any).parseSession(content, '/does/not/exist.json');
                expect(result?.sessionId).toBe('s2');
            });

            it('should return null for a missing file with no cached content', () => {
                expect((adapter as any).parseSession(undefined, '/missing.json')).toBeNull();
            });

            it('should return null when the file is not valid JSON', () => {
                const filePath = path.join(tmpHome, 'broken.json');
                fs.writeFileSync(filePath, 'not json');
                expect((adapter as any).parseSession(undefined, filePath)).toBeNull();
            });

            it('should return null when sessionId is missing', () => {
                const filePath = path.join(tmpHome, 'no-id.json');
                fs.writeFileSync(filePath, JSON.stringify({ messages: [] }));
                expect((adapter as any).parseSession(undefined, filePath)).toBeNull();
            });

            it('should default the summary when no user message has content', () => {
                const filePath = writeSession(tmpHome, 'p', 'session-empty', {
                    sessionId: 's3',
                    projectHash: 'h',
                    startTime: '2026-04-18T00:00:00Z',
                    lastUpdated: '2026-04-18T00:00:00Z',
                    messages: [
                        { id: 'm1', timestamp: '2026-04-18T00:00:01Z', type: 'gemini', content: 'only assistant' },
                    ],
                });

                const result = (adapter as any).parseSession(undefined, filePath);
                expect(result?.summary).toBe('Gemini CLI session active');
            });

            it('should truncate long summaries to 120 characters', () => {
                const longContent = 'x'.repeat(200);
                const filePath = writeSession(tmpHome, 'p', 'session-long', {
                    sessionId: 's4',
                    projectHash: 'h',
                    startTime: '2026-04-18T00:00:00Z',
                    lastUpdated: '2026-04-18T00:00:00Z',
                    messages: [
                        { id: 'm1', timestamp: '2026-04-18T00:00:01Z', type: 'user', content: longContent },
                    ],
                });

                const result = (adapter as any).parseSession(undefined, filePath);
                expect(result?.summary.length).toBe(120);
                expect(result?.summary.endsWith('...')).toBe(true);
            });

            it('should extract summary when user content is an array of parts (real Gemini shape)', () => {
                const filePath = writeSession(tmpHome, 'p', 'session-parts', {
                    sessionId: 's-parts',
                    projectHash: 'h',
                    startTime: '2026-04-18T00:00:00Z',
                    lastUpdated: '2026-04-18T00:00:00Z',
                    messages: [
                        {
                            id: 'm1',
                            timestamp: '2026-04-18T00:00:01Z',
                            type: 'user',
                            content: [{ text: 'hello from part' }, { text: ' continued' }],
                        },
                    ],
                });

                const result = (adapter as any).parseSession(undefined, filePath);
                expect(result?.summary).toBe('hello from part continued');
            });

            it('should not throw when user content is an array and there is no displayContent', () => {
                const filePath = writeSession(tmpHome, 'p', 'session-parts-only', {
                    sessionId: 's-parts-only',
                    projectHash: 'h',
                    startTime: '2026-04-18T00:00:00Z',
                    lastUpdated: '2026-04-18T00:00:00Z',
                    messages: [
                        {
                            id: 'm1',
                            timestamp: '2026-04-18T00:00:01Z',
                            type: 'user',
                            content: [{ text: 'only via parts' }],
                        },
                    ],
                });

                expect(() => (adapter as any).parseSession(undefined, filePath)).not.toThrow();
            });

            it('should drop non-text parts (data/file) when resolving user content', () => {
                const filePath = writeSession(tmpHome, 'p', 'session-mixed-parts', {
                    sessionId: 's-mixed',
                    projectHash: 'h',
                    startTime: '2026-04-18T00:00:00Z',
                    lastUpdated: '2026-04-18T00:00:00Z',
                    messages: [
                        {
                            id: 'm1',
                            timestamp: '2026-04-18T00:00:01Z',
                            type: 'user',
                            content: [
                                { text: 'readable text' },
                                { inlineData: { mimeType: 'image/png', data: 'base64...' } },
                                { text: ' + more' },
                            ],
                        },
                    ],
                });

                const result = (adapter as any).parseSession(undefined, filePath);
                expect(result?.summary).toBe('readable text + more');
            });

            it('should prefer lastUpdated over entry timestamp for lastActive', () => {
                const filePath = writeSession(tmpHome, 'p', 'session-last', {
                    sessionId: 's5',
                    projectHash: 'h',
                    startTime: '2026-04-18T00:00:00Z',
                    lastUpdated: '2026-04-18T00:10:00Z',
                    messages: [
                        { id: 'm1', timestamp: '2026-04-18T00:00:01Z', type: 'user', content: 'hi' },
                    ],
                });

                const result = (adapter as any).parseSession(undefined, filePath);
                expect(result?.lastActive.toISOString()).toBe('2026-04-18T00:10:00.000Z');
            });
        });
    });

    describe('getConversation', () => {
        it('should return messages from a valid Gemini session file', () => {
            const sessionPath = path.join(tmpHome, 'session-2026-04-18T00-00-id.json');
            fs.writeFileSync(
                sessionPath,
                JSON.stringify({
                    sessionId: 'abc',
                    projectHash: 'hash',
                    startTime: '2026-04-18T00:00:00Z',
                    lastUpdated: '2026-04-18T00:00:00Z',
                    kind: 'main',
                    messages: [
                        { id: 'm1', timestamp: '2026-04-18T00:00:01Z', type: 'user', content: 'hi' },
                        { id: 'm2', timestamp: '2026-04-18T00:00:02Z', type: 'gemini', content: 'hello' },
                        { id: 'm3', timestamp: '2026-04-18T00:00:03Z', type: 'tool', content: 'unused' },
                    ],
                }),
            );

            const messages = adapter.getConversation(sessionPath);
            expect(messages).toEqual([
                { role: 'user', content: 'hi', timestamp: '2026-04-18T00:00:01Z' },
                { role: 'assistant', content: 'hello', timestamp: '2026-04-18T00:00:02Z' },
            ]);
        });

        it('should include tool entries when verbose is true', () => {
            const sessionPath = path.join(tmpHome, 'session-verbose.json');
            fs.writeFileSync(
                sessionPath,
                JSON.stringify({
                    sessionId: 'abc',
                    projectHash: 'hash',
                    startTime: '2026-04-18T00:00:00Z',
                    lastUpdated: '2026-04-18T00:00:00Z',
                    kind: 'main',
                    messages: [
                        { id: 'm1', timestamp: '2026-04-18T00:00:01Z', type: 'tool', content: 'tool call' },
                    ],
                }),
            );

            const messages = adapter.getConversation(sessionPath, { verbose: true });
            expect(messages).toEqual([
                { role: 'system', content: 'tool call', timestamp: '2026-04-18T00:00:01Z' },
            ]);
        });

        it('should return empty array for missing or malformed files', () => {
            expect(adapter.getConversation('/nonexistent/file.json')).toEqual([]);

            const brokenPath = path.join(tmpHome, 'broken.json');
            fs.writeFileSync(brokenPath, '{ not valid json');
            expect(adapter.getConversation(brokenPath)).toEqual([]);
        });

        it('should prefer displayContent over content when both are present', () => {
            const sessionPath = path.join(tmpHome, 'session-display.json');
            fs.writeFileSync(
                sessionPath,
                JSON.stringify({
                    sessionId: 'abc',
                    messages: [
                        {
                            id: 'm1',
                            timestamp: '2026-04-18T00:00:01Z',
                            type: 'user',
                            content: 'raw',
                            displayContent: 'rendered',
                        },
                    ],
                }),
            );

            const messages = adapter.getConversation(sessionPath);
            expect(messages[0].content).toBe('rendered');
        });

        it('should skip entries with empty content', () => {
            const sessionPath = path.join(tmpHome, 'session-empty.json');
            fs.writeFileSync(
                sessionPath,
                JSON.stringify({
                    sessionId: 'abc',
                    messages: [
                        { id: 'm1', timestamp: '2026-04-18T00:00:01Z', type: 'user', content: '' },
                        { id: 'm2', timestamp: '2026-04-18T00:00:02Z', type: 'user', content: 'real' },
                    ],
                }),
            );

            const messages = adapter.getConversation(sessionPath);
            expect(messages).toHaveLength(1);
            expect(messages[0].content).toBe('real');
        });

        it('should skip entries without a type', () => {
            const sessionPath = path.join(tmpHome, 'session-no-type.json');
            fs.writeFileSync(
                sessionPath,
                JSON.stringify({
                    sessionId: 'abc',
                    messages: [
                        { id: 'm1', timestamp: '2026-04-18T00:00:01Z', content: 'typeless' },
                    ],
                }),
            );

            expect(adapter.getConversation(sessionPath)).toEqual([]);
        });

        it('should resolve user messages whose content is an array of text parts', () => {
            const sessionPath = path.join(tmpHome, 'session-user-parts.json');
            fs.writeFileSync(
                sessionPath,
                JSON.stringify({
                    sessionId: 'abc',
                    messages: [
                        {
                            id: 'm1',
                            timestamp: '2026-04-18T00:00:01Z',
                            type: 'user',
                            content: [{ text: 'hello' }, { text: ' world' }],
                        },
                        {
                            id: 'm2',
                            timestamp: '2026-04-18T00:00:02Z',
                            type: 'gemini',
                            content: 'hi there',
                        },
                    ],
                }),
            );

            const messages = adapter.getConversation(sessionPath);
            expect(messages).toEqual([
                { role: 'user', content: 'hello world', timestamp: '2026-04-18T00:00:01Z' },
                { role: 'assistant', content: 'hi there', timestamp: '2026-04-18T00:00:02Z' },
            ]);
        });

        it('should not throw when content is an array but no part carries text', () => {
            const sessionPath = path.join(tmpHome, 'session-no-text-parts.json');
            fs.writeFileSync(
                sessionPath,
                JSON.stringify({
                    sessionId: 'abc',
                    messages: [
                        {
                            id: 'm1',
                            timestamp: '2026-04-18T00:00:01Z',
                            type: 'user',
                            content: [{ inlineData: { mimeType: 'image/png' } }],
                        },
                    ],
                }),
            );

            expect(() => adapter.getConversation(sessionPath)).not.toThrow();
            expect(adapter.getConversation(sessionPath)).toEqual([]);
        });

        it('should return empty array when messages is not an array', () => {
            const sessionPath = path.join(tmpHome, 'session-bad-messages.json');
            fs.writeFileSync(
                sessionPath,
                JSON.stringify({ sessionId: 'abc', messages: 'not-an-array' }),
            );

            expect(adapter.getConversation(sessionPath)).toEqual([]);
        });
    });
});

/**
 * Write a Gemini session JSON to the temporary home under the expected
 * ~/.gemini/tmp/<shortId>/chats/<fileName>.json layout. Returns the full path.
 */
function writeSession(
    home: string,
    shortId: string,
    fileName: string,
    body: Record<string, unknown>,
): string {
    const chatsDir = path.join(home, '.gemini', 'tmp', shortId, 'chats');
    fs.mkdirSync(chatsDir, { recursive: true });
    const filePath = path.join(chatsDir, `${fileName}.json`);
    fs.writeFileSync(filePath, JSON.stringify(body));
    return filePath;
}

/**
 * Mirror the projectHash algo used by Gemini CLI:
 * sha256(projectRoot) as hex.
 */
function hashProjectRoot(projectRoot: string): string {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(projectRoot).digest('hex');
}

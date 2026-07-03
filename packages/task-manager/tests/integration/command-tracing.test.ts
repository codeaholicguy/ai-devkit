import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';

import { register } from '../../src/command.js';

function createRuntime(dir: string) {
    return {
        cwd: dir,
        homeDir: dir,
        configPath: join(dir, '.ai-devkit.json'),
        async getConfig(): Promise<Record<string, never>> {
            return {};
        },
        async getMemoryDbPath(): Promise<string> {
            return join(dir, 'memory.db');
        },
        logger: {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        },
    };
}

async function runTaskCommand(dir: string, args: string[]): Promise<void> {
    const program = new Command();
    const dbPath = join(dir, 'tasks.db');
    register(program.command('task'), createRuntime(dir));
    await program.parseAsync(['task', ...args, '--db-path', dbPath], { from: 'user' });
}

describe('task command tracing workflow', () => {
    let consoleLogSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
        process.exitCode = undefined;
    });

    it('records useful lifecycle tracing data in the task database', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'task-trace-'));
        const actorFlags = ['--agent', 'agent-a', '--agent-type', 'codex', '--pid', '123', '--session', 'sess-1'];

        await runTaskCommand(dir, [
            'create',
            '--title', 'Trace E2E',
            '--name', 'trace-e2e',
            '--phase', 'requirements',
            ...actorFlags,
            '--json',
        ]);
        await runTaskCommand(dir, ['phase', 'trace-e2e', 'implementation', ...actorFlags, '--json']);
        await runTaskCommand(dir, ['next', 'trace-e2e', 'Run verification', ...actorFlags, '--json']);
        await runTaskCommand(dir, [
            'progress',
            'trace-e2e',
            '--text', 'Implemented tracing probe',
            ...actorFlags,
            '--json',
        ]);
        await runTaskCommand(dir, [
            'evidence',
            'trace-e2e',
            '--passed',
            '--command', 'npm test',
            '--exit-code', '0',
            '--summary', '111 tests passed',
            ...actorFlags,
            '--json',
        ]);
        await runTaskCommand(dir, ['show', 'trace-e2e', '--events', '--json']);

        const lastOutput = consoleLogSpy.mock.calls.at(-1)?.[0];
        expect(typeof lastOutput).toBe('string');
        const payload = JSON.parse(lastOutput as string) as {
            task: {
                name: string;
                phase: string;
                nextStep: string;
                progress: { text: string | null };
                evidence: Array<{ command: string; passed: boolean; summary: string; actor: { agentId: string } }>;
                attribution: { agentId: string; agentType: string; pid: number; sessionId: string };
                eventCount: number;
            };
            events: Array<{ type: string; actor: { agentId: string } | null; payload: Record<string, unknown> }>;
        };

        expect(payload.task).toMatchObject({
            name: 'trace-e2e',
            phase: 'implementation',
            nextStep: 'Run verification',
            progress: { text: 'Implemented tracing probe' },
            attribution: { agentId: 'agent-a', agentType: 'codex', pid: 123, sessionId: 'sess-1' },
            eventCount: 5,
        });
        expect(payload.task.evidence).toEqual([
            expect.objectContaining({
                command: 'npm test',
                passed: true,
                summary: '111 tests passed',
                actor: expect.objectContaining({ agentId: 'agent-a' }),
            }),
        ]);
        expect(payload.events.map((event) => event.type)).toEqual([
            'task.created',
            'task.phase.set',
            'task.next_step.set',
            'task.progress.set',
            'task.evidence.add',
        ]);
        expect(payload.events.every((event) => event.actor?.agentId === 'agent-a')).toBe(true);
    });
});

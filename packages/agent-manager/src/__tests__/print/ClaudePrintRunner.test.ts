import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import type { DurableAgent } from '../../index.js';
import { ClaudePrintRunner } from '../../providers/claude/durable/ClaudePrintRunner.js';

function agent(): DurableAgent {
    return {
        id: '11111111-1111-4111-8111-111111111111', name: 'reviewer', provider: 'claude', mode: 'durable',
        cwd: '/project', providerSessionId: '22222222-2222-4222-8222-222222222222', state: 'running',
        sessionHealth: 'uninitialized', createdAt: '', updatedAt: '', lastActiveAt: null, lastResult: null,
        activeRun: null,
    };
}

function fakeSpawn(events: object[], exitCode = 0) {
    const calls: unknown[][] = [];
    const promptChunks: Buffer[] = [];
    const child = new EventEmitter() as any;
    child.pid = 4242;
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin = new Writable({
        write(chunk, _encoding, callback) { promptChunks.push(Buffer.from(chunk)); callback(); },
        final(callback) {
            for (const event of events) child.stdout.write(`${JSON.stringify(event)}\n`);
            child.stdout.end();
            queueMicrotask(() => child.emit('close', exitCode, null));
            callback();
        },
    });
    const spawn = vi.fn((...args: unknown[]) => { calls.push(args); return child; });
    return { spawn, calls, promptChunks };
}

describe('ClaudePrintRunner', () => {
    it('starts a caller-assigned session and persists provider identity before stdin', async () => {
        const fixture = fakeSpawn([
            { type: 'system', subtype: 'init', session_id: agent().providerSessionId },
            { type: 'result', session_id: agent().providerSessionId, result: 'done' },
        ]);
        let persisted = false;
        const runner = new ClaudePrintRunner({ spawn: fixture.spawn, processInspector: {
            getIdentity: () => ({ pid: 4242, startedAt: 'provider-start' }),
        } });

        const result = await runner.run({
            agent: agent(), prompt: 'secret prompt', executable: 'claude-test', firstRun: true,
            onSpawn: async () => { expect(fixture.promptChunks).toHaveLength(0); persisted = true; },
        });

        expect(persisted).toBe(true);
        expect(fixture.calls[0]).toEqual([
            'claude-test',
            ['-p', '--session-id', agent().providerSessionId, '--output-format', 'stream-json', '--verbose'],
            expect.objectContaining({ cwd: '/project', shell: false, stdio: ['pipe', 'pipe', 'pipe'] }),
        ]);
        expect(JSON.stringify(fixture.calls)).not.toContain('secret prompt');
        expect(Buffer.concat(fixture.promptChunks).toString()).toBe('secret prompt');
        expect(result).toEqual({ sessionId: agent().providerSessionId, result: 'done', exitCode: 0 });
    });

    it('uses exact resume and rejects a mismatched result session', async () => {
        const fixture = fakeSpawn([{ type: 'result', session_id: 'wrong', result: 'nope' }]);
        const runner = new ClaudePrintRunner({ spawn: fixture.spawn, processInspector: {
            getIdentity: () => ({ pid: 4242, startedAt: 'provider-start' }),
        } });

        await expect(runner.run({
            agent: agent(), prompt: 'followup', executable: 'claude', firstRun: false, onSpawn: vi.fn(),
        })).rejects.toMatchObject({ code: 'CLAUDE_SESSION_MISMATCH' });
        expect(fixture.calls[0]![1]).toEqual([
            '-p', '--resume', agent().providerSessionId, '--output-format', 'stream-json', '--verbose',
        ]);
    });

    it('does not disclose provider stderr in a failed-run error', async () => {
        const fixture = fakeSpawn([], 1);
        const runner = new ClaudePrintRunner({ spawn: fixture.spawn, processInspector: {
            getIdentity: () => ({ pid: 4242, startedAt: 'provider-start' }),
        } });
        fixture.spawn.mockImplementationOnce((...args: unknown[]) => {
            const child = (fakeSpawn([], 1).spawn as any)(...args);
            child.stdin = new Writable({
                final(callback) {
                    child.stderr.write('secret prompt echoed by provider');
                    child.stderr.end();
                    queueMicrotask(() => child.emit('close', 1, null));
                    callback();
                },
            });
            return child;
        });

        await expect(runner.run({
            agent: agent(), prompt: 'secret prompt', firstRun: true, onSpawn: vi.fn(),
        })).rejects.not.toThrow(/secret prompt/);
    });
});

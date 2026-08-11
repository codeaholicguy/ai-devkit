import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import type { CodexDurableAgent } from '../../index.js';

const SESSION = '22222222-2222-4222-8222-222222222222';

function agent(providerSessionId: string | null = null): CodexDurableAgent {
    return {
        id: '11111111-1111-4111-8111-111111111111', name: 'reviewer', provider: 'codex', mode: 'print',
        cwd: '/project', providerSessionId, state: 'running', sessionHealth: 'uninitialized',
        createdAt: '', updatedAt: '', lastActiveAt: null, lastResult: null, activeRun: null,
    };
}

function fakeSpawn(lines: string[], exitCode = 0, chunks = false) {
    const promptChunks: Buffer[] = [];
    const child = new EventEmitter() as any;
    child.pid = 4242;
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = vi.fn();
    child.stdin = new Writable({
        write(chunk, _encoding, callback) { promptChunks.push(Buffer.from(chunk)); callback(); },
        final(callback) {
            const output = lines.join('\n');
            if (chunks) {
                const bytes = Buffer.from(output);
                child.stdout.write(bytes.subarray(0, 7));
                child.stdout.write(bytes.subarray(7));
            } else child.stdout.write(output);
            child.stdout.end();
            queueMicrotask(() => child.emit('close', exitCode, null));
            callback();
        },
    });
    const spawn = vi.fn(() => child);
    return { child, spawn, promptChunks };
}

function events(session = SESSION): string[] {
    return [
        JSON.stringify({ type: 'thread.started', thread_id: session }),
        JSON.stringify({ type: 'turn.started' }),
        JSON.stringify({ type: 'future.event', anything: true }),
        JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'first' } }),
        JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'final' } }),
        JSON.stringify({ type: 'turn.completed' }),
        '',
    ];
}

async function runner(fixture: ReturnType<typeof fakeSpawn>, maxLineBytes?: number) {
    const api = await import('../../index.js') as Record<string, unknown>;
    expect(api).toHaveProperty('CodexPrintRunner');
    const Runner = api.CodexPrintRunner as new (options: unknown) => any;
    return new Runner({ spawn: fixture.spawn, maxLineBytes, processInspector: {
        getIdentity: () => ({ pid: 4242, startedAt: 'provider-start' }),
    } });
}

describe('CodexPrintRunner', () => {
    it('binds an initial thread before returning ordered assistant output', async () => {
        const fixture = fakeSpawn(events(), 0, true);
        const instance = await runner(fixture);
        const order: string[] = [];
        const result = await instance.run({
            agent: agent(), prompt: 'secret prompt', executable: 'fake-codex',
            onSpawn: async () => { expect(fixture.promptChunks).toHaveLength(0); order.push('spawn'); },
            onSession: async (id: string) => { expect(id).toBe(SESSION); order.push('session'); },
        });

        expect(order).toEqual(['spawn', 'session']);
        expect(fixture.spawn).toHaveBeenCalledWith('fake-codex', ['exec', '--json', '-'], expect.objectContaining({
            cwd: '/project', shell: false, stdio: ['pipe', 'pipe', 'pipe'],
        }));
        expect(JSON.stringify(fixture.spawn.mock.calls)).not.toContain('secret prompt');
        expect(Buffer.concat(fixture.promptChunks).toString()).toBe('secret prompt');
        expect(result).toEqual({ sessionId: SESSION, result: 'final', messages: ['first', 'final'], exitCode: 0 });
    });

    it('resumes the exact stored UUID and rejects a mismatch', async () => {
        const mismatch = '33333333-3333-4333-8333-333333333333';
        const fixture = fakeSpawn(events(mismatch));
        const instance = await runner(fixture);
        await expect(instance.run({ agent: agent(SESSION), prompt: 'later', onSpawn: vi.fn(), onSession: vi.fn() }))
            .rejects.toMatchObject({ code: 'CODEX_SESSION_MISMATCH' });
        expect(fixture.spawn.mock.calls[0]![1]).toEqual(['exec', 'resume', '--json', SESSION, '-']);
    });

    it.each([
        ['malformed JSON', ['{bad\n'], 'CODEX_PROTOCOL'],
        ['non-object JSON', ['[]\n'], 'CODEX_PROTOCOL'],
        ['truncated JSON', ['{}'], 'CODEX_PROTOCOL'],
        ['missing thread', [JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'x' } }), JSON.stringify({ type: 'turn.completed' }), ''], 'CODEX_PROTOCOL'],
        ['missing assistant', [JSON.stringify({ type: 'thread.started', thread_id: SESSION }), JSON.stringify({ type: 'turn.completed' }), ''], 'CODEX_RESULT_MISSING'],
        ['missing completion', [JSON.stringify({ type: 'thread.started', thread_id: SESSION }), JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'x' } }), ''], 'CODEX_PROTOCOL'],
    ])('rejects %s', async (_name, lines, code) => {
        const fixture = fakeSpawn(lines as string[]);
        await expect((await runner(fixture)).run({
            agent: agent(), prompt: 'x', onSpawn: vi.fn(), onSession: vi.fn(),
        })).rejects.toMatchObject({ code });
    });

    it('rejects oversized output, non-zero exit, and missing process identity without leaking stderr', async () => {
        const oversized = fakeSpawn([`${'x'.repeat(20)}\n`]);
        await expect((await runner(oversized, 10)).run({
            agent: agent(), prompt: 'x', onSpawn: vi.fn(), onSession: vi.fn(),
        })).rejects.toMatchObject({ code: 'CODEX_PROTOCOL' });

        const failed = fakeSpawn(events(), 1);
        failed.child.stderr.end('secret-looking provider diagnostic');
        await expect((await runner(failed)).run({
            agent: agent(), prompt: 'x', onSpawn: vi.fn(), onSession: vi.fn(),
        })).rejects.toMatchObject({ code: 'CODEX_PROCESS' });

        const missing = fakeSpawn([]);
        missing.child.pid = undefined;
        await expect((await runner(missing)).run({
            agent: agent(), prompt: 'x', onSpawn: vi.fn(), onSession: vi.fn(),
        })).rejects.toMatchObject({ code: 'CODEX_PROCESS' });
    });
});

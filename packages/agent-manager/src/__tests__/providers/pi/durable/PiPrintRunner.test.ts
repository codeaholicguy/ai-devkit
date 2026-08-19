import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import type { DurableAgent } from '../../../../index.js';

const SESSION = '22222222-2222-4222-8222-222222222222';
function agent(sessionHealth: DurableAgent['sessionHealth'] = 'uninitialized'): DurableAgent {
    return { id: '11111111-1111-4111-8111-111111111111', name: 'reviewer', provider: 'pi', mode: 'durable',
        cwd: '/project', providerSessionId: SESSION, state: 'running', sessionHealth, createdAt: '',
        updatedAt: '', lastActiveAt: null, lastResult: null, activeRun: null };
}
function fakeSpawn(lines: string[], exitCode = 0) {
    const promptChunks: Buffer[] = [];
    const child = new EventEmitter() as any;
    child.pid = 4242; child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kill = vi.fn();
    child.stdin = new Writable({
        write(chunk, _encoding, callback) { promptChunks.push(Buffer.from(chunk)); callback(); },
        final(callback) { child.stdout.end(lines.join('\n')); queueMicrotask(() => child.emit('close', exitCode, null)); callback(); },
    });
    return { child, spawn: vi.fn(() => child), promptChunks };
}
function events(session = SESSION): string[] { return [
    JSON.stringify({ type: 'session', version: 3, id: session, cwd: '/project' }),
    JSON.stringify({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text: 'first' }] } }),
    JSON.stringify({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'thinking', thinking: 'hidden' }, { type: 'text', text: 'final' }] } }),
    JSON.stringify({ type: 'agent_end', messages: [] }), '',
]; }
async function runner(fixture: ReturnType<typeof fakeSpawn>, maxLineBytes?: number) {
    const api = await import('../../../../index.js') as Record<string, unknown>;
    expect(api).toHaveProperty('PiPrintRunner');
    const Runner = api.PiPrintRunner as new (options: unknown) => any;
    return new Runner({ spawn: fixture.spawn, maxLineBytes, processInspector: { getIdentity: () => ({ pid: 4242, startedAt: 'start' }) } });
}

describe('PiPrintRunner', () => {
    it('binds a first session and returns the last completed assistant text', async () => {
        const fixture = fakeSpawn(events()); const instance = await runner(fixture); const order: string[] = [];
        const result = await instance.run({ agent: agent(), prompt: 'secret', executable: 'fake-pi',
            onSpawn: async () => { expect(fixture.promptChunks).toHaveLength(0); order.push('spawn'); } });
        expect(order).toEqual(['spawn']);
        expect(fixture.spawn).toHaveBeenCalledWith('fake-pi', ['--mode', 'json', '--session-id', SESSION], expect.objectContaining({ cwd: '/project', shell: false }));
        expect(Buffer.concat(fixture.promptChunks).toString()).toBe('secret');
        expect(result).toEqual({ sessionId: SESSION, result: 'final', messages: ['first', 'final'], exitCode: 0 });
    });

    it('resumes the exact stored session and rejects mismatch', async () => {
        const fixture = fakeSpawn(events('33333333-3333-4333-8333-333333333333'));
        await expect((await runner(fixture)).run({ agent: agent('healthy'), prompt: 'later', onSpawn: vi.fn() }))
            .rejects.toMatchObject({ code: 'PI_SESSION_MISMATCH' });
        expect(fixture.spawn.mock.calls[0]![1]).toEqual(['--mode', 'json', '--session', SESSION]);
    });

    it.each([
        ['malformed', ['{bad\n'], 'PI_PROTOCOL'], ['non-object', ['[]\n'], 'PI_PROTOCOL'],
        ['truncated', ['{}'], 'PI_PROTOCOL'], ['missing session', [JSON.stringify({ type: 'agent_end' }), ''], 'PI_PROTOCOL'],
        ['missing result', [JSON.stringify({ type: 'session', id: SESSION }), JSON.stringify({ type: 'agent_end' }), ''], 'PI_RESULT_MISSING'],
        ['missing end', [JSON.stringify({ type: 'session', id: SESSION }), JSON.stringify({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text: 'x' }] } }), ''], 'PI_PROTOCOL'],
    ])('rejects %s output', async (_name, lines, code) => {
        await expect((await runner(fakeSpawn(lines as string[]))).run({ agent: agent(), prompt: 'x', onSpawn: vi.fn() }))
            .rejects.toMatchObject({ code });
    });

    it('rejects oversized output, failed processes, and unverifiable identities', async () => {
        await expect((await runner(fakeSpawn(['x'.repeat(20)]), 10)).run({ agent: agent(), prompt: 'x', onSpawn: vi.fn() }))
            .rejects.toMatchObject({ code: 'PI_PROTOCOL' });
        await expect((await runner(fakeSpawn(events(), 1))).run({ agent: agent(), prompt: 'x', onSpawn: vi.fn() }))
            .rejects.toMatchObject({ code: 'PI_PROCESS' });
        const fixture = fakeSpawn([]); const api = await import('../../../../index.js') as Record<string, unknown>;
        const Runner = api.PiPrintRunner as new (options: unknown) => any;
        await expect(new Runner({ spawn: fixture.spawn, processInspector: { getIdentity: () => null } }).run({ agent: agent(), prompt: 'x', onSpawn: vi.fn() }))
            .rejects.toMatchObject({ code: 'PI_PROCESS' });
        expect(fixture.child.kill).toHaveBeenCalledOnce();
    });

    it('rejects invalid and duplicate session identities', async () => {
        for (const lines of [
            [JSON.stringify({ type: 'session', id: 'bad' }), ''],
            [JSON.stringify({ type: 'session', id: SESSION }), JSON.stringify({ type: 'session', id: SESSION }), ''],
        ]) await expect((await runner(fakeSpawn(lines))).run({ agent: agent(), prompt: 'x', onSpawn: vi.fn(), onSession: vi.fn() }))
            .rejects.toMatchObject({ code: 'PI_PROTOCOL' });
    });

    it('kills on spawn persistence failure', async () => {
        const spawnFailure = fakeSpawn([]); const failure = new Error('cannot persist');
        await expect((await runner(spawnFailure)).run({ agent: agent(), prompt: 'x', onSpawn: vi.fn().mockRejectedValue(failure), onSession: vi.fn() })).rejects.toBe(failure);
        expect(spawnFailure.child.kill).toHaveBeenCalledOnce();
    });

    it('classifies spawn errors and a missing PID as process failures', async () => {
        const errored = fakeSpawn([]);
        errored.child.stdin = new Writable({ write(_chunk, _encoding, callback) { callback(); }, final(callback) { queueMicrotask(() => errored.child.emit('error', new Error('spawn'))); callback(); } });
        await expect((await runner(errored)).run({ agent: agent(), prompt: 'x', onSpawn: vi.fn(), onSession: vi.fn() })).rejects.toMatchObject({ code: 'PI_PROCESS' });
        const missing = fakeSpawn([]); missing.child.pid = undefined;
        await expect((await runner(missing)).run({ agent: agent(), prompt: 'x', onSpawn: vi.fn(), onSession: vi.fn() })).rejects.toMatchObject({ code: 'PI_PROCESS' });
        expect(missing.child.kill).toHaveBeenCalledOnce();
    });

    it('accepts string assistant content and ignores empty or unrelated messages', async () => {
        const lines = [JSON.stringify({ type: 'session', id: SESSION }), JSON.stringify({ type: 'future' }),
            JSON.stringify({ type: 'message_end', message: { role: 'user', content: 'ignored' } }),
            JSON.stringify({ type: 'message_end', message: { role: 'assistant', content: ' ' } }),
            JSON.stringify({ type: 'message_end', message: { role: 'assistant', content: 'answer' } }),
            JSON.stringify({ type: 'agent_end' }), ''];
        await expect((await runner(fakeSpawn(lines))).run({ agent: agent(), prompt: 'x', onSpawn: vi.fn(), onSession: vi.fn() }))
            .resolves.toMatchObject({ result: 'answer' });
    });
});

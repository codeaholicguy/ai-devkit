import { describe, expect, it } from 'vitest';
import {
    buildCreateArgv,
    buildShowArgv,
    buildListArgv,
    buildPhaseArgv,
    buildStatusArgv,
    buildProgressArgv,
    buildNextArgv,
    buildBlockerAddArgv,
    buildBlockerResolveArgv,
    buildEvidenceArgv,
    buildArtifactArgv,
    buildAssignArgv,
    buildNoteArgv,
    buildEventArgv,
    buildCloseArgv,
} from '../src/cli-argv.js';

describe('cli-argv builders', () => {
    it('create', () => {
        expect(
            buildCreateArgv({ title: 'Auth', feature: 'auth', phase: 'design', tags: ['a', 'b'], branch: 'feature-auth' }),
        ).toEqual([
            'task', 'create', '--title', 'Auth',
            '--feature', 'auth', '--phase', 'design', '--tags', 'a,b', '--branch', 'feature-auth',
        ]);
    });

    it('create with --json global flag', () => {
        expect(buildCreateArgv({ title: 'T' }, { json: true })).toEqual([
            'task', 'create', '--title', 'T', '--json',
        ]);
    });

    it('show defaults to --json', () => {
        expect(buildShowArgv('task-1', { events: true })).toEqual(['task', 'show', 'task-1', '--events', '--json']);
    });

    it('list with filters', () => {
        expect(buildListArgv({ feature: 'auth', status: 'active', limit: 5 })).toEqual([
            'task', 'list', '--feature', 'auth', '--status', 'active', '--limit', '5', '--json',
        ]);
    });

    it('phase / status / next', () => {
        expect(buildPhaseArgv('task-1', 'implementation')).toEqual(['task', 'phase', 'task-1', 'implementation']);
        expect(buildStatusArgv('task-1', 'active')).toEqual(['task', 'status', 'task-1', 'active']);
        expect(buildNextArgv('task-1', 'do it')).toEqual(['task', 'next', 'task-1', 'do it']);
        expect(buildNextArgv('task-1', null)).toEqual(['task', 'next', 'task-1', '--clear']);
    });

    it('progress with text/percent and --clear', () => {
        expect(buildProgressArgv('task-1', { percent: 50, text: 'half' })).toEqual([
            'task', 'progress', 'task-1', '--text', 'half', '--percent', '50',
        ]);
        expect(buildProgressArgv('task-1', { clear: true })).toEqual(['task', 'progress', 'task-1', '--clear']);
    });

    it('blocker add/resolve', () => {
        expect(buildBlockerAddArgv('task-1', 'blocked')).toEqual(['task', 'blocker', 'task-1', 'add', 'blocked']);
        expect(buildBlockerResolveArgv('task-1', 'blk-1234')).toEqual(['task', 'blocker', 'task-1', 'resolve', 'blk-1234']);
    });

    it('evidence toggles --passed/--failed and repeats --artifact', () => {
        expect(
            buildEvidenceArgv('task-1', {
                command: 'nx test', exitCode: 0, passed: true, summary: 'green', artifacts: ['a.txt', 'b.txt'],
            }),
        ).toEqual([
            'task', 'evidence', 'task-1', '--passed',
            '--command', 'nx test', '--exit-code', '0', '--summary', 'green',
            '--artifact', 'a.txt', '--artifact', 'b.txt',
        ]);
        expect(buildEvidenceArgv('task-1', { passed: false })).toEqual([
            'task', 'evidence', 'task-1', '--failed',
        ]);
    });

    it('artifact with kind/description', () => {
        expect(buildArtifactArgv('task-1', 'src/x.ts', { kind: 'source', description: 'main' })).toEqual([
            'task', 'artifact', 'task-1', 'src/x.ts', '--kind', 'source', '--description', 'main',
        ]);
    });

    it('assign forwards only set actor fields', () => {
        expect(buildAssignArgv('task-1', { agentId: 'a', agentType: 'pi' })).toEqual([
            'task', 'assign', 'task-1', '--agent', 'a', '--agent-type', 'pi',
        ]);
    });

    it('note', () => {
        expect(buildNoteArgv('task-1', 'heads up')).toEqual(['task', 'note', 'task-1', 'heads up']);
    });

    it('event serializes payload as JSON', () => {
        const argv = buildEventArgv('task-1', 'task.custom', { name: 'tick', data: { ms: 1 } });
        expect(argv).toEqual(['task', 'event', 'task-1', '--type', 'task.custom', '--payload', JSON.stringify({ name: 'tick', data: { ms: 1 } })]);
        expect(JSON.parse(argv[argv.length - 1]!)).toMatchObject({ name: 'tick' });
    });

    it('close defaults to completed', () => {
        expect(buildCloseArgv('task-1')).toEqual(['task', 'close', 'task-1', 'completed']);
        expect(buildCloseArgv('task-1', 'abandoned')).toEqual(['task', 'close', 'task-1', 'abandoned']);
    });

    it('global flags append in contract order', () => {
        expect(buildPhaseArgv('task-1', 'design', { store: '/tmp/x', agent: 'a', agentType: 'pi', pid: 123, session: 's1' })).toEqual([
            'task', 'phase', 'task-1', 'design', '--store', '/tmp/x', '--agent', 'a', '--agent-type', 'pi', '--pid', '123', '--session', 's1',
        ]);
    });
});

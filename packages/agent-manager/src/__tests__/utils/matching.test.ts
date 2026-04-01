/**
 * Tests for utils/matching.ts
 */

import { describe, it, expect } from '@jest/globals';
import { matchProcessesToSessions, generateAgentName } from '../../utils/matching';
import type { ProcessInfo } from '../../adapters/AgentAdapter';
import type { SessionFile } from '../../utils/session';

function makeProcess(overrides: Partial<ProcessInfo> & { pid: number }): ProcessInfo {
    return {
        command: 'claude',
        cwd: '/projects/my-app',
        tty: 'ttys001',
        startTime: new Date('2026-03-18T23:18:01.000Z'),
        ...overrides,
    };
}

function makeSession(overrides: Partial<SessionFile> & { sessionId: string }): SessionFile {
    return {
        filePath: `/home/.claude/projects/my-app/${overrides.sessionId}.jsonl`,
        projectDir: '/home/.claude/projects/my-app',
        birthtimeMs: new Date('2026-03-18T23:18:44.000Z').getTime(),
        resolvedCwd: '/projects/my-app',
        ...overrides,
    };
}

describe('matchProcessesToSessions', () => {
    it('should return empty array when no processes', () => {
        const sessions = [makeSession({ sessionId: 's1' })];
        expect(matchProcessesToSessions([], sessions)).toEqual([]);
    });

    it('should return empty array when no sessions', () => {
        const processes = [makeProcess({ pid: 100 })];
        expect(matchProcessesToSessions(processes, [])).toEqual([]);
    });

    it('should match a single process to closest session', () => {
        const proc = makeProcess({ pid: 100, startTime: new Date('2026-03-18T23:18:01.000Z') });
        const s1 = makeSession({ sessionId: 's1', birthtimeMs: new Date('2026-03-18T23:18:44.000Z').getTime() });
        const s2 = makeSession({ sessionId: 's2', birthtimeMs: new Date('2026-03-18T23:20:00.000Z').getTime() });

        const results = matchProcessesToSessions([proc], [s1, s2]);
        expect(results).toHaveLength(1);
        expect(results[0].session.sessionId).toBe('s1');
        expect(results[0].deltaMs).toBe(43000);
    });

    it('should enforce 1:1 constraint — each process matches only one session', () => {
        const p1 = makeProcess({ pid: 100, startTime: new Date('2026-03-18T23:18:01.000Z') });
        const p2 = makeProcess({ pid: 200, startTime: new Date('2026-03-18T23:18:30.000Z') });
        const s1 = makeSession({ sessionId: 's1', birthtimeMs: new Date('2026-03-18T23:18:10.000Z').getTime() });
        const s2 = makeSession({ sessionId: 's2', birthtimeMs: new Date('2026-03-18T23:18:35.000Z').getTime() });

        const results = matchProcessesToSessions([p1, p2], [s1, s2]);
        expect(results).toHaveLength(2);

        const pids = results.map(r => r.process.pid).sort();
        const sids = results.map(r => r.session.sessionId).sort();
        expect(pids).toEqual([100, 200]);
        expect(sids).toEqual(['s1', 's2']);
    });

    it('should disambiguate multiple processes with same CWD by birthtime', () => {
        const p1 = makeProcess({ pid: 100, startTime: new Date('2026-03-18T23:18:01.000Z') });
        const p2 = makeProcess({ pid: 200, startTime: new Date('2026-03-19T08:53:11.000Z') });
        const s1 = makeSession({ sessionId: 's1', birthtimeMs: new Date('2026-03-18T23:18:44.000Z').getTime() });
        const s2 = makeSession({ sessionId: 's2', birthtimeMs: new Date('2026-03-19T08:55:35.000Z').getTime() });

        const results = matchProcessesToSessions([p1, p2], [s1, s2]);
        expect(results).toHaveLength(2);

        const match1 = results.find(r => r.process.pid === 100);
        const match2 = results.find(r => r.process.pid === 200);
        expect(match1?.session.sessionId).toBe('s1');
        expect(match2?.session.sessionId).toBe('s2');
    });

    it('should exclude processes without startTime', () => {
        const proc = makeProcess({ pid: 100, startTime: undefined });
        const session = makeSession({ sessionId: 's1' });

        const results = matchProcessesToSessions([proc], [session]);
        expect(results).toEqual([]);
    });

    it('should exclude processes without cwd', () => {
        const proc = makeProcess({ pid: 100, cwd: '' });
        const session = makeSession({ sessionId: 's1' });

        const results = matchProcessesToSessions([proc], [session]);
        expect(results).toEqual([]);
    });

    it('should not match when CWD does not match resolvedCwd', () => {
        const proc = makeProcess({ pid: 100, cwd: '/projects/app-a' });
        const session = makeSession({ sessionId: 's1', resolvedCwd: '/projects/app-b' });

        const results = matchProcessesToSessions([proc], [session]);
        expect(results).toEqual([]);
    });

    it('should not match when delta exceeds 3-minute tolerance', () => {
        const proc = makeProcess({ pid: 100, startTime: new Date('2026-03-18T23:18:01.000Z') });
        const session = makeSession({
            sessionId: 's1',
            birthtimeMs: new Date('2026-03-18T23:22:00.000Z').getTime(), // ~4 min later
        });

        const results = matchProcessesToSessions([proc], [session]);
        expect(results).toEqual([]);
    });

    it('should match at exactly 3-minute boundary', () => {
        const startTime = new Date('2026-03-18T23:18:00.000Z');
        const proc = makeProcess({ pid: 100, startTime });
        const session = makeSession({
            sessionId: 's1',
            birthtimeMs: startTime.getTime() + 180_000, // exactly 3 min
        });

        const results = matchProcessesToSessions([proc], [session]);
        expect(results).toHaveLength(1);
    });

    it('should handle more sessions than processes', () => {
        const proc = makeProcess({ pid: 100, startTime: new Date('2026-03-18T23:18:01.000Z') });
        const s1 = makeSession({ sessionId: 's1', birthtimeMs: new Date('2026-03-18T23:18:44.000Z').getTime() });
        const s2 = makeSession({ sessionId: 's2', birthtimeMs: new Date('2026-03-18T23:19:00.000Z').getTime() });
        const s3 = makeSession({ sessionId: 's3', birthtimeMs: new Date('2026-03-18T23:19:30.000Z').getTime() });

        const results = matchProcessesToSessions([proc], [s1, s2, s3]);
        expect(results).toHaveLength(1);
        expect(results[0].session.sessionId).toBe('s1'); // closest
    });

    it('should handle more processes than sessions', () => {
        const p1 = makeProcess({ pid: 100, startTime: new Date('2026-03-18T23:18:01.000Z') });
        const p2 = makeProcess({ pid: 200, startTime: new Date('2026-03-18T23:20:01.000Z') });
        const s1 = makeSession({ sessionId: 's1', birthtimeMs: new Date('2026-03-18T23:18:44.000Z').getTime() });

        const results = matchProcessesToSessions([p1, p2], [s1]);
        expect(results).toHaveLength(1);
        expect(results[0].process.pid).toBe(100); // closest
    });

    it('should skip sessions with empty resolvedCwd', () => {
        const proc = makeProcess({ pid: 100 });
        const session = makeSession({ sessionId: 's1', resolvedCwd: '' });

        const results = matchProcessesToSessions([proc], [session]);
        expect(results).toEqual([]);
    });

    it('should prefer best match when greedy ordering matters', () => {
        // p1 is 10s from s2, p2 is 5s from s2 — p2 should win s2, p1 gets s1
        const p1 = makeProcess({ pid: 100, startTime: new Date('2026-03-18T23:18:00.000Z') });
        const p2 = makeProcess({ pid: 200, startTime: new Date('2026-03-18T23:18:25.000Z') });
        const s1 = makeSession({ sessionId: 's1', birthtimeMs: new Date('2026-03-18T23:18:08.000Z').getTime() });
        const s2 = makeSession({ sessionId: 's2', birthtimeMs: new Date('2026-03-18T23:18:30.000Z').getTime() });

        const results = matchProcessesToSessions([p1, p2], [s1, s2]);
        expect(results).toHaveLength(2);

        const match1 = results.find(r => r.process.pid === 200);
        const match2 = results.find(r => r.process.pid === 100);
        expect(match1?.session.sessionId).toBe('s2'); // 5s delta
        expect(match2?.session.sessionId).toBe('s1'); // 8s delta
    });
});

describe('generateAgentName', () => {
    it('should return lowercase kebab-case name with pid', () => {
        expect(generateAgentName('/projects/my-app', 12345)).toBe('my-app-12345');
    });

    it('should handle root path', () => {
        expect(generateAgentName('/', 100)).toBe('unknown-100');
    });

    it('should handle empty cwd', () => {
        expect(generateAgentName('', 100)).toBe('unknown-100');
    });

    it('should handle nested paths', () => {
        expect(generateAgentName('/home/user/projects/ai-devkit', 78070)).toBe('ai-devkit-78070');
    });

    it('should convert spaces and special chars to kebab-case', () => {
        expect(generateAgentName('/projects/AI DevKit', 123)).toBe('ai-devkit-123');
    });

    it('should convert uppercase to lowercase', () => {
        expect(generateAgentName('/projects/MyProject', 456)).toBe('myproject-456');
    });
});

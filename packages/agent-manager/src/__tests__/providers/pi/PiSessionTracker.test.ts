import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { ProcessInfo } from '../../../adapters/AgentAdapter.js';
import { PiSessionTracker } from '../../../providers/pi/PiSessionTracker.js';

describe('PiSessionTracker', () => {
    let tmpHome: string;
    let sessionsDir: string;
    let trackerPath: string;
    let tracker: PiSessionTracker;

    beforeEach(() => {
        tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-tracker-test-'));
        sessionsDir = path.join(tmpHome, '.pi', 'agent', 'sessions');
        trackerPath = path.join(tmpHome, '.pi', 'agent', 'sessions.json');
        fs.mkdirSync(sessionsDir, { recursive: true });
        tracker = new PiSessionTracker({ sessionsDir, trackerPath });
    });

    afterEach(() => {
        fs.rmSync(tmpHome, { recursive: true, force: true });
    });

    it('matches trusted tracker session files by PID', () => {
        const proc = makeProcess({ pid: 101 });
        const sessionFile = writeSessionFile('project-a/session.jsonl');
        writeTracker({ 101: sessionFile });

        expect(tracker.match([proc])).toEqual({
            matches: [{ process: proc, filePath: sessionFile }],
            fallback: [],
        });
    });

    it('ignores malformed tracker metadata', () => {
        const proc = makeProcess({ pid: 303 });
        fs.writeFileSync(trackerPath, '{bad json');

        expect(tracker.match([proc])).toEqual({
            matches: [],
            fallback: [proc],
        });
    });

    it('does not trust tracker paths outside the Pi sessions directory', () => {
        const proc = makeProcess({ pid: 404 });
        const outside = path.join(tmpHome, 'outside.jsonl');
        fs.writeFileSync(outside, JSON.stringify({ role: 'user', content: 'nope' }));
        writeTracker({ 404: outside });

        expect(tracker.match([proc])).toEqual({
            matches: [],
            fallback: [proc],
        });
    });

    function makeProcess(overrides: Partial<ProcessInfo>): ProcessInfo {
        return {
            pid: 1,
            command: 'pi',
            cwd: '/repo',
            tty: 'ttys001',
            ...overrides,
        };
    }

    function writeTracker(entries: Record<number, string>): void {
        fs.writeFileSync(trackerPath, JSON.stringify(entries));
    }

    function writeSessionFile(relativePath: string): string {
        const filePath = path.join(sessionsDir, relativePath);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, JSON.stringify({ role: 'user', content: 'hello' }));
        return filePath;
    }
});

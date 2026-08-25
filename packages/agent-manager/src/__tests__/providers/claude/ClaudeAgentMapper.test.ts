import { describe, expect, it } from 'vitest';

import { AgentStatus, type ProcessInfo } from '../../../adapters/AgentAdapter.js';
import { ClaudeAgentMapper } from '../../../providers/claude/ClaudeAgentMapper.js';
import type { ClaudeSession } from '../../../providers/claude/ClaudeSessionParser.js';
import type { SessionFile } from '../../../utils/session.js';

function makeProcess(overrides: Partial<ProcessInfo> = {}): ProcessInfo {
    return {
        pid: 123,
        command: 'claude',
        cwd: '/repo/my-app',
        tty: 'ttys001',
        ...overrides,
    };
}

function makeSession(overrides: Partial<ClaudeSession> = {}): ClaudeSession {
    return {
        sessionId: 'session-1',
        projectPath: '/repo/my-app',
        sessionStart: new Date('2026-08-23T10:00:00.000Z'),
        lastActive: new Date('2026-08-23T10:05:00.000Z'),
        lastEntryType: 'assistant',
        isInterrupted: false,
        lastUserMessage: 'Review this change',
        ...overrides,
    };
}

function makeSessionFile(overrides: Partial<SessionFile> = {}): SessionFile {
    return {
        sessionId: 'session-1',
        filePath: '/home/.claude/projects/-repo-my-app/session-1.jsonl',
        projectDir: '/home/.claude/projects/-repo-my-app',
        birthtimeMs: new Date('2026-08-23T10:00:00.000Z').getTime(),
        resolvedCwd: '/repo/my-app',
        ...overrides,
    };
}

describe('ClaudeAgentMapper', () => {
    it('prefers live PID-file status and waiting reason over JSONL-derived status', () => {
        const mapper = new ClaudeAgentMapper();

        const agent = mapper.mapSessionToAgent({
            session: makeSession({ lastEntryType: 'assistant' }),
            processInfo: makeProcess(),
            sessionFile: makeSessionFile(),
            liveInfo: {
                pidStatus: AgentStatus.WAITING,
                waitingFor: 'approve Read',
            },
        });

        expect(agent).toMatchObject({
            name: 'my-app-123',
            type: 'claude',
            status: AgentStatus.WAITING,
            summary: 'Review this change — waiting for approve Read',
            pid: 123,
            projectPath: '/repo/my-app',
            sessionId: 'session-1',
            sessionFilePath: '/home/.claude/projects/-repo-my-app/session-1.jsonl',
        });
    });

    it('maps unmatched processes to the existing process-only fallback shape', () => {
        const mapper = new ClaudeAgentMapper();

        const agent = mapper.mapProcessOnlyAgent(makeProcess({ pid: 456, cwd: '/repo/tooling' }));

        expect(agent).toMatchObject({
            name: 'tooling-456',
            type: 'claude',
            status: AgentStatus.IDLE,
            summary: 'Unknown',
            pid: 456,
            projectPath: '/repo/tooling',
            sessionId: 'pid-456',
        });
        expect(agent.lastActive).toBeInstanceOf(Date);
    });
});

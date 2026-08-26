import { ClaudePrintError } from '../../../durable/DurableAgent.js';
import { LineBuffer, type ChildCloseResult } from '../../../durable/utils.js';
import type { ClaudePrintRunResult } from './ClaudePrintRunner.js';

export class ClaudeStreamParser {
    private readonly lines: LineBuffer;
    private terminal: ClaudePrintRunResult | null = null;
    private protocolError: ClaudePrintError | null = null;

    constructor(
        private readonly expectedSessionId: string,
        maxLineBytes: number,
    ) {
        this.lines = new LineBuffer(
            maxLineBytes,
            () => new ClaudePrintError('Claude stream line exceeded the safety limit.', 'CLAUDE_STREAM_OVERSIZED'),
        );
    }

    hasFailed(): boolean {
        return this.protocolError !== null;
    }

    accept(chunk: Buffer | string): void {
        for (const line of this.lines.accept(chunk)) {
            this.processLine(line);
        }
    }

    fail(error: unknown): void {
        this.protocolError = error instanceof ClaudePrintError
            ? error
            : new ClaudePrintError('Claude stream processing failed.', 'CLAUDE_STREAM_INVALID');
    }

    result(close: ChildCloseResult): ClaudePrintRunResult {
        if (this.protocolError) throw this.protocolError;
        this.lines.assertComplete(() => new ClaudePrintError('Claude stream ended with incomplete JSON.', 'CLAUDE_STREAM_INVALID'));
        if (close.code !== 0) {
            throw new ClaudePrintError(
                `Claude print run failed${close.signal ? ` (${close.signal})` : '.'}`,
                'CLAUDE_PROCESS_FAILED',
            );
        }
        if (!this.terminal) throw new ClaudePrintError('Claude stream ended without a terminal result.', 'CLAUDE_RESULT_MISSING');
        return { sessionId: this.terminal.sessionId, result: this.terminal.result, exitCode: close.code };
    }

    private processLine(line: Buffer): void {
        if (line.length === 0) return;

        const event = this.parseEvent(line);
        if (typeof event.session_id === 'string' && event.session_id !== this.expectedSessionId) {
            throw new ClaudePrintError('Claude returned a different session identity.', 'CLAUDE_SESSION_MISMATCH');
        }
        if (event.type === 'result') this.recordTerminalResult(event);
    }

    private parseEvent(line: Buffer): Record<string, unknown> {
        let value: unknown;
        try {
            value = JSON.parse(line.toString('utf8'));
        } catch {
            throw new ClaudePrintError('Claude emitted malformed stream JSON.', 'CLAUDE_STREAM_INVALID');
        }
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            throw new ClaudePrintError('Claude emitted a non-object stream message.', 'CLAUDE_STREAM_INVALID');
        }
        return value as Record<string, unknown>;
    }

    private recordTerminalResult(event: Record<string, unknown>): void {
        if (this.terminal) throw new ClaudePrintError('Claude emitted more than one terminal result.', 'CLAUDE_STREAM_INVALID');
        if (typeof event.session_id !== 'string' || typeof event.result !== 'string') {
            throw new ClaudePrintError('Claude emitted an invalid terminal result.', 'CLAUDE_STREAM_INVALID');
        }
        this.terminal = { sessionId: event.session_id, result: event.result, exitCode: 0 };
    }
}

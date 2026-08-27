import { PiPrintError } from '../../../durable/DurableAgent.js';
import { LineBuffer, type ChildCloseResult } from '../../../durable/utils.js';
import { readPiAssistantText, readPiSessionId } from './PiPrintProtocol.js';

export class PiStreamParser {
    private readonly lines: LineBuffer;
    private sessionId: string | null = null;
    private ended = false;
    private readonly messages: string[] = [];
    private failure: PiPrintError | null = null;

    constructor(
        private readonly expectedSessionId: string,
        maxLineBytes: number,
    ) {
        this.lines = new LineBuffer(
            maxLineBytes,
            () => new PiPrintError('Pi stream line exceeded the safety limit.', 'PI_PROTOCOL'),
        );
    }

    hasFailed(): boolean {
        return this.failure !== null;
    }

    accept(chunk: Buffer | string): void {
        for (const line of this.lines.accept(chunk)) {
            if (line.length === 0) continue;
            this.acceptLine(line);
        }
    }

    fail(error: unknown): void {
        this.failure = error instanceof PiPrintError
            ? error
            : new PiPrintError('Pi stream processing failed.', 'PI_PROTOCOL');
    }

    result(close: ChildCloseResult): { sessionId: string; result: string; messages: string[]; exitCode: number } {
        if (this.failure) throw this.failure;
        this.lines.assertComplete(
            () => new PiPrintError('Pi stream ended with incomplete JSON.', 'PI_PROTOCOL'),
        );
        if (close.code !== 0) {
            throw new PiPrintError(`Pi print run failed${close.signal ? ` (${close.signal})` : '.'}`, 'PI_PROCESS');
        }
        if (this.sessionId === null) {
            throw new PiPrintError('Pi stream ended without a session identity.', 'PI_PROTOCOL');
        }
        if (!this.ended) throw new PiPrintError('Pi stream ended before agent completion.', 'PI_PROTOCOL');
        if (this.messages.length === 0) {
            throw new PiPrintError('Pi stream ended without an assistant result.', 'PI_RESULT_MISSING');
        }
        return {
            sessionId: this.sessionId,
            result: this.messages.at(-1)!,
            messages: this.messages,
            exitCode: close.code,
        };
    }

    private acceptLine(line: Buffer): void {
        let value: unknown;
        try {
            value = JSON.parse(line.toString('utf8'));
        } catch {
            throw new PiPrintError('Pi emitted malformed stream JSON.', 'PI_PROTOCOL');
        }
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            throw new PiPrintError('Pi emitted a non-object stream message.', 'PI_PROTOCOL');
        }
        const event = value as Record<string, unknown>;
        if (event.type === 'session') {
            this.sessionId = readPiSessionId(event, this.sessionId, this.expectedSessionId);
            return;
        }
        if (event.type === 'agent_end') {
            this.ended = true;
            return;
        }
        const text = readPiAssistantText(event);
        if (text !== null) this.messages.push(text);
    }
}

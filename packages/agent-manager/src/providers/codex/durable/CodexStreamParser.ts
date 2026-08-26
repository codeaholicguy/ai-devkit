import { CodexPrintError } from '../../../durable/DurableAgent.js';
import { isUuid, LineBuffer, type ChildCloseResult } from '../../../durable/utils.js';
import type { CodexPrintRunResult } from './CodexPrintRunner.js';

export class CodexStreamParser {
    private readonly lines: LineBuffer;
    private sessionId: string | null = null;
    private turnCompleted = false;
    private readonly messages: string[] = [];
    private protocolError: CodexPrintError | null = null;

    constructor(
        private readonly expectedSessionId: string | null,
        private readonly onSession: (providerSessionId: string) => Promise<void>,
        maxLineBytes: number,
    ) {
        this.lines = new LineBuffer(
            maxLineBytes,
            () => new CodexPrintError('Codex stream line exceeded the safety limit.', 'CODEX_PROTOCOL'),
        );
    }

    hasFailed(): boolean {
        return this.protocolError !== null;
    }

    async accept(chunk: Buffer | string): Promise<void> {
        for (const line of this.lines.accept(chunk)) {
            await this.processLine(line);
        }
    }

    fail(error: unknown): void {
        this.protocolError = error instanceof CodexPrintError
            ? error
            : new CodexPrintError('Codex stream processing failed.', 'CODEX_PROTOCOL');
    }

    result(close: ChildCloseResult): CodexPrintRunResult {
        if (this.protocolError) throw this.protocolError;
        this.lines.assertComplete(
            () => new CodexPrintError('Codex stream ended with incomplete JSON.', 'CODEX_PROTOCOL'),
        );

        if (close.code !== 0) {
            throw new CodexPrintError(`Codex print run failed${close.signal ? ` (${close.signal})` : '.'}`, 'CODEX_PROCESS');
        }
        if (this.sessionId === null) throw new CodexPrintError('Codex stream ended without a thread identity.', 'CODEX_PROTOCOL');
        if (!this.turnCompleted) throw new CodexPrintError('Codex stream ended before turn completion.', 'CODEX_PROTOCOL');
        if (this.messages.length === 0) throw new CodexPrintError('Codex stream ended without an assistant result.', 'CODEX_RESULT_MISSING');
        return {
            sessionId: this.sessionId,
            result: this.messages.at(-1)!,
            messages: this.messages,
            exitCode: close.code,
        };
    }

    private async processLine(line: Buffer): Promise<void> {
        if (this.protocolError || line.length === 0) return;

        const event = this.parseEvent(line);
        if (event.type === 'thread.started') {
            await this.recordSession(event);
        } else if (event.type === 'item.completed') {
            this.recordAssistantMessage(event.item);
        } else if (event.type === 'turn.completed') {
            this.turnCompleted = true;
        }
    }

    private parseEvent(line: Buffer): Record<string, unknown> {
        let value: unknown;
        try {
            value = JSON.parse(line.toString('utf8'));
        } catch {
            throw new CodexPrintError('Codex emitted malformed stream JSON.', 'CODEX_PROTOCOL');
        }
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            throw new CodexPrintError('Codex emitted a non-object stream message.', 'CODEX_PROTOCOL');
        }
        return value as Record<string, unknown>;
    }

    private async recordSession(event: Record<string, unknown>): Promise<void> {
        const sessionId = String(event.thread_id ?? '');
        if (this.sessionId !== null || !isUuid(sessionId)) {
            throw new CodexPrintError('Codex emitted an invalid thread identity.', 'CODEX_PROTOCOL');
        }
        if (this.expectedSessionId !== null && this.expectedSessionId !== sessionId) {
            throw new CodexPrintError('Codex returned a different session identity.', 'CODEX_SESSION_MISMATCH');
        }
        this.sessionId = sessionId;
        await this.onSession(sessionId);
    }

    private recordAssistantMessage(item: unknown): void {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return;
        const record = item as Record<string, unknown>;
        if (record.type === 'agent_message' && typeof record.text === 'string' && record.text.trim()) {
            this.messages.push(record.text);
        }
    }
}

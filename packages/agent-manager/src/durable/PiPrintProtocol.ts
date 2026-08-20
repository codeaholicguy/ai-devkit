import { PiPrintError } from './DurableAgent.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function buildPiPrintArgs(providerSessionId: string, firstRun: boolean): string[] {
    return firstRun
        ? ['--mode', 'json', '--session-id', providerSessionId]
        : ['--mode', 'json', '--session', providerSessionId];
}

export function readPiSessionId(
    event: Record<string, unknown>,
    currentSessionId: string | null,
    expectedSessionId: string,
): string {
    if (currentSessionId !== null || !UUID_PATTERN.test(String(event.id ?? ''))) {
        throw new PiPrintError('Pi emitted an invalid session identity.', 'PI_PROTOCOL');
    }
    const sessionId = event.id as string;
    if (expectedSessionId !== sessionId) {
        throw new PiPrintError('Pi returned a different session identity.', 'PI_SESSION_MISMATCH');
    }
    return sessionId;
}

export function readPiAssistantText(event: Record<string, unknown>): string | null {
    if (event.type !== 'message_end') return null;
    const message = event.message;
    if (!message || typeof message !== 'object' || Array.isArray(message)) return null;
    const record = message as Record<string, unknown>;
    if (record.role !== 'assistant') return null;
    if (typeof record.content === 'string') return record.content.trim() ? record.content : null;
    if (!Array.isArray(record.content)) return null;
    const text = record.content.flatMap((part) => {
        if (!part || typeof part !== 'object' || Array.isArray(part)) return [];
        const block = part as Record<string, unknown>;
        return block.type === 'text' && typeof block.text === 'string' ? [block.text] : [];
    }).join('');
    return text.trim() ? text : null;
}

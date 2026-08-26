import type { ChildProcessWithoutNullStreams } from 'child_process';

export interface ChildCloseResult {
    code: number | null;
    signal: NodeJS.Signals | null;
}

export function waitForChildClose(child: ChildProcessWithoutNullStreams): Promise<ChildCloseResult> {
    return new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('close', (code, signal) => resolve({ code, signal }));
    });
}

export function sanitizeText(
    value: string,
    max: number,
    options: { preserveFormatting?: boolean } = {},
): string {
    return Array.from(value, (character) => {
        const code = character.charCodeAt(0);
        if (options.preserveFormatting && (code === 9 || code === 10 || code === 13)) return character;
        return code <= 31 || code === 127 ? ' ' : character;
    }).join('').trim().slice(0, max);
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
    return UUID_PATTERN.test(value);
}

export class LineBuffer {
    private buffer = Buffer.alloc(0);

    constructor(
        private readonly maxLineBytes: number,
        private readonly createOversizedLineError: () => Error,
    ) {}

    accept(chunk: Buffer | string): Buffer[] {
        this.buffer = Buffer.concat([this.buffer, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
        if (this.buffer.length > this.maxLineBytes && this.buffer.indexOf(0x0a) < 0) {
            throw this.createOversizedLineError();
        }

        const lines: Buffer[] = [];
        let newline: number;
        while ((newline = this.buffer.indexOf(0x0a)) >= 0) {
            const line = this.buffer.subarray(0, newline);
            this.buffer = this.buffer.subarray(newline + 1);
            if (line.length > this.maxLineBytes) throw this.createOversizedLineError();
            lines.push(line);
        }
        return lines;
    }

    assertComplete(createIncompleteLineError: () => Error): void {
        if (this.buffer.length > 0) throw createIncompleteLineError();
    }
}

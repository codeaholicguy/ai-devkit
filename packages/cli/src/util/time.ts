const MS_PATTERN = /^\d+$/;
const MILLISECONDS_ERROR = 'Expected positive integer milliseconds.';

export interface ParsedMilliseconds {
    milliseconds: number;
    label?: string;
}

export function sleep(ms: number): Promise<void> {
    if (ms <= 0) return Promise.resolve();
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export function formatLocalDate(date: Date = new Date()): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
}

export function parseMilliseconds(value: string | undefined, defaultMs: number): ParsedMilliseconds {
    if (value === undefined) {
        return { milliseconds: defaultMs };
    }

    const trimmed = value.trim();
    if (!MS_PATTERN.test(trimmed)) {
        throw new Error(MILLISECONDS_ERROR);
    }

    const milliseconds = Number(trimmed);
    if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
        throw new Error(MILLISECONDS_ERROR);
    }

    return { milliseconds, label: `${milliseconds}ms` };
}

import { execFile } from 'child_process';
import { promisify } from 'util';
import { HerdrRuntimeError } from './HerdrErrors.js';
import { herdrErrorFromResponse } from './HerdrResponseParsers.js';

const execFileAsync = promisify(execFile);

export interface HerdrCommandResult {
    stdout: string;
    stderr: string;
}

export type HerdrCommandRunner = (command: string, args: string[]) => Promise<HerdrCommandResult>;

export class HerdrCliClient {
    constructor(private readonly runner: HerdrCommandRunner = defaultRunner) {}

    run(args: string[]): Promise<HerdrCommandResult> {
        return this.runner('herdr', args);
    }

    async runJson(args: string[]): Promise<unknown> {
        let stdout: string;
        try {
            ({ stdout } = await this.run(args));
        } catch (error) {
            throw parseHerdrCommandError(error);
        }
        try {
            const parsed = JSON.parse(stdout) as unknown;
            const herdrError = herdrErrorFromResponse(parsed);
            if (herdrError) throw herdrError;
            return parsed;
        } catch (error) {
            if (error instanceof HerdrRuntimeError) throw error;
            throw new HerdrRuntimeError(`Herdr returned invalid JSON: ${(error as Error).message}`);
        }
    }
}

export function isCommandMissing(error: unknown): boolean {
    return Boolean(error && typeof error === 'object' && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT');
}

function defaultRunner(command: string, args: string[]): Promise<HerdrCommandResult> {
    return execFileAsync(command, args).then(({ stdout, stderr }) => ({ stdout, stderr }));
}

function parseHerdrCommandError(error: unknown): HerdrRuntimeError {
    const stdout = typeof error === 'object' && error && 'stdout' in error
        ? String((error as { stdout?: unknown }).stdout ?? '')
        : '';
    const stderr = typeof error === 'object' && error && 'stderr' in error
        ? String((error as { stderr?: unknown }).stderr ?? '')
        : '';
    const parsed = parseJson(stdout) ?? parseJson(stderr);
    if (parsed) {
        const herdrError = herdrErrorFromResponse(parsed);
        if (herdrError) return herdrError;
    }
    return new HerdrRuntimeError((error as Error).message);
}

function parseJson(value: string): unknown | null {
    if (!value.trim()) return null;
    try {
        return JSON.parse(value) as unknown;
    } catch {
        return null;
    }
}

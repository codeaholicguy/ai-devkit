import { execFile } from 'child_process';
import { promisify } from 'util';
import { CodexPrintError } from '../../../durable/DurableAgent.js';
import { sanitizeText } from '../../../durable/utils.js';

type ExecResult = { stdout: string; stderr: string };
type Exec = (file: string, args: string[]) => Promise<ExecResult>;

const execFileAsync = promisify(execFile);

export interface CodexCliProbeOptions {
    executable?: string;
    exec?: Exec;
}

export class CodexCliProbe {
    private readonly executable: string;
    private readonly exec: Exec;

    constructor(options: CodexCliProbeOptions = {}) {
        this.executable = options.executable ?? 'codex';
        this.exec = options.exec ?? (async (file, args) => {
            const result = await execFileAsync(file, args, { encoding: 'utf8', maxBuffer: 1024 * 1024 });
            return { stdout: result.stdout, stderr: result.stderr };
        });
    }

    async validate(): Promise<{ executable: string; version: string }> {
        try {
            const version = await this.exec(this.executable, ['--version']);
            const execHelp = await this.exec(this.executable, ['exec', '--help']);
            const resumeHelp = await this.exec(this.executable, ['exec', 'resume', '--help']);
            const missing = [
                !execHelp.stdout.includes('exec') && 'exec',
                !execHelp.stdout.includes('--json') && '--json',
                !hasStdinDash(execHelp.stdout) && 'stdin -',
                !resumeHelp.stdout.includes('resume') && 'resume',
                !resumeHelp.stdout.includes('--json') && 'resume --json',
                !hasStdinDash(resumeHelp.stdout) && 'resume stdin -',
            ].filter((value): value is string => typeof value === 'string');
            if (missing.length > 0) {
                throw new CodexPrintError(
                    `Codex CLI does not support required print-mode capabilities: ${missing.join(', ')}.`,
                    'CODEX_CLI_UNSUPPORTED',
                );
            }
            return { executable: this.executable, version: sanitizeText(version.stdout, 256) || 'unknown' };
        } catch (error) {
            if (error instanceof CodexPrintError) throw error;
            throw new CodexPrintError(
                `Codex CLI validation failed: ${sanitizeText((error as Error).message, 512)}`,
                'CODEX_CLI_UNAVAILABLE',
            );
        }
    }
}

function hasStdinDash(help: string): boolean {
    return /(?:^|\s)-(?:\s|$)/m.test(help);
}

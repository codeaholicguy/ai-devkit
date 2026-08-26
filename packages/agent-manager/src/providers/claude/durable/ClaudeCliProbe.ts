import { execFile } from 'child_process';
import { promisify } from 'util';
import { ClaudePrintError } from '../../../durable/DurableAgent.js';
import { sanitizeText } from '../../../durable/utils.js';

type ExecResult = { stdout: string; stderr: string };
type Exec = (file: string, args: string[]) => Promise<ExecResult>;

const execFileAsync = promisify(execFile);
const REQUIRED = ['--print', '--session-id', '--resume', '--output-format', 'stream-json'];

export interface ClaudeCliProbeOptions {
    executable?: string;
    exec?: Exec;
}

export class ClaudeCliProbe {
    private readonly executable: string;
    private readonly exec: Exec;

    constructor(options: ClaudeCliProbeOptions = {}) {
        this.executable = options.executable ?? 'claude';
        this.exec = options.exec ?? (async (file, args) => {
            const result = await execFileAsync(file, args, { encoding: 'utf8', maxBuffer: 1024 * 1024 });
            return { stdout: result.stdout, stderr: result.stderr };
        });
    }

    async validate(): Promise<{ executable: string; version: string }> {
        try {
            const versionResult = await this.exec(this.executable, ['--version']);
            const helpResult = await this.exec(this.executable, ['--help']);
            const missing = REQUIRED.filter((capability) => !helpResult.stdout.includes(capability));
            if (missing.length > 0) {
                throw new ClaudePrintError(
                    `Claude CLI does not support required print-mode capabilities: ${missing.join(', ')}.`,
                    'CLAUDE_CLI_UNSUPPORTED',
                );
            }
            return {
                executable: this.executable,
                version: sanitizeText(versionResult.stdout, 256) || 'unknown',
            };
        } catch (error) {
            if (error instanceof ClaudePrintError) throw error;
            throw new ClaudePrintError(
                `Claude CLI validation failed: ${sanitizeText((error as Error).message, 512)}`,
                'CLAUDE_CLI_UNAVAILABLE',
            );
        }
    }
}

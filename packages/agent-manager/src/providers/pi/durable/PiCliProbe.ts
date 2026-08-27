import { execFile } from 'child_process';
import { promisify } from 'util';
import { PiPrintError } from '../../../durable/DurableAgent.js';
import { sanitizeText } from '../../../durable/utils.js';

type ExecResult = { stdout: string; stderr: string };
type Exec = (file: string, args: string[]) => Promise<ExecResult>;
const execFileAsync = promisify(execFile);
const REQUIRED = ['--mode', 'json', '--session-id', '--session'];

export interface PiCliProbeOptions { executable?: string; exec?: Exec }

export class PiCliProbe {
    private readonly executable: string;
    private readonly exec: Exec;
    constructor(options: PiCliProbeOptions = {}) {
        this.executable = options.executable ?? 'pi';
        this.exec = options.exec ?? (async (file, args) => {
            const result = await execFileAsync(file, args, { encoding: 'utf8', maxBuffer: 1024 * 1024 });
            return { stdout: result.stdout, stderr: result.stderr };
        });
    }
    async validate(): Promise<{ executable: string; version: string }> {
        try {
            const version = await this.exec(this.executable, ['--version']);
            const help = await this.exec(this.executable, ['--help']);
            const missing = REQUIRED.filter((capability) => !help.stdout.includes(capability));
            if (missing.length) throw new PiPrintError(
                `Pi CLI does not support required print-mode capabilities: ${missing.join(', ')}.`, 'PI_CLI_UNSUPPORTED');
            return { executable: this.executable, version: sanitizeText(version.stdout, 256) || 'unknown' };
        } catch (error) {
            if (error instanceof PiPrintError) throw error;
            throw new PiPrintError(`Pi CLI validation failed: ${sanitizeText((error as Error).message, 512)}`, 'PI_CLI_UNAVAILABLE');
        }
    }
}

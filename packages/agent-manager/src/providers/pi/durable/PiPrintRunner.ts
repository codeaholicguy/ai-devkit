import { spawn as nodeSpawn, type ChildProcessWithoutNullStreams, type SpawnOptionsWithoutStdio } from 'child_process';
import type { PiDurableAgent, ProcessIdentity } from '../../../durable/DurableAgent.js';
import { PiPrintError } from '../../../durable/DurableAgent.js';
import { LocalProcessInspector, type ProcessInspector } from '../../../durable/process.js';
import { waitForChildClose } from '../../../durable/utils.js';
import { buildPiPrintArgs } from './PiPrintProtocol.js';
import { PiStreamParser } from './PiStreamParser.js';

type Spawn = (command: string, args: readonly string[], options: SpawnOptionsWithoutStdio & { stdio: ['pipe', 'pipe', 'pipe'] }) => ChildProcessWithoutNullStreams;
export interface PiPrintRunRequest { agent: PiDurableAgent; prompt: string; executable?: string; onSpawn(identity: ProcessIdentity): Promise<void> }
export interface PiPrintRunResult { sessionId: string; result: string; messages: string[]; exitCode: number }
export interface PiPrintRunnerOptions { spawn?: Spawn; processInspector?: ProcessInspector; maxLineBytes?: number }

export class PiPrintRunner {
    private readonly spawn: Spawn; private readonly processInspector: ProcessInspector; private readonly maxLineBytes: number;
    constructor(options: PiPrintRunnerOptions = {}) {
        this.spawn = options.spawn ?? (nodeSpawn as Spawn); this.processInspector = options.processInspector ?? new LocalProcessInspector();
        this.maxLineBytes = options.maxLineBytes ?? 1024 * 1024;
    }
    async run(request: PiPrintRunRequest): Promise<PiPrintRunResult> {
        const args = buildPiPrintArgs(request.agent.providerSessionId, request.agent.sessionHealth === 'uninitialized');
        const child = this.spawn(request.executable ?? 'pi', args, { cwd: request.agent.cwd, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
        if (!child.pid) { child.kill(); throw new PiPrintError('Pi process did not provide a PID.', 'PI_PROCESS'); }
        const identity = this.processInspector.getIdentity(child.pid);
        if (!identity) { child.kill(); throw new PiPrintError('Cannot verify Pi process identity.', 'PI_PROCESS'); }
        const parser = new PiStreamParser(request.agent.providerSessionId, this.maxLineBytes);
        child.stdout.on('data', (chunk: Buffer | string) => {
            if (parser.hasFailed()) return;
            try { parser.accept(chunk); } catch (error) { parser.fail(error); }
        });
        child.stderr.resume();
        const closed = waitForChildClose(child);
        try { await request.onSpawn(identity); } catch (error) { child.kill(); throw error; }
        child.stdin.end(request.prompt);
        const close = await closed.catch(() => {
            throw new PiPrintError('Pi process failed to start or communicate.', 'PI_PROCESS');
        });
        return parser.result(close);
    }
}

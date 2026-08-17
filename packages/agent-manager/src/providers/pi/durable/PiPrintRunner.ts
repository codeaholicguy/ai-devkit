import { spawn as nodeSpawn, type ChildProcessWithoutNullStreams, type SpawnOptionsWithoutStdio } from 'child_process';
import type { DurableAgent, ProcessIdentity } from '../../../durable/DurableAgent.js';
import { PiPrintError } from '../../../durable/DurableAgent.js';
import { LocalProcessInspector, type ProcessInspector } from '../../../durable/DurableAgentRepository.js';
import { buildPiPrintArgs, readPiAssistantText, readPiSessionId } from './PiPrintProtocol.js';

type Spawn = (command: string, args: readonly string[], options: SpawnOptionsWithoutStdio & { stdio: ['pipe', 'pipe', 'pipe'] }) => ChildProcessWithoutNullStreams;
export interface PiPrintRunRequest { agent: DurableAgent; prompt: string; executable?: string; onSpawn(identity: ProcessIdentity): Promise<void> }
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
        let buffer = Buffer.alloc(0); let sessionId: string | null = null; let ended = false; const messages: string[] = [];
        let protocolError: PiPrintError | null = null; let processing = Promise.resolve();
        const processLine = async (line: Buffer) => {
            if (!line.length) return;
            if (line.length > this.maxLineBytes) throw new PiPrintError('Pi stream line exceeded the safety limit.', 'PI_PROTOCOL');
            let value: unknown;
            try { value = JSON.parse(line.toString('utf8')); } catch { throw new PiPrintError('Pi emitted malformed stream JSON.', 'PI_PROTOCOL'); }
            if (!value || typeof value !== 'object' || Array.isArray(value)) throw new PiPrintError('Pi emitted a non-object stream message.', 'PI_PROTOCOL');
            const event = value as Record<string, unknown>;
            if (event.type === 'session') {
                sessionId = readPiSessionId(event, sessionId, request.agent.providerSessionId);
            } else if (event.type === 'agent_end') ended = true;
            else {
                const text = readPiAssistantText(event);
                if (text !== null) messages.push(text);
            }
        };
        child.stdout.on('data', (chunk: Buffer | string) => {
            if (protocolError) return;
            buffer = Buffer.concat([buffer, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
            if (buffer.length > this.maxLineBytes && buffer.indexOf(0x0a) < 0) { protocolError = new PiPrintError('Pi stream line exceeded the safety limit.', 'PI_PROTOCOL'); return; }
            let newline: number;
            while ((newline = buffer.indexOf(0x0a)) >= 0) {
                const line = buffer.subarray(0, newline); buffer = buffer.subarray(newline + 1);
                processing = processing.then(() => processLine(line)).catch((error) => { protocolError = error instanceof PiPrintError ? error : new PiPrintError('Pi stream processing failed.', 'PI_PROTOCOL'); });
            }
        });
        child.stderr.resume();
        const closed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
            child.once('error', reject); child.once('close', (code, signal) => resolve({ code, signal }));
        });
        try { await request.onSpawn(identity); } catch (error) { child.kill(); throw error; }
        child.stdin.end(request.prompt);
        const { code, signal } = await closed.catch(() => { throw new PiPrintError('Pi process failed to start or communicate.', 'PI_PROCESS'); });
        await processing;
        if (protocolError) throw protocolError;
        if (buffer.length) throw new PiPrintError('Pi stream ended with incomplete JSON.', 'PI_PROTOCOL');
        if (code !== 0) throw new PiPrintError(`Pi print run failed${signal ? ` (${signal})` : '.'}`, 'PI_PROCESS');
        if (sessionId === null) throw new PiPrintError('Pi stream ended without a session identity.', 'PI_PROTOCOL');
        if (!ended) throw new PiPrintError('Pi stream ended before agent completion.', 'PI_PROTOCOL');
        if (!messages.length) throw new PiPrintError('Pi stream ended without an assistant result.', 'PI_RESULT_MISSING');
        return { sessionId, result: messages.at(-1)!, messages, exitCode: code };
    }
}

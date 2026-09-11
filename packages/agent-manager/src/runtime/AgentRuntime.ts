import type { AgentRuntimeProvider, RegistryEntry } from '../utils/AgentRegistry.js';
import type { HerdrRuntimeAvailability } from './HerdrAgentRuntime.js';
import { HerdrAgentRuntime } from './HerdrAgentRuntime.js';

export type AgentRuntimeAvailability = HerdrRuntimeAvailability;

export interface HerdrStartRuntime {
    provider: 'herdr';
    isAvailable(): Promise<AgentRuntimeAvailability>;
    startAgent(input: {
        name: string;
        cwd: string;
        kind: string;
        args: string[];
        timeoutMs: number;
    }): Promise<{
        pid: number;
        runtimeRef: unknown;
    }>;
}

export interface HerdrInteractiveRuntime extends HerdrStartRuntime {
    send(input: { runtimeRef: unknown; prompt: string }): Promise<void>;
    wait(input: { runtimeRef: unknown; timeoutMs: number }): Promise<void>;
    readOutput(input: { runtimeRef: unknown; lines?: number }): Promise<string>;
    focus(input: { runtimeRef: unknown }): Promise<boolean>;
    stop(input: { runtimeRef: unknown }): Promise<void>;
}

export function createHerdrRuntime(): HerdrInteractiveRuntime {
    return new HerdrAgentRuntime();
}

export function createInteractiveRuntime(provider: AgentRuntimeProvider): HerdrInteractiveRuntime | null {
    if (provider === 'herdr') return createHerdrRuntime();
    return null;
}

export function isHerdrRegistryEntry(entry: unknown): entry is RegistryEntry & { runtime: 'herdr'; runtimeRef: unknown } {
    return typeof entry === 'object'
        && entry !== null
        && (entry as { runtime?: unknown }).runtime === 'herdr'
        && 'runtimeRef' in entry;
}

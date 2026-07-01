/**
 * Build an explicit `Actor` for deterministic attribution.
 *
 * The real `TaskService` auto-resolves the actor from flags/env/registry when
 * omitted. In multi-agent contexts where the calling agent wants a specific
 * attribution, build the Actor here and pass it to TaskTracer methods.
 *
 * No storage dependency. Resolution order mirrors the contract: explicit values
 * win; otherwise read from AIDEVKIT_AGENT_* env; otherwise leave undefined.
 */

import type { Actor } from './contract.js';

export interface ActorEnv {
    agentId?: string;
    agentType?: string;
    sessionId?: string;
    pid?: number;
}

function envString(name: string): string | undefined {
    const v = process.env[name];
    return v && v.length > 0 ? v : undefined;
}

function envNumber(name: string): number | undefined {
    const v = process.env[name];
    if (v === undefined || v.length === 0) return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
}

/**
 * Resolve an explicit actor, preferring overrides then AIDEVKIT_AGENT_* env.
 * Returns undefined when nothing is set (caller may pass undefined → service
 * auto-resolves or records null).
 */
export function resolveActor(overrides: ActorEnv = {}, env: ActorEnv = readActorEnv()): Actor | undefined {
    const agentId = overrides.agentId ?? env.agentId;
    const agentType = overrides.agentType ?? env.agentType;
    const sessionId = overrides.sessionId ?? env.sessionId;
    const pid = overrides.pid ?? env.pid;
    if (agentId === undefined && agentType === undefined && sessionId === undefined && pid === undefined) {
        return undefined;
    }
    const actor: Actor = {};
    if (agentId !== undefined) actor.agentId = agentId;
    if (agentType !== undefined) actor.agentType = agentType;
    if (sessionId !== undefined) actor.sessionId = sessionId;
    if (pid !== undefined) actor.pid = pid;
    return actor;
}

/** Read AIDEVKIT_AGENT_* env (with AIDEVKIT_AGENT_PID fallback to process.pid). */
export function readActorEnv(): ActorEnv {
    return {
        agentId: envString('AIDEVKIT_AGENT_ID'),
        agentType: envString('AIDEVKIT_AGENT_TYPE'),
        sessionId: envString('AIDEVKIT_SESSION_ID'),
        pid: envNumber('AIDEVKIT_AGENT_PID'),
    };
}

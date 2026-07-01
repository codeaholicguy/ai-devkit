import type { Actor } from './types/index.js';

/**
 * Environment variable names used for agent attribution auto-resolution.
 * Tracing workers / agents may set these so the task service can attribute
 * events without explicit `--agent` flags on every call.
 */
export const ATTRIB_ENV = {
    agentId: 'AIDEVKIT_AGENT_ID',
    agentType: 'AIDEVKIT_AGENT_TYPE',
    sessionId: 'AIDEVKIT_SESSION_ID',
    agentPid: 'AIDEVKIT_AGENT_PID',
} as const;

/**
 * Resolves the current actor. Resolution order (per contract):
 *   1. explicit `override` (from CLI flags / opts)
 *   2. environment variables (AIDEVKIT_AGENT_*)
 *   3. current process pid
 *   4. `null` (valid — task still works, just unattributed)
 *
 * A best-effort agent-manager registry lookup may be added later without changing
 * this function's signature; for the standalone package MVP we resolve from
 * env + process only to keep the package dependency-free.
 */
export interface ActorResolver {
    resolveCurrentActor(override?: Partial<Actor>): Actor | null;
}

export function resolveCurrentActor(override?: Partial<Actor>): Actor | null {
    const env = process.env;
    const resolved: Actor = {};

    const agentType = env[ATTRIB_ENV.agentType];
    if (agentType) {
        resolved.agentType = agentType;
    }
    const agentId = env[ATTRIB_ENV.agentId];
    if (agentId) {
        resolved.agentId = agentId;
    }
    const sessionId = env[ATTRIB_ENV.sessionId];
    if (sessionId) {
        resolved.sessionId = sessionId;
    }

    // PID: explicit env override, else current process pid.
    const pidEnv = env[ATTRIB_ENV.agentPid];
    if (pidEnv && /^\d+$/.test(pidEnv)) {
        resolved.pid = Number.parseInt(pidEnv, 10);
    } else {
        resolved.pid = process.pid;
    }

    // Apply explicit overrides last (highest precedence).
    if (override) {
        for (const [key, value] of Object.entries(override)) {
            if (value !== undefined) {
                (resolved as Record<string, unknown>)[key] = value;
            }
        }
    }

    // Drop pid-only entries that carry no agent context? No — pid is useful attribution.
    // Return null only if nothing meaningful resolved.
    const hasAny = resolved.agentId || resolved.agentType || resolved.sessionId || resolved.pid;
    return hasAny ? resolved : null;
}

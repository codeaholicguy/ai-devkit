import type { Actor } from './task.types.js';

/**
 * Environment variable names used for agent attribution auto-resolution.
 * Tracing workers / agents may set these so the task service can attribute
 * events without explicit `--agent` flags on every call.
 */
export const ATTRIB_ENV = {
    agentId: 'AI_DEVKIT_AGENT_ID',
    agentType: 'AI_DEVKIT_AGENT_TYPE',
    sessionId: 'AI_DEVKIT_SESSION_ID',
    agentPid: 'AI_DEVKIT_AGENT_PID',
} as const;

/**
 * Resolves the current actor. Explicit overrides take precedence over
 * environment variables; pid falls back to the current process id.
 */
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

    const pidEnv = env[ATTRIB_ENV.agentPid];
    if (pidEnv && /^\d+$/.test(pidEnv)) {
        resolved.pid = Number.parseInt(pidEnv, 10);
    } else {
        resolved.pid = process.pid;
    }

    if (override) {
        for (const [key, value] of Object.entries(override)) {
            if (value !== undefined) {
                (resolved as Record<string, unknown>)[key] = value;
            }
        }
    }

    const hasAny = resolved.agentId || resolved.agentType || resolved.sessionId || resolved.pid;
    return hasAny ? resolved : null;
}

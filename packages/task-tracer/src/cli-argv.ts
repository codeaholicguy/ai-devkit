/**
 * CLI argv builders for skill integration.
 *
 * Skills ultimately shell out to `ai-devkit task ...` (owned by
 * `task-system-feature`). These pure builders centralize the exact verbs/flags
 * in one tested place. They return `string[]` and NEVER execute, so tracing is
 * decoupled from whether the `task` CLI is shipped yet.
 *
 * Contract reference:
 * `docs/ai/design/2026-07-01-feature-task-system.CONTRACT.md` §4.
 */

import type { Actor } from './contract.js';

export interface GlobalFlags {
    store?: string;
    json?: boolean;
    agent?: string;
    agentType?: string;
    pid?: number;
    session?: string;
}

function pushGlobals(argv: string[], flags: GlobalFlags | undefined): void {
    if (!flags) return;
    if (flags.store !== undefined) argv.push('--store', flags.store);
    if (flags.json) argv.push('--json');
    if (flags.agent !== undefined) argv.push('--agent', flags.agent);
    if (flags.agentType !== undefined) argv.push('--agent-type', flags.agentType);
    if (flags.pid !== undefined) argv.push('--pid', String(flags.pid));
    if (flags.session !== undefined) argv.push('--session', flags.session);
}

function tagsArg(tags: string[] | undefined): string | undefined {
    if (!tags || tags.length === 0) return undefined;
    return tags.join(',');
}

/** `task create --title --feature ...` */
export function buildCreateArgv(
    input: {
        title: string;
        feature?: string;
        summary?: string;
        phase?: string;
        tags?: string[];
        branch?: string;
        worktree?: string;
        pr?: string;
    },
    flags?: GlobalFlags,
): string[] {
    const argv = ['task', 'create', '--title', input.title];
    if (input.feature !== undefined) argv.push('--feature', input.feature);
    if (input.summary !== undefined) argv.push('--summary', input.summary);
    if (input.phase !== undefined) argv.push('--phase', input.phase);
    const tags = tagsArg(input.tags);
    if (tags !== undefined) argv.push('--tags', tags);
    if (input.branch !== undefined) argv.push('--branch', input.branch);
    if (input.worktree !== undefined) argv.push('--worktree', input.worktree);
    if (input.pr !== undefined) argv.push('--pr', input.pr);
    pushGlobals(argv, flags);
    return argv;
}

/** `task show <id> [--events]` */
export function buildShowArgv(id: string, options: { events?: boolean } = {}, flags?: GlobalFlags): string[] {
    const argv = ['task', 'show', id];
    if (options.events) argv.push('--events');
    if (flags?.json ?? true) argv.push('--json');
    pushGlobals(argv, flags);
    return argv;
}

/** `task list --feature ...` */
export function buildListArgv(
    filter: { feature?: string; status?: string; phase?: string; limit?: number } = {},
    flags?: GlobalFlags,
): string[] {
    const argv = ['task', 'list'];
    if (filter.feature !== undefined) argv.push('--feature', filter.feature);
    if (filter.status !== undefined) argv.push('--status', filter.status);
    if (filter.phase !== undefined) argv.push('--phase', filter.phase);
    if (filter.limit !== undefined) argv.push('--limit', String(filter.limit));
    if (flags?.json ?? true) argv.push('--json');
    pushGlobals(argv, flags);
    return argv;
}

/** `task phase <id> <phase>` */
export function buildPhaseArgv(id: string, phase: string | null, flags?: GlobalFlags): string[] {
    const argv = ['task', 'phase', id, phase ?? ''];
    pushGlobals(argv, flags);
    return argv;
}

/** `task status <id> <status>` */
export function buildStatusArgv(id: string, status: string, flags?: GlobalFlags): string[] {
    const argv = ['task', 'status', id, status];
    pushGlobals(argv, flags);
    return argv;
}

/** `task progress <id> --text --percent [--clear]` */
export function buildProgressArgv(
    id: string,
    progress: { text?: string | null; percent?: number | null; clear?: boolean },
    flags?: GlobalFlags,
): string[] {
    const argv = ['task', 'progress', id];
    if (progress.clear) {
        argv.push('--clear');
    } else {
        if (progress.text !== undefined && progress.text !== null) argv.push('--text', progress.text);
        if (progress.percent !== undefined && progress.percent !== null) argv.push('--percent', String(progress.percent));
    }
    pushGlobals(argv, flags);
    return argv;
}

/** `task next <id> <step...> [--clear]` */
export function buildNextArgv(id: string, step: string | null, flags?: GlobalFlags): string[] {
    const argv = ['task', 'next', id];
    if (step === null) argv.push('--clear');
    else argv.push(step);
    pushGlobals(argv, flags);
    return argv;
}

/** `task blocker <id> add <text>` */
export function buildBlockerAddArgv(id: string, text: string, flags?: GlobalFlags): string[] {
    const argv = ['task', 'blocker', id, 'add', text];
    pushGlobals(argv, flags);
    return argv;
}

/** `task blocker <id> resolve <blockerId>` */
export function buildBlockerResolveArgv(id: string, blockerId: string, flags?: GlobalFlags): string[] {
    const argv = ['task', 'blocker', id, 'resolve', blockerId];
    pushGlobals(argv, flags);
    return argv;
}

/** `task evidence <id> --command --exit-code --passed|--failed --summary --artifact ...` */
export function buildEvidenceArgv(
    id: string,
    evidence: {
        command?: string | null;
        exitCode?: number | null;
        passed: boolean;
        summary?: string | null;
        artifacts?: string[];
    },
    flags?: GlobalFlags,
): string[] {
    const argv = ['task', 'evidence', id];
    argv.push(evidence.passed ? '--passed' : '--failed');
    if (evidence.command !== undefined && evidence.command !== null) argv.push('--command', evidence.command);
    if (evidence.exitCode !== undefined && evidence.exitCode !== null) argv.push('--exit-code', String(evidence.exitCode));
    if (evidence.summary !== undefined && evidence.summary !== null) argv.push('--summary', evidence.summary);
    for (const a of evidence.artifacts ?? []) argv.push('--artifact', a);
    pushGlobals(argv, flags);
    return argv;
}

/** `task artifact <id> <path> --kind --description` */
export function buildArtifactArgv(
    id: string,
    path: string,
    options: { kind?: string | null; description?: string | null } = {},
    flags?: GlobalFlags,
): string[] {
    const argv = ['task', 'artifact', id, path];
    if (options.kind !== undefined && options.kind !== null) argv.push('--kind', options.kind);
    if (options.description !== undefined && options.description !== null) argv.push('--description', options.description);
    pushGlobals(argv, flags);
    return argv;
}

/** `task assign <id> --agent --agent-type --pid --session` */
export function buildAssignArgv(id: string, actor: Actor, flags?: GlobalFlags): string[] {
    const argv = ['task', 'assign', id];
    if (actor.agentId !== undefined) argv.push('--agent', actor.agentId);
    if (actor.agentType !== undefined) argv.push('--agent-type', actor.agentType);
    if (actor.pid !== undefined) argv.push('--pid', String(actor.pid));
    if (actor.sessionId !== undefined) argv.push('--session', actor.sessionId);
    pushGlobals(argv, flags);
    return argv;
}

/** `task note <id> <text...>` */
export function buildNoteArgv(id: string, text: string, flags?: GlobalFlags): string[] {
    const argv = ['task', 'note', id, text];
    pushGlobals(argv, flags);
    return argv;
}

/** `task event <id> --type --payload <json|@file>` */
export function buildEventArgv(
    id: string,
    type: string,
    payload: Record<string, unknown>,
    flags?: GlobalFlags,
): string[] {
    const argv = ['task', 'event', id, '--type', type, '--payload', JSON.stringify(payload)];
    pushGlobals(argv, flags);
    return argv;
}

/** `task close <id> [completed|abandoned]` */
export function buildCloseArgv(
    id: string,
    status: 'completed' | 'abandoned' = 'completed',
    flags?: GlobalFlags,
): string[] {
    const argv = ['task', 'close', id, status];
    pushGlobals(argv, flags);
    return argv;
}

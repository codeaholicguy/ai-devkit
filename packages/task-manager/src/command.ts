import type { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import {
    createTaskService,
    AmbiguousTaskRefError,
    isTaskEventType,
} from './index.js';
import type { Actor, Task, TaskService, TaskStatus } from './index.js';

const TITLE_MAX_LENGTH = 50;
const VALID_STATUSES: TaskStatus[] = ['open', 'active', 'blocked', 'completed', 'abandoned'];

interface AiDevkitRuntime {
    cwd: string;
    homeDir: string;
    logger: {
        info(message: string): void;
        warn(message: string): void;
        error(message: string): void;
    };
}

interface AttributionOptions {
    agent?: string;
    agentType?: string;
    pid?: string;
    session?: string;
}

function actorFromOptions(opts: AttributionOptions): Actor | undefined {
    const actor: Actor = {};
    if (opts.agent) actor.agentId = opts.agent;
    if (opts.agentType) actor.agentType = opts.agentType;
    if (opts.pid) actor.pid = Number.parseInt(opts.pid, 10);
    if (opts.session) actor.sessionId = opts.session;
    return Object.keys(actor).length > 0 ? actor : undefined;
}

async function createService(runtime: AiDevkitRuntime, dbPathFlag?: string): Promise<TaskService> {
    if (dbPathFlag && dbPathFlag.trim()) {
        return createTaskService(dbPathFlag);
    }
    return createTaskService(await resolveConfiguredTasksDbPath(runtime));
}

async function resolveConfiguredTasksDbPath(runtime: AiDevkitRuntime): Promise<string | undefined> {
    const configPath = path.join(runtime.cwd, '.ai-devkit.json');
    let config: unknown;

    try {
        config = JSON.parse(await readFile(configPath, 'utf8')) as unknown;
    } catch (error) {
        const code = typeof error === 'object' && error !== null && 'code' in error ? (error as { code?: unknown }).code : undefined;
        if (code === 'ENOENT') {
            return path.join(runtime.homeDir, '.ai-devkit', 'tasks.db');
        }
        throw error;
    }

    const configuredPath = typeof config === 'object' && config !== null && 'tasks' in config
        ? (config as { tasks?: { path?: unknown } }).tasks?.path
        : undefined;

    if (typeof configuredPath !== 'string') {
        return path.join(runtime.homeDir, '.ai-devkit', 'tasks.db');
    }

    const trimmedPath = configuredPath.trim();
    if (!trimmedPath) {
        return path.join(runtime.homeDir, '.ai-devkit', 'tasks.db');
    }

    if (path.isAbsolute(trimmedPath)) {
        return trimmedPath;
    }

    return path.resolve(path.dirname(configPath), trimmedPath);
}

function output(value: unknown, json: boolean): void {
    if (json) {
        console.log(JSON.stringify(value, null, 2));
        return;
    }
    if (typeof value === 'string') {
        console.log(value);
    } else {
        console.log(JSON.stringify(value, null, 2));
    }
}

function formatActor(actor: { agentId?: string; agentType?: string; pid?: number; sessionId?: string } | null): string {
    if (!actor) return '-';
    const parts: string[] = [];
    if (actor.agentType) parts.push(actor.agentType);
    if (actor.agentId) parts.push(actor.agentId);
    if (actor.pid) parts.push(`pid:${actor.pid}`);
    return parts.length ? parts.join('/') : '-';
}

async function resolveOrError(
    runtime: AiDevkitRuntime,
    service: TaskService,
    id: string
): Promise<{ taskId: string } | null> {
    try {
        const task = await service.resolveTask(id);
        if (!task) {
            runtime.logger.error(`No task found for "${id}".`);
            return null;
        }
        return { taskId: task.taskId };
    } catch (error) {
        if (error instanceof AmbiguousTaskRefError) {
            runtime.logger.error(`${error.message}`);
            return null;
        }
        throw error;
    }
}

function truncate(value: string, maxLength: number): string {
    return value.length <= maxLength ? value : `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

function renderTask(task: Task): string {
    const lines: string[] = [];
    lines.push(`${task.taskId}`);
    lines.push(`  title:   ${task.title}`);
    lines.push(`  status:  ${task.status}   phase: ${task.phase ?? '-'}`);
    if (task.name) lines.push(`  name:    ${task.name}`);
    if (task.summary) lines.push(`  summary: ${task.summary}`);
    if (task.progress.text) {
        lines.push(`  progress: ${task.progress.text}`);
    }
    if (task.nextStep) lines.push(`  next:    ${task.nextStep}`);
    lines.push(`  attribution: ${formatActor(task.attribution)}`);
    const links = [task.links.branch, task.links.worktree, task.links.pr].filter(Boolean).join(' | ');
    if (links) lines.push(`  links:   ${links}`);
    if (task.tags.length) lines.push(`  tags:    ${task.tags.join(', ')}`);
    if (task.blockers.length) {
        lines.push(`  blockers:`);
        for (const b of task.blockers) {
            lines.push(`    [${b.status}] ${b.blockerId} - ${truncate(b.text, 80)}`);
        }
    }
    if (task.evidence.length) {
        lines.push(`  evidence:`);
        for (const e of task.evidence) {
            lines.push(`    ${e.passed ? 'PASS' : 'FAIL'} ${e.evidenceId}${e.command ? ` - ${truncate(e.command, 60)}` : ''}`);
        }
    }
    if (task.artifacts.length) {
        lines.push(`  artifacts:`);
        for (const a of task.artifacts) {
            lines.push(`    ${a.artifactId} - ${a.path}${a.kind ? ` [${a.kind}]` : ''}`);
        }
    }
    lines.push(`  events:  ${task.eventCount}   created: ${task.createdAt}`);
    return lines.join('\n');
}

export function register(command: Command, runtime: AiDevkitRuntime): void {
    command.description('Manage durable development/debug tasks');

    const addAttributionFlags = (cmd: Command): Command =>
        cmd
            .option('--db-path <path>', 'Override the configured tasks database path')
            .option('--agent <id>', 'Agent id for attribution')
            .option('--agent-type <type>', 'Agent type for attribution (e.g. claude, pi)')
            .option('--pid <pid>', 'Process id for attribution')
            .option('--session <id>', 'Agent session id for attribution')
            .option('--json', 'Output machine-readable JSON');

    addAttributionFlags(
        command
            .command('create')
            .description('Create a new task')
            .requiredOption('--title <title>', 'Task title')
            .option('--name <name>', 'Kebab-case task name')
            .option('--summary <summary>', 'Short summary')
            .option('--phase <phase>', 'Initial lifecycle phase')
            .option('--tags <tags>', 'Comma-separated tags')
            .option('--branch <branch>', 'Git branch link')
            .option('--worktree <path>', 'Git worktree link')
            .option('--pr <url>', 'Pull request link')
    ).action(
        withErrorHandler('create task', async (opts) => {
            const service = await createService(runtime, opts.dbPath);
            const created = await service.create({
                title: opts.title,
                name: opts.name,
                summary: opts.summary,
                phase: opts.phase,
                tags: opts.tags ? opts.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : undefined,
                links: { branch: opts.branch, worktree: opts.worktree, pr: opts.pr },
                actor: actorFromOptions(opts),
            });
            if (opts.json) {
                output(created, true);
            } else {
                runtime.logger.info(`Created task ${created.taskId}`);
                console.log(renderTask(created));
            }
        })
    );

    addAttributionFlags(
        command
            .command('list')
            .description('List tasks (newest first)')
            .option('--name <name>', 'Filter by task name')
            .option('--status <status>', `Filter by status (${VALID_STATUSES.join('|')})`)
            .option('--phase <phase>', 'Filter by phase')
            .option('--limit <n>', 'Maximum results', '20')
    ).action(
        withErrorHandler('list tasks', async (opts) => {
            const service = await createService(runtime, opts.dbPath);
            const tasks = await service.list({
                name: opts.name,
                status: opts.status as TaskStatus | undefined,
                phase: opts.phase,
                limit: Number.parseInt(opts.limit, 10) || 20,
            });
            if (opts.json) {
                output(tasks, true);
                return;
            }
            if (tasks.length === 0) {
                runtime.logger.warn('No tasks found.');
                return;
            }
            console.log([
                ['id', 'title', 'status', 'phase', 'name'].join('\t'),
                ...tasks.map((t) => [
                    t.taskId,
                    truncate(t.title, TITLE_MAX_LENGTH),
                    t.status,
                    t.phase ?? '-',
                    t.name ?? '-',
                ].join('\t')),
            ].join('\n'));
        })
    );

    addAttributionFlags(
        command
            .command('show <id>')
            .description('Show a task (resolves id, prefix, or name)')
            .option('--events', 'Include the event history')
    ).action(
        withErrorHandler('show task', async (id: string, opts) => {
            const service = await createService(runtime, opts.dbPath);
            const resolved = await resolveOrError(runtime, service, id);
            if (!resolved) return;
            const taskObj = await service.get(resolved.taskId);
            if (opts.json) {
                const payload: Record<string, unknown> = { task: taskObj };
                if (opts.events) {
                    payload.events = await service.getEvents(resolved.taskId);
                }
                output(payload, true);
                return;
            }
            console.log(renderTask(taskObj));
            if (opts.events) {
                const events = await service.getEvents(resolved.taskId);
                console.log('\nevents:');
                for (const e of events) {
                    console.log(`  ${e.ts}  ${e.type}  (${e.eventId})`);
                }
            }
        })
    );

    addAttributionFlags(
        command
            .command('update <id>')
            .description('Update task scalar fields (title/summary/tags/links)')
            .option('--title <title>', 'New title')
            .option('--summary <summary>', 'New summary')
            .option('--tags <tags>', 'Comma-separated tags (replaces)')
            .option('--branch <branch>', 'Git branch link')
            .option('--worktree <path>', 'Git worktree link')
            .option('--pr <url>', 'Pull request link')
    ).action(
        withErrorHandler('update task', async (id: string, opts) => {
            const service = await createService(runtime, opts.dbPath);
            const resolved = await resolveOrError(runtime, service, id);
            if (!resolved) return;
            const patch: Record<string, unknown> = {};
            if (opts.title !== undefined) patch.title = opts.title;
            if (opts.summary !== undefined) patch.summary = opts.summary;
            if (opts.tags !== undefined) {
                patch.tags = opts.tags.split(',').map((t: string) => t.trim()).filter(Boolean);
            }
            if (opts.branch !== undefined || opts.worktree !== undefined || opts.pr !== undefined) {
                patch.links = { branch: opts.branch, worktree: opts.worktree, pr: opts.pr };
            }
            const updated = await service.update(resolved.taskId, patch, { actor: actorFromOptions(opts) });
            output(updated, opts.json);
        })
    );

    addAttributionFlags(command.command('phase <id> <phase>').description('Set the lifecycle phase')).action(
        withErrorHandler('set task phase', async (id: string, phase: string, opts) => {
            const service = await createService(runtime, opts.dbPath);
            const resolved = await resolveOrError(runtime, service, id);
            if (!resolved) return;
            const updated = await service.setPhase(resolved.taskId, phase, { actor: actorFromOptions(opts) });
            output(updated, opts.json);
        })
    );

    addAttributionFlags(
        command
            .command('status <id> <status>')
            .description(`Set status (${VALID_STATUSES.join('|')})`)
    ).action(
        withErrorHandler('set task status', async (id: string, status: string, opts) => {
            const service = await createService(runtime, opts.dbPath);
            const resolved = await resolveOrError(runtime, service, id);
            if (!resolved) return;
            const updated = await service.setStatus(resolved.taskId, status as TaskStatus, {
                actor: actorFromOptions(opts),
            });
            output(updated, opts.json);
        })
    );

    addAttributionFlags(
        command
            .command('progress <id>')
            .description('Set progress text')
            .option('--text <text>', 'Progress text')
            .option('--clear', 'Clear progress')
    ).action(
        withErrorHandler('set task progress', async (id: string, opts) => {
            const service = await createService(runtime, opts.dbPath);
            const resolved = await resolveOrError(runtime, service, id);
            if (!resolved) return;
            const progress =
                opts.clear === true
                    ? { text: null }
                    : {
                          text: opts.text,
                      };
            const updated = await service.setProgress(resolved.taskId, progress, {
                actor: actorFromOptions(opts),
            });
            output(updated, opts.json);
        })
    );

    addAttributionFlags(
        command
            .command('next <id> [step...]')
            .description('Set the next step (pass --clear to remove)')
            .option('--clear', 'Clear the next step')
    ).action(
        withErrorHandler('set task next step', async (id: string, stepParts: string[] | undefined, opts) => {
            const service = await createService(runtime, opts.dbPath);
            const resolved = await resolveOrError(runtime, service, id);
            if (!resolved) return;
            const step = opts.clear === true ? null : (stepParts ?? []).join(' ').trim() || null;
            const updated = await service.setNextStep(resolved.taskId, step, {
                actor: actorFromOptions(opts),
            });
            output(updated, opts.json);
        })
    );

    addAttributionFlags(
        command
            .command('blocker <id> <action> [rest...]')
            .description('Manage blockers: add <text> | resolve <blockerId>')
    ).action(
        withErrorHandler('manage blocker', async (id: string, action: string, rest: string[] | undefined, opts) => {
            const service = await createService(runtime, opts.dbPath);
            const resolved = await resolveOrError(runtime, service, id);
            if (!resolved) return;
            const args = rest ?? [];
            if (action === 'add') {
                const text = args.join(' ').trim();
                if (!text) {
                    runtime.logger.error('blocker add requires blocker text.');
                    process.exitCode = 1;
                    return;
                }
                const result = await service.addBlocker(
                    resolved.taskId,
                    { text },
                    { actor: actorFromOptions(opts) }
                );
                output(result.task, opts.json);
            } else if (action === 'resolve') {
                const blockerId = args[0];
                if (!blockerId) {
                    runtime.logger.error('blocker resolve requires a blockerId.');
                    process.exitCode = 1;
                    return;
                }
                const updated = await service.resolveBlocker(resolved.taskId, blockerId, {
                    actor: actorFromOptions(opts),
                });
                output(updated, opts.json);
            } else {
                runtime.logger.error(`Unknown blocker action "${action}". Use: add | resolve.`);
                process.exitCode = 1;
            }
        })
    );

    addAttributionFlags(
        command
            .command('evidence <id>')
            .description('Record validation evidence (use --passed or --failed)')
            .option('--command <command>', 'Command that was run')
            .option('--exit-code <code>', 'Exit code of the command')
            .option('--passed', 'Mark evidence as passing')
            .option('--failed', 'Mark evidence as failing')
            .option('--summary <summary>', 'Inline summary of the result')
            .option('--artifact <path>', 'Artifact reference (repeatable)', (val: string, acc: string[]) => [...acc, val], [] as string[])
    ).action(
        withErrorHandler('record evidence', async (id: string, opts) => {
            const service = await createService(runtime, opts.dbPath);
            const resolved = await resolveOrError(runtime, service, id);
            if (!resolved) return;
            if (!opts.passed && !opts.failed) {
                runtime.logger.error('Evidence requires either --passed or --failed.');
                process.exitCode = 1;
                return;
            }
            const result = await service.addEvidence(
                resolved.taskId,
                {
                    command: opts.command,
                    exitCode: opts.exitCode !== undefined ? Number.parseInt(opts.exitCode, 10) : undefined,
                    passed: opts.passed === true,
                    summary: opts.summary,
                    artifacts: opts.artifact,
                },
                { actor: actorFromOptions(opts) }
            );
            output(result.task, opts.json);
        })
    );

    addAttributionFlags(
        command
            .command('artifact <id> <path>')
            .description('Add an artifact reference (never copies the file)')
            .option('--kind <kind>', 'Artifact kind (e.g. log, report, diff)')
            .option('--description <description>', 'Artifact description')
    ).action(
        withErrorHandler('add artifact', async (id: string, artifactPath: string, opts) => {
            const service = await createService(runtime, opts.dbPath);
            const resolved = await resolveOrError(runtime, service, id);
            if (!resolved) return;
            const result = await service.addArtifact(
                resolved.taskId,
                { path: artifactPath, kind: opts.kind, description: opts.description },
                { actor: actorFromOptions(opts) }
            );
            output(result.task, opts.json);
        })
    );

    addAttributionFlags(
        command
            .command('assign <id>')
            .description('Set current task ownership/attribution')
            .requiredOption('--agent <id>', 'Agent id')
            .option('--agent-type <type>', 'Agent type')
            .option('--pid <pid>', 'Process id')
            .option('--session <id>', 'Session id')
    ).action(
        withErrorHandler('assign task', async (id: string, opts) => {
            const service = await createService(runtime, opts.dbPath);
            const resolved = await resolveOrError(runtime, service, id);
            if (!resolved) return;
            const actor = actorFromOptions(opts);
            if (!actor) {
                runtime.logger.error('At least one attribution flag is required.');
                process.exitCode = 1;
                return;
            }
            const updated = await service.setAttribution(resolved.taskId, actor);
            output(updated, opts.json);
        })
    );

    addAttributionFlags(command.command('note <id> [text...]').description('Append a note (event-only)')).action(
        withErrorHandler('append note', async (id: string, textParts: string[] | undefined, opts) => {
            const service = await createService(runtime, opts.dbPath);
            const resolved = await resolveOrError(runtime, service, id);
            if (!resolved) return;
            const text = (textParts ?? []).join(' ').trim();
            if (!text) {
                runtime.logger.error('Note text must be a non-empty string.');
                process.exitCode = 1;
                return;
            }
            const updated = await service.addNote(resolved.taskId, text, {
                actor: actorFromOptions(opts),
            });
            output(updated, opts.json);
        })
    );

    addAttributionFlags(
        command
            .command('event <id>')
            .description('Append a low-level event (defaults to task.custom)')
            .option('--type <type>', 'Event type from the closed set (default: task.custom)')
            .option('--payload <json|@file>', 'JSON payload or @path to a JSON file')
    ).action(
        withErrorHandler('append event', async (id: string, opts) => {
            const service = await createService(runtime, opts.dbPath);
            const resolved = await resolveOrError(runtime, service, id);
            if (!resolved) return;
            const type = opts.type ?? 'task.custom';
            if (!isTaskEventType(type)) {
                runtime.logger.error(`Unknown event type: ${type}`);
                process.exitCode = 1;
                return;
            }
            let payload: Record<string, unknown> = {};
            if (opts.payload) {
                const raw = opts.payload.startsWith('@')
                    ? readFileSync(opts.payload.slice(1), 'utf8')
                    : opts.payload;
                payload = JSON.parse(raw) as Record<string, unknown>;
            }
            const event = await service.addEvent(resolved.taskId, type, payload, {
                actor: actorFromOptions(opts),
            });
            output(event, opts.json);
        })
    );

    addAttributionFlags(
        command
            .command('close <id> [status]')
            .description('Close a task (completed|abandoned). Default: completed')
    ).action(
        withErrorHandler('close task', async (id: string, statusArg: string | undefined, opts) => {
            const service = await createService(runtime, opts.dbPath);
            const resolved = await resolveOrError(runtime, service, id);
            if (!resolved) return;
            const status = (statusArg ?? 'completed') as 'completed' | 'abandoned';
            if (status !== 'completed' && status !== 'abandoned') {
                runtime.logger.error('Close status must be "completed" or "abandoned".');
                process.exitCode = 1;
                return;
            }
            const updated = await service.close(resolved.taskId, status, {
                actor: actorFromOptions(opts),
            });
            output(updated, opts.json);
        })
    );
}

function withErrorHandler<TArgs extends unknown[]>(
    operation: string,
    handler: (...args: TArgs) => Promise<void>
): (...args: TArgs) => Promise<void> {
    return async (...args: TArgs): Promise<void> => {
        try {
            await handler(...args);
        } catch (error) {
            const message = formatCommandError(error);
            console.error(`Failed to ${operation}: ${message}`);
            process.exitCode = 1;
        }
    };
}

function formatCommandError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    if (!error || typeof error !== 'object' || !('details' in error)) {
        return message;
    }

    const details = (error as { details?: unknown }).details;
    if (!details || typeof details !== 'object') {
        return message;
    }

    const originalError = (details as { originalError?: unknown }).originalError;
    if (typeof originalError !== 'string' || originalError.trim().length === 0) {
        return message;
    }

    return `${message} (${originalError.trim()})`;
}

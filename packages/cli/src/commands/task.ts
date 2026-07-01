import type { Command } from 'commander';
import { readFileSync } from 'fs';
import {
    createTaskService,
    resolveCurrentActor,
    AmbiguousTaskRefError,
    isTaskEventType,
} from '@ai-devkit/task-manager';
import type { Actor, Task, TaskService, TaskStatus } from '@ai-devkit/task-manager';
import { ui } from '../util/terminal-ui.js';
import { withErrorHandler } from '../util/errors.js';
import { truncate } from '../util/text.js';

const TITLE_MAX_LENGTH = 50;
const VALID_STATUSES: TaskStatus[] = ['open', 'active', 'blocked', 'completed', 'abandoned'];

interface AttributionOptions {
    agent?: string;
    agentType?: string;
    pid?: string;
    session?: string;
}

function buildActorOverride(opts: AttributionOptions): Partial<Actor> | undefined {
    const override: Partial<Actor> = {};
    if (opts.agent) override.agentId = opts.agent;
    if (opts.agentType) override.agentType = opts.agentType;
    if (opts.pid) override.pid = Number.parseInt(opts.pid, 10);
    if (opts.session) override.sessionId = opts.session;
    return Object.keys(override).length > 0 ? override : undefined;
}

function actorFromOptions(opts: AttributionOptions): Actor | undefined {
    const override = buildActorOverride(opts);
    if (!override) return undefined;
    return resolveCurrentActor(override) ?? undefined;
}

function createService(storeFlag?: string): TaskService {
    return createTaskService(storeFlag);
}

function output(value: unknown, json: boolean): void {
    if (json) {
        console.log(JSON.stringify(value, null, 2));
        return;
    }
    if (typeof value === 'string') {
        ui.text(value);
    } else {
        console.log(JSON.stringify(value, null, 2));
    }
}

function formatActor(actor: { agentId?: string; agentType?: string; pid?: number; sessionId?: string } | null): string {
    if (!actor) return '—';
    const parts: string[] = [];
    if (actor.agentType) parts.push(actor.agentType);
    if (actor.agentId) parts.push(actor.agentId);
    if (actor.pid) parts.push(`pid:${actor.pid}`);
    return parts.length ? parts.join('/') : '—';
}

async function resolveOrError(
    service: TaskService,
    id: string
): Promise<{ taskId: string } | null> {
    try {
        const task = await service.resolveTask(id);
        if (!task) {
            ui.error(`No task found for "${id}".`);
            return null;
        }
        return { taskId: task.taskId };
    } catch (error) {
        if (error instanceof AmbiguousTaskRefError) {
            ui.error(`${error.message}`);
            return null;
        }
        throw error;
    }
}

function renderTask(task: Task): string {
    const lines: string[] = [];
    lines.push(`${task.taskId}`);
    lines.push(`  title:   ${task.title}`);
    lines.push(`  status:  ${task.status}   phase: ${task.phase ?? '—'}`);
    if (task.feature) lines.push(`  feature: ${task.feature}`);
    if (task.summary) lines.push(`  summary: ${task.summary}`);
    if (task.progress.text || task.progress.percent !== null) {
        lines.push(`  progress: ${task.progress.text ?? ''}${task.progress.percent !== null ? ` (${task.progress.percent}%)` : ''}`);
    }
    if (task.nextStep) lines.push(`  next:    ${task.nextStep}`);
    lines.push(`  attribution: ${formatActor(task.attribution)}`);
    const links = [task.links.branch, task.links.worktree, task.links.pr].filter(Boolean).join(' · ');
    if (links) lines.push(`  links:   ${links}`);
    if (task.tags.length) lines.push(`  tags:    ${task.tags.join(', ')}`);
    if (task.blockers.length) {
        lines.push(`  blockers:`);
        for (const b of task.blockers) {
            lines.push(`    [${b.status}] ${b.blockerId} — ${truncate(b.text, 80)}`);
        }
    }
    if (task.evidence.length) {
        lines.push(`  evidence:`);
        for (const e of task.evidence) {
            lines.push(`    ${e.passed ? '✓' : '✗'} ${e.evidenceId}${e.command ? ` — ${truncate(e.command, 60)}` : ''}`);
        }
    }
    if (task.artifacts.length) {
        lines.push(`  artifacts:`);
        for (const a of task.artifacts) {
            lines.push(`    ${a.artifactId} — ${a.path}${a.kind ? ` [${a.kind}]` : ''}`);
        }
    }
    lines.push(`  events:  ${task.eventCount}   created: ${task.createdAt}`);
    return lines.join('\n');
}

export function registerTaskCommand(program: Command): void {
    const task = program.command('task').description('Manage durable development/debug tasks');

    const addAttributionFlags = (cmd: Command): Command =>
        cmd
            .option('--store <db-path>', 'Override the tasks database path (env: AI_DEVKIT_TASKS_DB)')
            .option('--agent <id>', 'Agent id for attribution')
            .option('--agent-type <type>', 'Agent type for attribution (e.g. claude, pi)')
            .option('--pid <pid>', 'Process id for attribution')
            .option('--session <id>', 'Agent session id for attribution')
            .option('--json', 'Output machine-readable JSON');

    addAttributionFlags(
        task
            .command('create')
            .description('Create a new task')
            .requiredOption('--title <title>', 'Task title')
            .option('--feature <feature>', 'Kebab-case feature key')
            .option('--summary <summary>', 'Short summary')
            .option('--phase <phase>', 'Initial lifecycle phase')
            .option('--tags <tags>', 'Comma-separated tags')
            .option('--branch <branch>', 'Git branch link')
            .option('--worktree <path>', 'Git worktree link')
            .option('--pr <url>', 'Pull request link')
    ).action(
        withErrorHandler('create task', async (opts) => {
            const service = createService(opts.store);
            const created = await service.create({
                title: opts.title,
                feature: opts.feature,
                summary: opts.summary,
                phase: opts.phase,
                tags: opts.tags ? opts.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : undefined,
                links: { branch: opts.branch, worktree: opts.worktree, pr: opts.pr },
                actor: actorFromOptions(opts),
            });
            if (opts.json) {
                output(created, true);
            } else {
                ui.success(`Created task ${created.taskId}`);
                ui.text(renderTask(created));
            }
        })
    );

    addAttributionFlags(
        task
            .command('list')
            .description('List tasks (newest first)')
            .option('--feature <feature>', 'Filter by feature key')
            .option('--status <status>', `Filter by status (${VALID_STATUSES.join('|')})`)
            .option('--phase <phase>', 'Filter by phase')
            .option('--limit <n>', 'Maximum results', '20')
    ).action(
        withErrorHandler('list tasks', async (opts) => {
            const service = createService(opts.store);
            const tasks = await service.list({
                feature: opts.feature,
                status: opts.status as TaskStatus | undefined,
                phase: opts.phase,
                limit: Number.parseInt(opts.limit, 10) || 20,
            });
            if (opts.json) {
                output(tasks, true);
                return;
            }
            if (tasks.length === 0) {
                ui.warning('No tasks found.');
                return;
            }
            ui.table({
                headers: ['id', 'title', 'status', 'phase', 'feature'],
                rows: tasks.map((t) => [
                    t.taskId,
                    truncate(t.title, TITLE_MAX_LENGTH),
                    t.status,
                    t.phase ?? '—',
                    t.feature ?? '—',
                ]),
            });
        })
    );

    addAttributionFlags(
        task
            .command('show <id>')
            .description('Show a task (resolves id, prefix, or feature)')
            .option('--events', 'Include the event history')
    ).action(
        withErrorHandler('show task', async (id: string, opts) => {
            const service = createService(opts.store);
            const resolved = await resolveOrError(service, id);
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
            ui.text(renderTask(taskObj));
            if (opts.events) {
                const events = await service.getEvents(resolved.taskId);
                ui.text('\nevents:');
                for (const e of events) {
                    ui.text(`  ${e.ts}  ${e.type}  (${e.eventId})`);
                }
            }
        })
    );

    addAttributionFlags(
        task
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
            const service = createService(opts.store);
            const resolved = await resolveOrError(service, id);
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

    addAttributionFlags(task.command('phase <id> <phase>').description('Set the lifecycle phase')).action(
        withErrorHandler('set task phase', async (id: string, phase: string, opts) => {
            const service = createService(opts.store);
            const resolved = await resolveOrError(service, id);
            if (!resolved) return;
            const updated = await service.setPhase(resolved.taskId, phase, { actor: actorFromOptions(opts) });
            output(updated, opts.json);
        })
    );

    addAttributionFlags(
        task
            .command('status <id> <status>')
            .description(`Set status (${VALID_STATUSES.join('|')})`)
    ).action(
        withErrorHandler('set task status', async (id: string, status: string, opts) => {
            const service = createService(opts.store);
            const resolved = await resolveOrError(service, id);
            if (!resolved) return;
            const updated = await service.setStatus(resolved.taskId, status as TaskStatus, {
                actor: actorFromOptions(opts),
            });
            output(updated, opts.json);
        })
    );

    addAttributionFlags(
        task
            .command('progress <id>')
            .description('Set progress text/percent')
            .option('--text <text>', 'Progress text')
            .option('--percent <n>', 'Completion percent (0..100)')
            .option('--clear', 'Clear progress')
    ).action(
        withErrorHandler('set task progress', async (id: string, opts) => {
            const service = createService(opts.store);
            const resolved = await resolveOrError(service, id);
            if (!resolved) return;
            const progress =
                opts.clear === true
                    ? { text: null, percent: null }
                    : {
                          text: opts.text,
                          percent: opts.percent !== undefined ? Number.parseInt(opts.percent, 10) : undefined,
                      };
            const updated = await service.setProgress(resolved.taskId, progress, {
                actor: actorFromOptions(opts),
            });
            output(updated, opts.json);
        })
    );

    addAttributionFlags(
        task
            .command('next <id> [step...]')
            .description('Set the next step (pass --clear to remove)')
            .option('--clear', 'Clear the next step')
    ).action(
        withErrorHandler('set task next step', async (id: string, stepParts: string[] | undefined, opts) => {
            const service = createService(opts.store);
            const resolved = await resolveOrError(service, id);
            if (!resolved) return;
            const step = opts.clear === true ? null : (stepParts ?? []).join(' ').trim() || null;
            const updated = await service.setNextStep(resolved.taskId, step, {
                actor: actorFromOptions(opts),
            });
            output(updated, opts.json);
        })
    );

    addAttributionFlags(
        task
            .command('blocker <id> <action> [rest...]')
            .description('Manage blockers: add <text> | resolve <blockerId>')
    ).action(
        withErrorHandler('manage blocker', async (id: string, action: string, rest: string[] | undefined, opts) => {
            const service = createService(opts.store);
            const resolved = await resolveOrError(service, id);
            if (!resolved) return;
            const args = rest ?? [];
            if (action === 'add') {
                const text = args.join(' ').trim();
                if (!text) {
                    ui.error('blocker add requires blocker text.');
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
                    ui.error('blocker resolve requires a blockerId.');
                    process.exitCode = 1;
                    return;
                }
                const updated = await service.resolveBlocker(resolved.taskId, blockerId, {
                    actor: actorFromOptions(opts),
                });
                output(updated, opts.json);
            } else {
                ui.error(`Unknown blocker action "${action}". Use: add | resolve.`);
                process.exitCode = 1;
            }
        })
    );

    addAttributionFlags(
        task
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
            const service = createService(opts.store);
            const resolved = await resolveOrError(service, id);
            if (!resolved) return;
            if (!opts.passed && !opts.failed) {
                ui.error('Evidence requires either --passed or --failed.');
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
        task
            .command('artifact <id> <path>')
            .description('Add an artifact reference (never copies the file)')
            .option('--kind <kind>', 'Artifact kind (e.g. log, report, diff)')
            .option('--description <description>', 'Artifact description')
    ).action(
        withErrorHandler('add artifact', async (id: string, artifactPath: string, opts) => {
            const service = createService(opts.store);
            const resolved = await resolveOrError(service, id);
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
        task
            .command('assign <id>')
            .description('Set current task ownership/attribution')
            .requiredOption('--agent <id>', 'Agent id')
            .option('--agent-type <type>', 'Agent type')
            .option('--pid <pid>', 'Process id')
            .option('--session <id>', 'Session id')
    ).action(
        withErrorHandler('assign task', async (id: string, opts) => {
            const service = createService(opts.store);
            const resolved = await resolveOrError(service, id);
            if (!resolved) return;
            const actor = actorFromOptions(opts);
            if (!actor) {
                ui.error('At least one attribution flag is required.');
                process.exitCode = 1;
                return;
            }
            const updated = await service.setAttribution(resolved.taskId, actor);
            output(updated, opts.json);
        })
    );

    addAttributionFlags(task.command('note <id> [text...]').description('Append a note (event-only)')).action(
        withErrorHandler('append note', async (id: string, textParts: string[] | undefined, opts) => {
            const service = createService(opts.store);
            const resolved = await resolveOrError(service, id);
            if (!resolved) return;
            const text = (textParts ?? []).join(' ').trim();
            if (!text) {
                ui.error('Note text must be a non-empty string.');
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
        task
            .command('event <id>')
            .description('Append a low-level event (defaults to task.custom)')
            .option('--type <type>', 'Event type from the closed set (default: task.custom)')
            .option('--payload <json|@file>', 'JSON payload or @path to a JSON file')
    ).action(
        withErrorHandler('append event', async (id: string, opts) => {
            const service = createService(opts.store);
            const resolved = await resolveOrError(service, id);
            if (!resolved) return;
            const type = opts.type ?? 'task.custom';
            if (!isTaskEventType(type)) {
                ui.error(`Unknown event type: ${type}`);
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
        task
            .command('close <id> [status]')
            .description('Close a task (completed|abandoned). Default: completed')
    ).action(
        withErrorHandler('close task', async (id: string, statusArg: string | undefined, opts) => {
            const service = createService(opts.store);
            const resolved = await resolveOrError(service, id);
            if (!resolved) return;
            const status = (statusArg ?? 'completed') as 'completed' | 'abandoned';
            if (status !== 'completed' && status !== 'abandoned') {
                ui.error('Close status must be "completed" or "abandoned".');
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

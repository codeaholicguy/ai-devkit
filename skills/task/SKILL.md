---
name: task
description: AI DevKit · Track dev-lifecycle / structured-debug progress on a durable task with the ai-devkit task CLI. Use to record phase, progress, next step, blockers, and validation evidence.
---

# Task Progress Tracking

Record development progress on a durable task: phase, progress, next step,
blockers, and validation evidence.

Requires the optional task command. Use `npx ai-devkit@latest` for task and
agent commands. Before recording task events, run a real read probe:

```bash
npx ai-devkit@latest task list --json
# or, when a task name is known:
npx ai-devkit@latest task list --name <task-name> --json
```

Only treat task tracing as available when the read probe exits 0. If it fails,
continue without task logging and include the failed command plus stderr/stdout
summary in the final report. Do not block the user's work just because optional
task tracing is unavailable or unusable.

## Core idea

- **One task per work item.** Create it once; advance its `phase` field as work
  moves through the lifecycle or debug workflow.
- **`<id>` can be a task name.** Every command below accepts the task name in
  place of a task id, resolving to the latest non-terminal task. Prefer
  `<task-name>` so agents do not track task ids.
- **Choose stable names.** For lifecycle work, use the feature key as the task
  name. For debugging or review work, choose a short kebab-case task name.
- **Emit at checkpoints, not streaming.** Phase transitions, task toggles,
  immediate next-step changes, fresh evidence, blockers discovered/resolved. A
  handful of calls per session.
- **Sequence mutations.** Never run task mutation commands in parallel for the
  same task. Each mutation reads the current task snapshot and writes it back;
  parallel writes can clobber snapshot fields even though events append. Run
  create/assign/phase/next/progress/evidence/blocker/artifact/close commands
  one at a time, then read back with `show --events --json` when the final state
  matters.
- **Attribution is explicit.** Identify self once, then pass actor flags on
  mutation commands.

## Identify self

Use `agent-management` when attribution is needed:

1. Run the `agent-management` self-identification workflow with `npx ai-devkit@latest agent list --json`.
2. Match the current agent entry from that list. Prefer an exact session match when available; otherwise use the unambiguous entry for the current project/worktree.
3. Build actor flags from the matched entry:
   `--agent <agent-name> --agent-type <agent-type> --pid <pid> --session <sessionId>`.
   Map JSON fields directly: `name` -> `--agent`, `type` -> `--agent-type`,
   `pid` -> `--pid`, and `sessionId` -> `--session`.
4. If identity is ambiguous, do not guess. Continue task logging without actor
   flags rather than fabricating attribution.
5. Add `--agent <agent-name> --agent-type <agent-type> --pid <pid> --session <sessionId>` to every mutation command once known. If a task already
   exists, run `npx ai-devkit@latest task assign <task-name> --agent <agent-name> --agent-type <agent-type> --pid <pid> --session <sessionId> --json` once so
   the task snapshot has current ownership.
6. If actor identity is unknown, run the same mutation commands without the four
   actor flags.

## Canonical commands

When self identity is known, add all four actor flags to every mutation command:
`--agent <agent-name> --agent-type <agent-type> --pid <pid> --session <sessionId>`.

```bash
# Create the task once (capture taskId from --json if needed)
npx ai-devkit@latest task create --title "<title>" --name <task-name> --phase requirements --agent <agent-name> --agent-type <agent-type> --pid <pid> --session <sessionId> --json

# If the task already exists, assign current ownership once when known
npx ai-devkit@latest task assign <task-name> --agent <agent-name> --agent-type <agent-type> --pid <pid> --session <sessionId> --json

# Mark real work as active after create/resume
npx ai-devkit@latest task status <task-name> active --agent <agent-name> --agent-type <agent-type> --pid <pid> --session <sessionId> --json

# Advance phase as the lifecycle moves on
npx ai-devkit@latest task phase <task-name> implementation --agent <agent-name> --agent-type <agent-type> --pid <pid> --session <sessionId> --json

# Progress (use --text; positional text is ignored)
npx ai-devkit@latest task progress <task-name> --text "Implementing task CLI" --agent <agent-name> --agent-type <agent-type> --pid <pid> --session <sessionId> --json

# Next step
npx ai-devkit@latest task next <task-name> "Run validation" --agent <agent-name> --agent-type <agent-type> --pid <pid> --session <sessionId> --json

# Blockers
npx ai-devkit@latest task status <task-name> blocked --agent <agent-name> --agent-type <agent-type> --pid <pid> --session <sessionId> --json
npx ai-devkit@latest task blocker <task-name> add "Waiting for review" --agent <agent-name> --agent-type <agent-type> --pid <pid> --session <sessionId> --json
npx ai-devkit@latest task blocker <task-name> resolve <blocker-id> --agent <agent-name> --agent-type <agent-type> --pid <pid> --session <sessionId> --json
npx ai-devkit@latest task status <task-name> active --agent <agent-name> --agent-type <agent-type> --pid <pid> --session <sessionId> --json

# Validation evidence - record after a fresh verify/tdd/test run
npx ai-devkit@latest task evidence <task-name> --passed --command "npm test" --exit-code 0 --summary "tests passed" --agent <agent-name> --agent-type <agent-type> --pid <pid> --session <sessionId> --json

# Reference an artifact (never copies the file)
npx ai-devkit@latest task artifact <task-name> docs/ai/testing/foo.md --kind test-report --description "Testing notes" --agent <agent-name> --agent-type <agent-type> --pid <pid> --session <sessionId> --json

# Read current status / list
npx ai-devkit@latest task show <task-name> --json
npx ai-devkit@latest task list --name <task-name> --json

# Close at lifecycle end
npx ai-devkit@latest task close <task-name> completed --agent <agent-name> --agent-type <agent-type> --pid <pid> --session <sessionId> --json
```

## When to emit (by workflow)

- **dev-lifecycle** - real read probe first; `create` at start when no
  non-terminal task exists for the feature; `assign` once when actor is known; set
  `status active` when real work starts or resumes; `phase` on every phase
  transition; `next` after phase planning; `progress` after
  planning/implementation task toggles; `show` at resume; `close completed`
  only after final verification/review is done.
- **verify / tdd / dev-testing** - `evidence` after fresh proof (this is what
  makes "last validation" trustworthy). Use `--failed` when it fails.
- **structured-debug** - reuse the same commands: `evidence` for repro results,
  `next` for the next hypothesis, `blocker add`/`resolve`, `progress`.
- **Any phase** - `blocker add` when blocked, `resolve` when clear; `next` to
  state the immediate next step. Set `status blocked` when an open blocker stops
  progress, and set `status active` again after the blocker is resolved.

## Tips

- Add `--json` when an agent must parse output (create/show/list). Omit for
  human-readable checks.
- Don't restate obvious nearby files or transient state; keep summaries short.
- Good task records let a later reader answer: who worked on it, which phase it
  reached, what changed, what is next, what verified the claim, and what blocked
  or changed scope. Do not log every command; do log those checkpoints.

---
name: task
description: AI DevKit · Track dev-lifecycle / structured-debug progress on a durable task with the ai-devkit task CLI. Use to record phase, progress, next step, blockers, and validation evidence.
---

# Task Progress Tracking

Record development progress on a durable task so any agent or session can answer
"where are we?" — current phase, progress, next step, blockers, and last
validation. The task is the durable unit; this skill drives the `ai-devkit task`
CLI at checkpoints (the same pattern as the `memory` skill).

Requires the `ai-devkit task` CLI. If `ai-devkit task --help` fails, run
`npx ai-devkit@latest --version` and use `npx ai-devkit@latest task ...` instead.

## Core idea

- **One task per feature.** Create it once; advance its `phase` field as work
  moves through the lifecycle.
- **`<id>` resolves to a feature key.** Every command below accepts the feature
  key in place of a task id, resolving to the latest non-terminal task. Prefer
  `<feature>` — no task-id bookkeeping.
- **Emit at checkpoints, not streaming.** Phase transitions, task toggles, fresh
  evidence, blockers discovered/resolved. A handful of calls per session.
- **Attribution is automatic.** Omit `--agent`; the CLI records the calling agent
  from environment. Pass `--agent`/`--agent-type` only for explicit handoff.

## Canonical commands

```bash
# Create the feature task once (capture taskId from --json if needed)
ai-devkit task create --title "<title>" --feature <feature> --phase requirements --json

# Advance phase as the lifecycle moves on
ai-devkit task phase <feature> implementation

# Progress (use --text; positional text is ignored)
ai-devkit task progress <feature> --text "Implementing task CLI" --percent 60

# Next step
ai-devkit task next <feature> "Run validation"

# Blockers
ai-devkit task blocker <feature> add "Waiting for review"
ai-devkit task blocker <feature> resolve <blocker-id>

# Validation evidence — record after a fresh verify/tdd/test run
ai-devkit task evidence <feature> --passed --command "npm test" --exit-code 0 --summary "tests passed"

# Reference an artifact (never copies the file)
ai-devkit task artifact <feature> docs/ai/testing/foo.md --kind test-report --description "Testing notes"

# Read current status / list
ai-devkit task show <feature> --json
ai-devkit task list --feature <feature> --json
```

## When to emit (by workflow)

- **dev-lifecycle** — `create` at start; `phase` on every phase transition;
  `progress` after planning/implementation task toggles; `show` at resume.
- **verify / tdd / dev-testing** — `evidence` after fresh proof (this is what
  makes "last validation" trustworthy). Use `--failed` when it fails.
- **structured-debug** — reuse the same commands: `evidence` for repro results,
  `next` for the next hypothesis, `blocker add`/`resolve`, `progress`.
- **Any phase** — `blocker add` when blocked, `resolve` when clear; `next` to
  state the immediate next step.

## Tips

- Add `--json` when an agent must parse output (create/show/list). Omit for
  human-readable checks.
- `task close <feature>` (defaults to `completed`) at lifecycle end; use
  `abandoned` otherwise.
- `task note <feature> "<text>"` appends a freeform note (no status change).
- Don't restate obvious nearby files or transient state — keep summaries short.

## Troubleshooting

- `unknown option '--workflow'` — not a CLI flag; the feature key and phase carry
  the workflow. Omit `--workflow`.
- `progress` text not saving — pass it via `--text`, not as a positional arg.
- `Task not found` — create the task first, or confirm the feature key matches.

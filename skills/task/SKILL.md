---
name: task
description: AI DevKit · Track dev-lifecycle / structured-debug progress on a durable task with the ai-devkit task CLI. Use to record phase, progress, next step, blockers, and validation evidence.
---

# Task Progress Tracking

Record development progress on a durable task: phase, progress, next step,
blockers, and validation evidence.

Requires the optional task command. First try `ai-devkit task --help`; if that
fails, try `npx ai-devkit@latest task --help`. If both fail, continue the user
workflow without task logging.

## Core idea

- **One task per feature.** Create it once; advance its `phase` field as work
  moves through the lifecycle.
- **`<id>` can be a feature key.** Every command below accepts the feature
  key in place of a task id, resolving to the latest non-terminal task. Prefer
  `<feature>` so agents do not track task ids.
- **Emit at checkpoints, not streaming.** Phase transitions, task toggles, fresh
  evidence, blockers discovered/resolved. A handful of calls per session.
- **Attribution is explicit.** Identify self once, then pass actor flags on
  mutation commands.

## Identify self

Use `agent-management` when attribution is needed:

1. Run `ai-devkit agent list --json`.
2. Match the current session id to an agent entry.
3. Build actor flags:
   `--agent <name> --agent-type <type> --pid <pid> --session <sessionId>`.
4. If identity is ambiguous, do not guess; skip task mutation logging.

## Canonical commands

Add `<actor-flags>` to mutation commands when self identity is known.

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

# Validation evidence - record after a fresh verify/tdd/test run
ai-devkit task evidence <feature> --passed --command "npm test" --exit-code 0 --summary "tests passed"

# Reference an artifact (never copies the file)
ai-devkit task artifact <feature> docs/ai/testing/foo.md --kind test-report --description "Testing notes"

# Read current status / list
ai-devkit task show <feature> --json
ai-devkit task list --feature <feature> --json

# Close at lifecycle end
ai-devkit task close <feature>
```

## When to emit (by workflow)

- **dev-lifecycle** - `create` at start; `phase` on every phase transition;
  `progress` after planning/implementation task toggles; `show` at resume.
- **verify / tdd / dev-testing** - `evidence` after fresh proof (this is what
  makes "last validation" trustworthy). Use `--failed` when it fails.
- **structured-debug** - reuse the same commands: `evidence` for repro results,
  `next` for the next hypothesis, `blocker add`/`resolve`, `progress`.
- **Any phase** - `blocker add` when blocked, `resolve` when clear; `next` to
  state the immediate next step.

## Tips

- Add `--json` when an agent must parse output (create/show/list). Omit for
  human-readable checks.
- Don't restate obvious nearby files or transient state; keep summaries short.

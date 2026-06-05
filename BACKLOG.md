# Backlog

Roadmap backlog for evolving AI DevKit from an agent workflow toolkit into the evidence, policy, and audit layer for AI-generated software work.

## Existing Follow-Ups

- [ ] Stop hardcoding `BUILTIN_SKILL_NAMES` in the CLI. Have `init` fetch the canonical list from a manifest in the registry repo (e.g., `skills/builtin.json`).
- [ ] Add daemon mode for `ai-devkit channel start` command.
- [ ] Add multiple Telegram channels support for `ai-devkit channel` — allow running multiple Telegram bots at the same time.
- [ ] Add agent session detail command.

## Agent Send Claude Code Parity

Opportunity: `claude -p` / Agent SDK usage is moving to a separate credit pool, while interactive Claude Code remains available through Claude subscriptions. Make `npx ai-devkit agent send` useful as a scriptable interface to an existing interactive Claude Code session.

### Milestone 1: Wait for Responses

- [ ] Add `--wait` to `npx ai-devkit agent send` so the command sends a prompt, polls the target agent transcript, prints new assistant output, and exits when the agent is waiting again.
- [ ] Add `--timeout <duration>` for `agent send --wait`, with a clear non-zero exit when the agent does not finish before the timeout.
- [ ] Add `--json` output for `agent send --wait`, including target agent metadata, sent prompt, captured response messages, elapsed time, and final status.
- [ ] Add `--stdin` support so scripts can pipe multi-line prompts into `agent send`.
- [ ] Add tests for transcript seeding so `--wait` prints only messages added after the send, not historical conversation content.

### Milestone 2: Script-Friendly Command Surface

- [ ] Add `npx ai-devkit agent ask "<prompt>"` as a convenience wrapper around `agent send --wait`.
- [ ] Make `agent ask` default to assistant text only, with `--verbose` for routing and status details.
- [ ] Support `agent ask --id <agent>` for explicit target selection and fail clearly when multiple agents match.
- [ ] Support `agent ask --json` for automation-compatible output.

### Milestone 3: Managed Interactive Claude Sessions

- [ ] Add `npx ai-devkit agent start --type claude --name <name>` to launch an interactive Claude Code session in a managed tmux session.
- [ ] Persist a lightweight ai-devkit session registry with name, type, PID, cwd, tmux target, createdAt, and lastSeenAt.
- [ ] Teach `agent list`, `agent send`, and `agent ask` to prefer registry metadata when available, while still supporting discovered sessions.
- [ ] Add `npx ai-devkit agent stop --id <agent>` for managed sessions.

### Milestone 4: Queueing and Safety

- [ ] Add per-agent send locking so concurrent sends fail with a clear message by default.
- [ ] Add `--queue` to enqueue prompts when the target agent is busy instead of failing.
- [ ] Add `--wait-until-ready` to wait for an agent to become ready before sending.
- [ ] Add `--fail-if-busy` as the strict automation mode for CI/scripts.
- [ ] Add warnings and docs for destructive prompts, billing expectations, and the difference between controlling an interactive session and using `claude -p`.

### Milestone 5: Output and UX Polish

- [ ] Add `--stream` to print new assistant output as it appears, when transcript updates can support it reliably.
- [ ] Add `--include-user` to include the sent user prompt in rendered output.
- [ ] Add `--tail <n>` to include recent context before sending or in verbose output.
- [ ] Add `--save <file>` to write captured assistant output to a file.
- [ ] Document examples for replacing common `claude -p` usage with `npx ai-devkit agent ask` and `agent send --wait`.

## Evidence Layer

Goal: make one-agent AI work evidence-based, reviewable, and verifiable.

- [ ] Rewrite the homepage hero, README opening, and npm package description around evidence-based AI development.
- [ ] Update getting-started docs so `verify`, `lint`, and evidence reports are the primary first workflow.
- [ ] Add `ai-devkit report --feature <name>` to generate a Markdown evidence report from requirements, design, planning, implementation, testing, lint, and review artifacts.
- [ ] Add `ai-devkit report --feature <name> --json` for scripts, CI, and future UI consumers.
- [ ] Add a PR-ready evidence report template with summary, scope, artifacts, verification commands, command output references, risks, and reviewer checklist.
- [ ] Improve `ai-devkit lint --feature <name> --json` with stable issue codes, severity, artifact paths, remediation hints, and machine-readable pass/fail summary.
- [ ] Add a GitHub Actions example that runs `ai-devkit lint --feature <name> --json` and fails on missing evidence.
- [ ] Add a before/after demo showing unmanaged AI coding versus AI DevKit-controlled delivery with evidence.

## Policy Layer

Goal: make evidence enforceable for serious engineering workflows.

- [ ] Define policy config schema for project-level requirements such as required phases, required checks, and approval gates.
- [ ] Add required phase policy support for `requirements`, `design`, `planning`, `implementation`, `testing`, and `review`.
- [ ] Add required verification command policy support, including command names, expected artifact locations, and freshness rules.
- [ ] Add required approval gate policy support for phases that must be human-approved before later work can proceed.
- [ ] Add stale evidence policy support for old test output, old implementation notes, or artifacts older than the current diff.
- [ ] Add CI failure behavior for missing evidence, stale artifacts, skipped verification, and missing approval.
- [ ] Add policy result output to `ai-devkit lint --json`.
- [ ] Add PR evidence template sections that summarize policy pass/fail status for reviewers.

## Phase Contracts

Goal: turn the current dev lifecycle into explicit, machine-checkable stage contracts.

- [ ] Split `dev-lifecycle` guidance into phase-specific skills: requirements, design, planning, implementation, testing, and review.
- [ ] Define the requirements phase contract with required sections, acceptance criteria, non-goals, risks, and open questions.
- [ ] Define the design phase contract with architecture decisions, dependencies, data flow, edge cases, and tradeoffs.
- [ ] Define the planning phase contract with ordered tasks, verification criteria, dependencies, and completion state.
- [ ] Define the implementation phase contract with touched files, decisions made, deviations from plan, and verification references.
- [ ] Define the testing phase contract with test strategy, commands run, output references, failures, and gaps.
- [ ] Define the review phase contract with findings, scope drift, missing tests, risk assessment, and final recommendation.
- [ ] Add `ai-devkit phase validate <phase> --feature <name>`.
- [ ] Add `ai-devkit phase validate all --feature <name>`.
- [ ] Add stale-artifact detection for implementation notes, test evidence, and review docs.
- [ ] Replace hardcoded `BUILTIN_SKILL_NAMES` with a registry manifest such as `skills/builtin.json`.

## Memory Quality

Goal: make memory a tested, curated knowledge base instead of an untrusted pile of notes.

- [ ] Add `memory.eval.yaml` schema for retrieval scenarios, expected includes, expected excludes, rank assertions, and scope/tag filters.
- [ ] Add `ai-devkit memory eval` to run retrieval tests against the configured memory database.
- [ ] Add `ai-devkit memory eval --json` for CI, factory gates, and future UI consumers.
- [ ] Add memory quality report output for missed, noisy, stale, duplicate, conflicting, and low-quality memories.
- [ ] Add `ai-devkit memory doctor` to suggest cleanup, consolidation, pruning, and confidence updates.
- [ ] Add `ai-devkit memory review` and memory changesets so proposed memory updates require human approval.
- [ ] Add provenance metadata for memories linked to factory runs, PRs, issues, commits, docs, and approvals.
- [ ] Add memory usage telemetry showing which memories were retrieved, ignored, cited, or used in final artifacts.
- [ ] Add post-run memory reflection to propose new memories from verified failures, decisions, conventions, and repeated fixes.
- [ ] Add memory rehearsal jobs that periodically run eval scenarios and flag retrieval drift.
- [ ] Add factory gate support for requiring memory eval to pass before selected stages.

## Local Software Factory

Goal: run the evidence-based workflow as a declarative local pipeline.

- [ ] Define `factory.yaml` schema for stages, agents, skills, inputs, outputs, gates, retries, timeouts, and artifact paths.
- [ ] Add `ai-devkit factory init` to generate a default sequential factory.
- [ ] Add `ai-devkit factory run --feature <name>` for local sequential factory execution.
- [ ] Add stage input resolution so each stage can consume artifacts from previous stages.
- [ ] Add stage output validation so generated artifacts are checked before the next stage starts.
- [ ] Add `ai-devkit factory status` to show run id, feature, current stage, stage status, assigned agent, artifacts, and evidence state.
- [ ] Add `ai-devkit factory logs <stage>` to inspect stage prompt, agent output, tool output, and validation result.
- [ ] Add `ai-devkit factory approve <stage>` for human approval gates.
- [ ] Persist factory run state locally with run id, stage id, status, artifacts, evidence, approvals, timestamps, and failure reason.
- [ ] Bind each factory stage to one agent session and record the provider, session id, cwd, and transcript pointer.

## Control Plane

Goal: make agent orchestration observable and controllable like infrastructure jobs.

- [ ] Extend agent registry records with factory run id, stage id, assigned feature, and managed worktree.
- [ ] Add token, cost, elapsed time, and provider metadata tracking where each provider exposes it.
- [ ] Add `ai-devkit factory console` for monitoring active runs, stages, agents, evidence state, and failures.
- [ ] Add `ai-devkit factory inspect <run-id>` for full run details, artifacts, sessions, logs, approvals, and verification evidence.
- [ ] Add `ai-devkit factory retry <stage>` for failed or rejected stages.
- [ ] Add `ai-devkit factory cancel <run-id>` for stopping active runs and cleaning up managed agents safely.
- [ ] Add worktree and branch strategy configuration per factory run.
- [ ] Add provider coverage matrix for session detail, start, send, wait, token metadata, and cancellation support.
- [ ] Add missing agent session detail support for any provider that lacks usable detail output.

## Systems of Record

Goal: connect factory lifecycle events to real systems of record without becoming a generic integration hub.

- [ ] Add GitHub Issue intake to start a factory run from an issue title, body, labels, and comments.
- [ ] Add GitHub PR creation with generated AI DevKit evidence report.
- [ ] Read GitHub Actions check status and attach verification results to factory runs.
- [ ] Add GitHub issue and PR comments for factory status changes, approval requests, failures, and completion.
- [ ] Add Slack integration for stage notifications, approval requests, and run status summaries.
- [ ] Add Linear issue intake and status updates.
- [ ] Add Jira issue intake and status updates.
- [ ] Add daemon mode for `ai-devkit channel start`.
- [ ] Add multiple Telegram channel support for `ai-devkit channel`.

## Team Platform

Goal: make AI DevKit useful for teams with shared policy, memory, auditability, and cost control.

- [ ] Add shared policy packs for common workflows such as solo developer, open-source maintainer, startup team, and regulated team.
- [ ] Add team skill registry support with versioned factory templates.
- [ ] Add audit log for factory runs, approvals, retries, failures, policy decisions, generated artifacts, and memory changes.
- [ ] Add token and cost budgets per factory run and per stage.
- [ ] Add role-based approval policies for requirements, design, release, and high-risk changes.
- [ ] Add memory quality web dashboard for eval history, doctor findings, review queue, coverage, provenance, and impact.
- [ ] Add team dashboard for active runs, blocked stages, failed verification, pending approvals, and cost usage.

## Long Term: AI Software Factory Infrastructure

Goal: support advanced factory orchestration across agents, repositories, services, and delivery workflows.

- [ ] Add parallel factory stages with dependency graph execution.
- [ ] Add agent pools and queueing for managed workers.
- [ ] Add scheduled factory runs for maintenance, dependency updates, documentation, and quality checks.
- [ ] Add specialized worker roles for requirements, design, implementation, testing, security, docs, and review.
- [ ] Add cross-repo factory runs for multi-service changes.
- [ ] Add automatic rollback or fix-forward pipelines for failed verification or production incidents.
- [ ] Add evaluation suites for factory output quality across generated artifacts, diffs, tests, and review findings.
- [ ] Add marketplace support for factory templates and phase skills.
- [ ] Explore hosted or self-hosted control plane with local runners.

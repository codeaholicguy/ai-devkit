# Roadmap

AI DevKit is evolving from a workflow toolkit for AI coding agents into the evidence, policy, and audit layer for AI-generated software work.

The long-term vision is still a control plane for AI software factories, but the near-term wedge is narrower:

> Make AI-generated software work reviewable, verifiable, and safe to merge.

The practical product path is:

> From request or ticket to verified PR, with AI DevKit enforcing artifacts, evidence, memory quality, approvals, and observability.

## 1. Evidence Layer

Goal: make one-agent AI work auditable before expanding into orchestration.

Focus:

- Reposition the homepage and README around evidence-based AI development.
- Make `verify` and `lint` first-class concepts in onboarding.
- Add `ai-devkit report --feature <name>` to generate a PR-ready evidence report.
- Improve `ai-devkit lint --feature <name> --json` for CI and PR automation.
- Document how to use `lint` as a GitHub Actions quality gate.
- Create a before/after demo showing unmanaged AI coding versus AI DevKit-controlled delivery.

Why it matters:

AI DevKit needs to own the trust boundary before AI-generated code enters the repo. This is the clearest near-term differentiation.

## 2. Policy Layer

Goal: make evidence enforceable for serious engineering workflows.

Focus:

- Add required phase policies.
- Add required verification command policies.
- Add required approval gate policies.
- Add policy config for project and team workflows.
- Add CI failure behavior for missing evidence, stale artifacts, or skipped verification.
- Add PR evidence templates that make policy results easy to review.

Why it matters:

Evidence is useful; enforceable evidence is valuable. Teams need a way to say what must be true before AI-generated work can be merged.

## 3. Phase Contracts

Goal: turn the current development lifecycle into explicit, machine-checkable stage contracts.

Focus:

- Split `dev-lifecycle` into phase skills: requirements, design, planning, implementation, testing, and review.
- Define input and output contracts for each phase.
- Add artifact validators for required sections and completion criteria.
- Add stale-artifact detection for implementation notes, test evidence, and review docs.
- Add phase validation commands such as `ai-devkit phase validate <phase> --feature <name>`.
- Stop hardcoding built-in skill names and fetch the canonical list from a registry manifest.

Why it matters:

The future factory only works if every stage has reliable inputs, outputs, and completion criteria.

## 4. Memory Quality

Goal: make durable context trustworthy.

Focus:

- Add `ai-devkit memory eval`.
- Add memory quality reporting for missed, noisy, stale, duplicate, conflicting, and low-quality memories.
- Add `ai-devkit memory doctor`.
- Add `ai-devkit memory review` and memory changesets.
- Add provenance and usage telemetry from factory runs, PRs, issues, commits, docs, and approvals.
- Add post-run memory reflection to propose new memories from verified failures, decisions, conventions, and repeated fixes.
- Add memory rehearsal jobs that periodically run eval scenarios and flag retrieval drift.
- Add factory gate support for requiring memory eval to pass before selected stages.

Why it matters:

Everyone will have memory. Few teams will trust memory unless it is evaluated, curated, and tied to evidence.

## 5. Local Software Factory

Goal: run the evidence-based workflow as a declarative local pipeline.

Focus:

- Add `factory.yaml` for pipeline stages, agents, skills, inputs, outputs, gates, retries, and timeouts.
- Add `ai-devkit factory init` to generate a default local software factory.
- Add `ai-devkit factory run --feature <name>` for sequential factory execution.
- Add `ai-devkit factory status`.
- Add `ai-devkit factory logs <stage>`.
- Add `ai-devkit factory approve <stage>` for human approval gates.
- Persist local run state with run id, stage id, status, artifacts, evidence, and timestamps.
- Bind each factory stage to one agent session.

Why it matters:

Users should be able to run a sequential AI software factory locally after the evidence and policy primitives are useful on their own.

## 6. Control Plane

Goal: make factory runs observable and controllable like infrastructure jobs.

Focus:

- Add factory run, stage, and feature metadata to agent sessions.
- Track token usage, cost, elapsed time, and provider metadata where available.
- Add `ai-devkit factory console`.
- Add `ai-devkit factory inspect <run-id>`.
- Add `ai-devkit factory retry <stage>`.
- Add `ai-devkit factory cancel <run-id>`.
- Add worktree and branch strategy configuration per factory run.
- Fill remaining agent session detail gaps across providers.

Why it matters:

AI DevKit should move from managing agent chat sessions to managing agent workers executing evidence-producing stages.

## 7. Systems of Record

Goal: connect the lifecycle to the places engineering teams already work.

Focus:

- Add GitHub Issue intake.
- Add GitHub PR creation with generated AI DevKit evidence report.
- Read GitHub Actions check status and attach verification results to factory runs.
- Add Slack notifications and approvals.
- Add Linear issue intake and status updates.
- Add Jira issue intake and status updates.
- Keep messaging channels focused on lifecycle events, approvals, and status.

Why it matters:

Integrations should not be generic connectors. They should serve intake, approval, verification, PR creation, and status update.

## 8. Team Platform

Goal: make AI DevKit useful for teams with shared governance.

Focus:

- Add shared policy packs.
- Add team skill registries with versioned factory templates.
- Add audit logs for runs, approvals, retries, failures, and generated artifacts.
- Add token and cost budgets per factory run.
- Add role-based approval policies for requirements, design, and release gates.
- Add memory quality dashboard for eval history, doctor findings, review queue, coverage, provenance, and impact.

Why it matters:

This is where team and paid value becomes obvious: governance, auditability, budget control, shared process, and memory quality.

## 9. Long Term: AI Software Factory Infrastructure

Goal: become real infrastructure for AI-assisted software delivery.

Focus:

- Add parallel factory stages.
- Add agent pools and queueing.
- Add scheduled factory runs.
- Add specialized worker roles for requirements, design, implementation, testing, security, docs, and review.
- Add cross-repo factory runs for multi-service changes.
- Add automatic rollback or fix-forward pipelines.
- Add evaluation suites for factory output quality.
- Add marketplace support for factory templates and phase skills.
- Explore a hosted or self-hosted control plane with local runners.

Why it matters:

This is the Kubernetes-style future: define the factory once, run it across Claude Code, Codex, Gemini, opencode, and future agents with state, policy, observability, and integrations.

## Strategic Sequence

Short term:

> Make one-agent AI work evidence-based, reviewable, and verifiable.

Medium term:

> Turn evidence and policy into declarative, validated factory stages.

Long term:

> Orchestrate many agents as workers in a software factory with state, observability, policy, memory quality, integrations, and human control.

---
phase: requirements
title: Requirements & Problem Understanding
description: Clarify the problem space, gather requirements, and define success criteria
---

# Requirements & Problem Understanding

## Problem Statement
**What problem are we solving?**

- `ai-devkit status` currently owns agent-specific readiness logic in the CLI service and only reports first-class agent checks for Codex, Pi, and Claude.
- Users need the status command to cover every startable adapter consistently while preserving adapter-specific checks where they exist.
- The current CLI-local implementation makes status harder to extend when new adapters are added and duplicates knowledge already owned by `@ai-devkit/agent-manager`.

## Goals & Objectives
**What do we want to achieve?**

- Report readiness for supported active adapters in `@ai-devkit/agent-manager`; exclude `gemini_cli` because that adapter is scheduled for removal.
- Move adapter-specific readiness checks into `packages/agent-manager`, leaving the CLI status service to assemble CLI-specific checks and render output.
- Preserve current semantics:
  - registries and channels are informational only.
  - missing built-in skills are warnings, not failures.
  - Codex and Claude check the AI DevKit hook.
  - Pi checks the AI DevKit plugin/session tracker, not a hook.
  - Pi auth reads configured providers from `~/.pi/agent/auth.json` without leaking secrets.
  - OpenCode auth uses `opencode auth list` and reports configured provider names.
  - adapters without a real hook/plugin integration do not receive fake integration failures.
- Improve status latency by running independent checks concurrently.
- Non-goals:
  - no new cache.
  - no new command.
  - no auth probing that requires interactive login.
  - no behavior changes to setup beyond shared utility reuse already agreed.

## User Stories & Use Cases
**How will users interact with the solution?**

- As an AI DevKit user, I want `ai-devkit status` to show Codex, Claude, Pi, Copilot, Gemini CLI, Grok CLI, and OpenCode readiness so I can see the state of every supported adapter.
- As a maintainer, I want adapter readiness behavior in `agent-manager` so new adapters can add readiness logic near adapter metadata and providers.
- As a Pi user, I want to see whether Pi has any configured model provider and which provider names are available, without exposing credential values.
- As a status command user, I want informational counts such as registries and channels to stay outside pass/warn/fail scoring.

## Success Criteria
**How will we know when we're done?**

- `StatusReport.agents` includes readiness-supported adapters and intentionally omits `gemini_cli`.
- The CLI status renderer lists executable adapters dynamically and omits adapters whose executable is unavailable from the human agent/check tables.
- Human output does not print separate missing built-in skill warning lines; the built-in skill row carries the warning status and count.
- Adapter-specific auth/integration logic lives in `packages/agent-manager/src/readiness`.
- Status service uses `Promise.all` for independent top-level checks and agent readiness checks.
- Existing status output semantics for Codex, Claude, and Pi are preserved.
- Tests cover all adapters, Pi provider auth parsing, optional integrations, and CLI rendering.
- Missing built-in skills produce `warn` on the built-in skills check and aggregate adapter status unless a stronger failure exists.
- Targeted CLI and agent-manager tests pass, and both affected packages build.

## Constraints & Assumptions
**What limitations do we need to work within?**

- Use existing repository patterns, TypeScript types, and Vitest coverage.
- Keep public JSON shape additive where possible; consumers should continue to find Codex/Pi/Claude fields under `agents`.
- Built-in skill roots remain CLI environment knowledge and are passed into `agent-manager` readiness as options.
- Agent auth checks are only implemented where non-interactive local evidence already exists.

## Questions & Open Items
**What do we still need to clarify?**

- None for this implementation pass. User will review final outcome before push.

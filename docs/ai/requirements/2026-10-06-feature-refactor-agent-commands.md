---
phase: requirements
title: Requirements & Problem Understanding
description: Clarify the problem space, gather requirements, and define success criteria
---

# Requirements & Problem Understanding

## Problem Statement

**What problem are we solving?**

- `packages/cli/src/commands/agent.ts` is a 1253-line god file: it mixes output formatters, service factories, stdin plumbing, and 10 commander subcommand registrations in one module.
- Business logic (agent resolution + ambiguity reporting, durable-vs-interactive disambiguation, input validation) is duplicated inside command handlers instead of living in `services/`. The `listAgents → resolveAgent → "No agent found" / "Multiple match"` flow is copy-pasted 3× (open :854, kill :1015, detail :1111); the durable-ambiguity check is duplicated in send (:951) and detail (:1070).
- Presentation helpers are duplicated across the codebase: 3 agent-type label maps (`util/agent.ts` full, `tui/console/render/agentTypeLabel.ts` two partial 4-entry maps that silently fall back to raw IDs for 7 types) and 3 relative-time formatters (`agent.ts:114`, `tui/console/render/formatRelative.ts`, `util/time-format.ts`).
- Who is affected: maintainers and contributors — new subcommands must be added to a giant file, and fixes in one copy don't reach the others (e.g. the start-agent pane rework improved error trimming but `RenameAgentPane` still carries the stale version).
- Current workaround: none; the file keeps growing.

## Goals & Objectives

**What do we want to achieve?**

- Primary goals
  - Split `commands/agent.ts` into one file per subcommand under `commands/agent/`, following the existing `commands/skill/`, `commands/status/`, `commands/capacity/` convention.
  - Command files contain only commander wiring + `ui.*` presentation calls. Business logic moves to `services/agent/`; pure formatting moves to `commands/agent/render.ts`.
  - Extract the duplicated agent-resolution + ambiguity flow into `services/agent/resolve-agent.ts`.
- Secondary goals
  - Consolidate the 3 agent-type label maps into one source of truth in `util/agent.ts` (with a compact variant for TUI list rows); delete `tui/console/render/agentTypeLabel.ts`.
  - Consolidate the 3 relative-time formatters into `util/time-format.ts`; delete `tui/console/render/formatRelative.ts` and `agent.ts:formatRelativeTime`.
  - Move `sanitizeProviderOutput`/`ANSI_ESCAPE_PATTERN` to `util/text.ts`; share `NAME_REGEX` so command + future pane validation use one definition.
- Non-goals
  - No behavior or output changes to any `ai-devkit agent *` command.
  - No changes to `commands/channel.ts` (deferred to a follow-up).
  - No changes to `runAction` spawn-per-action (deferred; `channel-start --daemon` must keep spawning regardless).
  - No `util/` vs `lib/` boundary reorganization.
  - No TUI pane primitive extraction (separate concern).

## User Stories & Use Cases

**How will users interact with the solution?**

- As a maintainer, I want each `agent` subcommand in its own file so that I can find and change one command's behavior without scrolling a 1200-line file.
- As a contributor, I want agent-resolution errors handled by a shared service so that "multiple agents match" UX stays consistent across `open`, `kill`, `detail`, `send`.
- As a maintainer, I want a single agent-type label map so that a new harness type doesn't require editing 3 maps (and silently falling back in 2 of them).
- Edge cases: commands that resolve agents by partial name (`open` prompts via `select`, `kill`/`detail` error out) keep their distinct ambiguity behaviors; only the shared listing/reporting part is extracted.

## Success Criteria

**How will we know when we're done?**

- `commands/agent.ts` deleted; `commands/agent/` contains `agent.command.ts` (wiring) + one `.command.ts` per subcommand + `render.ts` + `factory.ts`.
- `services/agent/resolve-agent.ts` exports a shared resolver used by open/kill/detail/send (and available to channel-runner).
- Exactly one agent-type label map and one relative-time formatter remain; all call sites updated.
- `registerAgentCommand(program)` signature and CLI surface unchanged — `ai-devkit agent --help` output identical.
- `npx vitest run` green in `packages/cli` (existing `__tests__/commands/agent.test.ts` suite passes unmodified or with import-path-only changes), `tsc -b` clean, lint clean.

## Constraints & Assumptions

**What limitations do we need to work within?**

- Preserve public contract: `registerAgentCommand` export consumed by `cli.ts`; helper exports imported by `src/__tests__/` (update import paths only).
- Refactor = pure moves + extraction; no behavior changes. Distinct per-command ambiguity UX (interactive `select` prompt in `open` vs error in `kill`) is preserved.
- Work happens in `.worktrees/feature-refactor-agent-commands` on branch `feature-refactor-agent-commands`.
- Assumption: `__tests__/commands/agent.test.ts` exercises commands through the registered commander tree, so it acts as a regression net for the split.

## Questions & Open Items

**What do we still need to clarify?**

- Resolved: scope = agent.ts only (channel.ts deferred); boundary = formatters → `render.ts`, logic → `services/`; label/time dedupe included.
- Open: none blocking. Naming of the shared resolver module (`resolve-agent.ts`) may adjust during implementation if it needs to cover group resolution too.

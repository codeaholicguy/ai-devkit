---
phase: requirements
title: Requirements & Problem Understanding
description: Clarify the problem space, gather requirements, and define success criteria
---

# Requirements & Problem Understanding

## Problem Statement

**What problem are we solving?**

- ai-devkit ships a local MCP memory server (`packages/memory`, bin `ai-devkit-memory`, published as `@ai-devkit/memory`) exposing `memory_storeKnowledge`, `memory_updateKnowledge`, `memory_searchKnowledge` over stdio.
- Today, making that server available in an agent harness (Claude Code, Codex, Gemini CLI, Cursor, OpenCode, Grok CLI, …) requires the user to hand-edit each harness's MCP config file. Almost nobody does, so memory recall never happens in most harnesses.
- `ai-devkit setup` already automates per-agent integration (hooks, skills) by writing into agent home dirs, but it does not wire MCP at all.

Who is affected: every ai-devkit user running multiple agent harnesses on one machine.

Current workaround: manual per-harness MCP config edits (documented nowhere in ai-devkit).

## Goals & Objectives

**What do we want to achieve?**

Primary goals:

1. `ai-devkit setup` configures the memory MCP server **globally (user-level, `$HOME`)** for every agent environment that (a) is detected locally and (b) has a verified user-level MCP config surface.
2. Idempotent: re-running `setup` never duplicates or corrupts entries; it reports `installed` on change and `skipped` when already wired.
3. Environments without MCP support (e.g. pi, by design) or without a verifiable stable global path are **skipped and reported honestly** — never silently ignored, never guessed.
4. Tool descriptions on the memory server are rewritten as behavioral instructions (search-first prompting) because they are always-loaded prompt surface.
5. `ai-devkit status` reports the per-harness memory-MCP wiring state.

Non-goals (explicitly out of scope):

- No behavioral/logic changes to the memory server tools (description text only).
- No project-scope MCP wiring (already exists via `ai-devkit init`/`install` + `mcpServers` in `.ai-devkit.json`).
- No changes to hooks, skills, session tracking, or the memory data model.
- No support for harnesses whose global MCP path cannot be verified from authoritative sources (roo/cline/kilocode/junie/kiro/github-copilot/antigravity/amp/devin in this iteration — see design doc research log).

## User Stories & Use Cases

- As a multi-harness developer, I run `ai-devkit setup` once and memory tools appear natively in Claude Code, Codex, Gemini CLI, Cursor, OpenCode, and Grok CLI — in every repo, zero manual steps.
- As a setup re-runner, running `ai-devkit setup` again keeps my configs intact (no duplicate `ai-devkit-memory` entries, my other MCP servers untouched).
- As a pi user, `setup` tells me pi has no MCP support and points me at the memory skill/CLI instead of pretending.
- As an operator, `ai-devkit status` shows which harnesses have memory MCP wired and which config file each entry lives in.

Edge cases:

- Harness installed but global config file absent → setup creates it (mkdir -p where needed).
- User hand-edits the `ai-devkit-memory` entry → setup overwrites only that entry (our namespace) and reports the change.
- Malformed existing config file → step fails with a precise message; other agents continue.
- Offline first run: `npx -y @ai-devkit/memory` needs the npm cache/network once; setup itself never invokes npx (config-only).

## Success Criteria

- Fresh isolated `$HOME` with dot-folders for the six wired harnesses: one `setup` run writes the correct entry into each global config (format verified per harness); a second run is fully idempotent (byte-stable files, all steps `skipped`).
- `setup --agent <name>` accepts the new agents and validates unknown names.
- Every non-wired environment present in `$HOME` produces an explicit `skipped` result with reason.
- Unit tests per harness writer + e2e isolated-HOME test green; `npm test` green; lint/format/typecheck green.
- Memory tool descriptions include behavioral "call search BEFORE non-trivial tasks" guidance.

## Constraints & Assumptions

- Global scope means `$HOME`-level config (per brief). Conflict with per-project MCP configs is harness-defined (project overrides user); we only add a user-level entry, so no conflicts.
- Command stability: all configs launch `npx -y @ai-devkit/memory` (single published bin `ai-devkit-memory`). Trade-off analysis in design doc.
- Codex global config is TOML; must preserve user comments/formatting → textual table upsert, not parse/stringify round-trip.
- `~/.claude.json` is Claude Code's big state file → read-modify-write, touch only `mcpServers["ai-devkit-memory"]`.
- Setup must stay injectable (`homeDir`, fake runners) for tests, mirroring `createSetupService` deps.
- Node ≥ 20.20 toolchain; existing repo conventions (vitest, oxlint, ESM).

## Questions & Open Items

Answered during clarification (2026-10-03):

- **Global vs project?** Global only; project wiring already exists. ✔
- **Idempotence on version change?** Command floats to latest (`npx -y`), so no version churn in configs. ✔
- **What command do configs point at?** `npx -y @ai-devkit/memory`; alternatives (pinned version, local node path) rejected — see design doc. ✔
- **Offline/missing npm?** Setup is config-only and never invokes npx; first MCP launch is the harness's responsibility. Status check reads config only. ✔
- **What does status report?** New read-only `memoryMcp` check listing per-harness wiring state. ✔

Open items deferred: none blocking. Follow-up candidates (out of scope): wiring harnesses once they document stable global paths (tracked in design doc research log).

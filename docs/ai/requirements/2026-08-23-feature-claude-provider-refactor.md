---
phase: requirements
title: Claude Provider Refactor Requirements
description: Behavior-preserving Claude-first provider organization for agent-manager
---

# Claude Provider Refactor Requirements

## Problem Statement

`@ai-devkit/agent-manager` has grown from interactive process detection into a package that also owns session listing, conversation reading, capacity reporting, and durable Claude print-mode agents. The current layout keeps most interactive provider implementations under `src/adapters/`, while newer features live in top-level feature folders such as `capacity/` and `durable/`.

Claude is now the clearest pressure point:

- `ClaudeCodeAdapter` combines process filtering, Claude project path encoding, PID-file matching, resume matching, legacy birthtime matching, session-to-agent mapping, process-only fallback mapping, conversation delegation, and historical session discovery.
- Claude print-mode durable support lives separately under `src/durable/` as `ClaudeCliProbe`, `ClaudePrintRunner`, and `ClaudePrintAgentService`.
- Claude-specific parsing lives in `src/utils/ClaudeSessionParser.ts`, even though it is not a generic utility.
- The package has no explicit provider boundary that can scale as Claude, Codex, Pi, Gemini, and other runtimes gain different capability sets.

The current behavior works, but the structure makes future changes harder to reason about. A developer adding or changing Claude behavior must scan `adapters/`, `utils/`, and `durable/` to understand one provider. A developer adding capacity or durable support for another runtime may be tempted to add more top-level `Claude*`, `Codex*`, or `Pi*` files instead of using a provider-local boundary.

## Goals & Objectives

### Goals

- Refactor Claude-related `agent-manager` code into a provider-local module boundary.
- Preserve public package contracts and current runtime behavior.
- Keep `ClaudeCodeAdapter` available from the existing public and adapter exports.
- Make Claude's internal responsibilities easier to test independently:
  - process/session matching;
  - Claude project/session file location;
  - PID-file live status metadata;
  - session parsing and conversation reading;
  - `AgentInfo` mapping;
  - durable print-mode provider execution.
- Treat Claude, Codex, Pi, Gemini, and similar tools as providers or runtimes.
- Treat capacity and durable execution as optional capabilities that provider implementations may support.
- Establish a package shape that can later move Codex capacity and other provider-specific code without forcing a speculative generic framework now.
- Follow the safe refactor rule: move/extract behavior first, change behavior only in later explicit tasks.

### Non-goals

- Changing `agent list`, `agent detail`, `agent send`, `agent sessions`, capacity, durable agent, or conversation output behavior.
- Renaming public exported classes or types.
- Replacing `AgentAdapter` with a new public provider interface in this feature.
- Implementing Claude capacity reporting.
- Implementing Codex, Pi, Gemini, or other provider refactors.
- Generalizing durable agents beyond the current Claude print-mode implementation.
- Changing durable persistence, database schema, locking, or run semantics.
- Changing Claude JSONL parsing rules, PID-file matching semantics, resume matching semantics, or status mapping beyond mechanical extraction.
- Deleting compatibility re-exports during the first refactor.

## User Stories & Use Cases

- As a maintainer, I can find Claude interactive detection, Claude session parsing, and Claude durable print-mode code under one provider-local area.
- As a maintainer, I can modify Claude PID-file matching or resume matching without editing a monolithic adapter class.
- As a maintainer, I can add focused tests for Claude session location and agent mapping without reaching through private adapter methods.
- As a CLI user, I see identical `agent list`, `agent sessions`, `agent detail`, and durable Claude behavior after the refactor.
- As a package consumer, existing imports from `@ai-devkit/agent-manager` and `src/adapters/ClaudeCodeAdapter.js` continue to work.
- As a future feature author, I can model provider-specific capacity or durable support as provider capabilities rather than adding more unrelated top-level files.

### Edge cases

- Existing tests that import `ClaudeCodeAdapter` from adapter paths must continue to compile.
- Tests that currently spy on private methods should either continue through compatibility wrappers or move to newly extracted provider-local modules with equivalent assertions.
- Claude Code PID files may be missing, stale, malformed, or point to a missing JSONL; fallback behavior must remain unchanged.
- `claude --resume <uuid>` matching must remain authoritative for resumed sessions.
- Historical `listSessions({ cwd })` behavior must continue walking all Claude project directories and filtering by recorded cwd, including worktree/current-cwd divergence.
- Durable Claude print-mode services must keep current names and exports even if their implementation files move.
- Build output and declaration files must not drop public exports.

## Success Criteria

1. Claude provider code is organized under a provider-local boundary, with compatibility exports preserving existing import paths.
2. `ClaudeCodeAdapter.detectAgents()` produces the same `AgentInfo` results for existing tested scenarios.
3. `ClaudeCodeAdapter.getConversation()` and `listSessions()` remain behaviorally compatible with existing tests.
4. Claude durable print-mode exports and behavior remain compatible with current durable tests.
5. The refactor introduces no public breaking change in `packages/agent-manager/src/index.ts` or `packages/agent-manager/src/adapters/index.ts`.
6. New or updated tests cover extracted Claude session locating/matching and agent mapping directly where practical.
7. Baseline validation is recorded before behavior-preserving moves, and each extraction stage is validated before the next one.
8. `npm run nx -- test agent-manager`, `npm run nx -- run agent-manager:typecheck` or equivalent TypeScript validation, package lint, and package build pass after the refactor.
9. No unrelated provider behavior changes for Codex, Pi, Gemini, Grok, Copilot, or OpenCode.
10. No unrelated top-level docs, generated files, or existing user changes are reverted.

## Constraints & Assumptions

- The work starts from branch `feature-claude-provider-refactor` in `.worktrees/feature-claude-provider-refactor`.
- The package remains ESM TypeScript and uses the existing Nx/npm workspace conventions.
- Current public exports in `packages/agent-manager/src/index.ts` are compatibility contracts.
- Existing `AgentAdapter` remains the public detection contract for this feature.
- Provider-specific implementation files may move, but the first refactor must preserve compatibility wrappers where old paths are imported.
- `capacity` remains Codex-only in this feature. Its current shape is used only as a design input for future provider capability organization.
- `durable` remains Claude-only in this feature. Moving or wrapping Claude durable files must not change persistence or execution behavior.
- The phrase "provider" is preferred over "vendor" for code and docs because it captures local CLI runtimes such as Claude Code, Codex CLI, Pi, Gemini CLI, and similar tools without implying a commercial contract.
- Broad shared abstractions require at least two current callers. This feature should avoid speculative base classes and optional-method interfaces.

## Alternatives Considered

1. **Leave the structure unchanged and only add comments.** Lowest risk now, but it does not reduce the current cost of changing Claude behavior or adding future provider capabilities.
2. **Create a generic provider framework immediately.** Rejected for this phase because Claude, Codex, and Pi have different session formats, matching sources, and capability surfaces. A generic framework would likely become optional-method scaffolding before there are enough real callers.
3. **Move only `ClaudeCodeAdapter` under `providers/claude`.** Useful but incomplete because Claude durable print-mode and Claude parsing would remain scattered.
4. **Provider-local Claude boundary with compatibility exports.** Chosen because it improves locality, preserves behavior, and creates a scalable path for future provider capability moves without requiring them now.

## Questions & Open Items

- No blocking product questions remain.
- Design must choose the exact internal folder name and compatibility wrapper pattern.
- Planning must decide whether durable Claude files move in the first implementation task or after interactive Claude extraction, based on test blast radius.

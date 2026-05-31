---
phase: testing
title: Testing Strategy
description: Define testing approach, test cases, and quality assurance
---

# Testing Strategy

## Coverage Goal

100% of new code in `AgentRegistry.rename()` and the `agent rename` CLI subcommand. No integration or E2E — the feature is a CLI primitive that mutates a local JSON file.

## Test Plan

### `AgentRegistry.rename()` — `packages/agent-manager/src/__tests__/utils/AgentRegistry.test.ts`

- [x] Updates the name of an existing entry
- [x] Preserves all other fields (`tmuxSession`, `cwd`, `pid`, etc.) on the renamed entry
- [x] Throws `RenameNotFoundError` when current name does not exist
- [x] Throws `RenameConflictError` when new name is in use by a live entry
- [x] Succeeds when new name exists only as a stale (dead) entry — pruned, then renamed
- [x] Writes atomically (no leftover `.tmp` on success)

### CLI `agent rename` — `packages/cli/src/__tests__/commands/agent.test.ts`

- [x] Calls `registry.rename` and prints success message
- [x] Exits with error when new name has invalid format (regex rejected)
- [x] Prints info and exits 0 when current and new name are the same (no-op)
- [x] Shows error and exits 1 when agent is not found
- [x] Shows error and exits 1 when new name is already in use

## Mocks & Fixtures

- Registry tests: real `AgentRegistry` instance pointed at a `mkdtempSync` temp file; entries use `process.pid` for "alive" and `999999` for "dead".
- CLI tests: `mockRegistry` with `rename: vi.fn()` plus `vi.hoisted` block defining `RenameNotFoundError` / `RenameConflictError` so the `vi.mock('@ai-devkit/agent-manager', …)` factory can re-export them.

## Test Commands

```
npx nx test agent-manager   # 362 tests, includes 5 new rename tests
npx nx test cli             # 633 tests, includes 5 new CLI tests
```

Both suites pass after this feature.

## Manual Testing

- [x] End-to-end smoke against a real registry file (rename + verify `tmuxSession` preserved + both error classes thrown). Script in scratch; not committed.
- [ ] Live agent: start an agent with `agent start --type claude`, run `agent rename <old> <new>`, verify it appears with the new name in `agent list` and that `agent send --id <new>` / `agent open <new>` resolve.

## Out of Scope

- Tmux session rename — registry-only by design.
- Concurrent-writer races on `agents.json` — same single-writer assumption as the rest of `AgentRegistry`.
- Renaming a dead agent's entry — see follow-up in implementation doc.

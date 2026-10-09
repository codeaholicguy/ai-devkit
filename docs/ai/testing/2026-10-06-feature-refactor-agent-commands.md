---
phase: testing
title: Testing Strategy
description: Define testing approach, test cases, and quality assurance
---

# Testing Strategy

## Test Coverage Goals

**What level of testing do we aim for?**

- This is a pure refactor: the existing `src/__tests__/commands/agent.test.ts` suite is the regression net and must stay green (import-path-only changes allowed).
- New/changed code target: extracted `services/agent/resolve-agent.ts` and consolidated `util/` helpers get dedicated unit tests since they gain new public surface.
- No e2e coverage change; CLI surface is unchanged.

## Unit Tests

**What individual components need testing?**

### services/agent/resolve-agent.ts

- [x] No agents running → reports "No running agents found." and returns null
- [x] No match → reports "No agent found matching" + candidate list, returns null
- [x] Single match → returns agent, no error output
- [x] Multiple matches → reports "Multiple agents match" + list, returns null (non-interactive path)
- [x] Durable ambiguity: partial `--id` matching both durable entry and live agent name → descriptive error
- [x] Durable exact-id match with a same-named live agent → allowed (id wins)

### util/agent.ts (label consolidation)

- [x] `agentTypeLabel` returns display labels for all 11 types (existing tests keep passing)
- [x] `agentTypeLabelCompact` returns compact labels (`gemini`, `OpenCode`→`opencode`) for all types — no silent fallback to raw id
- [x] TUI list/preview call sites render the same strings as before for the 4 previously-covered types

### util/time-format.ts (formatter consolidation)

- [x] Compact relative format matches old `render/formatRelative.ts` output ("now", "5s ago", "3m ago", "2h ago", "4d ago")
- [x] `formatRelativeTime` future variant preserved ("in 5m")
- [x] Existing `formatRelativeOrAbsoluteTime` behavior unchanged for `capacity/render.ts`

### commands/agent/*.command.ts

- [x] `ai-devkit agent --help` lists the same subcommands with same descriptions
- [x] Each command file registers via `register<Name>Command(agentCommand)`
- [x] Existing `agent.test.ts` passes: start validation errors, list output, sessions, detail, send targeting, kill, rename, group, console

## Integration Tests

**How do we test component interactions?**

- [x] `agent.test.ts` full file passes against the split command tree (covers registration → action → service → output end to end)
- [x] `tui/console` tests pass after label/formatter call-site updates (`AgentListPane`, `PreviewPane`, `StartAgentPane` tests)
- [x] `channel-runner` tests pass if it adopts `resolve-agent.ts`

## End-to-End Tests

**What user flows need validation?**

- [ ] Manual smoke in worktree build: `node dist/cli.js agent --help`, `agent list`, `agent start --type codex --name smoke --cwd /tmp` (tmux-gated), `agent detail --id smoke`, `agent kill smoke`
- [ ] `agent send` durable and interactive paths unchanged

## Test Data

**What data do we use for testing?**

- Existing fixtures/mocks in `__tests__/commands/agent.test.ts` and `__tests__/services/` — no new seed data needed.

## Test Reporting & Coverage

**How do we verify and communicate test results?**

- `cd packages/cli && npx vitest run` — full suite green
- `npm run build` / `tsc -b` clean
- `npx ai-devkit@latest lint --feature refactor-agent-commands` clean
- Evidence recorded via `task evidence` on the feature task

## Manual Testing

**What requires human validation?**

- [ ] `agent console` TUI smoke: list renders labels correctly for non-claude types (gemini, grok, kiro, devin now get proper labels — verify no regressions)
- [ ] `agent list` / `agent detail` output visually unchanged vs main

## Performance Testing

**How do we validate performance?**

- N/A — pure refactor. Command cold-start time should not regress (no new imports at module top-level beyond what was already imported).

## Bug Tracking

**How do we manage issues?**

- Findings during review → new GitHub issues or fix-forward in the feature branch.

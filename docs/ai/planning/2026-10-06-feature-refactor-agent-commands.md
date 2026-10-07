---
phase: planning
title: Task Planning & Breakdown
description: Break down the feature into tasks, estimate effort, and plan implementation
---

# Task Planning & Breakdown

Feature: `refactor-agent-commands` — split `commands/agent.ts` (1253 lines) into `commands/agent/` per-subcommand files; commands keep parsing + `ui.*` only, logic moves to `services/agent/`, formatters to `commands/agent/render.ts`; dedupe label maps and relative-time formatters.

## Milestones

### Milestone 1 — Util consolidation (no structural moves)

- [x] T1. Consolidate agent-type labels in `util/agent.ts`: keep `AGENT_TYPE_LABELS`/`agentTypeLabel`, add `agentTypeLabelCompact(type)` covering all 11 types; update `AgentListPane`/`PreviewPane` to use it; delete `tui/console/render/agentTypeLabel.ts`.
- [x] T2. Consolidate relative-time formatting in `util/time-format.ts`: add compact relative variant absorbing `tui/console/render/formatRelative.ts` (`formatRelative`) and `agent.ts` `formatRelativeTime`/`formatLocalTimestamp*`; delete `formatRelative.ts`; update call sites (`capacity/render.ts` stays on existing API).
- [x] T3. Move `sanitizeProviderOutput` + `ANSI_ESCAPE_PATTERN` from `commands/agent.ts` to `util/text.ts`; export `NAME_REGEX` from `util/agent.ts` (or `factory.ts`) for reuse.
- Validation: `npx vitest run src/__tests__/util src/__tests__/tui` + `tsc -b`.
- Testing scenarios covered: label map tests, time-format tests.

### Milestone 2 — Service extraction

- [x] T4. Create `services/agent/resolve-agent.ts`: `resolveAgentOrReport(manager, id, reporter)` (none/no-match/multiple/single) + `assertNoDurableAmbiguity(id, durable, liveAgents)`; unit tests in `__tests__/services/agent/`.
- Validation: new unit tests green.
- Testing scenarios: all resolve-agent cases in testing doc.

### Milestone 3 — Split `commands/agent.ts`

- [x] T5. Create `commands/agent/render.ts` (formatCwd, formatSeparator, formatWorkOn, resolveTailCount, selectConversationMessages, renderConversationDetail, STATUS_DISPLAY/formatStatus/colorStatus) and `commands/agent/factory.ts` (createAgentManager, createDurableAgentService, createCommandSendReporter, readStdin, resolveSendMessage, NAME_REGEX, formatPrintProvider).
- [x] T6. Create per-subcommand files `start|list|sessions|session|open|send|kill|detail|rename|console.command.ts`; open/kill/detail/send consume `resolve-agent.ts` (preserving `open`'s interactive `select` prompt); rename/start validate via shared `NAME_REGEX`.
- [x] T7. Create `commands/agent/agent.command.ts` with `registerAgentCommand(program)` delegating to registrars; update `cli.ts` import; delete `commands/agent.ts`.
- Validation: `npx vitest run src/__tests__/commands/agent.test.ts` green, `tsc -b`, `node dist/cli.js agent --help` output parity vs main.

### Milestone 4 — Verification & docs

- [x] T8. Full `packages/cli` vitest + build + `lint --feature`; record task evidence; update implementation doc.

## Task → Test Scenario Map

| Task | Scenarios |
|---|---|
| T1 | label map tests, pane render parity |
| T2 | compact/future relative-time tests |
| T3 | sanitize tests (existing via send path) |
| T4 | resolve-agent unit tests (6 cases) |
| T5–T7 | `agent.test.ts` full file, `--help` parity |
| T8 | full suite, smoke commands |

## Risks & Blockers

- Risk: `agent.test.ts` may import private helpers from `commands/agent.ts` directly (e.g. `selectConversationMessages`, `NAME_REGEX`). Mitigation: re-export from new modules or update test imports — allowed scope.
- Risk: subtle ordering — `session` and `sessions` are separate subcommand trees; keep `session detail|compact` nested under `session.command.ts`.
- Blockers: none known. `agent.service.ts`/`channel-runner.ts` may optionally adopt `resolve-agent.ts` — include only if trivial; do not expand scope.

## Sequencing Notes

- T1–T4 are independent and safe to land first.
- T5 must precede T6; T7 last in the milestone (atomic delete of agent.ts).
- Keep commits per milestone for reviewable diffs.

---
phase: planning
title: Project Planning & Task Breakdown
description: Task breakdown for the tracing integration against the locked Task contract
---

# Planning — Tracing Integration

## Milestones

- [x] M1: Contract ACK + feature worktree + requirements/design docs
- [ ] M2: Package scaffold + contract port (`ITaskService` + types)
- [ ] M3: `InMemoryTaskService` test double (full contract, async)
- [ ] M4: `TaskTracer` semantic→contract mapping (emit + ensureFeatureTask)
- [ ] M5: `readStatus` digest + staleness
- [ ] M6: CLI argv builders for skill integration
- [ ] M7: Tests (mapping, digest, argv, contract conformance)
- [ ] M8: Docs: README + skill-integration guide + implementation/testing notes
- [ ] M9: simplify-implementation, verify (build/typecheck/tests), commit, PR

## Task Breakdown

### Foundation
- [x] T1: ACK contract; create worktree `feature-tracing-integration`; `docs init-feature`
- [x] T2: Requirements + design docs
- [x] T3: Scaffold `packages/task-tracer` (package.json, tsconfig, project.json, vitest config) mirroring `@ai-devkit/memory`

### Contract port
- [x] T4: `contract.ts` — `Actor`, `TaskBlocker`, `TaskEvidence`, `TaskArtifact`, `Task`, `TaskEvent`, `TaskEventType` (closed string union), `ITaskService` (async), `TaskStore`/SPI types, error types
- [x] T5: Export the closed event-type set + the semantic mapping table as constants for reference/tests

### Test double
- [x] T6: `InMemoryTaskService` implementing `ITaskService` (atomic-ish snapshot map + events map; ID generation `<prefix><ts>-<4 base36>`; auto-actor null; resolution order: full id → unique prefix → feature→latest non-terminal)

### Tracer (emit)
- [x] T7: `TaskTracer` ctor takes `ITaskService`; methods: `ensureFeatureTask`, `enterPhase`, `setStatus`, `updateProgress`, `setNextStep`, `raiseBlocker` (returns blockerId), `resolveBlocker`, `recordValidation`, `setAttribution`, `addNote`, `recordCustom`, `closeTask`. Each calls exactly one `ITaskService` mutator; all async; optional `actor` forwarded.

### Read surface
- [x] T8: `status.ts` — `readStatus(service, ref, {staleAfterMs?})` digest: taskId/feature/status/phase/phaseEnteredAt/progress/nextStep/openBlockers/lastValidation/updatedAt/attribution/stale
- [x] T9: ~~`ActorResolver.ts`~~ — removed in simplify pass (0 callers, 0 tests, 0 consumers; duplicates service env-resolution). Callers pass an explicit `Actor` literal directly.

### CLI integration
- [x] T10: `cli-argv.ts` — pure builders returning `string[]`: `buildCreateArgv`, `buildPhaseArgv`, `buildStatusArgv`, `buildProgressArgv`, `buildNextArgv`, `buildBlockerAddArgv`, `buildBlockerResolveArgv`, `buildEvidenceArgv`, `buildArtifactArgv`, `buildAssignArgv`, `buildNoteArgv`, `buildEventArgv`, `buildCloseArgv`, plus `buildShowArgv`/`buildListArgv` for reads

### Tests
- [x] T11: `contract.test.ts` — assert the closed event-type union equals the frozen set
- [x] T12: `TaskTracer.test.ts` — each semantic maps to exact event type + payload via InMemory fake; ensureFeatureTask create-on-miss + reuse-on-hit; actor forwarded
- [x] T13: `status.test.ts` — digest projection; stale flag true/false around threshold; no-evidence → lastValidation null
- [x] T14: `cli-argv.test.ts` — each builder produces exact argv incl. flags, JSON escaping, `--passed`/`--failed` toggle, `--clear`

### Docs
- [x] T15: `packages/task-tracer/README.md` — purpose, port model, how to inject real `@ai-devkit/task-manager`, mapping table
- [x] T16: Skill-integration guide (how dev-lifecycle/verify call the builders) in implementation doc
- [x] T17: Implementation + testing docs filled

### Finish
- [x] T18: `simplify-implementation` pass
- [x] T19: Verify: build + typecheck + tests (fresh output)
- [x] T20: dev-commit + dev-pr; report URL/SHA/validation

## Dependencies

- T6 depends on T4. T7 depends on T4 + T6. T8 on T4. T10 on T4. T11–T14 on T4–T10.
- No dependency on shipped `@ai-devkit/task-manager` (port model). When it ships,
  an integration wiring test is added; mapping logic unchanged.

## Timeline

Single-session delivery; ordering is strictly top-to-bottom within MVP scope.

---
name: refactor
description: AI DevKit · Systematic structural or multi-file refactors across any stack while preserving behavior and public contracts. Use for reorganizing modules, boundaries, naming, APIs/contracts, staged refactor plans, or refactor risk review.
---

# Refactor

Use for structural refactors. Use `simplify-implementation` for local readability, dead code, or small logic cleanup.

## Rules

- Preserve behavior and public contracts unless changes are explicit.
- Classify first: small = local/no public movement; medium = multi-file/extraction/boundary/export touch; large = package/cross-package/staged migration/broad consumers.
- For medium/large refactors, write a brief before editing: evidence, pressure, remaining delta, do/defer/avoid ranking, non-goals, contracts, target shape, validation, compatibility.
- Do not propose target trees without current-code evidence: tree, file size/mixed concerns, imports/exports, consumers, validation commands.
- Separate moves/renames from logic changes and design/API behavior questions.
- Prefer existing conventions, provider locality, and the smallest structure that solves observed pressure.
- Subtract before adding: remove dead wrappers, redundant validators, stale exports, and unused paths before introducing new structure.
- Avoid taste refactors, premature abstractions, and thin one-file directories unless staged or conventional.
- Validate with fresh command output.

## Workflow

1. Discover stack, configs, entry points, exact validation commands, and prior decisions when available.
2. Map contracts: exports, APIs, routes, CLI, config, schemas, events, files, docs, examples, consumers.
3. Map structure: directories, naming, boundaries, dependency direction, cycles, mixed concerns, duplication.
4. Check reader load: can a new reader find where key state comes from and what can change it quickly? Collapse pass-through layers that do not hide policy, adaptation, or real complexity.
5. If continuing work, compare current state and list only remaining delta.
6. Choose refactor type and shape:
   - extraction, reorganization, or design refactor
   - flat/internal, feature-first, domain-first, layer-first, core/adapters/entrypoints, service/repository
   - adapter-heavy: provider-specific stays provider-local; shared pure logic -> shared/core/formatting; SDK/client code -> adapter/entrypoint/delivery
7. Check boundary discipline: validate at CLI/config/network/external API edges; keep internal logic typed, domain-shaped, and pure where practical.
8. Prefer domain structure over repeated conditionals: state machine, typed model, registry/map, reducer, or ownership-focused module when it deletes branches or invalid states.
9. Rank moves as do now, defer, or avoid.
10. Stage: baseline -> delete dead paths -> move/rename -> imports/call sites -> split/merge -> simplify -> exports/docs/tests.
11. For internal API changes, inventory callers, migrate them, and delete the legacy API in the same wave when no external contract requires compatibility.
12. Preserve or explain compatibility re-exports/wrappers/barrels like `types.ts` plus `types/`.
13. Validate: tests, compile/typecheck, lint, build, public/downstream smoke checks, diff review.

## Stop

Pause when contracts are unclear, baseline cannot be checked and no narrower validation exists, breaking changes need migration decisions, ownership/product decisions are required, or the work is becoming a rewrite.

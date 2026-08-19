---
name: refactor
description: AI DevKit · Systematic structural or multi-file refactors across any stack while preserving behavior and public contracts. Use for reorganizing modules, boundaries, naming, APIs/contracts, staged refactor plans, or refactor risk review.
---

# Refactor

Use for structural refactors. Use `simplify-implementation` for local readability, dead code, or small logic cleanup.

## Rules

- Analyze before editing; preserve behavior and public contracts unless changes are explicit.
- Capture baseline validation when meaningful commands exist.
- Separate moves/renames from logic changes.
- Prefer existing conventions and the smallest structure that solves observed pressure.
- Do not refactor by taste: require pressure such as unclear ownership, repeated edits, coupling, contract leakage, duplication, cycles, or inconsistent naming.
- Add abstractions only for proven duplication, coupling, or boundary pressure.
- For broad refactors, present the staged plan before editing; proceed when the user's request already authorizes implementation.
- Validate with fresh command output.

## Workflow

1. Discover stack, configs, entry points, validation commands, and prior decisions when available.
2. Map contracts: exports, APIs, routes, CLI, config, schemas, events, files, docs, examples, consumers.
3. Map structure: directories, naming, boundaries, dependency direction, cycles, mixed concerns, duplication.
4. Choose target shape:
   - flat/internal for small codebases
   - feature-first for workflows
   - domain-first for stable business concepts
   - layer-first for consistent technical roles
   - core/adapters/entrypoints for pure logic plus IO/framework boundaries
   - service/repository for workflows over persistence or external state
5. Stage: baseline -> move/rename -> imports/call sites -> split/merge -> simplify -> exports/docs/tests -> dead code.
6. Validate: tests, compile/typecheck, lint, build, smoke checks, downstream/consumer checks, diff review.

## Checklist

- [ ] Contracts mapped and compatibility stated
- [ ] Current pressure identified from code, not taste
- [ ] Target structure justified
- [ ] Moves/renames separated from behavior changes
- [ ] Public contract smoke check chosen
- [ ] No premature abstraction
- [ ] Validation run or known baseline failure recorded

## Stop

Pause when contracts are unclear, baseline cannot be checked and no narrower validation path exists, breaking changes need migration decisions, ownership/product decisions are required, or the work is becoming a rewrite.

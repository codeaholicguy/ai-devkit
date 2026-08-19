---
name: refactor
description: AI DevKit · Systematic structural or multi-file refactors across any stack while preserving behavior and public contracts. Use for reorganizing modules, boundaries, naming, APIs/contracts, staged refactor plans, or refactor risk review.
---

# Refactor

Use for structural refactors. Use `simplify-implementation` for local readability, dead code, or small logic cleanup.

## Rules

- Analyze before editing; preserve behavior and public contracts unless changes are explicit.
- Classify first: small = local/no public movement; medium = multi-file/extraction/boundary/export touch; large = package/cross-package/staged migration/broad consumers.
- For medium or large refactors, write a visible pre-edit refactor brief before file edits. Keep it token-efficient: evidence, classification, pressure, remaining delta, do/defer/avoid ranking, non-goals, contracts, target shape, validation, and compatibility plan.
- Discover exact validation commands from project files before claiming a command exists: inspect scripts/configs such as `package.json`, lockfiles, task runners, Makefiles, CI config, workspace manifests, and local docs. Prefer the narrowest exact command that proves the touched behavior.
- Capture baseline validation when meaningful commands exist.
- Separate moves/renames from logic changes.
- Prefer existing conventions and the smallest structure that solves observed pressure.
- Do not refactor by taste: require pressure such as unclear ownership, repeated edits, coupling, contract leakage, duplication, cycles, or inconsistent naming.
- Do not propose a target tree before evidence from current code: current tree, file sizes/mixed responsibilities, imports/exports, downstream consumers, and validation commands.
- Add abstractions only for proven duplication, coupling, or boundary pressure.
- Avoid thin directories with one tiny file unless they match established convention or are an explicit staged migration.
- State explicit non-goals for medium and large refactors so unrelated cleanup, rewrites, dependency swaps, style churn, and behavior changes do not creep in.
- For broad refactors, present the staged plan before editing; proceed when the user's request already authorizes implementation.
- Validate with fresh command output.

## Workflow

1. Discover stack, configs, entry points, validation commands, and prior decisions when available.
2. Map contracts: exports, APIs, routes, CLI, config, schemas, events, files, docs, examples, consumers.
3. Map structure: directories, naming, boundaries, dependency direction, cycles, mixed concerns, duplication.
   - When continuing an existing refactor, compare against current state and list only remaining delta.
4. Choose refactor type and target shape:
   - extraction: pull cohesive logic into a new helper/module while keeping callers and behavior stable
   - reorganization: move files, packages, boundaries, or names to clarify ownership without changing behavior
   - design refactor: change internal abstractions or dependency direction to reduce coupling while preserving public contracts
   - flat/internal for small codebases
   - feature-first for workflows
   - domain-first for stable business concepts
   - layer-first for consistent technical roles
   - core/adapters/entrypoints for pure logic plus IO/framework boundaries
   - service/repository for workflows over persistence or external state
   - adapter-heavy: provider-specific stays provider-local; shared pure logic -> shared/core/formatting; SDK/client code -> adapter/entrypoint/delivery
5. For package reorganizations, include a target tree before editing. Show only the directories/files that matter, mark moved/new/compatibility surfaces, and name the package entrypoints affected.
6. Rank each proposed move as do now, defer, or avoid, with a one-line reason.
7. Stage: baseline -> move/rename -> imports/call sites -> split/merge -> simplify -> exports/docs/tests -> dead code.
8. For public import paths, package entrypoints, CLI paths, or documented APIs, keep compatibility re-exports/wrappers unless the user explicitly requested a breaking change. Explain compatibility barrels like `types.ts` plus `types/`: what they preserve, who consumes them, and when/if they can be removed.
9. Separate design/API behavior questions from move-only refactors; flag them instead of bundling them into file moves.
10. Validate: tests, compile/typecheck, lint, build, smoke checks, downstream/consumer checks, diff review. When public package APIs move, validate sibling/downstream consumers that import them.

## Checklist

- [ ] Contracts mapped and compatibility stated
- [ ] Evidence captured before target shape: tree, file size/mixed concerns, imports/exports, consumers, validation
- [ ] Current pressure identified from code, not taste
- [ ] Existing refactor state compared; only remaining delta listed
- [ ] Refactor classified as small, medium, or large
- [ ] Refactor type stated: extraction, reorganization, design refactor, or a justified mix
- [ ] Each proposed move ranked do now/defer/avoid
- [ ] Explicit non-goals stated for medium/large work
- [ ] Target structure justified
- [ ] Provider locality checked for adapter-heavy packages
- [ ] Package reorgs include a target tree
- [ ] Moves/renames separated from behavior changes
- [ ] Compatibility re-exports/wrappers/barrels explained or breaking change explicitly authorized
- [ ] Thin one-file directories justified or avoided
- [ ] Design/API behavior questions flagged separately from move-only refactors
- [ ] Exact validation commands discovered from project files
- [ ] Public/downstream contract smoke check chosen
- [ ] No premature abstraction
- [ ] Validation run or known baseline failure recorded

## Stop

Pause when contracts are unclear, baseline cannot be checked and no narrower validation path exists, breaking changes need migration decisions, ownership/product decisions are required, or the work is becoming a rewrite.

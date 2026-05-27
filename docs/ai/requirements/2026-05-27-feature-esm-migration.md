---
phase: requirements
title: Requirements & Problem Understanding
description: Clarify the problem space, gather requirements, and define success criteria
feature: esm-migration
---

# Requirements & Problem Understanding

## Problem Statement

All four workspace packages in `ai-devkit` (`packages/agent-manager`, `packages/channel-connector`, `packages/cli`, `packages/memory`) are authored and compiled as CommonJS (`tsconfig.base.json` → `"module": "commonjs"`, no `"type"` in `package.json`). This blocks adoption of modern dependencies that ship ESM-only, including:

- `chalk@5+` (currently pinned to `^4.1.2`)
- `ora@6+` (currently `^5.4.1`)
- `inquirer@9+` (currently `^8.2.6`)
- `execa@6+`, `node-fetch@3+`, `nanoid@4+`, and most new packages in the Node ecosystem

The maintainer (single-developer monorepo) wants access to these newer majors for features (better terminal UX, smaller bundle size, top-level await in CLI bootstrap).

**Affected**: maintainer only — no external consumers of `@ai-devkit/*` (workspace-private). The published `ai-devkit` CLI is consumed via `npx`/global install, not imported, so end users are unaffected at the API level.

## Goals & Objectives

**Primary**
- Convert all four packages **plus the `e2e/` workspace** to native ESM (`"type": "module"`, `module: "NodeNext"`, ESM-style emit; `.js` extensions on relative imports; `.d.ts` declarations follow NodeNext resolution).
- Tests continue to pass after migration to Vitest (per-package + e2e).
- Published `ai-devkit` CLI binary continues to work (shebang script, `bin/ai-devkit`).
- Workspace cross-package imports (`@ai-devkit/memory` → `agent-manager`, etc.) continue to resolve.

**Secondary**
- Unblock dependency upgrades (chalk 5, ora 8, inquirer 12) in a follow-up PR.
- Enable top-level `await` in CLI entry points and migration scripts.

**Non-goals**
- Upgrading `chalk`/`ora`/`inquirer` to ESM-only majors as part of this migration — that's a follow-up PR (keeps blast radius small).
- Refactoring tests beyond the mechanical Jest→Vitest codemod (e.g., restructuring test architecture, adding coverage).
- Publishing dual CJS+ESM builds — single ESM output only.
- Changing public CLI command surface or behavior.
- Refactoring code beyond what ESM requires.

## User Stories & Use Cases

- As the maintainer, I want to add `import chalk from 'chalk'` against chalk@5 in a package without bundler hacks.
- As the maintainer, I want `npm run build && npm test` to succeed on the migrated branch with no regressions vs `main`.
- As an end user running `npx ai-devkit@latest <command>`, I see identical behavior before and after migration (no command output, exit code, or template-resolution regressions).
- As a contributor (future), I write `import { x } from './y.js'` with explicit `.js` extensions and `import.meta.url` for path resolution.

**Key flows to verify**
- `ai-devkit init` (uses `TemplateManager` with `__dirname` → templates dir).
- `ai-devkit channel start` (spawns daemon via `__filename`/`__dirname` resolution).
- `ai-devkit memory *` (uses `__dirname` for migrations dir; lazy `require('./schema')` in `connection.ts`).
- CLI version printing (`require('../package.json')` in `cli.ts`).
- E2E suite (`e2e/jest.config.js`).

**Edge cases**
- The `memory/database/connection.ts` lazy `require('./schema')` exists to break a circular init path; converting to `await import()` may force `getDb()` and its callers to become async — needs design call in Phase 3.
- `channel-daemon.ts` vs `channel-daemon.js` extension-sniffing in `channel.ts:20-35` (dev vs built mode) — needs rework with `import.meta.url`.
- Templates copy step in build (`cp -R templates dist/templates`) must continue to land next to ESM output.

## Success Criteria

- [ ] `npm run build` succeeds for all four packages with `"type": "module"` set.
- [ ] `npm test` passes for all packages (no skipped suites vs `main`).
- [ ] `npm run test:e2e` passes.
- [ ] `node packages/cli/dist/cli.js --version` prints correct version (validates JSON loading + shebang).
- [ ] `ai-devkit init` in a scratch dir produces the same file set as the pre-migration baseline (snapshot diff).
- [ ] `ai-devkit memory store` + `memory search` round-trip works (validates `__dirname`-replacement + dynamic import).
- [ ] `ai-devkit channel start/stop` lifecycle works (validates daemon spawn paths).
- [ ] After merge, a follow-up PR can `npm i chalk@^5` and the CLI still builds — proves the unblock.
- [ ] Pre-commit hook (`npm run lint && npm run test`) passes locally without `--experimental-vm-modules` or other Node flags.
- [ ] All 4 publish workflows (`publish-*.yml`) green on workflow_dispatch dry-run.
- [ ] Rollback: migration commits are atomic per package (one commit per package), so reverting a single package is `git revert <sha>` without disturbing others.

## Constraints & Assumptions

**Constraints**
- Node engine already `>=20.20.0` (supports ESM natively; JSON import attributes available).
- Monorepo uses Nx + npm workspaces; build per package via `tsc`.
- Jest 29 + @swc/jest currently in use; per-package `jest.config.js` files with 80% coverage thresholds.
- TypeScript version is **inconsistent**: 5.3.3 (cli, agent-manager, channel-connector) vs 5.4.5 (memory). NodeNext + JSON import attributes (`with { type: 'json' }`) work on 5.3+, but **standardize to `^5.5.0` across all packages** as part of the migration for stable NodeNext type resolution.
- Pre-commit hook (`.husky/pre-commit`) runs `npm run lint && npm run test` — Vitest must satisfy this without flag soup.
- CI: 4 publish workflows (`publish-cli.yml`, `publish-{memory,agent-manager,channel-connector}.yml`) + `ci.yml` + `e2e.yml`. No structural changes required (they call `npm ci && npm run build && npm publish`), but `e2e.yml` runs `npm run test:e2e` which becomes Vitest.
- Nx `project.json` per package wraps `npm run build`/`npm run test`/`npm run lint`. Vitest swap is transparent to Nx since it's just changing the underlying npm script.
- `packages/cli` has a post-build step `cp -R templates dist/templates`. No other packages have artifact-copying. Migration must preserve this.

**Named Assumptions** (made under user's "no clarifying questions" instruction — flag any to redirect)

1. **Test framework**: migrate from Jest (@swc/jest) to **Vitest**. *Rationale*: codebase has 97 `jest.mock` call sites across 31 files; under Jest-ESM these require rewriting to `jest.unstable_mockModule` (async, different semantics) + the `--experimental-vm-modules` flag warning. Vitest migration is a mechanical `jest.*` → `vi.*` codemod (302 `jest.fn`, 97 `jest.mock`, 32 `jest.spyOn`, etc. all map 1:1) plus 4 manual fix-ups for `jest.requireActual` → `await vi.importActual()`. Estimated 1-1.5 days. Bonus: faster test runs, no experimental flags, native ESM. Considered and rejected: (a) Jest full-ESM — comparable effort with worse outcome; (b) hybrid CJS-tests/ESM-prod via `@swc/jest module.type: 'commonjs'` — cheapest (~4-6h) but tests would not exercise the real ESM module graph, hiding ESM-only bugs.
2. **Migration strategy**: phased — pilot `@ai-devkit/memory` (smallest, fewest CJS-isms) in commit 1, then `channel-connector`, `agent-manager`, `cli` in subsequent commits on the same branch, single PR at the end. *Rationale*: each package builds independently; piloting catches Jest-ESM/tsconfig issues before applying everywhere.
3. **Dep upgrades**: this PR only changes module system. `chalk@4` (dual CJS+ESM exports, safe), `ora@5` (CJS with named exports, importable from ESM), `inquirer@8` (CJS-only — works via Node's CJS-named-exports interop but requires `import inquirer from 'inquirer'` default-import form, **verify in pilot**) stay on current majors. Upgrades to ESM-only majors come in a follow-up PR. Other deps (`commander@11`, `debug@4`, `fs-extra@11`, `gray-matter@4`, `smol-toml@1`, `yaml@2`, `zod@3`) are all dual or CJS-with-named-export-interop friendly. *Rationale*: keeps PR reviewable; isolates migration risk from upgrade risk.
4. **Rollout**: single PR to `main` (no feature flag, no staged release). The four packages publish together; version bump under existing release tooling. *Rationale*: small monorepo, single maintainer, no external lib consumers.
5. **Type system**: `tsconfig.base.json` switches to `module: "NodeNext"`, `moduleResolution: "NodeNext"`. Source files use explicit `.js` extensions on relative imports.
6. **JSON loading**: replace `require('../package.json')` with `import pkg from '../package.json' with { type: 'json' }` (Node 20.10+ stable). Falls back to `readFileSync` if TS emit causes issues.

## Questions & Open Items

- **Q1 (design, Phase 3)**: How to handle the circular-init `require('./schema')` in `memory/database/connection.ts:89` — make `getDb()` async, restructure to avoid the cycle, or use `createRequire(import.meta.url)` as a tactical CJS-interop escape hatch?
- **Q2 (design, Phase 3)**: `channel-daemon` spawn — keep dual-mode (ts-node for dev, compiled .js for prod) or simplify to compiled-only since ESM ts-node setup is more fragile?
- **Q3 (planning, Phase 4)**: Vitest config strategy — single root `vitest.config.ts` with workspace projects, or per-package configs mirroring current Jest layout? Lean toward per-package (less coupling, easier rollback per package).
- **Q4 (rollout) — RESOLVED**: Minor version bump for all 4 packages. CLI is consumed via `npx`/global install (no `import` consumers); the `@ai-devkit/*` libs are workspace-private and unpublished. `"type": "module"` is a structural change but carries no user-visible behavior change, so a minor bump is honest signaling without overstating impact.
- **Q5 (Phase 3)**: `inquirer@8` is CJS-only with no `exports` map. Node's CJS-named-export detection should make `import inquirer from 'inquirer'` work, but `import { prompt } from 'inquirer'` may fail. Pilot must verify the exact import form used (`packages/cli/src/**/*.ts`) survives the switch. Fallback: pin to `inquirer@9` (ESM-native) as part of this PR if interop breaks — accepts a minor scope creep.
- **Q6 (Phase 3)**: Declaration emit — `tsc` under `module: "NodeNext"` requires explicit `.js` extensions in source even though the file on disk is `.ts`. Confirm IDE (VS Code) handles this with TS 5.5+ without red squigglies; otherwise document the convention in CONTRIBUTING.


---
phase: testing
title: Testing Strategy
description: Define testing approach, test cases, and quality assurance
---

# Testing Strategy

## Test Coverage Goals

- Unit: every new branch (flags, exclusivity, skip counting, failures, exclude, dry-run, confirm guard, glob).
- E2E: the issue's deterministic `file://` fixture (3 skills) drives the four mandated assertions plus JSON and exclusivity.
- Gates: scoped unit tests, `npm run lint`, `npm test`, `npm run test:e2e`.

## Unit Tests

### Command layer — `packages/cli/src/__tests__/commands/skill.test.ts`

- [x] `--all` + positional skill name → error + exit 1, no service calls
- [x] `--all` forwards resolved install options + `confirmInstall` callback; renders summary table
- [x] `failed > 0` → `process.exitCode = 1` after rendering (no hard exit)
- [x] `--exclude` / `--dry-run` forwarded to service
- [x] `--all --json` prints the full result object as JSON
- [x] `--all --dry-run` renders "Dry run: would install …" + table
- [x] declined confirm → warning, exit 0
- [x] non-TTY confirm callback resolves true without prompting
- [x] TTY confirm asks once with skill count
- [x] help documents `--all`, `--exclude <glob>`, `--dry-run`, `--json`
- [x] `--built-in` path unchanged (no `addAllSkills` call)

### Service layer — `packages/cli/src/__tests__/services/skill/skill.service.test.ts`

- [x] installs every discovered skill; counts installed/skipped/failed
- [x] already-installed skills skipped and counted; no symlink/copy (never updates)
- [x] mixed installed/skipped
- [x] per-skill failure continues; error captured per item
- [x] `--exclude "deb*"` filters; excluding everything → `ValidationError`
- [x] dry-run touches no filesystem target and writes no config entries
- [x] dry-run marks existing installs as skipped
- [x] no confirm for ≤20 skills; one confirm at >20; declined → "Bulk skill install cancelled." with nothing installed; dry-run never confirms
- [x] empty registry → NotFoundError

### Glob — `packages/cli/src/__tests__/services/skill/skill-validation.test.ts`

- [x] literal, `*` runs, `?` single char, regex metachar escaping, full anchoring

## End-to-End Tests — `e2e/skill-add-all.e2e.ts`

Deterministic local `file://` registry (3 fixture skills: alpha-review, beta-format, gamma-test), isolated HOME, non-TTY (piped) invocation:

- [x] `--all` → exit 0, 3 installs on disk + 3 config entries
- [x] rerun → exit 0, JSON reports 3 skipped / 0 installed / 0 failed (idempotent, no prompt)
- [x] `--exclude "alpha-*"` → 2 installs, alpha absent
- [x] `--dry-run` → exit 0, "would install 3 skills", 0 installs, no config skills
- [x] `--json` → parseable `{registryId, dryRun, total, installed, skipped, failed, items}`
- [x] `--all` + skill name → non-zero exit + error, nothing installed

## Test Execution Evidence

- Scoped: `vitest run` on the three touched suites — 58 + 70 + 12 tests pass.
- Gates: `npm run lint`, `npm test`, `npm run test:e2e` all green (see PR body).

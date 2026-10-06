---
phase: implementation
title: Implementation Guide
description: Setup, code structure, implementation notes, and validation evidence
---

# Implementation Guide

## Development Setup

Worktree `.worktrees/feature-devin-capacity`, branch `feature-devin-capacity`. `npm ci` at repo root if `node_modules` missing; tests via `npx vitest run` scoped to `src/__tests__/capacity` in `packages/agent-manager` and `src/__tests__/commands/capacity` in `packages/cli`.

## Code Structure

- `packages/agent-manager/src/harnesses/devin/credentials.ts` — new
- `packages/agent-manager/src/capacity/providers/devin.ts` — new
- `packages/agent-manager/src/capacity/sources/devin.ts` — new
- `packages/agent-manager/src/capacity/index.ts` — add `getDevinCapacityReport` + exports
- `packages/cli/src/commands/capacity.ts` — provider list/dispatch
- `packages/cli/src/commands/capacity/render.ts` — provider label
- `packages/agent-manager/src/__tests__/capacity/devin.test.ts` + fixtures — new

## Implementation Notes

### Core Features

- Flat-TOML parse of credentials.toml (regex on `key = "value"` lines; ignore comments/blanks).
- 401/403 returned by fetcher as typed error carrying status; source maps to unauthenticated report.
- `hide_daily_quota` omits daily window; non-quota plans produce empty windows with `available: "unknown"`.

### Patterns & Best Practices

- Copy zai.ts structure verbatim where possible (record/optionalNumber helpers, clamping, timeout, sanitized errors).
- Credential options use injectable `env`/`readFile` exactly like pi credentials.ts.

## Validation Evidence

- `vitest run src/__tests__/capacity/devin.test.ts` (agent-manager): 16/16 pass.
- `vitest run src/__tests__/commands/capacity` (cli): 16/16 pass.
- `npm run lint` (nx, 6 projects): green.
- `npm test` (nx, 6 projects): 102 files / 1241 tests pass (initial failures were unbuilt workspace deps in fresh worktree; resolved by `npm run build`).
- `npm run test:e2e`: 42/42 pass.
- `npm run fmt:check`: repo-wide drift on main (39 files incl. untouched); new files formatted with oxfmt.
- Live probe: `GET https://app.devin.ai/api/org-4de…506a/billing/quota/usage` Bearer → 200; shape recorded in requirements.

## Deviations & Cleanups

- Added `DEVIN_ORG_ID` env override alongside `DEVIN_API_KEY` (design decision 2) for enterprise installs/testability.
- 401/403 classified via `DevinHttpError` status carried from the fetcher; other statuses still throw.

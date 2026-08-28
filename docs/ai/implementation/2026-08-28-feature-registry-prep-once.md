---
phase: implementation
title: Registry preparation implementation notes
description: Record code changes, decisions, deviations, and verification
---

# Registry preparation implementation notes

## Setup

- Worktree: `.worktrees/feature-registry-prep-once`
- Branch/base: `feature-registry-prep-once` from fetched `origin/main` at `2b7dd5e`
- Bootstrap: `npm ci`; workspace artifacts built with `npm run build`

## Intended Changes

- `SkillRegistry`: own an instance-scoped map of preparation promises and the extracted refresh/stale fallback operation.
- `SkillManager`: stop emitting the generic per-skill cache-check line.
- Tests: verify public behavior at Git, filesystem, UI, manager, service, and command boundaries.

## Decisions

- Promise retained for all outcomes, including rejection, to enforce one attempt per registry per instance.
- Registry ID is the only key; no current caller mutates its URL within one instance.
- No TTL, flags, batch API, or public signature change.
- Fetch-catalog memoization uses a separate instance promise and private loader, with no public signature change.

## Implementation Record

- Added seven registry preparation tests covering sequential, concurrent, mixed, stale, terminal failure, new-instance, and non-Git outcomes.
- Added the instance map and extracted `refreshOrUseStaleCache`; the promise is retained before awaiting and for success, fallback, and rejection.
- Moved the generic manager cache message to registry-specific start/success/stale messages.
- Strengthened init, install-service, and built-in skill command tests to show multi-skill callers retain one manager instance; existing setup tests cover the single built-in installer boundary.
- Regression gate: the sequential test passed with the fix, failed with two pulls when memoization was temporarily removed, and passed after restoration.
- Independently memoized `fetchMergedRegistry`; one shared promise now replaces repeated default-registry fetches and project/global config reads within the same instance.

## Deviations

None from the approved core design. Lower-level clone/update detail messages remain for compatibility; the new preparation-level start and outcome are emitted only once.

## Verification and Review

- Build completed for all 6 projects.
- Full workspace suite passed 159 files and 2,061 tests.
- Lint passed all 6 projects with three pre-existing unused-catch warnings and no new warning.
- Feature docs lint passed.
- E2E passed 1 file and 41 tests.
- Final design/caller review found no blocking issues, public contract changes, or PR #202 conflict.

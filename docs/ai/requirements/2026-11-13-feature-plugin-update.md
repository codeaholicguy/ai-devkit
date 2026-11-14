---
phase: requirements
title: Plugin update requirements
---

# Plugin update

## Problem Statement

CLI users can add, remove, and list shared npm plugins but cannot explicitly update them. Re-adding a plugin does not provide version comparison, update summaries, or an appropriate recovery contract for an existing installation.

## Goals & Objectives

Provide `ai-devkit plugin update [package]` for one configured plugin or all configured plugins. Target the npm `latest` tag explicitly, including major versions. Preserve enabled-plugin configuration and report actionable results.

Non-goals: automatic rollback, version selectors, preview mode, dependency-range-only updates, updating unconfigured dependencies, or changing add/remove behavior.

## User Stories & Use Cases

- As a plugin user, update one configured package by name, including scoped npm names.
- As a maintainer, update all configured plugins and see which updated, were up-to-date, or failed.
- As a user facing failure, see the previously installed version for manual recovery.
- With no configured plugins, receive a clear no-op message.

## Success Criteria

- Validate a supplied package name and reject an unconfigured target before any npm mutation.
- Read the installed version and query the registry latest version before installation. Equal versions produce `up-to-date` without an install; different versions target explicit `latest`.
- Report exactly three per-plugin result states: `updated`, `up-to-date`, and `failed`, with summary counts.
- Show `from → to` versions per plugin and flag a change across major versions. Unknown metadata is explicitly labeled unknown.
- Validate installed plugin manifests after an update; only successful installation and validation count as updated.
- A failure reports its error and previously installed version when readable; otherwise explicitly report unknown. Never uninstall or automatically restore the previous package.
- Bulk updates proceed sequentially after individual failures, report all results, and return a nonzero exit status if any plugin fails.
- Enabled-plugin configuration remains unchanged on every update outcome.
- Pre-check failures produce failed results rather than triggering a speculative installation.
- Scoped tests, isolated CLI smoke tests, and final review pass before commit/push/PR. Rebase onto current origin/main before the eventual PR and revalidate affected behavior.

## Constraints & Assumptions

Use the existing private npm project at `~/.ai-devkit/npm`, not npm global installation. Use existing manager/package-service boundaries and argument-based subprocess execution. A registry latest tag may change between lookup and installation; report the actual installed version after installation. Version equality skips installation without promising to repair an already invalid manifest. Missing installations or unreadable installed-version metadata fail the pre-check; repair remains outside this update command.

Tests belong in `packages/cli/tests/`; persistent CLI E2E tests belong in root `e2e/`. Smoke tests must isolate user state. Stay in feature-plugin-update worktree. No automatic rollback in v1.

## Questions & Open Items

No pending product decisions. Explicit latest including majors, three states, version deltas, major indicators, and previous-version recovery output were approved at the brainstorm gate. The orchestrator accepted the registry-race, equality-skip, and unknown-metadata-as-failed assumptions at the phase 1 gate. Phase 2 review on 2026-11-14 found no remaining product questions or template gaps.


## Requirements Review — 2026-11-14

Reviewed the problem, goals/non-goals, user stories, success criteria, constraints, and open items against the requirements template and approved brainstorm direction. All required template sections are present. Each approved behavior has an observable acceptance criterion and corresponding scenarios in the testing draft.

Rechecked alternatives: targeted-only updates reduce implementation scope but omit the approved bulk workflow; dependency-range updates avoid some major changes but conflict with explicit latest; automatic restoration offers recovery but exceeds v1 scope. Retain the approved optional-target command, explicit latest, and manual recovery contract.

Accepted assumptions: equal versions skip installation without manifest repair; unreadable installed metadata fails the pre-check; actual installed versions are reported after installation because latest may move. No change to approved scope. No pending product decisions. Next: design review to settle interfaces, metadata validation, result rendering, and isolated validation details.

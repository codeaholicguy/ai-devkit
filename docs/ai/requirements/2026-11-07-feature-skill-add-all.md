---
phase: requirements
title: Requirements & Problem Understanding
description: Clarify the problem space, gather requirements, and define success criteria
---

# Requirements & Problem Understanding

Source: [issue #424](https://github.com/codeaholicguy/ai-devkit/issues/424) (requirements seed).

## Problem Statement

- `skill add` installs one skill at a time. CI/runner provisioning needs the whole registry.
- Today users must script enumeration against internal cache paths (a published workaround clones the registry and loops `skill add`) — fragile and dependent on implementation details.

## Goals & Objectives

- First-class bulk mode: `ai-devkit skill add <registry> --all`.
- Compose with existing install options: `-g -e <env...>`, `--mode copy`.
- Deterministic, CI-friendly output (`--dry-run`, `--json`).

### Non-goals (explicit)

- Updating/refreshing already-installed skills (`skill update` owns that).
- Installing across ALL configured registries (`--all` is registry-scoped by design).
- `--include` filtering (YAGNI; `--exclude` only).

## User Stories & Use Cases

- As a CI pipeline author, I run `ai-devkit skill add <registry> --all --json` in a non-TTY runner so the whole registry is provisioned without prompts.
- As a developer, I rerun the same command and get a skip summary instead of prompts or silent updates (idempotent).
- As a user on a TTY facing a huge registry, I get exactly one confirmation before mass-install.

## Success Criteria (from the issue, binding)

1. `--all` is mutually exclusive with a `<skill-name>` positional (both = error).
2. Idempotent by default: already-installed skills are skipped and counted; never prompts for them, never silently updates.
3. Partial failure: continue per-skill; summary table (installed / skipped / failed); non-zero exit if any failed.
4. Enumeration source: the registry itself (cached clone maintained by `add-registry`, shallow-clone fallback) — NOT the search index, NOT internal cache paths.
5. `--dry-run`: list what would be installed, install nothing.
6. `--json`: machine-readable result list `{skill, status, error?}` consistent with `status --json` conventions (plain `JSON.stringify` of the result object).
7. `--exclude <glob>`: v1 filtering.
8. Interactivity guard: non-TTY never prompts (pure CI mode); TTY + registry with >20 installable skills asks one confirm.
9. `--built-in` keeps its current UX (may share internals with `--all`).
10. Testing: unit (flag exclusivity, skip-counting, exit codes, exclude glob) and E2E with a local `file://` registry fixture (3 skills: `--all` → 3 installs; rerun → 3 skips; `--exclude` → 2; `--dry-run` → 0 installs).

## Constraints & Assumptions

- TypeScript CLI in `packages/cli`; commander for flags.
- Registry enumeration must reuse the existing registry preparation path (`SkillRegistryService.prepareRegistryRepository`) — that is the "cached clone maintained by add-registry, shallow-clone fallback" contract.
- `--exclude` uses glob matching; single value v1 (comma-separated can come later).

## Questions & Open Items

- None blocking; the issue fully specifies interface and semantics.

---
phase: requirements
title: Remote Built-in Skills Manifest Requirements
description: Define live built-in skill discovery without requiring a CLI release
---

# Remote Built-in Skills Manifest Requirements

## Problem Statement

AI DevKit compiles its curated built-in skill names into the CLI. Adding a new built-in therefore requires a CLI code change and release even though the skill itself is already installable from the AI DevKit repository.

Maintainers need a hand-managed list on `main` so a newly added skill can become a built-in immediately for existing CLI versions.

## Goals & Objectives

- Make `skills/built-in.json` on `main` the live source of truth for built-in skill names.
- Fetch the manifest whenever an init, setup, built-in install, or status flow needs the list.
- Fetch at most once per CLI process.
- Preserve working setup and built-in flows during network or manifest failures by using the current 20-name list.
- Keep the manifest and implementation deliberately small.

### Non-goals

- Versioning or pinning the manifest or registry repository.
- Code generation or compile-time literal types derived from the manifest.
- Descriptions, compatibility metadata, or registry selection in the manifest.
- Persisting a downloaded manifest cache across CLI invocations.
- Uninstalling skills removed from the live list.

## User Stories & Use Cases

- As a maintainer, I can add `skills/<name>/SKILL.md` and append `<name>` to the JSON array on `main`, making it available to old CLIs without a release.
- As a CLI user, I receive the live curated set through `init`, `setup`, or `skill add --built-in`.
- As an offline user, setup continues with the known bundled fallback set.
- As a user running `status`, I see presence counts against the live set, or against the fallback set when the live manifest is unavailable.

## Success Criteria

- [ ] `skills/built-in.json` is a bare JSON array seeded with the existing 20 names.
- [ ] A single loader fetches the raw `main` manifest and returns `Promise<readonly string[]>`.
- [ ] Repeated loader calls in one process share one fetch promise.
- [ ] The loader accepts only a non-empty array of non-empty, unique, valid skill-name strings.
- [ ] Network, HTTP, JSON, or validation failure emits a clear warning and returns the embedded current list.
- [ ] `init`, `skill add --built-in`, setup, and status obtain names through the loader.
- [ ] A runtime name is passed directly to `SkillManager.addSkill`, which resolves `skills/<name>/SKILL.md` from the refreshed registry without another compiled allowlist.
- [ ] Status reports `required` and `present` against the live list; on fetch failure it reports against the fallback and warns.
- [ ] `BUILTIN_SKILL_NAMES` and the unused `BuiltinSkillName` literal union are removed.
- [ ] Tests never use the real network and cover loader success, promise caching, invalid manifests, fallback, and consumer integration.
- [ ] Build, unit tests, lint, and the E2E suite pass.

## Constraints & Assumptions

- The URL points directly to `raw.githubusercontent.com/codeaholicguy/ai-devkit/main/skills/built-in.json`.
- The repository `main` branch is intentionally the rollout boundary; old CLIs may install newer skills.
- `BUILTIN_SKILL_REGISTRY` remains trusted compiled configuration.
- The current registry refresh behavior makes newly committed skill directories visible to existing CLIs.
- The fallback may become stale; it exists only to preserve safe offline behavior.

## Questions & Open Items

None. Product and failure semantics were explicitly approved.

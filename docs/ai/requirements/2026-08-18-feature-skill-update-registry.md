---
phase: requirements
title: Requirements & Problem Understanding
description: Harden the existing per-registry skill update contract
---

# Requirements & Problem Understanding

## Problem Statement

`ai-devkit skill update [registry-id]` and exact `owner/repo` filtering already work. The cache-level contract is not directly tested, unknown-registry errors do not identify valid choices, and users must always type the owner even when a repository name uniquely identifies one cached registry.

## Goals & Objectives

- Add dedicated `SkillRegistry` tests backed by an isolated temporary cache.
- Preserve no-argument updates of every cached registry and exact-ID updates of only the requested registry.
- Include sorted available registry IDs in unknown-registry errors.
- Resolve an owner-less repository name only when it matches exactly one cached registry and report the resolved ID through `ui.info`.
- Keep zero-match and ambiguous shorthand inputs as `NotFoundError` cases.
- Document exact and shorthand per-registry update forms and add a changelog entry.

### Non-goals

- Reimplementing the existing optional CLI argument or exact registry filter.
- Changing cache layout, cloning, pull behavior, summary structure, or command parsing.
- Choosing among ambiguous shorthand matches.

## User Stories & Use Cases

- As a user, I can update all cached registries with `ai-devkit skill update`.
- As a user, I can update one registry with its exact `owner/repo` ID.
- As a user, I can use a unique repository-name shorthand and see which full ID was selected.
- As a user who mistypes or supplies an ambiguous name, I see the available full registry IDs and no registry is updated.
- As a maintainer, I have direct regression tests for filtering, skipped non-Git directories, and summary counts.

## Success Criteria

- Dedicated tests prove all-cache, exact-ID, unique shorthand, ambiguous shorthand, zero-match, unknown full ID, non-Git skip, and summary-count behavior.
- Exact matching remains case-sensitive and uses the existing `owner/repo` cache layout.
- Available IDs are deterministic and comma-separated in `NotFoundError` messages.
- Unique shorthand emits an informational resolution message before updating only the resolved registry.
- Targeted tests, coverage, lifecycle lint, workspace lint/tests, and build pass.

## Constraints & Assumptions

- The cache is the source of truth for update candidates; configured but uncached registries are not listed.
- A shorthand is any supplied ID without `/`; its candidate key is the repository directory name.
- Cache entries are owner/repository directories. Non-directory entries are ignored and repository directories that are not Git repositories are counted as skipped.
- No material product questions remain; the brief fixes scope and behavior.

## Questions & Open Items

None. Per-registry updating is an established capability; this feature hardens its contract and UX only.

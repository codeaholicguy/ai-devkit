---
phase: requirements
title: Prepare each skill registry once per command
description: Remove duplicate registry refreshes during multi-skill installation
---

# Prepare each skill registry once per command

## Problem Statement

`SkillManager.addSkill()` asks `SkillRegistry` to prepare its cache repository for every skill. Multi-skill flows such as `init --built-in`, template init, install reconciliation, `skill add --built-in`, and setup therefore pull the same registry repeatedly. The built-in set contains 20 skills, causing 20 refresh attempts and repeated cache messages in one command.

## Goals

- Prepare each distinct registry once per `SkillRegistry` instance, including concurrent requests.
- Keep `SkillManager` responsible for skill orchestration and `SkillRegistry` responsible for cache repositories.
- Preserve one fresh-cache attempt per command, stale-cache fallback, public signatures, per-skill installation, and mixed-registry isolation.
- Print one registry-specific refresh start and outcome instead of one generic cache check per skill.

## Non-goals

- Cross-process or time-based cache freshness, TTLs, new flags, or persisted timestamps.
- A batch skill API or changes to public method signatures.
- Retrying a failed refresh for later skills in the same run.

## User Stories

- As a user installing many skills from one registry, I wait for one repository refresh.
- As a user with a stale cache during a network failure, I see one warning and all eligible skills use the same cached snapshot.
- As a user installing from mixed registries, each registry is prepared independently once.

## Success Criteria

- Same-registry sequential and concurrent calls share one preparation promise.
- A successful refresh, stale fallback, terminal no-cache failure, and non-Git cache result are reused for the instance.
- A second `SkillRegistry` instance refreshes again.
- Registry ID alone is the memoization key.
- `SkillManager` no longer prints `Checking local cache...`; `SkillRegistry` prints one start and one success or stale outcome.
- Existing command behavior and full validation suites remain green.

## Constraints and Assumptions

- Store the promise before awaiting it to deduplicate concurrent work.
- The first result defines the registry snapshot for that instance; later skills do not retry after stale fallback or terminal failure.
- Current callers do not change a registry URL while reusing one `SkillRegistry` instance.
- PR #202 is not in fetched `origin/main`; the registry-local design avoids conflict with its init/install consolidation.

## Open Items

None. Option A and its freshness policy are approved.

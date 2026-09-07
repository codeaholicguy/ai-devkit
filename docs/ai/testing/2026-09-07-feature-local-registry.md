---
phase: testing
title: Local Folder Skill Registry Testing
description: Safety-first testing strategy
---

# Testing

## Goals

100% new parser/containment coverage, unit coverage for SR-01–12, temp-directory adapter coverage, CLI e2e path/error coverage, and green Git registry regressions.

## Source and Config

- [x] Absolute, ./, and ../ normalize to canonical file URLs against registration cwd. (AC-01–02)
- [x] Template/config relative paths use their containing file. (AC-03)
- [x] Root symlinks and trailing slashes deduplicate; different IDs are rejected. (AC-04)
- [x] Git URL/SCP values remain Git; malformed/hosted file values fail locally. (AC-01, AC-05, SR-06, SR-12)

## Preparation and Install

- [x] Local preparation returns the root with no Git/write call and memoizes once. (AC-06, SR-01–02)
- [x] Missing/moved, non-directory, missing-skills, and empty roots error clearly without cache fallback. (AC-05, SR-05)
- [x] Valid temp fixture installs without modifying source. (AC-07, SR-01)
- [x] Escaping symlinks are rejected before read/install. (SR-07)
- [x] Nested skills are ignored; candidate/metadata limits fail clearly. (SR-08–09)
- [x] Fixture skill content is never executed. (SR-10)

## Index and Update

- [x] Focused/full indexing uses local roots; seed/TTL paths refresh local entries. (AC-08)
- [x] Selected/local-only/mixed updates report live local sources and make no Git call for them. (AC-09, SR-01–02)
- [x] Missing local update errors without fallback. (SR-05)

## Removal and Display

- [x] Project/global removal deletes config/index but not source. (AC-10, SR-01, SR-03)
- [x] Global removal deletes only contained ID-derived cache data. (SR-04)
- [x] Status displays local and redacts Git credentials. (AC-11, SR-11)
- [x] Listing does not infer escaped cache-relative IDs. (AC-12)

## Fixtures

Tests create isolated temp roots with skills/name/SKILL.md, snapshot source content/metadata, and clean only the test-owned outer temp directory. Escape fixtures point to a second temp root.

## Required Validation

- [x] Focused unit/coverage
- [x] npm run build
- [x] npm test
- [x] npm run lint
- [x] npm run test:e2e

## Results

Focused suites passed 63 tests. Full workspace tests passed all six projects, including 1,139 CLI tests. The six-project build passed. Lint passed with two unrelated pre-existing warnings. E2E passed 42 tests. A partial coverage run passed selected tests but failed the global threshold because unselected files count as zero; full coverage remains in T11.

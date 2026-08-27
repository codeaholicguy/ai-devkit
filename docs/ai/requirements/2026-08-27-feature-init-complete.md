---
phase: requirements
title: Complete Project Initialization
description: Make init fully apply project configuration through the install reconciler
---

# Complete Project Initialization

## Problem Statement

`init --template` installs project skills and saves MCP definitions, but only `install` generates agent MCP files. It still reports success, leaving first-time users with partial setup and an unexpected configure/apply split.

## Goals and Non-Goals

- Make `init` completely apply supported project artifacts in one command.
- Give `init` and `install` one shared service with `installed`, `matched`, `skipped`, `conflict`, and `failed` item states.
- Preserve `setup` for machine scope and `install` for existing-config reconciliation.
- Exit nonzero and use incomplete copy for failures or unresolved conflicts.
- Preserve phase docs unless overwrite is approved; reject malformed MCP targets; write shared MCP targets once.
- Keep every existing interface. Do not add `--no-install`/`--apply`, remove deleted MCP entries, or promise transactional rollback.

## User Stories

- A first-time user gets usable declared artifacts after `init`.
- A template author gets consistent docs, skills, and MCP application.
- A teammate or CI job converges committed configuration with `install`.
- Existing user docs and agent settings survive unless replacement is authorized.

## Success Criteria

1. Template init generates all supported selected MCP files.
2. Both commands share application logic and truthful results.
3. `failed` or unresolved `conflict` exits 1; matching state exits 0.
4. Template phase replacement prompts interactively or requires `--overwrite` non-interactively.
5. Malformed MCP files remain untouched and fail application.
6. Claude plus GitHub applies shared `.mcp.json` once.
7. Existing flags remain compatible and environment help is accurate.
8. Six-project build, full tests, and lint pass.

## Constraints and Decisions

Persist desired config and registries before environments, phases, skills, and MCP so partial work is resumable. Keep project template skills because machine setup covers only some agents and built-ins. Option C and these boundaries were approved on 2026-08-27; no open questions remain.

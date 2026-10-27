---
phase: planning
title: "OMP Agent Harness Support - Plan"
feature: omp-adapter
description: Ordered implementation plan for OMP support
---

# Plan: OMP Agent Harness Support

## Milestones

- [x] M1: OMP requirements/design and red tests established.
- [x] M2: TypeScript and Rust OMP discovery implemented.
- [x] M3: Structured profile arguments work through CLI, local Tmux, and devkitd.
- [x] M4: Verification complete and upstream pull request opened.

## Task Breakdown

### Foundation

- [x] Add failing TypeScript tests for type registration, process matching, session mapping, and start arguments.
- [x] Add failing Rust tests for registry/start-profile parity.

### Core Features

- [x] Add TypeScript OMP adapter and exports/registration.
- [x] Add OMP runtime profile and labels/type filters.
- [x] Implement structured `--arg` propagation and deterministic Tmux quoting.
- [x] Add Rust OMP adapter, registry registration, and start profile.

### Integration and Polish

- [x] Update tests for CLI, console action forwarding, daemon wire arguments, and Rust runtime behavior.
- [x] Update README/CHANGELOG and implementation/testing records.
- [x] Run targeted tests, environment smoke tests, full relevant checks, review, commit, push, and open PR.

## Dependencies

- OMP executable is installed for environment smoke testing; CI uses fixtures.
- Rust daemon must be rebuilt before daemon smoke testing.
- Existing Pi parser behavior must remain green.

## Risks and Mitigations

- Bun command ambiguity: require OMP CLI path/package marker, not basename `bun` alone.
- Alias availability: model aliases as executable plus argv, never shell-evaluate aliases.
- TS/Rust drift: add matching fixtures and parity assertions in both test suites.
- Existing flaky Pi live-discovery test: record separately; do not widen OMP scope to fix it.

- Queue update 2: production implementation and focused regression fixes complete; broad verification and PR remain.
- Current queue: Foundation `done`; Core Features `done`; Integration `in-progress`.
- Baseline: preflight lint/build passed; baseline full tests had one existing Pi live-discovery failure.
- Queue update 3: targeted/full verification, formatting, lint, and OMP smoke checks complete; commit and PR submission are the remaining actions.
- Queue update 4: commit `f95df21` pushed; PR #422 opened against `codeaholicguy/ai-devkit:main`.

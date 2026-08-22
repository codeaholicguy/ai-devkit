---
phase: planning
title: Capacity Command Simplification Plan
description: Completed plan for a fresh Codex-only capacity command
---

# Capacity Command Simplification Plan

## Completed Tasks

- [x] Remove cache implementation, cache tests, cache calls, `--max-age`, and `--refresh`.
- [x] Remove Claude, Pi, GLM, unsupported-provider adapters, and their tests.
- [x] Replace generic provider detection and multi-provider orchestration with one fresh Codex report function.
- [x] Move Codex probing, normalization, types, and report construction to `@ai-devkit/agent-manager` using `src/capacity/` and `src/__tests__/capacity/` conventions.
- [x] Export the capacity API and types from agent-manager's root entry point.
- [x] Reduce CLI integration to registration, Codex argument validation, one agent-manager call, and rendering.
- [x] Relocate behavioral tests to the owning workspace and remove tests whose only behavior was deleted.
- [x] Update CLI README and all 2026-08-09 lifecycle documents.

## Order and Dependencies

1. Preserve the normalized contract while moving it and the Codex probe.
2. Add the agent-manager report boundary and tests.
3. Switch the CLI to that boundary.
4. Delete superseded provider/cache/orchestration modules and tests.
5. Update lifecycle records, then run build and test validation.

## Risk Controls

- Root agent-manager exports preserve one supported import path.
- Probe exceptions become fixed normalized failures; raw provider details remain redacted.
- Existing mocked PAT/OAuth/app-server tests move with the domain code.
- Commander tests prove non-Codex rejection and the absence of cache-option forwarding.
- Full workspace build/tests catch package-boundary and declaration-generation errors.

## Deferred Scope

Future providers should be added only with a verified, read-only capacity mechanism and a concrete product requirement. Do not restore generic provider scaffolding or caching speculatively.

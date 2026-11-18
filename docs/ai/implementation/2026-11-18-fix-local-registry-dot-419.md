---
phase: implementation
title: #419 implementation note
---

# Implementation — #419

Production fix lives on `main` in commit `5e0b67d` (PR #420): `packages/cli/src/services/skill/registry/skill-registry-source.ts` — filesystem-based local detection, `GIT_SOURCE_RE`, and `isPathShorthand` extended for `.`, `..`, and `~`.

This branch adds only `e2e/cli.e2e.ts` coverage for the original repro (`skill add-registry jarvis/skills .`) so the regression is guarded at CLI integration depth.
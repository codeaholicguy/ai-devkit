---
phase: planning
title: Plan — release smoke CI
description: Tasks to wire release smoke before npm publish
---

# Planning — release smoke CI

## Tasks

- [x] Read `scripts/release-smoke.sh` and publish workflows; identify pack/registry needs.
- [x] Add `scripts/release-smoke-pack-registry.sh` and minimal `AI_DEVKIT_SMOKE_REGISTRY` support in smoke script.
- [x] Add reusable `.github/workflows/release-smoke-gate.yml` and PR/dispatch `release-smoke.yml`.
- [x] Wire `needs: release-smoke` into `publish-cli.yml`, `publish-daemon-client.yml`, `publish-devkitd.yml`.
- [x] Validate `release-smoke.sh` against `ai-devkit@latest` on npm (pass).
- [ ] Validate pack script locally — blocked: VM has no `musl-tools` / musl gcc (CI installs via apt).
- [x] Run `npm run lint`.
- [x] Commit docs and implementation.
- [ ] Open PR with test plan, risks, skills used, and tooling friction.

## Validation evidence

- `actionlint` not installed in VM (skipped).
- CI path: `.github/workflows/release-smoke.yml` on this PR.

## Risks

- Three publish workflows each invoke the gate separately on `release: created` (up to three full smoke runs per release).
- Smoke does not execute on macOS-built `devkitd` binaries.
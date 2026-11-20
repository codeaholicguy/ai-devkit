---
phase: testing
title: Testing — release smoke CI
description: Scenarios for workflow wiring and smoke script behavior
---

# Testing — release smoke CI

## Scenarios

- [ ] **Pack registry**: after `npm run build`, `scripts/release-smoke-pack-registry.sh` publishes workspace packages to loopback Verdaccio and prints `ai-devkit@<version>` (CI only in this PR).
- [ ] **Smoke against local registry**: `AI_DEVKIT_SMOKE_REGISTRY=http://127.0.0.1:4873 ./scripts/release-smoke.sh ai-devkit@<version>` exits 0 (CI only in this PR).
- [x] **Smoke against public registry**: `./scripts/release-smoke.sh ai-devkit@latest` exits 0 (local run).
- [x] **Workflow wiring**: publish workflows reference `release-smoke-gate` with `needs` before publish steps.
- [x] **PR dry run**: path filter includes `release-smoke.yml` and smoke scripts.
- [x] **Regression**: `npm run lint` succeeds.

## Fixtures

- Ubuntu runner with tmux, musl-tools, Rust musl target (mirrors gate workflow).
- Built `packages/cli/dist` and dependency `dist/` outputs from `npm run build`.

## Mocks

- Verdaccio process on port 4873 (disposable, no persistence).
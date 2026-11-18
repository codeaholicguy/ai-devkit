---
phase: implementation
title: Implementation — release smoke CI
description: Files changed to gate npm publish on release smoke
---

# Implementation — release smoke CI

## Changes

| Area | File | Notes |
|------|------|-------|
| Pack + local registry | `scripts/release-smoke-pack-registry.sh` | Build linux-x64 musl `devkitd`, stage daemon-client pins, Verdaccio publish order |
| Smoke script | `scripts/release-smoke.sh` | `AI_DEVKIT_SMOKE_REGISTRY` → `npm_config_registry` |
| Reusable gate | `.github/workflows/release-smoke-gate.yml` | tmux, musl, Rust, build, pack, smoke |
| PR/dispatch | `.github/workflows/release-smoke.yml` | Path-filtered dry run |
| Publish block | `publish-cli.yml`, `publish-daemon-client.yml`, `publish-devkitd.yml` | `release-smoke` job + `needs` |

## Publish package order (local registry)

1. `@ai-devkit/memory`
2. `@ai-devkit/agent-manager`
3. `@ai-devkit/channel-connector`
4. `@ai-devkit/pi-session-tracker`
5. `@ai-devkit/devkitd-linux-x64` (staged binary)
6. `@ai-devkit/daemon-client` (staged optionalDependencies)
7. `ai-devkit` CLI

## Local validation limits

VM lacks `musl-tools`, so `release-smoke-pack-registry.sh` could not be exercised end-to-end locally. Gate workflow installs `musl-tools` on Ubuntu runners (same as `publish-devkitd.yml`).
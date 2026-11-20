---
phase: requirements
title: Gate npm releases with release-smoke
description: Require scripts/release-smoke.sh to pass against packed release artifacts before publish workflows upload to npm
---

# Requirements — release smoke CI gate

## Problem Statement

Release workflows publish multiple npm packages and platform-specific `devkitd` binaries as soon as a GitHub Release is created. There is no automated check that a fresh `npm install ai-devkit@<version>` works end to end before those artifacts are public.

Recent releases shipped real breakage:

- **0.62.0** (yanked): the CLI imported symbols from `@ai-devkit/agent-manager` 0.33.0 while pinning 0.32.0, breaking fresh installs.
- **0.76.0**: the published `devkitd` platform packages did not include a daemon rebuild; users needed **0.76.1** the same day.

`scripts/release-smoke.sh` already exercises install, init, lint, memory, agent/daemon flows, and upgrade paths, but it is not wired into publish CI.

## Goals

- Run `scripts/release-smoke.sh` in CI after monorepo build/pack and **before** `npm publish` in the primary publish workflows.
- Fail the workflow (blocking publish) when smoke fails.
- Exercise the **same versions** being released by installing from packed tarballs via a disposable local npm registry, including a **linux-x64 musl `devkitd` binary** built like `publish-devkitd.yml`.
- Provide a **dry-run path** on pull requests and `workflow_dispatch` without creating a release or publishing to npm.

## Non-goals

- Replacing unit, integration, or e2e tests.
- Running full smoke on every macOS/windows matrix leg of `publish-devkitd.yml` (linux-x64 musl is the runner-native binary smoke uses).
- Publishing or tagging real releases from automation in this change.

## Success criteria

- [ ] `publish-cli.yml`, `publish-daemon-client.yml`, and `publish-devkitd.yml` call a shared smoke gate job that runs before publish steps.
- [ ] Smoke installs `ai-devkit@<workspace version>` from a local registry populated with built workspace packages and staged `devkitd-linux-x64`.
- [ ] Pull requests that touch publish workflows or smoke scripts can run `.github/workflows/release-smoke.yml`.
- [ ] Documented platform coverage gap for darwin/arm publish legs.

## Constraints

- Follow existing workflow conventions: Node 24, `actions/checkout@v4`, `actions/setup-node@v4`, `npm ci`, `npm run build`.
- Do not change publish order across unrelated workflows beyond adding `needs: release-smoke`.
- Keep script changes minimal; only what CI requires (local registry support).
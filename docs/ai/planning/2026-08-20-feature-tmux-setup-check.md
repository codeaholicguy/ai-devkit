---
phase: planning
title: Tmux Setup Prerequisite Plan
description: Ordered implementation and validation tasks
---

# Tmux Setup Prerequisite Plan

- [x] Define mock-only tests for inspection, parsing, platform mapping, and guidance.
- [x] Implement the injected check-only module.
- [x] Add setup host-prerequisites output with warning-and-continue behavior.
- [x] Add the shared hint to the agent-start guard.
- [x] Update product docs, lifecycle docs, and changelog.
- [x] Run clean install, build, full tests, lint, typecheck/compile, feature lint, and coverage.
- [ ] Review, commit, rebase, push, and open the PR.

Tests precede production behavior. Setup and guard integrations depend on the shared resolver. Fixed recipes prevent hostile os-release interpolation; no external service or real package-manager invocation is used.

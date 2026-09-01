---
phase: implementation
title: Tmux Setup Prerequisite Implementation
description: Shipped code structure, behavior, and edge cases
---

# Tmux Setup Prerequisite Implementation

- `packages/cli/src/util/tmux.ts`: injected inspection, os-release parsing, fixed recipes, and read-only defaults.
- `packages/cli/src/commands/setup.ts`: one prerequisite check and separate output block before agent setup.
- `packages/cli/src/commands/agent.ts`: shared guidance for `TmuxUnavailableError`.
- CLI tests: mock-only state, mapping, setup continuation, and runtime-copy coverage.
- Product docs and changelog: prerequisite, provisional version floor, and shipped behavior.

`ENOENT` maps to missing; other failures produce a non-fatal diagnostic. No package manager runs, no shell is invoked, and parsed host data cannot enter executable arguments. The implementation follows all five approved decisions without flags, prompts, version rejection, init/install changes, or agent-table rows.

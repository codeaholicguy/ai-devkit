---
phase: testing
title: Agent Registry Wrapper Transfer Testing
description: Regression and integration evidence for wrapper-to-child registry transfers
---

# Agent Registry Wrapper Transfer Testing

## Regression Cases

- [x] A live wrapper name transfers to a newly detected child PID.
- [x] A live wrapper name replaces an existing child fallback row.
- [x] Managed tmux metadata and original start time survive transfer.
- [x] Incoming child session ID and file path replace stale wrapper metadata.
- [x] Duplicate names introduced within one batch remain constraint failures and roll back.
- [x] Removing the production change restores both regression failures, including the SQLite uniqueness error.

## Validation

- [x] Focused registry suite: 30 passed.
- [x] Full agent-manager coverage suite with process access: 513 passed; 89.03% statements, 77.95% branches, 95.94% functions, and 92.3% lines overall.
- [x] `AgentRegistry.ts` coverage: 98.63% statements and 92.15% branches.
- [x] CLI agent service and command tests: 104 passed.
- [x] Agent-manager typecheck and lint passed.
- [x] Monorepo build passed for all six projects.
- [x] Built local `agent list --json` completed against the previously failing local registry.
- [x] Base and feature docs lint passed.

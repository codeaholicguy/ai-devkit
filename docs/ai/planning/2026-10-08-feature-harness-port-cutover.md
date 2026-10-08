---
phase: planning
title: harness-port-cutover plan
description: Task list for I12 — reconciled post-implementation
---

# I12: cutover — plan

- [x] Audit `AgentManager` consumers for daemon coverage:
      `commands/agent.ts` (already wired), console (via the same
      manager), `channel-runner.ts` (was bare — wired
      `fetchEnrichedAgents`)
- [x] Verify `agent list` parity daemon vs local on live machine —
      same type set, daemon path ~600x faster per call once warm
- [x] Collect metrics: per-adapter LOC TS↔Rust, fixture counts,
      parity defects found, daemon RSS/CPU, latency table
- [x] Publish the efficiency report in the implementation doc
- [x] Full verification: workspace tests + clippy, agent-manager +
      cli + daemon-client builds/tests, daemon smoke
